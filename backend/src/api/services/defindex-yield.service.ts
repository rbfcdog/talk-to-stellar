import { Asset, Keypair, TransactionBuilder } from '@stellar/stellar-sdk';
import { DefindexSDK, SupportedNetworks } from '@defindex/sdk';
import { stellarConfig } from '../../config/stellar';
import {
  DEFINDEX_TESTNET_USDC_VAULT,
  getAssetIssuer,
  getDefindexTestnetUsdcAsset,
  getStellarNetworkName,
  isDefindexTestnetUsdcAsset,
  normalizeAssetCode,
  userFacingAssetCode,
} from '../../config/assets';
import { logger } from '../../utils/logger';
import { errorLogFields, errorLogMessage } from '../../utils/error-log';

export type DefindexNetwork = 'testnet' | 'mainnet';
export type DefindexYieldAction = 'deposit' | 'withdraw';

export type DefindexVaultConfig = {
  asset_code: string;
  asset_issuer?: string;
  asset_contract?: string;
  vault_address: string;
  label: string;
  network: DefindexNetwork;
  enabled: boolean;
};

export type DefindexVaultAssetInfo = {
  asset_code: string;
  asset_issuer?: string;
  asset_contract?: string;
  source: 'vault_info' | 'configured' | 'hardcoded';
};

export type DefindexVaultAssetCompatibility = {
  compatible: boolean;
  info: DefindexVaultAssetInfo;
  configured_issuer?: string;
  configured_contract?: string;
  reason?: string;
  hardcoded_asset_override?: boolean;
  requires_wallet_asset_conversion?: boolean;
  wallet_source_asset?: { code: string; issuer?: string };
  vault_deposit_asset?: { code: string; issuer?: string; contract?: string };
};

export type DefindexRuntimeInfo = {
  provider: 'defindex';
  configured: boolean;
  api_key_configured: boolean;
  base_url: string;
  network: DefindexNetwork;
  stellar_network: DefindexNetwork;
  network_mismatch: boolean;
  execution_requested: boolean;
  execution_enabled: boolean;
  compliance_approved: boolean;
  compliance_mode: 'review_only' | 'approved_execution';
  mainnet_execution_allowed: boolean;
  vaults: DefindexVaultConfig[];
  disclosure: {
    environment: DefindexNetwork;
    source: 'defindex';
    rate_label: 'estimated_historical_apy';
    testnet: boolean;
    not_guaranteed: true;
    not_investment_advice: true;
    not_bank_deposit: true;
  };
  unavailable_reason?: string;
  execution_blocked_reason?: string;
};

function coalesceString(...values: unknown[]): string {
  for (const value of values) {
    const text = String(value || '').trim();
    if (text) return text;
  }
  return '';
}

function maskLogValue(value: unknown, start = 6, end = 4): string | undefined {
  const text = String(value || '').trim();
  if (!text) return undefined;
  if (text.length <= start + end + 3) return `${text.slice(0, 2)}...`;
  return `${text.slice(0, start)}...${text.slice(-end)}`;
}

function debugErrorMessage(error: unknown): string {
  return errorLogMessage(error);
}

function logDefindexSdk(level: 'debug' | 'info' | 'warn' | 'error', event: string, fields: Record<string, unknown> = {}): void {
  const safeFields: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined || value === null || value === '') continue;
    if (!key.startsWith('has_') && /secret|token|xdr|raw/i.test(key)) {
      safeFields[key] = '[redacted]';
      continue;
    }
    safeFields[key] = value;
  }
  logger[level](`[defindex] event=${event} ${JSON.stringify(safeFields)}`);
}

function envFlag(name: string, fallback = false): boolean {
  const raw = String(process.env[name] || '').trim().toLowerCase();
  if (!raw) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(raw);
}

function cleanBaseUrl(value: unknown): string {
  return coalesceString(value, 'https://api.defindex.io').replace(/\/+$/, '');
}

function defindexBaseUrl(): string {
  return cleanBaseUrl(process.env.DEFINDEX_BASE_URL || process.env.DEFINDEX_API_URL);
}

