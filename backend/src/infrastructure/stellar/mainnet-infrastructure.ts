import { Keypair } from '@stellar/stellar-sdk';

import {
  ETHERFUSE_TESOURO_ISSUER,
  PUBLIC_USDC_ISSUER,
} from '../../config/assets';
import {
  STELLAR_NETWORK_PROFILES,
  StellarNetworkProfile,
  StellarNetworkProfileId,
  normalizeStellarNetworkProfileId,
} from './network-profiles';

export type MainnetSignerMode = 'disabled' | 'external' | 'kms' | 'vault';
export type ReadinessStatus = 'pass' | 'warn' | 'fail';

export interface MainnetAssetIssuers {
  USDC: string;
  TESOURO: string;
  EURC?: string;
}

export interface MainnetSignerConfig {
  mode: MainnetSignerMode;
  externalSignerUrl?: string;
  kmsKeyId?: string;
  vaultSecretId?: string;
}

export interface MainnetOperationalControls {
  requireManualApproval: boolean;
  allowBulkMutation: boolean;
  maxPaymentUsdc?: string;
}

export interface MainnetComplianceConfig {
  sep10HomeDomain?: string;
  stellarTomlUrl?: string;
}

export interface StellarMainnetInfrastructureConfig {
  enabled: boolean;
  allowRuntimeActivation: boolean;
  activeRuntimeNetwork: StellarNetworkProfileId;
  profile: StellarNetworkProfile;
  horizonUrl: string;
  networkPassphrase: string;
  stellarExpertUrl: string;
  accidentalFriendbotUrl?: string;
  assets: MainnetAssetIssuers;
  feeTreasuryPublicKey?: string;
  distributionPublicKey?: string;
  signer: MainnetSignerConfig;
  controls: MainnetOperationalControls;
  compliance: MainnetComplianceConfig;
}

export interface MainnetReadinessCheck {
  key: string;
  status: ReadinessStatus;
  detail: string;
}

export interface MainnetReadinessReport {
  safeForCurrentTestnetRuntime: boolean;
  configurationReady: boolean;
  readyForActivation: boolean;
  activationBlockedByDesign: boolean;
  blockers: string[];
  warnings: string[];
  config: StellarMainnetInfrastructureConfig;
  checks: MainnetReadinessCheck[];
}

export function loadStellarMainnetInfrastructureConfig(
  env: NodeJS.ProcessEnv = process.env
): StellarMainnetInfrastructureConfig {
  const profile = STELLAR_NETWORK_PROFILES.PUBLIC;
  const signerMode = parseSignerMode(env.STELLAR_MAINNET_SIGNER_MODE);

  return {
    enabled: readBoolean(env.STELLAR_MAINNET_ENABLED, false),
    allowRuntimeActivation: readBoolean(env.STELLAR_MAINNET_ALLOW_RUNTIME_ACTIVATION, false),
    activeRuntimeNetwork: normalizeStellarNetworkProfileId(env.STELLAR_NETWORK),
    profile,
    horizonUrl: readString(env.STELLAR_MAINNET_HORIZON_URL) || profile.horizonUrl,
    networkPassphrase: readString(env.STELLAR_MAINNET_NETWORK_PASSPHRASE) || profile.networkPassphrase,
    stellarExpertUrl: readString(env.STELLAR_MAINNET_STELLAR_EXPERT_URL) || profile.stellarExpertUrl,
    accidentalFriendbotUrl: readString(env.STELLAR_MAINNET_FRIENDBOT_URL),
    assets: {
      USDC: readString(env.STELLAR_MAINNET_USDC_ISSUER) || PUBLIC_USDC_ISSUER,
      TESOURO: readString(env.STELLAR_MAINNET_TESOURO_ISSUER) || ETHERFUSE_TESOURO_ISSUER,
      EURC: readString(env.STELLAR_MAINNET_EURC_ISSUER) || readString(env.STELLAR_MAINNET_EUR_ISSUER),
    },
    feeTreasuryPublicKey: readString(env.STELLAR_MAINNET_FEE_TREASURY_PUBLIC_KEY),
    distributionPublicKey: readString(env.STELLAR_MAINNET_DISTRIBUTION_PUBLIC_KEY),
    signer: {
      mode: signerMode,
      externalSignerUrl: readString(env.STELLAR_MAINNET_EXTERNAL_SIGNER_URL),
      kmsKeyId: readString(env.STELLAR_MAINNET_KMS_KEY_ID),
      vaultSecretId: readString(env.STELLAR_MAINNET_VAULT_SECRET_ID),
    },
    controls: {
      requireManualApproval: readBoolean(env.STELLAR_MAINNET_REQUIRE_MANUAL_APPROVAL, true),
      allowBulkMutation: readBoolean(env.STELLAR_MAINNET_ALLOW_BULK_MUTATION, false),
      maxPaymentUsdc: readString(env.STELLAR_MAINNET_MAX_PAYMENT_USDC),
    },
    compliance: {
      sep10HomeDomain: readString(env.STELLAR_MAINNET_SEP10_HOME_DOMAIN),
      stellarTomlUrl: readString(env.STELLAR_MAINNET_STELLAR_TOML_URL),
    },
  };
}

