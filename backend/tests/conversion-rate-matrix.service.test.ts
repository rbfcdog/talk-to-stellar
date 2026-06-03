jest.mock('../src/api/services/brl-reference-rate.service', () => ({
  BrlReferenceRateService: {
    quoteBrlToUsdc: jest.fn(),
    quoteUsdcToBrl: jest.fn(),
  },
}));

jest.mock('../src/api/services/stellar.service', () => ({
  StellarService: {
    quoteStrictSendConversion: jest.fn(),
  },
}));

import { ConversionRateMatrixService } from '../src/api/services/conversion-rate-matrix.service';
import { BrlReferenceRateService } from '../src/api/services/brl-reference-rate.service';
import { StellarService } from '../src/api/services/stellar.service';

const quoteBrlToUsdcMock = BrlReferenceRateService.quoteBrlToUsdc as jest.Mock;
const quoteUsdcToBrlMock = BrlReferenceRateService.quoteUsdcToBrl as jest.Mock;
const quoteStrictSendConversionMock = StellarService.quoteStrictSendConversion as jest.Mock;

function brlQuote(sourceAmount: string | number, direction: 'BRL_USDC' | 'USDC_BRL', brlPerUsdc = 5) {
  const amount = Number(sourceAmount);
  return {
    source: 'transaction_values',
    symbol: 'USDC/BRL',
    brlPerUsdc: brlPerUsdc.toFixed(8),
    usdcPerBrl: (1 / brlPerUsdc).toFixed(8),
    fetchedAt: '2026-06-02T12:00:00.000Z',
    sourceAsset: direction === 'BRL_USDC'
      ? { code: 'TESOURO', issuer: 'GTESOURO' }
      : { code: 'USDC', issuer: 'GUSDC' },
    destinationAsset: direction === 'BRL_USDC'
      ? { code: 'USDC', issuer: 'GUSDC' }
      : { code: 'TESOURO', issuer: 'GTESOURO' },
    sourceAmount: amount.toFixed(7),
    destinationAmount: direction === 'BRL_USDC'
      ? (amount / brlPerUsdc).toFixed(7)
      : (amount * brlPerUsdc).toFixed(7),
    path: [],
  };
}

function displayCode(code: string) {
  return code === 'TESOURO' ? 'BRL' : code;
}

