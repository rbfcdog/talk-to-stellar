import { DefindexYieldService } from '../src/api/services/defindex-yield.service';

describe('DefindexYieldService', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
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
});
