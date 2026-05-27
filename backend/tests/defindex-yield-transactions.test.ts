process.env.STELLAR_NETWORK = 'TESTNET';

import { AnchorService } from '../src/api/services/anchor.service';
import { DefindexYieldService } from '../src/api/services/defindex-yield.service';
import VaultService from '../src/api/services/core/vault.service';
import { OperationRepository } from '../src/api/repository/operation.repository';

const YIELD_VAULTS = {
  USDC: 'CBMVK2JK6NTOT2O4HNQAIQFJY232BHKGLIMXDVQVHIIZKDACXDFZDWHN',
  CETES: 'CBIS5TEMTNNOTBE3WXPQUAGUEDYZZVIWAKTXEQCOUJ34OJJ3FJ5NLF2P',
  XLM: 'CCLV4H7WTLJQ7ATLHBBQV2WW3OINF3FOY5XZ7VPHZO7NH3D2ZS4GFSF6',
} as const;

const SESSION_CONTEXT = {
  sessionId: 'session-1',
  sessionToken: 'token-1',
  userId: 'user-1',
  email: 'yield@example.com',
  publicKey: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
  vaultSecretId: 'secret-1',
  sessionPinHash: 'mock-pin-hash',
  wallet: null,
};

function clearYieldEnv() {
  delete process.env.DEFINDEX_USDC_VAULT;
  delete process.env.DEFINDEX_CETES_VAULT;
  delete process.env.DEFINDEX_XLM_VAULT;
  delete process.env.DEFINDEX_EURC_VAULT;
  delete process.env.DEFINDEX_TESOURO_VAULT;
  delete process.env.DEFINDEX_VAULTS_JSON;
  delete process.env.CETES_ISSUER_TESTNET;
}

function configureYieldEnv() {
  clearYieldEnv();
  process.env.STELLAR_NETWORK = 'TESTNET';
  process.env.DEFINDEX_API_KEY = 'sk_test';
  process.env.DEFINDEX_BASE_URL = 'https://api.defindex.io';
  process.env.DEFINDEX_NETWORK = 'testnet';
  process.env.DEFINDEX_ENABLE_EXECUTION = 'false';
  process.env.DEFINDEX_USDC_VAULT = YIELD_VAULTS.USDC;
  process.env.DEFINDEX_CETES_VAULT = YIELD_VAULTS.CETES;
  process.env.CETES_ISSUER_TESTNET = 'GC3CW7EDYRTWQ635VDIGY6S4ZUF5L6TQ7AA4MWS7LEQDBLUSZXV7UPS4';
  process.env.DEFINDEX_XLM_VAULT = YIELD_VAULTS.XLM;
}

