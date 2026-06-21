/**
 * Stellar Broker — Multi-Source Liquidity Swap Router
 *
 * Stellar Broker routes swaps across SoroSwap, Aquarius AMM, Stellar SDEX,
 * and Classic AMMs to find the best execution price. It exposes a simple REST
 * quote API — no SDK needed.
 *
 * Base URL: https://stellar.broker/api
 * Docs: https://stellar.broker/docs
 *
 * TalkToStellar use: Best-rate XLM⇄USDC swaps for PIX off-ramp conversions.
 */

import { logger } from '../../utils/logger';

const BROKER_API = 'https://stellar.broker/api';

async function brokerFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${BROKER_API}${path}`, {
    headers: { 'User-Agent': 'TalkToStellar/1.0', Accept: 'application/json' },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Stellar Broker ${path} → ${res.status}`);
  return res.json() as Promise<T>;
}

const XLM_ASSET = 'XLM:native';
const USDC_ASSET = 'USDC:GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN';

function assetId(code: string): string {
  if (code.toUpperCase() === 'XLM') return XLM_ASSET;
  if (code.toUpperCase() === 'USDC') return USDC_ASSET;
  if (code.toUpperCase() === 'BRZ') return 'BRZ:GDVKY2GU2DRXBERTI7QUMZY7BMMV35SPCYZYGOLRJN6PXSO57KXH7UUS';
  if (code.toUpperCase() === 'BRLT') return 'BRLT:GDVKY2GU2DRXBERTI7QUMZY7BMMV35SPCYZYGOLRJN6PXSO57KXH7UUS';
  return code;
}

export const StellarBrokerService = {
  async getQuote(from: string, to: string, amount: string, slippage = '0.5') {
    const fromId = assetId(from);
    const toId = assetId(to);
    const params = new URLSearchParams({ from: fromId, to: toId, amount, slippage });
    try {
      const data = await brokerFetch<any>(`/quote?${params}`);
      logger.debug(`[stellar-broker] quote ${from}→${to} amount=${amount}`);
      return data;
    } catch (e: any) {
      logger.warn(`[stellar-broker] getQuote failed: ${e.message}`);
      throw e;
    }
  },

  async getRoutes(from: string, to: string) {
    const fromId = assetId(from);
    const toId = assetId(to);
    const params = new URLSearchParams({ from: fromId, to: toId });
    try {
      return await brokerFetch<any>(`/routes?${params}`);
    } catch (e: any) {
      logger.warn(`[stellar-broker] getRoutes failed: ${e.message}`);
      throw e;
    }
  },

  async getSupportedAssets() {
    try {
      return await brokerFetch<any>('/assets');
    } catch (e: any) {
      logger.warn(`[stellar-broker] getSupportedAssets failed: ${e.message}`);
      throw e;
    }
  },
};
