export type AssetCode = 'XLM' | 'USDC' | 'BRL' | string;

export interface AssetConfig {
  code: AssetCode;
  issuer?: string;
}

export const PUBLIC_USDC_ISSUER = 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN';
export const TESTNET_USDC_ISSUER = 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';

export function getStellarNetworkName(): 'PUBLIC' | 'TESTNET' {
  return String(process.env.STELLAR_NETWORK || 'TESTNET').trim().toUpperCase() === 'PUBLIC'
    ? 'PUBLIC'
    : 'TESTNET';
}

export function normalizeAssetCode(value: unknown): string {
  const code = String(value || 'XLM').trim().toUpperCase();
  if (!code || code === 'NATIVE') return 'XLM';
  if (code === 'USD') return 'USDC';
  return code;
}

export function getAssetIssuer(assetCode: unknown, providedIssuer?: unknown): string | undefined {
  const code = normalizeAssetCode(assetCode);
  const provided = String(providedIssuer || '').trim();
  if (code === 'XLM') return undefined;
  if (provided) return provided;
  if (code === 'USDC') {
    const configured = String(process.env.USDC_ISSUER || '').trim();
    if (configured) return configured;
    return getStellarNetworkName() === 'PUBLIC' ? PUBLIC_USDC_ISSUER : TESTNET_USDC_ISSUER;
  }
  if (code === 'BRL') {
    return String(process.env.BRL_ISSUER || '').trim() || undefined;
  }
  return String(process.env[`${code}_ISSUER`] || '').trim() || undefined;
}

export function resolveConfiguredAsset(assetCode: unknown, providedIssuer?: unknown): AssetConfig {
  const code = normalizeAssetCode(assetCode);
  const issuer = getAssetIssuer(code, providedIssuer);
  return code === 'XLM' ? { code } : { code, issuer };
}

export function requireAssetIssuer(assetCode: unknown, providedIssuer?: unknown): string {
  const code = normalizeAssetCode(assetCode);
  const issuer = getAssetIssuer(code, providedIssuer);
  if (!issuer) {
    throw new Error(`${code}_ISSUER não está configurado no backend.`);
  }
  return issuer;
}

export function getDefaultTrustedAssets(): Array<{ code: string; issuer: string }> {
  const includeBrl = String(process.env.ENABLE_BRL_ASSET || 'false').trim().toLowerCase() === 'true';
  const assetCodes = includeBrl ? ['USDC', 'BRL'] : ['USDC'];
  return assetCodes
    .map((code) => ({ code, issuer: getAssetIssuer(code) || '' }))
    .filter((asset) => Boolean(asset.issuer));
}
