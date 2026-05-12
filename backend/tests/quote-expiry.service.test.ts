import { attachQuoteExpiry, isQuoteExpired, quoteExpiryMessage } from '../src/api/services/quote-expiry.service';

describe('quote-expiry.service', () => {
  it('adds a short validity window to quotes', () => {
    process.env.QUOTE_TTL_SECONDS = '30';
    const quote = attachQuoteExpiry({ sourceAmount: '500', destinationAmount: '89.12' }, Date.UTC(2026, 4, 12, 12, 0, 0));

    expect(quote.quote_ttl_seconds).toBe(30);
    expect(quote.quote_issued_at).toBe('2026-05-12T12:00:00.000Z');
    expect(quote.quote_expires_at).toBe('2026-05-12T12:00:30.000Z');
  });

  it('detects expired quote payloads', () => {
    const payload = {
      sub: 'external_conversion_confirm',
      quote_expires_at: '2026-05-12T12:00:30.000Z',
    };

    expect(isQuoteExpired(payload, Date.UTC(2026, 4, 12, 12, 0, 31))).toBe(true);
    expect(quoteExpiryMessage()).toMatch(/Cotação expirada/);
  });
});
