import { Asset } from '@stellar/stellar-sdk';
import { server } from '../../config/stellar';
import { getAssetIssuer, getTrustedPathAssetCodes, normalizeAssetCode, resolveConfiguredAsset } from '../../config/assets';
import { assertSaneBrlUsdcQuote } from './quote-rate-sanity.service';
import { TRANSACTION_RATE_SOURCE } from './transaction-rate.service';

type AssetInput = {
  code: string;
  issuer?: string;
};

type PathAsset = {
  code: string;
  issuer?: string;
  type: string;
};

export type BrlReferenceQuote = {
  source: typeof TRANSACTION_RATE_SOURCE;
  symbol: 'USDC/BRL';
  brlPerUsdc: string;
  usdcPerBrl: string;
  fetchedAt: string;
  sourceAsset: AssetInput;
  destinationAsset: AssetInput;
  sourceAmount: string;
  destinationAmount: string;
  path: PathAsset[];
};

function toPositiveNumber(value: unknown): number {
  const parsed = Number(String(value || '').replace(',', '.'));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function toStellarAmount(value: unknown): string {
  const amount = toPositiveNumber(value);
  if (!amount) {
    throw new Error('Amount must be a positive decimal value.');
  }
  return amount.toFixed(7);
}

function createConfiguredAsset(code: 'BRL' | 'USDC'): AssetInput {
  const asset = resolveConfiguredAsset(code);
  const issuer = asset.issuer || getAssetIssuer(asset.code);
  if (!issuer) {
    throw new Error(`${asset.code}_ISSUER is not configured for the current Stellar network.`);
  }
  return { code: asset.code, issuer };
}

function toSdkAsset(asset: AssetInput): Asset {
  if (normalizeAssetCode(asset.code) === 'XLM') return Asset.native();
  if (!asset.issuer) throw new Error(`${asset.code}_ISSUER is required.`);
  return new Asset(asset.code, asset.issuer);
}

function pathAssetIsTrusted(pathAsset: any): boolean {
  const type = String(pathAsset?.asset_type || '').toLowerCase();
  if (type === 'native') return true;

  const code = normalizeAssetCode(pathAsset?.asset_code);
  const expectedIssuer = getAssetIssuer(code);
  const actualIssuer = String(pathAsset?.asset_issuer || '').trim();
  return Boolean(
    code &&
    getTrustedPathAssetCodes().includes(code) &&
    expectedIssuer &&
    actualIssuer &&
    actualIssuer === expectedIssuer,
  );
}

function normalizePath(path: any[] = []): PathAsset[] {
  return path.map((asset) => ({
    code: String(asset?.asset_type || '').toLowerCase() === 'native'
      ? 'XLM'
      : normalizeAssetCode(asset?.asset_code),
    issuer: asset?.asset_issuer || undefined,
    type: String(asset?.asset_type || ''),
  }));
}

function selectBestStrictSendPath(records: any[]): any {
  const trusted = (Array.isArray(records) ? records : []).filter((record) => {
    const path = Array.isArray(record?.path) ? record.path : [];
    return path.every(pathAssetIsTrusted);
  });
  if (!trusted.length) {
    throw new Error('No trusted on-chain BRL/USDC path was found for the configured BRL asset.');
  }

  return trusted.sort((a, b) => (
    toPositiveNumber(b?.destination_amount) - toPositiveNumber(a?.destination_amount)
  ))[0];
}

export class BrlReferenceRateService {
  static async quoteStrictSend(input: {
    sourceAssetCode: 'BRL' | 'USDC';
    destinationAssetCode: 'BRL' | 'USDC';
    sourceAmount: string | number;
  }): Promise<BrlReferenceQuote> {
    const sourceAmount = toStellarAmount(input.sourceAmount);
    const sourceAsset = createConfiguredAsset(input.sourceAssetCode);
    const destinationAsset = createConfiguredAsset(input.destinationAssetCode);
    const sourceSdkAsset = toSdkAsset(sourceAsset);
    const destinationSdkAsset = toSdkAsset(destinationAsset);

    const response = await server.strictSendPaths(
      sourceSdkAsset,
      sourceAmount,
      [destinationSdkAsset],
    ).call();

    const bestPath = selectBestStrictSendPath(response.records || []);
    const destinationAmount = String(bestPath.destination_amount || '0');
    const source = toPositiveNumber(sourceAmount);
    const destination = toPositiveNumber(destinationAmount);
    if (!source || !destination) {
      throw new Error('Configured BRL/USDC on-chain quote returned an invalid amount.');
    }

    await assertSaneBrlUsdcQuote({
      sourceAssetCode: input.sourceAssetCode,
      destinationAssetCode: input.destinationAssetCode,
      sourceAmount,
      destinationAmount,
      context: 'BRL reference rate',
    });

    const brlPerUsdc = input.sourceAssetCode === 'USDC'
      ? destination / source
      : source / destination;
    const usdcPerBrl = brlPerUsdc > 0 ? 1 / brlPerUsdc : 0;

    return {
      source: TRANSACTION_RATE_SOURCE,
      symbol: 'USDC/BRL',
      brlPerUsdc: brlPerUsdc.toFixed(8),
      usdcPerBrl: usdcPerBrl.toFixed(8),
      fetchedAt: new Date().toISOString(),
      sourceAsset,
      destinationAsset,
      sourceAmount,
      destinationAmount,
      path: normalizePath(bestPath.path || []),
    };
  }

  static async getReferenceRate(): Promise<BrlReferenceQuote> {
    const sampleUsdc = process.env.BRL_USDC_REFERENCE_SAMPLE_USDC || '100';
    return this.quoteStrictSend({
      sourceAssetCode: 'USDC',
      destinationAssetCode: 'BRL',
      sourceAmount: sampleUsdc,
    });
  }

  static async quoteBrlToUsdc(amountBrl: string | number): Promise<BrlReferenceQuote> {
    return this.quoteStrictSend({
      sourceAssetCode: 'BRL',
      destinationAssetCode: 'USDC',
      sourceAmount: amountBrl,
    });
  }

  static async quoteUsdcToBrl(amountUsdc: string | number): Promise<BrlReferenceQuote> {
    return this.quoteStrictSend({
      sourceAssetCode: 'USDC',
      destinationAssetCode: 'BRL',
      sourceAmount: amountUsdc,
    });
  }
}
