/**
 * Reflector Oracle — Decentralized price feed on Stellar
 *
 * Primary: https://reflector.network/api
 * Fallback for XLM: Horizon order book
 * Fallback for BRL: exchangerate-api.com (free, no auth)
 *
 * Cache TTL: 5 minutes
 */

import { logger } from '../../utils/logger';
import type { AssetPrice, PriceMap } from './types';

const REFLECTOR_BASE = 'https://reflector.network/api';
const REFLECTOR_ALT_BASE = 'https://api.reflector.network';
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

// USDC issuer on Stellar mainnet (Centre / Circle)
const USDC_ISSUER = 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN';

const HORIZON_ORDERBOOK = (sellingType: string, buyingCode: string, buyingIssuer: string) =>
  `https://horizon.stellar.org/order_book?selling_asset_type=${sellingType}&buying_asset_type=credit_alphanum4&buying_asset_code=${buyingCode}&buying_asset_issuer=${buyingIssuer}&limit=1`;

const EXCHANGERATE_API = 'https://api.exchangerate-api.com/v4/latest/USD';

// ─── In-memory cache ──────────────────────────────────────────────────────────

const priceCache = new Map<string, AssetPrice>();

function getCached(asset: string): AssetPrice | null {
  const entry = priceCache.get(asset.toUpperCase());
  if (!entry) return null;
  if (Date.now() - entry.timestamp < CACHE_TTL) {
    return {
      ...entry,
      source: 'cache',
      age_seconds: Math.floor((Date.now() - entry.timestamp) / 1000),
    };
  }
  return null;
}

