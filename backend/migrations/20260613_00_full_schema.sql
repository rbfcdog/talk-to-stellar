-- TalkToStellar consolidated database bootstrap.
-- Generated from the former backend/migrations history on 2026-06-13.
-- Apply once to an empty Supabase/PostgreSQL database from a trusted admin context.
-- This bootstrap intentionally excludes historical repair/backfill-only paths and rollback SQL.


-- ============================================================================
-- Consolidated source: 20260513_99_full_setup_from_zero.sql
-- ============================================================================

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
    credential_public_key_p256 JSONB,
    smart_account_address TEXT,
    smart_account_signer TEXT,
    smart_account_verifier_address TEXT,
    smart_account_network TEXT,
    smart_account_type TEXT NOT NULL DEFAULT 'openzeppelin_stellar_smart_account',
    smart_account_enabled BOOLEAN NOT NULL DEFAULT false,
    smart_account_context_rule_id INTEGER,
    smart_account_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_user_passkeys_user_id ON user_passkeys(user_id);
CREATE INDEX IF NOT EXISTS idx_user_passkeys_smart_account_address ON user_passkeys(smart_account_address) WHERE smart_account_address IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_user_passkeys_smart_account_enabled ON user_passkeys(user_id, smart_account_enabled);
CREATE INDEX IF NOT EXISTS idx_user_passkeys_smart_account_network ON user_passkeys(smart_account_network) WHERE smart_account_network IS NOT NULL;
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
CREATE OR REPLACE FUNCTION public.get_private_key(secret_id UUID) RETURNS TEXT LANGUAGE SQL SECURITY DEFINER
SET search_path = public,
    vault AS $$
SELECT decrypted_secret
FROM vault.decrypted_secrets
WHERE id = secret_id;
$$;
DO $$
DECLARE
  proc regprocedure;
  role_name text;
BEGIN
  FOR proc IN
    SELECT p.oid::regprocedure
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('store_private_key', 'get_private_key')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', proc);
    FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated']
    LOOP
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %I', proc, role_name);
      END IF;
    END LOOP;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', proc);
    END IF;
  END LOOP;
END $$;
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
ALTER TABLE IF EXISTS agent_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS user_passkeys ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS passkey_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS agent_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS agent_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS external_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS recovery_otps ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS conversion_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS scheduled_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS whitelisted_assets ENABLE ROW LEVEL SECURITY;
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
ALTER TABLE IF EXISTS public.pin_reset_tokens ENABLE ROW LEVEL SECURITY;

COMMIT;

BEGIN;

-- Identity collision guards
ALTER TABLE IF EXISTS public.external_accounts
  ADD COLUMN IF NOT EXISTS data JSONB DEFAULT '{}'::jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_sessions_email_lower_unique
  ON public.agent_sessions ((lower(email)))
  WHERE email IS NOT NULL AND btrim(email) <> '';

CREATE INDEX IF NOT EXISTS idx_agent_sessions_phone_lookup
  ON public.agent_sessions (phone_number)
  WHERE phone_number IS NOT NULL AND btrim(phone_number) <> '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_external_accounts_data_cpf_unique
  ON public.external_accounts ((regexp_replace(coalesce(data->>'cpf', ''), '\D', '', 'g')))
  WHERE coalesce(data->>'cpf', '') <> '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_external_accounts_data_email_lower_unique
  ON public.external_accounts ((lower(btrim(coalesce(data->>'email', '')))))
  WHERE btrim(coalesce(data->>'email', '')) <> '';

CREATE INDEX IF NOT EXISTS idx_external_accounts_data_phone_lookup
  ON public.external_accounts ((regexp_replace(coalesce(data->>'phone_number', data->>'phoneNumber', ''), '\D', '', 'g')))
  WHERE nullif(regexp_replace(coalesce(data->>'phone_number', data->>'phoneNumber', ''), '\D', '', 'g'), '') IS NOT NULL;

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

ALTER TABLE IF EXISTS public.payment_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.payment_confirmations ENABLE ROW LEVEL SECURITY;

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

ALTER TABLE IF EXISTS public.financial_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.financial_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.currency_rate_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.treasury_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.treasury_recommendations ENABLE ROW LEVEL SECURITY;

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

