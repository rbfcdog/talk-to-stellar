import { Asset, Horizon } from '@stellar/stellar-sdk';
import dotenv from 'dotenv';
import { getAssetIssuer, normalizeAssetCode } from '../src/config/assets';
import { assertTestnetOnlyScript } from './stellar-script-safety';

dotenv.config();

const horizonUrl = process.env.STELLAR_HORIZON_URL || 'https://horizon-testnet.stellar.org';
assertTestnetOnlyScript('debug-path-quotes', horizonUrl);
const server = new Horizon.Server(horizonUrl);

function createAsset(codeValue: string): Asset {
  const code = normalizeAssetCode(codeValue);
  if (code === 'XLM') return Asset.native();
  const issuer = getAssetIssuer(code);
  if (!issuer) {
    throw new Error(`${code}_ISSUER not configured`);
  }
  return new Asset(code, issuer);
}

function assetLabel(asset: Asset): string {
  if (asset.isNative()) return 'XLM:native';
  return `${asset.getCode()}:${asset.getIssuer()}`;
}

function pathToString(path: any[]): string {
  if (!Array.isArray(path) || path.length === 0) return '(direct)';
  return path
    .map((hop) => hop.asset_type === 'native'
      ? 'XLM:native'
      : `${String(hop.asset_code || '').toUpperCase()}:${String(hop.asset_issuer || '')}`
    )
    .join(' -> ');
}

async function debugStrictReceive(sourceCode: string, destinationCode: string, destinationAmount: string): Promise<void> {
  const source = createAsset(sourceCode);
  const destination = createAsset(destinationCode);
  const response = await server.strictReceivePaths([source], destination, destinationAmount).call();
  const records = response.records || [];

  console.log(`\nSTRICT-RECEIVE ${assetLabel(source)} -> ${assetLabel(destination)} amount=${destinationAmount}`);
  console.log(`paths=${records.length}`);

  records.slice(0, 10).forEach((record: any, index: number) => {
    const srcCode = record.source_asset_type === 'native' ? 'XLM' : record.source_asset_code;
    const srcIssuer = record.source_asset_type === 'native' ? 'native' : record.source_asset_issuer;
    const dstCode = record.destination_asset_type === 'native' ? 'XLM' : record.destination_asset_code;
    const dstIssuer = record.destination_asset_type === 'native' ? 'native' : record.destination_asset_issuer;
    const impliedRate = Number(record.destination_amount) / Number(record.source_amount || '1');
    console.log(
      `${index + 1}. src=${srcCode}:${srcIssuer} src_amount=${record.source_amount} -> dst=${dstCode}:${dstIssuer} dst_amount=${record.destination_amount} implied_dst_per_src=${impliedRate.toFixed(9)} path=${pathToString(record.path || [])}`
    );
  });
}

async function debugStrictSend(sourceCode: string, destinationCode: string, sourceAmount: string): Promise<void> {
  const source = createAsset(sourceCode);
  const destination = createAsset(destinationCode);
  const response = await server.strictSendPaths(source, sourceAmount, [destination]).call();
  const records = response.records || [];

  console.log(`\nSTRICT-SEND ${assetLabel(source)} -> ${assetLabel(destination)} amount=${sourceAmount}`);
  console.log(`paths=${records.length}`);

  records.slice(0, 10).forEach((record: any, index: number) => {
    const srcCode = record.source_asset_type === 'native' ? 'XLM' : record.source_asset_code;
    const srcIssuer = record.source_asset_type === 'native' ? 'native' : record.source_asset_issuer;
    const dstCode = record.destination_asset_type === 'native' ? 'XLM' : record.destination_asset_code;
    const dstIssuer = record.destination_asset_type === 'native' ? 'native' : record.destination_asset_issuer;
    const impliedRate = Number(record.destination_amount || '0') / Number(record.source_amount || '1');
    console.log(
      `${index + 1}. src=${srcCode}:${srcIssuer} src_amount=${record.source_amount} -> dst=${dstCode}:${dstIssuer} dst_amount=${record.destination_amount} implied_dst_per_src=${impliedRate.toFixed(9)} path=${pathToString(record.path || [])}`
    );
  });
}

async function main(): Promise<void> {
  const sourceCode = process.env.DEBUG_SOURCE_ASSET || 'XLM';
  const destinationCode = process.env.DEBUG_DEST_ASSET || 'USDC';
  const destinationAmount = process.env.DEBUG_DEST_AMOUNT || '10';
  const sourceAmount = process.env.DEBUG_SOURCE_AMOUNT || '100';

  console.log(`Horizon URL: ${horizonUrl}`);
  console.log(`USDC issuer: ${getAssetIssuer('USDC') || 'not configured'}`);
  console.log(`TESOURO issuer: ${getAssetIssuer('TESOURO') || 'not configured'}`);

  await debugStrictReceive(sourceCode, destinationCode, destinationAmount);
  await debugStrictSend(sourceCode, destinationCode, sourceAmount);
}

main().catch((error) => {
  console.error('debug-path-quotes failed:', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
