process.env.STELLAR_NETWORK = 'TESTNET';

const mockSdkMethods = {
  healthCheck: jest.fn(),
  getVaultInfo: jest.fn(),
  getVaultAPY: jest.fn(),
  getVaultBalance: jest.fn(),
  depositToVault: jest.fn(),
  withdrawFromVault: jest.fn(),
  sendTransaction: jest.fn(),
};

const mockDefindexSDK = jest.fn(() => mockSdkMethods);

jest.mock('@defindex/sdk', () => ({
  DefindexSDK: mockDefindexSDK,
  SupportedNetworks: {
    TESTNET: 'testnet',
    MAINNET: 'mainnet',
  },
}));

import { DefindexYieldService } from '../src/api/services/defindex-yield.service';

describe('DefindexYieldService', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    jest.clearAllMocks();
  });

  function clearDefindexVaultEnv() {
    delete process.env.DEFINDEX_USDC_VAULT;
    delete process.env.DEFINDEX_CETES_VAULT;
    delete process.env.DEFINDEX_EURC_VAULT;
    delete process.env.DEFINDEX_XLM_VAULT;
    delete process.env.DEFINDEX_TESOURO_VAULT;
    delete process.env.DEFINDEX_VAULTS_JSON;
  }

  it('reports missing API key and vault configuration without throwing', () => {
    delete process.env.DEFINDEX_API_KEY;
    clearDefindexVaultEnv();
    process.env.STELLAR_NETWORK = 'TESTNET';

    const runtime = DefindexYieldService.getRuntimeInfo();

    expect(runtime).toMatchObject({
      provider: 'defindex',
      configured: false,
      api_key_configured: false,
      network: 'testnet',
      vaults: [],
    });
    expect(runtime.unavailable_reason).toContain('DEFINDEX_API_KEY');
  });

  it('loads multi-asset vaults and normalizes testnet EUR aliases to CETES', () => {
    clearDefindexVaultEnv();
    process.env.DEFINDEX_API_KEY = 'sk_test';
    process.env.DEFINDEX_NETWORK = 'testnet';
    process.env.DEFINDEX_USDC_VAULT = 'CUSDCVAULT';
    process.env.CETES_ISSUER_TESTNET = 'GC3CW7EDYRTWQ635VDIGY6S4ZUF5L6TQ7AA4MWS7LEQDBLUSZXV7UPS4';
    process.env.DEFINDEX_VAULTS_JSON = JSON.stringify([
      { asset_code: 'EUR', vault_address: 'CCETESVAULT', label: 'CETES vault', network: 'testnet' },
      { asset_code: 'XLM', vault_address: 'CXLMVAULT', label: 'XLM vault', network: 'mainnet' },
    ]);

    const runtime = DefindexYieldService.getRuntimeInfo();

    expect(runtime.configured).toBe(true);
    expect(runtime.vaults.map((vault) => vault.asset_code)).toEqual(['CETES', 'USDC']);
    expect(runtime.vaults.find((vault) => vault.asset_code === 'CETES')).toMatchObject({
      vault_address: 'CCETESVAULT',
      label: 'CETES vault',
      asset_issuer: 'GC3CW7EDYRTWQ635VDIGY6S4ZUF5L6TQ7AA4MWS7LEQDBLUSZXV7UPS4',
    });
    expect(runtime.vaults.find((vault) => vault.asset_code === 'USDC')).toMatchObject({
      vault_address: 'CUSDCVAULT',
    });
  });

  it('enables execution on testnet when requested and configured', () => {
    clearDefindexVaultEnv();
    process.env.STELLAR_NETWORK = 'TESTNET';
    process.env.DEFINDEX_API_KEY = 'sk_test';
    process.env.DEFINDEX_NETWORK = 'testnet';
    process.env.DEFINDEX_ENABLE_EXECUTION = 'true';
    process.env.DEFINDEX_COMPLIANCE_APPROVED = 'true';
    process.env.DEFINDEX_USDC_VAULT = 'CUSDCVAULT';

    const runtime = DefindexYieldService.getRuntimeInfo();

    expect(runtime).toMatchObject({
      configured: true,
      network: 'testnet',
      stellar_network: 'testnet',
      network_mismatch: false,
      execution_requested: true,
      execution_enabled: true,
      compliance_approved: true,
      compliance_mode: 'approved_execution',
      mainnet_execution_allowed: false,
    });
    expect(runtime.execution_blocked_reason).toBeUndefined();
  });

  it('enables testnet execution without separate compliance approval when explicitly requested', () => {
    clearDefindexVaultEnv();
    process.env.STELLAR_NETWORK = 'TESTNET';
    process.env.DEFINDEX_API_KEY = 'sk_test';
    process.env.DEFINDEX_NETWORK = 'testnet';
    process.env.DEFINDEX_ENABLE_EXECUTION = 'true';
    process.env.DEFINDEX_USDC_VAULT = 'CUSDCVAULT';

    const runtime = DefindexYieldService.getRuntimeInfo();

    expect(runtime).toMatchObject({
      configured: true,
      network: 'testnet',
      stellar_network: 'testnet',
      execution_requested: true,
      execution_enabled: true,
      compliance_approved: true,
      compliance_mode: 'approved_execution',
    });
    expect(runtime.execution_blocked_reason).toBeUndefined();
  });

  it('does not enable mainnet execution from the general execution flag alone', () => {
    clearDefindexVaultEnv();
    process.env.STELLAR_NETWORK = 'PUBLIC';
    process.env.DEFINDEX_API_KEY = 'sk_test';
    process.env.DEFINDEX_NETWORK = 'mainnet';
    process.env.DEFINDEX_ENABLE_EXECUTION = 'true';
    process.env.DEFINDEX_COMPLIANCE_APPROVED = 'true';
    process.env.DEFINDEX_USDC_VAULT = 'CUSDCVAULT';

    const runtime = DefindexYieldService.getRuntimeInfo();

    expect(runtime).toMatchObject({
      configured: true,
      network: 'mainnet',
      stellar_network: 'mainnet',
      network_mismatch: false,
      execution_requested: true,
      execution_enabled: false,
      mainnet_execution_allowed: false,
    });
    expect(runtime.execution_blocked_reason).toContain('DEFINDEX_ALLOW_MAINNET_EXECUTION=true');
  });

  it('blocks yield operations when Defindex and Stellar networks differ', () => {
    clearDefindexVaultEnv();
    process.env.STELLAR_NETWORK = 'TESTNET';
    process.env.DEFINDEX_API_KEY = 'sk_test';
    process.env.DEFINDEX_NETWORK = 'mainnet';
    process.env.DEFINDEX_ENABLE_EXECUTION = 'true';
    process.env.DEFINDEX_USDC_VAULT = 'CUSDCVAULT';

    const runtime = DefindexYieldService.getRuntimeInfo();

    expect(runtime).toMatchObject({
      network: 'mainnet',
      stellar_network: 'testnet',
      network_mismatch: true,
      execution_enabled: false,
    });
    expect(() => DefindexYieldService.requireVault('USDC')).toThrow('must match STELLAR_NETWORK');
  });

  it('converts human amounts to 7-decimal contract units', () => {
    expect(DefindexYieldService.amountToContractUnits('1')).toBe(10000000);
    expect(DefindexYieldService.amountToContractUnits('0.0000001')).toBe(1);
    expect(DefindexYieldService.amountToContractUnits('12,34')).toBe(123400000);
  });

  it('uses the Defindex SDK with backend env configuration', async () => {
    process.env.DEFINDEX_API_KEY = 'sk_test';
    process.env.DEFINDEX_BASE_URL = 'https://api.defindex.io/';
    process.env.DEFINDEX_TIMEOUT_MS = '12345';
    process.env.DEFINDEX_NETWORK = 'testnet';
    mockSdkMethods.getVaultInfo.mockResolvedValue({ name: 'USDC Vault' });

    await expect(DefindexYieldService.getVaultInfo('CUSDCVAULT', 'testnet')).resolves.toEqual({ name: 'USDC Vault' });

    expect(mockDefindexSDK).toHaveBeenCalledWith(expect.objectContaining({
      apiKey: 'sk_test',
      baseUrl: 'https://api.defindex.io',
      timeout: 12345,
      defaultNetwork: 'testnet',
    }));
    expect(mockSdkMethods.getVaultInfo).toHaveBeenCalledWith('CUSDCVAULT', 'testnet');
  });

  it('builds Defindex deposit and withdraw XDR through the SDK', async () => {
    process.env.DEFINDEX_API_KEY = 'sk_test';
    process.env.DEFINDEX_NETWORK = 'testnet';
    mockSdkMethods.depositToVault.mockResolvedValue({ xdr: 'deposit-xdr' });
    mockSdkMethods.withdrawFromVault.mockResolvedValue({ transactionXDR: 'withdraw-xdr' });

    await expect(DefindexYieldService.buildVaultAction({
      action: 'deposit',
      vaultAddress: 'CUSDCVAULT',
      caller: 'GUSER',
      amountUnits: 1000000,
      network: 'testnet',
    })).resolves.toMatchObject({ xdr: 'deposit-xdr' });

    expect(mockSdkMethods.depositToVault).toHaveBeenCalledWith('CUSDCVAULT', {
      amounts: [1000000],
      caller: 'GUSER',
      slippageBps: 100,
      invest: true,
    }, 'testnet');

    await expect(DefindexYieldService.buildVaultAction({
      action: 'withdraw',
      vaultAddress: 'CUSDCVAULT',
      caller: 'GUSER',
      amountUnits: 500000,
      network: 'testnet',
      slippageBps: 50,
    })).resolves.toMatchObject({ xdr: 'withdraw-xdr' });

    expect(mockSdkMethods.withdrawFromVault).toHaveBeenCalledWith('CUSDCVAULT', {
      amounts: [500000],
      caller: 'GUSER',
      slippageBps: 50,
    }, 'testnet');
  });

  it('submits signed Defindex XDR through the SDK and maps txHash', async () => {
    process.env.DEFINDEX_API_KEY = 'sk_test';
    process.env.DEFINDEX_NETWORK = 'mainnet';
    mockSdkMethods.sendTransaction.mockResolvedValue({ txHash: 'abc123', success: true });

    await expect(DefindexYieldService.sendVaultTransaction({
      vaultAddress: 'CVAULT',
      signedXdr: 'signed-xdr',
      network: 'mainnet',
    })).resolves.toMatchObject({ hash: 'abc123' });

    expect(mockDefindexSDK).toHaveBeenCalledWith(expect.objectContaining({
      defaultNetwork: 'mainnet',
    }));
    expect(mockSdkMethods.sendTransaction).toHaveBeenCalledWith('signed-xdr', 'mainnet');
  });
});
