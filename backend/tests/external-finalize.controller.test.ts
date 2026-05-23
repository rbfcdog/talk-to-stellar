const { Keypair } = require('@stellar/stellar-sdk');

const testKeypair = Keypair.random();
const testPublicKey = testKeypair.publicKey();
const testSecretKey = testKeypair.secret();

const finalizeSaveSessionMock = jest.fn();
const finalizeSaveMessageMock = jest.fn();
const finalizeSaveWalletMock = jest.fn();
const finalizeLinkSessionMock = jest.fn();
const finalizeStoreSecretMock = jest.fn();
const finalizeGetSessionMock = jest.fn();
const finalizeGetWalletBySessionMock = jest.fn();
const finalizeGetWalletByPublicKeyMock = jest.fn();
const finalizeFindByOwnerIdMock = jest.fn();
const finalizeFindByNameForOwnerMock = jest.fn();
const finalizeFindByProviderAndIdMock = jest.fn();
const finalizeCreateMappingMock = jest.fn();
const finalizeGetSecretMock = jest.fn();
const finalizeBuildPaymentXdrMock = jest.fn();
const finalizeBuildPathPaymentXdrMock = jest.fn();
const finalizeQuotePathPaymentMock = jest.fn();
const finalizeBuildTrustlineXdrMock = jest.fn();
const finalizeGetAccountBalanceMock = jest.fn();
const finalizeLoadAccountMock = jest.fn();
const finalizeSignAndSubmitXdrMock = jest.fn();
const finalizeGetSubmittedPaymentDetailsMock = jest.fn();
const finalizeCreateTestAccountMock = jest.fn();
const finalizeEnsureTestnetAccountFundedMock = jest.fn();
const finalizeCreateDefaultTrustlinesMock = jest.fn();
const finalizeEnsureStarterContactsForUserMock = jest.fn();
const finalizeSupabaseFromMock = jest.fn();
const testnetUsdcIssuer = 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';

jest.mock('../src/config/supabase', () => ({
  supabase: {
    from: (...args: any[]) => finalizeSupabaseFromMock(...args),
  },
}));

jest.mock('../src/api/services/email-confirmation.service', () => {
  class EmailConfirmationError extends Error {
    code: string;
    statusCode: number;

    constructor(code: string, message: string, statusCode = 400) {
      super(message);
      this.code = code;
      this.statusCode = statusCode;
    }
  }

  return {
    EmailConfirmationError,
    EmailConfirmationService: {
      requireVerified: jest.fn(async ({ email }: { email?: string }) => ({
        verified: true,
        email: email || '',
        maskedEmail: email || '',
        message: 'verified',
      })),
      maskEmail: jest.fn((email: string) => email),
    },
  };
});

jest.mock('../src/services/vault.service', () => ({
  VaultService: jest.fn().mockImplementation(() => ({
    storeSecret: finalizeStoreSecretMock,
    getSecret: finalizeGetSecretMock,
  })),
}));

jest.mock('../src/api/services/stellar.service', () => ({
  StellarService: {
    createTestAccount: finalizeCreateTestAccountMock,
    generateStellarKeypair: jest.fn(() => ({
      publicKey: testPublicKey,
      secret: testSecretKey,
    })),
    ensureTestnetAccountFunded: finalizeEnsureTestnetAccountFundedMock,
    buildPaymentXdr: finalizeBuildPaymentXdrMock,
    buildPathPaymentXdr: finalizeBuildPathPaymentXdrMock,
    quotePathPayment: finalizeQuotePathPaymentMock,
    buildTrustlineXdr: finalizeBuildTrustlineXdrMock,
    getAccountBalance: finalizeGetAccountBalanceMock,
    loadAccount: finalizeLoadAccountMock,
    signAndSubmitXdr: finalizeSignAndSubmitXdrMock,
    getSubmittedPaymentDetails: finalizeGetSubmittedPaymentDetailsMock,
  },
}));

