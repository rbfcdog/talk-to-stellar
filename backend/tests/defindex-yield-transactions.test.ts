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
    jest.spyOn(DefindexYieldService, 'getVaultAssetCompatibility').mockImplementation(async (vault: any) => ({
      compatible: true,
      info: {
        asset_code: vault.asset_code,
        asset_issuer: vault.asset_issuer,
        asset_contract: vault.asset_contract,
        source: 'configured',
      },
      configured_issuer: vault.asset_issuer,
      configured_contract: vault.asset_contract,
    }));
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

  it('prepares review data without building XDR when execution is not compliance-approved', async () => {
    process.env.DEFINDEX_ENABLE_EXECUTION = 'true';
    delete process.env.DEFINDEX_COMPLIANCE_APPROVED;
    const buildSpy = jest.spyOn(DefindexYieldService, 'buildVaultAction');

    const result = await AnchorService.prepareDefindexYieldForSession({
      session_id: 'session-1',
      session_token: 'token-1',
      action: 'deposit',
      amount: '12.3456789',
      asset_code: 'USDC',
      slippage_bps: 75,
    });

    expect(result).toMatchObject({
      success: true,
      prepared: true,
      review_only: true,
      execution_ready: false,
      action: 'deposit',
      amount: '12.3456789',
      amount_units: 123456789,
      vault: expect.objectContaining({ asset_code: 'USDC', vault_address: YIELD_VAULTS.USDC }),
    });
    expect(result).not.toHaveProperty('xdr');
    expect(buildSpy).not.toHaveBeenCalled();
  });

  it.each([
    ['USDC', YIELD_VAULTS.USDC],
    ['CETES', YIELD_VAULTS.CETES],
    ['XLM', YIELD_VAULTS.XLM],
  ] as const)('prepares deposit and withdraw transactions for %s', async (assetCode, vaultAddress) => {
    process.env.DEFINDEX_ENABLE_EXECUTION = 'true';
    process.env.DEFINDEX_COMPLIANCE_APPROVED = 'true';
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
    process.env.DEFINDEX_ENABLE_EXECUTION = 'true';
    process.env.DEFINDEX_COMPLIANCE_APPROVED = 'true';
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

  it('keeps the review available when the vault action cannot be built for account setup', async () => {
    process.env.DEFINDEX_ENABLE_EXECUTION = 'true';
    process.env.DEFINDEX_COMPLIANCE_APPROVED = 'true';
    const buildSpy = jest.spyOn(DefindexYieldService, 'buildVaultAction').mockRejectedValue({
      message: 'TokenErrors.MissingTrustline',
      error: 'Simulation Failed',
    });

    const result = await AnchorService.prepareDefindexYieldForSession({
      session_id: 'session-1',
      session_token: 'token-1',
      action: 'deposit',
      amount: '100',
      asset_code: 'USDC',
    });

    expect(result).toMatchObject({
      success: true,
      prepared: true,
      review_only: true,
      execution_ready: false,
      execution_blocked_code: 'yield_account_setup_required',
      setup_required: true,
      action: 'deposit',
      amount: '100',
      amount_units: 1000000000,
      vault: expect.objectContaining({ asset_code: 'USDC', vault_address: YIELD_VAULTS.USDC }),
    });
    expect(result).not.toHaveProperty('xdr');
    expect(buildSpy).toHaveBeenCalledWith(expect.objectContaining({
      vaultAddress: YIELD_VAULTS.USDC,
      caller: SESSION_CONTEXT.publicKey,
      amountUnits: 1000000000,
    }));
  });

  it('keeps review only when the configured vault uses a different asset issuer', async () => {
    process.env.DEFINDEX_ENABLE_EXECUTION = 'true';
    process.env.DEFINDEX_COMPLIANCE_APPROVED = 'true';
    (DefindexYieldService.getVaultAssetCompatibility as jest.Mock).mockResolvedValueOnce({
      compatible: false,
      info: {
        asset_code: 'USDC',
        asset_issuer: 'GATALTGTWIOT6BUDBCZM3Q4OQ4BO2COLOAZ7IYSKPLC2PMSOPPGF5V56',
        asset_contract: 'CAQCFVLOBK5GIULPNZRGATJJMIZL5BSP7X5YJVMGCPTUEPFM4AVSRCJU',
        source: 'vault_info',
      },
      configured_issuer: 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
      configured_contract: 'CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA',
    });
    const buildSpy = jest.spyOn(DefindexYieldService, 'buildVaultAction');

    const result = await AnchorService.prepareDefindexYieldForSession({
      session_id: 'session-1',
      session_token: 'token-1',
      action: 'deposit',
      amount: '100',
      asset_code: 'USDC',
    });

    expect(result).toMatchObject({
      success: true,
      prepared: true,
      review_only: true,
      execution_ready: false,
      execution_blocked_code: 'yield_asset_incompatible',
      setup_required: false,
    });
    expect(buildSpy).not.toHaveBeenCalled();
  });

  it('blocks PIN execution with a clear code when review is account-setup only', async () => {
    process.env.DEFINDEX_ENABLE_EXECUTION = 'true';
    process.env.DEFINDEX_COMPLIANCE_APPROVED = 'true';
    jest.spyOn(AnchorService as any, 'requireWalletPin').mockReturnValue('1234');
    jest.spyOn(DefindexYieldService, 'buildVaultAction').mockRejectedValue({
      message: 'TokenErrors.MissingTrustline',
      error: 'Simulation Failed',
    });

    await expect(AnchorService.executeDefindexYieldForSession({
      session_id: 'session-1',
      session_token: 'token-1',
      action: 'deposit',
      amount: '100',
      asset_code: 'USDC',
      pin: '1234',
    })).rejects.toMatchObject({
      statusCode: 409,
      code: 'yield_account_setup_required',
    });
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
    })).rejects.toMatchObject({ code: 'yield_execution_disabled' });
  });

  it.each([
    ['USDC', YIELD_VAULTS.USDC],
    ['CETES', YIELD_VAULTS.CETES],
    ['XLM', YIELD_VAULTS.XLM],
  ] as const)('builds, signs and submits server-prepared transaction XDR for %s when execution is enabled', async (assetCode, vaultAddress) => {
    process.env.DEFINDEX_ENABLE_EXECUTION = 'true';
    process.env.DEFINDEX_COMPLIANCE_APPROVED = 'true';
    const signingSecret = `S${'A'.repeat(55)}`;
    jest.spyOn(AnchorService as any, 'requireWalletPin').mockReturnValue('1234');
    jest.spyOn(VaultService.prototype, 'getSecret').mockResolvedValue(signingSecret);
    const buildSpy = jest.spyOn(DefindexYieldService, 'buildVaultAction').mockResolvedValue({
      xdr: `server-prepared-${assetCode}-xdr`,
      raw: { success: true, source: 'server' },
    });
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
      unsigned_xdr: `client-provided-${assetCode}-xdr`,
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
    expect(buildSpy).toHaveBeenCalledWith(expect.objectContaining({
      action: 'deposit',
      vaultAddress,
      caller: SESSION_CONTEXT.publicKey,
      amountUnits: 100000000,
      network: 'testnet',
      invest: true,
    }));
    expect(DefindexYieldService.signXdr).toHaveBeenCalledWith(`server-prepared-${assetCode}-xdr`, signingSecret);
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
