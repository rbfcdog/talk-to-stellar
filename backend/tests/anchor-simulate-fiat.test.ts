import { AnchorService } from '../src/api/services/anchor.service';
import { StellarService } from '../src/api/services/stellar.service';
import { AgentRepository } from '../src/api/repository/core/agent.repository';
import { WalletRepository } from '../src/api/repository/core/wallet.repository';
import { OperationRepository } from '../src/api/repository/operation.repository';
import { PaymentReceiptService } from '../src/api/services/payment-receipt.service';
import VaultService from '../src/api/services/core/vault.service';

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
    delete process.env.ALLOW_SANDBOX_LEDGER_SETTLEMENT;
    delete process.env.TALKTOSTELLAR_FEE_TREASURY_PUBLIC_KEY;
    delete process.env.TALKTOSTELLAR_FEE_TREASURY_SECRET_KEY;
  });

  afterEach(() => {
    jest.restoreAllMocks();
    (AnchorService as any).sandboxMockOnRampOrders?.clear?.();
    (AnchorService as any).sandboxMockOffRampOrders?.clear?.();
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

  it('starts PIX-funded auto-pay on the backend after PIX confirmation', async () => {
    mockSandboxRuntime();
    mockSessionWallet();
    jest.spyOn(AnchorService as any, 'requireWalletPin').mockImplementation(() => undefined);
    const submitSpy = jest.spyOn(AnchorService, 'submitPixFundedTransferForSession').mockResolvedValue({
      success: true,
      transaction_hash: 'auto-pay-transfer-hash',
    } as any);
    jest.spyOn(AnchorService as any, 'deliverSandboxOnRamp').mockResolvedValue({
      transaction: {
        id: 'order-auto-pay',
        status: 'completed',
        toAmount: '100',
        toCurrency: 'USDC',
      },
      operationId: 'operation-auto-pay',
      finalAmount: '100',
      finalAssetCode: 'USDC',
      operationContext: {
        auto_pay_after_ramp: true,
        auto_pay_recipient: 'Ana Silva',
        auto_pay_amount: '100',
        auto_pay_asset_code: 'USDC',
        auto_pay_destination_asset_code: 'CETES',
        language: 'en',
        external_provider: 'whatsapp',
        external_provider_user_id: '5575496918127',
      },
      deliveryHash: 'pix-delivery-hash',
    });

    const result = await AnchorService.simulateFiatReceivedForSession({
      session_id: 'session-1',
      session_token: 'token-1',
      order_id: 'order-auto-pay',
      operation_id: 'operation-auto-pay',
      pin: '1234',
    });

    expect(result).toMatchObject({
      success: true,
      order_id: 'order-auto-pay',
      auto_pay_status: 'processing',
      delivery_hash: 'pix-delivery-hash',
      sandbox_mock: true,
    });
    expect(submitSpy).toHaveBeenCalledWith(expect.objectContaining({
      session_id: 'session-1',
      session_token: 'token-1',
      pin: '1234',
      amount: '100',
      asset_code: 'USDC',
      source_asset_code: 'USDC',
      destination_asset_code: 'CETES',
      recipient: 'Ana Silva',
      recipient_name: 'Ana Silva',
      order_id: 'order-auto-pay',
      operation_id: 'operation-auto-pay',
      language: 'en',
      provider: 'whatsapp',
      provider_user_id: '5575496918127',
    }));
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

  it('reuses the wallet secret by public key when a WhatsApp session is decoupled from the web wallet row', async () => {
    const whatsappSession = {
      session_id: 'whatsapp-session-1',
      session_token: 'token-1',
      user_id: 'user-1',
      email: 'user@example.com',
      public_key: 'GBDE6FT6FN7AJOYQNR5EDHFN5PB45JDGF7VKFNZQ5AFEZV7TKVJSXN5',
      last_activity: new Date().toISOString(),
    };
    jest.spyOn(AgentRepository.prototype, 'getSession').mockResolvedValue(whatsappSession as any);
    jest.spyOn(WalletRepository.prototype, 'getWalletBySession').mockResolvedValue(null);
    jest.spyOn(WalletRepository.prototype, 'getWalletByPublicKey').mockResolvedValue({
      session_id: 'web-session-1',
      public_key: whatsappSession.public_key,
      vault_secret_id: 'vault-from-web-wallet',
    } as any);
    const saveWalletSpy = jest.spyOn(WalletRepository.prototype, 'saveWallet').mockResolvedValue(undefined);

    const context = await (AnchorService as any).resolveSessionWallet({
      session_id: 'whatsapp-session-1',
      session_token: 'token-1',
      session_scope: 'whatsapp',
    });

    expect(context).toMatchObject({
      sessionId: 'whatsapp-session-1',
      userId: 'user-1',
      publicKey: whatsappSession.public_key,
      vaultSecretId: 'vault-from-web-wallet',
    });
    expect(saveWalletSpy).not.toHaveBeenCalled();
  });

  it('does not fake non-BRL final asset amounts in sandbox ledger mode', async () => {
    mockSandboxRuntime();
    process.env.ALLOW_SANDBOX_LEDGER_SETTLEMENT = 'true';
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

  it('does not complete BRL on-ramp without a TESOURO distributor by default', async () => {
    mockSandboxRuntime();
    const receiptSpy = jest.spyOn(PaymentReceiptService, 'sendReceipt').mockResolvedValue('https://talktostellar.com/receipt/should-not-send');
    const orderId = 'sandbox-pix-brl-no-distributor-default';

    (AnchorService as any).sandboxMockOnRampOrders.set(orderId, {
      transaction: {
        id: orderId,
        status: 'pending',
        fromAmount: '100.50',
        fromCurrency: 'BRL',
        toAmount: '100',
        toCurrency: 'TESOURO',
        stellarAddress: 'GBDE6FT6FN7AJOYQNR5EDHFN5PB45JDGF7VKFNZQ5AFEZV7TKVJSXN5',
        paymentInstructions: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        sandbox_mock: true,
      },
      userId: 'user-1',
      sessionId: 'session-1',
      publicKey: 'GBDE6FT6FN7AJOYQNR5EDHFN5PB45JDGF7VKFNZQ5AFEZV7TKVJSXN5',
      sourceAmountBrl: '100.50',
      destinationAmount: '100',
      finalAssetCode: 'TESOURO',
      finalAmount: '100',
      operationId: 'operation-brl-no-distributor-default',
    });

    const record = await (AnchorService as any).deliverSandboxOnRamp(orderId);

    expect(record.transaction.status).toBe('failed');
    expect(record.deliveryError).toContain('saldo real');
    expect((record.transaction as any).sandbox_ledger_settlement).toBeUndefined();
    expect(receiptSpy).not.toHaveBeenCalled();
  });

  it('completes BRL on-ramp in sandbox ledger mode when no distributor secret is configured', async () => {
    mockSandboxRuntime();
    process.env.ALLOW_SANDBOX_LEDGER_SETTLEMENT = 'true';
    jest.spyOn(StellarService, 'getAccountBalance').mockResolvedValue([] as any);
    const receiptSpy = jest.spyOn(PaymentReceiptService, 'sendReceipt').mockResolvedValue('https://talktostellar.com/receipt/brl-sandbox-ledger');
    const orderId = 'sandbox-pix-brl-no-distributor';

    (AnchorService as any).sandboxMockOnRampOrders.set(orderId, {
      transaction: {
        id: orderId,
        status: 'pending',
        fromAmount: '10.15',
        fromCurrency: 'BRL',
        toAmount: '10.07',
        toCurrency: 'TESOURO',
        stellarAddress: 'GBDE6FT6FN7AJOYQNR5EDHFN5PB45JDGF7VKFNZQ5AFEZV7TKVJSXN5',
        paymentInstructions: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        sandbox_mock: true,
      },
      userId: 'user-1',
      sessionId: 'session-1',
      publicKey: 'GBDE6FT6FN7AJOYQNR5EDHFN5PB45JDGF7VKFNZQ5AFEZV7TKVJSXN5',
      sourceAmountBrl: '10.15',
      destinationAmount: '10.07',
      finalAssetCode: 'TESOURO',
      finalAmount: '10.07',
    });

    const record = await (AnchorService as any).deliverSandboxOnRamp(orderId);

    expect(record.transaction.status).toBe('completed');
    expect(record.deliveryError).toBeUndefined();
    expect(record.deliveryHash).toMatch(/^sandbox-ledger-/);
    expect(record.finalAmount).toBe('10.0700000');
    expect((record.transaction as any).toAmount).toBe('10.0700000');
    expect((record.transaction as any).sandbox_ledger_settlement).toBe(true);
    expect((record.transaction as any).auto_conversion).toMatchObject({
      required: false,
      status: 'completed',
      destination_asset_code: 'TESOURO',
      destination_amount: '10.0700000',
      mode: 'sandbox_anchor_only',
    });
    expect(receiptSpy).toHaveBeenCalledWith(expect.objectContaining({
      destinationAmount: '10.0700000',
      destinationAssetCode: 'BRL',
      status: 'completed',
    }));
  });

  it('shows completed sandbox ledger BRL on-ramps in wallet balances', async () => {
    mockSandboxRuntime();
    process.env.ALLOW_SANDBOX_LEDGER_SETTLEMENT = 'true';
    jest.spyOn(AnchorService as any, 'resolveSessionWallet').mockResolvedValue({
      sessionId: 'session-1',
      sessionToken: 'token-1',
      userId: 'user-1',
      email: 'user@example.com',
      publicKey: 'GBDE6FT6FN7AJOYQNR5EDHFN5PB45JDGF7VKFNZQ5AFEZV7TKVJSXN5',
      vaultSecretId: 'vault-1',
      sessionPinHash: 'hash',
    });
    jest.spyOn(StellarService, 'ensureTestnetAccountFunded').mockResolvedValue(undefined as any);
    jest.spyOn(StellarService, 'getAccountBalance').mockResolvedValue([
      {
        asset_code: 'TESOURO',
        asset_issuer: 'GC3CW7EDYRTWQ635VDIGY6S4ZUF5L6TQ7AA4MWS7LEQDBLUSZXV7UPS4',
        balance: '0.0000000',
      },
    ] as any);
    jest.spyOn(OperationRepository, 'findByUserId').mockResolvedValue([
      {
        id: 'operation-sandbox-ledger-1',
        user_id: 'user-1',
        type: 'PIX_ONRAMP',
        status: 'COMPLETED',
        amount: 100.5,
        asset_code: 'TESOURO',
        source_session_id: 'session-1',
        source_public_key: 'GBDE6FT6FN7AJOYQNR5EDHFN5PB45JDGF7VKFNZQ5AFEZV7TKVJSXN5',
        context: JSON.stringify({
          sandbox_ledger_settlement: true,
          final_settlement_mode: 'sandbox_anchor_only',
          final_asset: 'TESOURO',
          final_amount: '100',
          destination_amount_anchor: '100',
        }),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      } as any,
    ]);

    const result = await AnchorService.getWalletBalancesForSession({
      session_id: 'session-1',
      session_token: 'token-1',
    });

    expect(result.balances).toContainEqual({
      asset_code: 'TESOURO',
      asset_issuer: 'GC3CW7EDYRTWQ635VDIGY6S4ZUF5L6TQ7AA4MWS7LEQDBLUSZXV7UPS4',
      balance: '100',
    });
  });

  it('does not expose sandbox ledger adjustments as balance unless explicitly enabled', async () => {
    mockSandboxRuntime();
    jest.spyOn(AnchorService as any, 'resolveSessionWallet').mockResolvedValue({
      sessionId: 'session-1',
      sessionToken: 'token-1',
      userId: 'user-1',
      email: 'user@example.com',
      publicKey: 'GBDE6FT6FN7AJOYQNR5EDHFN5PB45JDGF7VKFNZQ5AFEZV7TKVJSXN5',
      vaultSecretId: 'vault-1',
      sessionPinHash: 'hash',
    });
    jest.spyOn(StellarService, 'ensureTestnetAccountFunded').mockResolvedValue(undefined as any);
    jest.spyOn(StellarService, 'getAccountBalance').mockResolvedValue([
      {
        asset_code: 'TESOURO',
        asset_issuer: 'GC3CW7EDYRTWQ635VDIGY6S4ZUF5L6TQ7AA4MWS7LEQDBLUSZXV7UPS4',
        balance: '0.0000000',
      },
    ] as any);
    const operationSpy = jest.spyOn(OperationRepository, 'findByUserId').mockResolvedValue([
      {
        id: 'operation-hidden-sandbox-ledger',
        user_id: 'user-1',
        type: 'PIX_ONRAMP',
        status: 'COMPLETED',
        amount: 100.5,
        asset_code: 'TESOURO',
        source_session_id: 'session-1',
        source_public_key: 'GBDE6FT6FN7AJOYQNR5EDHFN5PB45JDGF7VKFNZQ5AFEZV7TKVJSXN5',
        context: JSON.stringify({
          sandbox_ledger_settlement: true,
          final_settlement_mode: 'sandbox_anchor_only',
          final_asset: 'TESOURO',
          final_amount: '100',
        }),
      } as any,
    ]);

    const result = await AnchorService.getWalletBalancesForSession({
      session_id: 'session-1',
      session_token: 'token-1',
    });

    expect(operationSpy).not.toHaveBeenCalled();
    expect(result.balances).toContainEqual({
      asset_code: 'TESOURO',
      asset_issuer: 'GC3CW7EDYRTWQ635VDIGY6S4ZUF5L6TQ7AA4MWS7LEQDBLUSZXV7UPS4',
      balance: '0',
    });
  });

  it('credits BRL on-ramp through the TESOURO distributor when configured', async () => {
    mockSandboxRuntime();
    process.env.TESOURO_DISTRIBUTOR_SECRET = 'SAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
    const receiptSpy = jest.spyOn(PaymentReceiptService, 'sendReceipt').mockResolvedValue('https://talktostellar.com/receipt/brl-pix');
    jest.spyOn(StellarService, 'getAccountBalance')
      .mockResolvedValueOnce([
        {
          asset_code: 'TESOURO',
          asset_issuer: 'GC3CW7EDYRTWQ635VDIGY6S4ZUF5L6TQ7AA4MWS7LEQDBLUSZXV7UPS4',
          balance: '0.0000000',
        },
      ] as any)
      .mockResolvedValueOnce([
        {
          asset_code: 'TESOURO',
          asset_issuer: 'GC3CW7EDYRTWQ635VDIGY6S4ZUF5L6TQ7AA4MWS7LEQDBLUSZXV7UPS4',
          balance: '0.0000000',
        },
      ] as any)
      .mockResolvedValueOnce([
        {
          asset_code: 'TESOURO',
          asset_issuer: 'GC3CW7EDYRTWQ635VDIGY6S4ZUF5L6TQ7AA4MWS7LEQDBLUSZXV7UPS4',
          balance: '0.0000000',
        },
      ] as any)
      .mockResolvedValueOnce([
        {
          asset_code: 'TESOURO',
          asset_issuer: 'GC3CW7EDYRTWQ635VDIGY6S4ZUF5L6TQ7AA4MWS7LEQDBLUSZXV7UPS4',
          balance: '0.0000000',
        },
      ] as any)
      .mockResolvedValue([
        {
          asset_code: 'TESOURO',
          asset_issuer: 'GC3CW7EDYRTWQ635VDIGY6S4ZUF5L6TQ7AA4MWS7LEQDBLUSZXV7UPS4',
          balance: '10.0700000',
        },
      ] as any);
    const paymentSpy = jest.spyOn(StellarService, 'submitAssetPaymentFromSecret').mockResolvedValue({
      success: true,
      hash: 'stellar-tesouro-delivery-hash',
    } as any);
    const orderId = 'sandbox-pix-brl-distributor';

    (AnchorService as any).sandboxMockOnRampOrders.set(orderId, {
      transaction: {
        id: orderId,
        status: 'pending',
        fromAmount: '10.15',
        fromCurrency: 'BRL',
        toAmount: '10.07',
        toCurrency: 'TESOURO',
        stellarAddress: 'GBDE6FT6FN7AJOYQNR5EDHFN5PB45JDGF7VKFNZQ5AFEZV7TKVJSXN5',
        paymentInstructions: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        sandbox_mock: true,
      },
      userId: 'user-1',
      sessionId: 'session-1',
      publicKey: 'GBDE6FT6FN7AJOYQNR5EDHFN5PB45JDGF7VKFNZQ5AFEZV7TKVJSXN5',
      sourceAmountBrl: '10.15',
      destinationAmount: '10.07',
      finalAssetCode: 'TESOURO',
      finalAmount: '10.07',
      operationId: 'operation-brl-distributor',
    });

    const record = await (AnchorService as any).deliverSandboxOnRamp(orderId);

    expect(record.transaction.status).toBe('completed');
    expect(record.deliveryHash).toBe('stellar-tesouro-delivery-hash');
    expect(record.finalAmount).toBe('10.0700000');
    expect((record.transaction as any).toAmount).toBe('10.0700000');
    expect(paymentSpy).toHaveBeenCalledWith(expect.objectContaining({
      sourceSecret: process.env.TESOURO_DISTRIBUTOR_SECRET,
      destination: 'GBDE6FT6FN7AJOYQNR5EDHFN5PB45JDGF7VKFNZQ5AFEZV7TKVJSXN5',
      amount: '10.0700000',
      assetCode: 'TESOURO',
      memoText: 'PIX ONRAMP SANDBOX',
    }));
    expect(receiptSpy).toHaveBeenCalledWith(expect.objectContaining({
      dedupeKey: 'pix-onramp:operation-brl-distributor',
    }));
  });

  it('sends the app fee to the admin treasury during sandbox BRL on-ramp settlement', async () => {
    mockSandboxRuntime();
    process.env.TESOURO_DISTRIBUTOR_SECRET = 'SAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
    process.env.TALKTOSTELLAR_FEE_TREASURY_PUBLIC_KEY = 'GAPPFEEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
    jest.spyOn(PaymentReceiptService, 'sendReceipt').mockResolvedValue('https://talktostellar.com/receipt/brl-pix-fee');
    jest.spyOn(OperationRepository, 'update').mockResolvedValue({} as any);
    jest.spyOn(StellarService, 'getAccountBalance')
      .mockResolvedValueOnce([
        {
          asset_code: 'TESOURO',
          asset_issuer: 'GC3CW7EDYRTWQ635VDIGY6S4ZUF5L6TQ7AA4MWS7LEQDBLUSZXV7UPS4',
          balance: '0.0000000',
        },
      ] as any)
      .mockResolvedValueOnce([
        {
          asset_code: 'TESOURO',
          asset_issuer: 'GC3CW7EDYRTWQ635VDIGY6S4ZUF5L6TQ7AA4MWS7LEQDBLUSZXV7UPS4',
          balance: '0.0000000',
        },
      ] as any)
      .mockResolvedValue([
        {
          asset_code: 'TESOURO',
          asset_issuer: 'GC3CW7EDYRTWQ635VDIGY6S4ZUF5L6TQ7AA4MWS7LEQDBLUSZXV7UPS4',
          balance: '100.0000000',
        },
      ] as any);
    const singlePaymentSpy = jest.spyOn(StellarService, 'submitAssetPaymentFromSecret');
    const multiPaymentSpy = jest.spyOn(StellarService, 'submitAssetPaymentsFromSecret').mockResolvedValue({
      success: true,
      hash: 'stellar-tesouro-delivery-fee-hash',
    } as any);
    const orderId = 'sandbox-pix-brl-distributor-fee';

    (AnchorService as any).sandboxMockOnRampOrders.set(orderId, {
      transaction: {
        id: orderId,
        status: 'pending',
        fromAmount: '100.50',
        fromCurrency: 'BRL',
        toAmount: '100',
        toCurrency: 'TESOURO',
        stellarAddress: 'GBDE6FT6FN7AJOYQNR5EDHFN5PB45JDGF7VKFNZQ5AFEZV7TKVJSXN5',
        paymentInstructions: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        sandbox_mock: true,
      },
      userId: 'user-1',
      sessionId: 'session-1',
      publicKey: 'GBDE6FT6FN7AJOYQNR5EDHFN5PB45JDGF7VKFNZQ5AFEZV7TKVJSXN5',
      sourceAmountBrl: '100.50',
      destinationAmount: '100',
      finalAssetCode: 'TESOURO',
      finalAmount: '100',
      operationId: 'operation-brl-distributor-fee',
      operationContext: {
        talktostellar_transaction_fee_amount: '0.30',
        talktostellar_transaction_fee_asset_code: 'TESOURO',
        talktostellar_transaction_fee_asset_issuer: 'GC3CW7EDYRTWQ635VDIGY6S4ZUF5L6TQ7AA4MWS7LEQDBLUSZXV7UPS4',
      },
    });

    const record = await (AnchorService as any).deliverSandboxOnRamp(orderId);

    expect(record.transaction.status).toBe('completed');
    expect(record.deliveryHash).toBe('stellar-tesouro-delivery-fee-hash');
    expect(singlePaymentSpy).not.toHaveBeenCalled();
    expect(multiPaymentSpy).toHaveBeenCalledWith(expect.objectContaining({
      sourceSecret: process.env.TESOURO_DISTRIBUTOR_SECRET,
      memoText: 'PIX ONRAMP SANDBOX',
      payments: [
        expect.objectContaining({
          destination: 'GBDE6FT6FN7AJOYQNR5EDHFN5PB45JDGF7VKFNZQ5AFEZV7TKVJSXN5',
          amount: '100.0000000',
          assetCode: 'TESOURO',
        }),
        expect.objectContaining({
          destination: process.env.TALKTOSTELLAR_FEE_TREASURY_PUBLIC_KEY,
          amount: '0.3000000',
          assetCode: 'TESOURO',
        }),
      ],
    }));
  });

  it('does not submit TESOURO delivery when the user wallet cannot be prepared to receive it', async () => {
    mockSandboxRuntime();
    process.env.TESOURO_DISTRIBUTOR_SECRET = 'SAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
    jest.spyOn(AnchorService as any, 'ensureIssuedAssetTrustline').mockResolvedValue({
      success: false,
      existing: false,
      asset_code: 'TESOURO',
      asset_issuer: 'GC3CW7EDYRTWQ635VDIGY6S4ZUF5L6TQ7AA4MWS7LEQDBLUSZXV7UPS4',
      error: 'missing vault secret',
    });
    const paymentSpy = jest.spyOn(StellarService, 'submitAssetPaymentFromSecret');
    const orderId = 'sandbox-pix-brl-trustline-failure';

    (AnchorService as any).sandboxMockOnRampOrders.set(orderId, {
      transaction: {
        id: orderId,
        status: 'pending',
        fromAmount: '100.50',
        fromCurrency: 'BRL',
        toAmount: '100',
        toCurrency: 'TESOURO',
        stellarAddress: 'GBDE6FT6FN7AJOYQNR5EDHFN5PB45JDGF7VKFNZQ5AFEZV7TKVJSXN5',
        paymentInstructions: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        sandbox_mock: true,
      },
      userId: 'user-1',
      sessionId: 'whatsapp-session-1',
      publicKey: 'GBDE6FT6FN7AJOYQNR5EDHFN5PB45JDGF7VKFNZQ5AFEZV7TKVJSXN5',
      sourceAmountBrl: '100.50',
      destinationAmount: '100',
      finalAssetCode: 'TESOURO',
      finalAmount: '100',
      operationId: 'operation-brl-trustline-failure',
    });

    const record = await (AnchorService as any).deliverSandboxOnRamp(orderId);

    expect(record.transaction.status).toBe('failed');
    expect(record.deliveryError).toContain('preparar sua conta para receber reais');
    expect(paymentSpy).not.toHaveBeenCalled();
  });

  it('does not complete BRL on-ramp when TESOURO submit succeeds but wallet balance does not change', async () => {
    mockSandboxRuntime();
    process.env.TESOURO_DISTRIBUTOR_SECRET = 'SAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
    process.env.SANDBOX_SETTLEMENT_BALANCE_POLL_MS = '0';
    const receiptSpy = jest.spyOn(PaymentReceiptService, 'sendReceipt').mockResolvedValue('https://talktostellar.com/receipt/should-not-send');
    jest.spyOn(StellarService, 'getAccountBalance').mockResolvedValue([
      {
        asset_code: 'TESOURO',
        asset_issuer: 'GC3CW7EDYRTWQ635VDIGY6S4ZUF5L6TQ7AA4MWS7LEQDBLUSZXV7UPS4',
        balance: '0.0000000',
      },
    ] as any);
    jest.spyOn(StellarService, 'submitAssetPaymentFromSecret').mockResolvedValue({
      success: true,
      hash: 'stellar-tesouro-delivery-hash',
    } as any);
    const orderId = 'sandbox-pix-brl-no-delta';

    (AnchorService as any).sandboxMockOnRampOrders.set(orderId, {
      transaction: {
        id: orderId,
        status: 'pending',
        fromAmount: '100.50',
        fromCurrency: 'BRL',
        toAmount: '100',
        toCurrency: 'TESOURO',
        stellarAddress: 'GBDE6FT6FN7AJOYQNR5EDHFN5PB45JDGF7VKFNZQ5AFEZV7TKVJSXN5',
        paymentInstructions: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        sandbox_mock: true,
      },
      userId: 'user-1',
      sessionId: 'session-1',
      publicKey: 'GBDE6FT6FN7AJOYQNR5EDHFN5PB45JDGF7VKFNZQ5AFEZV7TKVJSXN5',
      sourceAmountBrl: '100.50',
      destinationAmount: '100',
      finalAssetCode: 'TESOURO',
      finalAmount: '100',
      operationId: 'operation-brl-no-delta',
    });

    const record = await (AnchorService as any).deliverSandboxOnRamp(orderId);

    expect(record.transaction.status).toBe('failed');
    expect(record.deliveryError).toContain('wallet balance did not increase');
    expect(record.deliveryError).toContain('Detected delta: 0');
    expect(receiptSpy).not.toHaveBeenCalled();
  });

  it('registers sandbox off-ramp fallback orders so submitting debits the wallet', async () => {
    mockSandboxRuntime();
    const context = {
      sessionId: 'session-1',
      sessionToken: 'token-1',
      userId: 'user-1',
      email: 'user@example.com',
      publicKey: 'GBDE6FT6FN7AJOYQNR5EDHFN5PB45JDGF7VKFNZQ5AFEZV7TKVJSXN5',
      vaultSecretId: 'vault-1',
      sessionPinHash: 'hash',
    };
    const transaction = (AnchorService as any).createSandboxOffRampFallback({
      context,
      customerId: 'customer-1',
      quoteId: 'quote-1',
      amount: '2',
      sourceAmount: '2',
      sourceAssetCode: 'XLM',
      targetBrl: '5.00',
      destinationBrl: '5.00',
      externalBankAccount: { pix_key: '11999999999', pix_key_type: 'phone' },
    });
    const map = (AnchorService as any).sandboxMockOffRampOrders as Map<string, unknown>;
    expect(map.get(transaction.id)).toBeTruthy();

    jest.spyOn(StellarService, 'getAccountBalance')
      .mockResolvedValueOnce([
        { asset_type: 'native', balance: '10.0000000' },
      ] as any)
      .mockResolvedValue([
        { asset_type: 'native', balance: '8.0000000' },
      ] as any);
    jest.spyOn(AnchorService as any, 'ensureSandboxCollectorTrustline').mockResolvedValue({
      success: true,
      publicKey: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    });
    jest.spyOn(VaultService.prototype, 'getSecret').mockResolvedValue('SAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA');
    const paymentSpy = jest.spyOn(StellarService, 'submitAssetPaymentFromSecret').mockResolvedValue({
      success: true,
      hash: 'sandbox-offramp-hash',
    } as any);

    const result = await (AnchorService as any).submitSandboxOffRamp({
      context,
      orderId: transaction.id,
    });

    expect(result).toMatchObject({ success: true, hash: 'sandbox-offramp-hash', order_id: transaction.id });
    expect(paymentSpy).toHaveBeenCalledWith(expect.objectContaining({
      destination: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      amount: '2.0000000',
      assetCode: 'XLM',
      memoText: 'PIX OFFRAMP SANDBOX',
    }));
  });

  it('debits the gross BRL/TESOURO amount when an exact PIX receive amount has fees', async () => {
    mockSandboxRuntime();
    process.env.SANDBOX_SETTLEMENT_BALANCE_POLL_MS = '0';
    const tesouroIssuer = 'GC3CW7EDYRTWQ635VDIGY6S4ZUF5L6TQ7AA4MWS7LEQDBLUSZXV7UPS4';
    const context = {
      sessionId: 'session-1',
      sessionToken: 'token-1',
      userId: 'user-1',
      email: 'user@example.com',
      publicKey: 'GBDE6FT6FN7AJOYQNR5EDHFN5PB45JDGF7VKFNZQ5AFEZV7TKVJSXN5',
      vaultSecretId: 'vault-1',
      sessionPinHash: 'hash',
    };
    const transaction = (AnchorService as any).createSandboxOffRampFallback({
      context,
      customerId: 'customer-1',
      quoteId: 'quote-1',
      amount: '50.25',
      sourceAmount: '50.25',
      sourceAssetCode: 'TESOURO',
      sourceAssetIssuer: tesouroIssuer,
      targetBrl: '50.00',
      destinationBrl: '50.00',
      externalBankAccount: { pix_key: '11999999999', pix_key_type: 'phone' },
    });

    expect(transaction.fromAmount).toBe('50.2500000');
    expect(transaction.toAmount).toBe('50.00');

    jest.spyOn(StellarService, 'getAccountBalance')
      .mockResolvedValueOnce([
        { asset_type: 'credit_alphanum12', asset_code: 'TESOURO', asset_issuer: tesouroIssuer, balance: '100.0000000' },
      ] as any)
      .mockResolvedValue([
        { asset_type: 'credit_alphanum12', asset_code: 'TESOURO', asset_issuer: tesouroIssuer, balance: '49.7500000' },
      ] as any);
    jest.spyOn(AnchorService as any, 'ensureSandboxCollectorTrustline').mockResolvedValue({
      success: true,
      publicKey: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    });
    jest.spyOn(VaultService.prototype, 'getSecret').mockResolvedValue('SAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA');
    const paymentSpy = jest.spyOn(StellarService, 'submitAssetPaymentFromSecret').mockResolvedValue({
      success: true,
      hash: 'sandbox-offramp-brl-gross-hash',
    } as any);

    const result = await (AnchorService as any).submitSandboxOffRamp({
      context,
      orderId: transaction.id,
    });

    expect(result).toMatchObject({ success: true, hash: 'sandbox-offramp-brl-gross-hash', order_id: transaction.id });
    expect(paymentSpy).toHaveBeenCalledWith(expect.objectContaining({
      destination: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
      amount: '50.2500000',
      assetCode: 'TESOURO',
      assetIssuer: tesouroIssuer,
      memoText: 'PIX OFFRAMP SANDBOX',
    }));
  });

  it('splits sandbox off-ramp app fees into the admin treasury wallet', async () => {
    mockSandboxRuntime();
    process.env.SANDBOX_SETTLEMENT_BALANCE_POLL_MS = '0';
    process.env.TALKTOSTELLAR_FEE_TREASURY_PUBLIC_KEY = 'GAPPFEEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
    const tesouroIssuer = 'GC3CW7EDYRTWQ635VDIGY6S4ZUF5L6TQ7AA4MWS7LEQDBLUSZXV7UPS4';
    const context = {
      sessionId: 'session-1',
      sessionToken: 'token-1',
      userId: 'user-1',
      email: 'user@example.com',
      publicKey: 'GBDE6FT6FN7AJOYQNR5EDHFN5PB45JDGF7VKFNZQ5AFEZV7TKVJSXN5',
      vaultSecretId: 'vault-1',
      sessionPinHash: 'hash',
    };
    const transaction = (AnchorService as any).createSandboxOffRampFallback({
      context,
      customerId: 'customer-1',
      quoteId: 'quote-1',
      amount: '50.25',
      sourceAmount: '50.25',
      sourceAssetCode: 'TESOURO',
      sourceAssetIssuer: tesouroIssuer,
      targetBrl: '50.00',
      destinationBrl: '50.00',
      externalBankAccount: { pix_key: '11999999999', pix_key_type: 'phone' },
    });
    const map = (AnchorService as any).sandboxMockOffRampOrders as Map<string, any>;
    map.get(transaction.id).operationId = 'operation-offramp-admin-fee';

    jest.spyOn(OperationRepository, 'findById').mockResolvedValue({
      id: 'operation-offramp-admin-fee',
      context: JSON.stringify({
        talktostellar_transaction_fee_amount: '0.30',
        talktostellar_transaction_fee_asset_code: 'TESOURO',
        talktostellar_transaction_fee_asset_issuer: tesouroIssuer,
      }),
    } as any);
    jest.spyOn(OperationRepository, 'update').mockResolvedValue({} as any);
    jest.spyOn(StellarService, 'getAccountBalance')
      .mockResolvedValueOnce([
        { asset_type: 'credit_alphanum12', asset_code: 'TESOURO', asset_issuer: tesouroIssuer, balance: '100.0000000' },
      ] as any)
      .mockResolvedValue([
        { asset_type: 'credit_alphanum12', asset_code: 'TESOURO', asset_issuer: tesouroIssuer, balance: '49.7500000' },
      ] as any);
    jest.spyOn(AnchorService as any, 'ensureSandboxCollectorTrustline').mockResolvedValue({
      success: true,
      publicKey: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    });
    jest.spyOn(VaultService.prototype, 'getSecret').mockResolvedValue('SAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA');
    const singlePaymentSpy = jest.spyOn(StellarService, 'submitAssetPaymentFromSecret');
    const multiPaymentSpy = jest.spyOn(StellarService, 'submitAssetPaymentsFromSecret').mockResolvedValue({
      success: true,
      hash: 'sandbox-offramp-admin-fee-hash',
    } as any);

    const result = await (AnchorService as any).submitSandboxOffRamp({
      context,
      orderId: transaction.id,
    });

    expect(result).toMatchObject({ success: true, hash: 'sandbox-offramp-admin-fee-hash', order_id: transaction.id });
    expect(singlePaymentSpy).not.toHaveBeenCalled();
    expect(multiPaymentSpy).toHaveBeenCalledWith(expect.objectContaining({
      memoText: 'PIX OFFRAMP SANDBOX',
      payments: [
        expect.objectContaining({
          destination: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
          amount: '49.9500000',
          assetCode: 'TESOURO',
          assetIssuer: tesouroIssuer,
        }),
        expect.objectContaining({
          destination: process.env.TALKTOSTELLAR_FEE_TREASURY_PUBLIC_KEY,
          amount: '0.3000000',
          assetCode: 'TESOURO',
          assetIssuer: tesouroIssuer,
        }),
      ],
    }));
  });

  it('does not complete sandbox off-ramp when the submitted transfer does not debit the wallet', async () => {
    mockSandboxRuntime();
    process.env.SANDBOX_SETTLEMENT_BALANCE_POLL_MS = '0';
    const context = {
      sessionId: 'session-1',
      sessionToken: 'token-1',
      userId: 'user-1',
      email: 'user@example.com',
      publicKey: 'GBDE6FT6FN7AJOYQNR5EDHFN5PB45JDGF7VKFNZQ5AFEZV7TKVJSXN5',
      vaultSecretId: 'vault-1',
      sessionPinHash: 'hash',
    };
    const transaction = (AnchorService as any).createSandboxOffRampFallback({
      context,
      customerId: 'customer-1',
      quoteId: 'quote-1',
      amount: '2',
      sourceAmount: '2',
      sourceAssetCode: 'XLM',
      targetBrl: '5.00',
      destinationBrl: '5.00',
      externalBankAccount: { pix_key: '11999999999', pix_key_type: 'phone' },
    });

    jest.spyOn(StellarService, 'getAccountBalance').mockResolvedValue([
      { asset_type: 'native', balance: '10.0000000' },
    ] as any);
    jest.spyOn(AnchorService as any, 'ensureSandboxCollectorTrustline').mockResolvedValue({
      success: true,
      publicKey: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    });
    jest.spyOn(VaultService.prototype, 'getSecret').mockResolvedValue('SAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA');
    jest.spyOn(StellarService, 'submitAssetPaymentFromSecret').mockResolvedValue({
      success: true,
      hash: 'sandbox-offramp-no-delta-hash',
    } as any);

    const result = await (AnchorService as any).submitSandboxOffRamp({
      context,
      orderId: transaction.id,
      operationId: 'operation-offramp-no-delta',
    });

    expect(result).toMatchObject({
      success: false,
      order_id: transaction.id,
      hash: 'sandbox-offramp-no-delta-hash',
    });
    expect(result.error).toContain('wallet balance did not decrease');
    expect(result.error).toContain('Detected debit: 0');
  });

  it('does not complete sandbox off-ramp without a collector that can receive the debit', async () => {
    mockSandboxRuntime();
    const context = {
      sessionId: 'session-1',
      sessionToken: 'token-1',
      userId: 'user-1',
      email: 'user@example.com',
      publicKey: 'GBDE6FT6FN7AJOYQNR5EDHFN5PB45JDGF7VKFNZQ5AFEZV7TKVJSXN5',
      vaultSecretId: 'vault-1',
      sessionPinHash: 'hash',
    };
    const transaction = (AnchorService as any).createSandboxOffRampFallback({
      context,
      customerId: 'customer-1',
      quoteId: 'quote-1',
      amount: '2',
      sourceAmount: '2',
      sourceAssetCode: 'XLM',
      targetBrl: '5.00',
      destinationBrl: '5.00',
      externalBankAccount: { pix_key: '11999999999', pix_key_type: 'phone' },
    });

    jest.spyOn(StellarService, 'getAccountBalance').mockResolvedValue([
      { asset_type: 'native', balance: '10.0000000' },
    ] as any);
    jest.spyOn(AnchorService as any, 'ensureSandboxCollectorTrustline').mockResolvedValue({
      success: false,
      publicKey: '',
      error: 'collector unavailable',
    });
    const paymentSpy = jest.spyOn(StellarService, 'submitAssetPaymentFromSecret');

    const result = await (AnchorService as any).submitSandboxOffRamp({
      context,
      orderId: transaction.id,
      operationId: 'operation-offramp-no-collector',
    });

    expect(result).toMatchObject({
      success: false,
      order_id: transaction.id,
    });
    expect(result.error).toContain('collector unavailable');
    expect(result.error).toContain('refusing to mark PIX off-ramp as completed without a real balance movement');
    expect(paymentSpy).not.toHaveBeenCalled();
  });

  it('sends a WhatsApp callback receipt when non-BRL on-ramp settlement is still processing', async () => {
    const receiptSpy = jest.spyOn(PaymentReceiptService, 'sendReceipt').mockResolvedValue('https://talktostellar.com/receipt/xlm-pix');
    const result = await (AnchorService as any).notifySandboxOnRampCompleted({
      transaction: {
        id: 'sandbox-pix-xlm-processing',
        status: 'completed',
        fromAmount: '7.32',
        fromCurrency: 'BRL',
        toAmount: '',
        toCurrency: 'XLM',
        updatedAt: new Date().toISOString(),
        auto_conversion: {
          required: true,
          status: 'pending',
          destination_asset_code: 'XLM',
        },
      },
      userId: 'user-1',
      sessionId: 'session-1',
      publicKey: 'GBDE6FT6FN7AJOYQNR5EDHFN5PB45JDGF7VKFNZQ5AFEZV7TKVJSXN5',
      sourceAmountBrl: '7.32',
      destinationAmount: '7.28',
      finalAssetCode: 'XLM',
      desiredFinalAmount: '10',
      desiredFinalAssetCode: 'XLM',
      operationContext: {
        external_provider: 'whatsapp',
        external_provider_user_id: '+5519997624114',
        provider_onramp_fee_amount: '0.02',
        talktostellar_transaction_fee_amount: '0.03',
        total_fee_amount: '0.05',
      },
    }, 'sandbox-ledger-xlm-processing');

    expect(result).toBe('https://talktostellar.com/receipt/xlm-pix');
    expect(receiptSpy).toHaveBeenCalledWith(expect.objectContaining({
      type: 'payment_received',
      provider: 'whatsapp',
      providerUserId: '+5519997624114',
      sourceAmount: '7.32',
      sourceAssetCode: 'BRL',
      destinationAmount: '10',
      destinationAssetCode: 'XLM',
      status: 'processing',
      externalDeliveryText: expect.stringContaining('PIX confirmado com sucesso.'),
    }));
    const receiptInput = receiptSpy.mock.calls[0][0] as any;
    expect(receiptInput.externalDeliveryText).toContain('Status: conversão para XLM em andamento');
    expect(receiptInput.externalDeliveryText).toContain('Valor alvo: 10 XLM');
  });

  it('keeps English on PIX on-ramp callback receipts from operation context', async () => {
    const receiptSpy = jest.spyOn(PaymentReceiptService, 'sendReceipt').mockResolvedValue('https://talktostellar.com/receipt/xlm-pix-en');
    const result = await (AnchorService as any).notifySandboxOnRampCompleted({
      transaction: {
        id: 'sandbox-pix-xlm-processing-en',
        status: 'completed',
        fromAmount: '7.32',
        fromCurrency: 'BRL',
        toAmount: '',
        toCurrency: 'XLM',
        updatedAt: new Date().toISOString(),
        auto_conversion: {
          required: true,
          status: 'pending',
          destination_asset_code: 'XLM',
        },
      },
      userId: 'user-1',
      sessionId: 'session-1',
      publicKey: 'GBDE6FT6FN7AJOYQNR5EDHFN5PB45JDGF7VKFNZQ5AFEZV7TKVJSXN5',
      sourceAmountBrl: '7.32',
      destinationAmount: '7.28',
      finalAssetCode: 'XLM',
      desiredFinalAmount: '10',
      desiredFinalAssetCode: 'XLM',
      operationContext: {
        language: 'en',
        external_provider: 'whatsapp',
        external_provider_user_id: '+5519997624114',
      },
    }, 'sandbox-ledger-xlm-processing-en');

    expect(result).toBe('https://talktostellar.com/receipt/xlm-pix-en');
    expect(receiptSpy).toHaveBeenCalledWith(expect.objectContaining({
      language: 'en',
      quote: expect.objectContaining({ language: 'en' }),
      externalDeliveryText: expect.stringContaining('PIX confirmed successfully.'),
    }));
    const receiptInput = receiptSpy.mock.calls[0][0] as any;
    expect(receiptInput.externalDeliveryText).toContain('Target amount: 10 XLM');
    expect(receiptInput.externalDeliveryText).toContain('Status: conversion to XLM in progress');
    expect(receiptInput.externalDeliveryText).not.toContain('Valor alvo');
  });

  it('announces post-PIX conversion progress first and sends a separate conversion receipt when it finishes', async () => {
    const receiptSpy = jest.spyOn(PaymentReceiptService, 'sendReceipt')
      .mockResolvedValueOnce('https://talktostellar.com/receipt/pix-progress')
      .mockResolvedValueOnce('https://talktostellar.com/receipt/conversion-complete');

    const record: any = {
      transaction: {
        id: 'sandbox-pix-xlm-usdc',
        status: 'completed',
        fromAmount: '159.11',
        fromCurrency: 'BRL',
        toAmount: '100',
        toCurrency: 'XLM',
        updatedAt: new Date().toISOString(),
        post_conversion: {
          required: true,
          status: 'pending',
          source_asset_code: 'XLM',
          source_amount: '100',
          destination_asset_code: 'USDC',
          destination_asset_issuer: usdcIssuer,
        },
      },
      userId: 'user-1',
      sessionId: 'session-1',
      publicKey: 'GBDE6FT6FN7AJOYQNR5EDHFN5PB45JDGF7VKFNZQ5AFEZV7TKVJSXN5',
      sourceAmountBrl: '159.11',
      destinationAmount: '100',
      finalAssetCode: 'XLM',
      finalAmount: '100',
      postConversionAssetCode: 'USDC',
      postConversionAssetIssuer: usdcIssuer,
      operationContext: {
        external_provider: 'whatsapp',
        external_provider_user_id: '+5519997624114',
      },
    };

    const pixReceipt = await (AnchorService as any).notifySandboxOnRampCompleted(record, 'sandbox-xlm-hash');

    expect(pixReceipt).toBe('https://talktostellar.com/receipt/pix-progress');
    expect(receiptSpy).toHaveBeenCalledTimes(1);
    expect(receiptSpy.mock.calls[0][0]).toMatchObject({
      type: 'payment_received',
      destinationAmount: '100',
      destinationAssetCode: 'XLM',
      status: 'processing',
    });
    expect(receiptSpy.mock.calls[0][0].externalDeliveryText).toContain('Valor recebido agora: 100 XLM');
    expect(receiptSpy.mock.calls[0][0].externalDeliveryText).toContain('Conversão em andamento: 100 XLM para USDC');
    expect(receiptSpy.mock.calls[0][0].externalDeliveryText).toContain('vou mandar outro comprovante');

    record.postConversionHash = 'sandbox-xlm-usdc-hash';
    record.postConversionSourceAmount = '100';
    record.postConversionAmount = '65';
    record.transaction.post_conversion = {
      required: true,
      status: 'completed',
      source_asset_code: 'XLM',
      source_amount: '100',
      destination_asset_code: 'USDC',
      destination_asset_issuer: usdcIssuer,
      destination_amount: '65',
      hash: 'sandbox-xlm-usdc-hash',
    };

    const conversionReceipt = await (AnchorService as any).sendSandboxPostConversionReceipt(record);

    expect(conversionReceipt).toBe('https://talktostellar.com/receipt/conversion-complete');
    expect(receiptSpy).toHaveBeenCalledTimes(2);
    expect(receiptSpy.mock.calls[1][0]).toMatchObject({
      type: 'conversion',
      sourceAmount: '100',
      sourceAssetCode: 'XLM',
      destinationAmount: '65',
      destinationAssetCode: 'USDC',
      hash: 'sandbox-xlm-usdc-hash',
      status: 'completed',
    });
    expect(receiptSpy.mock.calls[1][0].externalDeliveryText).toContain('Conversão final depois do PIX concluída.');
    expect(receiptSpy.mock.calls[1][0].externalDeliveryText).toContain('Convertido: 100 XLM');
    expect(receiptSpy.mock.calls[1][0].externalDeliveryText).toContain('Recebido final: US$ 65.00');
  });

  it('finishes pending sandbox post-PIX conversion while polling on-ramp status', async () => {
    const record: any = {
      transaction: {
        id: 'sandbox-pix-xlm-usdc',
        status: 'completed',
        fromAmount: '158.47',
        fromCurrency: 'BRL',
        toAmount: '100',
        toCurrency: 'XLM',
        stellarAddress: 'GBDE6FT6FN7AJOYQNR5EDHFN5PB45JDGF7VKFNZQ5AFEZV7TKVJSXN5',
        paymentInstructions: {},
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        sandbox_mock: true,
        post_conversion: {
          required: true,
          status: 'pending',
          source_asset_code: 'XLM',
          source_amount: '100',
          destination_asset_code: 'USDC',
          destination_asset_issuer: usdcIssuer,
        },
      },
      userId: 'user-1',
      sessionId: 'session-1',
      publicKey: 'GBDE6FT6FN7AJOYQNR5EDHFN5PB45JDGF7VKFNZQ5AFEZV7TKVJSXN5',
      vaultSecretId: 'vault-1',
      sourceAmountBrl: '158.47',
      destinationAmount: '100',
      finalAssetCode: 'XLM',
      finalAmount: '100',
      postConversionAssetCode: 'USDC',
      postConversionAssetIssuer: usdcIssuer,
      operationId: 'op-1',
      operationContext: {
        post_conversion_status: 'pending',
        post_conversion_source_asset_code: 'XLM',
        post_conversion_source_amount: '100',
        post_conversion_asset_code: 'USDC',
        post_conversion_asset_issuer: usdcIssuer,
      },
    };

    jest.spyOn(AnchorService as any, 'hydrateSandboxOnRampFromOperation').mockResolvedValue(record);
    jest.spyOn(AnchorService as any, 'updateRampOperationStatus').mockResolvedValue(undefined);
    jest.spyOn(AnchorService as any, 'ensureIssuedAssetTrustline').mockResolvedValue({
      success: true,
      existing: true,
      asset_code: 'USDC',
      asset_issuer: usdcIssuer,
    });
    jest.spyOn(VaultService.prototype, 'getSecret').mockResolvedValue('SAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA');
    jest.spyOn(OperationRepository, 'update').mockResolvedValue({} as any);
    const conversionSpy = jest.spyOn(StellarService, 'submitStrictSendPaymentFromSecret').mockResolvedValue({
      success: true,
      hash: 'sandbox-xlm-usdc-hash',
      destinationAmount: '65.4321',
    } as any);
    const receiptSpy = jest.spyOn(PaymentReceiptService, 'sendReceipt')
      .mockResolvedValue('https://talktostellar.com/receipt/conversion-complete');

    const result = await AnchorService.getOnRampStatus('sandbox-pix-xlm-usdc', 'op-1');

    expect(conversionSpy).toHaveBeenCalledWith(expect.objectContaining({
      sourceAsset: { code: 'XLM', issuer: undefined },
      sourceAmount: '100.0000000',
      destinationAsset: { code: 'USDC', issuer: usdcIssuer },
      memoText: 'PIX POST CONVERT',
    }));
    expect((result.transaction as any).post_conversion).toMatchObject({
      status: 'completed',
      source_asset_code: 'XLM',
      source_amount: '100.0000000',
      destination_asset_code: 'USDC',
      destination_amount: '65.4321000',
      hash: 'sandbox-xlm-usdc-hash',
    });
    expect(result.transaction.toAmount).toBe('65.4321000');
    expect(result.transaction.toCurrency).toBe(`USDC:${usdcIssuer}`);
    expect((result.transaction as any).receipt_url).toBe('https://talktostellar.com/receipt/conversion-complete');
    expect(receiptSpy).toHaveBeenCalledWith(expect.objectContaining({
      type: 'conversion',
      sourceAmount: '100.0000000',
      sourceAssetCode: 'XLM',
      destinationAmount: '65.4321000',
      destinationAssetCode: 'USDC',
      hash: 'sandbox-xlm-usdc-hash',
      status: 'completed',
    }));
  });
});
