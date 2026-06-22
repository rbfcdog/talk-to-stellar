/**
 * Soroswap DEX Aggregator Service
 *
 * Wraps the Soroswap REST API to provide:
 * - Best-price quotes across Soroswap, Phoenix, Aqua, SDEX
 * - Swap XDR generation (user signs + submits — same pattern as DeFindex)
 * - Token list with 10-minute in-memory cache
 *
 * Flow:
 * 1. Resolve token symbols to contract addresses
 * 2. GET /quote — get best route across all protocols
 * 3. POST /quote/build — build unsigned XDR transaction
 * 4. Frontend/user signs and submits
 */

import { loadSoroswapConfig, MAINNET_TOKENS } from './config';
import { SwapToken, SwapQuoteInput, SwapQuoteResult, SwapBuildInput, SwapBuildResult } from './types';
import { logger } from '../../utils/logger';
import { StellarBrokerService } from '../stellar-broker/service';

// 10-minute cache for token list
let tokenCache: { tokens: SwapToken[]; fetchedAt: number } | null = null;
const TOKEN_CACHE_TTL_MS = 10 * 60 * 1000;

const STATIC_TOKEN_NAMES: Record<string, string> = {
  USDC: 'USD Coin',
  XLM: 'Stellar Lumens',
  BRZ: 'Brazilian Digital Token',
  BRLT: 'BRL Token',
};

function builtInTokenList(network: string): SwapToken[] {
  return Object.entries(MAINNET_TOKENS).map(([symbol, address]) => ({
    address,
    symbol,
    name: STATIC_TOKEN_NAMES[symbol] || symbol,
    decimals: 7,
    network,
  }));
}

function displayAsset(symbolOrAddress: string, resolvedAddress: string): string {
  const upper = symbolOrAddress.toUpperCase();
  return MAINNET_TOKENS[upper] ? upper : resolvedAddress;
}

