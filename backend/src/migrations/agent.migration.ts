/**
 * Database migration for agent tables in Supabase
 * Legacy local repair SQL split into multiple statements.
 * Do not run this in hosted/production environments.
 */

// Part 1: Legacy local exec_sql function. Production hardening drops this RPC.
export const createExecSqlFunction = `
CREATE OR REPLACE FUNCTION public.exec_sql(sql TEXT)
RETURNS TABLE(result TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  trimmed_sql TEXT;
BEGIN
  trimmed_sql := ltrim(sql);

  -- SELECT/WITH must return rows matching TABLE(result TEXT)
  IF trimmed_sql ILIKE 'select%' OR trimmed_sql ILIKE 'with%' THEN
    RETURN QUERY EXECUTE sql;
  ELSE
    -- DDL/DML statements do not return tuples; execute and return a synthetic success row
    EXECUTE sql;
    RETURN QUERY SELECT 'OK'::TEXT;
  END IF;
END;
$$;
`;

// Part 2: Core tables and extensions
export const agentMigrationSQL = `
CREATE EXTENSION IF NOT EXISTS pgcrypto;

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
  context TEXT,
  stellar_transaction_hash TEXT,
  destination_key TEXT,
  source_public_key TEXT,
  source_session_id UUID,
  destination_session_id UUID,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_operations_user_id ON operations(user_id);
CREATE INDEX IF NOT EXISTS idx_operations_created_at ON operations(created_at);
CREATE INDEX IF NOT EXISTS idx_operations_status ON operations(status);

ALTER TABLE wallets ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE wallets ADD COLUMN IF NOT EXISTS pix_key TEXT;
ALTER TABLE agent_sessions ADD COLUMN IF NOT EXISTS password_hash TEXT;
ALTER TABLE agent_sessions ADD COLUMN IF NOT EXISTS pix_key TEXT;
ALTER TABLE operations ADD COLUMN IF NOT EXISTS source_public_key TEXT;
ALTER TABLE operations ADD COLUMN IF NOT EXISTS source_session_id UUID;
ALTER TABLE operations ADD COLUMN IF NOT EXISTS destination_session_id UUID;
ALTER TABLE operations ADD COLUMN IF NOT EXISTS amount_usdc NUMERIC;
ALTER TABLE operations ADD COLUMN IF NOT EXISTS amount_brl NUMERIC;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS phone_number TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS pix_key TEXT;

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
  data JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS contacts (
  id BIGSERIAL PRIMARY KEY,
  owner_id TEXT NOT NULL,
  contact_name TEXT NOT NULL,
  stellar_public_key TEXT NOT NULL,
  phone_number TEXT,
  pix_key TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS recovery_otps (
  id BIGSERIAL PRIMARY KEY,
  phone_number TEXT UNIQUE NOT NULL,
  otp_hash TEXT NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  used_at TIMESTAMP,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_passkeys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  credential_id TEXT UNIQUE NOT NULL,
  public_key TEXT NOT NULL,
  counter BIGINT NOT NULL DEFAULT 0,
  transports TEXT[] DEFAULT '{}',
  device_type TEXT,
  backed_up BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

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

CREATE UNIQUE INDEX IF NOT EXISTS idx_external_accounts_provider_user ON external_accounts(provider, provider_user_id);
CREATE INDEX IF NOT EXISTS idx_external_accounts_session_id ON external_accounts(session_id);
CREATE INDEX IF NOT EXISTS idx_external_accounts_user_id ON external_accounts(user_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_contacts_owner_name ON contacts(owner_id, contact_name);
CREATE INDEX IF NOT EXISTS idx_contacts_owner_id ON contacts(owner_id);
CREATE INDEX IF NOT EXISTS idx_contacts_public_key ON contacts(stellar_public_key);
CREATE INDEX IF NOT EXISTS idx_contacts_phone ON contacts(phone_number);
CREATE INDEX IF NOT EXISTS idx_contacts_pix ON contacts(pix_key);
CREATE INDEX IF NOT EXISTS idx_contacts_pix_key_lower ON contacts ((lower(pix_key))) WHERE pix_key IS NOT NULL AND btrim(pix_key) <> '';
CREATE UNIQUE INDEX IF NOT EXISTS idx_contacts_owner_pix_key_lower_unique ON contacts (owner_id, lower(pix_key)) WHERE pix_key IS NOT NULL AND btrim(pix_key) <> '';
CREATE INDEX IF NOT EXISTS idx_recovery_otps_phone ON recovery_otps(phone_number);
CREATE INDEX IF NOT EXISTS idx_user_passkeys_user_id ON user_passkeys(user_id);
CREATE INDEX IF NOT EXISTS idx_passkey_challenges_user_type ON passkey_challenges(user_id, type);
CREATE INDEX IF NOT EXISTS idx_passkey_challenges_expires_at ON passkey_challenges(expires_at);
`;

