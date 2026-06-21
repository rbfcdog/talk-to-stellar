/**
 * Stellar Broker — Multi-Source Liquidity Swap Router
 *
 * Routes swaps across Soroswap, Aquarius AMM, Stellar SDEX, and Classic AMMs
 * to find the best execution price. No SDK — pure REST.
 *
 * Base URL: https://api.stellar.broker
 * Docs: https://stellar.broker/docs
 *
 * TalkToStellar use: Best-rate XLM⇄USDC swaps for PIX off-ramp conversions.
 */

import { logger } from '../../utils/logger';

const BROKER_API = 'https://api.stellar.broker';

const KNOWN_ASSETS: Record<string, string> = {
  XLM: 'native',
  USDC: 'USDC-GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN',
  BRZ: 'BRZ-GDVKY2GU2DRXBERTI7QUMZY7BMMV35SPCYZYGOLRJN6PXSO57KXH7UUS',
  BRLT: 'BRLT-GDVKY2GU2DRXBERTI7QUMZY7BMMV35SPCYZYGOLRJN6PXSO57KXH7UUS',
  AQUA: 'AQUA-GBNZILSTVQZ4R7IKQDGHYGY2QXL5QOFJYQMXPKWRRM5PAV7Y4M67AQUA',
};

function resolveAsset(code: string): string {
  const upper = code.toUpperCase();
  return KNOWN_ASSETS[upper] ?? code;
}

async function brokerFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${BROKER_API}${path}`, {
    headers: { 'User-Agent': 'TalkToStellar/1.0', Accept: 'application/json' },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Stellar Broker ${path} → ${res.status}: ${text.slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}

export const StellarBrokerService = {
  async getHealth() {
    try {
      return await brokerFetch<any>('/');
    } catch (e: any) {
      logger.warn(`[stellar-broker] health failed: ${e.message}`);
      throw e;
    }
  },

  async getQuote(from: string, to: string, amount: string, direction: 'send' | 'receive' = 'send') {
    const sellingAsset = resolveAsset(from);
    const buyingAsset = resolveAsset(to);

    const params = direction === 'send'
      ? new URLSearchParams({ sellingAsset, buyingAsset, sellingAmount: amount })
      : new URLSearchParams({ sellingAsset, buyingAsset, buyingAmount: amount });

    try {
      const data = await brokerFetch<any>(`/quote?${params}`);
      logger.debug(`[stellar-broker] quote ${from}→${to} amount=${amount}`);
      return {
        from: data.sellingAsset ?? from,
        to: data.buyingAsset?.split('-')[0] ?? to,
        sellAmount: data.sellingAmount,
        buyAmount: data.estimatedBuyingAmount,
        directTrade: data.directTrade,
        slippageTolerance: data.slippageTolerance,
        direction: data.direction,
      };
    } catch (e: any) {
      logger.warn(`[stellar-broker] getQuote failed: ${e.message}`);
      throw e;
    }
  },
};
