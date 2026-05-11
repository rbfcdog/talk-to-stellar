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
const friendbotUrl = process.env.STELLAR_FRIENDBOT_URL || 'https://friendbot.stellar.org';
const networkPassphrase = Networks.TESTNET;
const server = new Horizon.Server(horizonUrl);

const USDC_CODE = 'USDC';
const issuanceAmount = Number(process.env.USDC_ISSUANCE_AMOUNT || '100000');
const liquidityAmount = Number(process.env.USDC_LIQUIDITY_AMOUNT || '2000');
const xlmPerUsdcInput = Number(process.env.TESTNET_SETUP_XLM_PER_USDC_PRICE || '');
if (!Number.isFinite(xlmPerUsdcInput) || xlmPerUsdcInput <= 0) {
  throw new Error('TESTNET_SETUP_XLM_PER_USDC_PRICE must be set to a positive number.');
}
const xlmPerUsdc = xlmPerUsdcInput;

type LoadedKeypair = { keypair: Keypair; generated: boolean };
type OperationInput = Parameters<typeof TransactionBuilder.prototype.addOperation>[0];

function loadOrCreateKeypair(label: string, secretEnv: string, publicEnv: string): LoadedKeypair {
  const secret = process.env[secretEnv];
  const publicKey = process.env[publicEnv];

  if (secret) {
    const keypair = Keypair.fromSecret(secret);
    if (publicKey && publicKey !== keypair.publicKey()) {
      throw new Error(`${publicEnv} does not match ${secretEnv}. Update your env to use the same keypair.`);
    }
    return { keypair, generated: false };
  }

  if (publicKey) {
    throw new Error(`${publicEnv} is set but ${secretEnv} is missing. Provide the secret to issue USDC.`);
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

async function ensureAccountFunded(keypair: Keypair, label: string): Promise<void> {
  try {
    await server.loadAccount(keypair.publicKey());
    return;
  } catch (error: any) {
    if (error?.response?.status !== 404) {
      throw error;
    }
  }

  console.log(`Funding ${label} via Friendbot...`);
  await fundWithFriendbot(keypair.publicKey());
}

async function submitTransaction(source: Keypair, operations: OperationInput[]): Promise<void> {
  const account = await server.loadAccount(source.publicKey());
  let builder = new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase,
  });

  for (const op of operations) {
    builder = builder.addOperation(op);
  }

  const tx = builder.setTimeout(180).build();
  tx.sign(source);
  await server.submitTransaction(tx);
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
  const hasTrustline = getBalanceForAsset(account, asset) > 0 ||
    account.balances.some((balance) => {
      if (balance.asset_type === 'native') return false;
      if (!('asset_code' in balance) || !('asset_issuer' in balance)) return false;
      return balance.asset_code === asset.getCode() && balance.asset_issuer === asset.getIssuer();
    });

  if (hasTrustline) {
    return;
  }

  await submitTransaction(owner, [
    Operation.changeTrust({
      asset,
    }),
  ]);
}

async function topUpBalance(source: Keypair, destination: string, asset: Asset, targetAmount: number): Promise<void> {
  const destinationAccount = await server.loadAccount(destination);
  const currentBalance = getBalanceForAsset(destinationAccount, asset);
  if (currentBalance >= targetAmount) {
    return;
  }

  const delta = (targetAmount - currentBalance).toFixed(7);
  await submitTransaction(source, [
    Operation.payment({
      destination,
      asset,
      amount: delta,
    }),
  ]);
}

async function main(): Promise<void> {
  console.log('Setting up USDC liquidity on Stellar testnet...');
  console.log(`Horizon URL: ${horizonUrl}`);
  console.log(`Price config: 1 USDC = ${xlmPerUsdc.toFixed(7)} XLM (1 XLM = ${(1 / xlmPerUsdc).toFixed(7)} USDC)`);

  const issuer = loadOrCreateKeypair('USDC issuer', 'USDC_ISSUER_SECRET', 'USDC_ISSUER');
  const distributor = loadOrCreateKeypair('USDC distributor', 'USDC_DISTRIBUTOR_SECRET', 'USDC_DISTRIBUTOR_PUBLIC');
  const marketMaker = loadOrCreateKeypair('USDC market maker', 'USDC_MARKET_MAKER_SECRET', 'USDC_MARKET_MAKER_PUBLIC');

  await ensureAccountFunded(issuer.keypair, 'USDC issuer');
  await ensureAccountFunded(distributor.keypair, 'USDC distributor');
  await ensureAccountFunded(marketMaker.keypair, 'USDC market maker');

  const usdc = new Asset(USDC_CODE, issuer.keypair.publicKey());

  await ensureTrustline(distributor.keypair, usdc);
  await ensureTrustline(marketMaker.keypair, usdc);

  await topUpBalance(issuer.keypair, distributor.keypair.publicKey(), usdc, issuanceAmount);
  await topUpBalance(distributor.keypair, marketMaker.keypair.publicKey(), usdc, liquidityAmount);

  // manageSellOffer.price is BUYING/SELLING, so with selling=USDC and buying=XLM:
  // price must be XLM per USDC.
  await submitTransaction(marketMaker.keypair, [
    Operation.manageSellOffer({
      selling: usdc,
      buying: Asset.native(),
      amount: liquidityAmount.toFixed(7),
      price: xlmPerUsdc.toFixed(7),
      offerId: 0,
    }),
  ]);

  console.log('Liquidity setup complete. Update your .env with these values if needed:');
  console.log(`USDC_ISSUER="${issuer.keypair.publicKey()}"`);
  console.log(`USDC_ISSUER_SECRET="${issuer.keypair.secret()}"`);
  console.log(`USDC_DISTRIBUTOR_PUBLIC="${distributor.keypair.publicKey()}"`);
  console.log(`USDC_DISTRIBUTOR_SECRET="${distributor.keypair.secret()}"`);
  console.log(`USDC_MARKET_MAKER_PUBLIC="${marketMaker.keypair.publicKey()}"`);
  console.log(`USDC_MARKET_MAKER_SECRET="${marketMaker.keypair.secret()}"`);
}

main().catch((error) => {
  console.error('Script failed:', error instanceof Error ? error.message : String(error));
  process.exit(1);
});
