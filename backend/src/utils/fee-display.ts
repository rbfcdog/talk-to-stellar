type FeeDisplay = {
  display: string;
  fee_xlm?: string;
  fee_usdc?: string;
  fee_brl?: string;
  source: string;
};

export const DEFAULT_NETWORK_FEE_XLM = '0.0000100';

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

  return {
    display: `${fee.toFixed(7).replace(/\.?0+$/, '')} XLM`,
    fee_xlm: fee.toFixed(7),
    source: 'transaction_network_fee_xlm',
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
  if (code === 'EURC' || code === 'EUR') return `${truncated.toFixed(2)} CETES`;
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

  if (platformApplied) {
    if (platformAsset === 'USDC') {
      totalUsdc += platformAmount;
    } else if (platformAssetIsReal) {
      totalBrl += platformAmount;
    }
  }

  const display = buildFeeDisplay(totalBrl, totalUsdc) || input.networkFee?.display || '';

  return {
    display,
    fee_usdc: totalUsdc > 0 ? totalUsdc.toFixed(8) : undefined,
    fee_brl: totalBrl > 0 ? totalBrl.toFixed(8) : undefined,
    source: input.networkFee?.source || 'unavailable',
    platform_applied: platformApplied,
  };
}
