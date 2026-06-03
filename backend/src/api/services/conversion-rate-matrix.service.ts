import { getStellarNetworkName, normalizeAssetCode, resolveConfiguredAsset, userFacingAssetCode } from '../../config/assets';
import { BrlReferenceRateService } from './brl-reference-rate.service';
import { FiatRateService } from './fiat-rate.service';
import { StellarService } from './stellar.service';

export type ConversionRateStatus = 'available' | 'same_asset' | 'fallback' | 'synthetic' | 'unavailable';

export type ConversionRateCell = {
  pair: string;
  source_asset_code: string;
  destination_asset_code: string;
  settlement_source_asset_code: string;
  settlement_destination_asset_code: string;
  sample_source_amount: string;
  destination_amount: string | null;
  rate: number | null;
  inverse_rate: number | null;
  status: ConversionRateStatus;
  source: string;
  method: string;
  observed_at: string;
  path: Array<{ code: string; issuer?: string; type?: string }>;
  fee?: {
    platform_fee_amount?: string;
    platform_fee_asset_code?: string;
    fee_bps?: number;
    fee_enabled?: boolean;
  };
  bridge_asset_code?: string;
  legs?: string[];
  error?: string;
};

export type ConversionRateMatrix = {
  success: true;
  network: 'PUBLIC' | 'TESTNET';
  assets: string[];
  generated_at: string;
  sample_amounts: Record<string, string>;
  cells: ConversionRateCell[];
  matrix: Record<string, Record<string, ConversionRateCell>>;
  summary: {
    total_pairs: number;
    available_pairs: number;
    fallback_pairs: number;
    synthetic_pairs: number;
    unavailable_pairs: number;
  };
};

const DEFAULT_MATRIX_ASSETS = ['BRL', 'USDC', 'CETES', 'XLM'];
const DEFAULT_SAMPLE_AMOUNT = '100';

function toPositiveNumber(value: unknown): number {
  const parsed = Number(String(value ?? '').replace(',', '.'));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function toStellarAmount(value: unknown): string {
  const amount = toPositiveNumber(value);
  if (!amount) return Number(DEFAULT_SAMPLE_AMOUNT).toFixed(7);
  return amount.toFixed(7);
}

function roundRate(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Number(value.toFixed(10));
}

function compactAmount(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '0';
  return value.toFixed(7).replace(/\.?0+$/, '');
}

function normalizeMatrixAsset(value: unknown): string {
  const normalized = normalizeAssetCode(value);
  return userFacingAssetCode(normalized === 'BRL' ? 'TESOURO' : normalized);
}

function normalizeAssetList(value?: string[] | string): string[] {
  const raw = Array.isArray(value)
    ? value
    : String(value || process.env.CONVERSION_MATRIX_ASSETS || '')
      .split(/[,\s]+/g);
  const assets = raw
    .map(normalizeMatrixAsset)
    .filter(Boolean);
  const base = assets.length ? assets : DEFAULT_MATRIX_ASSETS;
  return Array.from(new Set(base)).slice(0, 8);
}

function sampleAmountForAsset(assetCode: string, override?: unknown): string {
  const fromOverride = toPositiveNumber(override);
  if (fromOverride > 0) return toStellarAmount(fromOverride);
  const key = `CONVERSION_MATRIX_SAMPLE_${assetCode}`;
  const configured = toPositiveNumber(process.env[key] || process.env.CONVERSION_MATRIX_SAMPLE_AMOUNT);
  return toStellarAmount(configured || DEFAULT_SAMPLE_AMOUNT);
}

function pairKey(sourceAssetCode: string, destinationAssetCode: string): string {
  return `${sourceAssetCode}->${destinationAssetCode}`;
}

function isUsdcBrlPair(sourceAssetCode: string, destinationAssetCode: string): boolean {
  return (
    (sourceAssetCode === 'BRL' && destinationAssetCode === 'USDC') ||
    (sourceAssetCode === 'USDC' && destinationAssetCode === 'BRL')
  );
}

function publicErrorMessage(error: unknown): string {
  return String((error as any)?.message || error || 'conversion_rate_unavailable')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 280);
}

