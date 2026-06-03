import { AnchorService } from '../src/api/services/anchor.service';
import { StellarService } from '../src/api/services/stellar.service';
import { BrlReferenceRateService } from '../src/api/services/brl-reference-rate.service';

jest.mock('../src/api/services/stellar.service', () => ({
  StellarService: {
    getAccountBalance: jest.fn(),
    quotePathPayment: jest.fn(),
  },
}));

jest.mock('../src/api/services/brl-reference-rate.service', () => ({
  BrlReferenceRateService: {
    quoteUsdcToBrl: jest.fn(),
  },
}));

describe('AnchorService off-ramp balance validation', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    process.env.STELLAR_NETWORK = 'TESTNET';
    process.env.USDC_ISSUER = 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';
    delete process.env.TALKTOSTELLAR_FEE_TREASURY_PUBLIC_KEY;
    jest.spyOn(AnchorService as any, 'getRuntimeInfo').mockReturnValue({
      sandbox: true,
      provider: 'etherfuse',
      network: 'Stellar Testnet',
      base_url: 'https://api.sand.etherfuse.com',
      asset: { code: 'TESOURO', issuer: 'GC3CW7EDYRTWQ635VDIGY6S4ZUF5L6TQ7AA4MWS7LEQDBLUSZXV7UPS4', identifier: 'TESOURO' },
    });
    jest.spyOn(AnchorService as any, 'resolveSessionWallet').mockResolvedValue({
      sessionId: 'session-1',
      sessionToken: 'token-1',
      userId: 'user-1',
      email: 'user@example.com',
      publicKey: 'GBDE6FT6FN7AJOYQNR5EDHFN5PB45JDGF7VKFNZQ5AFEZV7TKVJSXN5',
      vaultSecretId: 'vault-1',
      sessionPinHash: 'hash',
    });
    jest.spyOn(AnchorService as any, 'requireWalletPin').mockReturnValue('1234');
    (BrlReferenceRateService.quoteUsdcToBrl as jest.Mock).mockResolvedValue({
      destinationAmount: '51300.0000000',
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.clearAllMocks();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('blocks a PIX off-ramp before order creation when the source asset balance is insufficient', async () => {
    (StellarService.getAccountBalance as jest.Mock).mockResolvedValue([
      {
        asset_type: 'credit_alphanum4',
        asset_code: 'USDC',
        asset_issuer: process.env.USDC_ISSUER,
        balance: '663.6275551',
      },
    ]);

    await expect(AnchorService.runTemporarySandboxOffRampTest({
      session_id: 'session-1',
      session_token: 'token-1',
      pin: '1234',
      amount: '10.000',
      source_amount: '10.000',
      source_asset_code: 'USDC',
      amount_currency: 'USDC',
    })).rejects.toThrow(/Saldo insuficiente/);

    expect(StellarService.getAccountBalance).toHaveBeenCalledTimes(1);
  });

  it('quotes source XLM from the requested BRL receive amount instead of treating BRL as the source amount', async () => {
    (StellarService as any).quotePathPayment.mockResolvedValue({
      sourceAmount: '18.5000000',
      sourceMax: '18.8700000',
      pathSourceMax: '18.8700000',
      destinationAmount: '100.0000000',
      path: [],
    });
    jest.spyOn(AnchorService as any, 'createCustomerForSession').mockResolvedValue({
      customer: {
        id: 'customer-1',
        kycStatus: 'not_started',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    });
    jest.spyOn(AnchorService as any, 'getQuoteForSession').mockResolvedValue({
      quote: {
        id: 'quote-1',
        fromAmount: '100.0000000',
        toAmount: '100.0000000',
      },
    });

    const result = await AnchorService.previewOffRampForSession({
      session_id: 'session-1',
      session_token: 'token-1',
      amount: '100',
      target_brl: '100',
      source_asset_code: 'XLM',
      amount_currency: 'XLM',
    });

    expect(StellarService.quotePathPayment).toHaveBeenCalledWith(expect.objectContaining({
      sourceAsset: expect.objectContaining({ code: 'XLM' }),
      destAmount: '100',
    }));
    expect(result.source_amount).toBe('18.5000000');
    expect(result.target_brl).toBe('100');
    expect(result.amount_tesouro).toBe('100.0000000');
  });

  it('rejects PIX target amount when the USDC transaction quote is unavailable', async () => {
    (StellarService as any).quotePathPayment.mockRejectedValue(
      new Error('strict-receive path quote unavailable')
    );
    jest.spyOn(AnchorService as any, 'createCustomerForSession').mockResolvedValue({
      customer: {
        id: 'customer-1',
        kycStatus: 'not_started',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    });
    jest.spyOn(AnchorService as any, 'getQuoteForSession').mockResolvedValue({
      quote: {
        id: 'quote-1',
        fromAmount: '100.0000000',
        toAmount: '100.0000000',
      },
    });

    await expect(AnchorService.previewOffRampForSession({
      session_id: 'session-1',
      session_token: 'token-1',
      amount: '100',
      target_brl: '100',
      source_asset_code: 'USDC',
      amount_currency: 'USDC',
    })).rejects.toThrow(/Não consegui encontrar uma rota segura/);
  });
});
