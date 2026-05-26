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

  it('reports missing API key and vault configuration without throwing', () => {
    delete process.env.DEFINDEX_API_KEY;
    delete process.env.DEFINDEX_USDC_VAULT;
    delete process.env.DEFINDEX_VAULTS_JSON;
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

  it('loads multi-asset vaults from env and normalizes EUR to EURC', () => {
    process.env.DEFINDEX_API_KEY = 'sk_test';
    process.env.DEFINDEX_NETWORK = 'testnet';
    process.env.DEFINDEX_USDC_VAULT = 'CUSDCVAULT';
    process.env.DEFINDEX_VAULTS_JSON = JSON.stringify([
      { asset_code: 'EUR', vault_address: 'CEURVAULT', label: 'Euro vault', network: 'testnet' },
      { asset_code: 'XLM', vault_address: 'CXLMVAULT', label: 'XLM vault', network: 'mainnet' },
    ]);

    const runtime = DefindexYieldService.getRuntimeInfo();

    expect(runtime.configured).toBe(true);
    expect(runtime.vaults.map((vault) => vault.asset_code)).toEqual(['EURC', 'USDC']);
    expect(runtime.vaults.find((vault) => vault.asset_code === 'EURC')).toMatchObject({
      vault_address: 'CEURVAULT',
      label: 'Euro vault',
    });
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
