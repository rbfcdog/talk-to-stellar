type FeeDisplay = {
  display: string;
  fee_usdc?: string;
  fee_brl?: string;
  source: string;
};

export const DEFAULT_NETWORK_FEE_XLM = '0.0000100';

async function fetchBinancePrice(symbol: string): Promise<number | undefined> {
  const timeoutMs = Number(process.env.BRL_USDC_QUOTE_TIMEOUT_MS || 8000);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number.isFinite(timeoutMs) ? timeoutMs : 8000);

  try {
    const response = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${encodeURIComponent(symbol)}`, {
      method: 'GET',
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });

    if (!response.ok) return undefined;

    const payload = await response.json() as { price?: string };
    const price = Number(String(payload?.price || '').trim());
    return Number.isFinite(price) && price > 0 ? price : undefined;
  } catch {
    return undefined;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchFirstBinancePrice(symbols: string[]): Promise<{ price?: number; symbol?: string }> {
  for (const symbol of symbols) {
    const price = await fetchBinancePrice(symbol);
    if (price) return { price, symbol };
  }
  return {};
}

function formatSmallCurrency(value: number, currency: 'US$' | 'R$'): string {
  if (!Number.isFinite(value) || value < 0) return `${currency} indisponivel`;
  const decimals = value > 0 && value < 0.01 ? 6 : 2;
  const threshold = Math.pow(10, -decimals);
  if (value > 0 && value < threshold) {
    return `${currency} <${threshold.toFixed(decimals)}`;
  }
  const factor = 10 ** decimals;
  return `${currency} ${(Math.trunc(value * factor) / factor).toFixed(decimals)}`;
}

function fallbackPositiveNumber(value: string | undefined, fallback: number): number {
  const parsed = Number(String(value || '').replace(',', '.'));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export async function formatNetworkFeeForCustomer(feeXlm?: string): Promise<FeeDisplay> {
  const fee = Number(String(feeXlm || DEFAULT_NETWORK_FEE_XLM).replace(',', '.'));
  if (!Number.isFinite(fee) || fee < 0) {
    return {
      display: '',
      source: 'unavailable',
    };
  }

  const xlmUsdQuote = await fetchFirstBinancePrice(['XLMUSDC', 'XLMUSDT']);
  const brlSymbol = String(process.env.BRL_USDC_QUOTE_SYMBOL || 'USDCBRL').trim().toUpperCase();
  const usdBrlQuote = await fetchFirstBinancePrice([brlSymbol, 'USDCBRL', 'USDTBRL']);

  const xlmUsd = xlmUsdQuote.price || fallbackPositiveNumber(process.env.XLM_USDC_FALLBACK_RATE, 0.1);
  const usdBrl = usdBrlQuote.price || fallbackPositiveNumber(process.env.USD_BRL_FALLBACK_RATE, 5);
  const feeUsdc = fee * xlmUsd;
  const feeBrl = feeUsdc * usdBrl;
  const sourceParts = [
    xlmUsdQuote.symbol ? `binance:${xlmUsdQuote.symbol}` : 'fallback:XLMUSDC',
    usdBrlQuote.symbol ? `binance:${usdBrlQuote.symbol}` : 'fallback:USDBRL',
  ];

  return {
    display: `${formatSmallCurrency(feeBrl, 'R$')} / ${formatSmallCurrency(feeUsdc, 'US$')}`,
    fee_usdc: feeUsdc.toFixed(8),
    fee_brl: feeBrl.toFixed(8),
    source: sourceParts.join('/'),
  };
}

export function formatCustomerAssetAmount(amount?: string, assetCode?: string): string {
  const code = String(assetCode || '').trim().toUpperCase().replace(/^USD$/, 'USDC');
  const value = Number(String(amount || '').replace(',', '.'));

  if (!Number.isFinite(value)) return 'valor indisponivel';
  const truncated = Math.trunc(value * 100) / 100;
  if (code === 'BRL') return `R$ ${truncated.toFixed(2)}`;
  if (code === 'USDC') return `US$ ${truncated.toFixed(2)}`;
  if (code === 'XLM') return 'saldo da carteira TalkToStellar';

  return `${truncated.toFixed(2)} ${code}`;
}