ALTER TABLE IF EXISTS public.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.global_profiles ENABLE ROW LEVEL SECURITY;

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
ALTER TABLE IF EXISTS public.idempotency_keys ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.telegram_update_dedupes (
  update_id TEXT PRIMARY KEY,
  chat_id TEXT,
  status TEXT NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'completed', 'failed')),
  response JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE IF EXISTS public.telegram_update_dedupes ENABLE ROW LEVEL SECURITY;

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
ALTER TABLE IF EXISTS public.short_links ENABLE ROW LEVEL SECURITY;

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
ALTER TABLE IF EXISTS public.onboarding_finalizations ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.logout_confirmations (
  id BIGSERIAL PRIMARY KEY,
  token_hash TEXT NOT NULL,
  session_id TEXT,
  user_id TEXT,
  provider TEXT,
  provider_user_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  used BOOLEAN NOT NULL DEFAULT FALSE,
  used_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_logout_confirmations_token_hash
  ON public.logout_confirmations (token_hash)
  WHERE token_hash IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_logout_confirmations_status
  ON public.logout_confirmations (status);
CREATE INDEX IF NOT EXISTS idx_logout_confirmations_used
  ON public.logout_confirmations (used);
CREATE INDEX IF NOT EXISTS idx_logout_confirmations_expires_at
  ON public.logout_confirmations (expires_at);
ALTER TABLE IF EXISTS public.logout_confirmations ENABLE ROW LEVEL SECURITY;

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
ALTER TABLE IF EXISTS public.receipt_images ENABLE ROW LEVEL SECURITY;

COMMIT;


-- ============================================================================
-- Consolidated source: 20260514_00_payment_logs_destination_name.sql
-- ============================================================================

-- Ensure payment log columns used by receipts, savings, and repeat-payment memory exist.
-- Keep this migration free of BEGIN/COMMIT so it can run through the Supabase exec_sql RPC.

CREATE TABLE IF NOT EXISTS public.payment_logs (
  id BIGSERIAL PRIMARY KEY,
  session_id UUID,
  user_id VARCHAR(255),
  source_public_key VARCHAR(56),
  destination_public_key VARCHAR(56),
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
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

ALTER TABLE IF EXISTS public.payment_logs
  ADD COLUMN IF NOT EXISTS destination_name VARCHAR(255),
  ADD COLUMN IF NOT EXISTS destination_contact JSONB,
  ADD COLUMN IF NOT EXISTS source_amount VARCHAR(50),
  ADD COLUMN IF NOT EXISTS source_asset_code VARCHAR(12),
  ADD COLUMN IF NOT EXISTS source_asset_issuer VARCHAR(56),
  ADD COLUMN IF NOT EXISTS destination_amount VARCHAR(50),
  ADD COLUMN IF NOT EXISTS destination_asset_code VARCHAR(12),
  ADD COLUMN IF NOT EXISTS destination_asset_issuer VARCHAR(56),
  ADD COLUMN IF NOT EXISTS fee_xlm VARCHAR(50),
  ADD COLUMN IF NOT EXISTS fee_usdc VARCHAR(50),
  ADD COLUMN IF NOT EXISTS fee_brl VARCHAR(50),
  ADD COLUMN IF NOT EXISTS payment_hash VARCHAR(255),
  ADD COLUMN IF NOT EXISTS operation_type VARCHAR(50),
  ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS error_message TEXT,
  ADD COLUMN IF NOT EXISTS route_path JSONB,
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS memo TEXT,
  ADD COLUMN IF NOT EXISTS estimated_traditional_fee NUMERIC,
  ADD COLUMN IF NOT EXISTS actual_fee NUMERIC,
  ADD COLUMN IF NOT EXISTS estimated_savings NUMERIC,
  ADD COLUMN IF NOT EXISTS savings_percentage NUMERIC,
  ADD COLUMN IF NOT EXISTS comparison_method TEXT,
  ADD COLUMN IF NOT EXISTS operation_fingerprint TEXT,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_payment_logs_destination_name
  ON public.payment_logs (user_id, destination_name)
  WHERE destination_name IS NOT NULL AND btrim(destination_name) <> '';

CREATE INDEX IF NOT EXISTS idx_payment_logs_user_memo_lower
  ON public.payment_logs (user_id, lower(memo))
  WHERE memo IS NOT NULL AND btrim(memo) <> '';

CREATE INDEX IF NOT EXISTS idx_payment_logs_user_completed_at
  ON public.payment_logs (user_id, completed_at DESC);

CREATE INDEX IF NOT EXISTS idx_payment_logs_operation_fingerprint
  ON public.payment_logs (operation_fingerprint)
  WHERE operation_fingerprint IS NOT NULL;



-- ============================================================================
-- Consolidated source: 20260514_01_external_bank_accounts.sql
-- ============================================================================

-- Persist one user-facing external bank destination per wallet/session for PIX off-ramp.
-- No transaction wrapper: this file is executed statement-by-statement through exec_sql.

CREATE TABLE IF NOT EXISTS public.external_bank_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL,
  user_id VARCHAR(255) NOT NULL,
  wallet_public_key VARCHAR(56) NOT NULL,
  label VARCHAR(120) NOT NULL DEFAULT 'Conta bancária externa TalkToStellar',
  institution VARCHAR(120) NOT NULL DEFAULT 'Banco externo vinculado',
  branch VARCHAR(20) NOT NULL,
  account_number VARCHAR(32) NOT NULL,
  pix_key VARCHAR(255) NOT NULL,
  rail VARCHAR(20) NOT NULL DEFAULT 'PIX',
  country VARCHAR(2) NOT NULL DEFAULT 'BR',
  currency VARCHAR(12) NOT NULL DEFAULT 'BRL',
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE IF EXISTS public.external_bank_accounts
  ADD COLUMN IF NOT EXISTS session_id UUID,
  ADD COLUMN IF NOT EXISTS user_id VARCHAR(255),
  ADD COLUMN IF NOT EXISTS wallet_public_key VARCHAR(56),
  ADD COLUMN IF NOT EXISTS label VARCHAR(120) NOT NULL DEFAULT 'Conta bancária externa TalkToStellar',
  ADD COLUMN IF NOT EXISTS institution VARCHAR(120) NOT NULL DEFAULT 'Banco externo vinculado',
  ADD COLUMN IF NOT EXISTS branch VARCHAR(20),
  ADD COLUMN IF NOT EXISTS account_number VARCHAR(32),
  ADD COLUMN IF NOT EXISTS pix_key VARCHAR(255),
  ADD COLUMN IF NOT EXISTS rail VARCHAR(20) NOT NULL DEFAULT 'PIX',
  ADD COLUMN IF NOT EXISTS country VARCHAR(2) NOT NULL DEFAULT 'BR',
  ADD COLUMN IF NOT EXISTS currency VARCHAR(12) NOT NULL DEFAULT 'BRL',
  ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS idx_external_bank_accounts_wallet_active
  ON public.external_bank_accounts (wallet_public_key)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_external_bank_accounts_session
  ON public.external_bank_accounts (session_id);

CREATE INDEX IF NOT EXISTS idx_external_bank_accounts_user
  ON public.external_bank_accounts (user_id);

ALTER TABLE IF EXISTS public.external_bank_accounts ENABLE ROW LEVEL SECURITY;



-- ============================================================================
-- Consolidated source: 20260515_00_email_confirmations.sql
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.email_confirmations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  purpose text NOT NULL,
  code_hash text NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT email_confirmations_purpose_check CHECK (purpose IN ('create_account', 'login'))
);

CREATE INDEX IF NOT EXISTS idx_email_confirmations_lookup
  ON public.email_confirmations (email, purpose, code_hash)
  WHERE used_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_email_confirmations_email_purpose_created
  ON public.email_confirmations (email, purpose, created_at DESC)
  WHERE used_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_email_confirmations_expires_at
  ON public.email_confirmations (expires_at);

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_email_confirmations_updated_at ON public.email_confirmations;
CREATE TRIGGER set_email_confirmations_updated_at
  BEFORE UPDATE ON public.email_confirmations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.email_confirmations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_manage_email_confirmations"
ON public.email_confirmations;

CREATE POLICY "service_role_manage_email_confirmations"
ON public.email_confirmations
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_confirmations TO service_role;


-- ============================================================================
-- Consolidated source: 20260614_00_early_access_signups.sql
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.early_access_signups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  status text NOT NULL DEFAULT 'subscribed',
  locale text NOT NULL DEFAULT 'pt-BR',
  source text NOT NULL DEFAULT 'landing-reluca',
  campaign text,
  referrer text,
  page_url text,
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  subscribed_at timestamptz NOT NULL DEFAULT now(),
  last_subscribed_at timestamptz NOT NULL DEFAULT now(),
  unsubscribed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT early_access_signups_email_lowercase_check CHECK (email = lower(email)),
  CONSTRAINT early_access_signups_email_format_check CHECK (email ~* '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'),
  CONSTRAINT early_access_signups_status_check CHECK (status IN ('subscribed', 'unsubscribed')),
  CONSTRAINT early_access_signups_locale_check CHECK (locale IN ('pt-BR', 'en'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_early_access_signups_email
  ON public.early_access_signups (email);

CREATE INDEX IF NOT EXISTS idx_early_access_signups_created
  ON public.early_access_signups (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_early_access_signups_status_created
  ON public.early_access_signups (status, created_at DESC);

DROP TRIGGER IF EXISTS set_early_access_signups_updated_at ON public.early_access_signups;
CREATE TRIGGER set_early_access_signups_updated_at
  BEFORE UPDATE ON public.early_access_signups
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.early_access_signups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_manage_early_access_signups"
ON public.early_access_signups;

CREATE POLICY "service_role_manage_early_access_signups"
ON public.early_access_signups
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

GRANT SELECT, INSERT, UPDATE, DELETE ON public.early_access_signups TO service_role;


-- ============================================================================
-- Consolidated source: 20260614_00_ops_admin_auth.sql
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.ops_admin_users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  login TEXT NOT NULL UNIQUE,
  display_name TEXT,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'admin',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  failed_attempts INTEGER NOT NULL DEFAULT 0,
  locked_until TIMESTAMPTZ,
  last_failed_at TIMESTAMPTZ,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT ops_admin_users_login_normalized_check CHECK (
    login = lower(btrim(login))
    AND length(login) BETWEEN 3 AND 254
  ),
  CONSTRAINT ops_admin_users_password_hash_format_check CHECK (
    position(':' in password_hash) > 1
  ),
  CONSTRAINT ops_admin_users_role_check CHECK (role IN ('admin')),
  CONSTRAINT ops_admin_users_failed_attempts_nonnegative CHECK (failed_attempts >= 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ops_admin_users_login_lower
  ON public.ops_admin_users ((lower(login)));

CREATE INDEX IF NOT EXISTS idx_ops_admin_users_active
  ON public.ops_admin_users (active)
  WHERE active = TRUE;

CREATE INDEX IF NOT EXISTS idx_ops_admin_users_locked_until
  ON public.ops_admin_users (locked_until)
  WHERE locked_until IS NOT NULL;

DROP TRIGGER IF EXISTS set_ops_admin_users_updated_at ON public.ops_admin_users;
CREATE TRIGGER set_ops_admin_users_updated_at
  BEFORE UPDATE ON public.ops_admin_users
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.ops_admin_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ops_admin_users FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_manage_ops_admin_users"
ON public.ops_admin_users;

CREATE POLICY "service_role_manage_ops_admin_users"
ON public.ops_admin_users
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

CREATE OR REPLACE FUNCTION public.upsert_ops_admin_user(
  p_login TEXT,
  p_password_hash TEXT,
  p_display_name TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
  v_login TEXT := lower(btrim(coalesce(p_login, '')));
  v_password_hash TEXT := btrim(coalesce(p_password_hash, ''));
BEGIN
  IF length(v_login) < 3 THEN
    RAISE EXCEPTION 'ops admin login is required';
  END IF;

  IF position(':' in v_password_hash) <= 1 THEN
    RAISE EXCEPTION 'ops admin password_hash must be generated by backend/scripts/hash-ops-admin-password.ts';
  END IF;

  INSERT INTO public.ops_admin_users (
    login,
    display_name,
    password_hash,
    role,
    active,
    failed_attempts,
    locked_until,
    last_failed_at
  )
  VALUES (
    v_login,
    nullif(btrim(coalesce(p_display_name, '')), ''),
    v_password_hash,
    'admin',
    TRUE,
    0,
    NULL,
    NULL
  )
  ON CONFLICT (login) DO UPDATE
  SET
    display_name = COALESCE(EXCLUDED.display_name, public.ops_admin_users.display_name),
    password_hash = EXCLUDED.password_hash,
    active = TRUE,
    failed_attempts = 0,
    locked_until = NULL,
    last_failed_at = NULL,
    updated_at = NOW()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_ops_admin_user(TEXT, TEXT, TEXT) FROM PUBLIC;
DO $$
DECLARE
  role_name text;
BEGIN
  FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated']
  LOOP
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
      EXECUTE format('REVOKE ALL ON FUNCTION public.upsert_ops_admin_user(TEXT, TEXT, TEXT) FROM %I', role_name);
    END IF;
  END LOOP;

  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT EXECUTE ON FUNCTION public.upsert_ops_admin_user(TEXT, TEXT, TEXT) TO service_role;
  END IF;
END $$;


-- ============================================================================
-- Consolidated source: 20260518_00_prepare_stellar_mainnet_infrastructure.sql
-- ============================================================================

-- TalkToStellar - preparacao isolada para Stellar Mainnet.
--
-- Esta migration e intencionalmente separada do runner migrate:required.
-- Ela apenas adiciona metadados de rede e uma tabela de perfis de rede para
-- evitar mistura futura entre dados Testnet e Mainnet. O runtime atual deve
-- continuar usando STELLAR_NETWORK=TESTNET.

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'stellar_network'
      AND n.nspname = 'public'
  ) THEN
    CREATE TYPE public.stellar_network AS ENUM ('TESTNET', 'PUBLIC');
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS public.stellar_network_configs (
  network public.stellar_network PRIMARY KEY,
  horizon_url TEXT NOT NULL,
  network_passphrase TEXT NOT NULL,
  friendbot_url TEXT,
  stellar_expert_url TEXT NOT NULL,
  active_runtime BOOLEAN NOT NULL DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.stellar_network_configs (
  network,
  horizon_url,
  network_passphrase,
  friendbot_url,
  stellar_expert_url,
  active_runtime,
  notes
)
VALUES
  (
    'TESTNET',
    'https://horizon-testnet.stellar.org',
    'Test SDF Network ; September 2015',
    'https://friendbot.stellar.org',
    'https://stellar.expert/explorer/testnet',
    true,
    'Rede ativa atual do produto.'
  ),
  (
    'PUBLIC',
    'https://horizon.stellar.org',
    'Public Global Stellar Network ; September 2015',
    NULL,
    'https://stellar.expert/explorer/public',
    false,
    'Perfil preparado para Mainnet. Nao ativar sem cutover aprovado.'
  )
ON CONFLICT (network) DO UPDATE SET
  horizon_url = EXCLUDED.horizon_url,
  network_passphrase = EXCLUDED.network_passphrase,
  friendbot_url = EXCLUDED.friendbot_url,
  stellar_expert_url = EXCLUDED.stellar_expert_url,
  notes = EXCLUDED.notes,
  updated_at = now();

ALTER TABLE IF EXISTS public.agent_sessions
  ADD COLUMN IF NOT EXISTS stellar_network public.stellar_network NOT NULL DEFAULT 'TESTNET';

ALTER TABLE IF EXISTS public.wallets
  ADD COLUMN IF NOT EXISTS stellar_network public.stellar_network NOT NULL DEFAULT 'TESTNET';

ALTER TABLE IF EXISTS public.operations
  ADD COLUMN IF NOT EXISTS stellar_network public.stellar_network NOT NULL DEFAULT 'TESTNET';

ALTER TABLE IF EXISTS public.contacts
  ADD COLUMN IF NOT EXISTS stellar_network public.stellar_network NOT NULL DEFAULT 'TESTNET';

ALTER TABLE IF EXISTS public.external_accounts
  ADD COLUMN IF NOT EXISTS stellar_network public.stellar_network NOT NULL DEFAULT 'TESTNET';

ALTER TABLE IF EXISTS public.payment_logs
  ADD COLUMN IF NOT EXISTS stellar_network public.stellar_network NOT NULL DEFAULT 'TESTNET';

ALTER TABLE IF EXISTS public.payment_confirmations
  ADD COLUMN IF NOT EXISTS stellar_network public.stellar_network NOT NULL DEFAULT 'TESTNET';

DO $$
BEGIN
  IF to_regclass('public.agent_sessions') IS NOT NULL THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_agent_sessions_stellar_network ON public.agent_sessions (stellar_network)';
  END IF;

  IF to_regclass('public.wallets') IS NOT NULL THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_wallets_stellar_network ON public.wallets (stellar_network)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_wallets_network_public_key ON public.wallets (stellar_network, public_key)';
  END IF;

  IF to_regclass('public.operations') IS NOT NULL THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_operations_stellar_network ON public.operations (stellar_network)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_operations_network_created_at ON public.operations (stellar_network, created_at DESC)';
  END IF;

  IF to_regclass('public.contacts') IS NOT NULL THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_contacts_stellar_network ON public.contacts (stellar_network)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_contacts_network_owner ON public.contacts (stellar_network, owner_id)';
  END IF;

  IF to_regclass('public.external_accounts') IS NOT NULL THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_external_accounts_stellar_network ON public.external_accounts (stellar_network)';
  END IF;

  IF to_regclass('public.payment_logs') IS NOT NULL THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_payment_logs_stellar_network ON public.payment_logs (stellar_network)';
  END IF;

  IF to_regclass('public.payment_confirmations') IS NOT NULL THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_payment_confirmations_stellar_network ON public.payment_confirmations (stellar_network)';
  END IF;
END
$$;

COMMIT;


-- ============================================================================
-- Consolidated source: 20260520_00_international_usd_transfers.sql
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.international_transfer_quotes (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  institution_id TEXT,
  source_currency TEXT NOT NULL DEFAULT 'BRL',
  destination_currency TEXT NOT NULL DEFAULT 'USD',
  brl_amount NUMERIC NOT NULL,
  estimated_usdc_amount NUMERIC NOT NULL,
  estimated_usd_amount NUMERIC NOT NULL,
  fx_rate NUMERIC NOT NULL,
  platform_fee JSONB NOT NULL DEFAULT '{}'::jsonb,
  estimated_provider_fee JSONB NOT NULL DEFAULT '{}'::jsonb,
  total_fee JSONB NOT NULL DEFAULT '{}'::jsonb,
  quote_status TEXT NOT NULL DEFAULT 'ACTIVE',
  quote_source TEXT NOT NULL DEFAULT 'stellar_pathfinding',
  expires_at TIMESTAMPTZ NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.international_transfers (
  id TEXT PRIMARY KEY,
  quote_id TEXT NOT NULL REFERENCES public.international_transfer_quotes(id),
  status TEXT NOT NULL DEFAULT 'QUOTE_CREATED',
  user_id TEXT,
  institution_id TEXT,
  sender_identity JSONB NOT NULL DEFAULT '{}'::jsonb,
  recipient_identity JSONB NOT NULL DEFAULT '{}'::jsonb,
  brl_amount NUMERIC NOT NULL,
  quoted_usd_amount NUMERIC NOT NULL,
  fx_rate NUMERIC NOT NULL,
  fees JSONB NOT NULL DEFAULT '{}'::jsonb,
  stellar_asset_code TEXT NOT NULL DEFAULT 'USDC',
  stellar_asset_issuer TEXT,
  stellar_tx_hash TEXT,
  stellar_memo TEXT,
  stellar_source_account TEXT,
  stellar_destination_account TEXT,
  payout_provider TEXT,
  payout_destination JSONB NOT NULL DEFAULT '{}'::jsonb,
  payout_instruction_id TEXT,
  provider_payout_id TEXT,
  payout_status TEXT,
  pix_payment_id TEXT,
  pix_order_id TEXT,
  pix_status TEXT,
  same_name_payout_required BOOLEAN NOT NULL DEFAULT true,
  same_name_match_status TEXT NOT NULL DEFAULT 'UNKNOWN',
  identity_risk_notes TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  reconciliation_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_logs JSONB NOT NULL DEFAULT '[]'::jsonb,
  pix_received_at TIMESTAMPTZ,
  stellar_settled_at TIMESTAMPTZ,
  payout_completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.international_transfer_reconciliations (
  transfer_id TEXT PRIMARY KEY REFERENCES public.international_transfers(id) ON DELETE CASCADE,
  quote_id TEXT NOT NULL REFERENCES public.international_transfer_quotes(id),
  pix_payment_id TEXT,
  pix_order_id TEXT,
  stellar_tx_hash TEXT,
  stellar_memo TEXT,
  payout_instruction_id TEXT,
  provider_payout_id TEXT,
  final_payout_status TEXT,
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_international_transfer_quotes_user
  ON public.international_transfer_quotes (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_international_transfers_user
  ON public.international_transfers (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_international_transfers_status
  ON public.international_transfers (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_international_transfers_pix_order
  ON public.international_transfers (pix_order_id)
  WHERE pix_order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_international_transfers_stellar_hash
  ON public.international_transfers (stellar_tx_hash)
  WHERE stellar_tx_hash IS NOT NULL;

ALTER TABLE IF EXISTS public.international_transfer_quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.international_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.international_transfer_reconciliations ENABLE ROW LEVEL SECURITY;


-- ============================================================================
-- Consolidated source: 20260521_00_user_mainnet_wallets.sql
-- ============================================================================

-- User-scoped Stellar Mainnet wallet infrastructure.
-- This keeps Mainnet separate from the existing testnet wallet table so the
-- current product runtime can remain testnet-first.

CREATE TABLE IF NOT EXISTS public.stellar_mainnet_wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.agent_sessions(session_id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  public_key TEXT NOT NULL CHECK (public_key ~ '^G[A-Z2-7]{55}$'),
  label TEXT NOT NULL DEFAULT 'Mainnet wallet',
  wallet_kind TEXT NOT NULL DEFAULT 'external_public_key'
    CHECK (wallet_kind IN ('external_public_key')),
  is_primary BOOLEAN NOT NULL DEFAULT true,
  last_synced_at TIMESTAMPTZ,
  last_balance JSONB NOT NULL DEFAULT '[]'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (session_id, public_key)
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_stellar_mainnet_wallets_primary_session
  ON public.stellar_mainnet_wallets (session_id)
  WHERE is_primary;

CREATE INDEX IF NOT EXISTS idx_stellar_mainnet_wallets_user_id
  ON public.stellar_mainnet_wallets (user_id);

CREATE INDEX IF NOT EXISTS idx_stellar_mainnet_wallets_public_key
  ON public.stellar_mainnet_wallets (public_key);

CREATE OR REPLACE FUNCTION public.tts_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_stellar_mainnet_wallets_updated_at
  ON public.stellar_mainnet_wallets;

CREATE TRIGGER trg_stellar_mainnet_wallets_updated_at
BEFORE UPDATE ON public.stellar_mainnet_wallets
FOR EACH ROW
EXECUTE FUNCTION public.tts_touch_updated_at();

ALTER TABLE public.stellar_mainnet_wallets ENABLE ROW LEVEL SECURITY;



-- ============================================================================
-- Consolidated source: 20260523_01_agent_messages_intro_dedupe.sql
-- ============================================================================

-- Prevent duplicate assistant messages when login completion and chat hydration
-- both try to create the first session guidance at the same time.
ALTER TABLE IF EXISTS public.agent_messages
  ADD COLUMN IF NOT EXISTS dedupe_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS ux_agent_messages_dedupe_key
  ON public.agent_messages (dedupe_key)
  WHERE dedupe_key IS NOT NULL;


-- ============================================================================
-- Consolidated source: 20260523_01_payment_logs_operation_fingerprint_unique.sql
-- ============================================================================

-- Required for payment_logs upsert(onConflict: operation_fingerprint).
-- Without this unique index, successful payments can complete on-chain but fail to persist
-- the real fee/hash metadata used by receipts and savings summaries.

CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_logs_operation_fingerprint_unique
  ON public.payment_logs (operation_fingerprint)
  WHERE operation_fingerprint IS NOT NULL;


-- ============================================================================
-- Consolidated source: 20260525_00_passkey_smart_accounts.sql
-- ============================================================================

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


-- ============================================================================
-- Consolidated source: 20260527_00_external_identity_indexes_sanitized.sql
-- ============================================================================

-- Recreate external identity unique indexes so empty/invalid identity values
-- do not collide, and alias rows do not duplicate phone/email/CPF identities.

DO $$
BEGIN
  IF to_regclass('public.external_accounts') IS NOT NULL THEN
    -- Remove blank normalized identity values before creating partial indexes.
    UPDATE public.external_accounts
      SET data = coalesce(data, '{}'::jsonb) - 'phone_number' - 'phoneNumber',
          updated_at = now()
      WHERE nullif(regexp_replace(coalesce(data->>'phone_number', data->>'phoneNumber', ''), '\D', '', 'g'), '') IS NULL
        AND (
          coalesce(data->>'phone_number', '') <> ''
          OR coalesce(data->>'phoneNumber', '') <> ''
        );

    UPDATE public.external_accounts
      SET data = coalesce(data, '{}'::jsonb) - 'cpf',
          updated_at = now()
      WHERE nullif(regexp_replace(coalesce(data->>'cpf', ''), '\D', '', 'g'), '') IS NULL
        AND coalesce(data->>'cpf', '') <> '';

    UPDATE public.external_accounts
      SET data = coalesce(data, '{}'::jsonb) - 'email',
          updated_at = now()
      WHERE nullif(lower(btrim(coalesce(data->>'email', ''))), '') IS NULL
        AND coalesce(data->>'email', '') <> '';

    -- If legacy alias rows duplicated an identity value, keep it only on the
    -- newest row. Provider/provider_user_id still links all aliases.
    WITH ranked_phone AS (
      SELECT
        id,
        row_number() OVER (
          PARTITION BY regexp_replace(coalesce(data->>'phone_number', data->>'phoneNumber', ''), '\D', '', 'g')
          ORDER BY coalesce(updated_at, created_at, now()) DESC, id DESC
        ) AS rn
      FROM public.external_accounts
      WHERE nullif(regexp_replace(coalesce(data->>'phone_number', data->>'phoneNumber', ''), '\D', '', 'g'), '') IS NOT NULL
    )
    UPDATE public.external_accounts ea
      SET data = coalesce(ea.data, '{}'::jsonb) - 'phone_number' - 'phoneNumber' - 'whatsapp_number' - 'whatsappNumber',
          updated_at = now()
      FROM ranked_phone r
      WHERE ea.id = r.id
        AND r.rn > 1;

    WITH ranked_email AS (
      SELECT
        id,
        row_number() OVER (
          PARTITION BY lower(btrim(coalesce(data->>'email', '')))
          ORDER BY coalesce(updated_at, created_at, now()) DESC, id DESC
        ) AS rn
      FROM public.external_accounts
      WHERE nullif(lower(btrim(coalesce(data->>'email', ''))), '') IS NOT NULL
    )
    UPDATE public.external_accounts ea
      SET data = coalesce(ea.data, '{}'::jsonb) - 'email',
          updated_at = now()
      FROM ranked_email r
      WHERE ea.id = r.id
        AND r.rn > 1;

    WITH ranked_cpf AS (
      SELECT
        id,
        row_number() OVER (
          PARTITION BY regexp_replace(coalesce(data->>'cpf', ''), '\D', '', 'g')
          ORDER BY coalesce(updated_at, created_at, now()) DESC, id DESC
        ) AS rn
      FROM public.external_accounts
      WHERE nullif(regexp_replace(coalesce(data->>'cpf', ''), '\D', '', 'g'), '') IS NOT NULL
    )
    UPDATE public.external_accounts ea
      SET data = coalesce(ea.data, '{}'::jsonb) - 'cpf',
          updated_at = now()
      FROM ranked_cpf r
      WHERE ea.id = r.id
        AND r.rn > 1;
  END IF;
END $$;

DROP INDEX IF EXISTS public.idx_external_accounts_data_email_lower_unique;
DROP INDEX IF EXISTS public.idx_external_accounts_data_phone_unique;
DROP INDEX IF EXISTS public.idx_external_accounts_data_cpf_unique;

DO $$
BEGIN
  IF to_regclass('public.external_accounts') IS NOT NULL THEN
    CREATE UNIQUE INDEX IF NOT EXISTS idx_external_accounts_data_email_lower_unique
      ON public.external_accounts ((lower(btrim(coalesce(data->>'email', '')))))
      WHERE nullif(lower(btrim(coalesce(data->>'email', ''))), '') IS NOT NULL;

    CREATE UNIQUE INDEX IF NOT EXISTS idx_external_accounts_data_phone_unique
      ON public.external_accounts ((regexp_replace(coalesce(data->>'phone_number', data->>'phoneNumber', ''), '\D', '', 'g')))
      WHERE nullif(regexp_replace(coalesce(data->>'phone_number', data->>'phoneNumber', ''), '\D', '', 'g'), '') IS NOT NULL;

    CREATE UNIQUE INDEX IF NOT EXISTS idx_external_accounts_data_cpf_unique
      ON public.external_accounts ((regexp_replace(coalesce(data->>'cpf', ''), '\D', '', 'g')))
      WHERE nullif(regexp_replace(coalesce(data->>'cpf', ''), '\D', '', 'g'), '') IS NOT NULL;
  END IF;
END $$;


-- ============================================================================
-- Consolidated source: 20260602_00_legacy_email_verification_backfill.sql
-- ============================================================================

  -- Marks accounts created before the email-verification rollout as already verified.
  -- Cutoff captured when this migration was authored:
  --   2026-06-02T15:52:09Z / 2026-06-02 12:52:09 America/Sao_Paulo
  --
  -- Newer accounts still need the normal e-mail confirmation code.

  ALTER TABLE IF EXISTS public.agent_sessions
    ADD COLUMN IF NOT EXISTS email_verified boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS email_verified_at timestamptz,
    ADD COLUMN IF NOT EXISTS email_verification_source text;

  UPDATE public.agent_sessions
  SET
    email_verified = true,
    email_verified_at = COALESCE(email_verified_at, TIMESTAMPTZ '2026-06-02T15:52:09Z'),
    email_verification_source = COALESCE(NULLIF(email_verification_source, ''), 'legacy_backfill_20260602'),
    updated_at = now()
  WHERE created_at < TIMESTAMPTZ '2026-06-02T15:52:09Z'
    AND email_verified IS DISTINCT FROM true
    AND (
      btrim(coalesce(email, '')) <> ''
      OR btrim(coalesce(user_id, '')) <> ''
    );

  CREATE INDEX IF NOT EXISTS idx_agent_sessions_email_verified
    ON public.agent_sessions (email_verified, email_verified_at);

  CREATE INDEX IF NOT EXISTS idx_agent_sessions_verified_email_lower
    ON public.agent_sessions ((lower(email)))
    WHERE email_verified = true
      AND email IS NOT NULL
      AND btrim(email) <> '';


-- ============================================================================
-- Consolidated source: 20260602_01_legacy_email_verification_null_created_backfill.sql
-- ============================================================================

-- Completes the legacy e-mail verification backfill for old rows that may have
-- a missing created_at value or were skipped by the first cutoff-only migration.
--
-- Cutoff captured when this corrective migration was last updated:
--   2026-06-02T16:40:00Z / 2026-06-02 13:40:00 America/Sao_Paulo

ALTER TABLE IF EXISTS public.agent_sessions
  ADD COLUMN IF NOT EXISTS email_verified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS email_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS email_verification_source text;

UPDATE public.agent_sessions
SET
  email_verified = true,
  email_verified_at = COALESCE(email_verified_at, TIMESTAMPTZ '2026-06-02T16:40:00Z'),
  email_verification_source = COALESCE(NULLIF(email_verification_source, ''), 'legacy_backfill_20260602_null_created'),
  updated_at = now()
WHERE email_verified IS DISTINCT FROM true
  AND (
    created_at IS NULL
    OR created_at < TIMESTAMPTZ '2026-06-02T16:40:00Z'
  )
  AND (
    btrim(coalesce(email, '')) <> ''
    OR btrim(coalesce(user_id, '')) <> ''
  );

UPDATE public.agent_sessions s
SET
  email_verified = true,
  email_verified_at = COALESCE(s.email_verified_at, TIMESTAMPTZ '2026-06-02T16:40:00Z'),
  email_verification_source = COALESCE(NULLIF(s.email_verification_source, ''), 'legacy_backfill_20260602_external_channel'),
  updated_at = now()
FROM public.external_accounts ea
WHERE s.email_verified IS DISTINCT FROM true
  AND ea.session_id IS NOT NULL
  AND ea.session_id::text = s.session_id::text
  AND lower(btrim(coalesce(ea.provider, ''))) IN ('whatsapp', 'phone', 'telegram', 'evolution', 'whatsapp_evolution')
  AND (
    ea.created_at IS NULL
    OR ea.created_at < TIMESTAMPTZ '2026-06-02T16:40:00Z'
  )
  AND (
    btrim(coalesce(s.email, '')) <> ''
    OR btrim(coalesce(s.user_id, '')) <> ''
  );

CREATE INDEX IF NOT EXISTS idx_agent_sessions_verified_user_id_lower
  ON public.agent_sessions ((lower(user_id)))
  WHERE email_verified = true
    AND user_id IS NOT NULL
    AND btrim(user_id) <> '';


-- ============================================================================
-- Consolidated source: 20260602_02_passkey_login_pairing_codes.sql
-- ============================================================================

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


-- ============================================================================
-- Consolidated source: 20260602_03_user_research_evidence.sql
-- ============================================================================

-- Real-user evidence log for Stellar Village / Instawards review material.
--
-- This table records observed product sessions and literal feedback from real
-- users. It must not be populated with generated or simulated users.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.user_research_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID,
  user_id TEXT,
  email TEXT,
  channel TEXT NOT NULL DEFAULT 'web',
  event_name TEXT NOT NULL,
  event_group TEXT,
  task_label TEXT,
  status TEXT NOT NULL DEFAULT 'observed',
  feedback_text TEXT,
  evidence_url TEXT,
  evidence_type TEXT,
  page_url TEXT,
  route TEXT,
  operation_id TEXT,
  transaction_hash TEXT,
  stellar_network TEXT NOT NULL DEFAULT 'UNKNOWN',
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  dedupe_key TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_research_events_user_time
  ON public.user_research_events (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_research_events_session_time
  ON public.user_research_events (session_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_research_events_network_time
  ON public.user_research_events (stellar_network, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_research_events_channel_time
  ON public.user_research_events (channel, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_research_events_event_name
  ON public.user_research_events (event_name);

CREATE INDEX IF NOT EXISTS idx_user_research_events_status
  ON public.user_research_events (status);

CREATE INDEX IF NOT EXISTS idx_user_research_events_metadata_gin
  ON public.user_research_events USING GIN (metadata_json);

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_research_events_dedupe_key_unique
  ON public.user_research_events (dedupe_key)
  WHERE dedupe_key IS NOT NULL;

CREATE OR REPLACE FUNCTION public.set_user_research_events_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_user_research_events_updated_at ON public.user_research_events;
CREATE TRIGGER trg_user_research_events_updated_at
BEFORE UPDATE ON public.user_research_events
FOR EACH ROW
EXECUTE FUNCTION public.set_user_research_events_updated_at();

ALTER TABLE IF EXISTS public.user_research_events ENABLE ROW LEVEL SECURITY;

COMMIT;


-- ============================================================================
-- Consolidated source: 20260603_00_deprecate_legacy_brl_usdc_trust_assets.sql
-- ============================================================================

-- PIX settles reais as TESOURO. Legacy BRL issuances and old testnet USDC
-- seeds must not be treated as default trusted assets for new trustlines.

UPDATE whitelisted_assets
SET trusted = false
WHERE asset_code IN ('BRL', 'USDT', 'CNY')
   OR (asset_code = 'USDC' AND asset_issuer IN (
     'GBBD47UZQ2BNTO32V36DP7RQ75P463MCFC7RQVZGVZBULXE72DYOJJL',
     'GBBD47UZQ5PBC7BY76I3PN4RYSEE3U2IRVIB42IXLKNVGIZCMARVEL6'
   ));

INSERT INTO whitelisted_assets (asset_code, asset_issuer, trusted)
VALUES ('TESOURO', 'GC3CW7EDYRTWQ635VDIGY6S4ZUF5L6TQ7AA4MWS7LEQDBLUSZXV7UPS4', true)
ON CONFLICT (asset_code) DO UPDATE
SET asset_issuer = EXCLUDED.asset_issuer,
    trusted = true;


-- ============================================================================
-- Consolidated source: 20260605_00_agent_session_language_preference.sql
-- ============================================================================

ALTER TABLE IF EXISTS public.agent_sessions
ADD COLUMN IF NOT EXISTS language TEXT;

ALTER TABLE IF EXISTS public.agent_sessions
ADD COLUMN IF NOT EXISTS preferred_language TEXT;

CREATE INDEX IF NOT EXISTS idx_agent_sessions_preferred_language
ON public.agent_sessions(preferred_language);


-- ============================================================================
-- Consolidated source: 20260605_01_allow_channel_scoped_phone_reuse.sql
-- ============================================================================

-- Phone numbers are channel-scoped identifiers. The same phone can exist on a
-- regular web account and on a WhatsApp account; provider/provider_user_id is
-- the uniqueness boundary for channel ownership.
DROP INDEX IF EXISTS public.idx_agent_sessions_phone_unique;
DROP INDEX IF EXISTS public.idx_external_accounts_data_phone_unique;

CREATE INDEX IF NOT EXISTS idx_agent_sessions_phone_lookup
  ON public.agent_sessions (phone_number)
  WHERE phone_number IS NOT NULL AND btrim(phone_number) <> '';

CREATE INDEX IF NOT EXISTS idx_external_accounts_data_phone_lookup
  ON public.external_accounts ((regexp_replace(coalesce(data->>'phone_number', data->>'phoneNumber', ''), '\D', '', 'g')))
  WHERE nullif(regexp_replace(coalesce(data->>'phone_number', data->>'phoneNumber', ''), '\D', '', 'g'), '') IS NOT NULL;


-- ============================================================================
-- Consolidated source: 20260606_00_usd_payout_coordination.sql
-- ============================================================================

-- Week 2: provider-agnostic USD payout coordination evidence and event history.

CREATE TABLE IF NOT EXISTS public.international_payout_instructions (
  id TEXT PRIMARY KEY,
  transfer_id TEXT NOT NULL REFERENCES public.international_transfers(id) ON DELETE CASCADE,
  provider_name TEXT NOT NULL,
  provider_payout_id TEXT NOT NULL,
  status TEXT NOT NULL,
  execution_mode TEXT NOT NULL,
  amount_usd NUMERIC NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  destination_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  settlement_evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  provider_request JSONB NOT NULL DEFAULT '{}'::jsonb,
  provider_response JSONB NOT NULL DEFAULT '{}'::jsonb,
  status_history JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_international_payout_instruction_transfer
  ON public.international_payout_instructions (transfer_id);

CREATE UNIQUE INDEX IF NOT EXISTS ux_international_payout_provider_reference
  ON public.international_payout_instructions (provider_name, provider_payout_id);

CREATE INDEX IF NOT EXISTS idx_international_payout_instruction_status
  ON public.international_payout_instructions (status, updated_at DESC);

CREATE TABLE IF NOT EXISTS public.international_payout_events (
  id TEXT PRIMARY KEY,
  transfer_id TEXT NOT NULL REFERENCES public.international_transfers(id) ON DELETE CASCADE,
  payout_instruction_id TEXT NOT NULL REFERENCES public.international_payout_instructions(id) ON DELETE CASCADE,
  provider_name TEXT NOT NULL,
  provider_event_id TEXT NOT NULL,
  provider_payout_id TEXT NOT NULL,
  status TEXT NOT NULL,
  event_type TEXT,
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_international_payout_provider_event
  ON public.international_payout_events (provider_name, provider_event_id);

CREATE INDEX IF NOT EXISTS idx_international_payout_events_transfer
  ON public.international_payout_events (transfer_id, occurred_at DESC);

ALTER TABLE IF EXISTS public.international_payout_instructions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.international_payout_events ENABLE ROW LEVEL SECURITY;


-- ============================================================================
-- Consolidated source: 20260606_01_usd_payout_coordination_hardening.sql
-- ============================================================================

-- Week 2 hardening: enforce payout coordination invariants at the database boundary.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ck_international_payout_instruction_provider'
  ) THEN
    ALTER TABLE public.international_payout_instructions
      ADD CONSTRAINT ck_international_payout_instruction_provider
      CHECK (provider_name IN ('mock', 'etherfuse', 'circle', 'bridge')) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ck_international_payout_instruction_status'
  ) THEN
    ALTER TABLE public.international_payout_instructions
      ADD CONSTRAINT ck_international_payout_instruction_status
      CHECK (status IN ('instruction_created', 'pending', 'completed', 'failed', 'cancelled')) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ck_international_payout_instruction_mode'
  ) THEN
    ALTER TABLE public.international_payout_instructions
      ADD CONSTRAINT ck_international_payout_instruction_mode
      CHECK (execution_mode IN ('mock', 'proof', 'compatibility', 'sandbox_api', 'live_api', 'wise_metadata_only')) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ck_international_payout_instruction_amount'
  ) THEN
    ALTER TABLE public.international_payout_instructions
      ADD CONSTRAINT ck_international_payout_instruction_amount
      CHECK (amount_usd > 0 AND currency = 'USD') NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ck_international_payout_event_provider'
  ) THEN
    ALTER TABLE public.international_payout_events
      ADD CONSTRAINT ck_international_payout_event_provider
      CHECK (provider_name IN ('mock', 'etherfuse', 'circle', 'bridge')) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ck_international_payout_event_status'
  ) THEN
    ALTER TABLE public.international_payout_events
      ADD CONSTRAINT ck_international_payout_event_status
      CHECK (status IN ('instruction_created', 'pending', 'completed', 'failed', 'cancelled')) NOT VALID;
  END IF;
END $$;

COMMENT ON TABLE public.international_payout_instructions IS
  'Service-role-only USD payout coordination records. Provider request and response fields must remain redacted.';

COMMENT ON TABLE public.international_payout_events IS
  'Idempotent normalized payout provider events. Raw secrets and full bank details must not be stored.';


-- ============================================================================
-- Consolidated source: 20260606_03_amount_privacy_preference.sql
-- ============================================================================

-- Persist the user's preference for hiding monetary values in chat/receipt output.
-- Exact values remain stored in ledger/accounting tables for reconciliation.
ALTER TABLE IF EXISTS agent_sessions
  ADD COLUMN IF NOT EXISTS hide_amounts BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_agent_sessions_hide_amounts
  ON agent_sessions (hide_amounts);


-- ============================================================================
-- Consolidated source: 20260606_04_evolution_outbound_queue.sql
-- ============================================================================

-- Durable retry queue for WhatsApp messages generated after an Evolution webhook.
-- The inbound webhook is deduped separately; this table preserves the exact
-- outbound text so retries do not re-run the agent or create a different reply.
CREATE TABLE IF NOT EXISTS evolution_outbound_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dedupe_key TEXT NOT NULL UNIQUE,
  provider TEXT NOT NULL DEFAULT 'whatsapp',
  instance TEXT NOT NULL,
  recipient TEXT NOT NULL,
  remote_jid TEXT,
  message_id TEXT,
  text TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sending', 'sent', 'failed', 'dead_letter')),
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 8,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  locked_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  last_error TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_evolution_outbound_queue_due
  ON evolution_outbound_queue (status, next_attempt_at)
  WHERE status IN ('pending', 'failed');

CREATE INDEX IF NOT EXISTS idx_evolution_outbound_queue_recipient
  ON evolution_outbound_queue (recipient, created_at DESC);


-- ============================================================================
-- Consolidated source: 20260607_00_evolution_inbound_queue.sql
-- ============================================================================

-- Durable inbound queue for Evolution WhatsApp webhooks.
-- This lets the public webhook acknowledge Evolution quickly while the agent
-- request and outbound WhatsApp send run in a retryable background worker.
CREATE TABLE IF NOT EXISTS evolution_inbound_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dedupe_key TEXT NOT NULL UNIQUE,
  provider TEXT NOT NULL DEFAULT 'whatsapp',
  instance TEXT NOT NULL,
  recipient TEXT NOT NULL,
  remote_jid TEXT NOT NULL,
  message_id TEXT,
  text_hash TEXT NOT NULL,
  payload JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'dead_letter')),
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  locked_at TIMESTAMPTZ,
  processed_at TIMESTAMPTZ,
  last_error TEXT,
  result JSONB,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_evolution_inbound_queue_due
  ON evolution_inbound_queue (status, next_attempt_at)
  WHERE status IN ('pending', 'failed');

CREATE INDEX IF NOT EXISTS idx_evolution_inbound_queue_recipient
  ON evolution_inbound_queue (recipient, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_evolution_inbound_queue_message
  ON evolution_inbound_queue (instance, remote_jid, message_id);


-- ============================================================================
-- Consolidated source: 20260607_01_agent_session_login_passwords.sql
-- ============================================================================

-- Login password state for account login.
-- Existing users keep PIN login through application fallback until they define
-- a login password; this migration only stores the new password/lockout state.
ALTER TABLE IF EXISTS public.agent_sessions
  ADD COLUMN IF NOT EXISTS login_password_hash TEXT,
  ADD COLUMN IF NOT EXISTS login_failed_attempts INTEGER,
  ADD COLUMN IF NOT EXISTS login_locked_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS login_last_failed_at TIMESTAMPTZ;

ALTER TABLE IF EXISTS public.agent_sessions
  ALTER COLUMN login_failed_attempts SET DEFAULT 0;

UPDATE public.agent_sessions
SET login_failed_attempts = 0
WHERE login_failed_attempts IS NULL;

ALTER TABLE IF EXISTS public.agent_sessions
  ALTER COLUMN login_failed_attempts SET NOT NULL;

DO $$
BEGIN
  IF to_regclass('public.agent_sessions') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conrelid = 'public.agent_sessions'::regclass
         AND conname = 'agent_sessions_login_failed_attempts_nonnegative'
     ) THEN
    ALTER TABLE public.agent_sessions
      ADD CONSTRAINT agent_sessions_login_failed_attempts_nonnegative
      CHECK (login_failed_attempts >= 0) NOT VALID;
  END IF;

  IF to_regclass('public.agent_sessions') IS NOT NULL THEN
    ALTER TABLE public.agent_sessions
      VALIDATE CONSTRAINT agent_sessions_login_failed_attempts_nonnegative;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_agent_sessions_login_locked_until
  ON public.agent_sessions (login_locked_until)
  WHERE login_locked_until IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_agent_sessions_login_failed_attempts
  ON public.agent_sessions (login_failed_attempts)
  WHERE login_failed_attempts > 0;

COMMENT ON COLUMN public.agent_sessions.login_password_hash IS
  'Hash used for email/password login. Legacy users can still fall back to PIN until this is set.';
COMMENT ON COLUMN public.agent_sessions.login_failed_attempts IS
  'Consecutive failed email/password login attempts.';
COMMENT ON COLUMN public.agent_sessions.login_locked_until IS
  'Temporary account login lock expiration after repeated failed password attempts.';
COMMENT ON COLUMN public.agent_sessions.login_last_failed_at IS
  'Timestamp of the latest failed email/password login attempt.';


-- ============================================================================
-- Consolidated source: 20260609_bridge_pix_ach_orders.sql
-- ============================================================================

-- bridge_pix_ach_orders: Tracks PIX → USDC → ACH atomic flow states
CREATE TABLE IF NOT EXISTS public.bridge_pix_ach_orders (
  id UUID PRIMARY KEY,
  session_id TEXT,
  user_id TEXT,
  bridge_customer_id TEXT,
  stellar_address TEXT,
  external_account_id TEXT,
  amount_usd TEXT NOT NULL,
  estimated_brl TEXT,
  state TEXT NOT NULL DEFAULT 'awaiting_pix'
    CHECK (state IN ('awaiting_pix', 'pix_received', 'converting_ach', 'completed', 'failed', 'expired')),
  pix_virtual_account_id TEXT,
  pix_key TEXT,
  ach_transfer_id TEXT,
  receipt_url TEXT,
  error_message TEXT,
  developer_fee_usd TEXT,
  bridge_fee_usd TEXT,
  net_amount_usd TEXT,
  destination_bank_last4 TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bridge_pix_ach_orders_session
  ON public.bridge_pix_ach_orders(session_id);
CREATE INDEX IF NOT EXISTS idx_bridge_pix_ach_orders_va
  ON public.bridge_pix_ach_orders(pix_virtual_account_id);
CREATE INDEX IF NOT EXISTS idx_bridge_pix_ach_orders_transfer
  ON public.bridge_pix_ach_orders(ach_transfer_id);


-- ============================================================================
-- Consolidated source: 20260611_00_transfers.sql
-- ============================================================================

-- Migration: transfers table
-- Purpose: Core transfer lifecycle table for the PIX-to-Stellar orchestration engine
-- Direction: up

do $$
begin
  create type transfer_state as enum (
    'CREATED',
    'QUOTED',
    'PIX_CHARGE_ISSUED',
    'PIX_FUNDED',
    'CONVERTING',
    'STELLAR_SETTLED',
    'PAYOUT_ROUTING',
    'PAYOUT_INSTRUCTED',
    'RECONCILED',
    'QUOTE_EXPIRED',
    'PIX_EXPIRED',
    'FAILED',
    'REFUND_REQUIRED'
  );
exception
  when duplicate_object then null;
end $$;

create sequence if not exists transfer_public_ref_seq as bigint start with 1 increment by 1;

create or replace function generate_transfer_public_ref()
returns text
language sql
as $$
  select 'TTS-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('transfer_public_ref_seq')::text, 6, '0');
$$;

create table if not exists transfers (
  id              uuid primary key default gen_random_uuid(),
  public_ref      text not null unique default generate_transfer_public_ref(),
  state           transfer_state not null default 'CREATED',
  state_version   integer not null default 1,

  -- Endpoints (routing metadata)
  source_endpoint       jsonb,
  destination_endpoint  jsonb,

  -- Amounts are stored as decimal strings. Application code must not use floats.
  amount_brl_in            text,
  amount_usdc_settled      text,
  amount_usd_out_expected  text,

  -- Quote snapshot
  quote  jsonb,

  -- PIX intake evidence
  pix  jsonb,

  -- Stellar settlement evidence
  stellar  jsonb,

  -- Payout routing evidence
  payout  jsonb,

  -- Reconciliation evidence
  reconciliation  jsonb,

  -- Link to existing international_transfers when driven by that flow
  legacy_transfer_id  text,

  -- Actor that created this transfer
  actor  jsonb default '{}',

  -- Failure tracking
  failure_reason  text,

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table transfers
  alter column public_ref set default generate_transfer_public_ref();

create index if not exists idx_transfers_state on transfers(state);
create index if not exists idx_transfers_public_ref on transfers(public_ref);
create index if not exists idx_transfers_legacy on transfers(legacy_transfer_id);
create index if not exists idx_transfers_created_at on transfers(created_at desc);
create index if not exists idx_transfers_pix_charge_id on transfers ((pix->>'charge_id'));
create index if not exists idx_transfers_pix_e2e_id on transfers ((pix->>'e2e_id'));
create index if not exists idx_transfers_stellar_tx_hash on transfers ((stellar->>'tx_hash'));

alter table transfers enable row level security;

create or replace function update_transfers_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_transfers_updated_at on transfers;
create trigger trg_transfers_updated_at
  before update on transfers
  for each row
  execute function update_transfers_updated_at();


-- ============================================================================
-- Consolidated source: 20260611_01_transfer_events.sql
-- ============================================================================

-- Migration: transfer_events table and atomic lifecycle RPCs
-- Purpose: Append-only audit trail for transfer state transitions
-- Direction: up

create table if not exists transfer_events (
  id              uuid primary key default gen_random_uuid(),
  transfer_id     uuid not null references transfers(id) on delete cascade,
  from_state      transfer_state,
  to_state        transfer_state not null,
  event_type      text not null,
  payload         jsonb default '{}',
  actor           text not null,
  correlation_id  text,
  created_at      timestamptz not null default now()
);

create index if not exists idx_transfer_events_transfer on transfer_events(transfer_id);
create index if not exists idx_transfer_events_created on transfer_events(created_at desc);
create index if not exists idx_transfer_events_correlation on transfer_events(correlation_id);
create index if not exists idx_transfer_events_actor on transfer_events(actor);

alter table transfer_events enable row level security;

create or replace function prevent_transfer_events_mutation()
returns trigger as $$
begin
  raise exception 'transfer_events is append-only; update/delete is not allowed';
end;
$$ language plpgsql;

drop trigger if exists trg_transfer_events_no_update on transfer_events;
create trigger trg_transfer_events_no_update
  before update on transfer_events
  for each row execute function prevent_transfer_events_mutation();

drop trigger if exists trg_transfer_events_no_delete on transfer_events;
create trigger trg_transfer_events_no_delete
  before delete on transfer_events
  for each row execute function prevent_transfer_events_mutation();

create or replace function create_transfer_with_event(
  p_amount_brl_in text,
  p_source_endpoint jsonb,
  p_destination_endpoint jsonb,
  p_actor text,
  p_correlation_id text,
  p_event_payload jsonb,
  p_legacy_transfer_id text default null
)
returns transfers
language plpgsql
security definer
set search_path = public
as $$
declare
  v_transfer transfers%rowtype;
begin
  insert into transfers (
    state,
    state_version,
    source_endpoint,
    destination_endpoint,
    amount_brl_in,
    legacy_transfer_id,
    actor
  ) values (
    'CREATED',
    1,
    p_source_endpoint,
    p_destination_endpoint,
    p_amount_brl_in,
    nullif(p_legacy_transfer_id, ''),
    jsonb_build_object('created_by', coalesce(nullif(p_actor, ''), 'api'))
  )
  returning * into v_transfer;

  insert into transfer_events (
    transfer_id,
    from_state,
    to_state,
    event_type,
    payload,
    actor,
    correlation_id
  ) values (
    v_transfer.id,
    null,
    'CREATED',
    'transfer_created',
    coalesce(p_event_payload, '{}'::jsonb),
    coalesce(nullif(p_actor, ''), 'api'),
    nullif(p_correlation_id, '')
  );

  return v_transfer;
end;
$$;

create or replace function transition_transfer(
  p_transfer_id uuid,
  p_expected_state_version integer,
  p_to_state transfer_state,
  p_event_type text,
  p_event_payload jsonb,
  p_actor text,
  p_correlation_id text,
  p_updates jsonb default '{}'::jsonb
)
returns transfers
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current transfers%rowtype;
  v_updated transfers%rowtype;
begin
  select * into v_current
  from transfers
  where id = p_transfer_id
  for update;

  if not found then
    raise exception 'Transfer % not found', p_transfer_id using errcode = 'P0002';
  end if;

  if v_current.state_version <> p_expected_state_version then
    raise exception 'Optimistic lock conflict for transfer %: expected version %, found %',
      p_transfer_id, p_expected_state_version, v_current.state_version
      using errcode = '40001';
  end if;

  update transfers
  set
    state = p_to_state,
    state_version = state_version + 1,
    source_endpoint = case when p_updates ? 'source_endpoint' then nullif(p_updates->'source_endpoint', 'null'::jsonb) else source_endpoint end,
    destination_endpoint = case when p_updates ? 'destination_endpoint' then nullif(p_updates->'destination_endpoint', 'null'::jsonb) else destination_endpoint end,
    amount_brl_in = case when p_updates ? 'amount_brl_in' then p_updates->>'amount_brl_in' else amount_brl_in end,
    amount_usdc_settled = case when p_updates ? 'amount_usdc_settled' then p_updates->>'amount_usdc_settled' else amount_usdc_settled end,
    amount_usd_out_expected = case when p_updates ? 'amount_usd_out_expected' then p_updates->>'amount_usd_out_expected' else amount_usd_out_expected end,
    quote = case when p_updates ? 'quote' then nullif(p_updates->'quote', 'null'::jsonb) else quote end,
    pix = case when p_updates ? 'pix' then nullif(p_updates->'pix', 'null'::jsonb) else pix end,
    stellar = case when p_updates ? 'stellar' then nullif(p_updates->'stellar', 'null'::jsonb) else stellar end,
    payout = case when p_updates ? 'payout' then nullif(p_updates->'payout', 'null'::jsonb) else payout end,
    reconciliation = case when p_updates ? 'reconciliation' then nullif(p_updates->'reconciliation', 'null'::jsonb) else reconciliation end,
    legacy_transfer_id = case when p_updates ? 'legacy_transfer_id' then p_updates->>'legacy_transfer_id' else legacy_transfer_id end,
    actor = case when p_updates ? 'actor' then nullif(p_updates->'actor', 'null'::jsonb) else actor end,
    failure_reason = case when p_updates ? 'failure_reason' then p_updates->>'failure_reason' else failure_reason end
  where id = p_transfer_id
  returning * into v_updated;

  insert into transfer_events (
    transfer_id,
    from_state,
    to_state,
    event_type,
    payload,
    actor,
    correlation_id
  ) values (
    p_transfer_id,
    v_current.state,
    p_to_state,
    p_event_type,
    coalesce(p_event_payload, '{}'::jsonb),
    coalesce(nullif(p_actor, ''), 'system'),
    nullif(p_correlation_id, '')
  );

  return v_updated;
end;
$$;


-- ============================================================================
-- Consolidated source: 20260518_01_security_hardening_public_surface.sql
-- ============================================================================

-- Security hardening for production Supabase projects.
-- Run this from a trusted Supabase SQL/admin context, not through app startup.

BEGIN;

-- Remove the generic SQL executor. Application runtime must not expose a
-- SECURITY DEFINER RPC capable of running arbitrary SQL text.
DROP FUNCTION IF EXISTS public.exec_sql(text);

-- Vault helpers are allowed only for the backend service role. Browser-facing
-- roles must never be able to store or read private keys directly.
DO $$
DECLARE
  proc regprocedure;
  role_name text;
BEGIN
  FOR proc IN
    SELECT p.oid::regprocedure
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('store_private_key', 'get_private_key')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', proc);

    FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated']
    LOOP
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %I', proc, role_name);
      END IF;
    END LOOP;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', proc);
    END IF;
  END LOOP;
END $$;

-- The backend uses the Supabase service role and should bypass RLS. Public
-- anon/authenticated roles get no direct table access by default.
DO $$
DECLARE
  table_name text;
  role_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'agent_sessions',
    'wallets',
    'operations',
    'user_passkeys',
    'passkey_challenges',
    'agent_states',
    'agent_messages',
    'external_accounts',
    'contacts',
    'recovery_otps',
    'conversion_rules',
    'audit_events',
    'scheduled_payments',
    'whitelisted_assets',
    'pin_reset_tokens',
    'payment_logs',
    'payment_confirmations',
    'financial_insights',
    'financial_events',
    'currency_rate_history',
    'treasury_profiles',
    'treasury_recommendations',
    'invoices',
    'global_profiles',
    'idempotency_keys',
    'telegram_update_dedupes',
    'short_links',
    'onboarding_finalizations',
    'logout_confirmations',
    'receipt_images',
    'external_bank_accounts',
    'email_confirmations',
    'early_access_signups',
    'ops_admin_users',
    'stellar_network_configs'
  ]
  LOOP
    IF to_regclass(format('public.%I', table_name)) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
      EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', table_name);
      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC', table_name);

      FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated']
      LOOP
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
          EXECUTE format('REVOKE ALL ON TABLE public.%I FROM %I', table_name, role_name);
        END IF;
      END LOOP;

      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
        EXECUTE format('GRANT ALL ON TABLE public.%I TO service_role', table_name);
      END IF;
    END IF;
  END LOOP;
END $$;

-- Keep service-role access to sequences used by INSERTs after table grants.
DO $$
DECLARE
  seq record;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    FOR seq IN
      SELECT schemaname, sequencename
      FROM pg_sequences
      WHERE schemaname = 'public'
    LOOP
      EXECUTE format('GRANT USAGE, SELECT, UPDATE ON SEQUENCE %I.%I TO service_role', seq.schemaname, seq.sequencename);
    END LOOP;
  END IF;
END $$;

COMMIT;