describe('ConversionRateMatrixService', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.STELLAR_NETWORK = 'TESTNET';
    process.env.USDC_ISSUER = 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';
    process.env.TESOURO_ISSUER = 'GC3CW7EDYRTWQ635VDIGY6S4ZUF5L6TQ7AA4MWS7LEQDBLUSZXV7UPS4';
    process.env.CETES_ISSUER_TESTNET = 'GC3CW7EDYRTWQ635VDIGY6S4ZUF5L6TQ7AA4MWS7LEQDBLUSZXV7UPS4';
    process.env.CONVERSION_MATRIX_ASSETS = 'BRL,USDC,CETES,XLM';
    quoteBrlToUsdcMock.mockReset();
    quoteUsdcToBrlMock.mockReset();
    quoteStrictSendConversionMock.mockReset();

    quoteBrlToUsdcMock.mockImplementation((amount) => Promise.resolve(brlQuote(amount, 'BRL_USDC', 5)));
    quoteUsdcToBrlMock.mockImplementation((amount) => Promise.resolve(brlQuote(amount, 'USDC_BRL', 5)));

    quoteStrictSendConversionMock.mockImplementation(({ sourceAsset, destAsset, sourceAmount }) => {
      const source = displayCode(sourceAsset.code);
      const destination = displayCode(destAsset.code);
      const rates: Record<string, number> = {
        'XLM->USDC': 0.2,
        'USDC->XLM': 5,
        'CETES->USDC': 0.1,
        'USDC->CETES': 10,
      };
      const rate = rates[`${source}->${destination}`];
      if (!rate) {
        throw new Error(`No direct route for ${source}->${destination}`);
      }
      const amount = Number(sourceAmount);
      return Promise.resolve({
        sourceAsset,
        destinationAsset: destAsset,
        sourceAmount: amount.toFixed(7),
        effectiveSourceAmount: amount.toFixed(7),
        destinationAmount: (amount * rate).toFixed(7),
        destinationMin: (amount * rate * 0.98).toFixed(7),
        platformFee: { enabled: false, feeAmount: '0', feeAssetCode: source, feeBps: 30 },
        networkFeeXlm: '0.0000100',
        path: [],
      });
    });
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('returns the full 4x4 matrix with 16 dynamically resolved cells', async () => {
    const matrix = await ConversionRateMatrixService.buildMatrix();

    expect(matrix.assets).toEqual(['BRL', 'USDC', 'CETES', 'XLM']);
    expect(matrix.cells).toHaveLength(16);
    expect(matrix.summary.total_pairs).toBe(16);
    expect(matrix.summary.unavailable_pairs).toBe(0);
    expect(matrix.summary.arbitrage_guarded_pairs).toBe(0);
    expect(matrix.matrix.BRL.USDC.rate).toBeCloseTo(0.2, 10);
    expect(matrix.matrix.USDC.BRL.rate).toBeCloseTo(5, 10);
    expect(matrix.matrix.XLM.CETES.status).toBe('synthetic');
    expect(matrix.matrix.XLM.CETES.bridge_asset_code).toBe('USDC');
    expect(matrix.matrix.XLM.CETES.rate).toBeCloseTo(2, 10);
    expect(matrix.matrix.BRL.BRL.status).toBe('same_asset');
  });

  it('clips reciprocal quotes that would allow direct round-trip arbitrage', async () => {
    quoteStrictSendConversionMock.mockImplementation(({ sourceAsset, destAsset, sourceAmount }) => {
      const source = displayCode(sourceAsset.code);
      const destination = displayCode(destAsset.code);
      const rates: Record<string, number> = {
        'XLM->USDC': 0.2,
        'USDC->XLM': 5,
        'CETES->USDC': 0.5,
        'USDC->CETES': 15,
      };
      const rate = rates[`${source}->${destination}`];
      if (!rate) {
        throw new Error(`No direct route for ${source}->${destination}`);
      }
      const amount = Number(sourceAmount);
      return Promise.resolve({
        sourceAsset,
        destinationAsset: destAsset,
        sourceAmount: amount.toFixed(7),
        effectiveSourceAmount: amount.toFixed(7),
        destinationAmount: (amount * rate).toFixed(7),
        destinationMin: (amount * rate * 0.98).toFixed(7),
        platformFee: { enabled: false, feeAmount: '0', feeAssetCode: source, feeBps: 30 },
        networkFeeXlm: '0.0000100',
        path: [],
      });
    });

    const matrix = await ConversionRateMatrixService.buildMatrix();
    const usdcToCetes = matrix.matrix.USDC.CETES;
    const cetesToUsdc = matrix.matrix.CETES.USDC;
    const roundTrip = Number(usdcToCetes.rate || 0) * Number(cetesToUsdc.rate || 0);

    expect(matrix.summary.arbitrage_guarded_pairs).toBeGreaterThanOrEqual(1);
    expect(matrix.summary.arbitrage_warnings.join('\n')).toContain('USDC/CETES');
    expect(usdcToCetes.arbitrage_guard?.applied).toBe(true);
    expect(cetesToUsdc.arbitrage_guard?.applied).toBe(true);
    expect(usdcToCetes.arbitrage_guard?.original_round_trip_product).toBeCloseTo(7.5, 10);
    expect(roundTrip).toBeLessThanOrEqual(matrix.summary.max_round_trip_product + 1e-8);
  });

  it('clips triangular routes that would allow multi-hop arbitrage', async () => {
    quoteStrictSendConversionMock.mockImplementation(({ sourceAsset, destAsset, sourceAmount }) => {
      const source = displayCode(sourceAsset.code);
      const destination = displayCode(destAsset.code);
      const rates: Record<string, number> = {
        'USDC->CETES': 15,
        'CETES->USDC': 0.065,
        'CETES->XLM': 0.33,
        'XLM->CETES': 1.7,
        'XLM->USDC': 0.66,
        'USDC->XLM': 1.5,
      };
      const rate = rates[`${source}->${destination}`];
      if (!rate) {
        throw new Error(`No direct route for ${source}->${destination}`);
      }
      const amount = Number(sourceAmount);
      return Promise.resolve({
        sourceAsset,
        destinationAsset: destAsset,
        sourceAmount: amount.toFixed(7),
        effectiveSourceAmount: amount.toFixed(7),
        destinationAmount: (amount * rate).toFixed(7),
        destinationMin: (amount * rate * 0.98).toFixed(7),
        platformFee: { enabled: false, feeAmount: '0', feeAssetCode: source, feeBps: 30 },
        networkFeeXlm: '0.0000100',
        path: [],
      });
    });

    const matrix = await ConversionRateMatrixService.buildMatrix({ assets: ['USDC', 'CETES', 'XLM'] });
    const usdcToCetes = matrix.matrix.USDC.CETES;
    const cetesToXlm = matrix.matrix.CETES.XLM;
    const xlmToUsdc = matrix.matrix.XLM.USDC;
    const triangleProduct =
      Number(usdcToCetes.rate || 0) *
      Number(cetesToXlm.rate || 0) *
      Number(xlmToUsdc.rate || 0);

    expect(matrix.summary.arbitrage_guarded_pairs).toBeGreaterThanOrEqual(1);
    expect(matrix.summary.arbitrage_warnings.join('\n')).toContain('USDC -> CETES -> XLM -> USDC');
    expect([
      usdcToCetes.arbitrage_guard?.method,
      cetesToXlm.arbitrage_guard?.method,
      xlmToUsdc.arbitrage_guard?.method,
    ]).toContain('multi_hop_cycle_clip');
    expect(triangleProduct).toBeLessThanOrEqual(matrix.summary.max_round_trip_product + 1e-8);
  });

  it('marks the pair unavailable when the transaction route quote is rejected', async () => {
    quoteBrlToUsdcMock.mockRejectedValueOnce(new Error('distorted testnet quote'));

    const matrix = await ConversionRateMatrixService.buildMatrix({ assets: ['BRL', 'USDC'], sampleAmount: 100 });

    expect(matrix.cells).toHaveLength(4);
    expect(matrix.matrix.BRL.USDC.status).toBe('unavailable');
    expect(matrix.matrix.BRL.USDC.source).toBe('none');
    expect(matrix.matrix.BRL.USDC.rate).toBeNull();
    expect(matrix.matrix.BRL.USDC.error).toContain('distorted testnet quote');
  });
});
