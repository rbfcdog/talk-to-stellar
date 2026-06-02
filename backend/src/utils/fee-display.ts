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

function configuredPositiveNumber(value: string | undefined): number {
  const parsed = Number(String(value || '').replace(',', '.'));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function buildFeeDisplay(feeBrl: number, feeUsdc: number): string {
  const parts = [
    feeBrl > 0 ? formatSmallCurrency(feeBrl, 'R$') : '',
    feeUsdc > 0 ? formatSmallCurrency(feeUsdc, 'US$') : '',
  ].filter(Boolean);
  return parts.join(' / ');
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

  const xlmUsd = xlmUsdQuote.price || configuredPositiveNumber(process.env.XLM_USDC_FALLBACK_RATE);
  const usdBrl = usdBrlQuote.price || configuredPositiveNumber(process.env.USD_BRL_FALLBACK_RATE);
  if (xlmUsd <= 0) {
    return {
      display: '',
      source: 'unavailable',
    };
  }
  const feeUsdc = fee * xlmUsd;
  const feeBrl = usdBrl > 0 ? feeUsdc * usdBrl : 0;
  const sourceParts = [
    xlmUsdQuote.symbol ? `binance:${xlmUsdQuote.symbol}` : 'fallback:XLMUSDC',
    usdBrl > 0
      ? (usdBrlQuote.symbol ? `binance:${usdBrlQuote.symbol}` : 'fallback:USDBRL')
      : 'unavailable:USDBRL',
  ];

  return {
    display: buildFeeDisplay(feeBrl, feeUsdc),
    fee_usdc: feeUsdc.toFixed(8),
    fee_brl: feeBrl > 0 ? feeBrl.toFixed(8) : undefined,
    source: sourceParts.join('/'),
  };
}

export function formatCustomerAssetAmount(amount?: string, assetCode?: string): string {
  const code = String(assetCode || '').trim().toUpperCase().replace(/^USD$/, 'USDC');
  const value = Number(String(amount || '').replace(',', '.'));
  const formatQuantity = (quantity: number) =>
    quantity.toFixed(7).replace(/\.?0+$/, '');

  if (!Number.isFinite(value)) return 'valor indisponivel';
  const truncated = Math.trunc(value * 100) / 100;
  if (code === 'BRL' || code === 'TESOURO') return `R$ ${truncated.toFixed(2)}`;
  if (code === 'USDC') return `US$ ${truncated.toFixed(2)}`;
  if (code === 'EURC' || code === 'EUR') return `€ ${truncated.toFixed(2)}`;
  if (code === 'XLM') return `${formatQuantity(value)} XLM`;

  return `${formatQuantity(value)} ${code}`;
}

export function buildUnifiedFeeDisplay(input: {
  networkFee: FeeDisplay;
  platformFeeAmount?: string | null;
  platformFeeAssetCode?: string | null;
  sourceAssetCode?: string | null;
  destinationAssetCode?: string | null;
}): FeeDisplay & { platform_applied: boolean } {
  const source = String(input.sourceAssetCode || '').trim().toUpperCase().replace(/^USD$/, 'USDC');
  const destination = String(input.destinationAssetCode || '').trim().toUpperCase().replace(/^USD$/, 'USDC');
  const sourceIsReal = source === 'BRL' || source === 'TESOURO';
  const destinationIsReal = destination === 'BRL' || destination === 'TESOURO';
  const isUsdcBrlPair = (source === 'USDC' && destinationIsReal) || (sourceIsReal && destination === 'USDC');

  const networkUsdc = Number(String(input.networkFee?.fee_usdc || '').replace(',', '.'));
  const networkBrl = Number(String(input.networkFee?.fee_brl || '').replace(',', '.'));
  let totalUsdc = Number.isFinite(networkUsdc) ? networkUsdc : 0;
  let totalBrl = Number.isFinite(networkBrl) ? networkBrl : 0;

  const platformAmount = Number(String(input.platformFeeAmount || '').replace(',', '.'));
  const platformAsset = String(input.platformFeeAssetCode || '').trim().toUpperCase().replace(/^USD$/, 'USDC');
  const platformAssetIsReal = platformAsset === 'BRL' || platformAsset === 'TESOURO';
  const platformApplied = isUsdcBrlPair && Number.isFinite(platformAmount) && platformAmount > 0 && (platformAsset === 'USDC' || platformAssetIsReal);

  const impliedRate = totalUsdc > 0 && totalBrl > 0 ? totalBrl / totalUsdc : undefined;
  const fallbackRate = configuredPositiveNumber(process.env.USD_BRL_FALLBACK_RATE);
  const usdBrlRate = impliedRate && Number.isFinite(impliedRate) && impliedRate > 0 ? impliedRate : fallbackRate;

  if (platformApplied) {
    if (platformAsset === 'USDC') {
      totalUsdc += platformAmount;
      if (usdBrlRate > 0) totalBrl += platformAmount * usdBrlRate;
    } else if (platformAssetIsReal) {
      totalBrl += platformAmount;
      if (usdBrlRate > 0) totalUsdc += platformAmount / usdBrlRate;
    }
  }

  return {
    display: buildFeeDisplay(totalBrl, totalUsdc),
    fee_usdc: totalUsdc > 0 ? totalUsdc.toFixed(8) : undefined,
    fee_brl: totalBrl > 0 ? totalBrl.toFixed(8) : undefined,
    source: input.networkFee?.source || 'unavailable',
    platform_applied: platformApplied,
  };
}
