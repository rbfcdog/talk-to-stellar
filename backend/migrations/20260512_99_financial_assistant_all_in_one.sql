  -- TalkToStellar AI Financial Assistant - all-in-one migration.
  -- This condenses the 20260512_00..03 migrations into one idempotent file.
  -- Run in Supabase SQL Editor after the base TalkToStellar schema exists.

  BEGIN;

  CREATE EXTENSION IF NOT EXISTS pgcrypto;

  CREATE OR REPLACE FUNCTION public.update_updated_at_column()
  RETURNS TRIGGER AS $$
  BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
  END;
  $$ LANGUAGE plpgsql;

  -- Payment infrastructure prerequisites.
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
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ
  );

  ALTER TABLE public.payment_logs
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
    details JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ
  );

  ALTER TABLE public.payment_confirmations
    ADD COLUMN IF NOT EXISTS destination_name VARCHAR(255),
    ADD COLUMN IF NOT EXISTS destination_contact JSONB,
    ADD COLUMN IF NOT EXISTS source_asset_code VARCHAR(12),
    ADD COLUMN IF NOT EXISTS source_asset_issuer VARCHAR(56),
    ADD COLUMN IF NOT EXISTS payment_hash VARCHAR(255),
    ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'pending',
    ADD COLUMN IF NOT EXISTS used BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS used_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS details JSONB,
    ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

  CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_confirmations_token_hash ON public.payment_confirmations (token_hash);
  CREATE INDEX IF NOT EXISTS idx_payment_confirmations_session_id ON public.payment_confirmations (session_id);
  CREATE INDEX IF NOT EXISTS idx_payment_confirmations_user_id ON public.payment_confirmations (user_id);
  CREATE INDEX IF NOT EXISTS idx_payment_confirmations_status ON public.payment_confirmations (status);
  CREATE INDEX IF NOT EXISTS idx_payment_confirmations_used ON public.payment_confirmations (used);
  CREATE INDEX IF NOT EXISTS idx_payment_confirmations_used_at ON public.payment_confirmations (used_at);
  CREATE INDEX IF NOT EXISTS idx_payment_confirmations_completed_at ON public.payment_confirmations (completed_at DESC);

  -- Smart Contacts.
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

  -- AI Treasury and FX rate persistence.
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

  DROP TRIGGER IF EXISTS update_treasury_profiles_updated_at ON public.treasury_profiles;
  CREATE TRIGGER update_treasury_profiles_updated_at
    BEFORE UPDATE ON public.treasury_profiles
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

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

  -- Activity Feed and Insights.
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
    created_at TIMESTAMPTZ DEFAULT now()
  );

  CREATE INDEX IF NOT EXISTS idx_financial_insights_user_time ON public.financial_insights (user_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_financial_insights_type ON public.financial_insights (type);
  CREATE INDEX IF NOT EXISTS idx_financial_insights_period ON public.financial_insights (period_start, period_end);
  CREATE INDEX IF NOT EXISTS idx_financial_insights_metadata_gin ON public.financial_insights USING GIN (metadata_json);

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
  CREATE INDEX IF NOT EXISTS idx_financial_events_type ON public.financial_events (event_type);
  CREATE INDEX IF NOT EXISTS idx_financial_events_status ON public.financial_events (status);
  CREATE INDEX IF NOT EXISTS idx_financial_events_related_operation ON public.financial_events (related_operation_id);
  CREATE INDEX IF NOT EXISTS idx_financial_events_related_contact ON public.financial_events (related_contact_id);
  CREATE INDEX IF NOT EXISTS idx_financial_events_metadata_gin ON public.financial_events USING GIN (metadata_json);
  CREATE UNIQUE INDEX IF NOT EXISTS idx_financial_events_dedupe_key_unique
    ON public.financial_events (dedupe_key)
    WHERE dedupe_key IS NOT NULL;

  ALTER TABLE IF EXISTS public.operations ADD COLUMN IF NOT EXISTS estimated_traditional_fee NUMERIC;
  ALTER TABLE IF EXISTS public.operations ADD COLUMN IF NOT EXISTS actual_fee NUMERIC;
  ALTER TABLE IF EXISTS public.operations ADD COLUMN IF NOT EXISTS estimated_savings NUMERIC;
  ALTER TABLE IF EXISTS public.operations ADD COLUMN IF NOT EXISTS savings_percentage NUMERIC;
  ALTER TABLE IF EXISTS public.operations ADD COLUMN IF NOT EXISTS comparison_method TEXT;

  CREATE INDEX IF NOT EXISTS idx_operations_estimated_savings
    ON public.operations (user_id, estimated_savings DESC)
    WHERE estimated_savings IS NOT NULL;

  -- Product modules.
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
    status TEXT NOT NULL DEFAULT 'draft'
      CHECK (status IN ('draft', 'sent', 'paid', 'expired', 'cancelled')),
    payment_link_id TEXT,
    metadata_json JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
  );

  CREATE INDEX IF NOT EXISTS idx_invoices_user_time ON public.invoices (user_id, created_at DESC);
  CREATE INDEX IF NOT EXISTS idx_invoices_status ON public.invoices (status);
  CREATE INDEX IF NOT EXISTS idx_invoices_due_date ON public.invoices (due_date);
  CREATE INDEX IF NOT EXISTS idx_invoices_contact ON public.invoices (recipient_contact_id);
  CREATE INDEX IF NOT EXISTS idx_invoices_metadata_gin ON public.invoices USING GIN (metadata_json);

  DROP TRIGGER IF EXISTS update_invoices_updated_at ON public.invoices;
  CREATE TRIGGER update_invoices_updated_at
    BEFORE UPDATE ON public.invoices
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

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

  CREATE INDEX IF NOT EXISTS idx_global_profiles_username ON public.global_profiles (username);
  CREATE INDEX IF NOT EXISTS idx_global_profiles_public_username ON public.global_profiles (username) WHERE is_public = true;

  DROP TRIGGER IF EXISTS update_global_profiles_updated_at ON public.global_profiles;
  CREATE TRIGGER update_global_profiles_updated_at
    BEFORE UPDATE ON public.global_profiles
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

  -- Dev/service-role mode used by the current backend.
  ALTER TABLE IF EXISTS public.payment_logs ENABLE ROW LEVEL SECURITY;
  ALTER TABLE IF EXISTS public.payment_confirmations ENABLE ROW LEVEL SECURITY;
  ALTER TABLE IF EXISTS public.currency_rate_history ENABLE ROW LEVEL SECURITY;
  ALTER TABLE IF EXISTS public.treasury_profiles ENABLE ROW LEVEL SECURITY;
  ALTER TABLE IF EXISTS public.treasury_recommendations ENABLE ROW LEVEL SECURITY;
  ALTER TABLE IF EXISTS public.financial_insights ENABLE ROW LEVEL SECURITY;
  ALTER TABLE IF EXISTS public.financial_events ENABLE ROW LEVEL SECURITY;
  ALTER TABLE IF EXISTS public.invoices ENABLE ROW LEVEL SECURITY;
  ALTER TABLE IF EXISTS public.global_profiles ENABLE ROW LEVEL SECURITY;

  COMMIT;
