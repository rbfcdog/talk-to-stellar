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

dotenv.config();

const horizonUrl = process.env.STELLAR_HORIZON_URL || 'https://horizon-testnet.stellar.org';
const server = new Horizon.Server(horizonUrl);
const timeoutMs = Number(process.env.BRL_USDC_QUOTE_TIMEOUT_MS || 8000);
const watchMode = process.argv.includes('--watch');

type RateSnapshot = {
  brlPerUsdc: number;
  brlPerXlm: number;
  sources: string[];
};

type OperationInput = Parameters<typeof TransactionBuilder.prototype.addOperation>[0];

function requireSecret(name: string): string {
  const value = String(process.env[name] || '').trim();
  if (!value) throw new Error(`${name} must be configured.`);
  return value;
}

function requirePublicKey(name: string): string {
  const value = String(process.env[name] || '').trim();
  if (!value) throw new Error(`${name} must be configured.`);
  return value;
}

function parsePositiveNumber(name: string, fallback: number): number {
  const value = Number(String(process.env[name] || '').trim());
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

async function fetchJson(endpoint: string): Promise<any> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number.isFinite(timeoutMs) ? timeoutMs : 8000);
  try {
    const response = await fetch(endpoint, {
      method: 'GET',
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    const body = await response.text();
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${body.slice(0, 160)}`);
    }
    return JSON.parse(body);
  } finally {
    clearTimeout(timeout);
  }
}

function validPrice(value: unknown): number | undefined {
  const n = Number(String(value || '').trim());
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

async function fetchBinancePrice(symbol: string): Promise<number | undefined> {
  try {
    const payload = await fetchJson(`https://api.binance.com/api/v3/ticker/price?symbol=${encodeURIComponent(symbol)}`);
    return validPrice(payload?.price);
  } catch {
    return undefined;
  }
}

async function fetchUsdBrl(): Promise<{ price: number; source: string }> {
  const configured = String(process.env.BRL_USDC_QUOTE_SYMBOL || 'USDCBRL').trim().toUpperCase();
  for (const symbol of [configured, 'USDCBRL', 'USDTBRL']) {
    const price = await fetchBinancePrice(symbol);
    if (price) return { price, source: `binance:${symbol}` };
  }

  try {
    const payload = await fetchJson('https://economia.awesomeapi.com.br/json/last/USD-BRL');
    const price = validPrice(payload?.USDBRL?.bid || payload?.USDBRL?.ask);
    if (price) return { price, source: 'awesomeapi:USDBRL' };
  } catch {
    // continue
  }

  const payload = await fetchJson('https://api.frankfurter.app/latest?from=USD&to=BRL');
  const price = validPrice(payload?.rates?.BRL);
  if (!price) throw new Error('Could not fetch USD/BRL rate.');
  return { price, source: 'frankfurter:USDBRL' };
}

async function fetchXlmUsd(): Promise<{ price: number; source: string }> {
  for (const symbol of ['XLMUSDC', 'XLMUSDT']) {
    const price = await fetchBinancePrice(symbol);
    if (price) return { price, source: `binance:${symbol}` };
  }

  const payload = await fetchJson('https://api.coingecko.com/api/v3/simple/price?ids=stellar&vs_currencies=usd');
  const price = validPrice(payload?.stellar?.usd);
  if (!price) throw new Error('Could not fetch XLM/USD rate.');
  return { price, source: 'coingecko:stellar-usd' };
}

async function resolveRates(): Promise<RateSnapshot> {
  const [usdBrl, xlmUsd] = await Promise.all([fetchUsdBrl(), fetchXlmUsd()]);
  return {
    brlPerUsdc: usdBrl.price,
    brlPerXlm: usdBrl.price * xlmUsd.price,
    sources: [usdBrl.source, xlmUsd.source],
  };
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

function balanceFor(account: Horizon.AccountResponse, asset: Asset): number {
  const balance = account.balances.find((line: any) => {
    if (asset.isNative()) return line.asset_type === 'native';
    return line.asset_type !== 'native' && line.asset_code === asset.getCode() && line.asset_issuer === asset.getIssuer();
  }) as any;
  return Number(balance?.balance || 0);
}

function offerAmount(account: Horizon.AccountResponse, asset: Asset, desired: number): string | undefined {
  const available = balanceFor(account, asset) - (asset.isNative() ? 5 : 0);
  const amount = Math.min(desired, Math.max(0, available * 0.45));
  if (!Number.isFinite(amount) || amount <= 0.0000001) return undefined;
  return amount.toFixed(7);
}

async function submit(source: Keypair, operations: OperationInput[]): Promise<string> {
  const account = await server.loadAccount(source.publicKey());
  let builder = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase: Networks.TESTNET,
  });

  for (const operation of operations) {
    builder = builder.addOperation(operation);
  }

  const tx = builder.setTimeout(180).build();
  tx.sign(source);
  const result = await server.submitTransaction(tx);
  return result.hash;
}

