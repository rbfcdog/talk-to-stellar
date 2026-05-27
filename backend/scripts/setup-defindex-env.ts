import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { DefindexSDK, SupportedNetworks } from '@defindex/sdk';

type NetworkName = 'testnet' | 'mainnet';
type YieldAsset = 'USDC' | 'CETES' | 'EURC' | 'TESOURO' | 'XLM';

type VaultCandidate = {
  address: string;
  source: string;
  apy?: number | null;
};

type MatchedVault = VaultCandidate & {
  asset: YieldAsset;
  assetContract?: string;
  issuer?: string;
  label?: string;
};

const ASSETS: YieldAsset[] = ['USDC', 'CETES', 'XLM', 'EURC', 'TESOURO'];
const DEFAULT_BASE_URL = 'https://api.defindex.io';
const DEFAULT_TIMEOUT_MS = 30000;
const TESTNET_REGISTRY_URL = 'https://raw.githubusercontent.com/paltalabs/defindex/main/public/testnet.contracts.json';
const MAINNET_REGISTRY_URL = 'https://raw.githubusercontent.com/paltalabs/defindex/main/public/mainnet.contracts.json';

function argValue(name: string): string | undefined {
  const index = process.argv.indexOf(name);
  if (index === -1) return undefined;
  return process.argv[index + 1];
}

function hasFlag(name: string): boolean {
  return process.argv.includes(name);
}

function cleanBaseUrl(value: unknown): string {
  return String(value || DEFAULT_BASE_URL).trim().replace(/\/+$/, '') || DEFAULT_BASE_URL;
}

function normalizeNetwork(value: unknown): NetworkName {
  const network = String(value || '').trim().toLowerCase();
  return network === 'mainnet' || network === 'public' ? 'mainnet' : 'testnet';
}

function sdkNetwork(network: NetworkName): SupportedNetworks {
  return network === 'mainnet' ? SupportedNetworks.MAINNET : SupportedNetworks.TESTNET;
}

function normalizeAsset(value: unknown): YieldAsset | undefined {
  const raw = String(value || '').trim().toUpperCase();
  if (!raw) return undefined;
  if (raw === 'NATIVE') return 'XLM';
  if (raw === 'USD') return 'USDC';
  if (raw === 'EUR' || raw === 'EURO') return 'EURC';
  if (raw === 'BRL' || raw === 'REAL' || raw === 'REAIS') return 'TESOURO';
  return ASSETS.includes(raw as YieldAsset) ? raw as YieldAsset : undefined;
}

function extractIssuer(value: unknown): string | undefined {
  const text = String(value || '').trim();
  const match = text.match(/(?:^|[:\s])([G][A-Z2-7]{55})(?:$|\s)/);
  return match?.[1];
}

function registryUrl(network: NetworkName): string {
  return network === 'mainnet' ? MAINNET_REGISTRY_URL : TESTNET_REGISTRY_URL;
}

async function requestJson<T>(url: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(url, options);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = typeof payload === 'object' && payload && 'message' in payload
      ? String((payload as { message?: unknown }).message)
      : `HTTP ${response.status}`;
    throw new Error(`${url} failed: ${message}`);
  }
  return payload as T;
}

function registryCandidates(registry: any): VaultCandidate[] {
  const ids = registry?.ids && typeof registry.ids === 'object' ? registry.ids : {};
  return Object.entries(ids)
    .filter(([key, value]) => key.toLowerCase().includes('vault') && /^C[A-Z2-7]{55}$/.test(String(value || '')))
    .map(([key, value]) => ({
      address: String(value),
      source: `registry:${key}`,
    }));
}

function assetFromRegistrySource(source: string): YieldAsset | undefined {
  const key = source.toUpperCase();
  if (key.includes('USDC')) return 'USDC';
  if (key.includes('CETES')) return 'CETES';
  if (key.includes('EURC')) return 'EURC';
  if (key.includes('TESOURO')) return 'TESOURO';
  if (key.includes('XLM')) return 'XLM';
  return undefined;
}

async function discoverCandidates(baseUrl: string, network: NetworkName, apiKey?: string): Promise<VaultCandidate[]> {
  type DiscoverResponse = {
    vaults?: Array<{ address?: string; apy?: number | null }>;
  };
  const headers = apiKey ? { authorization: `Bearer ${apiKey}` } : undefined;
  const payload = await requestJson<DiscoverResponse>(`${baseUrl}/vault/discover?network=${network}`, { headers });
  return (payload.vaults || [])
    .filter((vault) => /^C[A-Z2-7]{55}$/.test(String(vault.address || '')))
    .map((vault) => ({
      address: String(vault.address),
      source: 'api:/vault/discover',
      apy: vault.apy,
    }));
}

