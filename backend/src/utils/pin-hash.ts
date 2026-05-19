import crypto from 'crypto';
import { isProductionLikeEnvironment } from '../config/runtime';
import { timingSafeEqualString } from './password';

const CURRENT_ALGORITHM = 'pbkdf2_sha256';
const CURRENT_VERSION = 'v2';
const CURRENT_ITERATIONS = 250_000;
const CURRENT_KEY_LENGTH = 64;
const CURRENT_DIGEST = 'sha256';

export type PinVerificationResult = {
  valid: boolean;
  needsRehash: boolean;
};

function readPinPepper(): string {
  const pepper = String(process.env.PIN_PEPPER || process.env.PIN_SALT || '').trim();
  if (pepper) return pepper;
  if (isProductionLikeEnvironment()) {
    throw new Error('PIN_PEPPER is required in production-like environments.');
  }
  return 'local-dev-pin-pepper';
}

function legacyPinSalt(): string {
  return String(process.env.PIN_SALT || 'salt');
}

function derive(pin: string, salt: string, iterations: number): string {
  return crypto
    .pbkdf2Sync(`${pin}:${readPinPepper()}`, salt, iterations, CURRENT_KEY_LENGTH, CURRENT_DIGEST)
    .toString('hex');
}

function legacyHash(pin: string): string {
  return crypto
    .pbkdf2Sync(pin, legacyPinSalt(), 100_000, CURRENT_KEY_LENGTH, CURRENT_DIGEST)
    .toString('hex');
}

export function hashWalletPin(pin: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = derive(pin, salt, CURRENT_ITERATIONS);
  return `${CURRENT_ALGORITHM}$${CURRENT_VERSION}$${CURRENT_ITERATIONS}$${salt}$${hash}`;
}

export function verifyWalletPin(pin: string, storedHash: unknown): PinVerificationResult {
  const stored = String(storedHash || '').trim();
  if (!pin || !stored) return { valid: false, needsRehash: false };

  const parts = stored.split('$');
  if (parts.length === 5 && parts[0] === CURRENT_ALGORITHM && parts[1] === CURRENT_VERSION) {
    const iterations = Number(parts[2]);
    const salt = parts[3];
    const expected = parts[4];
    if (!Number.isFinite(iterations) || iterations <= 0 || !salt || !expected) {
      return { valid: false, needsRehash: false };
    }
    const actual = derive(pin, salt, Math.trunc(iterations));
    const valid = timingSafeEqualString(actual, expected);
    return {
      valid,
      needsRehash: valid && iterations < CURRENT_ITERATIONS,
    };
  }

  const valid = timingSafeEqualString(legacyHash(pin), stored);
  return { valid, needsRehash: valid };
}

export function verifyWalletPinAgainstAny(pin: string, hashes: unknown[]): PinVerificationResult {
  let sawValidLegacy = false;
  for (const hash of hashes) {
    const result = verifyWalletPin(pin, hash);
    if (result.valid && !result.needsRehash) return { valid: true, needsRehash: false };
    sawValidLegacy = sawValidLegacy || (result.valid && result.needsRehash);
  }
  return sawValidLegacy
    ? { valid: true, needsRehash: true }
    : { valid: false, needsRehash: false };
}
