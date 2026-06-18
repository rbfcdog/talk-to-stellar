-- user_stellar_wallets: stores multiple Stellar wallets per user (by email/user_id).
-- Unlike the `wallets` table (which is 1-to-1 with sessions), this table allows
-- a user to own several Stellar addresses and pick which one to use for Bridge.
-- Secret keys are NEVER stored — shown once on creation, user's responsibility to save.

BEGIN;

CREATE TABLE IF NOT EXISTS user_stellar_wallets (
    id          BIGSERIAL PRIMARY KEY,
    user_id     TEXT NOT NULL,              -- email / agent_sessions.user_id
    label       TEXT,                       -- optional user-given name
    public_key  TEXT UNIQUE NOT NULL,       -- G... Stellar public key
    is_funded   BOOLEAN NOT NULL DEFAULT false,    -- true once createAccount confirmed
    has_usdc_trustline BOOLEAN NOT NULL DEFAULT false, -- true once changeTrust confirmed
    created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_user_stellar_wallets_user_id    ON user_stellar_wallets(user_id);
CREATE INDEX IF NOT EXISTS idx_user_stellar_wallets_public_key ON user_stellar_wallets(public_key);

-- ── RLS ───────────────────────────────────────────────────────────────────────
-- Enable RLS so the Supabase anon/user roles cannot access this table directly.
-- The backend connects with SUPABASE_SERVICE_ROLE_KEY, which bypasses RLS,
-- so all legitimate access continues to work unchanged.

ALTER TABLE user_stellar_wallets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_manage_user_stellar_wallets" ON user_stellar_wallets;
CREATE POLICY "service_role_manage_user_stellar_wallets"
    ON user_stellar_wallets
    FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_stellar_wallets TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.user_stellar_wallets_id_seq TO service_role;

COMMIT;