jest.mock('../src/api/services/contact-seed.service', () => ({
  ContactSeedService: {
    derivePixKey: jest.fn((userId: string) => `${String(userId).replace(/[^a-z0-9]/gi, '.').toLowerCase()}.test@talktostellar`),
    createDefaultTrustlines: finalizeCreateDefaultTrustlinesMock,
    ensureStarterContactsForUser: finalizeEnsureStarterContactsForUserMock,
  },
  repairLegacyStarterContactKey: jest.fn((publicKey: string) => publicKey),
  STARTER_CONTACTS: [],
}));

jest.mock('../src/api/services/activity-feed.service', () => ({
  ActivityFeedService: {
    syncFromPayments: jest.fn(async () => undefined),
  },
}));

jest.mock('../src/api/services/economy-engine.service', () => ({
  EconomyEngineService: {
    estimateAmountInBrl: jest.fn(() => '10.00000000'),
    effectiveCostFromQuote: jest.fn(() => '0.01000000'),
    calculateForSettledOperation: jest.fn(() => ({
      estimated_savings: '0.01000000',
      savings_percentage: '1.0000',
      comparison_method: 'test',
    })),
    calculateMonthly: jest.fn(async () => ({
      savings: {
        estimatedSavings: 0.01,
        estimatedTraditionalFee: 0.02,
        actualFee: 0.01,
        savingsPercentage: 50,
        comparisonMethod: 'test',
      },
      message: 'test',
    })),
    comparisonMethod: jest.fn(() => 'test'),
  },
}));

jest.mock('../src/api/services/global-profile.service', () => ({
  GlobalProfileService: {
    ensureForUser: jest.fn(async () => undefined),
  },
}));

jest.mock('../src/api/services/payment-receipt.service', () => ({
  PaymentReceiptService: {
    buildHostedReceiptUrl: jest.fn((hash: string) => `https://app.example.com/receipt/${hash}`),
    buildReceiptImageSvg: jest.fn(async () => '<svg></svg>'),
    sendReceipt: jest.fn(async () => ({ delivered: false })),
  },
}));

jest.mock('../src/api/services/platform-fee.service', () => ({
  PlatformFeeService: {
    calculateSpread: jest.fn(() => ({
      feeAmount: '0',
      feeAssetCode: 'XLM',
      comparisonMethod: 'test',
    })),
  },
}));

jest.mock('../src/api/services/transfer-notification.service', () => ({
  TransferNotificationService: {
    notifySessionWelcome: jest.fn(async () => undefined),
  },
}));

jest.mock('../src/repositories/agent.repository', () => ({
  AgentRepository: jest.fn().mockImplementation(() => ({
    saveSession: finalizeSaveSessionMock,
    saveMessage: finalizeSaveMessageMock,
    getSession: finalizeGetSessionMock,
  })),
}));

jest.mock('../src/repositories/wallet.repository', () => ({
  WalletRepository: jest.fn().mockImplementation(() => ({
    saveWallet: finalizeSaveWalletMock,
    getWalletBySession: finalizeGetWalletBySessionMock,
    getWalletByPublicKey: finalizeGetWalletByPublicKeyMock,
  })),
}));

jest.mock('../src/repositories/external.repository', () => ({
  normalizeExternalProvider: jest.fn((provider: string) => String(provider || '').trim().toLowerCase()),
  normalizeExternalProviderUserId: jest.fn((_provider: string, providerUserId: string) => String(providerUserId || '').trim()),
  externalProviderAliases: jest.fn((provider: string) => [String(provider || '').trim().toLowerCase()]),
  isPhoneProvider: jest.fn((provider: string) => ['whatsapp', 'phone'].includes(String(provider || '').trim().toLowerCase())),
  ExternalRepository: jest.fn().mockImplementation(() => ({
    linkSession: finalizeLinkSessionMock,
    findByProviderAndId: finalizeFindByProviderAndIdMock,
    createMapping: finalizeCreateMappingMock,
  })),
}));

jest.mock('../src/api/repository/contact.repository', () => ({
  ContactRepository: {
    findByOwnerId: finalizeFindByOwnerIdMock,
    findByNameForOwner: finalizeFindByNameForOwnerMock,
  },
}));

