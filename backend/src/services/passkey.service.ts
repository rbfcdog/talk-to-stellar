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
  UserVerificationRequirement,
  WebAuthnCredential,
} from '@simplewebauthn/server';
import { Keypair } from '@stellar/stellar-sdk';
import { supabase } from '../config/supabase';
import { AgentRepository } from '../repositories/agent.repository';
import { WalletRepository } from '../repositories/wallet.repository';
import { StellarService } from '../api/services/stellar.service';
import { AuthService } from '../api/services/auth.service';
import { isSessionExpired } from '../utils/session-expiry';

const agentRepo = new AgentRepository(supabase);
const walletRepo = new WalletRepository(supabase);

function getJwtSecret() {
  return process.env.JWT_SECRET || 'dev-secret-change-me';
}

function getRpID() {
  const explicitRpId = process.env.PASSKEY_RP_ID || process.env.WEBAUTHN_RP_ID;
  if (explicitRpId) return explicitRpId;

  const origin = process.env.PASSKEY_ORIGIN || process.env.FRONTEND_URL || process.env.NEXT_PUBLIC_FRONTEND_URL;
  if (origin) {
    try {
      return new URL(origin).hostname;
    } catch {
      // fall through to local development default
    }
  }

  return 'localhost';
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

function generateChallengeBytes() {
  const bytes = crypto.randomBytes(32);
  return new Uint8Array(bytes);
}

function expectedChallengeMatches(storedChallenge: string) {
  const legacyStringChallenge = Buffer.from(storedChallenge, 'utf8').toString('base64url');

  return (responseChallenge: string) => (
    responseChallenge === storedChallenge ||
    responseChallenge === legacyStringChallenge
  );
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

function hashSecret(value: string) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function timingSafeEqualString(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(String(left || ''));
  const rightBuffer = Buffer.from(String(right || ''));
  if (leftBuffer.length !== rightBuffer.length) return false;
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function normalizeIdentity(value: unknown): string {
  return String(value || '').trim().toLowerCase();
}

function passkeyAuthorizationError(message: string, statusCode = 401): Error {
  const error = new Error(message) as Error & { statusCode?: number };
  error.statusCode = statusCode;
  return error;
}

function getPasskeyChallengeTtlMs() {
  const parsedSeconds = Number(String(process.env.PASSKEY_CHALLENGE_TTL_SECONDS || '900').trim());
  if (!Number.isFinite(parsedSeconds) || parsedSeconds <= 0) return 15 * 60_000;
  return Math.trunc(parsedSeconds * 1000);
}

function getPasskeyOperationTimeoutMs() {
  const parsedMs = Number(String(process.env.PASSKEY_OPERATION_TIMEOUT_MS || '180000').trim());
  if (!Number.isFinite(parsedMs) || parsedMs < 30_000) return 180_000;
  return Math.trunc(parsedMs);
}

function getPasskeyUserVerification(): UserVerificationRequirement {
  return String(process.env.PASSKEY_USER_VERIFICATION || 'preferred').trim().toLowerCase() === 'required'
    ? 'required'
    : 'preferred';
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

export type PasskeyRegistrationAuthorization = {
  userId: string;
  sessionId: string;
  sessionTokenHash: string;
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

  static async resolveLoginUserId(identifier: string): Promise<string> {
    const normalized = String(identifier || '').trim().toLowerCase();
    if (!normalized) {
      throw new Error('email or user_id is required');
    }

    const { data, error } = await supabase
      .from('agent_sessions')
      .select('user_id, email, updated_at, created_at')
      .or(`email.eq.${normalized},user_id.eq.${normalized}`)
      .order('updated_at', { ascending: false })
      .limit(1);

    if (error) {
      throw new Error(`Failed to resolve login user: ${error.message}`);
    }

    const userId = String(data?.[0]?.user_id || normalized).trim();
    if (!userId) {
      throw new Error('Account not found');
    }

    return userId;
  }

  static async getLatestSessionForUser(userId: string): Promise<{ sessionId?: string; sessionToken?: string }> {
    const normalizedUserId = String(userId || '').trim();
    if (!normalizedUserId) return {};

    const { data, error } = await supabase
      .from('agent_sessions')
      .select('session_id, session_token, updated_at, created_at')
      .eq('user_id', normalizedUserId)
      .order('updated_at', { ascending: false })
      .limit(1);

    if (error) {
      throw new Error(`Failed to resolve user session: ${error.message}`);
    }

    return {
      sessionId: data?.[0]?.session_id ? String(data[0].session_id) : undefined,
      sessionToken: data?.[0]?.session_token ? String(data[0].session_token) : undefined,
    };
  }

  private static async storeChallenge(userId: string, type: string, challenge: string, payload: any) {
    const ttlMs = getPasskeyChallengeTtlMs();
    const { data, error } = await supabase
      .from('passkey_challenges')
      .insert({
        user_id: userId,
        type,
        challenge,
        payload,
        expires_at: new Date(Date.now() + ttlMs).toISOString(),
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

  static async authorizeRegistration(input: {
    userId?: string;
    email?: string;
    sessionId?: string;
    sessionToken?: string;
  }): Promise<PasskeyRegistrationAuthorization> {
    const sessionId = String(input.sessionId || '').trim();
    const sessionToken = String(input.sessionToken || '').trim();
    if (!sessionId || !sessionToken) {
      throw passkeyAuthorizationError('Valid session_id and session_token are required to register a passkey.');
    }

    const session = await agentRepo.getSession(sessionId);
    if (!session || isSessionExpired(session)) {
      throw passkeyAuthorizationError('Session is invalid or expired. Sign in again before registering a passkey.');
    }

    const storedSessionToken = String((session as any).session_token || '').trim();
    if (!storedSessionToken || !timingSafeEqualString(storedSessionToken, sessionToken)) {
      throw passkeyAuthorizationError('Session is invalid or expired. Sign in again before registering a passkey.');
    }

    const sessionUserId = normalizeIdentity((session as any).user_id);
    const sessionEmail = normalizeIdentity((session as any).email);
    const requestedUserId = normalizeIdentity(input.userId);
    const requestedEmail = normalizeIdentity(input.email);
    const requestedIdentity = requestedUserId || requestedEmail;
    if (requestedIdentity && requestedIdentity !== sessionUserId && requestedIdentity !== sessionEmail) {
      throw passkeyAuthorizationError('Passkey registration is not authorized for this account.', 403);
    }

    const resolvedUserId = String((session as any).user_id || (session as any).email || '').trim();
    if (!resolvedUserId) {
      throw passkeyAuthorizationError('Session does not have a user identity for passkey registration.', 409);
    }

    return {
      userId: resolvedUserId,
      sessionId,
      sessionTokenHash: hashSecret(sessionToken),
    };
  }

  static async generateRegistration(authorization: PasskeyRegistrationAuthorization) {
    const userId = authorization.userId;
    const passkeys = await this.getUserPasskeys(userId);
    const challenge = generateChallengeBytes();
    const options = await generateRegistrationOptions({
      rpName: getRpName(),
      rpID: getRpID(),
      userName: userId,
      userID: new Uint8Array(Buffer.from(userId)),
      userDisplayName: userId,
      challenge,
      timeout: getPasskeyOperationTimeoutMs(),
      attestationType: 'none',
      authenticatorSelection: {
        residentKey: 'preferred',
        requireResidentKey: false,
        userVerification: getPasskeyUserVerification(),
      },
      excludeCredentials: passkeys.map((passkey) => ({
        id: passkey.credential_id,
        transports: passkey.transports,
      })),
    });
    const challengeRow = await this.storeChallenge(userId, 'registration', options.challenge, {
      userId,
      authorization: {
        method: 'session',
        sessionId: authorization.sessionId,
        sessionTokenHash: authorization.sessionTokenHash,
      },
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
      expiresAt: Date.now() + getPasskeyChallengeTtlMs(),
    };
    const challenge = hashBase64Url(JSON.stringify(challengePayload));
    const options = await generateAuthenticationOptions({
      rpID: getRpID(),
      challenge: fromBase64Url(challenge),
      timeout: getPasskeyOperationTimeoutMs(),
      allowCredentials: passkeys.map((passkey) => ({
        id: passkey.credential_id,
        transports: passkey.transports,
      })),
      userVerification: getPasskeyUserVerification(),
    });
    const challengeRow = await this.storeChallenge(userId, 'authentication', options.challenge, challengePayload);

    return {
      registrationRequired: false,
      options,
      challengeId: challengeRow.id,
      userId,
    };
  }

  static async verifyRegistration(authorization: PasskeyRegistrationAuthorization, challengeId: string, response: RegistrationResponseJSON) {
    const userId = authorization.userId;
    const challenge = await this.getChallenge(challengeId, 'registration');
    if (challenge.user_id !== userId) {
      throw new Error('Passkey challenge user mismatch');
    }
    const challengeAuthorization = challenge.payload?.authorization || {};
    if (
      challengeAuthorization.method !== 'session' ||
      String(challengeAuthorization.sessionId || '') !== authorization.sessionId ||
      String(challengeAuthorization.sessionTokenHash || '') !== authorization.sessionTokenHash
    ) {
      throw passkeyAuthorizationError('Passkey registration challenge is not authorized for this session.', 403);
    }

    const verification = await verifyRegistrationResponse({
      response,
      expectedChallenge: expectedChallengeMatches(challenge.challenge),
      expectedOrigin: getExpectedOrigin(),
      expectedRPID: getRpID(),
      requireUserVerification: getPasskeyUserVerification() === 'required',
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
      expectedChallenge: expectedChallengeMatches(challenge.challenge),
      expectedOrigin: getExpectedOrigin(),
      expectedRPID: getRpID(),
      credential: toWebAuthnCredential(passkey),
      requireUserVerification: getPasskeyUserVerification() === 'required',
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

    const latestSession = await this.getLatestSessionForUser(userId);
    if (latestSession.sessionId) {
      const session = await agentRepo.getSession(latestSession.sessionId);
      if (session) {
        await agentRepo.saveSession(latestSession.sessionId, session as any);
      }
    }

    return {
      verified: true,
      sessionToken: AuthService.generateTokenForUser(userId),
      ...latestSession,
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
      expiresAt: Date.now() + getPasskeyChallengeTtlMs(),
    };
    const challenge = hashBase64Url(JSON.stringify(challengePayload));
    const options = await generateAuthenticationOptions({
      rpID: getRpID(),
      challenge: fromBase64Url(challenge),
      timeout: getPasskeyOperationTimeoutMs(),
      allowCredentials: passkeys.map((passkey) => ({
        id: passkey.credential_id,
        transports: passkey.transports,
      })),
      userVerification: 'required',
    });
    const challengeRow = await this.storeChallenge(transaction.userId, 'transaction', options.challenge, challengePayload);

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
      expectedChallenge: expectedChallengeMatches(challenge.challenge),
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
