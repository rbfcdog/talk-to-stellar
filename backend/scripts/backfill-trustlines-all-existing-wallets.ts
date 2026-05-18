import dotenv from 'dotenv';
import { supabase } from '../src/config/supabase';
import { TrustlineService } from '../src/api/services/trustline.service';
import VaultService from '../src/services/vault.service';
import { assertMainnetBulkMutationAllowed } from './stellar-script-safety';

dotenv.config();

async function main(): Promise<void> {
  assertMainnetBulkMutationAllowed('backfill-trustlines-all-existing-wallets');

  console.log('='.repeat(84));
  console.log('Backfill trustlines for ALL existing wallets (USDC, BRL)');
  console.log('='.repeat(84));

  const vaultService = new VaultService(supabase);

  const { data: wallets, error: walletsError } = await supabase
    .from('wallets')
    .select('session_id, public_key, vault_secret_id')
    .not('vault_secret_id', 'is', null);

  if (walletsError) {
    throw new Error(`Failed to load wallets: ${walletsError.message}`);
  }

  if (!wallets || wallets.length === 0) {
    console.log('No wallets found.');
    return;
  }

  const sessionIds = Array.from(
    new Set(
      (wallets || [])
        .map((wallet: any) => String(wallet.session_id || '').trim())
        .filter(Boolean)
    )
  );

  const { data: sessions, error: sessionsError } = await supabase
    .from('agent_sessions')
    .select('session_id, user_id')
    .in('session_id', sessionIds);

  if (sessionsError) {
    throw new Error(`Failed to load sessions: ${sessionsError.message}`);
  }

  const userBySession = new Map<string, string>();
  for (const session of sessions || []) {
    const sessionId = String((session as any).session_id || '').trim();
    const userId = String((session as any).user_id || '').trim();
    if (sessionId && userId) userBySession.set(sessionId, userId);
  }

  let processed = 0;
  let succeeded = 0;
  let failed = 0;

  for (const wallet of wallets || []) {
    const publicKey = String((wallet as any).public_key || '').trim();
    const sessionId = String((wallet as any).session_id || '').trim();
    const vaultSecretId = String((wallet as any).vault_secret_id || '').trim();
    const userId = userBySession.get(sessionId) || '';

    if (!publicKey || !vaultSecretId || !userId) {
      continue;
    }

    processed += 1;

    try {
      const secretKey = await vaultService.getSecret(vaultSecretId);
      const result = await TrustlineService.createDefaultTrustlines(publicKey, secretKey, userId);
      if (result.success || result.assets.length > 0) {
        succeeded += 1;
      } else {
        failed += 1;
      }

      console.log(
        `[${processed}] ${publicKey} -> created=${result.assets.length} errors=${result.errors.length}`
      );
    } catch (error) {
      failed += 1;
      const message = error instanceof Error ? error.message : String(error);
      console.log(`[${processed}] ${publicKey} -> failed: ${message}`);
    }
  }

  console.log(`Backfill finished. processed=${processed} succeeded=${succeeded} failed=${failed}`);
}

main().catch((error) => {
  console.error(`Script failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