function defindexTimeoutMs(): number {
  const timeoutMs = Number(process.env.DEFINDEX_TIMEOUT_MS || 30000);
  return Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 30000;
}

function defaultNetwork(): DefindexNetwork {
  const explicit = coalesceString(process.env.DEFINDEX_NETWORK).toLowerCase();
  if (explicit === 'mainnet' || explicit === 'public') return 'mainnet';
  if (explicit === 'testnet') return 'testnet';
  return getStellarNetworkName() === 'PUBLIC' ? 'mainnet' : 'testnet';
}

function stellarRuntimeNetwork(): DefindexNetwork {
  return getStellarNetworkName() === 'PUBLIC' ? 'mainnet' : 'testnet';
}

function normalizeVaultAsset(value: unknown): string {
  const normalized = normalizeAssetCode(value);
  if (normalized === 'BRL' || normalized === 'TESOURO') return 'TESOURO';
  return normalized;
}

function extractIssuer(value: unknown): string {
  const text = coalesceString(value);
  const match = text.match(/G[A-Z2-7]{55}/);
  return match?.[0] || '';
}

function configuredAssetContract(assetCode: unknown, assetIssuer?: unknown): string | undefined {
  const code = normalizeVaultAsset(assetCode);
  const issuer = coalesceString(assetIssuer, getAssetIssuer(code));
  if (code === 'XLM' || !issuer) return undefined;
  try {
    return new Asset(code, issuer).contractId(stellarConfig.network);
  } catch {
    return undefined;
  }
}

function parseVaultEntry(value: any, fallbackNetwork: DefindexNetwork): DefindexVaultConfig | null {
  const vaultAddress = coalesceString(value?.vault_address, value?.vaultAddress, value?.address, value?.contract_id, value?.contractId);
  const assetCode = normalizeVaultAsset(coalesceString(value?.asset_code, value?.assetCode, value?.asset, value?.code));
  if (!vaultAddress || !assetCode) return null;
  const networkRaw = coalesceString(value?.network).toLowerCase();
  const network: DefindexNetwork = networkRaw === 'mainnet' || networkRaw === 'public' ? 'mainnet' : networkRaw === 'testnet' ? 'testnet' : fallbackNetwork;
  const hardcodedUsdc = network === 'testnet' &&
    assetCode === 'USDC' &&
    vaultAddress === DEFINDEX_TESTNET_USDC_VAULT
    ? getDefindexTestnetUsdcAsset()
    : undefined;
  return {
    asset_code: assetCode,
    asset_issuer: hardcodedUsdc?.issuer || coalesceString(value?.asset_issuer, value?.assetIssuer) || getAssetIssuer(assetCode),
    asset_contract: hardcodedUsdc?.contract || coalesceString(value?.asset_contract, value?.assetContract),
    vault_address: vaultAddress,
    label: coalesceString(value?.label, value?.name, `${userFacingAssetCode(assetCode)} Yield Vault`),
    network,
    enabled: value?.enabled === undefined ? true : Boolean(value.enabled),
  };
}

function parseVaultsFromJson(fallbackNetwork: DefindexNetwork): DefindexVaultConfig[] {
  const raw = coalesceString(process.env.DEFINDEX_VAULTS_JSON);
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    const entries = Array.isArray(parsed) ? parsed : Object.entries(parsed).map(([asset, config]) => ({
      asset,
      ...(config && typeof config === 'object' ? config as Record<string, unknown> : { vault_address: config }),
    }));
    return entries
      .map((entry) => parseVaultEntry(entry, fallbackNetwork))
      .filter((entry): entry is DefindexVaultConfig => Boolean(entry));
  } catch (error) {
    console.warn('[defindex] Could not parse DEFINDEX_VAULTS_JSON:', error instanceof Error ? error.message : String(error));
    return [];
  }
}

