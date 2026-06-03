import { supabase } from '../src/config/supabase';
import VaultService from '../src/api/services/core/vault.service';
import { TrustlineService } from '../src/api/services/trustline.service';
import { assertMainnetBulkMutationAllowed } from './stellar-script-safety';

async function addTrustlinesToAllAccounts() {
  assertMainnetBulkMutationAllowed('add-trustlines-all');

  console.log('\n' + '='.repeat(80));
  console.log('Adding configured default trustlines to all existing accounts');
  console.log('='.repeat(80));

  try {
    const vaultService = new VaultService(supabase);

    // Get all wallets
    const { data: wallets, error: walletsError } = await supabase
      .from('wallets')
      .select('id, public_key, vault_secret_id, session_id');

    if (walletsError) {
      console.error('Error fetching wallets:', walletsError);
      return;
    }

    if (!wallets || wallets.length === 0) {
      console.log('No wallets found.');
      return;
    }

    console.log(`Found ${wallets.length} wallets. Processing...\n`);

    let successCount = 0;
    let failCount = 0;
    let skippedCount = 0;

    for (const wallet of wallets) {
      try {
        const publicKey = wallet.public_key;
        const vaultSecretId = wallet.vault_secret_id;

        console.log(`Processing wallet: ${publicKey}`);

        // Get the secret key from vault
        if (!vaultSecretId) {
          console.log(`  ⚠️  Skipped: No vault_secret_id on wallet`);
          skippedCount++;
          continue;
        }

        let secretKey: string;
        try {
          secretKey = await vaultService.getSecret(String(vaultSecretId));
        } catch (error) {
          console.log(`  ⚠️  Skipped: Could not retrieve secret key from vault`);
          skippedCount++;
          continue;
        }

        // Get user_id from session
        const { data: sessionData, error: sessionError } = await supabase
          .from('agent_sessions')
          .select('user_id')
          .eq('public_key', publicKey)
          .single();

        if (sessionError || !sessionData) {
          console.log(`  ⚠️  Skipped: Could not find session for wallet`);
          skippedCount++;
          continue;
        }

        const userId = sessionData.user_id;

        // Add trustlines
        const result = await TrustlineService.createDefaultTrustlines(
          publicKey,
          secretKey,
          userId
        );

        if (result.success) {
          console.log(`  ✅ Success: Added trustlines`);
          result.assets.forEach((asset: string) => console.log(`     - ${asset}`));
          successCount++;
        } else {
          console.log(`  ❌ Failed: ${result.errors.join(', ')}`);
          failCount++;
        }
      } catch (error) {
        console.log(`  ❌ Error: ${error instanceof Error ? error.message : String(error)}`);
        failCount++;
      }
    }

    console.log('\n' + '='.repeat(80));
    console.log(`Results:`);
    console.log(`  ✅ Success: ${successCount}`);
    console.log(`  ❌ Failed: ${failCount}`);
    console.log(`  ⏭️  Skipped: ${skippedCount}`);
    console.log('='.repeat(80) + '\n');
  } catch (error) {
    console.error('Error in trustline setup:', error);
  }
}

// Run the function
addTrustlinesToAllAccounts()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
