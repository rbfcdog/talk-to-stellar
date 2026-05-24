export type AssetCode = 'XLM' | 'USDC' | 'BRL' | string;

export interface AssetConfig {
  code: AssetCode;
  issuer?: string;
}

export const PUBLIC_USDC_ISSUER = 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN';
export const TESTNET_USDC_ISSUER = 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';
export const PUBLIC_BRL_ISSUER_NTOKENS = 'GDVKY2GU2DRXWTBEYJJWSFXIGBZV6AZNBVVSUHEPZI54LIS6BA7DVVSP';
export const ETHERFUSE_TESOURO_ISSUER = 'GC3CW7EDYRTWQ635VDIGY6S4ZUF5L6TQ7AA4MWS7LEQDBLUSZXV7UPS4';

function envFlag(name: string, fallback: boolean): boolean {
  const raw = String(process.env[name] || '').trim().toLowerCase();
  if (!raw) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(raw);
}

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
  const network = getStellarNetworkName();
  if (code === 'XLM') return undefined;
  if (provided) return provided;
  if (code === 'USDC') {
    const configured = String(process.env.USDC_ISSUER || '').trim();
    if (configured) return configured;
    return network === 'PUBLIC' ? PUBLIC_USDC_ISSUER : TESTNET_USDC_ISSUER;
  }
  if (code === 'BRL') {
    const configuredPublic = String(process.env.BRL_ISSUER_PUBLIC || '').trim();
    if (network === 'PUBLIC') {
      return configuredPublic || PUBLIC_BRL_ISSUER_NTOKENS;
    }
    const configuredTestnet = String(process.env.BRL_ISSUER_TESTNET || '').trim();
    return configuredTestnet || undefined;
  }
  if (code === 'TESOURO') {
    return String(process.env.TESOURO_ISSUER || '').trim() || ETHERFUSE_TESOURO_ISSUER;
  }
  return String(process.env[`${code}_ISSUER`] || '').trim() || undefined;
}

export function resolveConfiguredAsset(assetCode: unknown, providedIssuer?: unknown): AssetConfig {
  const code = normalizeAssetCode(assetCode);
  const issuer = getAssetIssuer(code, providedIssuer);
  return code === 'XLM' ? { code } : { code, issuer };
}

export function assetMatchesConfiguredIssuer(assetCode: unknown, assetIssuer?: unknown): boolean {
  const code = normalizeAssetCode(assetCode);
  if (code === 'XLM') return true;

  const expectedIssuer = getAssetIssuer(code);
  const actualIssuer = String(assetIssuer || '').trim();
  if (!expectedIssuer || !actualIssuer) return false;
  return actualIssuer === expectedIssuer;
}

export function getUserFacingAssetCodes(): string[] {
  const exposeInternalSettlementAssets = envFlag('EXPOSE_INTERNAL_SETTLEMENT_ASSETS', false);
  return ['BRL', 'USDC', ...(exposeInternalSettlementAssets ? ['TESOURO'] : [])];
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
  const includeBrl = envFlag('ENABLE_STELLAR_BRL_ASSET', false);
  const includeTesouro = envFlag('ENABLE_TESOURO_ASSET', true);
  const assetCodes = ['USDC', ...(includeBrl ? ['BRL'] : []), ...(includeTesouro ? ['TESOURO'] : [])];
  return assetCodes
    .map((code) => ({ code, issuer: getAssetIssuer(code) || '' }))
    .filter((asset) => Boolean(asset.issuer));
}

export function getTrustedPathAssetCodes(): string[] {
  const includeBrl = envFlag('ENABLE_STELLAR_BRL_ASSET', false);
  const includeTesouro = envFlag('ENABLE_TESOURO_ASSET', true);
  return ['USDC', ...(includeBrl ? ['BRL'] : []), ...(includeTesouro ? ['TESOURO'] : [])];
}