export function getStellarMainnetReadinessReport(
  env: NodeJS.ProcessEnv = process.env
): MainnetReadinessReport {
  const config = loadStellarMainnetInfrastructureConfig(env);
  const checks: MainnetReadinessCheck[] = [];

  addCheck(
    checks,
    'runtime-isolation',
    config.activeRuntimeNetwork === 'TESTNET'
      ? 'pass'
      : config.allowRuntimeActivation
        ? 'warn'
        : 'fail',
    config.activeRuntimeNetwork === 'TESTNET'
      ? 'Runtime principal continua em STELLAR_NETWORK=TESTNET.'
      : 'Runtime principal esta em PUBLIC; isso so deve acontecer no cutover aprovado.'
  );

  addCheck(
    checks,
    'mainnet-enabled-flag',
    config.enabled ? 'pass' : 'warn',
    config.enabled
      ? 'Infraestrutura Mainnet marcada como preparada.'
      : 'STELLAR_MAINNET_ENABLED ainda esta false; isso mantem a camada apenas em modo preparatorio.'
  );

  addCheck(
    checks,
    'runtime-activation-guard',
    config.allowRuntimeActivation ? 'warn' : 'pass',
    config.allowRuntimeActivation
      ? 'Guard de ativacao runtime esta liberado; use apenas durante o cutover.'
      : 'Guard de ativacao runtime esta fechado, mantendo a Mainnet sem plug no produto.'
  );

  addCheck(
    checks,
    'mainnet-horizon-url',
    isHttpsUrl(config.horizonUrl) && !config.horizonUrl.toLowerCase().includes('testnet') ? 'pass' : 'fail',
    `Horizon Mainnet configurado como ${config.horizonUrl}.`
  );

  addCheck(
    checks,
    'mainnet-passphrase',
    config.networkPassphrase === STELLAR_NETWORK_PROFILES.PUBLIC.networkPassphrase ? 'pass' : 'fail',
    'Network passphrase deve ser a constante publica do SDK para evitar assinatura na rede errada.'
  );

  addCheck(
    checks,
    'mainnet-friendbot-disabled',
    config.accidentalFriendbotUrl ? 'fail' : 'pass',
    config.accidentalFriendbotUrl
      ? 'Friendbot nao existe em Mainnet; remova STELLAR_MAINNET_FRIENDBOT_URL.'
      : 'Nenhum Friendbot Mainnet configurado.'
  );

  Object.entries(config.assets).forEach(([assetCode, issuer]) => {
    addCheck(
      checks,
      `asset-${assetCode.toLowerCase()}-issuer`,
      isValidPublicKey(issuer) ? 'pass' : 'fail',
      `${assetCode} issuer Mainnet: ${issuer || 'nao configurado'}.`
    );
  });

  addCheck(
    checks,
    'fee-treasury',
    checkRequiredPublicKey(config.feeTreasuryPublicKey, config.enabled),
    config.feeTreasuryPublicKey
      ? 'Conta publica de tesouraria de fee configurada.'
      : 'Configure STELLAR_MAINNET_FEE_TREASURY_PUBLIC_KEY antes de ativar cobranca em Mainnet.'
  );

  addCheck(
    checks,
    'distribution-account',
    checkOptionalPublicKey(config.distributionPublicKey),
    config.distributionPublicKey
      ? 'Conta publica de distribuicao Mainnet configurada.'
      : 'Conta de distribuicao Mainnet ausente; obrigatoria se o produto for distribuir asset proprio.'
  );

  addSignerChecks(checks, config);

  addCheck(
    checks,
    'max-payment-limit',
    checkRequiredPositiveDecimal(config.controls.maxPaymentUsdc, config.enabled),
    config.controls.maxPaymentUsdc
      ? `Limite operacional por pagamento: ${config.controls.maxPaymentUsdc} USDC.`
      : 'Configure STELLAR_MAINNET_MAX_PAYMENT_USDC para reduzir blast radius no cutover.'
  );

  addCheck(
    checks,
    'manual-approval',
    config.controls.requireManualApproval ? 'pass' : 'fail',
    config.controls.requireManualApproval
      ? 'Aprovacao manual esta obrigatoria para operacoes Mainnet.'
      : 'Aprovacao manual Mainnet desativada; mantenha true antes do cutover.'
  );

  addCheck(
    checks,
    'bulk-mutation-guard',
    config.controls.allowBulkMutation ? 'warn' : 'pass',
    config.controls.allowBulkMutation
      ? 'Bulk mutation Mainnet esta liberada; use apenas em janela operacional aprovada.'
      : 'Bulk mutation Mainnet esta bloqueada por padrao.'
  );

  addCheck(
    checks,
    'sep10-domain',
    config.compliance.sep10HomeDomain ? 'pass' : 'warn',
    config.compliance.sep10HomeDomain
      ? `SEP-10 home domain: ${config.compliance.sep10HomeDomain}.`
      : 'SEP-10 home domain ainda nao configurado; necessario para fluxos SEP/anchor autenticados.'
  );

  addCheck(
    checks,
    'stellar-toml',
    config.compliance.stellarTomlUrl ? 'pass' : 'warn',
    config.compliance.stellarTomlUrl
      ? `stellar.toml publico: ${config.compliance.stellarTomlUrl}.`
      : 'stellar.toml publico ainda nao configurado; necessario para identidade de anchor/asset.'
  );

  const blockers = checks.filter((check) => check.status === 'fail').map((check) => `${check.key}: ${check.detail}`);
  const warnings = checks.filter((check) => check.status === 'warn').map((check) => `${check.key}: ${check.detail}`);
  const safeForCurrentTestnetRuntime = config.activeRuntimeNetwork === 'TESTNET' && !config.allowRuntimeActivation;

  return {
    safeForCurrentTestnetRuntime,
    configurationReady: config.enabled && blockers.length === 0,
    readyForActivation: config.enabled && blockers.length === 0 && config.allowRuntimeActivation,
    activationBlockedByDesign: !config.allowRuntimeActivation,
    blockers,
    warnings,
    config,
    checks,
  };
}

