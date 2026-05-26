export type AssetCode = 'XLM' | 'USDC' | 'TESOURO' | 'EURC' | string;

export interface AssetConfig {
  code: AssetCode;
  issuer?: string;
}

export const PUBLIC_USDC_ISSUER = 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN';
export const TESTNET_USDC_ISSUER = 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';
export const ETHERFUSE_TESOURO_ISSUER = 'GC3CW7EDYRTWQ635VDIGY6S4ZUF5L6TQ7AA4MWS7LEQDBLUSZXV7UPS4';

function envFlag(name: string, fallback: boolean): boolean {
  const raw = String(process.env[name] || '').trim().toLowerCase();
  if (!raw) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(raw);
}

function parseAssetCodeList(value: unknown): string[] {
  return String(value || '')
    .split(/[,\s]+/)
    .map((item) => settlementAssetCode(item))
    .filter(Boolean);
}

function uniqueAssetCodes(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => settlementAssetCode(value)).filter(Boolean)));
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
  if (['EUR', 'EURO', 'EUROS'].includes(code)) return 'EURC';
  return code;
}

export function settlementAssetCode(value: unknown): string {
  const code = normalizeAssetCode(value);
  return code === 'BRL' || code === 'REAL' || code === 'REAIS' || code === 'R$'
    ? 'TESOURO'
    : code;
}

export function userFacingAssetCode(value: unknown): string {
  const code = normalizeAssetCode(value);
  if (code === 'TESOURO') return 'BRL';
  if (code === 'EURC') return 'EUR';
  return code;
}

export function getAssetIssuer(assetCode: unknown, providedIssuer?: unknown): string | undefined {
  const code = settlementAssetCode(assetCode);
  const provided = String(providedIssuer || '').trim();
  const network = getStellarNetworkName();
  if (code === 'XLM') return undefined;
  if (provided) return provided;
  if (code === 'USDC') {
    const configured = String(process.env.USDC_ISSUER || '').trim();
    if (configured) return configured;
    return network === 'PUBLIC' ? PUBLIC_USDC_ISSUER : TESTNET_USDC_ISSUER;
  }
  if (code === 'TESOURO') {
    return String(process.env.TESOURO_ISSUER || '').trim() || ETHERFUSE_TESOURO_ISSUER;
  }
  if (code === 'EURC') {
    const networkSpecific = String(
      network === 'PUBLIC'
        ? process.env.EURC_ISSUER_PUBLIC || process.env.EUR_ISSUER_PUBLIC || ''
        : process.env.EURC_ISSUER_TESTNET || process.env.EUR_ISSUER_TESTNET || ''
    ).trim();
    if (networkSpecific) return networkSpecific;
    return String(process.env.EURC_ISSUER || process.env.EUR_ISSUER || '').trim() || undefined;
  }
  return String(process.env[`${code}_ISSUER`] || '').trim() || undefined;
}

export function resolveConfiguredAsset(assetCode: unknown, providedIssuer?: unknown): AssetConfig {
  const code = settlementAssetCode(assetCode);
  const issuer = getAssetIssuer(code, providedIssuer);
  return code === 'XLM' ? { code } : { code, issuer };
}

export function assetMatchesConfiguredIssuer(assetCode: unknown, assetIssuer?: unknown): boolean {
  const expected = resolveConfiguredAsset(assetCode);
  if (expected.code === 'XLM') return true;

  const expectedIssuer = expected.issuer || getAssetIssuer(expected.code);
  const actualIssuer = String(assetIssuer || '').trim();
  if (!expectedIssuer || !actualIssuer) return false;
  return actualIssuer === expectedIssuer;
}

export function getUserFacingAssetCodes(): string[] {
  const configured = parseAssetCodeList(
    process.env.TTS_VISIBLE_ASSET_CODES ||
    process.env.VISIBLE_ASSET_CODES ||
    process.env.SUPPORTED_ASSET_CODES
  );
  const includeTesouro = envFlag('ENABLE_TESOURO_ASSET', true);
  const includeEurc = envFlag('ENABLE_EURC_ASSET', true);
  return uniqueAssetCodes([
    ...(includeTesouro ? ['TESOURO'] : []),
    'USDC',
    ...(includeEurc ? ['EURC'] : []),
    ...configured,
  ]);
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
  const assetCodes = getUserFacingAssetCodes();
  return assetCodes
    .map((code) => ({ code, issuer: getAssetIssuer(code) || '' }))
    .filter((asset) => Boolean(asset.issuer));
}

export function getTrustedPathAssetCodes(): string[] {
  return getUserFacingAssetCodes();
}
