-- Smart Contacts, FX persistence, and AI Treasury tables.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

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

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at := CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_treasury_profiles_updated_at ON public.treasury_profiles;
CREATE TRIGGER update_treasury_profiles_updated_at
  BEFORE UPDATE ON public.treasury_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE IF EXISTS public.currency_rate_history DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.treasury_profiles DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.treasury_recommendations DISABLE ROW LEVEL SECURITY;

COMMIT;