async function buildOfferOperation(input: {
  owner: string;
  selling: Asset;
  buying: Asset;
  amount: string;
  price: number;
}) {
  const offerId = await findOfferId(input.owner, input.selling, input.buying);
  return Operation.manageSellOffer({
    selling: input.selling,
    buying: input.buying,
    amount: input.amount,
    price: input.price.toFixed(7),
    offerId: offerId ? Number(offerId) : 0,
  });
}

async function rebalanceOnce() {
  if (String(process.env.STELLAR_NETWORK || 'TESTNET').trim().toUpperCase() === 'PUBLIC') {
    throw new Error('Refusing to run testnet market maker on PUBLIC network.');
  }

  const brlIssuer = requirePublicKey('BRL_ISSUER_TESTNET');
  const usdcIssuer = requirePublicKey('USDC_ISSUER');
  const marketMaker = Keypair.fromSecret(requireSecret('BRL_MARKET_MAKER_SECRET'));
  const account = await server.loadAccount(marketMaker.publicKey());
  const rates = await resolveRates();
  const spread = parsePositiveNumber('MARKET_MAKER_SPREAD_BPS', 50) / 10000;

  const brl = new Asset('BRL', brlIssuer);
  const usdc = new Asset('USDC', usdcIssuer);
  const xlm = Asset.native();

  const desiredBrl = parsePositiveNumber('MARKET_MAKER_BRL_OFFER_AMOUNT', 5000);
  const desiredUsdc = parsePositiveNumber('MARKET_MAKER_USDC_OFFER_AMOUNT', 500);
  const desiredXlm = parsePositiveNumber('MARKET_MAKER_XLM_OFFER_AMOUNT', 500);

  const operations: OperationInput[] = [];
  const plan: Array<{ pair: string; amount: string; price: string }> = [];
  const addOffer = async (selling: Asset, buying: Asset, amount: string | undefined, price: number, pair: string) => {
    if (!amount) return;
    operations.push(await buildOfferOperation({
      owner: marketMaker.publicKey(),
      selling,
      buying,
      amount,
      price,
    }));
    plan.push({ pair, amount, price: price.toFixed(7) });
  };

  await addOffer(brl, usdc, offerAmount(account, brl, desiredBrl / 2), (1 / rates.brlPerUsdc) * (1 + spread), 'sell BRL / buy USDC');
  await addOffer(usdc, brl, offerAmount(account, usdc, desiredUsdc), rates.brlPerUsdc * (1 + spread), 'sell USDC / buy BRL');
  await addOffer(brl, xlm, offerAmount(account, brl, desiredBrl / 2), (1 / rates.brlPerXlm) * (1 + spread), 'sell BRL / buy XLM');
  await addOffer(xlm, brl, offerAmount(account, xlm, desiredXlm), rates.brlPerXlm * (1 + spread), 'sell XLM / buy BRL');

  if (!operations.length) {
    throw new Error('No offers could be built. Check market maker balances and trustlines.');
  }

  const hash = await submit(marketMaker, operations);
  return {
    hash,
    rates,
    spreadBps: spread * 10000,
    marketMaker: marketMaker.publicKey(),
    plan,
  };
}

async function main() {
  if (!watchMode) {
    const result = await rebalanceOnce();
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  const intervalSeconds = parsePositiveNumber('MARKET_MAKER_REBALANCE_INTERVAL_SECONDS', 300);
  console.log(`Starting BRL market rebalance loop every ${intervalSeconds} seconds.`);

  while (true) {
    try {
      const result = await rebalanceOnce();
      console.log(JSON.stringify({ checkedAt: new Date().toISOString(), ...result }, null, 2));
    } catch (error) {
      console.error('BRL market rebalance tick failed:', error instanceof Error ? error.message : String(error));
    }
    await new Promise((resolve) => setTimeout(resolve, intervalSeconds * 1000));
  }
}

main().catch((error) => {
  console.error('BRL market rebalance failed:', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
