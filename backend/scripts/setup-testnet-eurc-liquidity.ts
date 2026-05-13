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
import { validateEurcLiquidity } from './validate-testnet-eurc-liquidity';

dotenv.config();

const horizonUrl = process.env.STELLAR_HORIZON_URL || 'https://horizon-testnet.stellar.org';
const friendbotUrl = process.env.STELLAR_FRIENDBOT_URL || 'https://friendbot.stellar.org';
const server = new Horizon.Server(horizonUrl);

const useDynamicRates = String(process.env.TESTNET_SETUP_USE_DYNAMIC_RATES || 'true').trim().toLowerCase() !== 'false';
const usdcIssuer = String(process.env.USDC_ISSUER || '').trim();

const eurcIssuanceAmount = parsePositiveNumber('TESTNET_SETUP_EURC_ISSUANCE_AMOUNT', 100000);
const eurcLiquidityAmount = parsePositiveNumber('TESTNET_SETUP_EURC_LIQUIDITY_AMOUNT', 20000);
const usdcLiquidityAmount = parsePositiveNumber('TESTNET_SETUP_USDC_EURC_LIQUIDITY_AMOUNT', 2500);
const spread = parsePositiveNumber('TESTNET_SETUP_EURC_SPREAD_BPS', 120) / 10000;

type LoadedKeypair = { keypair: Keypair; generated: boolean };
type OperationInput = Parameters<typeof TransactionBuilder.prototype.addOperation>[0];

function parsePositiveNumber(name: string, fallback: number): number {
  const raw = String(process.env[name] || '').trim();
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) return fallback;
  return value;
}

function requirePublicKey(name: string): string {
  const value = String(process.env[name] || '').trim();
  if (!value) throw new Error(`${name} precisa estar configurado.`);
  return value;
}

function loadOrCreateKeypair(label: string, secretEnv: string, publicEnv: string): LoadedKeypair {
  const secret = String(process.env[secretEnv] || '').trim();
  const publicKey = String(process.env[publicEnv] || '').trim();

  if (secret) {
    const keypair = Keypair.fromSecret(secret);
    if (publicKey && publicKey !== keypair.publicKey()) {
      throw new Error(`${publicEnv} não corresponde a ${secretEnv}.`);
    }
    return { keypair, generated: false };
  }

  if (publicKey) {
    throw new Error(`${publicEnv} está definido, mas ${secretEnv} não está. Configure o secret para conseguir emitir EURC.`);
  }

  const keypair = Keypair.random();
  console.log(`${label} gerado: ${keypair.publicKey()}`);
  return { keypair, generated: true };
}