function parseVaultsFromEnv(fallbackNetwork: DefindexNetwork): DefindexVaultConfig[] {
  const candidates: Array<{ asset: string; env: string; label: string }> = [
    { asset: 'USDC', env: 'DEFINDEX_USDC_VAULT', label: 'USDC Yield Vault' },
    { asset: 'CETES', env: 'DEFINDEX_CETES_VAULT', label: 'CETES Yield Vault' },
    ...(fallbackNetwork === 'testnet' ? [] : [{ asset: 'EURC', env: 'DEFINDEX_EURC_VAULT', label: 'EUR Yield Vault' }]),
    { asset: 'XLM', env: 'DEFINDEX_XLM_VAULT', label: 'XLM Yield Vault' },
    { asset: 'TESOURO', env: 'DEFINDEX_TESOURO_VAULT', label: 'Real Yield Vault' },
  ];
  return candidates
    .map((candidate) => parseVaultEntry({
      asset_code: candidate.asset,
      vault_address: process.env[candidate.env],
      label: candidate.label,
    }, fallbackNetwork))
    .filter((entry): entry is DefindexVaultConfig => Boolean(entry));
}

function parseAmountToContractUnits(value: unknown, decimals = 7): number {
  const raw = coalesceString(value).replace(/\s+/g, '').replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(raw)) {
    throw new Error('amount must be a positive decimal amount.');
  }
  const [whole, fraction = ''] = raw.split('.');
  const paddedFraction = fraction.padEnd(decimals, '0').slice(0, decimals);
  const units = BigInt(whole || '0') * (BigInt(10) ** BigInt(decimals)) + BigInt(paddedFraction || '0');
  if (units <= BigInt(0)) throw new Error('amount must be greater than zero.');
  if (units > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error('amount is too large for Defindex API numeric payload.');
  }
  return Number(units);
}

function extractXdr(payload: any): string {
  return coalesceString(
    payload?.xdr,
    payload?.transactionXDR,
    payload?.transaction_xdr,
    payload?.unsigned_xdr,
    payload?.unsignedXdr,
  );
}

function extractHash(payload: any): string {
  return coalesceString(payload?.txHash, payload?.hash, payload?.transaction_hash, payload?.transactionHash, payload?.id);
}

function assetInfoFromVaultInfo(vault: DefindexVaultConfig, info: any): DefindexVaultAssetInfo {
  const assets = Array.isArray(info?.assets) ? info.assets : [];
  const wanted = normalizeVaultAsset(vault.asset_code);
  const match = assets.find((asset: any) => normalizeVaultAsset(asset?.symbol || asset?.code || asset?.name) === wanted) || assets[0];
  const issuer = extractIssuer(match?.name) || extractIssuer(match?.symbol) || extractIssuer(match?.code);
  const hardcodedUsdc = vault.network === 'testnet' && isDefindexTestnetUsdcAsset({
    code: wanted,
    issuer: issuer || vault.asset_issuer,
    contract: coalesceString(match?.address, vault.asset_contract),
    vault: vault.vault_address,
  })
    ? getDefindexTestnetUsdcAsset()
    : undefined;
  return {
    asset_code: wanted,
    asset_issuer: issuer || hardcodedUsdc?.issuer || vault.asset_issuer || getAssetIssuer(wanted),
    asset_contract: coalesceString(match?.address, hardcodedUsdc?.contract, vault.asset_contract),
    source: match ? 'vault_info' : hardcodedUsdc ? 'hardcoded' : 'configured',
  };
}

function sdkNetwork(network?: DefindexNetwork): SupportedNetworks {
  return (network || defaultNetwork()) === 'mainnet'
    ? SupportedNetworks.MAINNET
    : SupportedNetworks.TESTNET;
}

export class DefindexYieldService {
  private static vaultAssetInfoCache = new Map<string, Promise<DefindexVaultAssetInfo>>();

