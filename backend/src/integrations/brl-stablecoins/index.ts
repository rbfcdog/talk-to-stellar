/**
 * BRL Stablecoins on Stellar
 *
 * Two BRL-pegged stablecoins live on Stellar mainnet:
 *
 * 1. BRZ — Transfero (stellar.brztoken.io)
 *    Brazil's largest BRL stablecoin by market cap (~$185M). Issued across 16 chains.
 *    On-chain since December 2019. Volume: $920M+ in 2024.
 *    Asset code: BRZ / Issuer: GABMA6FPH3OJXNTGWO7PROF7I5WPQUZOB4BLTBTP4FK6QV7HWISLIEO2
 *
 * 2. BRLT — Settle Network / StableX (sep.stablex.cloud)
 *    SEP-24 anchor with 474+ accounts. Supports ARS and BRL.
 *    Asset code: BRLT / Issuer: GCHQ3F2BF5P74DMDNOOGHT5DUCKC773AW5DTOFINC26W4KGYFPYDPRSO
 *
 * Narrative context:
 *   nTokens (formerly Brazil's only BRL anchor on Stellar) discontinued December 2024.
 *   BRZ and BRLT are the replacement native BRL layer. Users who want BRL-denominated
 *   balances without converting through USDC can hold either asset directly on Stellar.
 *   Both are tradable on the SDEX via Soroswap aggregation.
 *
 * TalkToStellar integration:
 *   - Show BRZ/BRLT balances in ecosystem overview and wallet views
 *   - Enable BRZ ↔ USDC swaps via Soroswap
 *   - Fetch live BRL/USD rates from Stellar SDEX order book to price BRZ accurately
 */

export const BRL_STABLECOINS = {
  BRZ: {
    code: 'BRZ',
    issuer: 'GABMA6FPH3OJXNTGWO7PROF7I5WPQUZOB4BLTBTP4FK6QV7HWISLIEO2',
    name: 'BRZ Token',
    provider: 'Transfero',
    homeDomain: 'stellar.brztoken.io',
    description: 'Largest BRL stablecoin by market cap, $185M+, issued on 16 chains',
    network: 'mainnet' as const,
  },
  BRLT: {
    code: 'BRLT',
    issuer: 'GCHQ3F2BF5P74DMDNOOGHT5DUCKC773AW5DTOFINC26W4KGYFPYDPRSO',
    name: 'Brazilian Real Token',
    provider: 'Settle Network / StableX',
    homeDomain: 'sep.stablex.cloud',
    description: 'SEP-24 anchor BRL stablecoin, 474+ accounts on Stellar',
    network: 'mainnet' as const,
  },
} as const;

export type BrlStablecoinCode = keyof typeof BRL_STABLECOINS;

/**
 * Check whether an asset balance entry is a BRL stablecoin.
 */
export function isBrlStablecoin(assetCode: string, assetIssuer: string): boolean {
  return Object.values(BRL_STABLECOINS).some(
    (s) => s.code === assetCode && s.issuer === assetIssuer
  );
}

/**
 * Format a BRL stablecoin balance as a human-readable string.
 * e.g. "R$250,00 (BRZ)"
 */
export function formatBrlBalance(amount: string, code: BrlStablecoinCode): string {
  const num = parseFloat(amount);
  if (isNaN(num)) return `0,00 (${code})`;
  const formatted = num.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `R$${formatted} (${code})`;
}
