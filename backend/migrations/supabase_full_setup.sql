-- ==========================================================================
-- TalkToStellar - Single Supabase Setup Script
-- Run this entire file in Supabase SQL Editor.
-- It is idempotent and combines the agent bootstrap schema, feature schema,
-- vault helpers, views, indexes, triggers, and dev RLS cleanup.
-- ==========================================================================
BEGIN;
-- --------------------------------------------------------------------------
-- Extensions
-- --------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pgcrypto;
-- --------------------------------------------------------------------------
-- Core agent tables
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS agent_sessions (
    id BIGSERIAL PRIMARY KEY,
    session_id UUID UNIQUE NOT NULL,
    user_id TEXT NOT NULL,
    email TEXT NOT NULL,
    session_token UUID NOT NULL,
    public_key TEXT,
    phone_number TEXT,
    pix_key TEXT,
    password_hash TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_agent_sessions_user_id ON agent_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_agent_sessions_created_at ON agent_sessions(created_at);
CREATE INDEX IF NOT EXISTS idx_agent_sessions_pix_key_lower ON agent_sessions ((lower(pix_key))) WHERE pix_key IS NOT NULL AND btrim(pix_key) <> '';
CREATE TABLE IF NOT EXISTS wallets (
    id BIGSERIAL PRIMARY KEY,
    session_id UUID UNIQUE NOT NULL,
    name TEXT,
    public_key TEXT UNIQUE NOT NULL,
    pix_key TEXT,
    vault_secret_id UUID,
    balance JSONB DEFAULT '[]',
    sequence TEXT,
    account_data JSONB,
    last_synced TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (session_id) REFERENCES agent_sessions(session_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_wallets_public_key ON wallets(public_key);
CREATE INDEX IF NOT EXISTS idx_wallets_session_id ON wallets(session_id);
CREATE INDEX IF NOT EXISTS idx_wallets_last_synced ON wallets(last_synced);
CREATE INDEX IF NOT EXISTS idx_wallets_vault_secret_id ON wallets(vault_secret_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_wallets_pix_key_lower_unique ON wallets ((lower(pix_key))) WHERE pix_key IS NOT NULL AND btrim(pix_key) <> '';
CREATE TABLE IF NOT EXISTS operations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,
    type TEXT NOT NULL,
    status TEXT NOT NULL,
    amount NUMERIC,
    amount_usdc NUMERIC,
    amount_brl NUMERIC,
    asset_code TEXT,
    category TEXT DEFAULT 'other',
    memo TEXT,
    contact_id UUID,
    is_auto_conversion BOOLEAN DEFAULT false,
    trustline_asset_code TEXT,
    context TEXT,
    stellar_transaction_hash TEXT,
    destination_key TEXT,
    source_public_key TEXT,
    source_session_id UUID,
    destination_session_id UUID,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_operations_created_at ON operations(created_at);
CREATE INDEX IF NOT EXISTS idx_operations_status ON operations(status);
CREATE INDEX IF NOT EXISTS idx_operations_contact_id ON operations(contact_id);
CREATE INDEX IF NOT EXISTS idx_operations_category ON operations(category);
CREATE INDEX IF NOT EXISTS idx_operations_is_auto_conversion ON operations(is_auto_conversion);
CREATE TABLE IF NOT EXISTS user_passkeys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,
    credential_id TEXT UNIQUE NOT NULL,
    public_key TEXT NOT NULL,
    counter BIGINT NOT NULL DEFAULT 0,
    transports TEXT [] DEFAULT '{}',
    device_type TEXT,
    backed_up BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_user_passkeys_user_id ON user_passkeys(user_id);
CREATE TABLE IF NOT EXISTS passkey_challenges (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,
    type TEXT NOT NULL,
    challenge TEXT NOT NULL,
    payload JSONB DEFAULT '{}',
    expires_at TIMESTAMP NOT NULL,
    used_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_passkey_challenges_user_type ON passkey_challenges(user_id, type);
CREATE INDEX IF NOT EXISTS idx_passkey_challenges_expires_at ON passkey_challenges(expires_at);
CREATE TABLE IF NOT EXISTS agent_states (
    id BIGSERIAL PRIMARY KEY,
    session_id UUID UNIQUE NOT NULL,
    detected_intent TEXT,
    action_type TEXT,
    action_params JSONB DEFAULT '{}',
    pending_payment JSONB,
    response_message TEXT,
    success BOOLEAN DEFAULT false,
    error TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (session_id) REFERENCES agent_sessions(session_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_agent_states_session_id ON agent_states(session_id);
CREATE INDEX IF NOT EXISTS idx_agent_states_updated_at ON agent_states(updated_at);
CREATE TABLE IF NOT EXISTS agent_messages (
    id BIGSERIAL PRIMARY KEY,
    session_id UUID NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (session_id) REFERENCES agent_sessions(session_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_agent_messages_session_id ON agent_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_agent_messages_created_at ON agent_messages(created_at);
CREATE TABLE IF NOT EXISTS external_accounts (
    id BIGSERIAL PRIMARY KEY,
    provider TEXT NOT NULL,
    provider_user_id TEXT NOT NULL,
    session_id UUID,
    user_id TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(provider, provider_user_id)
);
CREATE INDEX IF NOT EXISTS idx_external_accounts_provider_user ON external_accounts(provider, provider_user_id);
CREATE INDEX IF NOT EXISTS idx_external_accounts_session_id ON external_accounts(session_id);
CREATE TABLE IF NOT EXISTS contacts (
    id BIGSERIAL PRIMARY KEY,
    owner_id TEXT NOT NULL,
    contact_name TEXT NOT NULL,
    stellar_public_key TEXT,
    phone_number TEXT,
    pix_key TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(owner_id, contact_name)
);
CREATE INDEX IF NOT EXISTS idx_contacts_owner_id ON contacts(owner_id);
CREATE INDEX IF NOT EXISTS idx_contacts_stellar_public_key ON contacts(stellar_public_key);
CREATE INDEX IF NOT EXISTS idx_contacts_phone_number ON contacts(phone_number);
CREATE INDEX IF NOT EXISTS idx_contacts_pix_key ON contacts(pix_key);
CREATE INDEX IF NOT EXISTS idx_contacts_pix_key_lower ON contacts ((lower(pix_key))) WHERE pix_key IS NOT NULL AND btrim(pix_key) <> '';
CREATE UNIQUE INDEX IF NOT EXISTS idx_contacts_owner_pix_key_lower_unique ON contacts (owner_id, lower(pix_key)) WHERE pix_key IS NOT NULL AND btrim(pix_key) <> '';
CREATE TABLE IF NOT EXISTS recovery_otps (
    id BIGSERIAL PRIMARY KEY,
    user_id TEXT NOT NULL,
    email TEXT NOT NULL,
    otp_code TEXT NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    used_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_recovery_otps_user_id ON recovery_otps(user_id);
CREATE INDEX IF NOT EXISTS idx_recovery_otps_email ON recovery_otps(email);
CREATE INDEX IF NOT EXISTS idx_recovery_otps_expires_at ON recovery_otps(expires_at);
-- --------------------------------------------------------------------------
-- Feature columns on existing tables
-- --------------------------------------------------------------------------
ALTER TABLE agent_sessions
ADD COLUMN IF NOT EXISTS opt_out_weekly_summary BOOLEAN DEFAULT false;
ALTER TABLE agent_sessions
ADD COLUMN IF NOT EXISTS pix_key TEXT;
ALTER TABLE wallets
ADD COLUMN IF NOT EXISTS pix_key TEXT;
ALTER TABLE wallets
ADD COLUMN IF NOT EXISTS alert_threshold_usdc NUMERIC DEFAULT 5.00;
ALTER TABLE wallets
ADD COLUMN IF NOT EXISTS last_balance_alert_at TIMESTAMP;
-- Ensure legacy schemas get a user_id on operations before views/indexes that depend on it
ALTER TABLE operations
ADD COLUMN IF NOT EXISTS user_id TEXT;
CREATE INDEX IF NOT EXISTS idx_operations_user_id ON operations(user_id);
ALTER TABLE operations
ADD COLUMN IF NOT EXISTS amount_usdc NUMERIC;
ALTER TABLE operations
ADD COLUMN IF NOT EXISTS amount_brl NUMERIC;
ALTER TABLE operations
ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'other';
ALTER TABLE operations
ADD COLUMN IF NOT EXISTS memo TEXT;
ALTER TABLE operations
ADD COLUMN IF NOT EXISTS contact_id UUID;
ALTER TABLE operations
ADD COLUMN IF NOT EXISTS is_auto_conversion BOOLEAN DEFAULT false;
ALTER TABLE operations
ADD COLUMN IF NOT EXISTS trustline_asset_code TEXT;
ALTER TABLE contacts
ADD COLUMN IF NOT EXISTS phone_number TEXT;
ALTER TABLE contacts
ADD COLUMN IF NOT EXISTS pix_key TEXT;
ALTER TABLE external_accounts
ADD COLUMN IF NOT EXISTS user_id TEXT;
ALTER TABLE external_accounts
ADD COLUMN IF NOT EXISTS session_id UUID;
-- --------------------------------------------------------------------------
-- Feature tables
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS conversion_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wallet_id BIGINT NOT NULL,
    session_id UUID NOT NULL,
    from_asset_code TEXT NOT NULL,
    to_asset_code TEXT NOT NULL,
    trigger_type TEXT NOT NULL CHECK (trigger_type IN ('on_receive', 'on_threshold')),
    min_amount NUMERIC DEFAULT 0.1,
    enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (wallet_id) REFERENCES wallets(id) ON DELETE CASCADE,
    FOREIGN KEY (session_id) REFERENCES agent_sessions(session_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_conversion_rules_wallet_id ON conversion_rules(wallet_id);
CREATE INDEX IF NOT EXISTS idx_conversion_rules_enabled ON conversion_rules(enabled);
CREATE TABLE IF NOT EXISTS audit_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL,
    event_type TEXT NOT NULL,
    ip_hash TEXT,
    user_agent TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (session_id) REFERENCES agent_sessions(session_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_audit_events_session_id ON audit_events(session_id);
CREATE INDEX IF NOT EXISTS idx_audit_events_event_type ON audit_events(event_type);
CREATE INDEX IF NOT EXISTS idx_audit_events_created_at ON audit_events(created_at);
CREATE TABLE IF NOT EXISTS scheduled_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL,
    recipient_public_key TEXT NOT NULL,
    recipient_name TEXT,
    amount NUMERIC NOT NULL,
    asset_code TEXT DEFAULT 'XLM',
    category TEXT DEFAULT 'other',
    memo TEXT,
    scheduled_for TIMESTAMP NOT NULL,
    status TEXT DEFAULT 'pending' CHECK (
        status IN ('pending', 'completed', 'failed', 'cancelled')
    ),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (session_id) REFERENCES agent_sessions(session_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_scheduled_payments_session_id ON scheduled_payments(session_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_payments_scheduled_for ON scheduled_payments(scheduled_for);
CREATE INDEX IF NOT EXISTS idx_scheduled_payments_status ON scheduled_payments(status);
CREATE TABLE IF NOT EXISTS whitelisted_assets (
    id BIGSERIAL PRIMARY KEY,
    asset_code TEXT UNIQUE NOT NULL,
    asset_issuer TEXT,
    trusted BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO whitelisted_assets (asset_code, asset_issuer, trusted)
VALUES (
        'USDC',
        'GBZ46DBWTLU45IU75G5NR2EY3DEC5ZGJCVYCNGVRBU57WV6DC4OPI7PK',
        true
    ),
    (
        'USDT',
        'GDGQVOKHW4VEJRU77QCE6EM7BNUH7CFLY5G2WQGVD57XFHVKNQXKXQX',
        true
    ),
    (
        'BRL',
        'GCKG7UJA4YHCL6MBEVGCWO42CDONOTYU64E53X2SWAHS2CWHXDAKXOL5',
        true
    ),
    (
        'CNY',
        'GBHSQKRX2RCQJAWQZ24KSRKNLXV4OXNQYH2QIBY4MSPJHV6C3KZH3JOK',
        true
    ) ON CONFLICT (asset_code) DO NOTHING;
-- --------------------------------------------------------------------------
-- Functions and views
-- --------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION update_updated_at_column() RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = CURRENT_TIMESTAMP;
RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS update_agent_sessions_updated_at ON agent_sessions;
CREATE TRIGGER update_agent_sessions_updated_at BEFORE
UPDATE ON agent_sessions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_wallets_updated_at ON wallets;
CREATE TRIGGER update_wallets_updated_at BEFORE
UPDATE ON wallets FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_operations_updated_at ON operations;
CREATE TRIGGER update_operations_updated_at BEFORE
UPDATE ON operations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_user_passkeys_updated_at ON user_passkeys;
CREATE TRIGGER update_user_passkeys_updated_at BEFORE
UPDATE ON user_passkeys FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_agent_states_updated_at ON agent_states;
CREATE TRIGGER update_agent_states_updated_at BEFORE
UPDATE ON agent_states FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_external_accounts_updated_at ON external_accounts;
CREATE TRIGGER update_external_accounts_updated_at BEFORE
UPDATE ON external_accounts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_contacts_updated_at ON contacts;
CREATE TRIGGER update_contacts_updated_at BEFORE
UPDATE ON contacts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_conversion_rules_updated_at ON conversion_rules;
CREATE TRIGGER update_conversion_rules_updated_at BEFORE
UPDATE ON conversion_rules FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_scheduled_payments_updated_at ON scheduled_payments;
CREATE TRIGGER update_scheduled_payments_updated_at BEFORE
UPDATE ON scheduled_payments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE OR REPLACE FUNCTION public.store_private_key(
        secret_value TEXT,
        unique_name TEXT DEFAULT NULL,
        secret_description TEXT DEFAULT NULL
    ) RETURNS UUID LANGUAGE SQL SECURITY DEFINER
SET search_path = public,
    vault AS $$
SELECT vault.create_secret(secret_value, unique_name, secret_description);
$$;
CREATE OR REPLACE FUNCTION public.store_private_key(
        secret_description TEXT,
        secret_value TEXT,
        unique_name TEXT DEFAULT NULL
    ) RETURNS UUID LANGUAGE SQL SECURITY DEFINER
SET search_path = public,
    vault AS $$
SELECT vault.create_secret(secret_value, unique_name, secret_description);
$$;
CREATE OR REPLACE FUNCTION public.get_private_key(secret_id UUID) RETURNS TEXT LANGUAGE SQL SECURITY DEFINER
SET search_path = public,
    vault AS $$
SELECT decrypted_secret
FROM vault.decrypted_secrets
WHERE id = secret_id;
$$;
-- Create summary views only if required columns exist (safe for partial schemas)
DO $$ BEGIN IF EXISTS(
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
        AND table_name = 'operations'
        AND column_name = 'user_id'
) THEN EXECUTE $view$
CREATE OR REPLACE VIEW spending_summary AS
SELECT o.user_id,
    o.category,
    o.asset_code,
    COUNT(*) as transaction_count,
    SUM(o.amount) as total_amount,
    SUM(o.amount_usdc) as total_usdc,
    SUM(o.amount_brl) as total_brl,
    DATE_TRUNC('month', o.created_at) as month
FROM operations o
WHERE o.status = 'success'
GROUP BY o.user_id,
    o.category,
    o.asset_code,
    DATE_TRUNC('month', o.created_at);
$view$;
EXECUTE $view$
CREATE OR REPLACE VIEW contact_payment_summary AS
SELECT o.user_id,
    o.contact_id,
    o.destination_key,
    COUNT(*) as payment_count,
    SUM(o.amount) as total_amount,
    SUM(o.amount_usdc) as total_usdc,
    MAX(o.created_at) as last_payment_at,
    DATE_TRUNC('month', MAX(o.created_at)) as month
FROM operations o
WHERE o.status = 'success'
    AND o.type = 'PAYMENT'
GROUP BY o.user_id,
    o.contact_id,
    o.destination_key;
$view$;
END IF;
END;
$$ LANGUAGE plpgsql;
-- --------------------------------------------------------------------------
-- Development RLS cleanup
-- --------------------------------------------------------------------------
ALTER TABLE IF EXISTS agent_sessions DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS wallets DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS operations DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS user_passkeys DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS passkey_challenges DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS agent_states DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS agent_messages DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS external_accounts DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS contacts DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS recovery_otps DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS conversion_rules DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS audit_events DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS scheduled_payments DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS whitelisted_assets DISABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can read their own sessions" ON agent_sessions;
DROP POLICY IF EXISTS "Users can insert their own sessions" ON agent_sessions;
DROP POLICY IF EXISTS "Users can update their own sessions" ON agent_sessions;
DROP POLICY IF EXISTS "Users can read their own states" ON agent_states;
DROP POLICY IF EXISTS "Users can read their own messages" ON agent_messages;
COMMIT;
-- ==========================================================================
-- Optional production RLS policies are intentionally omitted from the script.
-- Enable them only after you define your auth model.
-- ==========================================================================