// Part 3: Functions and triggers (separate statements)
export const createFunctionsAndTriggers = `
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;  
$$ language 'plpgsql';

DROP TRIGGER IF EXISTS update_agent_sessions_updated_at ON agent_sessions;
CREATE TRIGGER update_agent_sessions_updated_at BEFORE UPDATE ON agent_sessions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_agent_states_updated_at ON agent_states;
CREATE TRIGGER update_agent_states_updated_at BEFORE UPDATE ON agent_states
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_wallets_updated_at ON wallets;
CREATE TRIGGER update_wallets_updated_at BEFORE UPDATE ON wallets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_operations_updated_at ON operations;
CREATE TRIGGER update_operations_updated_at BEFORE UPDATE ON operations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_external_accounts_updated_at ON external_accounts;
CREATE TRIGGER update_external_accounts_updated_at BEFORE UPDATE ON external_accounts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_user_passkeys_updated_at ON user_passkeys;
CREATE TRIGGER update_user_passkeys_updated_at BEFORE UPDATE ON user_passkeys
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_recovery_otps_updated_at ON recovery_otps;
CREATE TRIGGER update_recovery_otps_updated_at BEFORE UPDATE ON recovery_otps
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
`;

// Part 4: Vault functions (drop all versions first, then create single versions)
export const createVaultFunctions = `
DROP FUNCTION IF EXISTS public.store_private_key CASCADE;
DROP FUNCTION IF EXISTS public.get_private_key CASCADE;

CREATE FUNCTION public.store_private_key(
  secret_value TEXT,
  unique_name TEXT DEFAULT NULL,
  secret_description TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public, vault
AS $$
  SELECT vault.create_secret(secret_value, unique_name, secret_description);
$$;

CREATE FUNCTION public.get_private_key(secret_id UUID)
RETURNS TEXT
LANGUAGE SQL
SECURITY DEFINER
SET search_path = public, vault
AS $$
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
`;

