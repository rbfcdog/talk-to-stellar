import dotenv from 'dotenv';
import { supabase } from '../src/config/supabase';
import { GlobalProfileService } from '../src/api/services/global-profile.service';

dotenv.config();

async function main(): Promise<void> {
  console.log('='.repeat(84));
  console.log('Backfill global public profile (/u/username) for all existing users');
  console.log('='.repeat(84));

  const { data: sessions, error } = await supabase
    .from('agent_sessions')
    .select('user_id, email, updated_at')
    .order('updated_at', { ascending: false })
    .limit(20000);

  if (error) {
    throw new Error(`Failed to load users: ${error.message}`);
  }

  const byUser = new Map<string, { email: string }>();
  for (const row of sessions || []) {
    const userId = String((row as any)?.user_id || '').trim();
    if (!userId || byUser.has(userId)) continue;
    byUser.set(userId, {
      email: String((row as any)?.email || '').trim(),
    });
  }

  let processed = 0;
  let succeeded = 0;
  let failed = 0;

  for (const [userId, info] of byUser.entries()) {
    processed += 1;
    try {
      const profile = await GlobalProfileService.ensureForUser({
        userId,
        displayName: info.email || userId,
        usernameHint: info.email || userId,
      });
      succeeded += 1;
      console.log(`[${processed}] ok user=${userId} username=${String((profile as any)?.username || '')}`);
    } catch (error) {
      failed += 1;
      const message = error instanceof Error ? error.message : String(error);
      console.log(`[${processed}] fail user=${userId} error=${message}`);
    }
  }

  console.log(`Backfill complete. processed=${processed} succeeded=${succeeded} failed=${failed}`);
}

main().catch((error) => {
  console.error(`Script failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});

