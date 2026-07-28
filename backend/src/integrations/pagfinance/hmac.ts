/**
 * PagFinance HMAC signing + webhook verification.
 *
 * Pure functions — no I/O, no config access — so the signing contract is
 * testable with fixed vectors.
 *
 * Request signing recipe (partner API guide):
 *   signingKey = SHA256(rawSecret + ":" + partnerId)                (hex)
 *   canonical  = METHOD \n PATH \n TIMESTAMP \n NONCE \n SHA256(BODY)
 *   signature  = HMAC-SHA256(signingKey, canonical)                 (hex)
 *   header     = HMAC-SHA256 partnerId=<id>,timestamp=<ts>,nonce=<n>,signature=<sig>
 *
 * Webhook deliveries are signed with HMAC-SHA256 over the RAW body bytes and
 * sent as `X-<Prefix>-Signature: sha256=<hex>`.
 */

import crypto from 'crypto';

/** Derive the partner signing key. Cacheable — changes only on secret rotation. */
export function deriveSigningKey(rawSecret: string, partnerId: string): string {
  return crypto.createHash('sha256').update(`${rawSecret}:${partnerId}`).digest('hex');
}

/** SHA-256 hex of the exact body string put on the wire (empty string for no body). */
export function hashBody(body: string): string {
  return crypto.createHash('sha256').update(body).digest('hex');
}

/** Canonical string. `path` must NOT include the query string. */
export function canonicalString(
  method: string,
  path: string,
  timestampSec: number,
  nonce: string,
  bodySha256Hex: string,
): string {
  return [method.toUpperCase(), path, String(timestampSec), nonce, bodySha256Hex].join('\n');
}

export function signCanonical(signingKey: string, canonical: string): string {
  return crypto.createHmac('sha256', signingKey).update(canonical).digest('hex');
}

/**
 * Build the full Authorization header value. Strict format: no spaces around
 * `=` or `,`; signature is 64 lowercase hex chars.
 */
export function buildAuthorizationHeader(input: {
  partnerId: string;
  signingKey: string;
  method: string;
  path: string;
  timestampSec: number;
  nonce: string;
  body: string;
}): string {
  const canonical = canonicalString(
    input.method,
    input.path,
    input.timestampSec,
    input.nonce,
    hashBody(input.body),
  );
  const signature = signCanonical(input.signingKey, canonical);
  return `HMAC-SHA256 partnerId=${input.partnerId},timestamp=${input.timestampSec},nonce=${input.nonce},signature=${signature}`;
}

const WEBHOOK_SIGNATURE_PREFIX = 'sha256=';
const HEX_64 = /^[0-9a-f]{64}$/i;

/**
 * Verify a webhook delivery signature against the RAW request bytes.
 *
 * Returns false — never throws — on any malformed input: missing header,
 * missing `sha256=` prefix, non-hex or wrong-length signature, empty secret.
 * Length is checked before timingSafeEqual (which throws on length mismatch).
 */
export function verifyWebhookSignature(
  rawBody: Buffer,
  signatureHeader: string | undefined | null,
  webhookSecret: string,
): boolean {
  if (!webhookSecret || !signatureHeader || !Buffer.isBuffer(rawBody)) return false;
  if (!signatureHeader.startsWith(WEBHOOK_SIGNATURE_PREFIX)) return false;

  const providedHex = signatureHeader.slice(WEBHOOK_SIGNATURE_PREFIX.length);
  if (!HEX_64.test(providedHex)) return false;

  const expected = crypto.createHmac('sha256', webhookSecret).update(rawBody).digest();
  const provided = Buffer.from(providedHex, 'hex');
  if (expected.length !== provided.length) return false;
  return crypto.timingSafeEqual(expected, provided);
}
