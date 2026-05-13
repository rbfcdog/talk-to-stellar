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

-- ==========================================================================
-- Additive migrations required by current TalkToStellar runtime (20260511+).
-- This keeps the setup idempotent from zero in one single SQL file.
-- ==========================================================================

BEGIN;

-- PIN reset compatibility + session PIN hash sync
ALTER TABLE IF EXISTS public.agent_sessions
  ADD COLUMN IF NOT EXISTS session_password_hash TEXT;

UPDATE public.agent_sessions
SET session_password_hash = password_hash
WHERE session_password_hash IS NULL AND password_hash IS NOT NULL;

UPDATE public.agent_sessions
SET password_hash = session_password_hash
WHERE password_hash IS NULL AND session_password_hash IS NOT NULL;

CREATE OR REPLACE FUNCTION public.sync_agent_session_pin_hash()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.session_password_hash IS NULL AND NEW.password_hash IS NOT NULL THEN
    NEW.session_password_hash := NEW.password_hash;
  ELSIF NEW.password_hash IS NULL AND NEW.session_password_hash IS NOT NULL THEN
    NEW.password_hash := NEW.session_password_hash;
  ELSIF NEW.password_hash IS DISTINCT FROM OLD.password_hash
        AND NEW.session_password_hash IS NOT DISTINCT FROM OLD.session_password_hash THEN
    NEW.session_password_hash := NEW.password_hash;
  ELSIF NEW.session_password_hash IS DISTINCT FROM OLD.session_password_hash
        AND NEW.password_hash IS NOT DISTINCT FROM OLD.password_hash THEN
    NEW.password_hash := NEW.session_password_hash;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_agent_session_pin_hash ON public.agent_sessions;
CREATE TRIGGER trg_sync_agent_session_pin_hash
BEFORE INSERT OR UPDATE ON public.agent_sessions
FOR EACH ROW
EXECUTE FUNCTION public.sync_agent_session_pin_hash();

CREATE TABLE IF NOT EXISTS public.pin_reset_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  session_id UUID NOT NULL,
  reset_token TEXT UNIQUE NOT NULL,
  token_hash TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ NULL,
  new_pin_hash TEXT NULL
);

ALTER TABLE IF EXISTS public.pin_reset_tokens
  ADD COLUMN IF NOT EXISTS user_id TEXT,
  ADD COLUMN IF NOT EXISTS session_id UUID,
  ADD COLUMN IF NOT EXISTS reset_token TEXT,
  ADD COLUMN IF NOT EXISTS token_hash TEXT,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now(),
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS used_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS new_pin_hash TEXT;

CREATE INDEX IF NOT EXISTS idx_pin_reset_tokens_user_expires
  ON public.pin_reset_tokens (user_id, expires_at);
CREATE INDEX IF NOT EXISTS idx_pin_reset_tokens_session_id
  ON public.pin_reset_tokens (session_id);
CREATE INDEX IF NOT EXISTS idx_pin_reset_tokens_used_at
  ON public.pin_reset_tokens (used_at);
CREATE INDEX IF NOT EXISTS idx_pin_reset_tokens_token_hash
  ON public.pin_reset_tokens (token_hash);
ALTER TABLE IF EXISTS public.pin_reset_tokens DISABLE ROW LEVEL SECURITY;

COMMIT;

BEGIN;

-- Identity collision guards
ALTER TABLE IF EXISTS public.external_accounts
  ADD COLUMN IF NOT EXISTS data JSONB DEFAULT '{}'::jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_sessions_email_lower_unique
  ON public.agent_sessions ((lower(email)))
  WHERE email IS NOT NULL AND btrim(email) <> '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_sessions_phone_unique
  ON public.agent_sessions (phone_number)
  WHERE phone_number IS NOT NULL AND btrim(phone_number) <> '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_external_accounts_data_cpf_unique
  ON public.external_accounts ((regexp_replace(coalesce(data->>'cpf', ''), '\D', '', 'g')))
  WHERE coalesce(data->>'cpf', '') <> '';

COMMIT;

BEGIN;