async function getVaultInfo(
  sdk: DefindexSDK,
  baseUrl: string,
  network: NetworkName,
  address: string,
  apiKey?: string,
): Promise<any> {
  try {
    return await sdk.getVaultInfo(address, sdkNetwork(network));
  } catch (sdkError) {
    const headers = apiKey ? { authorization: `Bearer ${apiKey}` } : undefined;
    try {
      return await requestJson(`${baseUrl}/vault/${address}?network=${network}`, { headers });
    } catch {
      throw sdkError;
    }
  }
}

function matchesFromVaultInfo(candidate: VaultCandidate, info: any): MatchedVault[] {
  const assets = Array.isArray(info?.assets) ? info.assets : [];
  return assets
    .map((asset: any): MatchedVault | null => {
      const symbol = String(asset?.symbol || asset?.code || asset?.name || '').trim();
      const assetCode = normalizeAsset(symbol.split(':')[0]);
      if (!assetCode) return null;
      return {
        ...candidate,
        asset: assetCode,
        assetContract: String(asset?.address || '').trim() || undefined,
        issuer: extractIssuer(asset?.symbol) || extractIssuer(asset?.name),
        label: String(info?.name || info?.symbol || '').trim() || undefined,
      };
    })
    .filter((match: MatchedVault | null): match is MatchedVault => Boolean(match));
}