jest.mock('jsonwebtoken', () => ({
  verify: jest.fn(() => ({ provider: 'telegram', provider_user_id: '123456' })),
}));

describe('ExternalFinalizeController', () => {
  beforeEach(() => {
    finalizeSaveSessionMock.mockReset();
    finalizeSaveMessageMock.mockReset();
    finalizeSaveWalletMock.mockReset();
    finalizeLinkSessionMock.mockReset();
    finalizeStoreSecretMock.mockReset();
    finalizeGetSessionMock.mockReset();
    finalizeGetWalletBySessionMock.mockReset();
    finalizeGetWalletByPublicKeyMock.mockReset();
    finalizeFindByOwnerIdMock.mockReset();
    finalizeFindByNameForOwnerMock.mockReset();
    finalizeFindByProviderAndIdMock.mockReset();
    finalizeCreateMappingMock.mockReset();
    finalizeGetSecretMock.mockReset();
    finalizeBuildPaymentXdrMock.mockReset();
    finalizeBuildPathPaymentXdrMock.mockReset();
    finalizeQuotePathPaymentMock.mockReset();
    finalizeBuildTrustlineXdrMock.mockReset();
    finalizeGetAccountBalanceMock.mockReset();
    finalizeLoadAccountMock.mockReset();
    finalizeSignAndSubmitXdrMock.mockReset();
    finalizeGetSubmittedPaymentDetailsMock.mockReset();
    finalizeCreateTestAccountMock.mockReset();
    finalizeEnsureTestnetAccountFundedMock.mockReset();
    finalizeCreateDefaultTrustlinesMock.mockReset();
    finalizeEnsureStarterContactsForUserMock.mockReset();
    finalizeSupabaseFromMock.mockReset();
    const { PaymentReceiptService } = require('../src/api/services/payment-receipt.service');
    PaymentReceiptService.sendReceipt.mockClear();
    PaymentReceiptService.buildReceiptImageSvg.mockClear();
    PaymentReceiptService.buildHostedReceiptUrl.mockClear();
    finalizeSaveSessionMock.mockResolvedValue(undefined);
    finalizeSaveMessageMock.mockResolvedValue(undefined);
    finalizeSaveWalletMock.mockResolvedValue(undefined);
    finalizeLinkSessionMock.mockResolvedValue(undefined);
    finalizeStoreSecretMock.mockResolvedValue('vault-secret-id-1');
    finalizeGetSecretMock.mockResolvedValue(testSecretKey);
    finalizeBuildPaymentXdrMock.mockResolvedValue('unsigned-xdr');
    finalizeBuildPathPaymentXdrMock.mockResolvedValue('path-xdr');
    finalizeQuotePathPaymentMock.mockResolvedValue({
      sourceAsset: { code: 'XLM' },
      destinationAsset: { code: 'USDC', issuer: testPublicKey },
      destinationAmount: '10',
      sourceAmount: '11.2',
      sourceMax: '11.4',
      networkFeeXlm: '0.001',
      path: [],
    });
    finalizeBuildTrustlineXdrMock.mockResolvedValue('trustline-xdr');
    finalizeGetAccountBalanceMock.mockResolvedValue([]);
    finalizeLoadAccountMock.mockResolvedValue({ balances: [] });
    finalizeSignAndSubmitXdrMock.mockResolvedValue({ success: true, hash: 'tx-123' });
    finalizeGetSubmittedPaymentDetailsMock.mockResolvedValue({
      sourceAmount: '11.9234567',
      sourceAssetCode: 'XLM',
      destinationAmount: '10.0000000',
      destinationAssetCode: 'USDC',
      feeXlm: '0.0000100',
    });
    finalizeCreateTestAccountMock.mockResolvedValue({
      publicKey: testPublicKey,
      secret: testSecretKey,
    });
    finalizeEnsureTestnetAccountFundedMock.mockResolvedValue(undefined);
    finalizeCreateDefaultTrustlinesMock.mockResolvedValue({ success: true, assets: ['USDC'], errors: [] });
    finalizeEnsureStarterContactsForUserMock.mockResolvedValue({ created: 0, updated: 0, skipped: 0, errors: [] });
    finalizeGetWalletByPublicKeyMock.mockResolvedValue(null);
    finalizeFindByProviderAndIdMock.mockResolvedValue(null);
    finalizeCreateMappingMock.mockResolvedValue(undefined);
    finalizeSupabaseFromMock.mockImplementation((table: string) => createSupabaseChain(table));
  });

  it('creates session, wallet and links the external account', async () => {
    const { default: ExternalFinalizeController } = await import(
      '../src/api/controllers/external-finalize.controller'
    );

    const req = {
      body: {
        token: 'signed-token',
        name: 'User Example',
        email: 'user@example.com',
        pin: '1234',
      },
    } as any;

    const res = createResponse();

    await ExternalFinalizeController.finalize(req, res);

    expect(finalizeSaveSessionMock).toHaveBeenCalledTimes(1);
    expect(finalizeSaveWalletMock).toHaveBeenCalledTimes(1);
    expect(finalizeCreateMappingMock).toHaveBeenCalledTimes(1);
    expect(finalizeStoreSecretMock).toHaveBeenCalledTimes(1);
    expect(finalizeCreateTestAccountMock).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        sessionId: expect.any(String),
        sessionToken: expect.any(String),
        userId: 'user@example.com',
      })
    );
  });

  it('confirms USDC payment with XLM source path payment', async () => {
    const crypto = require('crypto');
    const jwt = require('jsonwebtoken');
    const { default: ExternalFinalizeController } = await import(
      '../src/api/controllers/external-finalize.controller'
    );

    process.env.USDC_ISSUER = testPublicKey;
    const pin = '1234';
    const pinHash = crypto
      .pbkdf2Sync(pin, process.env.PIN_SALT || 'salt', 100000, 64, 'sha256')
      .toString('hex');

    jwt.verify.mockReturnValueOnce({
      sub: 'external_payment_confirm',
      amount: '10',
      asset_code: 'USDC',
      destination: testPublicKey,
      destination_name: 'Ana Silva',
      session_id: 'session-1',
      owner_id: 'user@example.com',
    });

    finalizeGetWalletBySessionMock.mockResolvedValue({
      session_id: 'session-1',
      public_key: testPublicKey,
      vault_secret_id: 'source-secret-id',
    });
    finalizeGetSessionMock.mockResolvedValue({
      user_id: 'user@example.com',
      session_password_hash: pinHash,
      last_activity: new Date().toISOString(),
    });
    finalizeGetAccountBalanceMock.mockResolvedValue([
      { asset_code: 'USDC', asset_issuer: testPublicKey, balance: '0' },
    ]);
    finalizeLoadAccountMock.mockResolvedValue({
      balances: [
        { asset_type: 'native', balance: '100.0000000' },
        { asset_type: 'credit_alphanum4', asset_code: 'USDC', asset_issuer: testPublicKey, balance: '0.0000000' },
      ],
    });

    const req = {
      body: {
        token: 'payment-token',
        pin,
        provider: 'whatsapp',
        provider_user_id: '5519981808102',
      },
    } as any;
    const res = createResponse();

    await ExternalFinalizeController.finalize(req, res);
    const { PaymentReceiptService } = require('../src/api/services/payment-receipt.service');

    expect(finalizeBuildPaymentXdrMock).not.toHaveBeenCalled();
    expect(finalizeBuildPathPaymentXdrMock).toHaveBeenCalledWith(
      expect.objectContaining({
        sourcePublicKey: testPublicKey,
        destination: testPublicKey,
        destAsset: { code: 'USDC', issuer: testPublicKey },
        destAmount: '10',
        sourceAsset: { code: 'XLM' },
      })
    );
    expect(finalizeSignAndSubmitXdrMock).toHaveBeenCalledWith(
      'user@example.com',
      testSecretKey,
      'path-xdr',
      expect.objectContaining({
        type: 'PATH_PAYMENT_STRICT_RECEIVE',
        asset_code: 'USDC',
        amount: 10,
      })
    );
    expect(PaymentReceiptService.sendReceipt).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'whatsapp',
        providerUserId: '5519981808102',
      })
    );
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        transferDetails: expect.objectContaining({
          destinationAmount: '10.0000000',
          destinationAssetCode: 'USDC',
          sourceAmount: '11.9234567',
          sourceAssetCode: 'XLM',
          feeXlm: '0.0000100',
          exact: true,
        }),
      })
    );
  });

  it('uses official testnet USDC issuer when env is not set', async () => {
    const crypto = require('crypto');
    const jwt = require('jsonwebtoken');
    const { default: ExternalFinalizeController } = await import(
      '../src/api/controllers/external-finalize.controller'
    );

    delete process.env.USDC_ISSUER;
    process.env.STELLAR_NETWORK = 'TESTNET';
    const pin = '1234';
    const pinHash = crypto
      .pbkdf2Sync(pin, process.env.PIN_SALT || 'salt', 100000, 64, 'sha256')
      .toString('hex');

    jwt.verify.mockReturnValueOnce({
      sub: 'external_payment_confirm',
      amount: '10',
      asset_code: 'USDC',
      destination: testPublicKey,
      destination_name: 'Ana Silva',
      session_id: 'session-1',
      owner_id: 'user@example.com',
    });

    finalizeGetWalletBySessionMock.mockResolvedValue({
      session_id: 'session-1',
      public_key: testPublicKey,
      vault_secret_id: 'source-secret-id',
    });
    finalizeGetSessionMock.mockResolvedValue({
      user_id: 'user@example.com',
      session_password_hash: pinHash,
      last_activity: new Date().toISOString(),
    });
    finalizeGetAccountBalanceMock.mockResolvedValue([
      { asset_code: 'USDC', asset_issuer: testnetUsdcIssuer, balance: '0' },
    ]);
    finalizeLoadAccountMock.mockResolvedValue({
      balances: [
        { asset_type: 'native', balance: '100.0000000' },
        { asset_type: 'credit_alphanum4', asset_code: 'USDC', asset_issuer: testnetUsdcIssuer, balance: '0.0000000' },
      ],
    });

    const req = {
      body: {
        token: 'payment-token',
        pin,
      },
    } as any;
    const res = createResponse();

    await ExternalFinalizeController.finalize(req, res);

    expect(finalizeBuildPathPaymentXdrMock).toHaveBeenCalledWith(
      expect.objectContaining({
        destAsset: { code: 'USDC', issuer: testnetUsdcIssuer },
      })
    );
    expect(res.status).toHaveBeenCalledWith(200);
  });

});

