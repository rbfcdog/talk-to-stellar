import { Networks } from '@stellar/stellar-sdk';

export type StellarNetworkProfileId = 'TESTNET' | 'PUBLIC';

export interface StellarNetworkProfile {
  id: StellarNetworkProfileId;
  label: string;
  horizonUrl: string;
  networkPassphrase: string;
  stellarExpertUrl: string;
  friendbotUrl?: string;
  usesRealValue: boolean;
}

export const STELLAR_NETWORK_PROFILES: Readonly<Record<StellarNetworkProfileId, StellarNetworkProfile>> = Object.freeze({
  TESTNET: Object.freeze({
    id: 'TESTNET',
    label: 'Stellar Testnet',
    horizonUrl: 'https://horizon-testnet.stellar.org',
    networkPassphrase: Networks.TESTNET,
    stellarExpertUrl: 'https://stellar.expert/explorer/testnet',
    friendbotUrl: 'https://friendbot.stellar.org',
    usesRealValue: false,
  }),
  PUBLIC: Object.freeze({
    id: 'PUBLIC',
    label: 'Stellar Mainnet / Pubnet',
    horizonUrl: 'https://horizon.stellar.org',
    networkPassphrase: Networks.PUBLIC,
    stellarExpertUrl: 'https://stellar.expert/explorer/public',
    usesRealValue: true,
  }),
});

export function normalizeStellarNetworkProfileId(value: unknown): StellarNetworkProfileId {
  const normalized = String(value || 'TESTNET').trim().toUpperCase();
  if (normalized === 'PUBLIC' || normalized === 'MAINNET' || normalized === 'PUBNET') {
    return 'PUBLIC';
  }
  if (normalized === 'TESTNET' || normalized === 'TEST') {
    return 'TESTNET';
  }
  throw new Error(`Unsupported Stellar network profile: ${String(value)}`);
}

export function getStellarNetworkProfile(value: unknown): StellarNetworkProfile {
  return STELLAR_NETWORK_PROFILES[normalizeStellarNetworkProfileId(value)];
}