// Part 5: Ensure required columns exist (fixes missing columns from partial migrations)
export const ensureRequiredColumns = `
ALTER TABLE IF EXISTS wallets ADD COLUMN IF NOT EXISTS vault_secret_id UUID;
CREATE INDEX IF NOT EXISTS idx_wallets_vault_secret_id ON wallets(vault_secret_id);
ALTER TABLE IF EXISTS operations ADD COLUMN IF NOT EXISTS source_public_key TEXT;
ALTER TABLE IF EXISTS operations ADD COLUMN IF NOT EXISTS source_session_id UUID;
ALTER TABLE IF EXISTS operations ADD COLUMN IF NOT EXISTS destination_session_id UUID;
ALTER TABLE IF EXISTS operations ADD COLUMN IF NOT EXISTS amount_usdc NUMERIC;
ALTER TABLE IF EXISTS operations ADD COLUMN IF NOT EXISTS amount_brl NUMERIC;
ALTER TABLE IF EXISTS contacts ADD COLUMN IF NOT EXISTS phone_number TEXT;
ALTER TABLE IF EXISTS contacts ADD COLUMN IF NOT EXISTS pix_key TEXT;
ALTER TABLE IF EXISTS contacts ADD COLUMN IF NOT EXISTS display_name TEXT;
ALTER TABLE IF EXISTS contacts ADD COLUMN IF NOT EXISTS nickname TEXT;
ALTER TABLE IF EXISTS contacts ADD COLUMN IF NOT EXISTS role_label TEXT;
ALTER TABLE IF EXISTS contacts ADD COLUMN IF NOT EXISTS country TEXT;
ALTER TABLE IF EXISTS contacts ADD COLUMN IF NOT EXISTS preferred_currency TEXT;
ALTER TABLE IF EXISTS contacts ADD COLUMN IF NOT EXISTS preferred_amount NUMERIC;
ALTER TABLE IF EXISTS contacts ADD COLUMN IF NOT EXISTS last_amount NUMERIC;
ALTER TABLE IF EXISTS contacts ADD COLUMN IF NOT EXISTS last_direction TEXT;
ALTER TABLE IF EXISTS contacts ADD COLUMN IF NOT EXISTS last_operation_id UUID;
ALTER TABLE IF EXISTS contacts ADD COLUMN IF NOT EXISTS total_sent NUMERIC DEFAULT 0;
ALTER TABLE IF EXISTS contacts ADD COLUMN IF NOT EXISTS total_received NUMERIC DEFAULT 0;
ALTER TABLE IF EXISTS contacts ADD COLUMN IF NOT EXISTS transaction_count INTEGER DEFAULT 0;
ALTER TABLE IF EXISTS contacts ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';
ALTER TABLE IF EXISTS contacts ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE IF EXISTS contacts ADD COLUMN IF NOT EXISTS metadata_json JSONB DEFAULT '{}';
ALTER TABLE IF EXISTS contacts ADD COLUMN IF NOT EXISTS favorite BOOLEAN DEFAULT false;
ALTER TABLE IF EXISTS contacts ADD COLUMN IF NOT EXISTS recurring BOOLEAN DEFAULT false;
CREATE TABLE IF NOT EXISTS recovery_otps (
  id BIGSERIAL PRIMARY KEY,
  phone_number TEXT UNIQUE NOT NULL,
  otp_hash TEXT NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  used_at TIMESTAMP,
  attempts INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_contacts_phone ON contacts(phone_number);
CREATE INDEX IF NOT EXISTS idx_contacts_pix ON contacts(pix_key);
CREATE INDEX IF NOT EXISTS idx_recovery_otps_phone ON recovery_otps(phone_number);
CREATE TABLE IF NOT EXISTS user_passkeys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  credential_id TEXT UNIQUE NOT NULL,
  public_key TEXT NOT NULL,
  counter BIGINT NOT NULL DEFAULT 0,
  transports TEXT[] DEFAULT '{}',
  device_type TEXT,
  backed_up BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
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
CREATE INDEX IF NOT EXISTS idx_user_passkeys_user_id ON user_passkeys(user_id);
CREATE INDEX IF NOT EXISTS idx_passkey_challenges_user_type ON passkey_challenges(user_id, type);
CREATE INDEX IF NOT EXISTS idx_passkey_challenges_expires_at ON passkey_challenges(expires_at);
`;

