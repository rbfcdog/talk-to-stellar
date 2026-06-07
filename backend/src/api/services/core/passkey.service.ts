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
import { supabase } from '../../../config/supabase';
import { AgentRepository } from '../../repository/core/agent.repository';
import { WalletRepository } from '../../repository/core/wallet.repository';
import { StellarService } from '../stellar.service';
import { AuthService } from '../auth.service';
import { isSessionExpired } from '../../../utils/session-expiry';
import { getRequiredJwtSecret } from '../../../config/secrets';
import { hashWalletPin, verifyWalletPinAgainstAny } from '../../../utils/pin-hash';

const agentRepo = new AgentRepository(supabase);
const walletRepo = new WalletRepository(supabase);

function getJwtSecret() {
  return getRequiredJwtSecret();
}

export function getRpID() {
  const explicitRpId = process.env.PASSKEY_RP_ID || process.env.WEBAUTHN_RP_ID;
  if (explicitRpId) return explicitRpId;

  const origin = process.env.PASSKEY_ORIGIN || process.env.FRONTEND_URL || process.env.NEXT_PUBLIC_FRONTEND_URL;
  if (origin) {
    try {
      const hostname = new URL(origin).hostname.toLowerCase();
      return hostname.startsWith('www.') ? hostname.slice(4) : hostname;
    } catch {
      // fall through to local development default
    }
  }

  return 'localhost';
}

function getRpName() {
  return process.env.PASSKEY_RP_NAME || 'TalkToStellar';
}

function normalizeOrigin(value: unknown): string {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    return new URL(raw).origin;
  } catch {
    try {
      return new URL(`https://${raw}`).origin;
    } catch {
      return '';
    }
  }
}

function splitConfiguredOrigins(value: unknown): string[] {
  return String(value || '')
    .split(',')
    .map((item) => normalizeOrigin(item))
    .filter(Boolean);
}

function shouldIncludeWwwSibling(hostname: string): boolean {
  const normalized = String(hostname || '').toLowerCase();
  const apex = normalized.startsWith('www.') ? normalized.slice(4) : normalized;
  return apex === 'talktostellar.com' || String(process.env.PASSKEY_INCLUDE_WWW_ORIGIN || '').trim().toLowerCase() === 'true';
}

function withWwwSibling(origin: string): string[] {
  const normalized = normalizeOrigin(origin);
  if (!normalized) return [];

  try {
    const url = new URL(normalized);
    if (!url.hostname || url.hostname === 'localhost' || /^\d+\.\d+\.\d+\.\d+$/.test(url.hostname)) {
      return [normalized];
    }

    const hostname = url.hostname.toLowerCase();
    if (!shouldIncludeWwwSibling(hostname)) return [normalized];

    const sibling = new URL(normalized);
    sibling.hostname = hostname.startsWith('www.') ? hostname.slice(4) : `www.${hostname}`;
    return [normalized, sibling.origin];
  } catch {
    return [normalized];
  }
}

