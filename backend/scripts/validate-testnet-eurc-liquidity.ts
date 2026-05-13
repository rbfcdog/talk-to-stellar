import { Asset, Horizon } from '@stellar/stellar-sdk';
import dotenv from 'dotenv';
import { getAssetIssuer, normalizeAssetCode } from '../src/config/assets';

dotenv.config();

const horizonUrl = process.env.STELLAR_HORIZON_URL || 'https://horizon-testnet.stellar.org';
const server = new Horizon.Server(horizonUrl);

function createAsset(codeValue: string): Asset {
  const code = normalizeAssetCode(codeValue);
  if (code === 'XLM') return Asset.native();
  const issuer = String(getAssetIssuer(code) || '').trim();
  if (!issuer) throw new Error(`Issuer não configurado para ${code}.`);
  return new Asset(code, issuer);
}

function assetLabel(asset: Asset): string {
  return asset.isNative() ? 'XLM:native' : `${asset.getCode()}:${asset.getIssuer()}`;
}

function parsePositive(name: string, fallback: number): number {
  const parsed = Number(String(process.env[name] || '').trim());
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

async function strictSendCount(source: Asset, sourceAmount: string, destination: Asset): Promise<number> {
  const result = await server.strictSendPaths(source, sourceAmount, [destination]).call();
  return Array.isArray(result?.records) ? result.records.length : 0;
}

async function strictReceiveCount(sourceAssets: Asset[], destination: Asset, destinationAmount: string): Promise<number> {
  const result = await server.strictReceivePaths(sourceAssets, destination, destinationAmount).call();
  return Array.isArray(result?.records) ? result.records.length : 0;
}

async function orderbookDepth(selling: Asset, buying: Asset): Promise<{ bids: number; asks: number }> {
  const result = await server.orderbook(selling, buying).call();
  return {
    bids: Array.isArray((result as any)?.bids) ? (result as any).bids.length : 0,
    asks: Array.isArray((result as any)?.asks) ? (result as any).asks.length : 0,
  };
}

export async function validateEurcLiquidity(): Promise<{
  success: boolean;
  checks: Record<string, number>;
  orderbooks: Record<string, { bids: number; asks: number }>;
}> {
  const usdc = createAsset('USDC');
  const eurc = createAsset('EURC');
  const xlm = Asset.native();

  const strictSendUsdcAmount = parsePositive('VALIDATE_EURC_STRICT_SEND_USDC_AMOUNT', 10).toFixed(7);
  const strictSendXlmAmount = parsePositive('VALIDATE_EURC_STRICT_SEND_XLM_AMOUNT', 20).toFixed(7);
  const strictReceiveEurcAmount = parsePositive('VALIDATE_EURC_STRICT_RECEIVE_EURC_AMOUNT', 10).toFixed(7);

  const [
    strictSendUsdcToEurc,
    strictReceiveUsdcToEurc,
    strictSendXlmToEurc,
    strictReceiveXlmToEurc,
    eurcUsdcBook,
    eurcXlmBook,
  ] = await Promise.all([
    strictSendCount(usdc, strictSendUsdcAmount, eurc),
    strictReceiveCount([usdc], eurc, strictReceiveEurcAmount),
    strictSendCount(xlm, strictSendXlmAmount, eurc),
    strictReceiveCount([xlm], eurc, strictReceiveEurcAmount),
    orderbookDepth(eurc, usdc),
    orderbookDepth(eurc, xlm),
  ]);

  const checks = {
    strict_send_usdc_to_eurc: strictSendUsdcToEurc,
    strict_receive_usdc_to_eurc: strictReceiveUsdcToEurc,
    strict_send_xlm_to_eurc: strictSendXlmToEurc,
    strict_receive_xlm_to_eurc: strictReceiveXlmToEurc,
  };
  const orderbooks = {
    eurc_usdc: eurcUsdcBook,
    eurc_xlm: eurcXlmBook,
  };

  const success = Object.values(checks).every((count) => count > 0);

  console.log(`Horizon: ${horizonUrl}`);
  console.log(`USDC: ${assetLabel(usdc)}`);
  console.log(`EURC: ${assetLabel(eurc)}`);
  console.log(`XLM: ${assetLabel(xlm)}`);
  console.log('Checks de rota:', checks);
  console.log('Profundidade de orderbook:', orderbooks);

  if (!success) {
    console.error(
      'Validação EURC falhou: ainda faltam rotas de liquidez para USDC/XLM -> EURC. ' +
      'Rode o setup de liquidez e tente novamente.'
    );
  } else {
    console.log('Validação EURC OK: rotas e orderbooks mínimos disponíveis.');
  }

  return { success, checks, orderbooks };
}

if (require.main === module) {
  validateEurcLiquidity()
    .then((result) => {
      if (!result.success) process.exit(1);
    })
    .catch((error) => {
      console.error('validate-testnet-eurc-liquidity failed:', error instanceof Error ? error.message : String(error));
      process.exit(1);
    });
}