function rateCellFromAmounts(input: {
  sourceAssetCode: string;
  destinationAssetCode: string;
  settlementSourceAssetCode?: string;
  settlementDestinationAssetCode?: string;
  sampleSourceAmount: string;
  destinationAmount: string;
  status: ConversionRateStatus;
  source: string;
  method: string;
  observedAt: string;
  path?: Array<{ code: string; issuer?: string; type?: string }>;
  fee?: ConversionRateCell['fee'];
  bridgeAssetCode?: string;
  legs?: string[];
}): ConversionRateCell {
  const sourceAmount = toPositiveNumber(input.sampleSourceAmount);
  const destinationAmount = toPositiveNumber(input.destinationAmount);
  const rate = sourceAmount > 0 && destinationAmount > 0 ? destinationAmount / sourceAmount : 0;
  return {
    pair: pairKey(input.sourceAssetCode, input.destinationAssetCode),
    source_asset_code: input.sourceAssetCode,
    destination_asset_code: input.destinationAssetCode,
    settlement_source_asset_code: input.settlementSourceAssetCode || resolveConfiguredAsset(input.sourceAssetCode).code,
    settlement_destination_asset_code: input.settlementDestinationAssetCode || resolveConfiguredAsset(input.destinationAssetCode).code,
    sample_source_amount: compactAmount(sourceAmount),
    destination_amount: compactAmount(destinationAmount),
    rate: roundRate(rate),
    inverse_rate: rate > 0 ? roundRate(1 / rate) : null,
    status: input.status,
    source: input.source,
    method: input.method,
    observed_at: input.observedAt,
    path: input.path || [],
    ...(input.fee ? { fee: input.fee } : {}),
    ...(input.bridgeAssetCode ? { bridge_asset_code: input.bridgeAssetCode } : {}),
    ...(input.legs?.length ? { legs: input.legs } : {}),
  };
}

async function quoteUsdcBrlPair(input: {
  sourceAssetCode: string;
  destinationAssetCode: string;
  sampleSourceAmount: string;
  observedAt: string;
}): Promise<ConversionRateCell> {
  try {
    const quote = input.sourceAssetCode === 'BRL'
      ? await BrlReferenceRateService.quoteBrlToUsdc(input.sampleSourceAmount)
      : await BrlReferenceRateService.quoteUsdcToBrl(input.sampleSourceAmount);

    return rateCellFromAmounts({
      sourceAssetCode: input.sourceAssetCode,
      destinationAssetCode: input.destinationAssetCode,
      settlementSourceAssetCode: quote.sourceAsset.code,
      settlementDestinationAssetCode: quote.destinationAsset.code,
      sampleSourceAmount: quote.sourceAmount,
      destinationAmount: quote.destinationAmount,
      status: 'available',
      source: quote.source,
      method: 'stellar_strict_send_brl_usdc_reference',
      observedAt: quote.fetchedAt || input.observedAt,
      path: quote.path,
    });
  } catch (error) {
    const market = await FiatRateService.getUsdBrlRate();
    const sourceAmount = toPositiveNumber(input.sampleSourceAmount);
    const destinationAmount = input.sourceAssetCode === 'BRL'
      ? sourceAmount / market.brlPerUsd
      : sourceAmount * market.brlPerUsd;
    return rateCellFromAmounts({
      sourceAssetCode: input.sourceAssetCode,
      destinationAssetCode: input.destinationAssetCode,
      sampleSourceAmount: input.sampleSourceAmount,
      destinationAmount: compactAmount(destinationAmount),
      status: 'fallback',
      source: market.source,
      method: 'dynamic_usd_brl_market_reference_after_stellar_quote_rejected',
      observedAt: market.fetchedAt || input.observedAt,
      path: [],
      legs: [`stellar_error:${publicErrorMessage(error)}`],
    });
  }
}

