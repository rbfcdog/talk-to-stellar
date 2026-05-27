jest.mock('../src/api/services/fiat-rate.service', () => ({
  FiatRateService: {
    getUsdBrlRate: jest.fn(),
  },
}));

import {
  assertSaneBrlUsdcQuote,
  computeBrlPerUsdc,
  getUsdBrlSanityRange,
} from '../src/api/services/quote-rate-sanity.service';
import { FiatRateService } from '../src/api/services/fiat-rate.service';

const getUsdBrlRateMock = FiatRateService.getUsdBrlRate as jest.Mock;

describe('quote-rate-sanity.service', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.USD_BRL_SANITY_MIN;
    delete process.env.USD_BRL_SANITY_MAX;
    delete process.env.DEFAULT_USD_BRL_SANITY_MIN;
    delete process.env.DEFAULT_USD_BRL_SANITY_MAX;
    delete process.env.USD_BRL_MAX_MARKET_DEVIATION_PCT;
    delete process.env.USD_BRL_MARKET_DEVIATION_MAX_PCT;
    getUsdBrlRateMock.mockReset();
    getUsdBrlRateMock.mockResolvedValue({
      brlPerUsd: 5.13,
      source: 'market:test:USD-BRL',
      fetchedAt: '2026-05-27T12:00:00.000Z',
      fallbackApplied: false,
    });
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

  it('rejects BRL/USDC quotes that deviate from the market reference', async () => {
    await expect(assertSaneBrlUsdcQuote({
      sourceAssetCode: 'USDC',
      destinationAssetCode: 'BRL',
      sourceAmount: '10',
      destinationAmount: '43.92',
      context: 'strict-send path quote',
    })).rejects.toThrow(/desvia/);
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