function createResponse() {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

function createSupabaseChain(table: string) {
  const chain: any = {};
  let updated = false;

  chain.select = jest.fn().mockReturnValue(chain);
  chain.eq = jest.fn().mockReturnValue(chain);
  chain.in = jest.fn().mockReturnValue(chain);
  chain.limit = jest.fn().mockReturnValue(chain);
  chain.order = jest.fn().mockReturnValue(chain);
  chain.update = jest.fn(() => {
    updated = true;
    return chain;
  });
  chain.insert = jest.fn().mockReturnValue(chain);
  chain.upsert = jest.fn().mockReturnValue(chain);
  chain.single = jest.fn(async () => ({
    data: table === 'onboarding_finalizations' ? { id: 'onboarding-finalization-1' } : null,
    error: null,
  }));
  chain.maybeSingle = jest.fn(async () => {
    if (table === 'payment_confirmations') {
      return {
        data: {
          id: 'payment-confirmation-1',
          used: false,
          used_at: null,
          status: updated ? 'processing' : 'pending',
        },
        error: null,
      };
    }
    return { data: null, error: null };
  });
  chain.then = (resolve: any, reject: any) =>
    Promise.resolve({
      data: table === 'payment_confirmations' ? [{ id: 'payment-confirmation-1' }] : null,
      error: null,
    }).then(resolve, reject);

  return chain;
}
