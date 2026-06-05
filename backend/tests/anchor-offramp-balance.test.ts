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
    process.env.ETHERFUSE_ONRAMP_FEE_BPS = '20';
    process.env.TALKTOSTELLAR_SPREAD_BPS = '30';
    process.env.TALKTOSTELLAR_SPREAD_MIN_BRL = '0.05';
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

  it('accepts BRL withdrawals when the wallet balance is held in the TESOURO settlement asset', async () => {
    const tesouroIssuer = 'GC3CW7EDYRTWQ635VDIGY6S4ZUF5L6TQ7AA4MWS7LEQDBLUSZXV7UPS4';
    (StellarService.getAccountBalance as jest.Mock)
      .mockResolvedValueOnce([
        {
          asset_type: 'credit_alphanum12',
          asset_code: 'TESOURO',
          asset_issuer: tesouroIssuer,
          balance: '100.0000000',
        },
      ])
      .mockResolvedValue([
        {
          asset_type: 'credit_alphanum12',
          asset_code: 'TESOURO',
          asset_issuer: tesouroIssuer,
          balance: '49.7500000',
        },
      ]);
    jest.spyOn(AnchorService as any, 'createCustomerForSession').mockResolvedValue({
      customer: {
        id: 'customer-brl',
        kycStatus: 'not_started',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    });
    const quoteSpy = jest.spyOn(AnchorService as any, 'getQuoteForSession').mockResolvedValue({
      quote: {
        id: 'quote-brl',
        fromAmount: '50.2500000',
        toAmount: '50.0000000',
      },
    });
    const createSpy = jest.spyOn(AnchorService as any, 'createOffRampForSession').mockResolvedValue({
      transaction: {
        id: 'sandbox-offramp-brl',
        customerId: 'customer-brl',
        quoteId: 'quote-brl',
        status: 'pending',
        fromAmount: '50.2500000',
        fromCurrency: 'TESOURO',
        toAmount: '50.0000000',
        toCurrency: 'BRL',
        stellarAddress: 'GBDE6FT6FN7AJOYQNR5EDHFN5PB45JDGF7VKFNZQ5AFEZV7TKVJSXN5',
        signableTransaction: '',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      operation_id: 'op-brl',
    });
    jest.spyOn(AnchorService as any, 'getOffRampStatus')
      .mockResolvedValueOnce({
        ready_to_sign: true,
        transaction: {
          id: 'sandbox-offramp-brl',
          status: 'pending',
        },
      })
      .mockResolvedValue({
        ready_to_sign: true,
        transaction: {
          id: 'sandbox-offramp-brl',
          status: 'completed',
        },
      });
    const submitSpy = jest.spyOn(AnchorService as any, 'submitOffRampForSession').mockResolvedValue({
      success: true,
      hash: 'sandbox-offramp-brl-hash',
      order_id: 'sandbox-offramp-brl',
    });

    const result = await AnchorService.runTemporarySandboxOffRampTest({
      session_id: 'session-1',
      session_token: 'token-1',
      pin: '1234',
      amount: '50.00',
      target_brl: '50.00',
      source_asset_code: 'BRL',
      amount_currency: 'BRL',
      pix_key: 'user@example.com',
    });

    expect(result.source_amount).toBe('50.25');
    expect(result.source_asset_code).toBe('TESOURO');
    expect(result.target_brl).toBe('50.00');
    expect(result.amount_tesouro).toBe('50.25');
    expect(result.submitted).toBe(true);
    expect(result.balance_delta).toEqual([
      expect.objectContaining({
        asset_code: 'TESOURO',
        before: '100.0000000',
        after: '49.7500000',
        delta: '-50.25',
      }),
    ]);
    expect(quoteSpy).toHaveBeenCalledWith(expect.objectContaining({
      direction: 'offramp',
      amount: '50.25',
      from_currency: expect.stringContaining('TESOURO'),
      to_currency: 'BRL',
    }));
    expect(createSpy).toHaveBeenCalledWith(expect.objectContaining({
      amount: '50.25',
      source_amount: '50.25',
      source_asset_code: 'TESOURO',
      target_brl: '50.00',
      force_sandbox_mock: true,
    }));
    expect(submitSpy).toHaveBeenCalledWith(expect.objectContaining({
      order_id: 'sandbox-offramp-brl',
      pin: '1234',
    }));
  });

  it('does not report off-ramp success when the debit submission fails', async () => {
    const tesouroIssuer = 'GC3CW7EDYRTWQ635VDIGY6S4ZUF5L6TQ7AA4MWS7LEQDBLUSZXV7UPS4';
    (StellarService.getAccountBalance as jest.Mock).mockResolvedValue([
      {
        asset_type: 'credit_alphanum12',
        asset_code: 'TESOURO',
        asset_issuer: tesouroIssuer,
        balance: '100.0000000',
      },
    ]);
    jest.spyOn(AnchorService as any, 'createCustomerForSession').mockResolvedValue({
      customer: {
        id: 'customer-brl',
        kycStatus: 'not_started',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    });
    jest.spyOn(AnchorService as any, 'getQuoteForSession').mockResolvedValue({
      quote: {
        id: 'quote-brl',
        fromAmount: '50.2500000',
        toAmount: '50.0000000',
      },
    });
    jest.spyOn(AnchorService as any, 'createOffRampForSession').mockResolvedValue({
      transaction: {
        id: 'sandbox-offramp-brl',
        customerId: 'customer-brl',
        quoteId: 'quote-brl',
        status: 'pending',
        fromAmount: '50.2500000',
        fromCurrency: 'TESOURO',
        toAmount: '50.0000000',
        toCurrency: 'BRL',
        stellarAddress: 'GBDE6FT6FN7AJOYQNR5EDHFN5PB45JDGF7VKFNZQ5AFEZV7TKVJSXN5',
        signableTransaction: '',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      operation_id: 'op-brl',
    });
    jest.spyOn(AnchorService as any, 'getOffRampStatus').mockResolvedValue({
      ready_to_sign: true,
      transaction: {
        id: 'sandbox-offramp-brl',
        status: 'pending',
      },
    });
    jest.spyOn(AnchorService as any, 'submitOffRampForSession').mockResolvedValue({
      success: false,
      error: 'Sandbox PIX settlement is not configured in this test environment.',
      order_id: 'sandbox-offramp-brl',
    });

    await expect(AnchorService.runTemporarySandboxOffRampTest({
      session_id: 'session-1',
      session_token: 'token-1',
      pin: '1234',
      amount: '50.00',
      target_brl: '50.00',
      source_asset_code: 'BRL',
      amount_currency: 'BRL',
      pix_key: 'user@example.com',
    })).rejects.toThrow(/Sandbox PIX settlement is not configured/);
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
