/**
 * Runs the condensed AI Financial Assistant migration.
 *
 * Usage:
 *   npm run migrate:financial-assistant
 *
 * Legacy local bootstrap only. Requires public.exec_sql plus
 * ALLOW_LEGACY_EXEC_SQL_MIGRATIONS=true and refuses hosted/production envs.
 */

import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY || '';

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars.');
  process.exit(1);
}

function isProductionLikeEnvironment(): boolean {
  return Boolean(
    process.env.NODE_ENV === 'production' ||
      process.env.RAILWAY_PUBLIC_DOMAIN ||
      process.env.RENDER_EXTERNAL_URL ||
      process.env.FLY_APP_NAME ||
      process.env.VERCEL_URL
  );
}

if (isProductionLikeEnvironment()) {
  console.error('Refusing to run legacy exec_sql migration in a hosted/production environment.');
  process.exit(1);
}

if (String(process.env.ALLOW_LEGACY_EXEC_SQL_MIGRATIONS || '').trim() !== 'true') {
  console.error('Refusing to run legacy exec_sql migration without ALLOW_LEGACY_EXEC_SQL_MIGRATIONS=true.');
  process.exit(1);
}

const migrationPath = path.join(
  __dirname,
  '../migrations/20260512_99_financial_assistant_all_in_one.sql'
);

async function main(): Promise<void> {
  const sql = fs.readFileSync(migrationPath, 'utf8');
  const supabase = createClient(supabaseUrl, supabaseKey);

  console.log(`Running condensed migration: ${migrationPath}`);
  const { error } = await supabase.rpc('exec_sql', { sql });

  if (error) {
    const message = [
      error.message,
      error.code ? `code=${error.code}` : '',
      error.details ? `details=${error.details}` : '',
      error.hint ? `hint=${error.hint}` : '',
    ].filter(Boolean).join(' | ');

    throw new Error(message || 'Unknown Supabase migration error');
  }

  const requiredTables = [
    'payment_logs',
    'payment_confirmations',
    'currency_rate_history',
    'treasury_profiles',
    'treasury_recommendations',
    'financial_insights',
    'financial_events',
    'invoices',
    'global_profiles',
  ];

  for (const table of requiredTables) {
    const { error: verifyError } = await supabase
      .from(table)
      .select('*', { count: 'exact', head: true });

    if (verifyError) {
      throw new Error(`Verification failed for ${table}: ${verifyError.message}`);
    }
  }

  console.log(`Migration complete. Verified ${requiredTables.length} tables.`);
}

main().catch((error) => {
  console.error(`Migration failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