async function quoteStellarPair(input: {
  sourceAssetCode: string;
  destinationAssetCode: string;
  sampleSourceAmount: string;
  observedAt: string;
}): Promise<ConversionRateCell> {
  const sourceAsset = resolveConfiguredAsset(input.sourceAssetCode);
  const destinationAsset = resolveConfiguredAsset(input.destinationAssetCode);
  const quote = await StellarService.quoteStrictSendConversion({
    sourcePublicKey: '',
    destination: '',
    sourceAsset,
    destAsset: destinationAsset,
    sourceAmount: input.sampleSourceAmount,
  });

  return rateCellFromAmounts({
    sourceAssetCode: input.sourceAssetCode,
    destinationAssetCode: input.destinationAssetCode,
    settlementSourceAssetCode: quote.sourceAsset.code,
    settlementDestinationAssetCode: quote.destinationAsset.code,
    sampleSourceAmount: quote.sourceAmount,
    destinationAmount: quote.destinationAmount,
    status: 'available',
    source: 'stellar_horizon_strict_send_paths',
    method: 'stellar_strict_send_best_destination_amount',
    observedAt: input.observedAt,
    path: quote.path || [],
    fee: {
      platform_fee_amount: quote.platformFee?.feeAmount,
      platform_fee_asset_code: quote.platformFee?.feeAssetCode,
      fee_bps: quote.platformFee?.feeBps,
      fee_enabled: quote.platformFee?.enabled,
    },
  });
}

function sameAssetCell(input: {
  sourceAssetCode: string;
  sampleSourceAmount: string;
  observedAt: string;
}): ConversionRateCell {
  const asset = resolveConfiguredAsset(input.sourceAssetCode);
  return rateCellFromAmounts({
    sourceAssetCode: input.sourceAssetCode,
    destinationAssetCode: input.sourceAssetCode,
    settlementSourceAssetCode: asset.code,
    settlementDestinationAssetCode: asset.code,
    sampleSourceAmount: input.sampleSourceAmount,
    destinationAmount: input.sampleSourceAmount,
    status: 'same_asset',
    source: 'identity',
    method: 'same_asset_rate',
    observedAt: input.observedAt,
  });
}

function unavailableCell(input: {
  sourceAssetCode: string;
  destinationAssetCode: string;
  sampleSourceAmount: string;
  observedAt: string;
  error: unknown;
}): ConversionRateCell {
  const sourceAsset = resolveConfiguredAsset(input.sourceAssetCode);
  const destinationAsset = resolveConfiguredAsset(input.destinationAssetCode);
  return {
    pair: pairKey(input.sourceAssetCode, input.destinationAssetCode),
    source_asset_code: input.sourceAssetCode,
    destination_asset_code: input.destinationAssetCode,
    settlement_source_asset_code: sourceAsset.code,
    settlement_destination_asset_code: destinationAsset.code,
    sample_source_amount: compactAmount(toPositiveNumber(input.sampleSourceAmount)),
    destination_amount: null,
    rate: null,
    inverse_rate: null,
    status: 'unavailable',
    source: 'none',
    method: 'no_trusted_dynamic_rate_available',
    observed_at: input.observedAt,
    path: [],
    error: publicErrorMessage(input.error),
  };
}

function usableCell(cell?: ConversionRateCell): cell is ConversionRateCell {
  return Boolean(cell && cell.rate && cell.rate > 0 && cell.destination_amount && cell.status !== 'unavailable');
}

