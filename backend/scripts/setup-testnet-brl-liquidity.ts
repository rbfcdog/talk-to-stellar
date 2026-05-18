import {
  Asset,
  BASE_FEE,
  Horizon,
  Keypair,
  Networks,
  Operation,
  TransactionBuilder,
} from '@stellar/stellar-sdk';
import dotenv from 'dotenv';
import { assertTestnetOnlyScript } from './stellar-script-safety';

dotenv.config();

const horizonUrl = process.env.STELLAR_HORIZON_URL || 'https://horizon-testnet.stellar.org';
const friendbotUrl = process.env.STELLAR_FRIENDBOT_URL || 'https://friendbot.stellar.org';
assertTestnetOnlyScript('setup-testnet-brl-liquidity', horizonUrl);
const server = new Horizon.Server(horizonUrl);
const USDC_ISSUER = process.env.USDC_ISSUER || 'GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5';
const useDynamicRates = String(process.env.TESTNET_SETUP_USE_DYNAMIC_RATES || 'true').trim().toLowerCase() !== 'false';

function requirePositiveNumber(name: string): number {
  const raw = String(process.env[name] || '').trim();
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be set to a positive number.`);
  }
  return value;
}

function parsePositiveNumber(name: string, fallback: number): number {
  const raw = String(process.env[name] || '').trim();
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return value;
}

const brlIssuanceAmount = parsePositiveNumber('TESTNET_SETUP_BRL_ISSUANCE_AMOUNT', 100000);
const brlLiquidityAmount = parsePositiveNumber('TESTNET_SETUP_BRL_LIQUIDITY_AMOUNT', 20000);
const usdcLiquidityAmount = parsePositiveNumber('TESTNET_SETUP_USDC_BRL_LIQUIDITY_AMOUNT', 2000);
let brlPerXlm = Number(String(process.env.TESTNET_SETUP_BRL_PER_XLM_PRICE || '').trim());
let brlPerUsdc = Number(String(process.env.TESTNET_SETUP_BRL_PER_USDC_PRICE || '').trim());

type LoadedKeypair = { keypair: Keypair; generated: boolean };
type OperationInput = Parameters<typeof TransactionBuilder.prototype.addOperation>[0];

function loadOrCreateKeypair(label: string, secretEnv: string, publicEnv: string): LoadedKeypair {
  const secret = process.env[secretEnv];
  const publicKey = process.env[publicEnv];

  if (secret) {
    const keypair = Keypair.fromSecret(secret);
    if (publicKey && publicKey !== keypair.publicKey()) {
      throw new Error(`${publicEnv} does not match ${secretEnv}.`);
    }
    return { keypair, generated: false };
  }

  if (publicKey) {
    throw new Error(`${publicEnv} is set but ${secretEnv} is missing.`);
  }

  const keypair = Keypair.random();
  console.log(`${label} generated: ${keypair.publicKey()}`);
  return { keypair, generated: true };
}

async function fundWithFriendbot(publicKey: string): Promise<void> {
  const response = await fetch(`${friendbotUrl}?addr=${encodeURIComponent(publicKey)}`);
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Friendbot failed for ${publicKey}: ${response.status} ${body}`);
  }
}

