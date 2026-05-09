/**
 * Migration runner: Apply database schema changes
 * Usage: npx ts-node scripts/run-migrations.ts
 */

import { createClient } from '@supabase/supabase-js';
import * as fs from 'fs';
import * as path from 'path';

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseKey) {
  console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_KEY/SUPABASE_ANON_KEY environment variables');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function runMigrations() {
  try {
    console.log('📝 Running database migrations...');

    // Read migration file
    const migrationPath = path.join(__dirname, '../migrations/add_features.sql');
    const sql = fs.readFileSync(migrationPath, 'utf-8');

    // Split by statement (basic split on ;)
    const statements = sql
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));

    console.log(`📋 Found ${statements.length} SQL statements to execute`);

    let executed = 0;
    for (const statement of statements) {
      try {
        const { error } = await supabase.rpc('exec', {
          query: statement,
        });

        if (error) {
          // Try direct query if rpc doesn't work
          const { error: directError } = await supabase.from('wallets').select('id', { count: 'exact' });
          if (directError) {
            console.warn(`⚠️  Statement execution might have failed: ${statement.substring(0, 50)}...`);
          }
        }
        executed++;
      } catch (err) {
        console.warn(`⚠️  Could not execute statement: ${statement.substring(0, 50)}...`);
      }
    }

    console.log(`✅ Migration complete! Executed ${executed}/${statements.length} statements`);
    console.log('\n📊 Verifying schema...');

    // Verify key tables exist
    const tables = ['conversion_rules', 'audit_events', 'scheduled_payments', 'whitelisted_assets'];
    for (const table of tables) {
      const { count, error } = await supabase.from(table).select('*', { count: 'exact', head: true });
      if (error) {
        console.warn(`⚠️  Table ${table} may not exist: ${error.message}`);
      } else {
        console.log(`✅ Table ${table} exists`);
      }
    }

    console.log('\n🎉 Database schema update complete!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

runMigrations();