function addSignerChecks(checks: MainnetReadinessCheck[], config: StellarMainnetInfrastructureConfig): void {
  if (config.signer.mode === 'disabled') {
    addCheck(
      checks,
      'signer-mode',
      config.enabled ? 'fail' : 'warn',
      'Signer Mainnet esta disabled; escolha external, kms ou vault antes de ativar.'
    );
    return;
  }

  addCheck(checks, 'signer-mode', 'pass', `Signer Mainnet preparado no modo ${config.signer.mode}.`);

  if (config.signer.mode === 'external') {
    addCheck(
      checks,
      'external-signer-url',
      isHttpsUrl(config.signer.externalSignerUrl) ? 'pass' : 'fail',
      config.signer.externalSignerUrl
        ? `Signer externo: ${config.signer.externalSignerUrl}.`
        : 'Configure STELLAR_MAINNET_EXTERNAL_SIGNER_URL para o modo external.'
    );
  }

  if (config.signer.mode === 'kms') {
    addCheck(
      checks,
      'kms-key-id',
      config.signer.kmsKeyId ? 'pass' : 'fail',
      config.signer.kmsKeyId
        ? 'KMS key id Mainnet configurado.'
        : 'Configure STELLAR_MAINNET_KMS_KEY_ID para o modo kms.'
    );
  }

  if (config.signer.mode === 'vault') {
    addCheck(
      checks,
      'vault-secret-id',
      config.signer.vaultSecretId ? 'pass' : 'fail',
      config.signer.vaultSecretId
        ? 'Vault secret id Mainnet configurado.'
        : 'Configure STELLAR_MAINNET_VAULT_SECRET_ID para o modo vault.'
    );
  }
}

function addCheck(checks: MainnetReadinessCheck[], key: string, status: ReadinessStatus, detail: string): void {
  checks.push({ key, status, detail });
}

function checkRequiredPublicKey(value: string | undefined, required: boolean): ReadinessStatus {
  if (!value) return required ? 'fail' : 'warn';
  return isValidPublicKey(value) ? 'pass' : 'fail';
}

function checkOptionalPublicKey(value: string | undefined): ReadinessStatus {
  if (!value) return 'warn';
  return isValidPublicKey(value) ? 'pass' : 'fail';
}

function checkRequiredPositiveDecimal(value: string | undefined, required: boolean): ReadinessStatus {
  if (!value) return required ? 'fail' : 'warn';
  return isPositiveDecimal(value) ? 'pass' : 'fail';
}

function parseSignerMode(value: unknown): MainnetSignerMode {
  const normalized = String(value || 'disabled').trim().toLowerCase();
  if (normalized === 'disabled' || normalized === 'external' || normalized === 'kms' || normalized === 'vault') {
    return normalized;
  }
  throw new Error(`Unsupported STELLAR_MAINNET_SIGNER_MODE: ${String(value)}`);
}

function readBoolean(value: unknown, defaultValue: boolean): boolean {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (!normalized) return defaultValue;
  if (['1', 'true', 'yes', 'y', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'n', 'off'].includes(normalized)) return false;
  return defaultValue;
}

function readString(value: unknown): string | undefined {
  const normalized = String(value ?? '').trim();
  return normalized || undefined;
}

function isHttpsUrl(value: unknown): boolean {
  const raw = readString(value);
  if (!raw) return false;
  try {
    const url = new URL(raw);
    return url.protocol === 'https:';
  } catch {
    return false;
  }
}

function isValidPublicKey(value: unknown): boolean {
  const raw = readString(value);
  if (!raw) return false;
  try {
    Keypair.fromPublicKey(raw);
    return true;
  } catch {
    return false;
  }
}

function isPositiveDecimal(value: string): boolean {
  if (!/^\d+(\.\d{1,7})?$/.test(value)) return false;
  return Number(value) > 0;
}
