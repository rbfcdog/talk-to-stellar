/**
 * DeFindex Configuration
 *
 * DeFindex is a yield-routing layer on top of Blend Protocol.
 * USDC supply APY: ~8.6% (June 2026, source: DefiLlama)
 *
 * Env vars:
 *   DEFINDEX_API_KEY     — Optional API key for DeFindex API
 *   DEFINDEX_API_URL     — API base URL (default: https://api.defindex.io)
 *
 * Known USDC vault addresses (mainnet):
 *   Check https://api.defindex.io/vaults for latest
 */

export interface DefindexConfig {
  apiKey?: string;
  baseUrl: string;
  defaultNetwork: 'mainnet' | 'testnet';
}

// Known mainnet USDC vault (DeFindex managed)
// Source: https://defindex.io / verified on DefiLlama June 2026
export const DEFINDEX_USDC_VAULT_MAINNET = 'CBNKCU3HGFKHFOF7JTGXQCNKE3G3DXS5RDBQUKQMIIECYKXPIOUGB2S3';
export const DEFINDEX_USDC_VAULT_TESTNET = 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYW'; // use testnet if available

export function loadDefindexConfig(): DefindexConfig {
  const network = (process.env.STELLAR_NETWORK || 'testnet').toLowerCase();
  return {
    apiKey: process.env.DEFINDEX_API_KEY,
    baseUrl: process.env.DEFINDEX_API_URL || 'https://api.defindex.io',
    defaultNetwork: (network === 'mainnet' || network === 'public') ? 'mainnet' : 'testnet',
  };
}
