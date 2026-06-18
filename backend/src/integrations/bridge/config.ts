/**
 * Bridge.xyz Configuration
 *
 * Environment variables:
 *   BRIDGE_API_KEY         — Bridge API key (required)
 *   BRIDGE_API_URL         — Base URL (default: https://api.bridge.xyz/v0)
 *   BRIDGE_WEBHOOK_SECRET  — For verifying webhook signatures
 *   BRIDGE_ENABLED         — Feature flag (default: true in non-prod, false in prod)
 *   BRIDGE_DEVELOPER_FEE   — Default developer fee % (default: "0.30")
 *   BRIDGE_SANDBOX         — Use sandbox environment (default: !production)
 */

import { isProductionLikeEnvironment } from '../../config/runtime';

export interface BridgeConfig {
  apiKey: string;
  baseUrl: string;
  webhookSecret: string;
  enabled: boolean;
  developerFeePercent: string;
  sandbox: boolean;
  // Mainnet safety
  enableMainnetMoneyMovement: boolean;
  requireManualConfirmation: boolean;
  defaultSourceChain: string;
  defaultSourceCurrency: string;
  defaultDestinationCurrency: string;
  defaultDestinationRail: string;
  minBrlAmount: string;
  maxBrlAmount: string;
  minUsdcAmount: string;
  maxUsdcAmount: string;
  minUsdAmount: string;
  maxUsdAmount: string;
  minEurAmount: string;
  maxEurAmount: string;
  minMxnAmount: string;
  maxMxnAmount: string;
  webhookPublicKey: string;
  webhookId: string;
  appPublicWebhookUrl: string;
}

function env(name: string, fallback = ''): string {
  return String(process.env[name] ?? fallback).trim();
}

function boolEnv(name: string, fallback = false): boolean {
  const raw = env(name).toLowerCase();
  if (!raw) return fallback;
  return raw === 'true' || raw === '1' || raw === 'yes' || raw === 'on';
}

export function loadBridgeConfig(): BridgeConfig {
  const productionLike = isProductionLikeEnvironment();

  return {
    apiKey: env('BRIDGE_API_KEY'),
    baseUrl: env('BRIDGE_API_URL', 'https://api.bridge.xyz/v0').replace(/\/$/, ''),
    webhookSecret: env('BRIDGE_WEBHOOK_SECRET'),
    enabled: boolEnv('BRIDGE_ENABLED', !productionLike),
    developerFeePercent: env('BRIDGE_DEVELOPER_FEE', '0.30'),
    sandbox: boolEnv('BRIDGE_SANDBOX', !productionLike),
    // Default to enabled when an API key is present — set BRIDGE_ENABLE_MAINNET_MONEY_MOVEMENT=false to disable
    enableMainnetMoneyMovement: boolEnv('BRIDGE_ENABLE_MAINNET_MONEY_MOVEMENT', true),
    requireManualConfirmation: boolEnv('BRIDGE_REQUIRE_MANUAL_CONFIRMATION', false),
    defaultSourceChain: env('BRIDGE_DEFAULT_SOURCE_CHAIN', 'stellar'),
    defaultSourceCurrency: env('BRIDGE_DEFAULT_SOURCE_CURRENCY', 'usdc'),
    defaultDestinationCurrency: env('BRIDGE_DEFAULT_DESTINATION_CURRENCY', 'brl'),
    defaultDestinationRail: env('BRIDGE_DEFAULT_DESTINATION_RAIL', 'pix'),
    minBrlAmount: env('BRIDGE_MIN_BRL_AMOUNT', '10'),
    maxBrlAmount: env('BRIDGE_MAX_BRL_AMOUNT', '50000'),
    minUsdcAmount: env('BRIDGE_MIN_USDC_AMOUNT', '5'),
    maxUsdcAmount: env('BRIDGE_MAX_USDC_AMOUNT', '10000'),
    minUsdAmount: env('BRIDGE_MIN_USD_AMOUNT', '5'),
    maxUsdAmount: env('BRIDGE_MAX_USD_AMOUNT', '50000'),
    minEurAmount: env('BRIDGE_MIN_EUR_AMOUNT', '5'),
    maxEurAmount: env('BRIDGE_MAX_EUR_AMOUNT', '50000'),
    minMxnAmount: env('BRIDGE_MIN_MXN_AMOUNT', '100'),
    maxMxnAmount: env('BRIDGE_MAX_MXN_AMOUNT', '1000000'),
    webhookPublicKey: env('BRIDGE_WEBHOOK_PUBLIC_KEY'),
    webhookId: env('BRIDGE_WEBHOOK_ID'),
    appPublicWebhookUrl: env('APP_PUBLIC_WEBHOOK_URL'),
  };
}

export function validateBridgeConfig(config: BridgeConfig): string[] {
  const missing: string[] = [];
  if (!config.apiKey) missing.push('BRIDGE_API_KEY');
  return missing;
}
