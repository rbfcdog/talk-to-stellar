import {
  assertSaneBrlUsdcQuote,
  computeBrlPerUsdc,
  getUsdBrlSanityRange,
} from '../src/api/services/quote-rate-sanity.service';

describe('quote-rate-sanity.service', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.USD_BRL_SANITY_MIN;
    delete process.env.USD_BRL_SANITY_MAX;
    delete process.env.DEFAULT_USD_BRL_SANITY_MIN;
    delete process.env.DEFAULT_USD_BRL_SANITY_MAX;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('computes BRL per USDC for both directions', () => {
    expect(computeBrlPerUsdc({
      sourceAssetCode: 'USDC',
      destinationAssetCode: 'BRL',
      sourceAmount: '100',
      destinationAmount: '560',
    })).toBeCloseTo(5.6, 8);

    expect(computeBrlPerUsdc({
      sourceAssetCode: 'BRL',
      destinationAssetCode: 'USDC',
      sourceAmount: '560',
      destinationAmount: '100',
    })).toBeCloseTo(5.6, 8);
  });

  it('ignores non BRL/USDC pairs', () => {
    expect(computeBrlPerUsdc({
      sourceAssetCode: 'USDC',
      destinationAssetCode: 'XLM',
      sourceAmount: '100',
      destinationAmount: '1000',
    })).toBeNull();

    expect(() => assertSaneBrlUsdcQuote({
      sourceAssetCode: 'USDC',
      destinationAssetCode: 'XLM',
      sourceAmount: '100',
      destinationAmount: '1000',
    })).not.toThrow();
  });

  it('rejects testnet BRL/USDC quotes outside the configured range', () => {
    expect(() => assertSaneBrlUsdcQuote({
      sourceAssetCode: 'USDC',
      destinationAssetCode: 'BRL',
      sourceAmount: '100',
      destinationAmount: '119.06',
      context: 'strict-send path quote',
    })).toThrow(/fora da faixa segura/);
  });

  it('accepts realistic BRL/USDC quotes and custom ranges', () => {
    process.env.USD_BRL_SANITY_MIN = '4';
    process.env.USD_BRL_SANITY_MAX = '7';

    expect(getUsdBrlSanityRange()).toEqual({ min: 4, max: 7 });
    expect(() => assertSaneBrlUsdcQuote({
      sourceAssetCode: 'USDC',
      destinationAssetCode: 'BRL',
      sourceAmount: '100',
      destinationAmount: '560',
    })).not.toThrow();
  });
});
