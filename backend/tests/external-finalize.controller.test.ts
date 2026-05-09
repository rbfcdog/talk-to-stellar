const { Keypair } = require('@stellar/stellar-sdk');

const testKeypair = Keypair.random();
const testPublicKey = testKeypair.publicKey();
const testSecretKey = testKeypair.secret();

const finalizeSaveSessionMock = jest.fn();
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
const finalizeSignAndSubmitXdrMock = jest.fn();

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
    signAndSubmitXdr: finalizeSignAndSubmitXdrMock,
  },
}));

jest.mock('../src/repositories/agent.repository', () => ({
  AgentRepository: jest.fn().mockImplementation(() => ({
    saveSession: finalizeSaveSessionMock,
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
    finalizeSignAndSubmitXdrMock.mockReset();
    finalizeSaveSessionMock.mockResolvedValue(undefined);
    finalizeSaveWalletMock.mockResolvedValue(undefined);
    finalizeLinkSessionMock.mockResolvedValue(undefined);
    finalizeStoreSecretMock.mockResolvedValue('vault-secret-id-1');
    finalizeGetSecretMock.mockResolvedValue(testSecretKey);
    finalizeBuildPaymentXdrMock.mockResolvedValue('unsigned-xdr');
    finalizeSignAndSubmitXdrMock.mockResolvedValue({ success: true, hash: 'tx-123' });
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

});

function createResponse() {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}