-- Payment infrastructure + confirmations
CREATE TABLE IF NOT EXISTS public.payment_logs (
  id BIGSERIAL PRIMARY KEY,
  session_id UUID NOT NULL,
  user_id VARCHAR(255) NOT NULL,
  source_public_key VARCHAR(56) NOT NULL,
  destination_public_key VARCHAR(56) NOT NULL,
  source_amount VARCHAR(50),
  source_asset_code VARCHAR(12),
  source_asset_issuer VARCHAR(56),
  destination_amount VARCHAR(50),
  destination_asset_code VARCHAR(12),
  destination_asset_issuer VARCHAR(56),
  fee_xlm VARCHAR(50),
  payment_hash VARCHAR(255),
  operation_type VARCHAR(50),
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  error_message TEXT,
  route_path JSONB,
  metadata JSONB DEFAULT '{}',
  estimated_traditional_fee NUMERIC,
  actual_fee NUMERIC,
  estimated_savings NUMERIC,
  savings_percentage NUMERIC,
  comparison_method TEXT,
  memo TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

ALTER TABLE IF EXISTS public.payment_logs
  ADD COLUMN IF NOT EXISTS source_asset_code VARCHAR(12),
  ADD COLUMN IF NOT EXISTS source_asset_issuer VARCHAR(56),
  ADD COLUMN IF NOT EXISTS destination_asset_code VARCHAR(12),
  ADD COLUMN IF NOT EXISTS destination_asset_issuer VARCHAR(56),
  ADD COLUMN IF NOT EXISTS fee_xlm VARCHAR(50),
  ADD COLUMN IF NOT EXISTS payment_hash VARCHAR(255),
  ADD COLUMN IF NOT EXISTS operation_type VARCHAR(50),
  ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS error_message TEXT,
  ADD COLUMN IF NOT EXISTS route_path JSONB,
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS estimated_traditional_fee NUMERIC,
  ADD COLUMN IF NOT EXISTS actual_fee NUMERIC,
  ADD COLUMN IF NOT EXISTS estimated_savings NUMERIC,
  ADD COLUMN IF NOT EXISTS savings_percentage NUMERIC,
  ADD COLUMN IF NOT EXISTS comparison_method TEXT,
  ADD COLUMN IF NOT EXISTS memo TEXT,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_payment_logs_session_id ON public.payment_logs (session_id);
CREATE INDEX IF NOT EXISTS idx_payment_logs_user_id ON public.payment_logs (user_id);
CREATE INDEX IF NOT EXISTS idx_payment_logs_payment_hash ON public.payment_logs (payment_hash);
CREATE INDEX IF NOT EXISTS idx_payment_logs_status ON public.payment_logs (status);
CREATE INDEX IF NOT EXISTS idx_payment_logs_user_completed_at ON public.payment_logs (user_id, completed_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_logs_destination_public_key ON public.payment_logs (destination_public_key);
CREATE INDEX IF NOT EXISTS idx_payment_logs_operation_type ON public.payment_logs (operation_type);
CREATE INDEX IF NOT EXISTS idx_payment_logs_estimated_savings
  ON public.payment_logs (user_id, estimated_savings DESC)
  WHERE estimated_savings IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payment_logs_user_memo_lower
  ON public.payment_logs (user_id, lower(memo))
  WHERE memo IS NOT NULL AND btrim(memo) <> '';

CREATE TABLE IF NOT EXISTS public.payment_confirmations (
  id BIGSERIAL PRIMARY KEY,
  token_hash VARCHAR(255) NOT NULL,
  session_id UUID NOT NULL,
  user_id VARCHAR(255) NOT NULL,
  destination VARCHAR(56) NOT NULL,
  destination_name VARCHAR(255),
  destination_contact JSONB,
  amount VARCHAR(50) NOT NULL,
  asset_code VARCHAR(12) NOT NULL DEFAULT 'XLM',
  source_asset_code VARCHAR(12),
  source_asset_issuer VARCHAR(56),
  payment_hash VARCHAR(255),
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  used BOOLEAN NOT NULL DEFAULT false,
  used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  operation_fingerprint TEXT,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

ALTER TABLE IF EXISTS public.payment_confirmations
  ADD COLUMN IF NOT EXISTS destination_name VARCHAR(255),
  ADD COLUMN IF NOT EXISTS destination_contact JSONB,
  ADD COLUMN IF NOT EXISTS source_asset_code VARCHAR(12),
  ADD COLUMN IF NOT EXISTS source_asset_issuer VARCHAR(56),
  ADD COLUMN IF NOT EXISTS payment_hash VARCHAR(255),
  ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS used BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS used_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS operation_fingerprint TEXT,
  ADD COLUMN IF NOT EXISTS details JSONB,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS ux_payment_confirmations_token_hash
  ON public.payment_confirmations (token_hash)
  WHERE token_hash IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_payment_confirmations_payment_hash
  ON public.payment_confirmations (payment_hash) WHERE payment_hash IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_payment_confirmations_fingerprint
  ON public.payment_confirmations (operation_fingerprint) WHERE operation_fingerprint IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payment_confirmations_session_id ON public.payment_confirmations (session_id);
CREATE INDEX IF NOT EXISTS idx_payment_confirmations_user_id ON public.payment_confirmations (user_id);
CREATE INDEX IF NOT EXISTS idx_payment_confirmations_status ON public.payment_confirmations (status);
CREATE INDEX IF NOT EXISTS idx_payment_confirmations_used ON public.payment_confirmations (used);
CREATE INDEX IF NOT EXISTS idx_payment_confirmations_used_at ON public.payment_confirmations (used_at);
CREATE INDEX IF NOT EXISTS idx_payment_confirmations_expires_at ON public.payment_confirmations (expires_at);
CREATE INDEX IF NOT EXISTS idx_payment_confirmations_completed_at ON public.payment_confirmations (completed_at DESC);

ALTER TABLE IF EXISTS public.payment_logs DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.payment_confirmations DISABLE ROW LEVEL SECURITY;

COMMIT;

BEGIN;

-- Smart contacts / treasury / insights
ALTER TABLE IF EXISTS public.contacts ADD COLUMN IF NOT EXISTS display_name TEXT;
ALTER TABLE IF EXISTS public.contacts ADD COLUMN IF NOT EXISTS nickname TEXT;
ALTER TABLE IF EXISTS public.contacts ADD COLUMN IF NOT EXISTS role_label TEXT;
ALTER TABLE IF EXISTS public.contacts ADD COLUMN IF NOT EXISTS country TEXT;
ALTER TABLE IF EXISTS public.contacts ADD COLUMN IF NOT EXISTS preferred_currency TEXT;
ALTER TABLE IF EXISTS public.contacts ADD COLUMN IF NOT EXISTS preferred_amount NUMERIC;
ALTER TABLE IF EXISTS public.contacts ADD COLUMN IF NOT EXISTS last_amount NUMERIC;
ALTER TABLE IF EXISTS public.contacts ADD COLUMN IF NOT EXISTS last_direction TEXT;
ALTER TABLE IF EXISTS public.contacts ADD COLUMN IF NOT EXISTS last_operation_id UUID;
ALTER TABLE IF EXISTS public.contacts ADD COLUMN IF NOT EXISTS total_sent NUMERIC DEFAULT 0;
ALTER TABLE IF EXISTS public.contacts ADD COLUMN IF NOT EXISTS total_received NUMERIC DEFAULT 0;
ALTER TABLE IF EXISTS public.contacts ADD COLUMN IF NOT EXISTS transaction_count INTEGER DEFAULT 0;
ALTER TABLE IF EXISTS public.contacts ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';
ALTER TABLE IF EXISTS public.contacts ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE IF EXISTS public.contacts ADD COLUMN IF NOT EXISTS metadata_json JSONB DEFAULT '{}';
ALTER TABLE IF EXISTS public.contacts ADD COLUMN IF NOT EXISTS favorite BOOLEAN DEFAULT false;
ALTER TABLE IF EXISTS public.contacts ADD COLUMN IF NOT EXISTS recurring BOOLEAN DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_contacts_owner_transaction_count ON public.contacts (owner_id, transaction_count DESC);
CREATE INDEX IF NOT EXISTS idx_contacts_owner_favorite ON public.contacts (owner_id, favorite) WHERE favorite = true;
CREATE INDEX IF NOT EXISTS idx_contacts_owner_recurring ON public.contacts (owner_id, recurring) WHERE recurring = true;
CREATE INDEX IF NOT EXISTS idx_contacts_tags_gin ON public.contacts USING GIN (tags);
CREATE INDEX IF NOT EXISTS idx_contacts_metadata_gin ON public.contacts USING GIN (metadata_json);

CREATE TABLE IF NOT EXISTS public.currency_rate_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  base_currency TEXT NOT NULL,
  quote_currency TEXT NOT NULL,
  rate NUMERIC NOT NULL,
  source TEXT,
  observed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  metadata JSONB DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_currency_rate_history_pair_time
  ON public.currency_rate_history (base_currency, quote_currency, observed_at DESC);

CREATE TABLE IF NOT EXISTS public.treasury_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL,
  user_id TEXT NOT NULL,
  auto_protect_enabled BOOLEAN NOT NULL DEFAULT false,
  target_usd_ratio NUMERIC NOT NULL DEFAULT 0.50,
  risk_threshold_pct NUMERIC NOT NULL DEFAULT 2.50,
  spending_projection_brl NUMERIC,
  spending_projection_usd NUMERIC,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (session_id)
);
CREATE INDEX IF NOT EXISTS idx_treasury_profiles_user_id ON public.treasury_profiles (user_id);

CREATE TABLE IF NOT EXISTS public.treasury_recommendations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL,
  user_id TEXT NOT NULL,
  recommendation_type TEXT NOT NULL,
  risk_score NUMERIC,
  suggested_action TEXT,
  payload JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_treasury_recommendations_session_time
  ON public.treasury_recommendations (session_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_treasury_recommendations_user_time
  ON public.treasury_recommendations (user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.financial_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  amount NUMERIC,
  currency TEXT,
  period_start TIMESTAMPTZ,
  period_end TIMESTAMPTZ,
  metadata_json JSONB DEFAULT '{}',
  dedupe_key TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_financial_insights_user_time ON public.financial_insights (user_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS ux_financial_insights_dedupe_key
  ON public.financial_insights (dedupe_key) WHERE dedupe_key IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.financial_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  amount NUMERIC,
  currency TEXT,
  status TEXT,
  icon TEXT,
  semantic_color TEXT,
  related_operation_id UUID,
  related_contact_id BIGINT,
  metadata_json JSONB DEFAULT '{}',
  dedupe_key TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_financial_events_user_time ON public.financial_events (user_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS ux_financial_events_dedupe_key
  ON public.financial_events (dedupe_key) WHERE dedupe_key IS NOT NULL;

ALTER TABLE IF EXISTS public.operations ADD COLUMN IF NOT EXISTS estimated_traditional_fee NUMERIC;
ALTER TABLE IF EXISTS public.operations ADD COLUMN IF NOT EXISTS actual_fee NUMERIC;
ALTER TABLE IF EXISTS public.operations ADD COLUMN IF NOT EXISTS estimated_savings NUMERIC;
ALTER TABLE IF EXISTS public.operations ADD COLUMN IF NOT EXISTS savings_percentage NUMERIC;
ALTER TABLE IF EXISTS public.operations ADD COLUMN IF NOT EXISTS comparison_method TEXT;

ALTER TABLE IF EXISTS public.financial_insights DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.financial_events DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.currency_rate_history DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.treasury_profiles DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.treasury_recommendations DISABLE ROW LEVEL SECURITY;

COMMIT;

BEGIN;

-- Financial assistant modules
CREATE TABLE IF NOT EXISTS public.invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  recipient_name TEXT NOT NULL,
  recipient_contact_id BIGINT,
  title TEXT NOT NULL,
  description TEXT,
  amount NUMERIC NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  due_date TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'paid', 'expired', 'cancelled')),
  payment_link_id TEXT,
  metadata_json JSONB DEFAULT '{}',
  operation_fingerprint TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_invoices_user_time ON public.invoices (user_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS ux_invoices_fingerprint
  ON public.invoices (operation_fingerprint) WHERE operation_fingerprint IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.global_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL UNIQUE,
  username TEXT NOT NULL UNIQUE,
  display_name TEXT,
  avatar_url TEXT,
  bio TEXT,
  default_currency TEXT DEFAULT 'USD',
  accepted_currencies TEXT[] DEFAULT '{USD,BRL}',
  is_public BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_global_profiles_username
  ON public.global_profiles (lower(username)) WHERE username IS NOT NULL;

DROP TABLE IF EXISTS public.financial_reminders;
DROP TABLE IF EXISTS public.automation_rules;
DROP TABLE IF EXISTS public.travel_plans;

ALTER TABLE IF EXISTS public.invoices DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.global_profiles DISABLE ROW LEVEL SECURITY;

COMMIT;

BEGIN;

-- Global idempotency + short links
CREATE TABLE IF NOT EXISTS public.idempotency_keys (
  id BIGSERIAL PRIMARY KEY,
  idempotency_key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  method TEXT NOT NULL,
  route TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'completed', 'failed')),
  response_status INTEGER,
  response_body JSONB,
  session_id TEXT,
  user_id TEXT,
  locked_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_idempotency_keys_key
  ON public.idempotency_keys (idempotency_key);
CREATE INDEX IF NOT EXISTS idx_idempotency_keys_route_status
  ON public.idempotency_keys (route, status, created_at DESC);
ALTER TABLE IF EXISTS public.idempotency_keys DISABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.telegram_update_dedupes (
  update_id TEXT PRIMARY KEY,
  chat_id TEXT,
  status TEXT NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'completed', 'failed')),
  response JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE IF EXISTS public.telegram_update_dedupes DISABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.short_links (
  code TEXT PRIMARY KEY,
  url TEXT NOT NULL,
  purpose TEXT,
  token_hash TEXT,
  session_id TEXT,
  user_id TEXT,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_short_links_token_purpose
  ON public.short_links (token_hash, purpose)
  WHERE token_hash IS NOT NULL AND purpose IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_short_links_expires_at ON public.short_links (expires_at);
ALTER TABLE IF EXISTS public.short_links DISABLE ROW LEVEL SECURITY;

ALTER TABLE IF EXISTS public.agent_messages ADD COLUMN IF NOT EXISTS dedupe_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS ux_agent_messages_dedupe_key
  ON public.agent_messages (dedupe_key) WHERE dedupe_key IS NOT NULL;

ALTER TABLE IF EXISTS public.operations ADD COLUMN IF NOT EXISTS operation_fingerprint TEXT;
ALTER TABLE IF EXISTS public.operations ADD COLUMN IF NOT EXISTS transaction_hash TEXT;
UPDATE public.operations
SET transaction_hash = stellar_transaction_hash
WHERE transaction_hash IS NULL AND stellar_transaction_hash IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_operations_tx_hash
  ON public.operations (transaction_hash) WHERE transaction_hash IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_operations_stellar_tx_hash
  ON public.operations (stellar_transaction_hash) WHERE stellar_transaction_hash IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_operations_fingerprint
  ON public.operations (operation_fingerprint) WHERE operation_fingerprint IS NOT NULL;

ALTER TABLE IF EXISTS public.payment_logs ADD COLUMN IF NOT EXISTS operation_fingerprint TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS ux_payment_logs_payment_hash
  ON public.payment_logs (payment_hash) WHERE payment_hash IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_payment_logs_fingerprint
  ON public.payment_logs (operation_fingerprint) WHERE operation_fingerprint IS NOT NULL;

COMMIT;

BEGIN;

-- Onboarding idempotency + receipt images
CREATE TABLE IF NOT EXISTS public.onboarding_finalizations (
  id BIGSERIAL PRIMARY KEY,
  token_hash TEXT NOT NULL,
  provider TEXT NOT NULL,
  provider_user_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'processing',
  used BOOLEAN NOT NULL DEFAULT false,
  used_at TIMESTAMPTZ,
  session_id TEXT,
  user_id TEXT,
  response_status INTEGER,
  result JSONB,
  data JSONB,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_onboarding_finalizations_token_hash
  ON public.onboarding_finalizations (token_hash) WHERE token_hash IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_onboarding_finalizations_provider_user
  ON public.onboarding_finalizations (provider, provider_user_id)
  WHERE provider IS NOT NULL AND provider_user_id IS NOT NULL;
ALTER TABLE IF EXISTS public.onboarding_finalizations DISABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.receipt_images (
  code TEXT PRIMARY KEY,
  operation_id TEXT,
  tx_hash TEXT,
  session_id TEXT,
  user_id TEXT,
  receipt_type TEXT,
  image_data_url TEXT NOT NULL,
  image_mime TEXT NOT NULL DEFAULT 'image/svg+xml',
  metadata JSONB DEFAULT '{}',
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_receipt_images_tx_hash
  ON public.receipt_images (tx_hash) WHERE tx_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_receipt_images_session_created
  ON public.receipt_images (session_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_receipt_images_user_created
  ON public.receipt_images (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_receipt_images_expires_at
  ON public.receipt_images (expires_at);
ALTER TABLE IF EXISTS public.receipt_images DISABLE ROW LEVEL SECURITY;

COMMIT;