  static getRuntimeInfo(): DefindexRuntimeInfo {
    const network = defaultNetwork();
    const stellarNetwork = stellarRuntimeNetwork();
    const networkMismatch = network !== stellarNetwork;
    const executionRequested = envFlag('DEFINDEX_ENABLE_EXECUTION', network === 'testnet');
    const complianceApproved = network === 'testnet' || envFlag('DEFINDEX_COMPLIANCE_APPROVED', false);
    const mainnetExecutionAllowed = envFlag('DEFINDEX_ALLOW_MAINNET_EXECUTION', false);
    const apiKey = coalesceString(process.env.DEFINDEX_API_KEY);
    const vaults = [
      ...parseVaultsFromJson(network),
      ...parseVaultsFromEnv(network),
    ].filter((vault, index, all) => (
      vault.enabled &&
      vault.network === network &&
      all.findIndex((candidate) => candidate.asset_code === vault.asset_code && candidate.vault_address === vault.vault_address) === index
    ));
    const configured = Boolean(apiKey && vaults.length);
    const executionBlockedReason = executionRequested
      ? networkMismatch
        ? `DEFINDEX_NETWORK=${network} must match STELLAR_NETWORK=${stellarNetwork} before executing review transactions.`
        : !complianceApproved
          ? 'Review execution requires DEFINDEX_COMPLIANCE_APPROVED=true after legal and compliance approval.'
          : network === 'mainnet' && !mainnetExecutionAllowed
            ? 'Mainnet Defindex execution requires DEFINDEX_ALLOW_MAINNET_EXECUTION=true. Keep this unset for testnet.'
            : configured
              ? undefined
              : !apiKey
                ? 'DEFINDEX_API_KEY is not configured.'
                : 'No Defindex vault address is configured for the active network.'
      : undefined;
    const executionEnabled = executionRequested &&
      complianceApproved &&
      configured &&
      !networkMismatch &&
      (network === 'testnet' || mainnetExecutionAllowed);
    return {
      provider: 'defindex',
      configured,
      api_key_configured: Boolean(apiKey),
      base_url: defindexBaseUrl(),
      network,
      stellar_network: stellarNetwork,
      network_mismatch: networkMismatch,
      execution_requested: executionRequested,
      execution_enabled: executionEnabled,
      compliance_approved: complianceApproved,
      compliance_mode: executionEnabled ? 'approved_execution' : 'review_only',
      mainnet_execution_allowed: mainnetExecutionAllowed,
      vaults,
      disclosure: {
        environment: network,
        source: 'defindex',
        rate_label: 'estimated_historical_apy',
        testnet: network === 'testnet',
        not_guaranteed: true,
        not_investment_advice: true,
        not_bank_deposit: true,
      },
      unavailable_reason: configured
        ? undefined
        : !apiKey
          ? 'DEFINDEX_API_KEY is not configured.'
          : 'No Defindex vault address is configured for the active network.',
      execution_blocked_reason: executionBlockedReason,
    };
  }

  static amountToContractUnits(value: unknown, decimals = 7): number {
    return parseAmountToContractUnits(value, decimals);
  }

  static resolveVault(assetCode?: unknown, vaultAddress?: unknown): DefindexVaultConfig | undefined {
    const runtime = this.getRuntimeInfo();
    const wantedVault = coalesceString(vaultAddress);
    const wantedAsset = normalizeVaultAsset(assetCode || 'USDC');
    return runtime.vaults.find((vault) => (
      wantedVault
        ? vault.vault_address === wantedVault
        : vault.asset_code === wantedAsset || userFacingAssetCode(vault.asset_code) === userFacingAssetCode(wantedAsset)
    ));
  }

  static requireVault(assetCode?: unknown, vaultAddress?: unknown): DefindexVaultConfig {
    const runtime = this.getRuntimeInfo();
    if (!runtime.api_key_configured) {
      throw new Error('DEFINDEX_API_KEY is required for application operations.');
    }
    if (runtime.network_mismatch) {
      throw new Error(`DEFINDEX_NETWORK=${runtime.network} must match STELLAR_NETWORK=${runtime.stellar_network} before application operations.`);
    }
    const vault = this.resolveVault(assetCode, vaultAddress);
    if (!vault) {
      throw new Error(`No Defindex vault configured for ${userFacingAssetCode(assetCode || 'USDC')} on ${runtime.network}.`);
    }
    return vault;
  }

