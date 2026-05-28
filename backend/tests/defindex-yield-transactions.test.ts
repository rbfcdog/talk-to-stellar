process.env.STELLAR_NETWORK = 'TESTNET';

import { AnchorService } from '../src/api/services/anchor.service';
import { DefindexYieldService } from '../src/api/services/defindex-yield.service';
import VaultService from '../src/api/services/core/vault.service';
import { OperationRepository } from '../src/api/repository/operation.repository';
import { StellarService } from '../src/api/services/stellar.service';

const CIRCLE_TESTNET_USDC_ISSUER = 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';
const DEFINDEX_TESTNET_USDC_ISSUER = 'GATALTGTWIOT6BUDBCZM3Q4OQ4BO2COLOAZ7IYSKPLC2PMSOPPGF5V56';
const DEFINDEX_TESTNET_USDC_CONTRACT = 'CAQCFVLOBK5GIULPNZRGATJJMIZL5BSP7X5YJVMGCPTUEPFM4AVSRCJU';

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

  it('blocks confirmation when the source balance is not enough for automatic conversion', async () => {
    process.env.DEFINDEX_ENABLE_EXECUTION = 'true';
    process.env.DEFINDEX_COMPLIANCE_APPROVED = 'true';
    (DefindexYieldService.getVaultAssetCompatibility as jest.Mock).mockResolvedValueOnce({
      compatible: true,
      info: {
        asset_code: 'USDC',
        asset_issuer: DEFINDEX_TESTNET_USDC_ISSUER,
        asset_contract: DEFINDEX_TESTNET_USDC_CONTRACT,
        source: 'vault_info',
      },
      configured_issuer: CIRCLE_TESTNET_USDC_ISSUER,
      configured_contract: 'CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA',
      hardcoded_asset_override: true,
      requires_wallet_asset_conversion: true,
      wallet_source_asset: { code: 'USDC', issuer: CIRCLE_TESTNET_USDC_ISSUER },
      vault_deposit_asset: { code: 'USDC', issuer: DEFINDEX_TESTNET_USDC_ISSUER, contract: DEFINDEX_TESTNET_USDC_CONTRACT },
    });
    jest.spyOn(AnchorService as any, 'ensureIssuedAssetTrustline').mockResolvedValue({
      success: true,
      existing: true,
      asset_code: 'USDC',
      asset_issuer: DEFINDEX_TESTNET_USDC_ISSUER,
    });
    jest.spyOn(StellarService, 'getAccountBalance').mockResolvedValue([
      { asset_type: 'credit_alphanum4', asset_code: 'USDC', asset_issuer: CIRCLE_TESTNET_USDC_ISSUER, balance: '50' },
      { asset_type: 'credit_alphanum4', asset_code: 'USDC', asset_issuer: DEFINDEX_TESTNET_USDC_ISSUER, balance: '0' },
    ] as any);
    const quoteSpy = jest.spyOn(StellarService, 'quoteStrictSendConversion');
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
      execution_blocked_code: 'insufficient_balance',
      setup_required: false,
      conversion_required: true,
    });
    expect(quoteSpy).not.toHaveBeenCalled();
    expect(buildSpy).not.toHaveBeenCalled();
  });

  it('builds the Defindex USDC action when the wallet already holds the hardcoded vault USDC', async () => {
    process.env.DEFINDEX_ENABLE_EXECUTION = 'true';
    process.env.DEFINDEX_COMPLIANCE_APPROVED = 'true';
    (DefindexYieldService.getVaultAssetCompatibility as jest.Mock).mockResolvedValueOnce({
      compatible: true,
      info: {
        asset_code: 'USDC',
        asset_issuer: DEFINDEX_TESTNET_USDC_ISSUER,
        asset_contract: DEFINDEX_TESTNET_USDC_CONTRACT,
        source: 'vault_info',
      },
      configured_issuer: CIRCLE_TESTNET_USDC_ISSUER,
      configured_contract: 'CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA',
      hardcoded_asset_override: true,
      requires_wallet_asset_conversion: true,
      wallet_source_asset: { code: 'USDC', issuer: CIRCLE_TESTNET_USDC_ISSUER },
      vault_deposit_asset: { code: 'USDC', issuer: DEFINDEX_TESTNET_USDC_ISSUER, contract: DEFINDEX_TESTNET_USDC_CONTRACT },
    });
    jest.spyOn(AnchorService as any, 'ensureIssuedAssetTrustline').mockResolvedValue({
      success: true,
      existing: true,
      asset_code: 'USDC',
      asset_issuer: DEFINDEX_TESTNET_USDC_ISSUER,
    });
    jest.spyOn(StellarService, 'getAccountBalance').mockResolvedValue([
      { asset_type: 'credit_alphanum4', asset_code: 'USDC', asset_issuer: CIRCLE_TESTNET_USDC_ISSUER, balance: '1000' },
      { asset_type: 'credit_alphanum4', asset_code: 'USDC', asset_issuer: DEFINDEX_TESTNET_USDC_ISSUER, balance: '120' },
    ] as any);
    const quoteSpy = jest.spyOn(StellarService, 'quotePathPayment');
    const buildSpy = jest.spyOn(DefindexYieldService, 'buildVaultAction').mockResolvedValue({
      xdr: 'deposit-defindex-usdc-xdr',
      raw: { action: 'deposit', assetCode: 'USDC' },
    });

    const result = await AnchorService.prepareDefindexYieldForSession({
      session_id: 'session-1',
      session_token: 'token-1',
      action: 'deposit',
      amount: '100',
      asset_code: 'USDC',
      source_asset_code: 'USDC',
      source_asset_issuer: DEFINDEX_TESTNET_USDC_ISSUER,
    });

    expect(result).toMatchObject({
      success: true,
      prepared: true,
      execution_ready: true,
      xdr: 'deposit-defindex-usdc-xdr',
      vault: expect.objectContaining({
        asset_code: 'USDC',
        hardcoded_asset_override: true,
        requires_wallet_asset_conversion: true,
      }),
    });
    expect(quoteSpy).not.toHaveBeenCalled();
    expect(buildSpy).toHaveBeenCalledWith(expect.objectContaining({
      vaultAddress: YIELD_VAULTS.USDC,
      caller: SESSION_CONTEXT.publicKey,
      amountUnits: 1000000000,
    }));
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

  it('blocks distorted same-symbol testnet conversion before depositing into Defindex', async () => {
    process.env.DEFINDEX_ENABLE_EXECUTION = 'true';
    process.env.DEFINDEX_COMPLIANCE_APPROVED = 'true';
    process.env.DEFINDEX_CONVERSION_SETTLE_MS = '0';
    const signingSecret = `S${'B'.repeat(55)}`;
    (DefindexYieldService.getVaultAssetCompatibility as jest.Mock).mockResolvedValue({
      compatible: true,
      info: {
        asset_code: 'USDC',
        asset_issuer: DEFINDEX_TESTNET_USDC_ISSUER,
        asset_contract: DEFINDEX_TESTNET_USDC_CONTRACT,
        source: 'vault_info',
      },
      configured_issuer: CIRCLE_TESTNET_USDC_ISSUER,
      configured_contract: 'CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA',
      hardcoded_asset_override: true,
      requires_wallet_asset_conversion: true,
      wallet_source_asset: { code: 'USDC', issuer: CIRCLE_TESTNET_USDC_ISSUER },
      vault_deposit_asset: { code: 'USDC', issuer: DEFINDEX_TESTNET_USDC_ISSUER, contract: DEFINDEX_TESTNET_USDC_CONTRACT },
    });
    jest.spyOn(AnchorService as any, 'requireWalletPin').mockReturnValue('1234');
    jest.spyOn(AnchorService as any, 'ensureIssuedAssetTrustline').mockResolvedValue({
      success: true,
      existing: true,
      asset_code: 'USDC',
      asset_issuer: DEFINDEX_TESTNET_USDC_ISSUER,
    });
    jest.spyOn(StellarService, 'getAccountBalance')
      .mockResolvedValueOnce([
        { asset_type: 'credit_alphanum4', asset_code: 'USDC', asset_issuer: CIRCLE_TESTNET_USDC_ISSUER, balance: '200' },
        { asset_type: 'credit_alphanum4', asset_code: 'USDC', asset_issuer: DEFINDEX_TESTNET_USDC_ISSUER, balance: '0' },
      ] as any)
      .mockResolvedValueOnce([
        { asset_type: 'credit_alphanum4', asset_code: 'USDC', asset_issuer: CIRCLE_TESTNET_USDC_ISSUER, balance: '99' },
        { asset_type: 'credit_alphanum4', asset_code: 'USDC', asset_issuer: DEFINDEX_TESTNET_USDC_ISSUER, balance: '100' },
      ] as any);
    jest.spyOn(StellarService, 'quoteStrictSendConversion').mockResolvedValue({
      sourceAsset: { code: 'USDC', issuer: CIRCLE_TESTNET_USDC_ISSUER },
      destinationAsset: { code: 'USDC', issuer: DEFINDEX_TESTNET_USDC_ISSUER },
      sourceAmount: '100',
      effectiveSourceAmount: '100',
      destinationAmount: '0.4258',
      destinationMin: '0.4172840',
      networkFeeXlm: '0.00001',
      path: [],
    } as any);
    const conversionSpy = jest.spyOn(StellarService, 'submitStrictSendPaymentFromSecret').mockResolvedValue({
      success: true,
      hash: 'conversion-hash',
      destinationAmount: '0.4258',
      destinationMin: '0.4172840',
    } as any);
    jest.spyOn(VaultService.prototype, 'getSecret').mockResolvedValue(signingSecret);
    const buildSpy = jest.spyOn(DefindexYieldService, 'buildVaultAction').mockResolvedValue({
      xdr: 'server-prepared-defindex-usdc-xdr',
      raw: { success: true, source: 'server' },
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
      code: 'yield_asset_conversion_unavailable',
    });

    expect(conversionSpy).not.toHaveBeenCalled();
    expect(buildSpy).not.toHaveBeenCalled();
  });

  it('converts to the hardcoded Defindex USDC before executing when the route is safe', async () => {
    process.env.DEFINDEX_ENABLE_EXECUTION = 'true';
    process.env.DEFINDEX_COMPLIANCE_APPROVED = 'true';
    process.env.DEFINDEX_CONVERSION_SETTLE_MS = '0';
    const signingSecret = `S${'B'.repeat(55)}`;
    (DefindexYieldService.getVaultAssetCompatibility as jest.Mock).mockResolvedValue({
      compatible: true,
      info: {
        asset_code: 'USDC',
        asset_issuer: DEFINDEX_TESTNET_USDC_ISSUER,
        asset_contract: DEFINDEX_TESTNET_USDC_CONTRACT,
        source: 'vault_info',
      },
      configured_issuer: CIRCLE_TESTNET_USDC_ISSUER,
      configured_contract: 'CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA',
      hardcoded_asset_override: true,
      requires_wallet_asset_conversion: true,
      wallet_source_asset: { code: 'USDC', issuer: CIRCLE_TESTNET_USDC_ISSUER },
      vault_deposit_asset: { code: 'USDC', issuer: DEFINDEX_TESTNET_USDC_ISSUER, contract: DEFINDEX_TESTNET_USDC_CONTRACT },
    });
    jest.spyOn(AnchorService as any, 'requireWalletPin').mockReturnValue('1234');
    jest.spyOn(AnchorService as any, 'ensureIssuedAssetTrustline').mockResolvedValue({
      success: true,
      existing: true,
      asset_code: 'USDC',
      asset_issuer: DEFINDEX_TESTNET_USDC_ISSUER,
    });
    jest.spyOn(StellarService, 'getAccountBalance')
      .mockResolvedValueOnce([
        { asset_type: 'credit_alphanum4', asset_code: 'USDC', asset_issuer: CIRCLE_TESTNET_USDC_ISSUER, balance: '200' },
        { asset_type: 'credit_alphanum4', asset_code: 'USDC', asset_issuer: DEFINDEX_TESTNET_USDC_ISSUER, balance: '0' },
      ] as any)
      .mockResolvedValueOnce([
        { asset_type: 'credit_alphanum4', asset_code: 'USDC', asset_issuer: CIRCLE_TESTNET_USDC_ISSUER, balance: '99' },
        { asset_type: 'credit_alphanum4', asset_code: 'USDC', asset_issuer: DEFINDEX_TESTNET_USDC_ISSUER, balance: '99' },
      ] as any);
    jest.spyOn(StellarService, 'quoteStrictSendConversion').mockResolvedValue({
      sourceAsset: { code: 'USDC', issuer: CIRCLE_TESTNET_USDC_ISSUER },
      destinationAsset: { code: 'USDC', issuer: DEFINDEX_TESTNET_USDC_ISSUER },
      sourceAmount: '100',
      effectiveSourceAmount: '100',
      destinationAmount: '99',
      destinationMin: '98.0100000',
      networkFeeXlm: '0.00001',
      path: [],
    } as any);
    const conversionSpy = jest.spyOn(StellarService, 'submitStrictSendPaymentFromSecret').mockResolvedValue({
      success: true,
      hash: 'conversion-hash',
      destinationAmount: '99',
      destinationMin: '98.0100000',
    } as any);
    jest.spyOn(VaultService.prototype, 'getSecret').mockResolvedValue(signingSecret);
    const buildSpy = jest.spyOn(DefindexYieldService, 'buildVaultAction').mockResolvedValue({
      xdr: 'server-prepared-defindex-usdc-xdr',
      raw: { success: true, source: 'server' },
    });
    jest.spyOn(DefindexYieldService, 'signXdr').mockReturnValue('signed-defindex-usdc-xdr');
    const sendSpy = jest.spyOn(DefindexYieldService, 'sendVaultTransaction').mockResolvedValue({
      hash: 'yield-hash',
      raw: { success: true },
    });
    jest.spyOn(OperationRepository, 'create').mockResolvedValue({
      id: 'operation-defindex-usdc',
      user_id: SESSION_CONTEXT.userId,
      type: 'DEFINDEX_YIELD_DEPOSIT',
      status: 'COMPLETED',
      amount: 99,
      asset_code: 'USDC',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as any);

    const result = await AnchorService.executeDefindexYieldForSession({
      session_id: 'session-1',
      session_token: 'token-1',
      action: 'deposit',
      amount: '100',
      asset_code: 'USDC',
      pin: '1234',
    });

    expect(result).toMatchObject({
      success: true,
      submitted: true,
      hash: 'yield-hash',
      amount: '99',
    });
    expect(conversionSpy).toHaveBeenCalledWith(expect.objectContaining({
      sourceSecret: signingSecret,
      destination: SESSION_CONTEXT.publicKey,
      sourceAsset: { code: 'USDC', issuer: CIRCLE_TESTNET_USDC_ISSUER },
      destinationAsset: { code: 'USDC', issuer: DEFINDEX_TESTNET_USDC_ISSUER, contract: DEFINDEX_TESTNET_USDC_CONTRACT },
      sourceAmount: '100',
    }));
    expect(buildSpy).toHaveBeenCalledWith(expect.objectContaining({
      vaultAddress: YIELD_VAULTS.USDC,
      caller: SESSION_CONTEXT.publicKey,
      amountUnits: 990000000,
    }));
    expect(sendSpy).toHaveBeenCalledWith(expect.objectContaining({
      vaultAddress: YIELD_VAULTS.USDC,
      signedXdr: 'signed-defindex-usdc-xdr',
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
