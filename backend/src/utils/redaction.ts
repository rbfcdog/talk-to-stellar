const REDACTED = '[REDACTED]';

const TOKEN_QUERY_PATTERN = /([?&](?:api[_-]?key|apikey|authorization|secret|session[_-]?token|token)=)([^&#]+)/gi;
const JWT_PATTERN = /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g;
const ETHERFUSE_KEY_PATTERN = /\bapi_[a-z]+:[^:\s]+:[^:\s]+\b/gi;
const STELLAR_SECRET_PATTERN = /\bS[A-Z2-7]{55}\b/g;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date);
}

function sanitizeString(value: string): string {
  return value
    .replace(TOKEN_QUERY_PATTERN, `$1${REDACTED}`)
    .replace(JWT_PATTERN, REDACTED)
    .replace(ETHERFUSE_KEY_PATTERN, REDACTED)
    .replace(STELLAR_SECRET_PATTERN, REDACTED);
}

export function isSensitiveKey(key: string): boolean {
  const normalized = String(key || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!normalized) return false;
  if (
    normalized === 'authorization' ||
    normalized === 'bearer' ||
    normalized === 'cpf' ||
    normalized === 'document' ||
    normalized === 'email' ||
    normalized === 'mnemonic' ||
    normalized === 'passcode' ||
    normalized === 'password' ||
    normalized === 'phone' ||
    normalized === 'phonenumber' ||
    normalized === 'pixkey' ||
    normalized === 'seed' ||
    normalized === 'token'
  ) {
    return true;
  }
  return (
    normalized.endsWith('apikey') ||
    normalized.endsWith('authorization') ||
    normalized.endsWith('email') ||
    normalized.endsWith('password') ||
    normalized.endsWith('phonenumber') ||
    normalized.endsWith('privatekey') ||
    normalized.endsWith('secret') ||
    normalized.endsWith('sessiontoken') ||
    normalized.endsWith('token') ||
    normalized.endsWith('walletpin') ||
    normalized === 'pin' ||
    normalized.endsWith('pin') ||
    normalized.includes('pinhash')
  );
}

export function redactSensitive(value: unknown, depth = 0): unknown {
  if (depth > 8) return '[TRUNCATED]';
  if (value === null || value === undefined) return value;
  if (typeof value === 'string') return sanitizeString(value);
  if (typeof value === 'number' || typeof value === 'boolean') return value;
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (Buffer.isBuffer(value)) return `[BUFFER:${value.length}]`;

  if (Array.isArray(value)) {
    return value.map((item) => redactSensitive(item, depth + 1));
  }

  if (isPlainObject(value)) {
    return Object.keys(value).sort().reduce((acc: Record<string, unknown>, key) => {
      const raw = value[key];
      acc[key] = isSensitiveKey(key) ? REDACTED : redactSensitive(raw, depth + 1);
      return acc;
    }, {});
  }

  return sanitizeString(String(value));
}

export function safeRedactedJson(value: unknown): string {
  try {
    return JSON.stringify(redactSensitive(value));
  } catch {
    return REDACTED;
  }
}
