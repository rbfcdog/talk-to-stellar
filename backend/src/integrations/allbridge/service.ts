/**
 * Allbridge Core — Cross-Chain Stablecoin Bridge to Stellar
 *
 * Allbridge enables native 1:1 stablecoin transfers between EVM chains and Stellar.
 * Stellar is supported via allbridge.io (the liquidity pool bridge, NOT the classic
 * lock-and-mint bridge). Their core REST API at core.api.allbridgecore.com is
 * currently IP-restricted to browser-only access (CORS + rate limits).
 *
 * Alternative: use their open source SDK or read their GitHub for current state.
 *
 * GitHub: https://github.com/allbridge-io
 * Docs: https://docs.allbridge.io
 * App: https://app.allbridge.io
 *
 * TalkToStellar use: Bridge USDC from Base/Arbitrum directly to Stellar for PIX off-ramp.
 */

import { logger } from '../../utils/logger';

// Stellar chain info known from Allbridge docs
export const ALLBRIDGE_STELLAR_INFO = {
  chainId: 'STELLAR',
  chainName: 'Stellar',
  nativeCurrency: 'XLM',
  supportedTokens: [
    {
      symbol: 'USDC',
      name: 'USD Coin',
      stellar_contract: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN',
      decimals: 7,
      note: 'Circle native USDC on Stellar',
    },
  ],
  supportedSourceChains: ['Ethereum', 'Base', 'Arbitrum', 'BNB', 'Polygon', 'Avalanche', 'Solana', 'Celo', 'Tron'],
  bridgeType: 'liquidity_pool',
  website: 'https://app.allbridge.io',
  docs: 'https://docs.allbridge.io',
};

// Allbridge SDK npm: @allbridge/bridge-core-sdk
const SDK_INFO = {
  npm: '@allbridge/bridge-core-sdk',
  install: 'npm install @allbridge/bridge-core-sdk',
  example: `
import { AllbridgeCoreSdk, nodeUrlsDefault } from '@allbridge/bridge-core-sdk';
const sdk = new AllbridgeCoreSdk(nodeUrlsDefault);
const chains = await sdk.chainDetailsMap();
const stellarChain = chains['STELLAR'];
const quote = await sdk.getAmountToBeReceived(amount, sourceToken, destToken);
  `.trim(),
};

// Attempt to fetch live data from alternative public endpoint
async function fetchLiveChains(): Promise<any[] | null> {
  try {
    // Their public info endpoint (may work without CORS restriction from server-side)
    const res = await fetch('https://core.api.allbridgecore.com/v1/token-info', {
      headers: {
        'User-Agent': 'TalkToStellar/1.0',
        Accept: 'application/json',
        Origin: 'https://app.allbridge.io',
      },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return null;
    const data = await res.json() as any;
    return Array.isArray(data) ? data : null;
  } catch (e: any) {
    logger.warn(`[allbridge] live fetch failed: ${e.message}`);
    return null;
  }
}

export const AllbridgeService = {
  async getInfo() {
    const live = await fetchLiveChains();
    return {
      stellar: ALLBRIDGE_STELLAR_INFO,
      sdk: SDK_INFO,
      live_chains_available: live !== null,
      live_chain_count: live?.length ?? null,
      status: live !== null ? 'live' : 'static_fallback',
    };
  },

  async getStellarTokens() {
    return ALLBRIDGE_STELLAR_INFO.supportedTokens;
  },
};
