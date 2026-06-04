export type AssetCode = 'XLM' | 'USDC' | 'TESOURO' | 'EURC' | 'CETES' | string;

export interface AssetConfig {
  code: AssetCode;
  issuer?: string;
}

export const PUBLIC_USDC_ISSUER = 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN';
export const TESTNET_USDC_ISSUER = 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';
export const DEFINDEX_TESTNET_USDC_ISSUER = 'GATALTGTWIOT6BUDBCZM3Q4OQ4BO2COLOAZ7IYSKPLC2PMSOPPGF5V56';
export const DEFINDEX_TESTNET_USDC_CONTRACT = 'CAQCFVLOBK5GIULPNZRGATJJMIZL5BSP7X5YJVMGCPTUEPFM4AVSRCJU';
export const DEFINDEX_TESTNET_USDC_VAULT = 'CBMVK2JK6NTOT2O4HNQAIQFJY232BHKGLIMXDVQVHIIZKDACXDFZDWHN';
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

export function isInitialUsdcConversionEnabled(): boolean {
  return envFlag('ONBOARDING_AUTO_CONVERT_TO_USDC', false);
}

export function isUsdcDefaultTrustlineEnabled(): boolean {
  return envFlag('ENABLE_USDC_DEFAULT_TRUSTLINE', false);
}

export function normalizeAssetCode(value: unknown): string {
  const code = String(value || 'XLM').trim().toUpperCase();
  if (!code || code === 'NATIVE') return 'XLM';
  if (code === 'USD') return 'USDC';
  if (['EUR', 'EURC'].includes(code)) {
    return 'CETES';
  }
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
  const networkSpecific = String(
    network === 'PUBLIC'
      ? process.env[`${code}_ISSUER_PUBLIC`] || ''
      : process.env[`${code}_ISSUER_TESTNET`] || ''
  ).trim();
  if (networkSpecific) return networkSpecific;
  return String(process.env[`${code}_ISSUER`] || '').trim() || undefined;
}

export function resolveConfiguredAsset(assetCode: unknown, providedIssuer?: unknown): AssetConfig {
  const code = settlementAssetCode(assetCode);
  const issuer = getAssetIssuer(code, providedIssuer);
  return code === 'XLM' ? { code } : { code, issuer };
}

export function getDefindexTestnetUsdcAsset(): AssetConfig & { code: 'USDC'; issuer: string; contract: string; vault: string } {
  return {
    code: 'USDC',
    issuer: DEFINDEX_TESTNET_USDC_ISSUER,
    contract: DEFINDEX_TESTNET_USDC_CONTRACT,
    vault: DEFINDEX_TESTNET_USDC_VAULT,
  };
}

export function isDefindexTestnetUsdcAsset(input: {
  code?: unknown;
  issuer?: unknown;
  contract?: unknown;
  vault?: unknown;
}): boolean {
  const code = settlementAssetCode(input.code || 'USDC');
  if (code !== 'USDC') return false;
  const issuer = String(input.issuer || '').trim();
  const contract = String(input.contract || '').trim();
  const vault = String(input.vault || '').trim();
  return issuer === DEFINDEX_TESTNET_USDC_ISSUER ||
    contract === DEFINDEX_TESTNET_USDC_CONTRACT ||
    vault === DEFINDEX_TESTNET_USDC_VAULT;
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
  const network = getStellarNetworkName();
  const includeCetes = envFlag('ENABLE_CETES_ASSET', network === 'TESTNET');
  return uniqueAssetCodes([
    ...(includeTesouro ? ['TESOURO'] : []),
    'USDC',
    ...(includeCetes ? ['CETES'] : []),
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
    .filter((code) => code !== 'USDC' || isUsdcDefaultTrustlineEnabled())
    .map((code) => ({ code, issuer: getAssetIssuer(code) || '' }))
    .filter((asset) => Boolean(asset.issuer));
}

export function getTrustedPathAssetCodes(): string[] {
  return getUserFacingAssetCodes();
}
