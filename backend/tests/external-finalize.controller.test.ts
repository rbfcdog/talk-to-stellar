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
const finalizeSignAndSubmitXdrMock = jest.fn();
const finalizeGetSubmittedPaymentDetailsMock = jest.fn();
const finalizeCreateDefaultTrustlinesMock = jest.fn();
const finalizeEnsureStarterContactsForUserMock = jest.fn();
const testnetUsdcIssuer = 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';

jest.mock('../src/services/vault.service', () => ({
  VaultService: jest.fn().mockImplementation(() => ({
    storeSecret: finalizeStoreSecretMock,
    getSecret: finalizeGetSecretMock,
  })),
}));

jest.mock('../src/api/services/stellar.service', () => ({
  StellarService: {
    createTestAccount: jest.fn(async () => ({
      publicKey: testPublicKey,
      secret: testSecretKey,
    })),
    generateStellarKeypair: jest.fn(() => ({
      publicKey: testPublicKey,
      secret: testSecretKey,
    })),
    buildPaymentXdr: finalizeBuildPaymentXdrMock,
    buildPathPaymentXdr: finalizeBuildPathPaymentXdrMock,
    quotePathPayment: finalizeQuotePathPaymentMock,
    buildTrustlineXdr: finalizeBuildTrustlineXdrMock,
    getAccountBalance: finalizeGetAccountBalanceMock,
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
    finalizeSignAndSubmitXdrMock.mockReset();
    finalizeGetSubmittedPaymentDetailsMock.mockReset();
    finalizeCreateDefaultTrustlinesMock.mockReset();
    finalizeEnsureStarterContactsForUserMock.mockReset();
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
    finalizeSignAndSubmitXdrMock.mockResolvedValue({ success: true, hash: 'tx-123' });
    finalizeGetSubmittedPaymentDetailsMock.mockResolvedValue({
      sourceAmount: '11.9234567',
      sourceAssetCode: 'XLM',
      destinationAmount: '10.0000000',
      destinationAssetCode: 'USDC',
      feeXlm: '0.0000100',
    });
    finalizeCreateDefaultTrustlinesMock.mockResolvedValue({ success: true, assets: ['USDC'], errors: [] });
    finalizeEnsureStarterContactsForUserMock.mockResolvedValue({ created: 0, updated: 0, skipped: 0, errors: [] });
    finalizeGetWalletByPublicKeyMock.mockResolvedValue(null);
    finalizeFindByProviderAndIdMock.mockResolvedValue(null);
    finalizeCreateMappingMock.mockResolvedValue(undefined);
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
    });
    finalizeGetAccountBalanceMock.mockResolvedValue([
      { asset_code: 'USDC', asset_issuer: testPublicKey, balance: '0' },
    ]);

    const req = {
      body: {
        token: 'payment-token',
        pin,
      },
    } as any;
    const res = createResponse();

    await ExternalFinalizeController.finalize(req, res);

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
    });
    finalizeGetAccountBalanceMock.mockResolvedValue([
      { asset_code: 'USDC', asset_issuer: testnetUsdcIssuer, balance: '0' },
    ]);

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
