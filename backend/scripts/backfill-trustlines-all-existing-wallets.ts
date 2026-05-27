import dotenv from 'dotenv';
import { supabase } from '../src/config/supabase';
import { getDefaultTrustedAssets } from '../src/config/assets';
import { TrustlineService } from '../src/api/services/trustline.service';
import VaultService from '../src/api/services/core/vault.service';
import { assertMainnetBulkMutationAllowed } from './stellar-script-safety';

dotenv.config();

type WalletRow = {
  session_id?: string | null;
  public_key?: string | null;
  vault_secret_id?: string | null;
};

function argValue(name: string): string {
  const index = process.argv.indexOf(name);
  return index >= 0 ? String(process.argv[index + 1] || '').trim() : '';
}

function envFlag(name: string): boolean {
  return ['1', 'true', 'yes', 'on'].includes(String(process.env[name] || '').trim().toLowerCase());
}

async function loadAllWallets(limit = 0): Promise<WalletRow[]> {
  const pageSize = Math.max(1, Number(process.env.TRUSTLINE_BACKFILL_PAGE_SIZE || 1000));
  const wallets: WalletRow[] = [];

  for (let from = 0; ; from += pageSize) {
    const to = from + pageSize - 1;
    const { data, error } = await supabase
      .from('wallets')
      .select('session_id, public_key, vault_secret_id')
      .not('vault_secret_id', 'is', null)
      .range(from, to);

    if (error) {
      throw new Error(`Failed to load wallets: ${error.message}`);
    }

    wallets.push(...((data || []) as WalletRow[]));
    if ((data || []).length < pageSize || (limit > 0 && wallets.length >= limit)) break;
  }

  return limit > 0 ? wallets.slice(0, limit) : wallets;
}

async function loadUserIdsBySession(sessionIds: string[]): Promise<Map<string, string>> {
  const userBySession = new Map<string, string>();
  const uniqueSessionIds = Array.from(new Set(sessionIds.filter(Boolean)));
  const chunkSize = 500;

  for (let index = 0; index < uniqueSessionIds.length; index += chunkSize) {
    const chunk = uniqueSessionIds.slice(index, index + chunkSize);
    const { data, error } = await supabase
      .from('agent_sessions')
      .select('session_id, user_id')
      .in('session_id', chunk);

    if (error) {
      throw new Error(`Failed to load sessions: ${error.message}`);
    }

    for (const session of data || []) {
      const sessionId = String((session as any).session_id || '').trim();
      const userId = String((session as any).user_id || '').trim();
      if (sessionId && userId) userBySession.set(sessionId, userId);
    }
  }

  return userBySession;
}

async function main(): Promise<void> {
  assertMainnetBulkMutationAllowed('backfill-trustlines-all-existing-wallets');

  const dryRun = process.argv.includes('--dry-run') || envFlag('TRUSTLINE_BACKFILL_DRY_RUN');
  const limit = Math.max(0, Number(argValue('--limit') || process.env.TRUSTLINE_BACKFILL_LIMIT || 0));
  const assets = getDefaultTrustedAssets();

  console.log('='.repeat(84));
  console.log(`Backfill trustlines for all existing wallets${dryRun ? ' (dry run)' : ''}`);
  console.log(`Assets: ${assets.map((asset) => `${asset.code}:${asset.issuer.slice(0, 8)}...`).join(', ') || 'none configured'}`);
  console.log('='.repeat(84));

  if (assets.length === 0) {
    console.log('No default trustline assets configured.');
    return;
  }

  const vaultService = new VaultService(supabase);
  const wallets = await loadAllWallets(limit);

  if (wallets.length === 0) {
    console.log('No wallets found.');
    return;
  }

  const userBySession = await loadUserIdsBySession(
    wallets.map((wallet) => String(wallet.session_id || '').trim())
  );

  let processed = 0;
  let succeeded = 0;
  let failed = 0;
  let skipped = 0;

  for (const wallet of wallets) {
    const publicKey = String(wallet.public_key || '').trim();
    const sessionId = String(wallet.session_id || '').trim();
    const vaultSecretId = String(wallet.vault_secret_id || '').trim();
    const userId = userBySession.get(sessionId) || '';

    if (!publicKey || !vaultSecretId || !userId) {
      skipped += 1;
      continue;
    }

    processed += 1;

    if (dryRun) {
      console.log(`[${processed}] ${publicKey} -> would ensure ${assets.length} trustlines`);
      succeeded += 1;
      continue;
    }

    try {
      const secretKey = await vaultService.getSecret(vaultSecretId);
      const result = await TrustlineService.createDefaultTrustlines(publicKey, secretKey, userId);
      if (result.success) {
        succeeded += 1;
      } else {
        failed += 1;
      }

      console.log(
        `[${processed}] ${publicKey} -> created=${result.assets.length} errors=${result.errors.length}${result.errors.length ? ` (${result.errors.join(' | ')})` : ''}`
      );
    } catch (error) {
      failed += 1;
      const message = error instanceof Error ? error.message : String(error);
      console.log(`[${processed}] ${publicKey} -> failed: ${message}`);
    }
  }

  console.log(`Backfill finished. processed=${processed} succeeded=${succeeded} failed=${failed} skipped=${skipped}`);

  if (failed > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(`Script failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
