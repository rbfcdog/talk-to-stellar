/**
 * Seed script to create test users with Stellar wallets
 * Usage: 
 *   npm run seed:users 2
 *   npm run seed:users 5
 *   npm run seed:users 10
 * 
 * This script will:
 * 1. Generate new Stellar testnet accounts
 * 2. Fund them with ~10,000 XLM via Friendbot
 * 3. Save user and wallet info to Supabase
 * 4. Output the credentials for payment testing
 */

import { UserService } from '../src/api/services/user.service';
import { supabase } from '../src/config/supabase';

async function seedUsers() {
  const args = process.argv.slice(2);
  const countIndex = args.indexOf('--count');
  
  // Get count from --count flag or from the first arg
  let count = 5;
  if (countIndex !== -1 && args[countIndex + 1]) {
    count = parseInt(args[countIndex + 1], 10);
  } else if (args[0] && !isNaN(parseInt(args[0], 10))) {
    count = parseInt(args[0], 10);
  }

  console.log(`\n🌱 Seeding ${count} test users with Stellar wallets...\n`);

  const users: Array<{
    email: string;
    name: string;
    publicKey: string;
    initialBalance: string;
  }> = [];

  try {
    for (let i = 0; i < count; i++) {
      const timestamp = Date.now();
      const email = `test-user-${timestamp}-${i}@stellar-chat.local`;
      const name = `Test User ${i + 1}`;
      const phoneNumber = `+55${1100000000 + i}`;

      console.log(`[${i + 1}/${count}] Creating user: ${name} (${email})...`);

      try {
        const result = await UserService.onboardUser({
          name,
          email,
          phoneNumber,
        });

        users.push({
          email,
          name,
          publicKey: result.publicKey,
          initialBalance: result.initialBalance || '10000',
        });

        console.log(`  ✅ Created: ${result.publicKey}`);
        console.log(`  💰 Initial Balance: ${result.initialBalance || '10000'} XLM`);
        console.log(`  🔐 User ID: ${result.userId}`);

        // Small delay to avoid rate limiting
        await new Promise((resolve) => setTimeout(resolve, 500));
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`  ⚠️ Error: ${errorMessage}`);
        
        // Skip this user but continue with others
        if (errorMessage.includes('already exists')) {
          console.log(`  → User likely already exists (duplicate email/public key), skipping`);
        }
      }
    }

    // Display summary
    console.log(`\n\n📊 Seeding Summary`);
    console.log(`═══════════════════════════════════════════════════════════════\n`);
    console.log(`Total Users Created: ${users.length}/${count}\n`);

    console.log('USER CREDENTIALS FOR PAYMENT TESTING:');
    console.log('─────────────────────────────────────────────────────────────');
    users.forEach((user, idx) => {
      console.log(`\n${idx + 1}. ${user.name}`);
      console.log(`   Email: ${user.email}`);
      console.log(`   Public Key: ${user.publicKey}`);
      console.log(`   Initial Balance: ${user.initialBalance} XLM`);
    });

    console.log('\n═══════════════════════════════════════════════════════════════\n');

    if (users.length > 0) {
      // Export as JSON for reference
      const jsonOutput = JSON.stringify(users, null, 2);
      console.log('RECIPIENTS FOR PAYMENT TESTING (JSON):');
      console.log('─────────────────────────────────────────────────────────────');
      console.log(jsonOutput);
      console.log('');
    }

    if (users.length > 0) {
      console.log('✅ Seeding complete! Users are ready for testing.\n');
      console.log('📋 NEXT STEPS:');
      console.log('1. Visit the chat interface');
      console.log('2. Create your wallet: "criar carteira" or "create wallet"');
      console.log('3. Send payments: Copy a public key from above and use it as recipient');
      console.log('4. Test cross-user payments in the chat\n');
    } else {
      console.log('⚠️ No users were created. Check for errors above.\n');
    }

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`\n❌ Seeding failed: ${errorMessage}\n`);
    process.exit(1);
  }

  // Close database connection
  process.exit(0);
}

// Run the seed script
seedUsers();