async function fundWithFriendbot(publicKey: string): Promise<void> {
  const response = await fetch(`${friendbotUrl}?addr=${encodeURIComponent(publicKey)}`);
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Friendbot falhou para ${publicKey}: ${response.status} ${body}`);
  }
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
  const resultCodes = error?.response?.data?.extras?.result_codes;
  const pieces = [
    status ? `status=${status}` : '',
    resultCodes ? `result_codes=${JSON.stringify(resultCodes)}` : '',
  ].filter(Boolean);
  return pieces.join(' ') || (error instanceof Error ? error.message : String(error));
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
    throw new Error(`${label} falhou: ${formatHorizonError(error)}`);
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

  await submitTransaction(
    source,
    [
      Operation.payment({
        destination,
        asset,
        amount: (targetAmount - currentBalance).toFixed(7),
      }),
    ],
    `payment ${asset.isNative() ? 'XLM' : asset.getCode()} to ${destination}`
  );
}

async function topUpUsdcWithPathPayment(owner: Keypair, usdc: Asset, targetAmount: number): Promise<void> {
  const account = await server.loadAccount(owner.publicKey());
  const currentBalance = getBalanceForAsset(account, usdc);
  if (currentBalance >= targetAmount) return;

  const amountToReceive = targetAmount - currentBalance;
  const paths = await server.strictReceivePaths([Asset.native()], usdc, amountToReceive.toFixed(7)).call();
  if (!paths.records.length) {
    throw new Error('Sem rota XLM -> USDC para abastecer liquidez EURC.');
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

function assetMatches(recordAsset: any, asset: Asset): boolean {
  if (asset.isNative()) return String(recordAsset?.asset_type || '') === 'native';
  return (
    String(recordAsset?.asset_code || '') === asset.getCode() &&
    String(recordAsset?.asset_issuer || '') === asset.getIssuer()
  );
}

async function findOfferId(owner: string, selling: Asset, buying: Asset): Promise<string | undefined> {
  const page = await server.offers().forAccount(owner).limit(200).call();
  const offer = (page.records || []).find((record: any) =>
    assetMatches(record.selling, selling) && assetMatches(record.buying, buying)
  ) as any;
  return offer?.id ? String(offer.id) : undefined;
}

async function upsertSellOffer(input: {
  seller: Keypair;
  selling: Asset;
  buying: Asset;
  amount: string;
  price: number;
  label: string;
}): Promise<void> {
  const offerId = await findOfferId(input.seller.publicKey(), input.selling, input.buying);
  await submitTransaction(
    input.seller,
    [
      Operation.manageSellOffer({
        selling: input.selling,
        buying: input.buying,
        amount: input.amount,
        price: input.price.toFixed(7),
        offerId: offerId ? Number(offerId) : 0,
      }),
    ],
    input.label
  );
}

async function fetchBinancePrice(symbol: string): Promise<number | undefined> {
  try {
    const response = await fetch(`https://api.binance.com/api/v3/ticker/price?symbol=${encodeURIComponent(symbol)}`);
    if (!response.ok) return undefined;
    const payload = (await response.json().catch(() => null)) as { price?: string } | null;
    const price = Number(String(payload?.price || '').trim());
    return Number.isFinite(price) && price > 0 ? price : undefined;
  } catch {
    return undefined;
  }
}

async function fetchUsdEur(): Promise<number | undefined> {
  try {
    const response = await fetch('https://api.frankfurter.app/latest?from=USD&to=EUR');
    if (!response.ok) return undefined;
    const payload = (await response.json().catch(() => null)) as { rates?: { EUR?: number } } | null;
    const price = Number(payload?.rates?.EUR || 0);
    return Number.isFinite(price) && price > 0 ? price : undefined;
  } catch {
    return undefined;
  }
}

async function resolveRates(): Promise<{ eurcPerUsdc: number; eurcPerXlm: number }> {
  if (!useDynamicRates) {
    const eurcPerUsdc = parsePositiveNumber('TESTNET_SETUP_EURC_PER_USDC_PRICE', 0);
    const eurcPerXlm = parsePositiveNumber('TESTNET_SETUP_EURC_PER_XLM_PRICE', 0);
    if (!eurcPerUsdc || !eurcPerXlm) {
      throw new Error('Com setup dinâmico desativado, configure TESTNET_SETUP_EURC_PER_USDC_PRICE e TESTNET_SETUP_EURC_PER_XLM_PRICE.');
    }
    return { eurcPerUsdc, eurcPerXlm };
  }

  const [usdEur, xlmUsdc] = await Promise.all([
    fetchUsdEur(),
    (async () => (await fetchBinancePrice('XLMUSDC')) || (await fetchBinancePrice('XLMUSDT')))(),
  ]);

  if (!usdEur || !xlmUsdc) {
    throw new Error(`Não foi possível buscar taxas dinâmicas (USD/EUR=${String(usdEur)}; XLMUSDC=${String(xlmUsdc)}).`);
  }

  return {
    eurcPerUsdc: usdEur,
    eurcPerXlm: usdEur * xlmUsdc,
  };
}

