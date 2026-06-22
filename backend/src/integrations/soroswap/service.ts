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

import { Networks, TransactionBuilder } from '@stellar/stellar-sdk';
import { loadSoroswapConfig, MAINNET_TOKENS, SoroswapConfig } from './config';
import { SwapToken, SwapQuoteInput, SwapQuoteResult, SwapBuildInput, SwapBuildResult, SwapSendResult } from './types';
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

const TESTNET_TOKENS: Record<string, string> = {
  USDC: 'CB3TLW74NBIOT3BUWOZ3TUM6RFDF6A4GVIRUQRQZABG5KPOUL4JJOV2F',
  XLM: 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC',
};

function builtInTokenList(network: string): SwapToken[] {
  const tokenMap = network === 'mainnet' ? MAINNET_TOKENS : TESTNET_TOKENS;
  return Object.entries(tokenMap).map(([symbol, address]) => ({
    address,
    symbol,
    name: STATIC_TOKEN_NAMES[symbol] || symbol,
    decimals: 7,
    network,
  }));
}

function isContractAddress(value: string): boolean {
  return /^C[A-Z2-7]{55}$/.test(value.trim());
}

function networkNameForFreighter(network: string): 'TESTNET' | 'PUBLIC' {
  return network === 'testnet' ? 'TESTNET' : 'PUBLIC';
}

function networkPassphraseFor(network: string): string {
  return network === 'testnet' ? Networks.TESTNET : Networks.PUBLIC;
}

function displayAsset(symbolOrAddress: string, resolvedAddress: string, token?: SwapToken): string {
  const upper = symbolOrAddress.toUpperCase();
  if (token?.symbol) return token.symbol;
  return MAINNET_TOKENS[upper] ? upper : resolvedAddress;
}

function canUseBrokerFallback(input: SwapQuoteInput): boolean {
  return !isContractAddress(input.assetIn) && !isContractAddress(input.assetOut);
}

function soroswapHeaders(config: SoroswapConfig, json = false): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
  };
  if (json) {
    headers['Content-Type'] = 'application/json';
  }
  if (config.apiKey) {
    headers.Authorization = `Bearer ${config.apiKey}`;
  }
  return headers;
}

