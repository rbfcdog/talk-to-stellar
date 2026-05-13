import { formatCustomerAssetAmount } from './fee-display';

function toNumber(value: unknown): number {
  const parsed = Number(String(value || '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : 0;
}

function truncate(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.trunc(value * factor) / factor;
}

function trimFixed(value: number, decimals: number): string {
  return truncate(value, decimals).toFixed(decimals).replace(/\.?0+$/, '');
}

function normalizeAssetCode(value: unknown): string {
  return String(value || '').trim().toUpperCase().replace(/^USD$/, 'USDC').replace(/^EUR$/, 'EURC');
}

function displaySymbol(assetCode: string): string {
  const code = normalizeAssetCode(assetCode);
  if (code === 'USDC') return 'US$';
  if (code === 'BRL') return 'R$';
  if (code === 'EURC') return '€';
  return code;
}

export function buildUsedQuoteLabel(input: {
  quote?: any;
  sourceAmount?: string | number | null;
  sourceAssetCode?: string | null;
  destinationAmount?: string | number | null;
  destinationAssetCode?: string | null;
}): string {
  const quote = input.quote || {};
  const sourceAmountRaw = quote.sourceAmount || input.sourceAmount;
  const destinationAmountRaw = quote.destinationAmount || input.destinationAmount;
  const sourceAsset = normalizeAssetCode(quote.sourceAsset?.code || input.sourceAssetCode);
  const destinationAsset = normalizeAssetCode(quote.destinationAsset?.code || input.destinationAssetCode);
  const sourceAmount = toNumber(sourceAmountRaw);
  const destinationAmount = toNumber(destinationAmountRaw);

  if (!sourceAmount || !destinationAmount || !sourceAsset || !destinationAsset || sourceAsset === destinationAsset) {
    return 'Cotação usada: não aplicável';
  }

  if (sourceAsset === 'BRL' && destinationAsset === 'USDC') {
    return `Cotação usada: 1 US$ = R$ ${trimFixed(sourceAmount / destinationAmount, 6)}`;
  }

  if (sourceAsset === 'USDC' && destinationAsset === 'BRL') {
    return `Cotação usada: 1 US$ = R$ ${trimFixed(destinationAmount / sourceAmount, 6)}`;
  }

  const sourceLabel = formatCustomerAssetAmount(String(sourceAmountRaw || ''), sourceAsset);
  const destinationLabel = formatCustomerAssetAmount(String(destinationAmountRaw || ''), destinationAsset);
  const unitRate = sourceAmount / destinationAmount;
  return `Cotação usada: 1 ${displaySymbol(destinationAsset)} = ${trimFixed(unitRate, 6)} ${displaySymbol(sourceAsset)} (${sourceLabel} -> ${destinationLabel})`;
}