  private static sdk(network = defaultNetwork()): DefindexSDK {
    return new DefindexSDK({
      apiKey: coalesceString(process.env.DEFINDEX_API_KEY),
      baseUrl: defindexBaseUrl(),
      timeout: defindexTimeoutMs(),
      defaultNetwork: sdkNetwork(network),
    });
  }

  static async healthCheck(): Promise<any> {
    return this.sdk().healthCheck().catch((error) => ({
      reachable: false,
      error: error instanceof Error ? error.message : String(error),
    }));
  }

  static async getVaultInfo(vaultAddress: string, network = defaultNetwork()): Promise<any> {
    return this.sdk(network).getVaultInfo(vaultAddress, sdkNetwork(network));
  }

  static async getVaultAssetInfo(vault: DefindexVaultConfig): Promise<DefindexVaultAssetInfo> {
    const key = `${vault.network}:${vault.vault_address}:${vault.asset_code}`;
    if (!this.vaultAssetInfoCache.has(key)) {
      const run = this.getVaultInfo(vault.vault_address, vault.network)
        .then((info) => assetInfoFromVaultInfo(vault, info))
        .catch((error) => {
          logDefindexSdk('warn', 'vault_asset_info_failed', {
            asset_code: vault.asset_code,
            vault_address: maskLogValue(vault.vault_address),
            network: vault.network,
            ...errorLogFields(error),
          });
          return {
            asset_code: vault.asset_code,
            asset_issuer: vault.asset_issuer || getAssetIssuer(vault.asset_code),
            asset_contract: vault.asset_contract,
            source: 'configured' as const,
          };
        });
      this.vaultAssetInfoCache.set(key, run);
    }
    return this.vaultAssetInfoCache.get(key)!;
  }

  static async getVaultAssetCompatibility(vault: DefindexVaultConfig): Promise<DefindexVaultAssetCompatibility> {
    const info = await this.getVaultAssetInfo(vault);
    const configuredIssuer = getAssetIssuer(vault.asset_code);
    const configuredContract = configuredAssetContract(vault.asset_code, configuredIssuer);
    const vaultIssuer = coalesceString(info.asset_issuer);
    const vaultContract = coalesceString(info.asset_contract);
    const issuerMismatch = Boolean(vaultIssuer && configuredIssuer && vaultIssuer !== configuredIssuer);
    const contractMismatch = Boolean(vaultContract && configuredContract && vaultContract !== configuredContract);
    if (issuerMismatch || contractMismatch) {
      const hardcodedUsdc = vault.network === 'testnet' && isDefindexTestnetUsdcAsset({
        code: vault.asset_code,
        issuer: vaultIssuer,
        contract: vaultContract,
        vault: vault.vault_address,
      })
        ? getDefindexTestnetUsdcAsset()
        : undefined;
      if (hardcodedUsdc) {
        return {
          compatible: true,
          info: {
            ...info,
            asset_issuer: hardcodedUsdc.issuer,
            asset_contract: hardcodedUsdc.contract,
          },
          configured_issuer: configuredIssuer,
          configured_contract: configuredContract,
          hardcoded_asset_override: true,
          requires_wallet_asset_conversion: configuredIssuer !== hardcodedUsdc.issuer,
          wallet_source_asset: configuredIssuer ? { code: 'USDC', issuer: configuredIssuer } : undefined,
          vault_deposit_asset: {
            code: 'USDC',
            issuer: hardcodedUsdc.issuer,
            contract: hardcodedUsdc.contract,
          },
          reason: 'DeFindex testnet USDC vault uses a hardcoded USDC issuance distinct from the wallet USDC rail.',
        };
      }
      const vaultDepositIssuer = vaultIssuer || vault.asset_issuer;
      if (configuredIssuer && vaultDepositIssuer && configuredIssuer !== vaultDepositIssuer) {
        return {
          compatible: true,
          info: {
            ...info,
            asset_issuer: vaultDepositIssuer,
          },
          configured_issuer: configuredIssuer,
          configured_contract: configuredContract,
          requires_wallet_asset_conversion: true,
          wallet_source_asset: { code: vault.asset_code, issuer: configuredIssuer },
          vault_deposit_asset: {
            code: vault.asset_code,
            issuer: vaultDepositIssuer,
            contract: vaultContract || vault.asset_contract,
          },
          reason: `Vault ${vault.asset_code} uses a different issuance than the configured wallet rail; conversion is required before execution.`,
        };
      }
      return {
        compatible: false,
        info,
        configured_issuer: configuredIssuer,
        configured_contract: configuredContract,
        reason: `Vault ${vault.asset_code} asset does not expose an issuer that can be converted from the configured wallet rail.`,
      };
    }
    return {
      compatible: true,
      info,
      configured_issuer: configuredIssuer,
      configured_contract: configuredContract,
      vault_deposit_asset: {
        code: vault.asset_code,
        issuer: info.asset_issuer || vault.asset_issuer || configuredIssuer,
        contract: info.asset_contract || vault.asset_contract || configuredContract,
      },
    };
  }