export function getExpectedOrigins() {
  const configured = [
    ...splitConfiguredOrigins(process.env.PASSKEY_ORIGINS || process.env.WEBAUTHN_ORIGINS),
    normalizeOrigin(process.env.PASSKEY_ORIGIN || process.env.FRONTEND_URL || process.env.NEXT_PUBLIC_FRONTEND_URL || 'http://localhost:3000'),
  ].filter(Boolean);

  const origins = configured.flatMap(withWwwSibling);
  return Array.from(new Set(origins));
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

async function resolveTransactionSourceWallet(sessionId: string, session?: any) {
  const normalizedSessionId = String(sessionId || '').trim();
  if (!normalizedSessionId) return null;

  const sessionWallet = await walletRepo.getWalletBySession(normalizedSessionId);
  if (sessionWallet?.public_key) return sessionWallet;

  const publicKey = String(session?.public_key || '').trim();
  if (!isValidStellarPublicKey(publicKey)) return sessionWallet || null;

  return await walletRepo.getWalletByPublicKey(publicKey).catch(() => null);
}

function hashBase64Url(value: string) {
  return crypto.createHash('sha256').update(value).digest('base64url');
}

function hashSecret(value: string) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function hashLoginPairingCode(pairId: string, code: string) {
  return hashSecret(`${String(pairId || '').trim()}:${String(code || '').trim()}`);
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

function normalizePairId(value: unknown): string {
  const normalized = String(value || '').trim();
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(normalized)) {
    throw new Error('Valid pair_id is required');
  }
  return normalized;
}

function normalizeLoginPairingCode(value: unknown): string {
  const normalized = String(value || '').replace(/\D+/g, '').slice(0, 6);
  if (!/^\d{6}$/.test(normalized)) {
    throw new Error('Valid 6-digit code is required');
  }
  return normalized;
}

function generateLoginPairingCode() {
  return String(crypto.randomInt(100000, 1000000));
}

function getPasskeyChallengeTtlMs() {
  const parsedSeconds = Number(String(process.env.PASSKEY_CHALLENGE_TTL_SECONDS || '900').trim());
  if (!Number.isFinite(parsedSeconds) || parsedSeconds <= 0) return 15 * 60_000;
  return Math.trunc(parsedSeconds * 1000);
}

function getPasskeyLoginCodeTtlMs() {
  const parsedSeconds = Number(String(process.env.PASSKEY_LOGIN_CODE_TTL_SECONDS || '300').trim());
  if (!Number.isFinite(parsedSeconds) || parsedSeconds <= 0) return 5 * 60_000;
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

function envFlag(name: string, defaultValue = false): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw === null || raw === '') return defaultValue;
  return ['1', 'true', 'yes', 'on'].includes(String(raw).trim().toLowerCase());
}

function getSmartAccountNetwork() {
  return String(
    process.env.PASSKEY_SMART_ACCOUNT_NETWORK ||
    process.env.STELLAR_NETWORK ||
    'TESTNET'
  ).trim().toLowerCase();
}

function getSmartAccountP256VerifierAddress() {
  return String(process.env.PASSKEY_SMART_ACCOUNT_P256_VERIFIER_ADDRESS || '').trim() || undefined;
}

function getSmartAccountDefaultContextRuleId(): number | undefined {
  const raw = String(process.env.PASSKEY_SMART_ACCOUNT_DEFAULT_CONTEXT_RULE_ID || '').trim();
  if (!raw) return undefined;
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : undefined;
}

type CborMapKey = number | string;
type CborValue = number | string | Uint8Array | CborValue[] | Map<CborMapKey, CborValue> | boolean | null;

function readCborLength(input: Uint8Array, offset: number, additionalInfo: number): { value: number; offset: number } {
  if (additionalInfo < 24) return { value: additionalInfo, offset };

  const requiredBytes = additionalInfo === 24 ? 1 : additionalInfo === 25 ? 2 : additionalInfo === 26 ? 4 : additionalInfo === 27 ? 8 : 0;
  if (!requiredBytes || offset + requiredBytes > input.length) {
    throw new Error('Unsupported or truncated CBOR length');
  }

  let value = 0n;
  for (let i = 0; i < requiredBytes; i += 1) {
    value = (value << 8n) + BigInt(input[offset + i]);
  }
  if (value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error('CBOR length exceeds safe integer range');
  }

  return { value: Number(value), offset: offset + requiredBytes };
}

function readCborItem(input: Uint8Array, offset = 0): { value: CborValue; offset: number } {
  const initialByte = input[offset];
  if (initialByte === undefined) {
    throw new Error('Unexpected end of CBOR data');
  }

  const majorType = initialByte >> 5;
  const additionalInfo = initialByte & 0x1f;
  const length = readCborLength(input, offset + 1, additionalInfo);

  if (majorType === 0) {
    return { value: length.value, offset: length.offset };
  }

  if (majorType === 1) {
    return { value: -1 - length.value, offset: length.offset };
  }

  if (majorType === 2) {
    const end = length.offset + length.value;
    if (end > input.length) throw new Error('Truncated CBOR byte string');
    return { value: input.slice(length.offset, end), offset: end };
  }

  if (majorType === 3) {
    const end = length.offset + length.value;
    if (end > input.length) throw new Error('Truncated CBOR text string');
    return { value: Buffer.from(input.slice(length.offset, end)).toString('utf8'), offset: end };
  }

  if (majorType === 4) {
    const items: CborValue[] = [];
    let cursor = length.offset;
    for (let i = 0; i < length.value; i += 1) {
      const item = readCborItem(input, cursor);
      items.push(item.value);
      cursor = item.offset;
    }
    return { value: items, offset: cursor };
  }

  if (majorType === 5) {
    const map = new Map<CborMapKey, CborValue>();
    let cursor = length.offset;
    for (let i = 0; i < length.value; i += 1) {
      const key = readCborItem(input, cursor);
      cursor = key.offset;
      if (typeof key.value !== 'number' && typeof key.value !== 'string') {
        throw new Error('Unsupported CBOR map key type');
      }
      const value = readCborItem(input, cursor);
      cursor = value.offset;
      map.set(key.value, value.value);
    }
    return { value: map, offset: cursor };
  }

  if (majorType === 7) {
    if (additionalInfo === 20) return { value: false, offset: offset + 1 };
    if (additionalInfo === 21) return { value: true, offset: offset + 1 };
    if (additionalInfo === 22) return { value: null, offset: offset + 1 };
  }

  throw new Error(`Unsupported CBOR major type ${majorType}`);
}

