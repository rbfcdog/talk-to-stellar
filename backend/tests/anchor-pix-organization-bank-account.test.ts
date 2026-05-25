import { AnchorService } from '../src/api/services/anchor.service';
import { PaymentReceiptService } from '../src/api/services/payment-receipt.service';

describe('AnchorService PIX organization bank account routing', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      STELLAR_NETWORK: 'TESTNET',
      ETHERFUSE_SANDBOX_PIX_FALLBACK: 'true',
    };
  });

  afterEach(() => {
    jest.restoreAllMocks();
    process.env = { ...originalEnv };
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

  it('uses the regional sandbox fallback when no active BRL PIX organization account exists', async () => {
    mockSandboxRuntime();

    const anchor = {
      getQuote: jest.fn().mockResolvedValue({
        id: 'quote-1',
        fromCurrency: 'BRL',
        toCurrency: 'TESOURO:GC3CW7EDYRTWQ635VDIGY6S4ZUF5L6TQ7AA4MWS7LEQDBLUSZXV7UPS4',
        fromAmount: '10',
        toAmount: '8.65',
        exchangeRate: '0.865',
        fee: '0.02',
        feeAmount: '0.02',
        feeBps: '20',
        provider: 'etherfuse',
      }),
      createOnRamp: jest.fn(),
      getFiatAccounts: jest.fn(),
      createBankAccountForCustomer: jest.fn(),
      createBankAccountWithPresignedUrl: jest.fn(),
    };

    jest.spyOn(AnchorService as any, 'getEtherfuseClient').mockReturnValue(anchor);
    jest.spyOn(AnchorService as any, 'getActiveEtherfuseOrganizationBankAccountId').mockResolvedValue(undefined);
    jest.spyOn(AnchorService as any, 'resolveSessionWallet').mockResolvedValue({
      sessionId: 'session-1',
      sessionToken: 'token-1',
      userId: 'user-1',
      email: 'user@example.com',
      publicKey: 'GBDE6FT6FN7AJOYQNR5EDHFN5PB45JDGF7VKFNZQ5AFEZV7TKVJSXN5',
      vaultSecretId: 'vault-1',
    });
    jest.spyOn(AnchorService as any, 'findActiveRampOperationByIntent').mockResolvedValue(null);
    jest.spyOn(AnchorService as any, 'ensureIssuedAssetTrustline').mockResolvedValue({
      success: true,
      existing: true,
      asset_code: 'TESOURO',
      asset_issuer: 'GC3CW7EDYRTWQ635VDIGY6S4ZUF5L6TQ7AA4MWS7LEQDBLUSZXV7UPS4',
    });
    jest.spyOn(AnchorService as any, 'persistRampOperation').mockResolvedValue('op-1');

    const result = await AnchorService.createOnRampForSession({
      session_id: 'session-1',
      session_token: 'token-1',
      customer_id: 'customer-1',
      amount: '10',
      final_asset: 'BRL',
    });

    expect(anchor.createOnRamp).not.toHaveBeenCalled();
    expect(anchor.getFiatAccounts).not.toHaveBeenCalled();
    expect(anchor.createBankAccountForCustomer).not.toHaveBeenCalled();
    expect(anchor.createBankAccountWithPresignedUrl).not.toHaveBeenCalled();
    expect(result.transaction.id).toMatch(/^sandbox-pix-/);
    expect(result.transaction).toMatchObject({
      sandbox_mock: true,
      fromAmount: '10',
      fromCurrency: 'BRL',
    });
  });

  it('keeps a dynamic PIX destination while ignoring local destination ids', async () => {
    mockSandboxRuntime();

    const anchor = {
      getFiatAccounts: jest.fn().mockResolvedValue([]),
      createBankAccountForCustomer: jest.fn().mockRejectedValue(new Error('unsupported in this sandbox')),
      createOffRamp: jest.fn(),
    };

    jest.spyOn(AnchorService as any, 'getEtherfuseClient').mockReturnValue(anchor);
    jest.spyOn(AnchorService as any, 'resolveSessionWallet').mockResolvedValue({
      sessionId: 'session-1',
      sessionToken: 'token-1',
      userId: 'user-1',
      email: 'user@example.com',
      publicKey: 'GBDE6FT6FN7AJOYQNR5EDHFN5PB45JDGF7VKFNZQ5AFEZV7TKVJSXN5',
      vaultSecretId: 'vault-1',
    });
    jest.spyOn(AnchorService as any, 'findActiveRampOperationByIntent').mockResolvedValue(null);
    jest.spyOn(AnchorService as any, 'persistRampOperation').mockResolvedValue('op-1');

    const result = await AnchorService.createOffRampForSession({
      session_id: 'session-1',
      session_token: 'token-1',
      customer_id: 'customer-1',
      quote_id: 'quote-1',
      amount: '48.6880919',
      source_amount: '10',
      source_asset_code: 'USDC',
      target_brl: '56.00',
      fiat_account_id: 'bank-4aaa8945',
      external_bank_account: {
        id: 'bank-4aaa8945',
        label: 'Seu PIX',
        institution: 'Destino PIX vinculado',
        pix_key: 'user@example.com',
      },
    });

    expect(anchor.getFiatAccounts).not.toHaveBeenCalled();
    expect(anchor.createBankAccountForCustomer).toHaveBeenCalledWith(
      'customer-1',
      expect.objectContaining({
        account: expect.objectContaining({
          pixKey: 'user@example.com',
          pixKeyType: 'email',
        }),
      }),
    );
    expect(anchor.createOffRamp).not.toHaveBeenCalled();
    expect(result.operation_id).toBe('op-1');
    expect(result.transaction.id).toMatch(/^sandbox-offramp-/);
    expect(result.transaction).toMatchObject({
      fromAmount: '48.6880919',
      toAmount: '56.00',
      toCurrency: 'BRL',
      fiatAccount: {
        label: 'PIX user@example.com',
      },
    });
    expect((result.transaction as any).sandbox_mock).toBe(true);
  });

  it('registers a dynamic PIX destination before creating a sandbox off-ramp', async () => {
    mockSandboxRuntime();

    const anchor = {
      getFiatAccounts: jest.fn(),
      createBankAccountForCustomer: jest.fn().mockResolvedValue({ bankAccountId: 'registered-pix-id' }),
      createOffRamp: jest.fn().mockResolvedValue({
        id: 'provider-offramp-1',
        status: 'pending',
        fromAmount: '48.6880919',
        fromCurrency: 'TESOURO',
        toAmount: '56.00',
        toCurrency: 'BRL',
        signableTransaction: 'mock-xdr',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }),
    };

    jest.spyOn(AnchorService as any, 'getEtherfuseClient').mockReturnValue(anchor);
    jest.spyOn(AnchorService as any, 'resolveSessionWallet').mockResolvedValue({
      sessionId: 'session-1',
      sessionToken: 'token-1',
      userId: 'user-1',
      email: 'user@example.com',
      publicKey: 'GBDE6FT6FN7AJOYQNR5EDHFN5PB45JDGF7VKFNZQ5AFEZV7TKVJSXN5',
      vaultSecretId: 'vault-1',
    });
    jest.spyOn(AnchorService as any, 'findActiveRampOperationByIntent').mockResolvedValue(null);
    jest.spyOn(AnchorService as any, 'persistRampOperation').mockResolvedValue('op-1');

    const result = await AnchorService.createOffRampForSession({
      session_id: 'session-1',
      session_token: 'token-1',
      customer_id: 'customer-1',
      quote_id: 'quote-1',
      amount: '48.6880919',
      source_amount: '10',
      source_asset_code: 'USDC',
      target_brl: '56.00',
      destination_pix_key: '5511999999999',
      pix_key_type: 'phone',
      fiat_account_id: 'pix-destination-local-id',
      external_bank_account: {
        id: 'pix-destination-local-id',
        label: 'PIX informado',
      },
    });

    expect(anchor.getFiatAccounts).not.toHaveBeenCalled();
    expect(anchor.createBankAccountForCustomer).toHaveBeenCalledWith(
      'customer-1',
      expect.objectContaining({
        account: expect.objectContaining({
          pixKey: '5511999999999',
          pixKeyType: 'phone',
        }),
      }),
    );
    expect(anchor.createOffRamp).toHaveBeenCalledWith(expect.objectContaining({
      customerId: 'customer-1',
      quoteId: 'quote-1',
      fiatAccountId: 'registered-pix-id',
    }));
    expect(result.operation_id).toBe('op-1');
    expect(result.transaction.id).toBe('provider-offramp-1');
  });

  it('does not open hosted onboarding or create a PIX bank account for regional sandbox customer setup', async () => {
    mockSandboxRuntime();

    const anchor = {
      createCustomer: jest.fn().mockResolvedValue({
        id: 'customer-1',
        email: 'user@example.com',
        country: 'BR',
        kycStatus: 'approved',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }),
      getOrganizationFiatAccounts: jest.fn().mockResolvedValue([
        {
          id: 'mxn-inactive',
          type: 'SPEI',
          currency: 'mxn',
          status: 'inactive',
          compliant: true,
        },
      ]),
      getKycUrl: jest.fn(),
      createBankAccountForCustomer: jest.fn(),
      createBankAccountWithPresignedUrl: jest.fn(),
    };

    jest.spyOn(AnchorService as any, 'getEtherfuseClient').mockReturnValue(anchor);
    jest.spyOn(AnchorService as any, 'resolveSessionWallet').mockResolvedValue({
      sessionId: 'session-1',
      sessionToken: 'token-1',
      userId: 'user-1',
      email: 'user@example.com',
      publicKey: 'GBDE6FT6FN7AJOYQNR5EDHFN5PB45JDGF7VKFNZQ5AFEZV7TKVJSXN5',
    });

    const result = await AnchorService.createCustomerForSession({
      session_id: 'session-1',
      session_token: 'token-1',
      email: 'user@example.com',
      country: 'BR',
    });

    expect(anchor.getKycUrl).not.toHaveBeenCalled();
    expect(anchor.createBankAccountForCustomer).not.toHaveBeenCalled();
    expect(anchor.createBankAccountWithPresignedUrl).not.toHaveBeenCalled();
    expect(result.programmatic_onboarding).toMatchObject({
      bank_account: {
        status: 'skipped',
        source: 'regional_sandbox_fallback',
      },
    });
  });

  it('does not send an intermediate PIX funding receipt when auto-pay will send the final receipt', async () => {
    const receiptSpy = jest.spyOn(PaymentReceiptService, 'sendReceipt').mockResolvedValue('https://example.test/receipt');

    const result = await (AnchorService as any).notifySandboxOnRampCompleted({
      transaction: {
        id: 'sandbox-pix-auto-pay',
        status: 'completed',
        fromAmount: '56',
        fromCurrency: 'BRL',
        toAmount: '10',
        toCurrency: 'USDC',
        updatedAt: new Date().toISOString(),
      },
      userId: 'user-1',
      sessionId: 'session-1',
      publicKey: 'GBDE6FT6FN7AJOYQNR5EDHFN5PB45JDGF7VKFNZQ5AFEZV7TKVJSXN5',
      sourceAmountBrl: '56',
      destinationAmount: '10',
      finalAssetCode: 'USDC',
      operationContext: {
        auto_pay_after_ramp: true,
        external_provider: 'whatsapp',
        external_provider_user_id: '5519997624114',
      },
    });

    expect(result).toBe('');
    expect(receiptSpy).not.toHaveBeenCalled();
  });
});
