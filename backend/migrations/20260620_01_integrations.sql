-- Migration: Payment Links + Passkey Wallets
-- Run after: 20260620_00_sep24_wallet_auth.sql

-- ── payment_links ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payment_links (
    id                   TEXT PRIMARY KEY,
    stellar_address      TEXT NOT NULL,
    amount               TEXT,
    asset_code           TEXT NOT NULL DEFAULT 'USDC',
    asset_issuer         TEXT,
    memo                 TEXT,
    memo_type            TEXT CHECK (memo_type IN ('text', 'id', 'hash')),
    label                TEXT,
    message              TEXT,
    uri                  TEXT NOT NULL,
    short_url            TEXT NOT NULL,
    expires_at           TIMESTAMPTZ,
    times_used           INTEGER NOT NULL DEFAULT 0,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS payment_links_address ON payment_links (stellar_address);
CREATE INDEX IF NOT EXISTS payment_links_created  ON payment_links (created_at DESC);

ALTER TABLE payment_links ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_manage_payment_links" ON payment_links;
CREATE POLICY "service_role_manage_payment_links"
    ON payment_links FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');
GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_links TO service_role;

CREATE OR REPLACE FUNCTION increment_payment_link_use(link_id TEXT)
RETURNS VOID AS $$
BEGIN
  UPDATE payment_links SET times_used = times_used + 1 WHERE id = link_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ── passkey_wallets ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS passkey_wallets (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id          TEXT,
    email            TEXT,
    contract_id      TEXT NOT NULL UNIQUE,
    key_id_base64    TEXT NOT NULL,
    network          TEXT NOT NULL DEFAULT 'testnet',
    label            TEXT,
    funded           BOOLEAN NOT NULL DEFAULT false,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS passkey_wallets_user    ON passkey_wallets (user_id);
CREATE INDEX IF NOT EXISTS passkey_wallets_key_id  ON passkey_wallets (key_id_base64);
CREATE INDEX IF NOT EXISTS passkey_wallets_email   ON passkey_wallets (email);

ALTER TABLE passkey_wallets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "service_role_manage_passkey_wallets" ON passkey_wallets;
CREATE POLICY "service_role_manage_passkey_wallets"
    ON passkey_wallets FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');
GRANT SELECT, INSERT, UPDATE, DELETE ON public.passkey_wallets TO service_role;
