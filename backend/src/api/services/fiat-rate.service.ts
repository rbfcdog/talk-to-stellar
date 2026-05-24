export type FiatUsdBrlQuote = {
  brlPerUsd: number;
  source: string;
  fetchedAt: string;
  fallbackApplied: boolean;
  fallbackReason?: string;
};

const DEFAULT_TIMEOUT_MS = 8000;
const DEFAULT_CACHE_TTL_MS = 60000;
const DEFAULT_USD_BRL_SANITY_MIN = 3;
const DEFAULT_USD_BRL_SANITY_MAX = 10;

let cachedUsdBrl: { quote: FiatUsdBrlQuote; expiresAt: number } | undefined;

function toPositiveNumber(value: unknown): number {
  const parsed = Number(String(value ?? '').replace(',', '.'));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function configuredPositiveNumber(keys: string[]): { value: number; key: string } | undefined {
  for (const key of keys) {
    const value = toPositiveNumber(process.env[key]);
    if (value > 0) return { value, key };
  }
  return undefined;
}

function uniqueValues(values: Array<string | undefined>): string[] {
  const seen = new Set<string>();
  const output: string[] = [];
  for (const value of values) {
    const normalized = String(value || '').trim().toUpperCase();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    output.push(normalized);
  }
  return output;
}

function sanityBounds(): { min: number; max: number } {
  const min = configuredPositiveNumber(['USD_BRL_SANITY_MIN', 'DEFAULT_USD_BRL_SANITY_MIN'])?.value || DEFAULT_USD_BRL_SANITY_MIN;
  const max = configuredPositiveNumber(['USD_BRL_SANITY_MAX', 'DEFAULT_USD_BRL_SANITY_MAX'])?.value || DEFAULT_USD_BRL_SANITY_MAX;
  return { min, max };
}

function isSaneUsdBrlRate(rate: number): boolean {
  const { min, max } = sanityBounds();
  return Number.isFinite(rate) && rate >= min && rate <= max;
}

async function fetchJsonWithTimeout<T>(url: string): Promise<T | undefined> {
  const configuredTimeout = toPositiveNumber(process.env.BRL_USDC_QUOTE_TIMEOUT_MS);
  const timeoutMs = configuredTimeout || DEFAULT_TIMEOUT_MS;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) return undefined;
    return await response.json() as T;
  } catch {
    return undefined;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchBinanceUsdBrl(): Promise<FiatUsdBrlQuote | undefined> {
  const symbols = uniqueValues([
    process.env.BRL_USDC_QUOTE_SYMBOL,
    'USDCBRL',
    'USDTBRL',
  ]);

  for (const symbol of symbols) {
    const payload = await fetchJsonWithTimeout<{ price?: string }>(
      `https://api.binance.com/api/v3/ticker/price?symbol=${encodeURIComponent(symbol)}`,
    );
    const price = toPositiveNumber(payload?.price);
    if (!isSaneUsdBrlRate(price)) continue;
    return {
      brlPerUsd: price,
      source: `market:binance:${symbol}`,
      fetchedAt: new Date().toISOString(),
      fallbackApplied: false,
    };
  }

  return undefined;
}

async function fetchAwesomeApiUsdBrl(): Promise<FiatUsdBrlQuote | undefined> {
  const payload = await fetchJsonWithTimeout<{ USDBRL?: { bid?: string; ask?: string } }>(
    'https://economia.awesomeapi.com.br/json/last/USD-BRL',
  );
  const price = toPositiveNumber(payload?.USDBRL?.bid) || toPositiveNumber(payload?.USDBRL?.ask);
  if (!isSaneUsdBrlRate(price)) return undefined;
  return {
    brlPerUsd: price,
    source: 'market:awesomeapi:USD-BRL',
    fetchedAt: new Date().toISOString(),
    fallbackApplied: false,
  };
}

export class FiatRateService {
  static isSaneUsdBrlRate(rate: number): boolean {
    return isSaneUsdBrlRate(rate);
  }

  static clearCacheForTests(): void {
    cachedUsdBrl = undefined;
  }

  static async getUsdBrlRate(): Promise<FiatUsdBrlQuote> {
    const now = Date.now();
    if (cachedUsdBrl && cachedUsdBrl.expiresAt > now) {
      return cachedUsdBrl.quote;
    }

    const marketQuote = await fetchBinanceUsdBrl() || await fetchAwesomeApiUsdBrl();
    if (marketQuote) {
      const ttlMs = toPositiveNumber(process.env.USD_BRL_MARKET_CACHE_TTL_MS) || DEFAULT_CACHE_TTL_MS;
      cachedUsdBrl = { quote: marketQuote, expiresAt: now + ttlMs };
      return marketQuote;
    }

    const configured = configuredPositiveNumber(['USD_BRL_FALLBACK_RATE', 'DEFAULT_USD_BRL_RATE']);
    if (configured && isSaneUsdBrlRate(configured.value)) {
      return {
        brlPerUsd: configured.value,
        source: `env:${configured.key}`,
        fetchedAt: new Date().toISOString(),
        fallbackApplied: true,
        fallbackReason: 'market_usd_brl_unavailable',
      };
    }

    if (String(process.env.ALLOW_STATIC_USD_BRL_FALLBACK || '').toLowerCase() === 'true') {
      return {
        brlPerUsd: 5.15,
        source: 'static:USD_BRL',
        fetchedAt: new Date().toISOString(),
        fallbackApplied: true,
        fallbackReason: 'market_usd_brl_unavailable_static_enabled',
      };
    }

    throw new Error('Cotação USD/BRL de mercado indisponível.');
  }
}