async function fetchBinancePrice(symbol: string): Promise<number | undefined> {
  try {
    const response = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${encodeURIComponent(symbol)}`);
    if (!response.ok) return undefined;
    const data = (await response.json().catch(() => null)) as { price?: string } | null;
    const value = Number(String(data?.price || '').trim());
    return Number.isFinite(value) && value > 0 ? value : undefined;
  } catch {
    return undefined;
  }
}

async function resolveDynamicRates(): Promise<{ brlPerUsdc: number; brlPerXlm: number }> {
  const usdcBrl = await fetchBinancePrice('USDCBRL');
  const xlmUsdc = (await fetchBinancePrice('XLMUSDC')) || (await fetchBinancePrice('XLMUSDT'));

  if (!usdcBrl || !xlmUsdc) {
    throw new Error(
      `Could not fetch dynamic rates from Binance (USDCBRL=${String(usdcBrl)}, XLMUSDC/XLMUSDT=${String(xlmUsdc)}).`
    );
  }

  const computedBrlPerUsdc = usdcBrl;
  const computedBrlPerXlm = usdcBrl * xlmUsdc;

  if (!Number.isFinite(computedBrlPerUsdc) || computedBrlPerUsdc <= 0 || !Number.isFinite(computedBrlPerXlm) || computedBrlPerXlm <= 0) {
    throw new Error('Dynamic rate calculation produced invalid values.');
  }

  return {
    brlPerUsdc: computedBrlPerUsdc,
    brlPerXlm: computedBrlPerXlm,
  };
}

async function ensureAccountFunded(keypair: Keypair, label: string): Promise<void> {
  try {
    await server.loadAccount(keypair.publicKey());
    return;
  } catch (error: any) {
    if (error?.response?.status !== 404) throw error;
  }

  console.log(`Funding ${label} via Friendbot...`);
  await fundWithFriendbot(keypair.publicKey());
}

function formatHorizonError(error: any): string {
  const status = error?.response?.status;
  const data = error?.response?.data;
  const resultCodes = data?.extras?.result_codes;
  const resultXdr = data?.extras?.result_xdr;
  const detail = [
    status ? `status=${status}` : '',
    resultCodes ? `result_codes=${JSON.stringify(resultCodes)}` : '',
    resultXdr ? `result_xdr=${resultXdr}` : '',
  ].filter(Boolean).join(' ');
  return detail || (error instanceof Error ? error.message : String(error));
}

async function submitTransaction(source: Keypair, operations: OperationInput[], label: string): Promise<void> {
  const account = await server.loadAccount(source.publicKey());
  let builder = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: Networks.TESTNET,
  });

  for (const op of operations) {
    builder = builder.addOperation(op);
  }

  const tx = builder.setTimeout(180).build();
  tx.sign(source);
  try {
    await server.submitTransaction(tx);
  } catch (error) {
    throw new Error(`${label} failed: ${formatHorizonError(error)}`);
  }
}

function getBalanceForAsset(account: Horizon.AccountResponse, asset: Asset): number {
  if (asset.isNative()) {
    const native = account.balances.find((balance) => balance.asset_type === 'native');
    return native ? Number(native.balance) : 0;
  }

  const balanceLine = account.balances.find((balance) => {
    if (balance.asset_type === 'native') return false;
    if (!('asset_code' in balance) || !('asset_issuer' in balance)) return false;
    return balance.asset_code === asset.getCode() && balance.asset_issuer === asset.getIssuer();
  });

  return balanceLine ? Number(balanceLine.balance) : 0;
}

async function ensureTrustline(owner: Keypair, asset: Asset): Promise<void> {
  const account = await server.loadAccount(owner.publicKey());
  const hasTrustline = account.balances.some((balance) => {
    if (balance.asset_type === 'native') return false;
    if (!('asset_code' in balance) || !('asset_issuer' in balance)) return false;
    return balance.asset_code === asset.getCode() && balance.asset_issuer === asset.getIssuer();
  });

  if (hasTrustline) return;
  await submitTransaction(owner, [Operation.changeTrust({ asset })], `changeTrust ${asset.getCode()}`);
}

async function topUpBalance(source: Keypair, destination: string, asset: Asset, targetAmount: number): Promise<void> {
  const destinationAccount = await server.loadAccount(destination);
  const currentBalance = getBalanceForAsset(destinationAccount, asset);
  if (currentBalance >= targetAmount) return;

  await submitTransaction(source, [
    Operation.payment({
      destination,
      asset,
      amount: (targetAmount - currentBalance).toFixed(7),
    }),
  ], `payment ${asset.isNative() ? 'XLM' : asset.getCode()} to ${destination}`);
}

async function topUpUsdcWithPathPayment(owner: Keypair, usdc: Asset, targetAmount: number): Promise<void> {
  const account = await server.loadAccount(owner.publicKey());
  const currentBalance = getBalanceForAsset(account, usdc);
  if (currentBalance >= targetAmount) return;

  const amountToReceive = targetAmount - currentBalance;
  const paths = await server.strictReceivePaths([Asset.native()], usdc, amountToReceive.toFixed(7)).call();
  if (!paths.records.length) {
    throw new Error('No XLM -> USDC route available to fund the BRL market maker.');
  }

  const bestPath = paths.records.reduce((best: any, path: any) =>
    Number(path.source_amount) < Number(best.source_amount) ? path : best
  );
  const sendMax = (Number(bestPath.source_amount) * 1.05).toFixed(7);
  const pathAssets = (bestPath.path || []).map((pathAsset: any) =>
    pathAsset.asset_type === 'native'
      ? Asset.native()
      : new Asset(pathAsset.asset_code, pathAsset.asset_issuer)
  );

  await submitTransaction(owner, [
    Operation.pathPaymentStrictReceive({
      sendAsset: Asset.native(),
      sendMax,
      destination: owner.publicKey(),
      destAsset: usdc,
      destAmount: amountToReceive.toFixed(7),
      path: pathAssets,
    }),
  ], 'topUpUsdcWithPathPayment');
}

async function main(): Promise<void> {
  if (useDynamicRates) {
    const dynamicRates = await resolveDynamicRates();
    brlPerUsdc = dynamicRates.brlPerUsdc;
    brlPerXlm = dynamicRates.brlPerXlm;
    console.log(`Dynamic rates loaded: 1 USDC = ${brlPerUsdc.toFixed(7)} BRL; 1 XLM = ${brlPerXlm.toFixed(7)} BRL`);
  } else {
    if (!Number.isFinite(brlPerXlm) || brlPerXlm <= 0) {
      brlPerXlm = requirePositiveNumber('TESTNET_SETUP_BRL_PER_XLM_PRICE');
    }
    if (!Number.isFinite(brlPerUsdc) || brlPerUsdc <= 0) {
      brlPerUsdc = requirePositiveNumber('TESTNET_SETUP_BRL_PER_USDC_PRICE');
    }
    console.log(`Manual rates loaded: 1 USDC = ${brlPerUsdc.toFixed(7)} BRL; 1 XLM = ${brlPerXlm.toFixed(7)} BRL`);
  }

  const brlIssuer = loadOrCreateKeypair('BRL issuer', 'BRL_ISSUER_SECRET', 'BRL_ISSUER_TESTNET');
  const brlDistributor = loadOrCreateKeypair('BRL distributor', 'BRL_DISTRIBUTOR_SECRET', 'BRL_DISTRIBUTOR_PUBLIC');
  const marketMaker = loadOrCreateKeypair('BRL market maker', 'BRL_MARKET_MAKER_SECRET', 'BRL_MARKET_MAKER_PUBLIC');

  await ensureAccountFunded(brlIssuer.keypair, 'BRL issuer');
  await ensureAccountFunded(brlDistributor.keypair, 'BRL distributor');
  await ensureAccountFunded(marketMaker.keypair, 'BRL market maker');

  const brl = new Asset('BRL', brlIssuer.keypair.publicKey());
  const usdc = new Asset('USDC', USDC_ISSUER);

  await ensureTrustline(brlDistributor.keypair, brl);
  await ensureTrustline(marketMaker.keypair, brl);
  await ensureTrustline(marketMaker.keypair, usdc);
  await topUpBalance(brlIssuer.keypair, brlDistributor.keypair.publicKey(), brl, brlIssuanceAmount);
  await topUpBalance(brlDistributor.keypair, marketMaker.keypair.publicKey(), brl, brlLiquidityAmount);
  await topUpUsdcWithPathPayment(marketMaker.keypair, usdc, usdcLiquidityAmount);

  await submitTransaction(marketMaker.keypair, [
    Operation.manageSellOffer({
      selling: brl,
      buying: Asset.native(),
      amount: (brlLiquidityAmount / 2).toFixed(7),
      price: (1 / brlPerXlm).toFixed(7),
      offerId: 0,
    }),
    Operation.manageSellOffer({
      selling: brl,
      buying: usdc,
      amount: (brlLiquidityAmount / 2).toFixed(7),
      price: (1 / brlPerUsdc).toFixed(7),
      offerId: 0,
    }),
  ], 'create BRL offers');

  console.log('BRL liquidity setup complete. Use these env values:');
  console.log(`BRL_ISSUER_TESTNET="${brlIssuer.keypair.publicKey()}"`);
  console.log(`BRL_ISSUER_SECRET="${brlIssuer.keypair.secret()}"`);
  console.log(`BRL_DISTRIBUTOR_PUBLIC="${brlDistributor.keypair.publicKey()}"`);
  console.log(`BRL_DISTRIBUTOR_SECRET="${brlDistributor.keypair.secret()}"`);
  console.log(`BRL_MARKET_MAKER_PUBLIC="${marketMaker.keypair.publicKey()}"`);
  console.log(`BRL_MARKET_MAKER_SECRET="${marketMaker.keypair.secret()}"`);
  console.log(`USDC_ISSUER="${USDC_ISSUER}"`);
}

main().catch((error) => {
  console.error('Script failed:', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
