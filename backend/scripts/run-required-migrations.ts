/**
 * Runs the required TalkToStellar migrations in a deterministic order.
 *
 * Usage:
 *   npm run migrate:required
 *
 * Optional:
 *   MIGRATION_FROM=20260512_03_financial_assistant_modules.sql npm run migrate:required
 *   MIGRATION_DRY_RUN=1 npm run migrate:required
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
  console.error('Missing SUPABASE_URL and service key env vars.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const orderedMigrations = [
  '20260512_00_payment_infra_prereqs.sql',
  '20260512_01_smart_contacts_and_treasury.sql',
  '20260512_02_activity_feed_insights_economy.sql',
  '20260512_03_financial_assistant_modules.sql',
  '20260512_04_remove_non_payment_assistant_modules.sql',
  '20260512_05_savings_feed_spread.sql',
  '20260512_06_global_idempotency_uniqueness.sql',
];

function resolveExecutionList(): string[] {
  const from = String(process.env.MIGRATION_FROM || '').trim();
  if (!from) return orderedMigrations;

  const idx = orderedMigrations.indexOf(from);
  if (idx === -1) {
    throw new Error(
      `MIGRATION_FROM=${from} is not in the required list. Valid values: ${orderedMigrations.join(', ')}`
    );
  }
  return orderedMigrations.slice(idx);
}

async function runSingleMigration(filename: string): Promise<void> {
  const migrationPath = path.resolve(__dirname, '../migrations', filename);
  if (!fs.existsSync(migrationPath)) {
    throw new Error(`Migration file not found: ${migrationPath}`);
  }

  const sql = fs.readFileSync(migrationPath, 'utf8');
  const sanitizedSql = sanitizeSqlForExec(sql);
  const statements = splitSqlStatements(sanitizedSql).filter((statement) => {
    const normalized = statement.replace(/^\s*(--[^\n]*\n)*/g, '').trim();
    return !/^(BEGIN|COMMIT|ROLLBACK)$/i.test(normalized);
  });
  console.log(`\n-> Running ${filename}`);

  for (let i = 0; i < statements.length; i += 1) {
    const statement = statements[i];
    const { error } = await supabase.rpc('exec_sql', { sql: statement });
    if (error) {
      const message = [
        error.message,
        error.code ? `code=${error.code}` : '',
        error.details ? `details=${error.details}` : '',
        error.hint ? `hint=${error.hint}` : '',
      ]
        .filter(Boolean)
        .join(' | ');
      throw new Error(`Migration failed for ${filename} (statement ${i + 1}/${statements.length}): ${message}`);
    }
  }

  console.log(`   OK ${filename}`);
}

function sanitizeSqlForExec(sql: string): string {
  // Supabase exec_sql rejects top-level transaction control statements.
  // Remove only envelope BEGIN/COMMIT/ROLLBACK, never PL/pgSQL function BEGIN blocks.
  return sql
    .replace(/^\s*BEGIN\s*;\s*/i, '')
    .replace(/\s*(COMMIT|ROLLBACK)\s*;?\s*$/i, '')
    .trim();
}

function splitSqlStatements(sql: string): string[] {
  const statements: string[] = [];
  let current = '';
  let i = 0;
  let inSingleQuote = false;
  let inDoubleQuote = false;
  let inLineComment = false;
  let inBlockComment = false;
  let dollarTag: string | null = null;

  while (i < sql.length) {
    const ch = sql[i];
    const next = i + 1 < sql.length ? sql[i + 1] : '';

    if (inLineComment) {
      current += ch;
      if (ch === '\n') inLineComment = false;
      i += 1;
      continue;
    }

    if (inBlockComment) {
      current += ch;
      if (ch === '*' && next === '/') {
        current += next;
        i += 2;
        inBlockComment = false;
        continue;
      }
      i += 1;
      continue;
    }

    if (dollarTag) {
      current += ch;
      if (ch === '$' && sql.startsWith(dollarTag, i)) {
        const rest = dollarTag.slice(1);
        current += rest;
        i += dollarTag.length;
        dollarTag = null;
      } else {
        i += 1;
      }
      continue;
    }

    if (!inSingleQuote && !inDoubleQuote) {
      if (ch === '-' && next === '-') {
        current += ch + next;
        i += 2;
        inLineComment = true;
        continue;
      }
      if (ch === '/' && next === '*') {
        current += ch + next;
        i += 2;
        inBlockComment = true;
        continue;
      }
      if (ch === '$') {
        const match = sql.slice(i).match(/^\$[A-Za-z0-9_]*\$/);
        if (match) {
          dollarTag = match[0];
          current += dollarTag;
          i += dollarTag.length;
          continue;
        }
      }
    }

    if (ch === "'" && !inDoubleQuote) {
      inSingleQuote = !inSingleQuote;
      current += ch;
      i += 1;
      continue;
    }
    if (ch === '"' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote;
      current += ch;
      i += 1;
      continue;
    }

    if (ch === ';' && !inSingleQuote && !inDoubleQuote) {
      const trimmed = current.trim();
      if (trimmed) statements.push(trimmed);
      current = '';
      i += 1;
      continue;
    }

    current += ch;
    i += 1;
  }

  const tail = current.trim();
  if (tail) statements.push(tail);
  return statements;
}

async function verifyCoreObjects(): Promise<void> {
  const checks = [
    'public.idempotency_keys',
    'public.short_links',
    'public.telegram_update_dedupes',
  ];

  for (const objectName of checks) {
    const { data, error } = await supabase.rpc('exec_sql', {
      sql: `SELECT to_regclass('${objectName}')::text AS result;`,
    });

    if (error) {
      throw new Error(`Verification failed for ${objectName}: ${error.message}`);
    }

    const value = String((data as any)?.[0]?.result || '');
    if (!value || value === 'null') {
      throw new Error(`Verification failed: ${objectName} does not exist.`);
    }
    console.log(`   Verified ${objectName}`);
  }
}

async function main(): Promise<void> {
  const dryRun = String(process.env.MIGRATION_DRY_RUN || '').trim() === '1';
  const executionList = resolveExecutionList();

  console.log('Required migration order:');
  executionList.forEach((item, index) => console.log(`${index + 1}. ${item}`));

  if (dryRun) {
    console.log('\nDRY RUN only. No migration executed.');
    return;
  }

  for (const migration of executionList) {
    await runSingleMigration(migration);
  }

  console.log('\nVerifying core idempotency objects...');
  await verifyCoreObjects();
  console.log('\nAll required migrations executed successfully.');
}

main().catch((error) => {
  console.error(`Migration execution failed: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
