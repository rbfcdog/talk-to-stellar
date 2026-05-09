import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server';
import type {
  AuthenticationResponseJSON,
  AuthenticatorTransportFuture,
  RegistrationResponseJSON,
  WebAuthnCredential,
} from '@simplewebauthn/server';
import { Keypair } from '@stellar/stellar-sdk';
import { supabase } from '../config/supabase';
import { AgentRepository } from '../repositories/agent.repository';
import { WalletRepository } from '../repositories/wallet.repository';
import { StellarService } from '../api/services/stellar.service';
import { AuthService } from '../api/services/auth.service';

const agentRepo = new AgentRepository(supabase);
const walletRepo = new WalletRepository(supabase);

function getJwtSecret() {
  return process.env.JWT_SECRET || 'dev-secret-change-me';
}

function getRpID() {
  return process.env.PASSKEY_RP_ID || process.env.WEBAUTHN_RP_ID || 'localhost';
}

function getRpName() {
  return process.env.PASSKEY_RP_NAME || 'TalkToStellar';
}

function getExpectedOrigin() {
  return process.env.PASSKEY_ORIGIN || process.env.FRONTEND_URL || process.env.NEXT_PUBLIC_FRONTEND_URL || 'http://localhost:3000';
}

function toBase64Url(value: Uint8Array | string) {
  return typeof value === 'string'
    ? value
    : Buffer.from(value).toString('base64url');
}

function fromBase64Url(value: string) {
  return new Uint8Array(Buffer.from(value, 'base64url'));
}

function isValidStellarPublicKey(value?: string) {
  if (!value) return false;
  try {
    Keypair.fromPublicKey(value.trim());
    return true;
  } catch {
    return false;
  }
}

function hashBase64Url(value: string) {
  return crypto.createHash('sha256').update(value).digest('base64url');
}

type StoredPasskey = {
  id: string;
  user_id: string;
  credential_id: string;
  public_key: string;
  counter: number;
  transports?: AuthenticatorTransportFuture[];
  device_type?: string;
  backed_up?: boolean;
};

type ChallengeRow = {
  id: string;
  user_id: string;
  type: string;
  challenge: string;
  payload: any;
  expires_at: string;
  used_at?: string | null;
};

function toWebAuthnCredential(passkey: StoredPasskey): WebAuthnCredential {
  return {
    id: passkey.credential_id,
    publicKey: fromBase64Url(passkey.public_key),
    counter: Number(passkey.counter || 0),
    transports: passkey.transports || undefined,
  };
}

