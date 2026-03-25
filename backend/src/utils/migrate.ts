/**
 * Database migration runner
 * Executes SQL migrations on Supabase
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { agentMigrationSQL } from '../migrations/agent.migration';
import { logger } from './logger';

export async function runMigrations(supabase: SupabaseClient): Promise<void> {
  try {
    logger.info('Starting database migrations...');

    // Check if core table exists
    const { error } = await supabase
      .from('agent_sessions')
      .select('COUNT(*)', { count: 'exact', head: true })
      .limit(1);

    // Check if operations table exists (older deployments may miss it)
    const { error: operationsError } = await supabase
      .from('operations')
      .select('COUNT(*)', { count: 'exact', head: true })
      .limit(1);

    const shouldRunMigration =
      (error && error.code === 'PGRST116') ||
      (operationsError && operationsError.code === 'PGRST116');

    // If required tables don't exist, run migration
    if (shouldRunMigration) {
      logger.info('One or more tables do not exist. Running migration...');

      // Execute migration SQL
      const { error: migrationError } = await supabase.rpc('exec_sql', {
        sql: agentMigrationSQL,
      });

      if (migrationError) {
        // If rpc function doesn't exist, try using the SQL editor approach
        // For now, log a helpful message
        logger.error(`Migration execution failed: ${migrationError.message}`);
        logger.warn(
          'Please run the migration manually: Go to Supabase Dashboard > SQL Editor > ' +
          'New Query > Paste the SQL from backend/src/migrations/agent.migration.ts'
        );
      } else {
        logger.info('Migration completed successfully');
      }
    } else if (error) {
      logger.error(`Migration check failed: ${error.message}`);
    } else {
      logger.info('Tables already exist. Migration skipped');
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.warn(`Migration check encountered an issue: ${errorMessage}`);
    logger.warn(
      'Please ensure the database tables exist in Supabase. See agent.migration.ts for the schema.'
    );
  }
}
