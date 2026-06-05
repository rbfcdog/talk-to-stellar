import {
  Asset,
  Horizon,
  Keypair,
  Networks,
  Operation,
  TransactionBuilder,
} from '@stellar/stellar-sdk';
import dotenv from 'dotenv';
import { getAssetIssuer, getStellarNetworkName, resolveConfiguredAsset } from '../src/config/assets';
import { stellarConfig } from '../src/config/stellar';

dotenv.config();

const server = new Horizon.Server(stellarConfig.horizonUrl);

function bool(value: unknown): boolean {
  return ['1', 'true', 'yes', 'y', 'on'].includes(String(value || '').trim().toLowerCase());
}

function readTreasurySecret(): string {
  return String(
    process.env.TALKTOSTELLAR_FEE_TREASURY_SECRET_KEY ||
    process.env.TTS_FEE_TREASURY_SECRET_KEY ||
    '',
  ).trim();
}

function trustlineAssets(): Array<{ code: string; issuer: string }> {
  const configured = [
    resolveConfiguredAsset('TESOURO'),
    resolveConfiguredAsset('USDC'),
    resolveConfiguredAsset('CETES'),
  ];

  return configured
    .filter((asset) => asset.code !== 'XLM')
    .map((asset) => ({
      code: asset.code,
      issuer: asset.issuer || getAssetIssuer(asset.code) || '',
    }))
    .filter((asset) => Boolean(asset.issuer))
    .filter((asset, index, list) =>
      list.findIndex((candidate) => candidate.code === asset.code && candidate.issuer === asset.issuer) === index,
    );
}

async function fundTestnetAccount(publicKey: string): Promise<void> {
  if (getStellarNetworkName() !== 'TESTNET') return;

  try {
    await server.loadAccount(publicKey);
    return;
  } catch {
    // Account does not exist yet.
  }

  const friendbotUrl = stellarConfig.friendbotUrl || 'https://friendbot.stellar.org';
  const response = await fetch(`${friendbotUrl}?addr=${encodeURIComponent(publicKey)}`);
  if (!response.ok) {
    throw new Error(`Friendbot failed with HTTP ${response.status}. Fund ${publicKey} manually and rerun.`);
  }
}

async function ensureTrustlines(secret: string): Promise<void> {
  const keypair = Keypair.fromSecret(secret);
  const assets = trustlineAssets();
  if (!assets.length) return;

  const account = await server.loadAccount(keypair.publicKey());
  const existing = new Set(
    account.balances
      .filter((balance: any) => balance.asset_type !== 'native')
      .map((balance: any) => `${balance.asset_code}:${balance.asset_issuer}`),
  );
  const missing = assets.filter((asset) => !existing.has(`${asset.code}:${asset.issuer}`));
  if (!missing.length) return;

  const tx = new TransactionBuilder(account, {
    fee: (100_000 * missing.length).toString(),
    networkPassphrase: getStellarNetworkName() === 'TESTNET' ? Networks.TESTNET : Networks.PUBLIC,
  });

  for (const asset of missing) {
    tx.addOperation(Operation.changeTrust({
      asset: new Asset(asset.code, asset.issuer),
    }));
  }

  const built = tx.setTimeout(180).build();
  built.sign(keypair);
  await server.submitTransaction(built);
}

async function main(): Promise<void> {
  const existingSecret = readTreasurySecret();
  const generated = existingSecret ? null : Keypair.random();
  const treasury = existingSecret ? Keypair.fromSecret(existingSecret) : generated!;

  if (getStellarNetworkName() === 'PUBLIC' && !bool(process.env.STELLAR_MAINNET_ALLOW_RUNTIME_ACTIVATION)) {
    throw new Error('Refusing PUBLIC setup without STELLAR_MAINNET_ALLOW_RUNTIME_ACTIVATION=true.');
  }

  await fundTestnetAccount(treasury.publicKey());
  await ensureTrustlines(treasury.secret());

  console.log('Admin fee wallet ready.');
  console.log('');
  console.log(`Network: ${getStellarNetworkName()}`);
  console.log(`Public key: ${treasury.publicKey()}`);
  console.log('');
  console.log('Set these in the backend runtime:');
  console.log(`TALKTOSTELLAR_FEE_TREASURY_PUBLIC_KEY=${treasury.publicKey()}`);
  if (generated) {
    console.log('');
    console.log('Generated setup secret. Store it only in your secret manager, never in git:');
    console.log(`TALKTOSTELLAR_FEE_TREASURY_SECRET_KEY=${treasury.secret()}`);
  } else {
    console.log('');
    console.log('Used TALKTOSTELLAR_FEE_TREASURY_SECRET_KEY from the current environment.');
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
