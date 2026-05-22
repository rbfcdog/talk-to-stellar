export type PlatformSpreadFee = {
  enabled: boolean;
  feeBps: number;
  feeRate: number;
  feeAmount: string;
  feeAssetCode: string;
  grossSourceAmount: string;
  netSourceAmount: string;
  treasuryPublicKey?: string;
  comparisonMethod: string;
};

const DEFAULT_SPREAD_BPS = 30;
const DEFAULT_MIN_FEE_USDC = 0.01;
const DEFAULT_MIN_FEE_BRL = 0.05;

function toNumber(value: unknown): number {
  const parsed = Number(String(value || '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatAssetAmount(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '0';
  return value.toFixed(7).replace(/\.?0+$/, '');
}

function configuredSpreadBps(): number {
  const raw = process.env.TALKTOSTELLAR_SPREAD_BPS || process.env.TTS_SPREAD_BPS;
  const parsed = raw === undefined ? DEFAULT_SPREAD_BPS : Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) return DEFAULT_SPREAD_BPS;
  return Math.min(parsed, 1000);
}

function configuredMinimumFeeForAsset(assetCode: string): number {
  const normalized = String(assetCode || '').trim().toUpperCase().replace(/^USD$/, 'USDC');
  if (normalized === 'USDC') {
    const raw = process.env.TALKTOSTELLAR_SPREAD_MIN_USDC || process.env.TTS_SPREAD_MIN_USDC;
    const parsed = raw === undefined ? DEFAULT_MIN_FEE_USDC : Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_MIN_FEE_USDC;
  }
  if (normalized === 'BRL') {
    const raw = process.env.TALKTOSTELLAR_SPREAD_MIN_BRL || process.env.TTS_SPREAD_MIN_BRL;
    const parsed = raw === undefined ? DEFAULT_MIN_FEE_BRL : Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_MIN_FEE_BRL;
  }
  return 0;
}

export class PlatformFeeService {
  static isUsdcBrlTransaction(sourceAssetCode?: string, destinationAssetCode?: string): boolean {
    const source = String(sourceAssetCode || '').trim().toUpperCase().replace(/^USD$/, 'USDC');
    const destination = String(destinationAssetCode || '').trim().toUpperCase().replace(/^USD$/, 'USDC');
    if (!source || !destination) return false;
    return (source === 'USDC' && destination === 'BRL') || (source === 'BRL' && destination === 'USDC');
  }

  static getTreasuryPublicKey(): string | undefined {
    const key = String(
      process.env.TALKTOSTELLAR_FEE_TREASURY_PUBLIC_KEY ||
      process.env.TTS_FEE_TREASURY_PUBLIC_KEY ||
      ''
    ).trim();
    return key || undefined;
  }

  static calculateSpread(input: {
    sourceAmount: string | number;
    sourceAssetCode: string;
    destinationAssetCode?: string;
    mode?: 'deduct_from_source' | 'add_on_top';
  }): PlatformSpreadFee {
    const gross = Math.max(0, toNumber(input.sourceAmount));
    const feeBps = configuredSpreadBps();
    const feeRate = feeBps / 10000;
    const treasuryPublicKey = this.getTreasuryPublicKey();
    const mode = input.mode || 'deduct_from_source';
    const appliesByPair = this.isUsdcBrlTransaction(input.sourceAssetCode, input.destinationAssetCode);
    const proportionalFee = gross > 0 ? gross * feeRate : 0;
    const minimumFee = appliesByPair ? configuredMinimumFeeForAsset(input.sourceAssetCode) : 0;
    const computedFee = gross > 0 ? Math.max(proportionalFee, minimumFee) : 0;
    const fee = mode === 'deduct_from_source' ? Math.min(computedFee, gross) : computedFee;
    const net = mode === 'deduct_from_source'
      ? Math.max(0, gross - fee)
      : gross;
    const feeAmount = formatAssetAmount(fee);
    return {
      enabled: gross > 0 && toNumber(feeAmount) > 0 && Boolean(treasuryPublicKey) && appliesByPair,
      feeBps,
      feeRate,
      feeAmount,
      feeAssetCode: String(input.sourceAssetCode || '').trim().toUpperCase() || 'UNKNOWN',
      grossSourceAmount: formatAssetAmount(mode === 'add_on_top' ? gross + fee : gross),
      netSourceAmount: formatAssetAmount(net),
      treasuryPublicKey,
      comparisonMethod: 'traditional_providers_average_3_5pct',
    };
  }

  static metadata(fee?: PlatformSpreadFee | null): Record<string, unknown> | null {
    if (!fee?.enabled) return null;
    return {
      platform_spread_fee: {
        fee_bps: fee.feeBps,
        fee_rate: fee.feeRate,
        fee_amount: fee.feeAmount,
        fee_asset_code: fee.feeAssetCode,
        gross_source_amount: fee.grossSourceAmount,
        net_source_amount: fee.netSourceAmount,
        treasury_configured: Boolean(fee.treasuryPublicKey),
      },
      comparison_method: fee.comparisonMethod,
    };
  }
}
