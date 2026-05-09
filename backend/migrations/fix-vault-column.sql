-- ============================================================================
-- TalkToStellar Vault Column Fix (Quick Reference)
-- ============================================================================
-- If you get: ERROR: 42703: column "vault_secret_id" does not exist
-- This fix is already included in bootstrap.sql as PHASE 5
-- You can run this directly OR let backend auto-fix on next startup
-- ============================================================================

-- Add vault_secret_id column if it doesn't exist
ALTER TABLE wallets ADD COLUMN IF NOT EXISTS vault_secret_id UUID;

-- Add index for vault lookups
CREATE INDEX IF NOT EXISTS idx_wallets_vault_secret_id ON wallets(vault_secret_id);

-- Verify columns exist
SELECT column_name FROM information_schema.columns 
WHERE table_name = 'wallets' 
AND column_name IN ('vault_secret_id', 'public_key', 'session_id')
ORDER BY column_name;

-- Expected result: 3 rows (public_key, session_id, vault_secret_id)

