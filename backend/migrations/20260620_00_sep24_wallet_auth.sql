-- Migration: SEP-24 Anchor Sessions + Transactions + Wallet Auth Sessions
-- Run after: 20260618_03_bridge_va_cache.sql

-- ── anchor_sessions ──────────────────────────────────────────────────
-- Stores SEP-10 JWTs per user per anchor domain.

CREATE TABLE IF NOT EXISTS anchor_sessions (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_stellar_address TEXT NOT NULL,
    anchor_domain        TEXT NOT NULL,
    jwt_token            TEXT NOT NULL,
    expires_at           TIMESTAMPTZ NOT NULL,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (user_stellar_address, anchor_domain)
);

CREATE INDEX IF NOT EXISTS anchor_sessions_address ON anchor_sessions (user_stellar_address);
CREATE INDEX IF NOT EXISTS anchor_sessions_domain  ON anchor_sessions (anchor_domain);

ALTER TABLE anchor_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_manage_anchor_sessions" ON anchor_sessions;
CREATE POLICY "service_role_manage_anchor_sessions"
    ON anchor_sessions FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');
GRANT SELECT, INSERT, UPDATE, DELETE ON public.anchor_sessions TO service_role;

-- ── anchor_transactions ──────────────────────────────────────────────
-- Mirrors SEP-24 transaction state from anchor APIs.

CREATE TABLE IF NOT EXISTS anchor_transactions (
    id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id               UUID REFERENCES anchor_sessions(id) ON DELETE SET NULL,
    sep24_transaction_id     TEXT NOT NULL UNIQUE,
    anchor_domain            TEXT NOT NULL,
    user_stellar_address     TEXT NOT NULL,
    kind                     TEXT NOT NULL CHECK (kind IN ('deposit', 'withdrawal')),
    asset_code               TEXT NOT NULL,
    status                   TEXT NOT NULL,
    amount_in                TEXT,
    amount_out               TEXT,
    amount_fee               TEXT,
    interactive_url          TEXT,
    stellar_transaction_id   TEXT,
    external_transaction_id  TEXT,
    started_at               TIMESTAMPTZ NOT NULL,
    completed_at             TIMESTAMPTZ,
    last_synced_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    raw_response             JSONB
);

CREATE INDEX IF NOT EXISTS anchor_tx_user    ON anchor_transactions (user_stellar_address);
CREATE INDEX IF NOT EXISTS anchor_tx_domain  ON anchor_transactions (anchor_domain);
CREATE INDEX IF NOT EXISTS anchor_tx_status  ON anchor_transactions (status);

ALTER TABLE anchor_transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_manage_anchor_transactions" ON anchor_transactions;
CREATE POLICY "service_role_manage_anchor_transactions"
    ON anchor_transactions FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');
GRANT SELECT, INSERT, UPDATE, DELETE ON public.anchor_transactions TO service_role;

-- ── wallet_auth_sessions ─────────────────────────────────────────────
-- SEP-10 sessions for Stellar Wallets Kit (Freighter, Albedo, xBull, etc.)

CREATE TABLE IF NOT EXISTS wallet_auth_sessions (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    stellar_address  TEXT NOT NULL UNIQUE,
    token            TEXT NOT NULL,
    wallet_type      TEXT,
    expires_at       TIMESTAMPTZ NOT NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS wallet_auth_address ON wallet_auth_sessions (stellar_address);
CREATE INDEX IF NOT EXISTS wallet_auth_expiry  ON wallet_auth_sessions (expires_at);

ALTER TABLE wallet_auth_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_manage_wallet_auth_sessions" ON wallet_auth_sessions;
CREATE POLICY "service_role_manage_wallet_auth_sessions"
    ON wallet_auth_sessions FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');
GRANT SELECT, INSERT, UPDATE, DELETE ON public.wallet_auth_sessions TO service_role;