// Part 6: Features (contact history, low-balance alerts, auto-conversion, audit log, etc.)
export const createFeaturesTables = `
-- Add contact_id FK to operations (for per-contact history)
ALTER TABLE operations
ADD COLUMN IF NOT EXISTS contact_id UUID;

-- Add category, memo, and amount tracking to operations
ALTER TABLE operations
ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'other';
ALTER TABLE operations
ADD COLUMN IF NOT EXISTS memo TEXT;
ALTER TABLE operations
ADD COLUMN IF NOT EXISTS amount_usdc NUMERIC;
ALTER TABLE operations
ADD COLUMN IF NOT EXISTS amount_brl NUMERIC;
ALTER TABLE operations
ADD COLUMN IF NOT EXISTS is_auto_conversion BOOLEAN DEFAULT false;
ALTER TABLE operations
ADD COLUMN IF NOT EXISTS trustline_asset_code TEXT;

-- Add alert thresholds to wallets
ALTER TABLE wallets
ADD COLUMN IF NOT EXISTS alert_threshold_usdc NUMERIC DEFAULT 5.00;
ALTER TABLE wallets
ADD COLUMN IF NOT EXISTS last_balance_alert_at TIMESTAMP;

-- Add opt-out flag for weekly summaries to agent_sessions
ALTER TABLE agent_sessions
ADD COLUMN IF NOT EXISTS opt_out_weekly_summary BOOLEAN DEFAULT false;

-- Expand contacts into smart financial contacts
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS display_name TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS nickname TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS role_label TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS country TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS preferred_currency TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS preferred_amount NUMERIC;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS last_amount NUMERIC;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS last_direction TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS last_operation_id UUID;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS total_sent NUMERIC DEFAULT 0;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS total_received NUMERIC DEFAULT 0;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS transaction_count INTEGER DEFAULT 0;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}';
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS metadata_json JSONB DEFAULT '{}';
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS favorite BOOLEAN DEFAULT false;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS recurring BOOLEAN DEFAULT false;

-- Create conversion_rules table
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

-- FX rate history for treasury/risk analytics
CREATE TABLE IF NOT EXISTS currency_rate_history (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    base_currency TEXT NOT NULL,
    quote_currency TEXT NOT NULL,
    rate NUMERIC NOT NULL,
    source TEXT,
    observed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    metadata JSONB DEFAULT '{}'
);
CREATE INDEX IF NOT EXISTS idx_currency_rate_history_pair_time
ON currency_rate_history(base_currency, quote_currency, observed_at DESC);

-- AI Treasury profile per session/user
CREATE TABLE IF NOT EXISTS treasury_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL,
    user_id TEXT NOT NULL,
    auto_protect_enabled BOOLEAN NOT NULL DEFAULT false,
    target_usd_ratio NUMERIC NOT NULL DEFAULT 0.50,
    risk_threshold_pct NUMERIC NOT NULL DEFAULT 2.50,
    spending_projection_brl NUMERIC,
    spending_projection_usd NUMERIC,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(session_id),
    FOREIGN KEY (session_id) REFERENCES agent_sessions(session_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_treasury_profiles_user_id ON treasury_profiles(user_id);

CREATE TABLE IF NOT EXISTS treasury_recommendations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL,
    user_id TEXT NOT NULL,
    recommendation_type TEXT NOT NULL,
    risk_score NUMERIC,
    suggested_action TEXT,
    payload JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (session_id) REFERENCES agent_sessions(session_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_treasury_recommendations_session_time
ON treasury_recommendations(session_id, created_at DESC);

-- AI Financial Insights
CREATE TABLE IF NOT EXISTS financial_insights (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    amount NUMERIC,
    currency TEXT,
    period_start TIMESTAMP,
    period_end TIMESTAMP,
    metadata_json JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_financial_insights_user_time ON financial_insights(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_financial_insights_type ON financial_insights(type);

-- Smart Activity Feed
CREATE TABLE IF NOT EXISTS financial_events (
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
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_financial_events_user_time ON financial_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_financial_events_type ON financial_events(event_type);
CREATE UNIQUE INDEX IF NOT EXISTS idx_financial_events_dedupe_key_unique ON financial_events(dedupe_key) WHERE dedupe_key IS NOT NULL;

-- Invoice AI light
CREATE TABLE IF NOT EXISTS invoices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,
    recipient_name TEXT NOT NULL,
    recipient_contact_id BIGINT,
    title TEXT NOT NULL,
    description TEXT,
    amount NUMERIC NOT NULL,
    currency TEXT NOT NULL DEFAULT 'USD',
    due_date TIMESTAMP,
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'paid', 'expired', 'cancelled')),
    payment_link_id TEXT,
    metadata_json JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_invoices_user_time ON invoices(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);

-- Global account identity
CREATE TABLE IF NOT EXISTS global_profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL UNIQUE,
    username TEXT NOT NULL UNIQUE,
    display_name TEXT,
    avatar_url TEXT,
    bio TEXT,
    default_currency TEXT DEFAULT 'USD',
    accepted_currencies TEXT[] DEFAULT '{USD,BRL}',
    is_public BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_global_profiles_username ON global_profiles(username);

-- Create audit_events table
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

-- Create scheduled_payments table
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
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed', 'cancelled')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (session_id) REFERENCES agent_sessions(session_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_scheduled_payments_session_id ON scheduled_payments(session_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_payments_scheduled_for ON scheduled_payments(scheduled_for);
CREATE INDEX IF NOT EXISTS idx_scheduled_payments_status ON scheduled_payments(status);

-- Create whitelisted_assets table
CREATE TABLE IF NOT EXISTS whitelisted_assets (
    id BIGSERIAL PRIMARY KEY,
    asset_code TEXT UNIQUE NOT NULL,
    asset_issuer TEXT,
    trusted BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Seed whitelisted assets
INSERT INTO whitelisted_assets (asset_code, asset_issuer, trusted) VALUES
  ('USDC', 'GBBD47UZQ2BNTO32V36DP7RQ75P463MCFC7RQVZGVZBULXE72DYOJJL', true),
  ('USDT', 'GDGQVOKHW4VEJRU77QCE6EM7BNUH7CFLY5G2WQGVD57XFHVKNQXKXQX', true),
  ('BRL', 'GENBWJ2EVFUJXJ7WQF3GFFQGNW24LZZFQKQ4L2IHHW2NBUFSJ3BFIXSX', true),
  ('CNY', 'GBHSQKRX2RCQJAWQZ24KSRKNLXV4OXNQYH2QIBY4MSPJHV6C3KZH3JOK', true)
ON CONFLICT (asset_code) DO NOTHING;

-- Add indexes for common queries
CREATE INDEX IF NOT EXISTS idx_operations_contact_id ON operations(contact_id);
CREATE INDEX IF NOT EXISTS idx_operations_category ON operations(category);
CREATE INDEX IF NOT EXISTS idx_operations_is_auto_conversion ON operations(is_auto_conversion);

-- Create spending_summary view
DROP VIEW IF EXISTS spending_summary CASCADE;
CREATE VIEW spending_summary AS
SELECT
    o.user_id,
    o.category,
    o.asset_code,
    COUNT(*) as transaction_count,
    SUM(o.amount) as total_amount,
    SUM(o.amount_usdc) as total_usdc,
    SUM(o.amount_brl) as total_brl,
    DATE_TRUNC('month', o.created_at) as month
FROM operations o
WHERE o.status = 'success'
GROUP BY o.user_id, o.category, o.asset_code, DATE_TRUNC('month', o.created_at);

-- Create contact_payment_summary view
DROP VIEW IF EXISTS contact_payment_summary CASCADE;
CREATE VIEW contact_payment_summary AS
SELECT
    o.user_id,
    o.contact_id,
    o.destination_key,
    COUNT(*) as payment_count,
    SUM(o.amount) as total_amount,
    SUM(o.amount_usdc) as total_usdc,
    MAX(o.created_at) as last_payment_at,
    DATE_TRUNC('month', MAX(o.created_at)) as month
FROM operations o
WHERE o.status = 'success' AND o.type = 'PAYMENT'
GROUP BY o.user_id, o.contact_id, o.destination_key;
`;

// Part 7: Enable RLS on application tables.
export const enableRLSOnAgentTables = `
ALTER TABLE IF EXISTS agent_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS operations ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS agent_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS agent_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS external_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS recovery_otps ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS user_passkeys ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS passkey_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS conversion_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS scheduled_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS whitelisted_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS financial_insights ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS financial_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS global_profiles ENABLE ROW LEVEL SECURITY;
`;

export const disableRLSOnAgentTables = enableRLSOnAgentTables;
