export interface SoroswapConfig {
  apiUrl: string;
  network: string;
  defaultSlippageBps: number;
}

export function loadSoroswapConfig(): SoroswapConfig {
  const network = (process.env.STELLAR_NETWORK || 'testnet').toLowerCase();
  const normalized = network === 'public' ? 'mainnet' : network;
  return {
    apiUrl: process.env.SOROSWAP_API_URL || 'https://api.soroswap.finance/api/v1',
    network: normalized,
    defaultSlippageBps: parseInt(process.env.SOROSWAP_DEFAULT_SLIPPAGE_BPS || '50', 10),
  };
}

// Well-known mainnet token addresses (SAC wrappers and asset issuers)
// BRZ and BRLT are BRL-pegged stablecoins native to Stellar — the BRL liquidity layer
export const MAINNET_TOKENS: Record<string, string> = {
  USDC: 'CCW67TSZV3SSS2HXMBQ5JFGCKJNZT7WSEE9MCZGE6H4SXNVGXNWMSE',
  XLM: 'CAS3J7GYLGXMF6TDJBBYYSE3HQ6BBSMLNUQ34T6TZMYMW2EVH34XOWMA',
  // BRL stablecoins on Stellar — native BRL representation layer
  BRZ: 'GABMA6FPH3OJXNTGWO7PROF7I5WPQUZOB4BLTBTP4FK6QV7HWISLIEO2',  // Transfero, $185M market cap
  BRLT: 'GCHQ3F2BF5P74DMDNOOGHT5DUCKC773AW5DTOFINC26W4KGYFPYDPRSO', // StableX, 474+ accounts
};