export type PasskeySmartAccountCredentialPublicKey = {
  kty: 'EC';
  crv: 'P-256';
  alg: 'ES256';
  cose_kty: 2;
  cose_alg: -7;
  cose_crv: 1;
  x: string;
  y: string;
  public_key_uncompressed: string;
  cose_public_key: string;
};

function decodeCoseP256PublicKey(publicKey: Uint8Array): PasskeySmartAccountCredentialPublicKey {
  const parsed = readCborItem(publicKey);
  if (parsed.offset !== publicKey.length) {
    throw new Error('COSE key has trailing bytes');
  }
  if (!(parsed.value instanceof Map)) {
    throw new Error('COSE key must be a CBOR map');
  }

  const kty = parsed.value.get(1);
  const alg = parsed.value.get(3);
  const crv = parsed.value.get(-1);
  const x = parsed.value.get(-2);
  const y = parsed.value.get(-3);

  if (kty !== 2 || alg !== -7 || crv !== 1) {
    throw new Error('Credential public key is not a COSE EC2 P-256 ES256 key');
  }
  if (!(x instanceof Uint8Array) || !(y instanceof Uint8Array) || x.length !== 32 || y.length !== 32) {
    throw new Error('COSE P-256 key must include 32-byte x and y coordinates');
  }

  const uncompressed = Buffer.concat([Buffer.from([0x04]), Buffer.from(x), Buffer.from(y)]);
  return {
    kty: 'EC',
    crv: 'P-256',
    alg: 'ES256',
    cose_kty: 2,
    cose_alg: -7,
    cose_crv: 1,
    x: toBase64Url(x),
    y: toBase64Url(y),
    public_key_uncompressed: uncompressed.toString('base64url'),
    cose_public_key: toBase64Url(publicKey),
  };
}

function smartAccountCredentialPublicKeyMetadata(publicKey: Uint8Array): Record<string, unknown> {
  try {
    return decodeCoseP256PublicKey(publicKey);
  } catch (error: any) {
    return {
      cose_public_key: toBase64Url(publicKey),
      parse_error: error?.message || String(error),
    };
  }
}

function buildSmartAccountPasskeyFields(credential: WebAuthnCredential): Record<string, unknown> {
  const publicKeyP256 = smartAccountCredentialPublicKeyMetadata(credential.publicKey);
  const verifierAddress = getSmartAccountP256VerifierAddress();
  const contextRuleId = getSmartAccountDefaultContextRuleId();
  const network = getSmartAccountNetwork();
  const enabled = envFlag('PASSKEY_SMART_ACCOUNT_ENABLED', false);

  return {
    credential_public_key_p256: publicKeyP256,
    smart_account_address: null,
    smart_account_signer: 'external_webauthn_p256',
    smart_account_verifier_address: verifierAddress || null,
    smart_account_network: network,
    smart_account_type: 'openzeppelin_stellar_smart_account',
    smart_account_enabled: enabled,
    smart_account_context_rule_id: contextRuleId ?? null,
    smart_account_metadata: {
      standard: 'openzeppelin-stellar-contracts/accounts',
      account_type: 'smart_account',
      signer_variant: 'External',
      signer_model: 'Signer::External(Address, Bytes)',
      verifier_address: verifierAddress || null,
      key_data_format: 'cose_ec2_p256_public_key',
      auth_payload: {
        signers: 'Map<Signer, Bytes>',
        context_rule_ids: contextRuleId === undefined ? [] : [contextRuleId],
      },
      deployment_status: 'metadata_only',
      deployment_note: 'Repository stores the WebAuthn P-256 signer metadata; Soroban smart-account deployment must be run by the contract deploy workflow.',
      network,
      enabled,
    },
  };
}

