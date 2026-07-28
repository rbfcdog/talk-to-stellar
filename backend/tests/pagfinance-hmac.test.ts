import crypto from 'crypto';
import {
  buildAuthorizationHeader,
  canonicalString,
  deriveSigningKey,
  hashBody,
  signCanonical,
  verifyWebhookSignature,
} from '../src/integrations/pagfinance/hmac';

const PARTNER_ID = 'talktostellar';
const RAW_SECRET = 'test-raw-secret';

describe('pagfinance hmac request signing', () => {
  it('derives the signing key as SHA256(rawSecret:partnerId) hex', () => {
    const expected = crypto
      .createHash('sha256')
      .update(`${RAW_SECRET}:${PARTNER_ID}`)
      .digest('hex');
    expect(deriveSigningKey(RAW_SECRET, PARTNER_ID)).toBe(expected);
    expect(deriveSigningKey(RAW_SECRET, PARTNER_ID)).toMatch(/^[0-9a-f]{64}$/);
  });

  it('builds the canonical string with newline joins and uppercased method', () => {
    const canonical = canonicalString('post', '/api/v1/auth/token', 1750000000, 'nonce-1234567890', 'abc');
    expect(canonical).toBe('POST\n/api/v1/auth/token\n1750000000\nnonce-1234567890\nabc');
  });

  it('hashes the exact body string; empty body hashes the empty string', () => {
    const body = JSON.stringify({ pubkey: 'GABC1234567890' });
    expect(hashBody(body)).toBe(crypto.createHash('sha256').update(body).digest('hex'));
    expect(hashBody('')).toBe(crypto.createHash('sha256').update('').digest('hex'));
  });

  it('produces the strict Authorization header format with no spaces', () => {
    const signingKey = deriveSigningKey(RAW_SECRET, PARTNER_ID);
    const header = buildAuthorizationHeader({
      partnerId: PARTNER_ID,
      signingKey,
      method: 'POST',
      path: '/api/v1/auth/token',
      timestampSec: 1750000000,
      nonce: '0f8fad5b-d9cb-469f-a165-70867728950e',
      body: '{"pubkey":"GABC1234567890"}',
    });

    expect(header).toMatch(
      /^HMAC-SHA256 partnerId=talktostellar,timestamp=1750000000,nonce=0f8fad5b-d9cb-469f-a165-70867728950e,signature=[0-9a-f]{64}$/,
    );
    // No spaces around = or , (only the single scheme separator space).
    expect(header.split(' ').length).toBe(2);
  });

  it('signature matches an independently computed HMAC over the canonical', () => {
    const signingKey = deriveSigningKey(RAW_SECRET, PARTNER_ID);
    const body = '{"amount":100}';
    const canonical = canonicalString('POST', '/api/v1/cashin/intent', 1750000001, 'n-abcdefgh12345678', hashBody(body));
    const expected = crypto.createHmac('sha256', signingKey).update(canonical).digest('hex');
    expect(signCanonical(signingKey, canonical)).toBe(expected);

    const header = buildAuthorizationHeader({
      partnerId: PARTNER_ID,
      signingKey,
      method: 'POST',
      path: '/api/v1/cashin/intent',
      timestampSec: 1750000001,
      nonce: 'n-abcdefgh12345678',
      body,
    });
    expect(header.endsWith(`signature=${expected}`)).toBe(true);
  });
});

describe('pagfinance webhook signature verification', () => {
  const SECRET = 'test-webhook-secret';

  function sign(rawBody: Buffer, secret = SECRET): string {
    return `sha256=${crypto.createHmac('sha256', secret).update(rawBody).digest('hex')}`;
  }

  it('accepts a valid signature over the raw bytes', () => {
    const raw = Buffer.from(JSON.stringify({ event: 'CASHIN_COMPLETED', intentId: 'x' }));
    expect(verifyWebhookSignature(raw, sign(raw), SECRET)).toBe(true);
  });

  it('rejects a tampered body', () => {
    const raw = Buffer.from('{"event":"CASHIN_COMPLETED","intentId":"x"}');
    const header = sign(raw);
    const tampered = Buffer.from('{"event":"CASHIN_COMPLETED","intentId":"y"}');
    expect(verifyWebhookSignature(tampered, header, SECRET)).toBe(false);
  });

  it('rejects a signature signed with the wrong secret', () => {
    const raw = Buffer.from('{"a":1}');
    expect(verifyWebhookSignature(raw, sign(raw, 'other-secret'), SECRET)).toBe(false);
  });

  it('returns false (never throws) on wrong-length signature', () => {
    const raw = Buffer.from('{"a":1}');
    expect(verifyWebhookSignature(raw, 'sha256=abc123', SECRET)).toBe(false);
    expect(verifyWebhookSignature(raw, `sha256=${'a'.repeat(63)}`, SECRET)).toBe(false);
    expect(verifyWebhookSignature(raw, `sha256=${'a'.repeat(130)}`, SECRET)).toBe(false);
  });

  it('returns false on non-hex signature of correct length', () => {
    const raw = Buffer.from('{"a":1}');
    expect(verifyWebhookSignature(raw, `sha256=${'z'.repeat(64)}`, SECRET)).toBe(false);
  });

  it('requires the sha256= prefix', () => {
    const raw = Buffer.from('{"a":1}');
    const bare = sign(raw).slice('sha256='.length);
    expect(verifyWebhookSignature(raw, bare, SECRET)).toBe(false);
  });

  it('returns false with a missing header or empty secret', () => {
    const raw = Buffer.from('{"a":1}');
    expect(verifyWebhookSignature(raw, undefined, SECRET)).toBe(false);
    expect(verifyWebhookSignature(raw, null, SECRET)).toBe(false);
    expect(verifyWebhookSignature(raw, sign(raw), '')).toBe(false);
  });
});