export class PasskeyService {
  static async getUserPasskeys(userId: string): Promise<StoredPasskey[]> {
    const { data, error } = await supabase
      .from('user_passkeys')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: true });

    if (error) {
      throw new Error(`Failed to load passkeys: ${error.message}`);
    }

    return (data || []) as StoredPasskey[];
  }

  private static async storeChallenge(userId: string, type: string, challenge: string, payload: any) {
    const { data, error } = await supabase
      .from('passkey_challenges')
      .insert({
        user_id: userId,
        type,
        challenge,
        payload,
        expires_at: new Date(Date.now() + 5 * 60_000).toISOString(),
      })
      .select('*')
      .single();

    if (error) {
      throw new Error(`Failed to store passkey challenge: ${error.message}`);
    }

    return data as ChallengeRow;
  }

  private static async getChallenge(id: string, type: string): Promise<ChallengeRow> {
    const { data, error } = await supabase
      .from('passkey_challenges')
      .select('*')
      .eq('id', id)
      .eq('type', type)
      .single();

    if (error || !data) {
      throw new Error('Passkey challenge not found');
    }

    const challenge = data as ChallengeRow;
    if (challenge.used_at) {
      throw new Error('Passkey challenge already used');
    }
    if (new Date(challenge.expires_at).getTime() < Date.now()) {
      throw new Error('Passkey challenge expired');
    }

    return challenge;
  }

  private static async markChallengeUsed(id: string) {
    await supabase
      .from('passkey_challenges')
      .update({ used_at: new Date().toISOString() })
      .eq('id', id);
  }

  static async getUserIdFromExternalPaymentToken(token: string): Promise<string> {
    const payload = jwt.verify(token, getJwtSecret()) as any;
    if (String(payload?.sub || '') !== 'external_payment_confirm') {
      throw new Error('token is not a payment confirmation token');
    }

    const session = await agentRepo.getSession(String(payload.session_id));
    if (!session?.user_id) {
      throw new Error('session not found for passkey authorization');
    }

    return String(session.user_id);
  }

  static async generateRegistration(userId: string) {
    const passkeys = await this.getUserPasskeys(userId);
    const challenge = crypto.randomBytes(32).toString('base64url');
    const challengeRow = await this.storeChallenge(userId, 'registration', challenge, { userId });
    const options = await generateRegistrationOptions({
      rpName: getRpName(),
      rpID: getRpID(),
      userName: userId,
      userID: new Uint8Array(Buffer.from(userId)),
      userDisplayName: userId,
      challenge,
      attestationType: 'none',
      authenticatorSelection: {
        residentKey: 'preferred',
        userVerification: 'required',
      },
      excludeCredentials: passkeys.map((passkey) => ({
        id: passkey.credential_id,
        transports: passkey.transports,
      })),
    });

    return { options, challengeId: challengeRow.id };
  }

  static async generateLoginAuthentication(userId: string) {
    const passkeys = await this.getUserPasskeys(userId);
    if (passkeys.length === 0) {
      return {
        registrationRequired: true,
        userId,
      };
    }

    const challengePayload = {
      sub: 'passkey_login',
      userId,
      nonce: crypto.randomUUID(),
      expiresAt: Date.now() + 5 * 60_000,
    };
    const challenge = hashBase64Url(JSON.stringify(challengePayload));
    const challengeRow = await this.storeChallenge(userId, 'authentication', challenge, challengePayload);
    const options = await generateAuthenticationOptions({
      rpID: getRpID(),
      challenge,
      allowCredentials: passkeys.map((passkey) => ({
        id: passkey.credential_id,
        transports: passkey.transports,
      })),
      userVerification: 'required',
    });

    return {
      registrationRequired: false,
      options,
      challengeId: challengeRow.id,
      userId,
    };
  }

  static async verifyRegistration(userId: string, challengeId: string, response: RegistrationResponseJSON) {
    const challenge = await this.getChallenge(challengeId, 'registration');
    if (challenge.user_id !== userId) {
      throw new Error('Passkey challenge user mismatch');
    }

    const verification = await verifyRegistrationResponse({
      response,
      expectedChallenge: challenge.challenge,
      expectedOrigin: getExpectedOrigin(),
      expectedRPID: getRpID(),
      requireUserVerification: true,
    });

    if (!verification.verified || !verification.registrationInfo) {
      throw new Error('Passkey registration failed');
    }

    const credential = verification.registrationInfo.credential;
    const { error } = await supabase
      .from('user_passkeys')
      .upsert({
        user_id: userId,
        credential_id: credential.id,
        public_key: toBase64Url(credential.publicKey),
        counter: credential.counter,
        transports: credential.transports || [],
        device_type: verification.registrationInfo.credentialDeviceType,
        backed_up: verification.registrationInfo.credentialBackedUp,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'credential_id' });

    if (error) {
      throw new Error(`Failed to save passkey: ${error.message}`);
    }

    await this.markChallengeUsed(challenge.id);
    return { verified: true };
  }

  static async verifyLoginAuthentication(userId: string, challengeId: string, response: AuthenticationResponseJSON) {
    const challenge = await this.getChallenge(challengeId, 'authentication');
    if (challenge.user_id !== userId) {
      throw new Error('Passkey challenge user mismatch');
    }

    const passkey = (await this.getUserPasskeys(userId))
      .find((credential) => credential.credential_id === response.id);

    if (!passkey) {
      throw new Error('Passkey credential is not registered for this user');
    }

    const verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: challenge.challenge,
      expectedOrigin: getExpectedOrigin(),
      expectedRPID: getRpID(),
      credential: toWebAuthnCredential(passkey),
      requireUserVerification: true,
    });

    if (!verification.verified) {
      throw new Error('Passkey verification failed');
    }

    await supabase
      .from('user_passkeys')
      .update({
        counter: verification.authenticationInfo.newCounter,
        updated_at: new Date().toISOString(),
      })
      .eq('credential_id', verification.authenticationInfo.credentialID);
    await this.markChallengeUsed(challenge.id);

    return {
      verified: true,
      sessionToken: AuthService.generateTokenForUser(userId),
    };
  }

  static async buildTransactionContext(input: { token: string; publicKey?: string }) {
    const payload = jwt.verify(input.token, getJwtSecret()) as any;
    if (String(payload?.sub || '') !== 'external_payment_confirm') {
      throw new Error('token is not a payment confirmation token');
    }

    const { amount, destination, destination_name, destination_contact, session_id } = payload;
    if (!amount || !destination || !session_id) {
      throw new Error('token missing payment data');
    }

    const wallet = await walletRepo.getWalletBySession(String(session_id));
    if (!wallet?.public_key) {
      throw new Error('wallet not found for payment confirmation');
    }

    const session = await agentRepo.getSession(String(session_id));
    if (!session?.user_id) {
      throw new Error('session not found for payment confirmation');
    }

    const contactFromToken = destination_contact && typeof destination_contact === 'object'
      ? destination_contact
      : undefined;

    let resolvedDestination = String(
      input.publicKey ||
      contactFromToken?.stellar_public_key ||
      contactFromToken?.public_key ||
      destination ||
      ''
    ).trim();

    if (!isValidStellarPublicKey(resolvedDestination)) {
      throw new Error('destination must be a valid Stellar public key');
    }

    const unsignedXdr = await StellarService.buildPaymentXdr({
      sourcePublicKey: wallet.public_key,
      destination: resolvedDestination,
      amount: String(amount),
      assetCode: 'XLM',
      memoText: `Pagamento para ${destination_contact?.contact_name || destination_name || destination}`,
    });

    const xdrHash = hashBase64Url(unsignedXdr);
    const tokenHash = hashBase64Url(input.token);

    return {
      userId: String(session.user_id),
      sessionId: String(session_id),
      sourcePublicKey: wallet.public_key,
      destination: resolvedDestination,
      amount: String(amount),
      assetCode: 'XLM',
      xdrHash,
      tokenHash,
      unsignedXdr,
    };
  }

  static async generateTransactionAuthentication(input: { token: string; publicKey?: string }) {
    const transaction = await this.buildTransactionContext(input);
    const passkeys = await this.getUserPasskeys(transaction.userId);

    if (passkeys.length === 0) {
      return {
        registrationRequired: true,
        userId: transaction.userId,
        transaction,
      };
    }

    const challengePayload = {
      sub: 'stellar_transaction_authorization',
      ...transaction,
      unsignedXdr: undefined,
      nonce: crypto.randomUUID(),
      expiresAt: Date.now() + 5 * 60_000,
    };
    const challenge = hashBase64Url(JSON.stringify(challengePayload));
    const challengeRow = await this.storeChallenge(transaction.userId, 'transaction', challenge, challengePayload);
    const options = await generateAuthenticationOptions({
      rpID: getRpID(),
      challenge,
      allowCredentials: passkeys.map((passkey) => ({
        id: passkey.credential_id,
        transports: passkey.transports,
      })),
      userVerification: 'required',
    });

    return {
      registrationRequired: false,
      options,
      challengeId: challengeRow.id,
      transaction,
    };
  }

  static async verifyTransactionAuthorization(input: {
    token: string;
    publicKey?: string;
    challengeId: string;
    response: AuthenticationResponseJSON;
  }) {
    const freshTransaction = await this.buildTransactionContext({
      token: input.token,
      publicKey: input.publicKey,
    });
    const challenge = await this.getChallenge(input.challengeId, 'transaction');

    if (challenge.user_id !== freshTransaction.userId) {
      throw new Error('Passkey challenge user mismatch');
    }

    const payload = challenge.payload || {};
    const expectedFields = ['userId', 'sessionId', 'sourcePublicKey', 'destination', 'amount', 'assetCode', 'xdrHash', 'tokenHash'];
    for (const field of expectedFields) {
      if (String(payload[field] || '') !== String((freshTransaction as any)[field] || '')) {
        throw new Error(`Passkey transaction challenge mismatch: ${field}`);
      }
    }

    const passkey = (await this.getUserPasskeys(freshTransaction.userId))
      .find((credential) => credential.credential_id === input.response.id);

    if (!passkey) {
      throw new Error('Passkey credential is not registered for this user');
    }

    const verification = await verifyAuthenticationResponse({
      response: input.response,
      expectedChallenge: challenge.challenge,
      expectedOrigin: getExpectedOrigin(),
      expectedRPID: getRpID(),
      credential: toWebAuthnCredential(passkey),
      requireUserVerification: true,
    });

    if (!verification.verified) {
      throw new Error('Passkey verification failed');
    }

    await supabase
      .from('user_passkeys')
      .update({
        counter: verification.authenticationInfo.newCounter,
        updated_at: new Date().toISOString(),
      })
      .eq('credential_id', verification.authenticationInfo.credentialID);
    await this.markChallengeUsed(challenge.id);

    return { verified: true, transaction: freshTransaction };
  }
}

export default PasskeyService;