function setCache(entry: AssetPrice): void {
  priceCache.set(entry.asset.toUpperCase(), entry);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildEntry(
  asset: string,
  price: number,
  source: AssetPrice['source'],
  timestampMs?: number,
): AssetPrice {
  const ts = timestampMs ?? Date.now();
  return {
    asset: asset.toUpperCase(),
    price,
    priceStr: price.toFixed(7),
    timestamp: ts,
    source,
    age_seconds: Math.floor((Date.now() - ts) / 1000),
  };
}

async function fetchJson(url: string, timeoutMs = 5000): Promise<unknown> {
  const res = await fetch(url, {
    headers: { 'User-Agent': 'TalkToStellar/1.0' },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
  return res.json();
}

// ─── Reflector REST ───────────────────────────────────────────────────────────

/**
 * Try both Reflector base URLs.
 * Reflector returns price as a string with up to 7 decimal places (Stellar stroop format).
 *
 * Known response shapes (docs are sparse — handle both):
 *   { price: "0.1234567", timestamp: 1234567890 }
 *   { data: { price: "0.1234567", ... } }
 *   { result: { price: "0.1234567" } }
 */
async function fetchFromReflector(asset: string): Promise<AssetPrice | null> {
  const upperAsset = asset.toUpperCase();
  const paths = [
    `${REFLECTOR_BASE}/price/${upperAsset}`,
    `${REFLECTOR_ALT_BASE}/price/${upperAsset}`,
  ];

  for (const url of paths) {
    try {
      const raw = await fetchJson(url) as any;

      // Unwrap common nesting patterns
      const payload = raw?.data ?? raw?.result ?? raw;

      const priceRaw: string | number | undefined =
        payload?.price ?? payload?.last_price ?? payload?.rate;

      if (priceRaw === undefined || priceRaw === null) {
        logger.warn(`[reflector] unexpected shape from ${url}: ${JSON.stringify(raw).slice(0, 200)}`);
        continue;
      }

      const price = typeof priceRaw === 'string' ? parseFloat(priceRaw) : Number(priceRaw);
      if (!isFinite(price) || price <= 0) {
        logger.warn(`[reflector] invalid price value ${priceRaw} for ${upperAsset}`);
        continue;
      }

      // Timestamp may be seconds or ms — normalise to ms
      const tsRaw: number | undefined = payload?.timestamp ?? payload?.time ?? payload?.ts;
      const timestampMs = tsRaw
        ? tsRaw < 1e12 ? tsRaw * 1000 : tsRaw  // seconds → ms
        : Date.now();

      logger.debug(`[reflector] ${upperAsset} = ${price} from ${url}`);
      return buildEntry(upperAsset, price, 'reflector', timestampMs);
    } catch (e: any) {
      logger.warn(`[reflector] fetch failed for ${upperAsset} at ${url}: ${e.message}`);
    }
  }

  return null;
}

// ─── Horizon order-book fallback (XLM/USDC) ──────────────────────────────────

/**
 * Derive XLM price in USD by looking at the XLM→USDC order book on Horizon.
 * Mid-price = average of best bid and best ask.
 */
async function fetchXlmFromHorizon(): Promise<AssetPrice | null> {
  const url = HORIZON_ORDERBOOK('native', 'USDC', USDC_ISSUER);
  try {
    const data = await fetchJson(url) as any;
    const bids: { price: string }[] = data?.bids ?? [];
    const asks: { price: string }[] = data?.asks ?? [];

    const bestBid = bids.length > 0 ? parseFloat(bids[0].price) : null;
    const bestAsk = asks.length > 0 ? parseFloat(asks[0].price) : null;

    let price: number;
    if (bestBid && bestAsk) {
      price = (bestBid + bestAsk) / 2;
    } else if (bestBid) {
      price = bestBid;
    } else if (bestAsk) {
      price = bestAsk;
    } else {
      logger.warn('[reflector] Horizon order book returned no bids or asks for XLM/USDC');
      return null;
    }

    logger.debug(`[reflector] XLM/USD from Horizon order book = ${price}`);
    return buildEntry('XLM', price, 'horizon_fallback');
  } catch (e: any) {
    logger.warn(`[reflector] Horizon fallback failed: ${e.message}`);
    return null;
  }
}

// ─── BRL fallback via exchangerate-api ───────────────────────────────────────

/**
 * Returns BRL expressed as USD per 1 BRL (e.g. ~0.18 when 1 USD = 5.5 BRL).
 */
async function fetchBrlFromExchangeRate(): Promise<AssetPrice | null> {
  try {
    const data = await fetchJson(EXCHANGERATE_API) as any;
    const brlPerUsd: number | undefined = data?.rates?.BRL;
    if (!brlPerUsd || !isFinite(brlPerUsd) || brlPerUsd <= 0) {
      logger.warn(`[reflector] exchangerate-api BRL value invalid: ${brlPerUsd}`);
      return null;
    }
    const usdPerBrl = 1 / brlPerUsd;
    logger.debug(`[reflector] BRL/USD from exchangerate-api = ${usdPerBrl} (1 USD = ${brlPerUsd} BRL)`);
    return buildEntry('BRL', usdPerBrl, 'horizon_fallback');
  } catch (e: any) {
    logger.warn(`[reflector] exchangerate-api fallback failed: ${e.message}`);
    return null;
  }
}

// ─── Public service object ────────────────────────────────────────────────────

export const ReflectorService = {
  /**
   * Get the current price (in USD) for a single asset.
   * Order: cache → Reflector REST → fallbacks → last-resort default.
   */
  async getPrice(asset: string): Promise<AssetPrice> {
    const upperAsset = asset.toUpperCase();

    // 1. Cache hit
    const cached = getCached(upperAsset);
    if (cached) return cached;

    // 2. Try Reflector
    let entry = await fetchFromReflector(upperAsset);

    // 3. Asset-specific fallbacks
    if (!entry) {
      if (upperAsset === 'XLM') {
        entry = await fetchXlmFromHorizon();
      } else if (upperAsset === 'BRL') {
        entry = await fetchBrlFromExchangeRate();
      } else if (upperAsset === 'USDC' || upperAsset === 'USD') {
        // USDC is pegged 1:1
        entry = buildEntry(upperAsset, 1.0, 'reflector');
      }
    }

    // 4. Hard fallback — return a zero-price entry rather than throwing,
    //    so the agent can still function (just with stale/missing data flagged).
    if (!entry) {
      logger.warn(`[reflector] all sources failed for ${upperAsset} — returning zero-price fallback`);
      entry = buildEntry(upperAsset, 0, 'horizon_fallback');
    }

    setCache(entry);
    return entry;
  },

  /**
   * Get prices for multiple assets in parallel.
   */
  async getPrices(assets: string[]): Promise<PriceMap> {
    const results = await Promise.all(assets.map((a) => this.getPrice(a)));
    return Object.fromEntries(results.map((r) => [r.asset, r]));
  },

  /**
   * Convenience: XLM price in USD.
   */
  async getXlmUsdRate(): Promise<number> {
    const entry = await this.getPrice('XLM');
    return entry.price;
  },

  /**
   * Convenience: BRL expressed as USD per 1 BRL (~0.18 when 1 USD = 5.5 BRL).
   * Useful for showing "R$X" equivalent in WhatsApp messages.
   */
  async getUsdBrlRate(): Promise<number> {
    const entry = await this.getPrice('BRL');
    return entry.price;
  },

  /**
   * Clear the in-memory cache (useful in tests).
   */
  clearCache(): void {
    priceCache.clear();
  },
};
