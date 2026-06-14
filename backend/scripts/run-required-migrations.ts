/**
 * Applies the single TalkToStellar database bootstrap through psql.
 *
 * Usage:
 *   DATABASE_URL=postgresql://... npm run migrate:required
 *
 * Optional:
 *   MIGRATION_DRY_RUN=1 npm run migrate:required
 */

import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';

dotenv.config();

const migrationPath = path.resolve(__dirname, '../migrations/20260613_00_full_schema.sql');
const databaseUrl = String(process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || '').trim();
const dryRun = String(process.env.MIGRATION_DRY_RUN || '').trim() === '1';

if (!fs.existsSync(migrationPath)) {
  console.error(`Consolidated migration not found: ${migrationPath}`);
  process.exit(1);
}

console.log(`Consolidated migration: ${migrationPath}`);

if (dryRun) {
  console.log('DRY RUN only. No migration executed.');
  process.exit(0);
}

if (!databaseUrl) {
  console.error('Missing DATABASE_URL or SUPABASE_DB_URL.');
  process.exit(1);
}

const result = spawnSync(
  'psql',
  [databaseUrl, '-v', 'ON_ERROR_STOP=1', '-f', migrationPath],
  { stdio: 'inherit' }
);

if (result.error) {
  console.error(`Could not execute psql: ${result.error.message}`);
  process.exit(1);
}

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

console.log('Consolidated database bootstrap completed successfully.');
