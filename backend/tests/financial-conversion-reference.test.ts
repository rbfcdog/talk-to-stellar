jest.mock('../src/api/services/brl-reference-rate.service', () => ({
  BrlReferenceRateService: {
    quoteBrlToUsdc: jest.fn(),
  },
}));

jest.mock('../src/utils/fee-display', () => ({
  DEFAULT_NETWORK_FEE_XLM: '0.0000100',
  formatNetworkFeeForCustomer: jest.fn().mockResolvedValue({
    display: 'R$ 0,00 / US$ 0,00',
    fee_brl: '0',
    fee_usdc: '0',
    source: 'test',
  }),
}));

import { FinancialController } from '../src/api/controllers/financial.controller';
import { BrlReferenceRateService } from '../src/api/services/brl-reference-rate.service';

const quoteBrlToUsdcMock = BrlReferenceRateService.quoteBrlToUsdc as jest.Mock;

function mockBrlQuote(amount: string | number, brlPerUsdc = 5) {
  const numeric = Number(amount);
  return {
    source: 'configured_brl_asset',
    symbol: 'USDC/BRL',
    brlPerUsdc: brlPerUsdc.toFixed(8),
    usdcPerBrl: (1 / brlPerUsdc).toFixed(8),
    fetchedAt: '2026-05-15T12:00:00.000Z',
    sourceAsset: { code: 'BRL', issuer: 'GCONFIGUREDBRLISSUER' },
    destinationAsset: { code: 'USDC', issuer: 'GCONFIGUREDUSDCISSUER' },
    sourceAmount: numeric.toFixed(7),
    destinationAmount: (numeric / brlPerUsdc).toFixed(7),
    path: [],
  };
}

describe('Financial conversion preview BRL reference', () => {
  beforeEach(() => {
    delete process.env.DEFAULT_USD_BRL_RATE;
    delete process.env.USD_BRL_FALLBACK_RATE;
    delete process.env.USD_BRL_SANITY_MIN;
    delete process.env.USD_BRL_SANITY_MAX;
    delete process.env.TALKTOSTELLAR_FEE_TREASURY_PUBLIC_KEY;
    delete process.env.TALKTOSTELLAR_SPREAD_BPS;
    quoteBrlToUsdcMock.mockReset();
    quoteBrlToUsdcMock.mockImplementation((amount: string | number) => Promise.resolve(mockBrlQuote(amount, 5)));
  });

  it('uses the configured on-chain BRL asset quote for the public conversion preview', async () => {
    const json = jest.fn();
    const status = jest.fn(() => ({ json }));

    await FinancialController.getConversionPreview(
      { query: { brl_amount: '1000' }, body: {}, params: {} } as any,
      { status } as any,
    );

    const payload = json.mock.calls[0][0];
    expect(status).toHaveBeenCalledWith(200);
    expect(quoteBrlToUsdcMock).toHaveBeenCalledWith('1000.0000000');
    expect(payload.quote.source).toBe('configured_brl_asset');
    expect(payload.quote.brl_per_usdc).toBe(5);
    expect(payload.output.gross_receive_usdc).toBe(200);
    expect(payload.output.receive_usdc).toBe(200);
  });

  it('keeps the fee preview on the same BRL quote after spread is deducted', async () => {
    process.env.TALKTOSTELLAR_FEE_TREASURY_PUBLIC_KEY =
      'GBDE6FT6FN7AJOYQNR5EDHFN5PB45JDGF7VKFNZQ5AFEZV7TKVJSXN5';
    process.env.TALKTOSTELLAR_SPREAD_BPS = '30';

    const json = jest.fn();
    const status = jest.fn(() => ({ json }));

    await FinancialController.getConversionFeesPreview(
      { query: { brl_amount: '1000' }, body: {}, params: {} } as any,
      { status } as any,
    );

    const payload = json.mock.calls[0][0];
    expect(status).toHaveBeenCalledWith(200);
    expect(quoteBrlToUsdcMock).toHaveBeenNthCalledWith(1, '1000.0000000');
    expect(quoteBrlToUsdcMock).toHaveBeenNthCalledWith(2, '997.0000000');
    expect(payload.fees.talktostellar_spread_brl).toBe(3);
    expect(payload.output.gross_receive_usdc).toBe(200);
    expect(payload.output.receive_usdc).toBe(199.4);
  });

  it('does not use suspicious sandbox BRL/TESOURO rates for USD receive PIX estimates', async () => {
    process.env.DEFAULT_USD_BRL_RATE = '5.60';
    quoteBrlToUsdcMock.mockImplementation((amount: string | number) => Promise.resolve(mockBrlQuote(amount, 1.157)));

    const json = jest.fn();
    const status = jest.fn(() => ({ json }));

    await FinancialController.getConversionPreview(
      { query: { brl_amount: '100' }, body: {}, params: {} } as any,
      { status } as any,
    );

    const payload = json.mock.calls[0][0];
    expect(status).toHaveBeenCalledWith(200);
    expect(payload.quote.source).toBe('usd_brl_sanity_fallback');
    expect(payload.quote.raw_brl_per_usdc).toBeCloseTo(1.157);
    expect(payload.quote.brl_per_usdc).toBe(5.6);
    expect(payload.output.gross_receive_usdc).toBeCloseTo(17.8571, 4);
    expect(payload.output.receive_usdc).toBeCloseTo(17.8571, 4);
  });

  it('does not invent a fallback rate when the quote is unsafe and no USD/BRL env fallback exists', async () => {
    quoteBrlToUsdcMock.mockImplementation((amount: string | number) => Promise.resolve(mockBrlQuote(amount, 1.157)));
    const json = jest.fn();
    const status = jest.fn(() => ({ json }));

    await FinancialController.getConversionPreview(
      { query: { brl_amount: '100' }, body: {}, params: {} } as any,
      { status } as any,
    );

    expect(status).toHaveBeenCalledWith(400);
    expect(json.mock.calls[0][0]).toMatchObject({ success: false });
  });
});
