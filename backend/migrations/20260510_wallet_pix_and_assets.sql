ALTER TABLE agent_sessions ADD COLUMN IF NOT EXISTS pix_key TEXT;
ALTER TABLE wallets ADD COLUMN IF NOT EXISTS pix_key TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS pix_key TEXT;

CREATE INDEX IF NOT EXISTS idx_agent_sessions_pix_key_lower ON agent_sessions ((lower(pix_key))) WHERE pix_key IS NOT NULL AND btrim(pix_key) <> '';
CREATE UNIQUE INDEX IF NOT EXISTS idx_wallets_pix_key_lower_unique ON wallets ((lower(pix_key))) WHERE pix_key IS NOT NULL AND btrim(pix_key) <> '';
CREATE INDEX IF NOT EXISTS idx_contacts_pix_key_lower ON contacts ((lower(pix_key))) WHERE pix_key IS NOT NULL AND btrim(pix_key) <> '';
CREATE UNIQUE INDEX IF NOT EXISTS idx_contacts_owner_pix_key_lower_unique ON contacts (owner_id, lower(pix_key)) WHERE pix_key IS NOT NULL AND btrim(pix_key) <> '';
