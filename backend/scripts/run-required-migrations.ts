/**
 * Applies required TalkToStellar database migrations through psql.
 *
 * Usage:
 *   DATABASE_URL=postgresql://... npm run migrate:required
 *
 * Optional:
 *   MIGRATION_DRY_RUN=1 npm run migrate:required
 *   OPS_ADMIN_LOGIN=ops@example.com OPS_ADMIN_PASSWORD_HASH=salt:hash npm run migrate:required
 */

import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';

dotenv.config();

const migrationsDir = path.resolve(__dirname, '../migrations');
const databaseUrl = String(process.env.DATABASE_URL || process.env.SUPABASE_DB_URL || '').trim();
const dryRun = String(process.env.MIGRATION_DRY_RUN || '').trim() === '1';

if (!fs.existsSync(migrationsDir)) {
  console.error(`Migrations directory not found: ${migrationsDir}`);
  process.exit(1);
}

const migrationPaths = fs.readdirSync(migrationsDir)
  .filter((file) => /^\d{8}_\d{2}_.+\.sql$/.test(file))
  .sort()
  .map((file) => path.join(migrationsDir, file));

if (!migrationPaths.length) {
  console.error(`No required SQL migrations found in ${migrationsDir}`);
  process.exit(1);
}

const opsAdminLogin = String(process.env.OPS_ADMIN_LOGIN || '').trim();
const opsAdminPasswordHash = String(process.env.OPS_ADMIN_PASSWORD_HASH || '').trim();

function sqlLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

if ((opsAdminLogin && !opsAdminPasswordHash) || (!opsAdminLogin && opsAdminPasswordHash)) {
  console.error('OPS_ADMIN_LOGIN and OPS_ADMIN_PASSWORD_HASH must be provided together to bootstrap the ops admin.');
  process.exit(1);
}

console.log('Required migrations:');
for (const migrationPath of migrationPaths) {
  console.log(`- ${migrationPath}`);
}

if (opsAdminLogin && opsAdminPasswordHash) {
  console.log(`Ops admin bootstrap enabled for login: ${opsAdminLogin.toLowerCase()}`);
} else {
  console.log('Ops admin bootstrap disabled. Set OPS_ADMIN_LOGIN and OPS_ADMIN_PASSWORD_HASH to create/rotate the admin account.');
}

if (dryRun) {
  console.log('DRY RUN only. No migration executed.');
  process.exit(0);
}

if (!databaseUrl) {
  console.error('Missing DATABASE_URL or SUPABASE_DB_URL.');
  process.exit(1);
}

for (const migrationPath of migrationPaths) {
  console.log(`Applying ${path.basename(migrationPath)}...`);
  const result = spawnSync(
    'psql',
    [
      databaseUrl,
      '-v',
      'ON_ERROR_STOP=1',
      '-f',
      migrationPath,
    ],
    { stdio: 'inherit' }
  );

  if (result.error) {
    console.error(`Could not execute psql: ${result.error.message}`);
    process.exit(1);
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

if (opsAdminLogin && opsAdminPasswordHash) {
  console.log(`Creating or rotating ops admin login ${opsAdminLogin.toLowerCase()}...`);
  const result = spawnSync(
    'psql',
    [
      databaseUrl,
      '-v',
      'ON_ERROR_STOP=1',
    ],
    {
      input: `SELECT public.upsert_ops_admin_user(${sqlLiteral(opsAdminLogin.toLowerCase())}, ${sqlLiteral(opsAdminPasswordHash)}, NULL);\n`,
      stdio: ['pipe', 'inherit', 'inherit'],
    }
  );

  if (result.error) {
    console.error(`Could not execute psql: ${result.error.message}`);
    process.exit(1);
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

console.log('Required database migrations completed successfully.');