function synthesizeCell(input: {
  sourceAssetCode: string;
  destinationAssetCode: string;
  sampleSourceAmount: string;
  bridgeAssetCode: string;
  first: ConversionRateCell;
  second: ConversionRateCell;
  observedAt: string;
}): ConversionRateCell {
  const sourceAmount = toPositiveNumber(input.sampleSourceAmount);
  const rate = Number(input.first.rate || 0) * Number(input.second.rate || 0);
  const destinationAmount = sourceAmount * rate;
  return rateCellFromAmounts({
    sourceAssetCode: input.sourceAssetCode,
    destinationAssetCode: input.destinationAssetCode,
    sampleSourceAmount: input.sampleSourceAmount,
    destinationAmount: compactAmount(destinationAmount),
    status: 'synthetic',
    source: `synthetic:via_${input.bridgeAssetCode}`,
    method: 'cross_rate_from_two_dynamic_legs',
    observedAt: input.observedAt,
    bridgeAssetCode: input.bridgeAssetCode,
    legs: [input.first.pair, input.second.pair],
    path: [
      { code: input.sourceAssetCode, type: 'source' },
      { code: input.bridgeAssetCode, type: 'bridge' },
      { code: input.destinationAssetCode, type: 'destination' },
    ],
  });
}

export class ConversionRateMatrixService {
  static async buildMatrix(input: {
    assets?: string[] | string;
    sampleAmount?: string | number;
  } = {}): Promise<ConversionRateMatrix> {
    const assets = normalizeAssetList(input.assets);
    const observedAt = new Date().toISOString();
    const sampleAmounts = Object.fromEntries(
      assets.map((asset) => [asset, sampleAmountForAsset(asset, input.sampleAmount)])
    );

    const directCells = await Promise.all(
      assets.flatMap((sourceAssetCode) => assets.map(async (destinationAssetCode) => {
        const sampleSourceAmount = sampleAmounts[sourceAssetCode];
        if (sourceAssetCode === destinationAssetCode) {
          return sameAssetCell({ sourceAssetCode, sampleSourceAmount, observedAt });
        }

        try {
          if (isUsdcBrlPair(sourceAssetCode, destinationAssetCode)) {
            return await quoteUsdcBrlPair({ sourceAssetCode, destinationAssetCode, sampleSourceAmount, observedAt });
          }
          return await quoteStellarPair({ sourceAssetCode, destinationAssetCode, sampleSourceAmount, observedAt });
        } catch (error) {
          return unavailableCell({ sourceAssetCode, destinationAssetCode, sampleSourceAmount, observedAt, error });
        }
      }))
    );

    const directMap = new Map(directCells.map((cell) => [cell.pair, cell]));
    const finalCells = directCells.map((cell) => {
      if (cell.status !== 'unavailable') return cell;
      for (const bridgeAssetCode of assets) {
        if (bridgeAssetCode === cell.source_asset_code || bridgeAssetCode === cell.destination_asset_code) continue;
        const first = directMap.get(pairKey(cell.source_asset_code, bridgeAssetCode));
        const second = directMap.get(pairKey(bridgeAssetCode, cell.destination_asset_code));
        if (usableCell(first) && usableCell(second)) {
          return synthesizeCell({
            sourceAssetCode: cell.source_asset_code,
            destinationAssetCode: cell.destination_asset_code,
            sampleSourceAmount: cell.sample_source_amount,
            bridgeAssetCode,
            first,
            second,
            observedAt,
          });
        }
      }
      return cell;
    });

    const matrix: Record<string, Record<string, ConversionRateCell>> = {};
    for (const asset of assets) matrix[asset] = {};
    for (const cell of finalCells) {
      matrix[cell.source_asset_code][cell.destination_asset_code] = cell;
    }

    return {
      success: true,
      network: getStellarNetworkName(),
      assets,
      generated_at: observedAt,
      sample_amounts: sampleAmounts,
      cells: finalCells,
      matrix,
      summary: {
        total_pairs: finalCells.length,
        available_pairs: finalCells.filter((cell) => ['available', 'same_asset', 'fallback', 'synthetic'].includes(cell.status)).length,
        fallback_pairs: finalCells.filter((cell) => cell.status === 'fallback').length,
        synthetic_pairs: finalCells.filter((cell) => cell.status === 'synthetic').length,
        unavailable_pairs: finalCells.filter((cell) => cell.status === 'unavailable').length,
      },
    };
  }
}