async function main(): Promise<void> {
  if (String(process.env.STELLAR_NETWORK || 'TESTNET').trim().toUpperCase() === 'PUBLIC') {
    throw new Error('Este script é somente para TESTNET.');
  }

  if (!usdcIssuer) {
    throw new Error('USDC_ISSUER precisa estar configurado.');
  }

  const rates = await resolveRates();
  const usdcPerEurc = 1 / rates.eurcPerUsdc;
  const xlmPerEurc = 1 / rates.eurcPerXlm;

  console.log('Setup de liquidez EURC na TESTNET');
  console.log(`Horizon: ${horizonUrl}`);
  console.log(`USDC issuer: ${usdcIssuer}`);
  console.log(`Taxas base: 1 USDC = ${rates.eurcPerUsdc.toFixed(7)} EURC | 1 XLM = ${rates.eurcPerXlm.toFixed(7)} EURC`);
  console.log(`Spread aplicado: ${(spread * 100).toFixed(3)}%`);

  const forceNewIssuer = String(process.env.TESTNET_SETUP_EURC_FORCE_NEW_ISSUER || '').trim().toLowerCase() === 'true';
  const originalIssuerPublic = process.env.EURC_ISSUER;
  if (forceNewIssuer) {
    delete process.env.EURC_ISSUER;
    delete process.env.EURC_ISSUER_SECRET;
  }
  const eurcIssuer = loadOrCreateKeypair('EURC issuer', 'EURC_ISSUER_SECRET', 'EURC_ISSUER');
  if (forceNewIssuer) {
    process.env.EURC_ISSUER = originalIssuerPublic;
  }
  const eurcDistributor = loadOrCreateKeypair('EURC distributor', 'EURC_DISTRIBUTOR_SECRET', 'EURC_DISTRIBUTOR_PUBLIC');
  const marketMaker = loadOrCreateKeypair('EURC market maker', 'EURC_MARKET_MAKER_SECRET', 'EURC_MARKET_MAKER_PUBLIC');

  await ensureAccountFunded(eurcIssuer.keypair, 'EURC issuer');
  await ensureAccountFunded(eurcDistributor.keypair, 'EURC distributor');
  await ensureAccountFunded(marketMaker.keypair, 'EURC market maker');

  const eurc = new Asset('EURC', eurcIssuer.keypair.publicKey());
  const usdc = new Asset('USDC', usdcIssuer);
  const xlm = Asset.native();

  await ensureTrustline(eurcDistributor.keypair, eurc);
  await ensureTrustline(marketMaker.keypair, eurc);
  await ensureTrustline(marketMaker.keypair, usdc);

  await topUpBalance(eurcIssuer.keypair, eurcDistributor.keypair.publicKey(), eurc, eurcIssuanceAmount);
  await topUpBalance(eurcDistributor.keypair, marketMaker.keypair.publicKey(), eurc, eurcLiquidityAmount);
  await topUpUsdcWithPathPayment(marketMaker.keypair, usdc, usdcLiquidityAmount);

  const sellEurcAmount = (eurcLiquidityAmount * 0.45).toFixed(7);

  // A-side: enables USDC->EURC and XLM->EURC path discovery (selling EURC).
  await upsertSellOffer({
    seller: marketMaker.keypair,
    selling: eurc,
    buying: usdc,
    amount: sellEurcAmount,
    price: usdcPerEurc * (1 + spread),
    label: 'offer EURC/USDC (sell EURC)',
  });
  await upsertSellOffer({
    seller: marketMaker.keypair,
    selling: eurc,
    buying: xlm,
    amount: sellEurcAmount,
    price: xlmPerEurc * (1 + spread),
    label: 'offer EURC/XLM (sell EURC)',
  });

  // Keep only EURC sell-side offers in this account to avoid self-crossing.

  console.log('Ofertas EURC/USDC e EURC/XLM publicadas. Validando rotas...');
  process.env.EURC_ISSUER = eurcIssuer.keypair.publicKey();
  const validation = await validateEurcLiquidity();
  if (!validation.success) {
    throw new Error('Seed de liquidez concluído, mas validação pós-seed falhou.');
  }

  console.log('\nSetup EURC concluído. Atualize o .env se necessário:');
  console.log(`EURC_ISSUER="${eurcIssuer.keypair.publicKey()}"`);
  console.log(`EURC_ISSUER_SECRET="${eurcIssuer.keypair.secret()}"`);
  console.log(`EURC_DISTRIBUTOR_PUBLIC="${eurcDistributor.keypair.publicKey()}"`);
  console.log(`EURC_DISTRIBUTOR_SECRET="${eurcDistributor.keypair.secret()}"`);
  console.log(`EURC_MARKET_MAKER_PUBLIC="${marketMaker.keypair.publicKey()}"`);
  console.log(`EURC_MARKET_MAKER_SECRET="${marketMaker.keypair.secret()}"`);
}

main().catch((error) => {
  console.error('setup-testnet-eurc-liquidity failed:', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