export const SoroswapService = {
  /**
   * Resolve a symbol (e.g. 'USDC') or raw contract address to a contract address.
   * A valid Stellar contract address starts with 'C' and is 56 chars long.
   */
  resolveTokenAddress(symbolOrAddress: string, network: string): string {
    // Already a contract address — pass through
    if (symbolOrAddress.startsWith('C') && symbolOrAddress.length === 56) {
      return symbolOrAddress;
    }
    const upper = symbolOrAddress.toUpperCase();
    if (MAINNET_TOKENS[upper]) {
      return MAINNET_TOKENS[upper];
    }
    throw new Error(
      `Unknown token symbol "${symbolOrAddress}". Provide a contract address or a known symbol (${Object.keys(MAINNET_TOKENS).join(', ')}).`
    );
  },

  /**
   * Convert a human-readable amount (e.g. "10.5") to stroops (integer string).
   * Stellar uses 7 decimal places by default; soroban tokens may differ.
   */
  humanToStroops(amount: string, decimals = 7): string {
    const factor = Math.pow(10, decimals);
    const raw = Math.round(parseFloat(amount) * factor);
    if (isNaN(raw)) throw new Error(`Invalid amount: "${amount}"`);
    return raw.toString();
  },

  /**
   * Convert stroops (integer string) back to a human-readable amount.
   */
  stroopsToHuman(stroops: string, decimals = 7): string {
    const factor = Math.pow(10, decimals);
    const value = parseInt(stroops, 10) / factor;
    if (isNaN(value)) throw new Error(`Invalid stroops value: "${stroops}"`);
    return value.toFixed(decimals).replace(/\.?0+$/, '');
  },

  /**
   * Get the best swap quote across all protocols.
   * Calls GET /quote with all protocols enabled.
   */
  async getQuote(input: SwapQuoteInput): Promise<SwapQuoteResult> {
    const config = loadSoroswapConfig();
    const assetInAddress = SoroswapService.resolveTokenAddress(input.assetIn, config.network);
    const assetOutAddress = SoroswapService.resolveTokenAddress(input.assetOut, config.network);
    const assetIn = displayAsset(input.assetIn, assetInAddress);
    const assetOut = displayAsset(input.assetOut, assetOutAddress);
    const amountInStroops = SoroswapService.humanToStroops(input.amount);
    const tradeType = input.tradeType || 'EXACT_IN';

    const params = new URLSearchParams({
      assetIn: assetInAddress,
      assetOut: assetOutAddress,
      amount: amountInStroops,
      tradeType,
      protocols: 'soroswap,phoenix,aqua,sdex',
      network: config.network,
    });

    const url = `${config.apiUrl}/quote?${params.toString()}`;
    logger.debug(`[soroswap] GET ${url}`);

    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`Soroswap /quote returned ${res.status}: ${body}`);
      }
      const raw = await res.json() as any;

      // Parse the API response — Soroswap returns amountOut in stroops
      const amountOutStroops = String(raw.amountOut ?? raw.amount_out ?? '0');
      const amountOut = SoroswapService.stroopsToHuman(amountOutStroops);

      return {
        assetIn: assetInAddress,
        assetOut: assetOutAddress,
        amountIn: input.amount,
        amountOut,
        amountInStroops,
        amountOutStroops,
        priceImpact: parseFloat(raw.priceImpact ?? raw.price_impact ?? '0') || 0,
        protocols: raw.protocols ?? raw.distribution?.map((d: any) => d.protocol) ?? [],
        route: raw.path ?? raw.route ?? null,
        rawQuote: raw,
      };
    } catch (e: any) {
      logger.warn(`[soroswap] getQuote failed: ${e.message}`);
      return SoroswapService.getBrokerFallbackQuote({
        input,
        tradeType,
        assetIn,
        assetOut,
        amountInStroops,
        failureMessage: e.message,
      });
    }
  },

  async getBrokerFallbackQuote({
    input,
    tradeType,
    assetIn,
    assetOut,
    amountInStroops,
    failureMessage,
  }: {
    input: SwapQuoteInput;
    tradeType: 'EXACT_IN' | 'EXACT_OUT';
    assetIn: string;
    assetOut: string;
    amountInStroops: string;
    failureMessage: string;
  }): Promise<SwapQuoteResult> {
    const direction = tradeType === 'EXACT_OUT' ? 'receive' : 'send';
    const quote = await StellarBrokerService.getQuote(assetIn, assetOut, input.amount, direction);
    const amountIn = String(quote.sellAmount ?? (tradeType === 'EXACT_IN' ? input.amount : '0'));
    const amountOut = String(quote.buyAmount ?? (tradeType === 'EXACT_OUT' ? input.amount : '0'));

    return {
      assetIn,
      assetOut,
      amountIn,
      amountOut,
      amountInStroops: SoroswapService.humanToStroops(amountIn),
      amountOutStroops: SoroswapService.humanToStroops(amountOut),
      priceImpact: 0,
      protocols: ['stellar-broker'],
      route: quote.directTrade?.path ?? [],
      rawQuote: {
        provider: 'stellar-broker',
        fallback: true,
        soroswapError: failureMessage,
        quote,
      },
      source: 'stellar-broker-fallback',
      buildAvailable: false,
      warning: 'Soroswap quote API is unavailable; showing a Stellar Broker fallback quote. XDR build is unavailable for fallback quotes.',
    };
  },

  /**
   * Build an unsigned swap XDR transaction from a quote.
   * Calls POST /quote/build. The caller is responsible for signing and submitting.
   */
  async buildSwapXdr(input: SwapBuildInput): Promise<SwapBuildResult> {
    const config = loadSoroswapConfig();
    const slippageBps = input.slippageBps ?? config.defaultSlippageBps;

    if (input.quote.rawQuote?.fallback || input.quote.source === 'stellar-broker-fallback') {
      throw new Error('Soroswap XDR build unavailable for fallback quotes. Soroswap quote API is currently unavailable; use the quote for pricing only.');
    }

    const url = `${config.apiUrl}/quote/build`;
    const body = {
      quote: input.quote.rawQuote,
      from: input.senderAddress,
      slippageBps,
    };

    logger.debug(`[soroswap] POST ${url} from=${input.senderAddress} slippageBps=${slippageBps}`);

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`Soroswap /quote/build returned ${res.status}: ${text}`);
      }
      const data = await res.json() as any;
      const xdr = data.xdr ?? data.transaction ?? data.tx;
      if (!xdr) throw new Error('Soroswap /quote/build response missing xdr field');

      return { xdr, quote: input.quote };
    } catch (e: any) {
      logger.warn(`[soroswap] buildSwapXdr failed: ${e.message}`);
      throw e;
    }
  },

  /**
   * Return all tradable tokens for the configured network.
   * Results are cached in-memory for 10 minutes.
   */
  async getTokenList(): Promise<SwapToken[]> {
    const now = Date.now();
    if (tokenCache && now - tokenCache.fetchedAt < TOKEN_CACHE_TTL_MS) {
      return tokenCache.tokens;
    }

    const config = loadSoroswapConfig();
    const url = `${config.apiUrl}/tokens?network=${config.network}`;
    logger.debug(`[soroswap] GET ${url}`);

    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`Soroswap /tokens returned ${res.status}: ${text}`);
      }
      const raw = await res.json() as any;

      // API may return { tokens: [...] } or a bare array
      const list: any[] = Array.isArray(raw) ? raw : (raw.tokens ?? raw.data ?? []);
      const tokens: SwapToken[] = list.map((t: any) => ({
        address: t.address ?? t.contract ?? t.id ?? '',
        symbol: t.symbol ?? t.code ?? '',
        name: t.name ?? t.symbol ?? '',
        decimals: typeof t.decimals === 'number' ? t.decimals : 7,
        network: config.network,
      }));

      if (tokens.length === 0) {
        const fallback = builtInTokenList(config.network);
        tokenCache = { tokens: fallback, fetchedAt: now };
        logger.warn('[soroswap] token API returned an empty list; returning built-in Stellar tokens');
        return fallback;
      }

      tokenCache = { tokens, fetchedAt: now };
      logger.debug(`[soroswap] cached ${tokens.length} tokens`);
      return tokens;
    } catch (e: any) {
      logger.warn(`[soroswap] getTokenList failed: ${e.message}`);
      // Return stale cache if available rather than throwing
      if (tokenCache) {
        logger.warn('[soroswap] returning stale token cache after fetch failure');
        return tokenCache.tokens;
      }
      const fallback = builtInTokenList(config.network);
      tokenCache = { tokens: fallback, fetchedAt: now };
      logger.warn('[soroswap] returning built-in Stellar tokens after fetch failure');
      return fallback;
    }
  },

  clearTokenCache(): void {
    tokenCache = null;
  },
};