function renderEnv(input: {
  network: NetworkName;
  baseUrl: string;
  timeoutMs: number;
  enableExecution: boolean;
  complianceApproved: boolean;
  matches: Map<YieldAsset, MatchedVault>;
  factoryAddress?: string;
  warnings: string[];
}): string {
  const lines: string[] = [];
  const renderAssets = input.network === 'testnet'
    ? ASSETS.filter((asset) => asset !== 'EURC')
    : ASSETS;
  lines.push('# Generated by backend/scripts/setup-defindex-env.ts');
  lines.push(`# network=${input.network}`);
  if (input.factoryAddress) lines.push(`# Defindex factory: ${input.factoryAddress}`);
  lines.push('DEFINDEX_BASE_URL=' + input.baseUrl);
  lines.push('DEFINDEX_NETWORK=' + input.network);
  lines.push('DEFINDEX_TIMEOUT_MS=' + input.timeoutMs);
  lines.push('DEFINDEX_ENABLE_EXECUTION=' + (input.enableExecution ? 'true' : 'false'));
  lines.push('DEFINDEX_COMPLIANCE_APPROVED=' + (input.complianceApproved ? 'true' : 'false'));
  lines.push('DEFINDEX_ALLOW_MAINNET_EXECUTION=false');
  lines.push('');
  for (const asset of renderAssets) {
    const match = input.matches.get(asset);
    if (!match) continue;
    lines.push(`DEFINDEX_${asset}_VAULT=${match.address}`);
    if (match?.source) lines.push(`# ${asset} source: ${match.source}${match.apy == null ? '' : `, apy=${match.apy}`}`);
    if (match?.assetContract) lines.push(`# ${asset} asset_contract: ${match.assetContract}`);
  }
  lines.push('');
  if (input.network === 'testnet') {
    lines.push('ENABLE_CETES_ASSET=true');
    lines.push('ENABLE_EURC_ASSET=false');
  } else {
    lines.push('ENABLE_EURC_ASSET=true');
  }
  for (const asset of renderAssets) {
    const match = input.matches.get(asset);
    if (asset === 'USDC') continue;
    if (!match?.issuer || asset === 'XLM') continue;
    lines.push(`${asset}_ISSUER_${input.network === 'mainnet' ? 'PUBLIC' : 'TESTNET'}=${match.issuer}`);
  }
  if (input.network === 'mainnet' && !input.matches.get('EURC')?.issuer) {
    lines.push('EURC_ISSUER_PUBLIC=GDHU6WRG4IEQXM5NZ4BMPKOXHW76MZM4Y2IEMFDVXBSDP6SJY4ITNPP2');
  }
  lines.push(`TTS_VISIBLE_ASSET_CODES=${input.network === 'testnet' ? 'TESOURO,USDC,CETES,XLM' : 'TESOURO,USDC,EURC,XLM'}`);
  if (input.warnings.length) {
    lines.push('');
    input.warnings.forEach((warning) => lines.push(`# WARNING: ${warning}`));
  }
  return `${lines.join('\n')}\n`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
  const envFile = path.resolve(process.cwd(), argValue('--env-file') || '.env');
  dotenv.config({ path: envFile });

  const network = normalizeNetwork(argValue('--network') || process.env.DEFINDEX_NETWORK || process.env.STELLAR_NETWORK);
  const baseUrl = cleanBaseUrl(argValue('--base-url') || process.env.DEFINDEX_BASE_URL || process.env.DEFINDEX_API_URL);
  const timeoutMs = Number(argValue('--timeout-ms') || process.env.DEFINDEX_TIMEOUT_MS || DEFAULT_TIMEOUT_MS);
  const apiKey = String(process.env.DEFINDEX_API_KEY || '').trim();
  const discover = !hasFlag('--no-discover');
  const validateLimit = Number(argValue('--limit') || 40);
  const delayMs = Number(argValue('--delay-ms') || 250);
  const enableExecution = hasFlag('--enable-execution');
  const complianceApproved = hasFlag('--compliance-approved');
  const warnings: string[] = [];
  if (enableExecution && !complianceApproved) {
    warnings.push('Execution will still stay in review mode until DEFINDEX_COMPLIANCE_APPROVED=true is set.');
  }
  if (enableExecution && network === 'mainnet') {
    warnings.push('DEFINDEX_ENABLE_EXECUTION=true is not enough for mainnet. Backend also requires DEFINDEX_ALLOW_MAINNET_EXECUTION=true.');
  }

  if (!apiKey) {
    throw new Error(`DEFINDEX_API_KEY is required. Load it through ${envFile} or the process environment.`);
  }

  const sdk = new DefindexSDK({
    apiKey,
    baseUrl,
    timeout: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : DEFAULT_TIMEOUT_MS,
    defaultNetwork: sdkNetwork(network),
  });

  const health = await sdk.healthCheck();
  if (health?.status && health.status.reachable === false) {
    warnings.push('Defindex healthCheck returned reachable=false.');
  }

  const factory = await sdk.getFactoryAddress(sdkNetwork(network)).catch((error: Error) => {
    warnings.push(`Could not fetch factory address: ${error.message}`);
    return undefined;
  });

  const registry = await requestJson<any>(registryUrl(network)).catch((error: Error) => {
    warnings.push(`Could not fetch public Defindex registry: ${error.message}`);
    return undefined;
  });

  const candidatesByAddress = new Map<string, VaultCandidate>();
  registryCandidates(registry).forEach((candidate) => candidatesByAddress.set(candidate.address, candidate));

  if (discover) {
    const discovered = await discoverCandidates(baseUrl, network, apiKey).catch((error: Error) => {
      warnings.push(`Could not discover vaults from API: ${error.message}`);
      return [];
    });
    discovered.forEach((candidate) => {
      const existing = candidatesByAddress.get(candidate.address);
      candidatesByAddress.set(candidate.address, existing
        ? { ...existing, apy: candidate.apy ?? existing.apy }
        : candidate);
    });
  }

  const matches = new Map<YieldAsset, MatchedVault>();
  const candidates = Array.from(candidatesByAddress.values()).slice(0, validateLimit);

  for (const candidate of candidates) {
    if (matches.size === ASSETS.length) break;
    const registryAsset = assetFromRegistrySource(candidate.source);
    try {
      const info = await getVaultInfo(sdk, baseUrl, network, candidate.address, apiKey);
      const inferred = matchesFromVaultInfo(candidate, info);
      for (const match of inferred) {
        if (!matches.has(match.asset)) matches.set(match.asset, match);
      }
      if (registryAsset && !matches.has(registryAsset)) {
        matches.set(registryAsset, {
          ...candidate,
          asset: registryAsset,
          label: String(info?.name || info?.symbol || '').trim() || undefined,
        });
      }
    } catch (error) {
      if (registryAsset && !matches.has(registryAsset)) {
        matches.set(registryAsset, { ...candidate, asset: registryAsset });
        warnings.push(`Using ${registryAsset} registry vault without live info validation: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    if (delayMs > 0) await sleep(delayMs);
  }

  for (const asset of ASSETS) {
    if (network === 'testnet' && asset === 'EURC') continue;
    if (!matches.has(asset)) {
      warnings.push(`No ${asset} vault was found on ${network}. Create/select one in Defindex or ask PaltaLabs/Defindex for a validated vault address.`);
    }
  }
  if (network === 'testnet' && matches.has('EURC')) {
    warnings.push('EURC was found in testnet discovery but this app uses CETES instead of EURC on testnet.');
  }

  const envOutput = renderEnv({
    network,
    baseUrl,
    timeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : DEFAULT_TIMEOUT_MS,
    enableExecution,
    complianceApproved,
    matches,
    factoryAddress: factory?.address,
    warnings,
  });

  const writePath = argValue('--write');
  if (writePath) {
    const resolved = path.resolve(process.cwd(), writePath);
    fs.writeFileSync(resolved, envOutput);
    console.error(`Wrote Defindex env block to ${resolved}`);
  } else {
    process.stdout.write(envOutput);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
