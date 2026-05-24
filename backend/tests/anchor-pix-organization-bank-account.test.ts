import { AnchorService } from '../src/api/services/anchor.service';

describe('AnchorService PIX organization bank account routing', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  function mockSandboxRuntime() {
    jest.spyOn(AnchorService as any, 'getRuntimeInfo').mockReturnValue({
      sandbox: true,
      provider: 'etherfuse',
      network: 'Stellar Testnet',
      base_url: 'https://api.sand.etherfuse.com',
      stellar_network_id: 'TESTNET',
      asset: {
        code: 'TESOURO',
        issuer: 'GC3CW7EDYRTWQ635VDIGY6S4ZUF5L6TQ7AA4MWS7LEQDBLUSZXV7UPS4',
        identifier: 'TESOURO',
      },
    });
  }

  it('prefers an active BRL PIX organization account for on-ramp orders', async () => {
    const anchor = {
      getOrganizationFiatAccounts: jest.fn().mockResolvedValue([
        {
          id: 'spei-mxn',
          type: 'SPEI',
          currency: 'MXN',
          status: 'active',
          compliant: true,
        },
        {
          id: 'pix-brl',
          type: 'PIX',
          currency: 'BRL',
          status: 'active',
          compliant: true,
        },
      ]),
    };

    jest.spyOn(AnchorService as any, 'getEtherfuseClient').mockReturnValue(anchor);

    await expect((AnchorService as any).getActiveEtherfuseOrganizationBankAccountId()).resolves.toBe('pix-brl');
  });

  it('skips unsupported customer PIX account registration when using an organization account', async () => {
    mockSandboxRuntime();

    const anchor = {
      registerCustomerWallet: jest.fn().mockResolvedValue({ walletId: 'customer-wallet' }),
      registerOrganizationWallet: jest.fn().mockResolvedValue({ walletId: 'organization-wallet' }),
      submitKycIdentity: jest.fn().mockResolvedValue({ status: 'approved' }),
      submitKycDocuments: jest.fn().mockResolvedValue({ status: 'approved' }),
      createBankAccountForCustomer: jest.fn(),
      createBankAccountWithPresignedUrl: jest.fn(),
    };

    jest.spyOn(AnchorService as any, 'getEtherfuseClient').mockReturnValue(anchor);

    const result = await (AnchorService as any).runSandboxProgrammaticOnboarding({
      customerId: 'customer-org-bank-test',
      publicKey: 'GBDE6FT6FN7AJOYQNR5EDHFN5PB45JDGF7VKFNZQ5AFEZV7TKVJSXN5',
      bankAccountId: 'pix-brl',
      email: 'user@example.com',
      skipBankAccount: true,
    });

    expect(anchor.createBankAccountForCustomer).not.toHaveBeenCalled();
    expect(anchor.createBankAccountWithPresignedUrl).not.toHaveBeenCalled();
    expect(result).toMatchObject({
      bankAccountId: 'pix-brl',
      cryptoWalletId: 'organization-wallet',
      steps: {
        bank_account: {
          status: 'active',
          bankAccountId: 'pix-brl',
          source: 'organization_account',
        },
      },
    });
  });
});
