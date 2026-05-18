import { Horizon, Networks } from '@stellar/stellar-sdk';
import dotenv from 'dotenv';
import { STELLAR_NETWORK_PROFILES, normalizeStellarNetworkProfileId } from '../infrastructure/stellar/network-profiles';

dotenv.config();

function readBoolean(value: unknown): boolean {
  return ['1', 'true', 'yes', 'y', 'on'].includes(String(value || '').trim().toLowerCase());
}

const activeNetworkName = normalizeStellarNetworkProfileId(process.env.STELLAR_NETWORK);
const publicRuntimeAllowed = readBoolean(process.env.STELLAR_MAINNET_ALLOW_RUNTIME_ACTIVATION);

if (activeNetworkName === 'PUBLIC' && !publicRuntimeAllowed) {
  throw new Error(
    'Refusing to start Stellar PUBLIC runtime without STELLAR_MAINNET_ALLOW_RUNTIME_ACTIVATION=true. Keep STELLAR_NETWORK=TESTNET until the Mainnet cutover is approved.'
  );
}

const activeProfile = STELLAR_NETWORK_PROFILES[activeNetworkName];
const configuredHorizonUrl = String(process.env.STELLAR_HORIZON_URL || '').trim();
const horizonUrl = configuredHorizonUrl || activeProfile.horizonUrl;

if (activeNetworkName === 'PUBLIC' && horizonUrl.toLowerCase().includes('testnet')) {
  throw new Error('Refusing to start Stellar PUBLIC runtime with a Testnet Horizon URL.');
}

if (activeNetworkName === 'TESTNET' && horizonUrl === STELLAR_NETWORK_PROFILES.PUBLIC.horizonUrl) {
  throw new Error('Refusing to start Stellar TESTNET runtime with the public Mainnet Horizon URL.');
}

export const stellarConfig = {
  networkName: activeNetworkName,
  network: activeNetworkName === 'TESTNET' ? Networks.TESTNET : Networks.PUBLIC,
  horizonUrl,
  friendbotUrl: activeNetworkName === 'TESTNET'
    ? process.env.STELLAR_FRIENDBOT_URL || STELLAR_NETWORK_PROFILES.TESTNET.friendbotUrl
    : undefined,
};

export const server = new Horizon.Server(stellarConfig.horizonUrl);