export const SoroswapService = {
  /**
   * Resolve a symbol (e.g. 'USDC') or raw contract address to a contract address.
   * A valid Stellar contract address starts with 'C' and is 56 chars long.
   */
  resolveTokenAddress(symbolOrAddress: string, network: string): string {
    // Already a contract address — pass through
    const trimmed = symbolOrAddress.trim();
    if (isContractAddress(trimmed)) {
      return trimmed;
    }
    const upper = trimmed.toUpperCase();
    const knownTokens = network === 'mainnet' ? MAINNET_TOKENS : TESTNET_TOKENS;
    if (knownTokens[upper]) {
      return knownTokens[upper];
    }
    throw new Error(
      `Unknown token symbol "${symbolOrAddress}". Provide a contract address or a known symbol (${Object.keys(knownTokens).join(', ')}).`
    );
  },

  async resolveTokenForQuote(symbolOrAddress: string, config: SoroswapConfig): Promise<{ address: string; display: string; decimals: number; token?: SwapToken }> {
    const trimmed = symbolOrAddress.trim();
    if (isContractAddress(trimmed)) {
      return {
        address: trimmed,
        display: trimmed,
        decimals: 7,
      };
    }

    const upper = trimmed.toUpperCase();

    // Keep known mainnet symbols synchronous and stable for production and tests.
    if (config.network === 'mainnet' && MAINNET_TOKENS[upper]) {
      const address = MAINNET_TOKENS[upper];
      return {
        address,
        display: upper,
        decimals: 7,
      };
    }

    const tokens = await SoroswapService.getTokenList();
    const token = tokens.find((t) => t.symbol.toUpperCase() === upper);
    if (token?.address) {
      return {
        address: token.address,
        display: displayAsset(trimmed, token.address, token),
        decimals: token.decimals || 7,
        token,
      };
    }

    // Testnet token discovery can be temporarily unavailable; keep the core
    // XLM/USDC demo path usable with explicit testnet SAC wrappers.
    if (config.network !== 'mainnet' && TESTNET_TOKENS[upper]) {
      const address = TESTNET_TOKENS[upper];
      return {
        address,
        display: upper,
        decimals: 7,
      };
    }

    throw new Error(`Unknown token symbol "${symbolOrAddress}". Provide a contract address or a token returned by /api/swap/tokens.`);
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
    const assetInToken = await SoroswapService.resolveTokenForQuote(input.assetIn, config);
    const assetOutToken = await SoroswapService.resolveTokenForQuote(input.assetOut, config);
    const assetInAddress = assetInToken.address;
    const assetOutAddress = assetOutToken.address;
    const assetIn = assetInToken.display;
    const assetOut = assetOutToken.display;
    const amountInStroops = SoroswapService.humanToStroops(input.amount);
    const tradeType = input.tradeType || 'EXACT_IN';

    const params = new URLSearchParams({ network: config.network });
    const url = `${config.apiUrl}/quote?${params.toString()}`;
    const body = {
      assetIn: assetInAddress,
      assetOut: assetOutAddress,
      amount: amountInStroops,
      tradeType,
      protocols: ['soroswap', 'phoenix', 'aqua', 'sdex'],
      slippageBps: config.defaultSlippageBps,
    };
    logger.debug(`[soroswap] POST ${url}`);

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: soroswapHeaders(config, true),
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15000),
      });
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
        priceImpact: parseFloat(raw.priceImpact ?? raw.priceImpactPct ?? raw.price_impact ?? '0') || 0,
        protocols: raw.protocols
          ?? raw.routePlan?.map((step: any) => step.swapInfo?.protocol).filter(Boolean)
          ?? raw.rawTrade?.distribution?.map((d: any) => d.protocol_id ?? d.protocol).filter(Boolean)
          ?? raw.distribution?.map((d: any) => d.protocol_id ?? d.protocol).filter(Boolean)
          ?? [],
        route: raw.path ?? raw.route ?? raw.routePlan ?? raw.rawTrade?.distribution ?? null,
        rawQuote: raw,
        network: networkNameForFreighter(config.network),
        networkPassphrase: networkPassphraseFor(config.network),
      };
    } catch (e: any) {
      logger.warn(`[soroswap] getQuote failed: ${e.message}`);
      if (canUseBrokerFallback(input)) {
        try {
          return await SoroswapService.getBrokerFallbackQuote({
            input,
            tradeType,
            assetIn,
            assetOut,
            amountInStroops,
            failureMessage: e.message,
          });
        } catch (fallbackError: any) {
          logger.warn(`[soroswap] broker fallback quote failed: ${fallbackError.message}`);
        }
      }

      return SoroswapService.getUnavailableQuote({
        input,
        tradeType,
        assetIn,
        assetOut,
        amountInStroops,
        failureMessage: e.message,
        network: config.network,
      });
    }
  },

  getUnavailableQuote({
    input,
    tradeType,
    assetIn,
    assetOut,
    amountInStroops,
    failureMessage,
    network,
  }: {
    input: SwapQuoteInput;
    tradeType: 'EXACT_IN' | 'EXACT_OUT';
    assetIn: string;
    assetOut: string;
    amountInStroops: string;
    failureMessage: string;
    network: string;
  }): SwapQuoteResult {
    const amountIn = tradeType === 'EXACT_IN' ? input.amount : '0';
    const amountOut = tradeType === 'EXACT_OUT' ? input.amount : '0';

    return {
      assetIn,
      assetOut,
      amountIn,
      amountOut,
      amountInStroops,
      amountOutStroops: SoroswapService.humanToStroops(amountOut),
      priceImpact: 0,
      protocols: [],
      route: [],
      rawQuote: {
        provider: 'soroswap',
        unavailable: true,
        soroswapError: failureMessage,
      },
      source: 'soroswap-unavailable',
      buildAvailable: false,
      warning: 'Soroswap could not return a route for this pair on the configured network. Try another pair from the token list or switch networks.',
      network: networkNameForFreighter(network),
      networkPassphrase: networkPassphraseFor(network),
    };
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
    const config = loadSoroswapConfig();
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
      network: networkNameForFreighter(config.network),
      networkPassphrase: networkPassphraseFor(config.network),
    };
  },

  /**
   * Build an unsigned swap XDR transaction from a quote.
   * Calls POST /quote/build. The caller is responsible for signing and submitting.
   */
  async buildSwapXdr(input: SwapBuildInput): Promise<SwapBuildResult> {
    const config = loadSoroswapConfig();
    const slippageBps = input.slippageBps ?? config.defaultSlippageBps;

    if (input.quote.buildAvailable === false || input.quote.rawQuote?.fallback || input.quote.rawQuote?.unavailable || input.quote.source === 'stellar-broker-fallback') {
      throw new Error('Soroswap XDR build unavailable for fallback quotes. Soroswap quote API is currently unavailable; use the quote for pricing only.');
    }

    const params = new URLSearchParams({ network: config.network });
    const url = `${config.apiUrl}/quote/build?${params.toString()}`;
    const body = {
      quote: input.quote.rawQuote,
      from: input.senderAddress,
      slippageBps,
    };

    logger.debug(`[soroswap] POST ${url} from=${input.senderAddress} slippageBps=${slippageBps}`);

    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: soroswapHeaders(config, true),
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

      return {
        xdr,
        quote: input.quote,
        network: networkNameForFreighter(config.network),
        networkPassphrase: networkPassphraseFor(config.network),
      };
    } catch (e: any) {
      logger.warn(`[soroswap] buildSwapXdr failed: ${e.message}`);
      throw e;
    }
  },

  /**
   * Submit a user-signed swap XDR to Horizon on the configured Stellar network.
   * Signing remains client-side in Freighter; the backend only relays.
   */
  async sendSignedXdr(signedXdr: string): Promise<SwapSendResult> {
    const config = loadSoroswapConfig();
    const networkPassphrase = networkPassphraseFor(config.network);
    const tx = TransactionBuilder.fromXDR(signedXdr, networkPassphrase);
    const { server } = await import('../../config/stellar');
    const result = await server.submitTransaction(tx);

    return {
      hash: result.hash,
      ledger: result.ledger,
      successful: result.successful !== false,
      network: networkNameForFreighter(config.network),
      networkPassphrase,
      envelopeXdr: result.envelope_xdr,
      resultXdr: result.result_xdr,
    };
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
    const url = `${config.apiUrl}/api/tokens`;
    logger.debug(`[soroswap] GET ${url}`);

    try {
      const res = await fetch(url, {
        headers: soroswapHeaders(config),
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`Soroswap /api/tokens returned ${res.status}: ${text}`);
      }
      const raw = await res.json() as any;

      // API may return the live [{ network, assets: [...] }] shape, { tokens: [...] }, or a bare array.
      const networkTokenGroup = Array.isArray(raw)
        ? raw.find((entry: any) => entry?.network === config.network && Array.isArray(entry.assets))
        : null;
      const list: any[] = networkTokenGroup?.assets
        ?? (Array.isArray(raw) && !raw.some((entry: any) => Array.isArray(entry?.assets)) ? raw : null)
        ?? raw.tokens
        ?? raw.data
        ?? [];
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