  static async getVaultTrustedAssets(): Promise<Array<{ code: string; issuer: string }>> {
    const runtime = this.getRuntimeInfo();
    const assets: Array<{ code: string; issuer: string }> = [];
    for (const vault of runtime.vaults) {
      if (vault.asset_code === 'XLM') continue;
      const info = await this.getVaultAssetInfo(vault);
      const issuer = coalesceString(info.asset_issuer, vault.asset_issuer, getAssetIssuer(vault.asset_code));
      if (issuer) assets.push({ code: vault.asset_code, issuer });
    }
    return Array.from(
      new Map(assets.map((asset) => [`${asset.code}:${asset.issuer}`, asset])).values()
    );
  }

  static async getVaultAPY(vaultAddress: string, network = defaultNetwork()): Promise<any> {
    try {
      const result = await this.sdk(network).getVaultAPY(vaultAddress, sdkNetwork(network));
      logDefindexSdk('debug', 'sdk_get_apy_success', { vault_address: maskLogValue(vaultAddress), network });
      return result;
    } catch (error) {
      logDefindexSdk('warn', 'sdk_get_apy_failed', { vault_address: maskLogValue(vaultAddress), network, ...errorLogFields(error) });
      // DeFindex vaults are mainnet contracts — testnet APY data doesn't exist.
      // Fall back to mainnet to get reference APY for projected return display.
      if (network === 'testnet') {
        try {
          const mainnetResult = await this.sdk('mainnet').getVaultAPY(vaultAddress, sdkNetwork('mainnet'));
          logDefindexSdk('info', 'sdk_get_apy_mainnet_reference', { vault_address: maskLogValue(vaultAddress) });
          return { ...mainnetResult, source: 'mainnet_reference', testnet_estimated: true };
        } catch (fallbackErr) {
          logDefindexSdk('warn', 'sdk_get_apy_mainnet_reference_failed', { vault_address: maskLogValue(vaultAddress), ...errorLogFields(fallbackErr) });
        }
      }
      throw error;
    }
  }

