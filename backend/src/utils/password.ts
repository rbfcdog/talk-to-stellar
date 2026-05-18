import crypto from 'crypto';

function encode(value: Buffer) {
  return value.toString('base64url');
}

function decode(value: string) {
  return Buffer.from(value, 'base64url');
}

export function hashPassword(password: string): string {
  const salt = encode(crypto.randomBytes(16));
  const derivedKey = crypto.scryptSync(password, salt, 64);

  return `${salt}:${encode(derivedKey)}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  const [salt, encodedHash] = String(storedHash || '').split(':');

  if (!salt || !encodedHash) {
    return false;
  }

  const derivedKey = crypto.scryptSync(password, salt, 64);
  const expected = decode(encodedHash);

  if (expected.length !== derivedKey.length) {
    return false;
  }

  return crypto.timingSafeEqual(expected, derivedKey);
}

export function timingSafeEqualString(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(String(left || ''));
  const rightBuffer = Buffer.from(String(right || ''));
  if (leftBuffer.length !== rightBuffer.length) return false;
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
}