describe('Defindex yield transaction flows', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
    configureYieldEnv();
    jest.restoreAllMocks();
    jest.spyOn(AnchorService as any, 'resolveSessionWallet').mockResolvedValue(SESSION_CONTEXT);
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    jest.restoreAllMocks();
  });

  it('publishes only yield options backed by configured vaults', async () => {
    jest.spyOn(DefindexYieldService, 'getVaultAPY').mockImplementation(async (vaultAddress: string) => ({
      apy: vaultAddress === YIELD_VAULTS.CETES ? 8.75 : 5.25,
      period: '7d',
    }));

    const status = await AnchorService.getDefindexYieldStatus();

    expect(status.success).toBe(true);
    expect(status.runtime.configured).toBe(true);
    expect(status.vaults.map((vault) => vault.asset_code)).toEqual(['USDC', 'CETES', 'XLM']);
    expect(status.vaults.map((vault) => vault.asset_code)).not.toEqual(expect.arrayContaining(['EURC', 'TESOURO']));
    expect(status.vaults).toEqual(expect.arrayContaining([
      expect.objectContaining({ asset_code: 'USDC', vault_address: YIELD_VAULTS.USDC, apy_percent: '5.25' }),
      expect.objectContaining({ asset_code: 'CETES', vault_address: YIELD_VAULTS.CETES, apy_percent: '8.75' }),
      expect.objectContaining({ asset_code: 'XLM', vault_address: YIELD_VAULTS.XLM, display_asset_code: 'XLM' }),
    ]));
  });

  it.each([
    ['USDC', YIELD_VAULTS.USDC],
    ['CETES', YIELD_VAULTS.CETES],
    ['XLM', YIELD_VAULTS.XLM],
  ] as const)('checks yield balance for %s through the configured vault', async (assetCode, vaultAddress) => {
    const balanceSpy = jest.spyOn(DefindexYieldService, 'getVaultBalance').mockResolvedValue({
      dfTokens: '123',
      assetBalance: '12.3',
    });

    const result = await AnchorService.getDefindexYieldBalanceForSession({
      session_id: 'session-1',
      session_token: 'token-1',
      asset_code: assetCode,
    });

    expect(result.success).toBe(true);
    expect(result.vault).toMatchObject({ asset_code: assetCode, vault_address: vaultAddress });
    expect(balanceSpy).toHaveBeenCalledWith(vaultAddress, SESSION_CONTEXT.publicKey, 'testnet');
  });

  it.each([
    ['USDC', YIELD_VAULTS.USDC],
    ['CETES', YIELD_VAULTS.CETES],
    ['XLM', YIELD_VAULTS.XLM],
  ] as const)('prepares deposit and withdraw transactions for %s', async (assetCode, vaultAddress) => {
    const buildSpy = jest.spyOn(DefindexYieldService, 'buildVaultAction').mockImplementation(async (input) => ({
      xdr: `${input.action}-${assetCode}-xdr`,
      raw: { action: input.action, assetCode },
    }));

    for (const action of ['deposit', 'withdraw'] as const) {
      const result = await AnchorService.prepareDefindexYieldForSession({
        session_id: 'session-1',
        session_token: 'token-1',
        action,
        amount: '12.3456789',
        asset_code: assetCode,
        slippage_bps: 75,
      });

      expect(result).toMatchObject({
        success: true,
        prepared: true,
        action,
        amount: '12.3456789',
        amount_units: 123456789,
        vault: expect.objectContaining({ asset_code: assetCode, vault_address: vaultAddress }),
        xdr: `${action}-${assetCode}-xdr`,
      });
    }

    expect(buildSpy).toHaveBeenCalledWith(expect.objectContaining({
      action: 'deposit',
      vaultAddress,
      caller: SESSION_CONTEXT.publicKey,
      amountUnits: 123456789,
      network: 'testnet',
      slippageBps: 75,
      invest: true,
    }));
    expect(buildSpy).toHaveBeenCalledWith(expect.objectContaining({
      action: 'withdraw',
      vaultAddress,
      caller: SESSION_CONTEXT.publicKey,
      amountUnits: 123456789,
      network: 'testnet',
      slippageBps: 75,
    }));
  });

  it('normalizes testnet EURC yield requests to CETES', async () => {
    const buildSpy = jest.spyOn(DefindexYieldService, 'buildVaultAction').mockResolvedValue({
      xdr: 'deposit-cetes-xdr',
      raw: { action: 'deposit', assetCode: 'CETES' },
    });

    const result = await AnchorService.prepareDefindexYieldForSession({
      session_id: 'session-1',
      session_token: 'token-1',
      action: 'deposit',
      amount: '10',
      asset_code: 'EURC',
    });

    expect(result).toMatchObject({
      success: true,
      prepared: true,
      vault: expect.objectContaining({ asset_code: 'CETES', vault_address: YIELD_VAULTS.CETES }),
      xdr: 'deposit-cetes-xdr',
    });
    expect(buildSpy).toHaveBeenCalledWith(expect.objectContaining({
      vaultAddress: YIELD_VAULTS.CETES,
      network: 'testnet',
    }));
  });

  it.each(['TESOURO'] as const)('blocks yield preparation for %s when no vault is configured', async (assetCode) => {
    await expect(AnchorService.prepareDefindexYieldForSession({
      session_id: 'session-1',
      session_token: 'token-1',
      action: 'deposit',
      amount: '10',
      asset_code: assetCode,
    })).rejects.toThrow(`No Defindex vault configured for`);
  });

  it('does not execute a yield transaction while execution is disabled', async () => {
    await expect(AnchorService.executeDefindexYieldForSession({
      session_id: 'session-1',
      session_token: 'token-1',
      action: 'deposit',
      amount: '10',
      asset_code: 'USDC',
      pin: '1234',
    })).rejects.toThrow('Execução Defindex está desativada');
  });

  it.each([
    ['USDC', YIELD_VAULTS.USDC],
    ['CETES', YIELD_VAULTS.CETES],
    ['XLM', YIELD_VAULTS.XLM],
  ] as const)('signs and submits prepared transaction XDR for %s when execution is enabled', async (assetCode, vaultAddress) => {
    process.env.DEFINDEX_ENABLE_EXECUTION = 'true';
    process.env.DEFINDEX_COMPLIANCE_APPROVED = 'true';
    jest.spyOn(AnchorService as any, 'requireWalletPin').mockReturnValue('1234');
    jest.spyOn(VaultService.prototype, 'getSecret').mockResolvedValue('SSECRET');
    jest.spyOn(DefindexYieldService, 'signXdr').mockReturnValue(`signed-${assetCode}-xdr`);
    const sendSpy = jest.spyOn(DefindexYieldService, 'sendVaultTransaction').mockResolvedValue({
      hash: `hash-${assetCode}`,
      raw: { success: true },
    });
    const operationSpy = jest.spyOn(OperationRepository, 'create').mockResolvedValue({
      id: `operation-${assetCode}`,
      user_id: SESSION_CONTEXT.userId,
      type: 'DEFINDEX_YIELD_DEPOSIT',
      status: 'COMPLETED',
      amount: 10,
      asset_code: assetCode,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as any);

    const result = await AnchorService.executeDefindexYieldForSession({
      session_id: 'session-1',
      session_token: 'token-1',
      action: 'deposit',
      amount: '10',
      asset_code: assetCode,
      unsigned_xdr: `unsigned-${assetCode}-xdr`,
      pin: '1234',
    });

    expect(result).toMatchObject({
      success: true,
      submitted: true,
      action: 'deposit',
      amount: '10',
      amount_units: 100000000,
      hash: `hash-${assetCode}`,
      vault: expect.objectContaining({ asset_code: assetCode, vault_address: vaultAddress }),
    });
    expect(DefindexYieldService.signXdr).toHaveBeenCalledWith(`unsigned-${assetCode}-xdr`, 'SSECRET');
    expect(sendSpy).toHaveBeenCalledWith({
      vaultAddress,
      signedXdr: `signed-${assetCode}-xdr`,
      network: 'testnet',
    });
    expect(operationSpy).toHaveBeenCalledWith(expect.objectContaining({
      user_id: SESSION_CONTEXT.userId,
      type: 'DEFINDEX_YIELD_DEPOSIT',
      status: 'COMPLETED',
      amount: 10,
      asset_code: assetCode,
      stellar_transaction_hash: `hash-${assetCode}`,
      source_public_key: SESSION_CONTEXT.publicKey,
    }));
  });
});