  static async getVaultBalance(vaultAddress: string, caller: string, network = defaultNetwork()): Promise<any> {
    try {
      const result = await this.sdk(network).getVaultBalance(vaultAddress, caller, sdkNetwork(network));
      logDefindexSdk('info', 'sdk_get_balance_success', { vault_address: maskLogValue(vaultAddress), caller: maskLogValue(caller), network });
      return result;
    } catch (error) {
      logDefindexSdk('warn', 'sdk_get_balance_failed', { vault_address: maskLogValue(vaultAddress), caller: maskLogValue(caller), network, ...errorLogFields(error) });
      // DeFindex vaults are mainnet contracts — try reading real on-chain balance from mainnet.
      // If the wallet has a real mainnet deposit, this returns the live growing balance.
      if (network === 'testnet') {
        try {
          const mainnetResult = await this.sdk('mainnet').getVaultBalance(vaultAddress, caller, sdkNetwork('mainnet'));
          logDefindexSdk('info', 'sdk_get_balance_mainnet_fallback', { vault_address: maskLogValue(vaultAddress), caller: maskLogValue(caller) });
          return { ...mainnetResult, source: 'mainnet_balance', testnet_fallback: true };
        } catch (fallbackErr) {
          logDefindexSdk('warn', 'sdk_get_balance_mainnet_fallback_failed', { vault_address: maskLogValue(vaultAddress), caller: maskLogValue(caller), ...errorLogFields(fallbackErr) });
        }
      }
      throw error;
    }
  }

  static async buildVaultAction(input: {
    action: DefindexYieldAction;
    vaultAddress: string;
    caller: string;
    amountUnits: number;
    network?: DefindexNetwork;
    invest?: boolean;
    slippageBps?: number;
  }): Promise<{ xdr: string; raw: any }> {
    const network = input.network || defaultNetwork();
    const sdk = this.sdk(network);
    const body = {
      amounts: [input.amountUnits],
      caller: input.caller,
      slippageBps: Number.isFinite(input.slippageBps) ? input.slippageBps : 100,
    };
    logDefindexSdk('info', 'sdk_build_action_start', {
      action: input.action,
      vault_address: maskLogValue(input.vaultAddress),
      caller: maskLogValue(input.caller),
      amount_units: input.amountUnits,
      network,
      invest: input.invest !== false,
      slippage_bps: body.slippageBps,
    });
    try {
      const raw = input.action === 'deposit'
        ? await sdk.depositToVault(input.vaultAddress, { ...body, invest: input.invest !== false }, sdkNetwork(network))
        : await sdk.withdrawFromVault(input.vaultAddress, body, sdkNetwork(network));
      const xdr = extractXdr(raw);
      if (!xdr) throw new Error('Defindex did not return an unsigned transaction XDR.');
      logDefindexSdk('info', 'sdk_build_action_success', {
        action: input.action,
        vault_address: maskLogValue(input.vaultAddress),
        caller: maskLogValue(input.caller),
        amount_units: input.amountUnits,
        network,
        has_xdr: true,
      });
      return { xdr, raw };
    } catch (error) {
      logDefindexSdk('warn', 'sdk_build_action_failed', {
        action: input.action,
        vault_address: maskLogValue(input.vaultAddress),
        caller: maskLogValue(input.caller),
        amount_units: input.amountUnits,
        network,
        ...errorLogFields(error),
      });
      throw error;
    }
  }

  static signXdr(unsignedXdr: string, secretKey: string): string {
    const transaction = TransactionBuilder.fromXDR(unsignedXdr, stellarConfig.network);
    transaction.sign(Keypair.fromSecret(secretKey));
    return transaction.toXDR();
  }

  static async sendVaultTransaction(input: {
    vaultAddress: string;
    signedXdr: string;
    network?: DefindexNetwork;
  }): Promise<{ hash: string; raw: any }> {
    const network = input.network || defaultNetwork();
    logDefindexSdk('info', 'sdk_send_transaction_start', {
      vault_address: maskLogValue(input.vaultAddress),
      network,
      has_signed_xdr: Boolean(input.signedXdr),
    });
    try {
      const raw = await this.sdk(network).sendTransaction(input.signedXdr, sdkNetwork(network));
      const hash = extractHash(raw);
      logDefindexSdk('info', 'sdk_send_transaction_success', {
        vault_address: maskLogValue(input.vaultAddress),
        network,
        hash: maskLogValue(hash, 10, 8),
      });
      return { hash, raw };
    } catch (error) {
      logDefindexSdk('warn', 'sdk_send_transaction_failed', {
        vault_address: maskLogValue(input.vaultAddress),
        network,
        ...errorLogFields(error),
      });
      throw error;
    }
  }
}
