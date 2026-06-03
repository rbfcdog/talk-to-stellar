CREATE TABLE IF NOT EXISTS passkey_login_pairing_codes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  pair_id TEXT NOT NULL UNIQUE,
  code_hash TEXT NOT NULL,
  user_id TEXT NOT NULL,
  email TEXT,
  session_id TEXT NOT NULL,
  session_token_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_passkey_login_pairing_codes_pair
  ON passkey_login_pairing_codes(pair_id);

CREATE INDEX IF NOT EXISTS idx_passkey_login_pairing_codes_expires_at
  ON passkey_login_pairing_codes(expires_at);

CREATE INDEX IF NOT EXISTS idx_passkey_login_pairing_codes_user_id
  ON passkey_login_pairing_codes(user_id);

ALTER TABLE passkey_login_pairing_codes ENABLE ROW LEVEL SECURITY;
