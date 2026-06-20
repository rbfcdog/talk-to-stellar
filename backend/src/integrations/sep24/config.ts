/**
 * SEP-24 Anchor Integration Configuration
 *
 * Environment variables:
 *   ANCHOR_SERVER_SIGNING_KEY  — Our server's Stellar secret key (for SEP-10 challenge signing)
 *   STELLAR_NETWORK            — testnet | mainnet (default: testnet)
 */

import { KnownAnchor } from './types';
import { isProductionLikeEnvironment } from '../../config/runtime';

export interface Sep24Config {
  network: 'testnet' | 'mainnet';
  networkPassphrase: string;
  serverSigningKey: string;
  defaultAnchorDomain: string;
}

export const TESTNET_PASSPHRASE = 'Test SDF Network ; September 2015';
export const MAINNET_PASSPHRASE = 'Public Global Stellar Network ; September 2015';

export const KNOWN_ANCHORS: KnownAnchor[] = [
  {
    name: 'MoneyGram',
    domain: 'stellar.moneygram.com',
    description: 'Cash in/out at 350k+ MoneyGram locations worldwide',
    assets: ['USDC'],
    countries: ['US', 'BR', 'MX', 'CO', 'PE', 'PH', 'NG', 'KE', 'GH', 'IN'],
  },
  {
    name: 'Vibrant',
    domain: 'vibrant.io',
    description: 'Argentine peso on/off-ramp',
    assets: ['USDC'],
    countries: ['AR'],
  },
  {
    name: 'Anclap',
    domain: 'www.anclap.com',
    description: 'ARS/BRL on/off-ramp via Stellar',
    assets: ['USDC', 'ARS'],
    countries: ['AR', 'BR'],
  },
];

export function loadSep24Config(): Sep24Config {
  const isProd = isProductionLikeEnvironment();
  const network = isProd ? 'mainnet' : 'testnet';
  return {
    network,
    networkPassphrase: isProd ? MAINNET_PASSPHRASE : TESTNET_PASSPHRASE,
    serverSigningKey: process.env.STELLAR_WALLET_SPONSOR_SECRET || '',
    defaultAnchorDomain: 'stellar.moneygram.com',
  };
}
