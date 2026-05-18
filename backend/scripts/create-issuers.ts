import { Keypair } from '@stellar/stellar-sdk';
import { StellarService } from '../src/api/services/stellar.service';
import { assertTestnetOnlyScript } from './stellar-script-safety';

function readBoolean(value: unknown): boolean {
  return ['1', 'true', 'yes', 'y', 'on'].includes(String(value || '').trim().toLowerCase());
}

async function createTestIssuers() {
  assertTestnetOnlyScript('create-issuers', process.env.STELLAR_HORIZON_URL);

  console.log('\n' + '='.repeat(60));
  console.log('Creating Test Issuer Accounts');
  console.log('='.repeat(60));

  try {
    const revealSecrets = readBoolean(process.env.REVEAL_TESTNET_SECRET_KEYS);

    // Create USDC issuer account
    const usdcKeypair = Keypair.random();
    const usdcSecret = usdcKeypair.secret();
    console.log(`\nUSDC Issuer Account:`);
    console.log(`  Public Key:  ${usdcKeypair.publicKey()}`);
    console.log(`  Secret material: ${revealSecrets ? usdcSecret : 'hidden; set REVEAL_TESTNET_SECRET_KEYS=true only for disposable Testnet keys'}`);
    console.log(`  Status: Funding with Friendbot...`);
    
    await StellarService.fundWithFriendbot(usdcKeypair.publicKey());
    console.log(`  ✓ Account funded and ready`);

    // Create BRL issuer account
    const brlKeypair = Keypair.random();
    const brlSecret = brlKeypair.secret();
    console.log(`\nBRL Issuer Account:`);
    console.log(`  Public Key:  ${brlKeypair.publicKey()}`);
    console.log(`  Secret material: ${revealSecrets ? brlSecret : 'hidden; set REVEAL_TESTNET_SECRET_KEYS=true only for disposable Testnet keys'}`);
    console.log(`  Status: Funding with Friendbot...`);
    
    await StellarService.fundWithFriendbot(brlKeypair.publicKey());
    console.log(`  ✓ Account funded and ready`);

    console.log('\n' + '='.repeat(60));
    console.log('Update your .env file with these values:');
    console.log('='.repeat(60));
    console.log(`USDC_ISSUER="${usdcKeypair.publicKey()}"`);
    console.log(`BRL_ISSUER_TESTNET="${brlKeypair.publicKey()}"`);
    console.log('='.repeat(60) + '\n');

  } catch (error) {
    console.error('Error creating issuer accounts:', error);
  }
}

createTestIssuers();
