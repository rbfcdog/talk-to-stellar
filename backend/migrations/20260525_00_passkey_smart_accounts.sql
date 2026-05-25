BEGIN;

ALTER TABLE IF EXISTS user_passkeys
  ADD COLUMN IF NOT EXISTS credential_public_key_p256 JSONB,
  ADD COLUMN IF NOT EXISTS smart_account_address TEXT,
  ADD COLUMN IF NOT EXISTS smart_account_signer TEXT,
  ADD COLUMN IF NOT EXISTS smart_account_verifier_address TEXT,
  ADD COLUMN IF NOT EXISTS smart_account_network TEXT,
  ADD COLUMN IF NOT EXISTS smart_account_type TEXT NOT NULL DEFAULT 'openzeppelin_stellar_smart_account',
  ADD COLUMN IF NOT EXISTS smart_account_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS smart_account_context_rule_id INTEGER,
  ADD COLUMN IF NOT EXISTS smart_account_metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_user_passkeys_smart_account_address
  ON user_passkeys(smart_account_address)
  WHERE smart_account_address IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_user_passkeys_smart_account_enabled
  ON user_passkeys(user_id, smart_account_enabled);

CREATE INDEX IF NOT EXISTS idx_user_passkeys_smart_account_network
  ON user_passkeys(smart_account_network)
  WHERE smart_account_network IS NOT NULL;

COMMIT;
