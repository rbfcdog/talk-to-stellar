/**
 * Database migration runner
 * Executes SQL migrations on Supabase in phases
 */

import { SupabaseClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { 
  createExecSqlFunction,
  agentMigrationSQL, 
  createFunctionsAndTriggers,
  createVaultFunctions,
  ensureRequiredColumns,
  createFeaturesTables,
  disableRLSOnAgentTables
} from '../migrations/agent.migration';
import { logger } from './logger';

function isMissingTableError(error: any): boolean {
  const code = String(error?.code || '');
  const message = String(error?.message || '').toLowerCase();
  return (
    code === 'PGRST116' ||
    code === 'PGRST205' ||
    code === '42P01' ||
    message.includes('does not exist') ||
    message.includes('relation')
  );
}

function formatSupabaseError(error: any): string {
  if (!error) return 'unknown error';
  const message = String(error?.message || '').trim();
  const code = String(error?.code || '').trim();
  const details = String(error?.details || '').trim();
  const hint = String(error?.hint || '').trim();

  if (!message && !code && !details && !hint) {
    return 'empty Supabase error response';
  }

  const parts = [message, code && `code=${code}`, details && `details=${details}`, hint && `hint=${hint}`]
    .filter(Boolean);

  if (parts.length > 0) return parts.join(' | ');
  return JSON.stringify(error);
}

async function executeMigrationPhase(
  supabase: SupabaseClient,
  phaseName: string,
  sql: string
): Promise<boolean> {
  try {
    logger.info(`Running migration phase: ${phaseName}`);
    
    const { error } = await supabase.rpc('exec_sql', { sql });
    
    if (error) {
      logger.error(`Phase "${phaseName}" failed: ${formatSupabaseError(error)}`);
      return false;
    }
    
    logger.info(`Phase "${phaseName}" completed successfully`);
    return true;
  } catch (error) {
    logger.error(`Phase "${phaseName}" threw exception: ${error instanceof Error ? error.message : String(error)}`);
    return false;
  }
}

export async function runMigrations(supabase: SupabaseClient): Promise<void> {
  try {
    logger.info('Starting database migrations...');

    // Phase 1: Create exec_sql function (always run, idempotent with CREATE OR REPLACE)
    logger.info('Phase 1/6: Creating exec_sql function...');
    const { error: execSqlError } = await supabase.rpc('exec_sql', { sql: createExecSqlFunction });
    
    if (execSqlError) {
      const msg = String(execSqlError?.message || '').toLowerCase();
      if (msg.includes('could not find the function')) {
        // exec_sql doesn't exist yet - this is the bootstrap case
        logger.warn('exec_sql RPC function does not exist yet. This is expected on first run.');
        logger.warn('Please run this SQL manually in Supabase Dashboard > SQL Editor:');
        logger.warn('---');
        logger.warn(createExecSqlFunction);
        logger.warn('---');
        logger.warn('Then restart the backend.');
        return;
      }
      logger.error(`Failed to create exec_sql: ${formatSupabaseError(execSqlError)}`);
      return;
    }

    // Phase 2: Core tables and schema
    const phase2Success = await executeMigrationPhase(
      supabase,
      'Core Tables & Schema',
      agentMigrationSQL
    );

    if (!phase2Success) {
      logger.error('Core migration phase failed, stopping.');
      return;
    }

    // Phase 3: Functions and triggers
    const phase3Success = await executeMigrationPhase(
      supabase,
      'Functions & Triggers',
      createFunctionsAndTriggers
    );

    if (!phase3Success) {
      logger.warn('Functions & Triggers phase had errors, but continuing...');
    }

    // Phase 4: Vault functions
    const phase4Success = await executeMigrationPhase(
      supabase,
      'Vault Functions',
      createVaultFunctions
    );

    if (!phase4Success) {
      logger.warn('Vault Functions phase had errors, but continuing...');
    }

    // Phase 5: Ensure required columns (fixes missing columns from partial migrations)
    const phase5Success = await executeMigrationPhase(
      supabase,
      'Ensure Required Columns',
      ensureRequiredColumns
    );

    if (!phase5Success) {
      logger.warn('Ensure Required Columns phase had errors, but continuing...');
    }

    // Phase 6: Create feature tables (contact history, alerts, conversions, audit, etc.)
    const phase6Success = await executeMigrationPhase(
      supabase,
      'Feature Tables (Contact History, Alerts, Conversions, Audit)',
      createFeaturesTables
    );

    if (!phase6Success) {
      logger.warn('Feature Tables phase had errors, but continuing...');
    }

    // Phase 7: Disable RLS on agent tables (DEV environment - no RLS for agent tables)
    const phase7Success = await executeMigrationPhase(
      supabase,
      'Disable RLS on Agent Tables',
      disableRLSOnAgentTables
    );

    if (!phase7Success) {
      logger.warn('Disable RLS phase had errors, but continuing...');
    }

    try {
      const idempotencySql = fs.readFileSync(
        path.resolve(__dirname, '../../migrations/20260512_06_global_idempotency_uniqueness.sql'),
        'utf-8'
      );
      const phase8Success = await executeMigrationPhase(
        supabase,
        'Global Idempotency & Uniqueness',
        idempotencySql
      );
      if (!phase8Success) {
        logger.warn('Global Idempotency & Uniqueness phase had errors, but continuing...');
      }
    } catch (error) {
      logger.warn(`Could not load idempotency migration file: ${error instanceof Error ? error.message : String(error)}`);
    }

    // Verify final state
    logger.info('Migration complete. Verifying schema...');
    
    const { data: tables, error: verifyError } = await supabase.rpc('exec_sql', {
      // Cast table_name to text so it matches the exec_sql function's TEXT result column
      sql: `SELECT table_name::text as result FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name IN ('agent_sessions', 'wallets', 'operations', 'agent_states', 'agent_messages', 'external_accounts', 'contacts')
            ORDER BY table_name;`
    });

    if (!verifyError && tables) {
      const count = Array.isArray(tables) ? tables.length : 0;
      logger.info(`✓ Schema verification passed: ${count}/7 required tables found`);
    } else {
      logger.warn(`Schema verification inconclusive: ${verifyError ? formatSupabaseError(verifyError) : 'no data'}`);
    }

    logger.info('All migrations completed successfully!');
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Migration runner failed: ${errorMessage}`);
    logger.warn('Please ensure Supabase is properly configured and running.');
  }
}
