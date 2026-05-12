/**
 * Runs the condensed AI Financial Assistant migration.
 *
 * Usage:
 *   npm run migrate:financial-assistant
 *
 * Requires the public.exec_sql(sql text) RPC from backend/migrations/bootstrap.sql
 * or from backend/src/migrations/agent.migration.ts.
 */

import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  process.env.SUPABASE_KEY ||
  '';

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing SUPABASE_URL and service/anon key env vars.');
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
