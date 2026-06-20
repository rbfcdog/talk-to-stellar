process.env.STELLAR_NETWORK = 'testnet';

jest.mock('uuid', () => ({ v4: jest.fn(() => 'aaaabbbb-cccc-1234-5678-000000000000') }));

jest.mock('../src/utils/logger', () => ({
  logger: {
    warn: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  },
}));

import { supabase } from '../src/config/supabase';
import { PaymentLinksService } from '../src/integrations/payment-links/service';

describe('PaymentLinksService', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    jest.clearAllMocks();
  });

  // ── buildSep7Uri ──────────────────────────────────────────────────────────

  it('buildSep7Uri — minimal XLM payment', () => {
    const uri = PaymentLinksService.buildSep7Uri({
      stellar_address: 'GDEST000000000000000000000000000000000000000000000000001',
      asset_code: 'XLM',
    });

    expect(uri).toMatch(/^web\+stellar:pay\?destination=GDEST/);
    // XLM has no asset_code or asset_issuer in the URI
    expect(uri).not.toContain('asset_code');
  });

  it('buildSep7Uri — USDC with amount and memo', () => {
    const uri = PaymentLinksService.buildSep7Uri({
      stellar_address: 'GDEST000000000000000000000000000000000000000000000000001',
      amount: '10',
      asset_code: 'USDC',
      memo: 'order-123',
    });

    expect(uri).toContain('amount=10');
    expect(uri).toContain('asset_code=USDC');
    expect(uri).toContain('asset_issuer=GA5Z');
    expect(uri).toContain('memo=order-123');
  });

  it('buildSep7Uri — testnet adds network_passphrase param', () => {
    process.env.STELLAR_NETWORK = 'testnet';

    const uri = PaymentLinksService.buildSep7Uri({
      stellar_address: 'GDEST000000000000000000000000000000000000000000000000001',
      asset_code: 'XLM',
    });

    expect(uri).toContain('network_passphrase');
  });

  it('buildSep7Uri — mainnet omits network_passphrase', () => {
    process.env.STELLAR_NETWORK = 'mainnet';

    const uri = PaymentLinksService.buildSep7Uri({
      stellar_address: 'GDEST000000000000000000000000000000000000000000000000001',
      asset_code: 'XLM',
    });

    expect(uri).not.toContain('network_passphrase');
  });

  it('buildSep7Uri — label and message included', () => {
    const uri = PaymentLinksService.buildSep7Uri({
      stellar_address: 'GDEST000000000000000000000000000000000000000000000000001',
      asset_code: 'XLM',
      label: 'Coffee',
      message: 'Thanks!',
    });

    expect(uri).toContain('label=Coffee');
    // URLSearchParams encodes '!' as '%21'
    expect(uri).toContain('msg=Thanks%21');
  });

  // ── create ────────────────────────────────────────────────────────────────

  it('create — returns payment link with correct id and short_url', async () => {
    const result = await PaymentLinksService.create({
      stellar_address: 'GDEST000000000000000000000000000000000000000000000000001',
      amount: '5',
      asset_code: 'USDC',
    });

    // uuid mock: 'aaaabbbb-cccc-1234-5678-000000000000' → strip dashes → 'aaaabbbbcccc12345678000000000000' → slice(0,12) = 'aaaabbbbcccc'
    expect(result.id).toBe('aaaabbbbcccc');
    expect(result.id).toHaveLength(12);
    expect(result.uri).toMatch(/^web\+stellar:pay\?/);
    expect(result.short_url).toContain('aaaabbbbcccc');
    expect(result.times_used).toBe(0);
  });

  it('create — sets expiry when expires_in_hours given', async () => {
    const before = Date.now();

    const result = await PaymentLinksService.create({
      stellar_address: 'GDEST000000000000000000000000000000000000000000000000001',
      amount: '5',
      asset_code: 'USDC',
      expires_in_hours: 24,
    });

    expect(result.expires_at).toBeDefined();

    const expiresMs = new Date(result.expires_at!).getTime();
    const expectedMs = before + 24 * 3600_000;

    // Allow ±1 minute of drift
    expect(expiresMs).toBeGreaterThanOrEqual(expectedMs - 60_000);
    expect(expiresMs).toBeLessThanOrEqual(expectedMs + 60_000);
  });

  // ── delete ────────────────────────────────────────────────────────────────

  it('delete — calls supabase delete with correct id', async () => {
    await PaymentLinksService.delete('test-id');

    expect(jest.mocked(supabase.from)).toHaveBeenCalledWith('payment_links');

    // The builder returned by supabase.from('payment_links') has .delete and .eq as jest.fn chains
    const builder = jest.mocked(supabase.from).mock.results[0].value;
    expect(builder.delete).toHaveBeenCalled();
    expect(builder.eq).toHaveBeenCalledWith('id', 'test-id');
  });
});
