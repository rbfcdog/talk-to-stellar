/**
 * Bridge.xyz Configuration
 *
 * Environment variables:
 *   BRIDGE_API_KEY         — Bridge API key (required)
 *   BRIDGE_API_URL         — Base URL (default: https://api.bridge.xyz/v0)
 *   BRIDGE_WEBHOOK_SECRET  — For verifying webhook signatures
 *   BRIDGE_ENABLED         — Feature flag (default: false)
 *   BRIDGE_DEVELOPER_FEE   — Default developer fee % (default: "0.30")
 *   BRIDGE_SANDBOX         — Use sandbox environment (default: true in non-prod)
 */

export interface BridgeConfig {
  apiKey: string;
  baseUrl: string;
  webhookSecret: string;
  enabled: boolean;
  developerFeePercent: string;
  sandbox: boolean;
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
  const productionLike =
    env('NODE_ENV').toLowerCase() === 'production' ||
    env('RAILWAY_ENVIRONMENT').toLowerCase() === 'production';

  return {
    apiKey: env('BRIDGE_API_KEY'),
    baseUrl: env('BRIDGE_API_URL', 'https://api.bridge.xyz/v0').replace(/\/$/, ''),
    webhookSecret: env('BRIDGE_WEBHOOK_SECRET'),
    enabled: boolEnv('BRIDGE_ENABLED', false),
    developerFeePercent: env('BRIDGE_DEVELOPER_FEE', '0.30'),
    sandbox: boolEnv('BRIDGE_SANDBOX', !productionLike),
  };
}

export function validateBridgeConfig(config: BridgeConfig): string[] {
  const missing: string[] = [];
  if (!config.apiKey) missing.push('BRIDGE_API_KEY');
  return missing;
}
