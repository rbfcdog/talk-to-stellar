type FeeDisplay = {
  display: string;
  fee_usdc?: string;
  fee_brl?: string;
  source: string;
};

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
  return `${currency} ${value.toFixed(decimals)}`;
}

export async function formatNetworkFeeForCustomer(feeXlm?: string): Promise<FeeDisplay> {
  const fee = Number(String(feeXlm || '').replace(',', '.'));
  if (!Number.isFinite(fee) || fee < 0) {
    return {
      display: '',
      source: 'unavailable',
    };
  }

  const xlmUsdQuote = await fetchFirstBinancePrice(['XLMUSDC', 'XLMUSDT']);
  const brlSymbol = String(process.env.BRL_USDC_QUOTE_SYMBOL || 'USDCBRL').trim().toUpperCase();
  const usdBrlQuote = await fetchFirstBinancePrice([brlSymbol, 'USDCBRL', 'USDTBRL']);

  if (!xlmUsdQuote.price) {
    return {
      display: '',
      source: 'unavailable',
    };
  }

  const feeUsdc = fee * xlmUsdQuote.price;
  const feeBrl = usdBrlQuote.price ? feeUsdc * usdBrlQuote.price : undefined;

  return {
    display: feeBrl
      ? `${formatSmallCurrency(feeBrl, 'R$')} / ${formatSmallCurrency(feeUsdc, 'US$')}`
      : formatSmallCurrency(feeUsdc, 'US$'),
    fee_usdc: feeUsdc.toFixed(8),
    fee_brl: feeBrl ? feeBrl.toFixed(8) : undefined,
    source: usdBrlQuote.symbol
      ? `binance:${xlmUsdQuote.symbol}/${usdBrlQuote.symbol}`
      : `binance:${xlmUsdQuote.symbol}`,
  };
}

export function formatCustomerAssetAmount(amount?: string, assetCode?: string): string {
  const code = String(assetCode || '').trim().toUpperCase().replace(/^USD$/, 'USDC');
  const value = Number(String(amount || '').replace(',', '.'));

  if (!Number.isFinite(value)) return 'valor indisponivel';
  if (code === 'BRL') return `R$ ${value.toFixed(2)}`;
  if (code === 'USDC') return `US$ ${value.toFixed(2)}`;
  if (code === 'XLM') return 'saldo da carteira TalkToStellar';

  return `${value.toFixed(2)} ${code}`;
}
