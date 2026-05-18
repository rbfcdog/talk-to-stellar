import {
  Asset,
  BASE_FEE,
  Horizon,
  Keypair,
  Memo,
  Networks,
  Operation,
  TransactionBuilder,
} from '@stellar/stellar-sdk';
import dotenv from 'dotenv';
import { assertTestnetOnlyScript } from './stellar-script-safety';

dotenv.config();

const horizonUrl = process.env.STELLAR_HORIZON_URL || 'https://horizon-testnet.stellar.org';
const friendbotUrl = process.env.STELLAR_FRIENDBOT_URL || 'https://friendbot.stellar.org';
assertTestnetOnlyScript('first-testnet-transaction', horizonUrl);
const networkPassphrase = Networks.TESTNET;
const server = new Horizon.Server(horizonUrl);

async function fundWithFriendbot(publicKey: string): Promise<void> {
  const url = `${friendbotUrl}?addr=${encodeURIComponent(publicKey)}`;
  const response = await fetch(url);

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Friendbot failed for ${publicKey}. Status ${response.status}. Body: ${body}`);
  }
}

async function getXlmBalance(publicKey: string): Promise<string> {
  const account = await server.accounts().accountId(publicKey).call();
  const native = account.balances.find((balance) => balance.asset_type === 'native');
  return native?.balance || '0';
}

async function waitForTransactionConfirmation(hash: string, maxAttempts = 10): Promise<any> {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const tx = await server.transactions().transaction(hash).call();
      return tx;
    } catch {
      if (attempt === maxAttempts) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 1200));
    }
  }

  throw new Error(`Could not confirm transaction ${hash} after ${maxAttempts} attempts`);
}

async function run(): Promise<void> {
  console.log('Starting Stellar testnet first transaction script...');
  console.log(`Horizon URL: ${horizonUrl}`);
  console.log(`Friendbot URL: ${friendbotUrl}`);
  console.log(`Network: TESTNET (${networkPassphrase})`);

  const source = Keypair.random();
  const destination = Keypair.random();

  console.log('\nGenerated Keypairs:');
  console.log(`Source Public Key: ${source.publicKey()}`);
  console.log(`Source Secret Key: ${source.secret()}`);
  console.log(`Destination Public Key: ${destination.publicKey()}`);
  console.log(`Destination Secret Key: ${destination.secret()}`);

  console.log('\nFunding both accounts with Friendbot...');
  await fundWithFriendbot(source.publicKey());
  await fundWithFriendbot(destination.publicKey());

  const sourceBalanceBefore = await getXlmBalance(source.publicKey());
  const destinationBalanceBefore = await getXlmBalance(destination.publicKey());

  console.log('\nBalances before payment:');
  console.log(`Source: ${sourceBalanceBefore} XLM`);
  console.log(`Destination: ${destinationBalanceBefore} XLM`);

  const amount = '10';
  const sourceAccount = await server.loadAccount(source.publicKey());
  const tx = new TransactionBuilder(sourceAccount, {
    fee: BASE_FEE,
    networkPassphrase,
  })
    .addOperation(
      Operation.payment({
        destination: destination.publicKey(),
        asset: Asset.native(),
        amount,
      })
    )
    .addMemo(Memo.text('first-testnet-tx'))
    .setTimeout(60)
    .build();

  tx.sign(source);

  console.log('\nSubmitting payment transaction...');
  console.log(`Amount: ${amount} XLM`);
  console.log(`From: ${source.publicKey()}`);
  console.log(`To: ${destination.publicKey()}`);

  const submitResult = await server.submitTransaction(tx);
  const hash = (submitResult as any).hash;
  if (!hash) {
    throw new Error('Transaction submitted but no hash was returned by Horizon');
  }

  console.log(`Submitted transaction hash: ${hash}`);
  console.log('Waiting confirmation from Horizon...');

  const confirmedTx = await waitForTransactionConfirmation(hash);

  const sourceBalanceAfter = await getXlmBalance(source.publicKey());
  const destinationBalanceAfter = await getXlmBalance(destination.publicKey());

  console.log('\nTransaction confirmed.');
  console.log(`Confirmed Hash: ${confirmedTx.hash}`);
  console.log(`Ledger: ${confirmedTx.ledger_attr || confirmedTx.ledger}`);
  console.log(`Created At: ${confirmedTx.created_at}`);
  console.log(`Successful: ${confirmedTx.successful}`);

  console.log('\nBalances after payment:');
  console.log(`Source: ${sourceBalanceAfter} XLM`);
  console.log(`Destination: ${destinationBalanceAfter} XLM`);

  console.log('\nForm data you can copy:');
  console.log(`Chave publica da conta*: ${source.publicKey()}`);
  console.log(`Hash da transacao confirmada*: ${confirmedTx.hash}`);

  console.log('\nExplorer URL:');
  console.log(`https://stellar.expert/explorer/testnet/tx/${confirmedTx.hash}`);
}

run().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`\nScript failed: ${message}`);
  process.exit(1);
});
