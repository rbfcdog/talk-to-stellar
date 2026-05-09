import { Keypair } from '@stellar/stellar-sdk';
import { StellarService } from '../src/api/services/stellar.service';

async function createTestIssuers() {
  console.log('\n' + '='.repeat(60));
  console.log('Creating Test Issuer Accounts');
  console.log('='.repeat(60));

  try {
    // Create USDC issuer account
    const usdcKeypair = Keypair.random();
    console.log(`\nUSDP Issuer Account:`);
    console.log(`  Public Key:  ${usdcKeypair.publicKey()}`);
    console.log(`  Secret Key:  ${usdcKeypair.secret()}`);
    console.log(`  Status: Funding with Friendbot...`);
    
    await StellarService.fundWithFriendbot(usdcKeypair.publicKey());
    console.log(`  ✓ Account funded and ready`);

    // Create BRL issuer account
    const brlKeypair = Keypair.random();
    console.log(`\nBRL Issuer Account:`);
    console.log(`  Public Key:  ${brlKeypair.publicKey()}`);
    console.log(`  Secret Key:  ${brlKeypair.secret()}`);
    console.log(`  Status: Funding with Friendbot...`);
    
    await StellarService.fundWithFriendbot(brlKeypair.publicKey());
    console.log(`  ✓ Account funded and ready`);

    console.log('\n' + '='.repeat(60));
    console.log('Update your .env file with these values:');
    console.log('='.repeat(60));
    console.log(`USDC_ISSUER="${usdcKeypair.publicKey()}"`);
    console.log(`BRL_ISSUER="${brlKeypair.publicKey()}"`);
    console.log('='.repeat(60) + '\n');

  } catch (error) {
    console.error('Error creating issuer accounts:', error);
  }
}

createTestIssuers();
