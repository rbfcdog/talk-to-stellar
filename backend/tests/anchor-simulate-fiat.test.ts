import { AnchorService } from '../src/api/services/anchor.service';
import { StellarService } from '../src/api/services/stellar.service';
import { AgentRepository } from '../src/api/repository/core/agent.repository';
import { WalletRepository } from '../src/api/repository/core/wallet.repository';

describe('AnchorService sandbox PIX confirmation', () => {
  const originalEnv = { ...process.env };
  const usdcIssuer = 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      STELLAR_NETWORK: 'TESTNET',
      ETHERFUSE_SANDBOX_PIX_FALLBACK: 'true',
      USDC_ISSUER: usdcIssuer,
    };
    delete process.env.TESOURO_DISTRIBUTOR_SECRET;
  });

  afterEach(() => {
    jest.restoreAllMocks();
    (AnchorService as any).sandboxMockOnRampOrders?.clear?.();
    process.env = { ...originalEnv };
  });

  function mockSandboxRuntime() {
    jest.spyOn(AnchorService as any, 'getRuntimeInfo').mockReturnValue({
      sandbox: true,
      provider: 'etherfuse',
      network: 'Stellar Testnet',
      base_url: 'https://api.sand.etherfuse.com',
      stellar_network_id: 'TESTNET',
      asset: { code: 'TESOURO', issuer: 'GC3CW7EDYRTWQ635VDIGY6S4ZUF5L6TQ7AA4MWS7LEQDBLUSZXV7UPS4', identifier: 'TESOURO' },
    });
  }

  function mockSessionWallet() {
    jest.spyOn(AnchorService as any, 'resolveSessionWallet').mockResolvedValue({
      sessionId: 'session-1',
      sessionToken: 'token-1',
      userId: 'user-1',
      email: 'user@example.com',
      publicKey: 'GBDE6FT6FN7AJOYQNR5EDHFN5PB45JDGF7VKFNZQ5AFEZV7TKVJSXN5',
      vaultSecretId: 'vault-1',
      sessionPinHash: 'hash',
    });
  }

  it('requires the wallet PIN for user-triggered PIX confirmation', async () => {
    mockSandboxRuntime();
    mockSessionWallet();

    await expect(AnchorService.simulateFiatReceivedForSession({
      session_id: 'session-1',
      session_token: 'token-1',
      order_id: 'order-1',
    })).rejects.toMatchObject({ code: 'missing_pin' });
  });

  it('keeps trusted internal simulation usable for debug helpers', async () => {
    mockSandboxRuntime();
    mockSessionWallet();
    const pinSpy = jest.spyOn(AnchorService as any, 'requireWalletPin');
    jest.spyOn(AnchorService as any, 'deliverSandboxOnRamp').mockResolvedValue({
      transaction: {
        id: 'order-1',
        status: 'completed',
      },
      deliveryHash: 'stellar-hash-1',
    });

    const result = await AnchorService.simulateFiatReceivedForSession({
      session_id: 'session-1',
      session_token: 'token-1',
      order_id: 'order-1',
      trusted_internal: true,
    });

    expect(pinSpy).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      success: true,
      order_id: 'order-1',
      delivery_hash: 'stellar-hash-1',
      sandbox_mock: true,
    });
  });

  it('grosses up BRL PIX funding when the requested BRL delivery amount is exact', () => {
    process.env.ETHERFUSE_ONRAMP_FEE_BPS = '20';
    process.env.TALKTOSTELLAR_SPREAD_BPS = '30';
    process.env.TALKTOSTELLAR_SPREAD_MIN_BRL = '0.05';

    const feeBridge = (AnchorService as any).estimateOnRampBrlFeeBridge('100', null, '100');

    expect(feeBridge).toEqual({
      grossAmount: '100.50',
      netAmount: '100',
      providerFeeAmount: '0.2',
      talkToStellarFeeAmount: '0.3',
      totalFeeAmount: '0.5',
    });
  });

  it('keeps total BRL on-ramp fees on quotes that convert into non-BRL assets', () => {
    process.env.ETHERFUSE_ONRAMP_FEE_BPS = '20';
    process.env.TALKTOSTELLAR_SPREAD_BPS = '30';
    process.env.TALKTOSTELLAR_SPREAD_MIN_BRL = '0.05';

    const decorated = (AnchorService as any).decorateOnRampQuoteForFinalAsset({
      quote: {
        id: 'quote-xlm',
        fromAmount: '100',
        fromCurrency: 'BRL',
        toAmount: '99.5',
        toCurrency: 'TESOURO',
        feeBps: '20',
      },
      sourceAmountBrl: '100',
      finalAsset: { code: 'XLM' },
    });

    expect(decorated).toMatchObject({
      finalConversionRequired: true,
      finalConversionSourceAmount: '99.5',
      userFacingToCurrency: 'XLM',
      anchorProviderFeeAmount: '0.2',
      talkToStellarFeeAmount: '0.3',
      totalFeeAmount: '0.5',
      totalFeeCurrency: 'BRL',
    });
  });

  it('calculates the BRL PIX gross amount required for an exact non-BRL final asset', async () => {
    process.env.ETHERFUSE_ONRAMP_FEE_BPS = '20';
    process.env.TALKTOSTELLAR_SPREAD_BPS = '30';
    process.env.TALKTOSTELLAR_SPREAD_MIN_BRL = '0.05';

    jest.spyOn(StellarService, 'quotePathPayment').mockResolvedValue({
      sourceAsset: { code: 'TESOURO', issuer: 'issuer-tesouro' },
      destinationAsset: { code: 'XLM' },
      destinationAmount: '100',
      sourceAmount: '250',
      sourceMax: '255',
      pathSourceAmount: '250',
      pathSourceMax: '255',
      path: [],
      networkFeeXlm: '0.00001',
      platformFee: { enabled: false, feeAmount: '0', feeAssetCode: 'TESOURO', feeBps: 0 },
    } as any);

    const plan = await (AnchorService as any).resolveOnRampSourceAmountForExactFinalAsset({
      publicKey: 'GBDE6FT6FN7AJOYQNR5EDHFN5PB45JDGF7VKFNZQ5AFEZV7TKVJSXN5',
      finalAsset: { code: 'XLM' },
      desiredFinalAmount: '100',
      desiredFinalAssetCode: 'XLM',
      sourceAmountBrl: '100',
    });

    expect(plan).toMatchObject({
      sourceAmountBrl: '251.25',
      finalConversionSourceAmount: '250',
    });
    expect(StellarService.quotePathPayment).toHaveBeenCalledWith(expect.objectContaining({
      sourceAsset: expect.objectContaining({ code: 'TESOURO' }),
      destAsset: { code: 'XLM' },
      destAmount: '100',
    }));
  });

  it('refreshes an expired WhatsApp-scoped ramp session when the token is valid', async () => {
    const expiredSession = {
      session_id: 'session-1',
      session_token: 'token-1',
      user_id: 'user-1',
      email: 'user@example.com',
      public_key: 'GBDE6FT6FN7AJOYQNR5EDHFN5PB45JDGF7VKFNZQ5AFEZV7TKVJSXN5',
      last_activity: '2020-01-01T00:00:00.000Z',
    };
    const refreshedSession = {
      ...expiredSession,
      last_activity: new Date().toISOString(),
    };
    const getSessionSpy = jest.spyOn(AgentRepository.prototype, 'getSession')
      .mockResolvedValueOnce(expiredSession as any)
      .mockResolvedValueOnce(refreshedSession as any);
    const saveSessionSpy = jest.spyOn(AgentRepository.prototype, 'saveSession').mockResolvedValue(undefined);
    jest.spyOn(WalletRepository.prototype, 'getWalletBySession').mockResolvedValue({
      session_id: 'session-1',
      public_key: expiredSession.public_key,
      vault_secret_id: 'vault-1',
    } as any);

    const context = await (AnchorService as any).resolveSessionWallet({
      session_id: 'session-1',
      session_token: 'token-1',
      session_scope: 'whatsapp',
    });

    expect(context).toMatchObject({
      sessionId: 'session-1',
      sessionToken: 'token-1',
      userId: 'user-1',
      publicKey: expiredSession.public_key,
    });
    expect(saveSessionSpy).toHaveBeenCalledWith('session-1', expect.objectContaining({
      session_token: 'token-1',
    }));
    expect(getSessionSpy).toHaveBeenCalledTimes(2);
  });

  it('does not fake non-BRL final asset amounts in sandbox ledger mode', async () => {
    mockSandboxRuntime();
    jest.spyOn(AnchorService as any, 'notifySandboxOnRampCompleted').mockResolvedValue('');
    const orderId = 'sandbox-pix-ledger-test';

    (AnchorService as any).sandboxMockOnRampOrders.set(orderId, {
      transaction: {
        id: orderId,
        status: 'pending',
        fromAmount: '50',
        fromCurrency: 'BRL',
        toAmount: '',
        toCurrency: `USDC:${usdcIssuer}`,
        stellarAddress: 'GBDE6FT6FN7AJOYQNR5EDHFN5PB45JDGF7VKFNZQ5AFEZV7TKVJSXN5',
        paymentInstructions: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        sandbox_mock: true,
      },
      userId: 'user-1',
      sessionId: 'session-1',
      publicKey: 'GBDE6FT6FN7AJOYQNR5EDHFN5PB45JDGF7VKFNZQ5AFEZV7TKVJSXN5',
      sourceAmountBrl: '50',
      destinationAmount: '43.29',
      finalAssetCode: 'USDC',
      finalAssetIssuer: usdcIssuer,
    });

    const record = await (AnchorService as any).deliverSandboxOnRamp(orderId);

    expect(record.transaction.status).toBe('completed');
    expect(record.deliveryHash).toMatch(/^sandbox-ledger-/);
    expect(record.transaction).toMatchObject({
      sandbox_ledger_settlement: true,
      auto_conversion: {
        status: 'pending',
        mode: 'sandbox_anchor_only',
        destination_asset_code: 'USDC',
      },
    });
    expect((record.transaction as any).toAmount).toBe('');
    expect((record.transaction as any).finalAmount).toBeUndefined();
    expect((record.transaction as any).auto_conversion.destination_amount).toBeUndefined();
  });
});
