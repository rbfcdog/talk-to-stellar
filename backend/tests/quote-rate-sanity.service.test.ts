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

  it('ignores non BRL/USDC pairs', async () => {
    expect(computeBrlPerUsdc({
      sourceAssetCode: 'USDC',
      destinationAssetCode: 'XLM',
      sourceAmount: '100',
      destinationAmount: '1000',
    })).toBeNull();

    await expect(assertSaneBrlUsdcQuote({
      sourceAssetCode: 'USDC',
      destinationAssetCode: 'XLM',
      sourceAmount: '100',
      destinationAmount: '1000',
    })).resolves.toBeUndefined();
  });

  it('rejects testnet BRL/USDC quotes outside the configured range', async () => {
    await expect(assertSaneBrlUsdcQuote({
      sourceAssetCode: 'USDC',
      destinationAssetCode: 'BRL',
      sourceAmount: '100',
      destinationAmount: '119.06',
      context: 'strict-send path quote',
    })).rejects.toThrow(/fora da faixa segura/);
  });

  it('accepts BRL/USDC transaction quotes within the configured range', async () => {
    process.env.STELLAR_NETWORK = 'TESTNET';
    process.env.USD_BRL_SANITY_MIN = '3';
    process.env.USD_BRL_SANITY_MAX = '10';

    await expect(assertSaneBrlUsdcQuote({
      sourceAssetCode: 'USDC',
      destinationAssetCode: 'BRL',
      sourceAmount: '10',
      destinationAmount: '43.92',
      context: 'strict-send path quote',
    })).resolves.toBeUndefined();
  });

  it('accepts realistic BRL/USDC quotes and custom ranges', async () => {
    process.env.USD_BRL_SANITY_MIN = '4';
    process.env.USD_BRL_SANITY_MAX = '7';

    expect(getUsdBrlSanityRange()).toEqual({ min: 4, max: 7 });
    await expect(assertSaneBrlUsdcQuote({
      sourceAssetCode: 'USDC',
      destinationAssetCode: 'BRL',
      sourceAmount: '100',
      destinationAmount: '513',
    })).resolves.toBeUndefined();
  });
});