function isMissingSmartAccountColumnError(error: any): boolean {
  const message = String(error?.message || error?.details || error?.hint || '').toLowerCase();
  return message.includes('smart_account_') ||
    message.includes('credential_public_key_p256') ||
    message.includes('schema cache');
}

function smartAccountPublicResponse(fields: Record<string, unknown>) {
  const metadata = fields.smart_account_metadata as Record<string, unknown> | undefined;
  return {
    enabled: Boolean(fields.smart_account_enabled),
    network: fields.smart_account_network,
    signer: fields.smart_account_signer,
    verifierAddress: fields.smart_account_verifier_address || null,
    contextRuleId: fields.smart_account_context_rule_id || null,
    deploymentStatus: metadata?.deployment_status || 'metadata_only',
    credentialPublicKeyP256: fields.credential_public_key_p256,
  };
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
  credential_public_key_p256?: Record<string, unknown> | null;
  smart_account_address?: string | null;
  smart_account_signer?: string | null;
  smart_account_verifier_address?: string | null;
  smart_account_network?: string | null;
  smart_account_type?: string | null;
  smart_account_enabled?: boolean | null;
  smart_account_context_rule_id?: number | null;
  smart_account_metadata?: Record<string, unknown> | null;
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

type LoginPairingCodeRow = {
  id: string;
  pair_id: string;
  code_hash: string;
  user_id: string;
  email?: string | null;
  session_id: string;
  session_token_hash: string;
  expires_at: string;
  used_at?: string | null;
  created_at?: string;
  updated_at?: string;
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
  static decodeCredentialPublicKeyForSmartAccount(publicKey: Uint8Array): PasskeySmartAccountCredentialPublicKey {
    return decodeCoseP256PublicKey(publicKey);
  }

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

  static async verifyRegistrationPin(sessionId: string, pin: string) {
    const normalizedSessionId = String(sessionId || '').trim();
    const normalizedPin = String(pin || '').trim();
    if (!/^\d{4,8}$/.test(normalizedPin)) {
      throw passkeyAuthorizationError('Enter your 4 to 8 digit PIN before enabling biometrics.', 400);
    }

    const session = await agentRepo.getSession(normalizedSessionId);
    if (!session || isSessionExpired(session)) {
      throw passkeyAuthorizationError('Session is invalid or expired. Sign in again before registering a passkey.');
    }

    const verification = verifyWalletPinAgainstAny(normalizedPin, [
      (session as any).session_password_hash,
      (session as any).password_hash,
    ]);
    if (!verification.valid) {
      throw passkeyAuthorizationError('Invalid PIN.', 403);
    }

    if (verification.needsRehash) {
      const updatedHash = hashWalletPin(normalizedPin);
      await agentRepo.saveSession(normalizedSessionId, {
        ...(session as any),
        password_hash: updatedHash,
        session_password_hash: updatedHash,
      });
    }

    return { verified: true };
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
      expectedOrigin: getExpectedOrigins(),
      expectedRPID: getRpID(),
      requireUserVerification: getPasskeyUserVerification() === 'required',
    });

    if (!verification.verified || !verification.registrationInfo) {
      throw new Error('Passkey registration failed');
    }

    const credential = verification.registrationInfo.credential;
    const basePasskeyRow = {
      user_id: userId,
      credential_id: credential.id,
      public_key: toBase64Url(credential.publicKey),
      counter: credential.counter,
      transports: credential.transports || [],
      device_type: verification.registrationInfo.credentialDeviceType,
      backed_up: verification.registrationInfo.credentialBackedUp,
      updated_at: new Date().toISOString(),
    };
    const smartAccountFields = buildSmartAccountPasskeyFields(credential);
    const { error } = await supabase
      .from('user_passkeys')
      .upsert({ ...basePasskeyRow, ...smartAccountFields }, { onConflict: 'credential_id' });

    if (error) {
      if (isMissingSmartAccountColumnError(error)) {
        console.warn('[passkey] smart-account columns are not migrated yet; saving passkey without smart-account metadata');
        const retry = await supabase
          .from('user_passkeys')
          .upsert(basePasskeyRow, { onConflict: 'credential_id' });
        if (retry.error) {
          throw new Error(`Failed to save passkey: ${retry.error.message}`);
        }
      } else {
        throw new Error(`Failed to save passkey: ${error.message}`);
      }
    }

    await this.markChallengeUsed(challenge.id);
    return { verified: true, smartAccount: smartAccountPublicResponse(smartAccountFields) };
  }

  static async getSmartAccountStatus(userId: string) {
    const config = {
      standard: 'openzeppelin-stellar-contracts/accounts',
      enabled: envFlag('PASSKEY_SMART_ACCOUNT_ENABLED', false),
      network: getSmartAccountNetwork(),
      signer: 'external_webauthn_p256',
      verifierAddress: getSmartAccountP256VerifierAddress() || null,
      contextRuleId: getSmartAccountDefaultContextRuleId() ?? null,
      deploymentStatus: 'metadata_only',
    };

    const selectedColumns = [
      'credential_id',
      'created_at',
      'updated_at',
      'credential_public_key_p256',
      'smart_account_address',
      'smart_account_signer',
      'smart_account_verifier_address',
      'smart_account_network',
      'smart_account_type',
      'smart_account_enabled',
      'smart_account_context_rule_id',
      'smart_account_metadata',
    ].join(', ');

    const { data, error } = await supabase
      .from('user_passkeys')
      .select(selectedColumns)
      .eq('user_id', userId)
      .order('created_at', { ascending: true });

    if (error) {
      if (!isMissingSmartAccountColumnError(error)) {
        throw new Error(`Failed to load passkey smart accounts: ${error.message}`);
      }

      const fallback = await supabase
        .from('user_passkeys')
        .select('credential_id, created_at, updated_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: true });

      if (fallback.error) {
        throw new Error(`Failed to load passkeys: ${fallback.error.message}`);
      }

      return {
        config,
        migrated: false,
        passkeys: (fallback.data || []).map((passkey: any) => ({
          credentialId: passkey.credential_id,
          createdAt: passkey.created_at,
          updatedAt: passkey.updated_at,
          smartAccount: null,
        })),
      };
    }

    return {
      config,
      migrated: true,
      passkeys: (data || []).map((passkey: any) => ({
        credentialId: passkey.credential_id,
        createdAt: passkey.created_at,
        updatedAt: passkey.updated_at,
        smartAccount: {
          address: passkey.smart_account_address || null,
          signer: passkey.smart_account_signer || config.signer,
          verifierAddress: passkey.smart_account_verifier_address || null,
          network: passkey.smart_account_network || config.network,
          type: passkey.smart_account_type || 'openzeppelin_stellar_smart_account',
          enabled: Boolean(passkey.smart_account_enabled),
          contextRuleId: passkey.smart_account_context_rule_id ?? null,
          credentialPublicKeyP256: passkey.credential_public_key_p256 || null,
          metadata: passkey.smart_account_metadata || {},
        },
      })),
    };
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
      expectedOrigin: getExpectedOrigins(),
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

  static async createLoginPairingCode(input: {
    pairId: string;
    sessionId?: string;
    sessionToken?: string;
    userId?: string;
    email?: string;
  }) {
    const pairId = normalizePairId(input.pairId);
    const sessionId = String(input.sessionId || '').trim();
    const sessionToken = String(input.sessionToken || '').trim();
    if (!sessionId || !sessionToken) {
      throw passkeyAuthorizationError('A valid passkey session is required before generating a login code.');
    }

    const session = await agentRepo.getSession(sessionId);
    if (!session || isSessionExpired(session)) {
      throw passkeyAuthorizationError('Session is invalid or expired. Sign in with Passkey again.');
    }

    const storedSessionToken = String((session as any).session_token || '').trim();
    if (!storedSessionToken || !timingSafeEqualString(storedSessionToken, sessionToken)) {
      throw passkeyAuthorizationError('Session is invalid or expired. Sign in with Passkey again.');
    }

    const sessionUserId = normalizeIdentity((session as any).user_id);
    const sessionEmail = normalizeIdentity((session as any).email);
    const requestedUserId = normalizeIdentity(input.userId);
    const requestedEmail = normalizeIdentity(input.email);
    const requestedIdentity = requestedUserId || requestedEmail;
    if (requestedIdentity && requestedIdentity !== sessionUserId && requestedIdentity !== sessionEmail) {
      throw passkeyAuthorizationError('This Passkey session cannot generate a login code for a different account.', 403);
    }

    const userId = String((session as any).user_id || input.userId || '').trim();
    if (!userId) {
      throw passkeyAuthorizationError('Session does not have a user identity for login pairing.', 409);
    }

    const code = generateLoginPairingCode();
    const expiresAt = new Date(Date.now() + getPasskeyLoginCodeTtlMs()).toISOString();
    const email = String((session as any).email || input.email || '').trim() || null;

    const { error } = await supabase
      .from('passkey_login_pairing_codes')
      .upsert({
        pair_id: pairId,
        code_hash: hashLoginPairingCode(pairId, code),
        user_id: userId,
        email,
        session_id: sessionId,
        session_token_hash: hashSecret(storedSessionToken),
        expires_at: expiresAt,
        used_at: null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'pair_id' });

    if (error) {
      throw new Error(`Failed to create passkey login code: ${error.message}`);
    }

    return {
      code,
      expiresAt,
      expiresInSeconds: Math.max(1, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 1000)),
      pairId,
      userId,
      email,
    };
  }

  static async redeemLoginPairingCode(input: { pairId: string; code: string }) {
    const pairId = normalizePairId(input.pairId);
    const code = normalizeLoginPairingCode(input.code);
    const codeHash = hashLoginPairingCode(pairId, code);

    const { data, error } = await supabase
      .from('passkey_login_pairing_codes')
      .select('*')
      .eq('pair_id', pairId)
      .eq('code_hash', codeHash)
      .maybeSingle();

    if (error || !data) {
      throw passkeyAuthorizationError('Login code not found. Generate a new code on your phone.', 404);
    }

    const row = data as LoginPairingCodeRow;
    if (row.used_at) {
      throw passkeyAuthorizationError('Login code already used. Generate a new code on your phone.', 409);
    }
    if (new Date(row.expires_at).getTime() < Date.now()) {
      throw passkeyAuthorizationError('Login code expired. Generate a new code on your phone.', 410);
    }

    const session = await agentRepo.getSession(row.session_id);
    if (!session || isSessionExpired(session)) {
      throw passkeyAuthorizationError('Session is invalid or expired. Sign in with Passkey again on your phone.', 401);
    }

    const storedSessionToken = String((session as any).session_token || '').trim();
    if (!storedSessionToken || !timingSafeEqualString(hashSecret(storedSessionToken), row.session_token_hash)) {
      throw passkeyAuthorizationError('Session is invalid or expired. Sign in with Passkey again on your phone.', 401);
    }

    const markUsed = await supabase
      .from('passkey_login_pairing_codes')
      .update({ used_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', row.id)
      .is('used_at', null)
      .select('id')
      .maybeSingle();

    if (markUsed.error) {
      throw new Error(`Failed to consume passkey login code: ${markUsed.error.message}`);
    }
    if (!markUsed.data) {
      throw passkeyAuthorizationError('Login code already used. Generate a new code on your phone.', 409);
    }

    await agentRepo.saveSession(row.session_id, session as any);

    return {
      verified: true,
      userId: String((session as any).user_id || row.user_id || '').trim(),
      email: String((session as any).email || row.email || '').trim(),
      sessionId: row.session_id,
      sessionToken: storedSessionToken,
      session_source: 'web',
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

    const session = await agentRepo.getSession(String(session_id));
    if (!session?.user_id) {
      throw new Error('session not found for payment confirmation');
    }

    const wallet = await resolveTransactionSourceWallet(String(session_id), session);
    if (!wallet?.public_key) {
      throw new Error('wallet not found for payment confirmation');
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
      expectedOrigin: getExpectedOrigins(),
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
