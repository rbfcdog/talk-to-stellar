import { supabase } from '../src/config/supabase';
import { AgentRepository } from '../src/repositories/agent.repository';
import { WalletRepository } from '../src/repositories/wallet.repository';
import { ExternalRepository } from '../src/repositories/external.repository';
import { ContactRepository } from '../src/api/repository/contact.repository';
import { VaultService } from '../src/services/vault.service';
import { StellarService } from '../src/api/services/stellar.service';
import { TrustlineService } from '../src/api/services/trustline.service';
import { v4 as uuidv4 } from 'uuid';

function randomSuffix() {
  return Math.random().toString(36).slice(2, 8);
}

function buildContactEmail(index: number) {
  const stamp = new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 12);
  return `contact${index}.${stamp}.${randomSuffix()}@example.com`;
}

async function deleteAllContacts() {
  const { data, error } = await supabase
    .from('contacts')
    .delete()
    .neq('id', 0)
    .select('id');

  if (error) {
    throw new Error(`Failed to delete all contacts: ${error.message}`);
  }

  const deletedCount = data?.length || 0;
  console.log(`Deleted ${deletedCount} existing contacts (global)`);
}

async function createContactUser(ownerEmail: string, contactName: string, email: string) {
  const agentRepo = new AgentRepository(supabase);
  const walletRepo = new WalletRepository(supabase);
  const externalRepo = new ExternalRepository(supabase);
  const vaultService = new VaultService(supabase);

  const sessionId = uuidv4();
  const sessionToken = uuidv4();
  const now = new Date().toISOString();

  let publicKey = '';
  let secretKey = '';

  try {
    const generated = await StellarService.createTestAccount();
    publicKey = generated.publicKey;
    secretKey = generated.secret;
  } catch (error: any) {
    const fallback = StellarService.generateStellarKeypair();
    publicKey = fallback.publicKey;
    secretKey = fallback.secret;
  }

  const vaultSecretId = await vaultService.storeSecret(
    secretKey,
    `wallet:${email}:private-key`,
    `Stellar private key for wallet ${publicKey}`
  );

  await agentRepo.saveSession(sessionId, {
    user_id: email,
    email,
    session_token: sessionToken,
    public_key: publicKey,
    phone_number: undefined,
    password_hash: undefined,
    created_at: now,
    last_activity: now,
  });

  await walletRepo.saveWallet({
    session_id: sessionId,
    public_key: publicKey,
    vault_secret_id: vaultSecretId,
    name: contactName,
  });

  await externalRepo.createMapping({
    provider: 'email',
    provider_user_id: email,
    session_id: sessionId,
    user_id: email,
  });

  await ContactRepository.create({
    owner_id: ownerEmail,
    contact_name: contactName,
    stellar_public_key: publicKey,
    pix_key: email,
  });

  const trustlineResult = await TrustlineService.createDefaultTrustlines(
    publicKey,
    secretKey,
    email
  );

  return { publicKey, email, trustlineResult };
}

async function main() {
  const ownerEmail = process.argv[2] || 'rod@gmail.com';
  const count = Number(process.argv[3] || '5');

  if (!ownerEmail) {
    console.error('Usage: npx ts-node scripts/create-contacts-for-user.ts <ownerEmail> [count]');
    process.exit(1);
  }

  await deleteAllContacts();
  console.log(`Creating ${count} contacts for ${ownerEmail}`);

  let successCount = 0;
  let failCount = 0;

  for (let i = 1; i <= count; i++) {
    const contactName = `Contato ${i}`;
    const email = buildContactEmail(i);

    try {
      const result = await createContactUser(ownerEmail, contactName, email);
      console.log(`✅ ${contactName} created: ${email} | ${result.publicKey}`);
      if (!result.trustlineResult.success) {
        console.log(`   ⚠️ Trustlines: ${result.trustlineResult.errors.join(', ')}`);
      }
      successCount++;
    } catch (error: any) {
      console.error(`❌ Failed to create ${contactName}: ${error?.message || String(error)}`);
      failCount++;
    }
  }

  console.log(`Done. Success: ${successCount}, Failed: ${failCount}`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
