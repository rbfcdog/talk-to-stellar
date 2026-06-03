import { normalizeAssetCode, userFacingAssetCode } from '../../config/assets';

export const TRANSACTION_RATE_SOURCE = 'transaction_values';

function toPositiveNumber(value: unknown): number {
  const parsed = Number(String(value ?? '').replace(',', '.'));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function normalizeRateAsset(value: unknown): string {
  return userFacingAssetCode(normalizeAssetCode(value));
}

function isBrlLike(value: unknown): boolean {
  const code = normalizeRateAsset(value);
  return code === 'BRL' || code === 'TESOURO';
}

function isUsdcLike(value: unknown): boolean {
  return normalizeRateAsset(value) === 'USDC';
}

function compactAmount(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '0';
  return value.toFixed(7).replace(/\.?0+$/, '');
}

export function deriveRateFromTransactionAmounts(input: {
  sourceAssetCode: unknown;
  destinationAssetCode: unknown;
  sourceAmount: unknown;
  destinationAmount: unknown;
  source?: string;
  observedAt?: string;
}) {
  const sourceAmount = toPositiveNumber(input.sourceAmount);
  const destinationAmount = toPositiveNumber(input.destinationAmount);
  if (!sourceAmount || !destinationAmount) return null;

  const rate = destinationAmount / sourceAmount;
  return {
    source_asset_code: normalizeRateAsset(input.sourceAssetCode),
    destination_asset_code: normalizeRateAsset(input.destinationAssetCode),
    source_amount: compactAmount(sourceAmount),
    destination_amount: compactAmount(destinationAmount),
    rate,
    inverse_rate: rate > 0 ? 1 / rate : 0,
    source: input.source || TRANSACTION_RATE_SOURCE,
    observed_at: input.observedAt || new Date().toISOString(),
  };
}

export function deriveBrlPerUsdcFromTransactionAmounts(input: {
  sourceAssetCode: unknown;
  destinationAssetCode: unknown;
  sourceAmount: unknown;
  destinationAmount: unknown;
}): number | null {
  const sourceAmount = toPositiveNumber(input.sourceAmount);
  const destinationAmount = toPositiveNumber(input.destinationAmount);
  if (!sourceAmount || !destinationAmount) return null;

  if (isUsdcLike(input.sourceAssetCode) && isBrlLike(input.destinationAssetCode)) {
    return destinationAmount / sourceAmount;
  }

  if (isBrlLike(input.sourceAssetCode) && isUsdcLike(input.destinationAssetCode)) {
    return sourceAmount / destinationAmount;
  }

  return null;
}

