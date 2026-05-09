#!/usr/bin/env node
/**
 * Debug script: Test Telegram check-account flow
 * Usage: node scripts/test-telegram-flow.js <telegram_user_id>
 */

const BACKEND_URL = process.env.BACKEND_URL || 'http://localhost:3001';

async function testCheckAccount(telegramUserId) {
  console.log(`\n🔍 Testing check-account for Telegram user: ${telegramUserId}\n`);

  try {
    const response = await fetch(`${BACKEND_URL}/api/external/check-account`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: 'telegram',
        provider_user_id: telegramUserId,
      }),
    });

    console.log(`📡 Response Status: ${response.status}\n`);

    const data = await response.json();
    console.log('📦 Response Body:');
    console.log(JSON.stringify(data, null, 2));

    if (!response.ok) {
      console.log('\n❌ ERROR: Backend returned error status');
      return false;
    }

    if (data.exists) {
      console.log('\n✅ Account EXISTS');
      console.log(`   Session ID: ${data.sessionId}`);
    } else {
      console.log('\n⚠️  Account DOES NOT EXIST (needs onboarding)');
      console.log(`   Onboarding URL: ${data.creationUrl}`);
    }

    return true;
  } catch (error) {
    console.log(`\n❌ NETWORK ERROR: ${error.message}`);
    console.log(`   Are you sure backend is running at ${BACKEND_URL}?`);
    return false;
  }
}

async function main() {
  const telegramUserId = process.argv[2];

  if (!telegramUserId) {
    console.log('Usage: node scripts/test-telegram-flow.js <telegram_user_id>');
    console.log('\nExample:');
    console.log('  node scripts/test-telegram-flow.js 123456789');
    process.exit(1);
  }

  const success = await testCheckAccount(telegramUserId);
  process.exit(success ? 0 : 1);
}

main();
