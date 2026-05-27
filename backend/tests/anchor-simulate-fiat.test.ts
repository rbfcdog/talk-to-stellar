import { AnchorService } from '../src/api/services/anchor.service';

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

  it('completes sandbox PIX in ledger mode when TESOURO distributor secret is not configured', async () => {
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
      toAmount: '43.2900000',
      finalAmount: '43.2900000',
      sandbox_ledger_settlement: true,
      auto_conversion: {
        status: 'completed',
        mode: 'sandbox_ledger_no_distributor',
        destination_asset_code: 'USDC',
      },
    });
  });
});
