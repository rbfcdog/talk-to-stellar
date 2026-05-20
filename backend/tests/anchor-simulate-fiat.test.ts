import { AnchorService } from '../src/api/services/anchor.service';

describe('AnchorService sandbox PIX confirmation', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  function mockSandboxRuntime() {
    jest.spyOn(AnchorService as any, 'getRuntimeInfo').mockReturnValue({
      sandbox: true,
      provider: 'etherfuse',
      network: 'Stellar Testnet',
      base_url: 'https://api.sand.etherfuse.com',
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
    })).rejects.toThrow(/PIN da wallet/i);
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
});
