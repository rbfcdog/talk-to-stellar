import { Horizon, Networks } from '@stellar/stellar-sdk';
import dotenv from 'dotenv';

dotenv.config();

const isTestnet = String(process.env.STELLAR_NETWORK || 'TESTNET').trim().toUpperCase() !== 'PUBLIC';

export const stellarConfig = {
  network: isTestnet ? Networks.TESTNET : Networks.PUBLIC,
  horizonUrl: process.env.STELLAR_HORIZON_URL || 'https://horizon-testnet.stellar.org',
  friendbotUrl: process.env.STELLAR_FRIENDBOT_URL || 'https://friendbot.stellar.org',
};

export const server = new Horizon.Server(stellarConfig.horizonUrl);
