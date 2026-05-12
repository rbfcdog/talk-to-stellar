-- Smart Activity Feed, AI Financial Insights, and economy metadata.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

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

CREATE INDEX IF NOT EXISTS idx_financial_insights_user_time
  ON public.financial_insights (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_financial_insights_type
  ON public.financial_insights (type);
CREATE INDEX IF NOT EXISTS idx_financial_insights_period
  ON public.financial_insights (period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_financial_insights_metadata_gin
  ON public.financial_insights USING GIN (metadata_json);

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

CREATE INDEX IF NOT EXISTS idx_financial_events_user_time
  ON public.financial_events (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_financial_events_type
  ON public.financial_events (event_type);
CREATE INDEX IF NOT EXISTS idx_financial_events_status
  ON public.financial_events (status);
CREATE INDEX IF NOT EXISTS idx_financial_events_related_operation
  ON public.financial_events (related_operation_id);
CREATE INDEX IF NOT EXISTS idx_financial_events_related_contact
  ON public.financial_events (related_contact_id);
CREATE INDEX IF NOT EXISTS idx_financial_events_metadata_gin
  ON public.financial_events USING GIN (metadata_json);
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

ALTER TABLE IF EXISTS public.payment_logs ADD COLUMN IF NOT EXISTS estimated_traditional_fee NUMERIC;
ALTER TABLE IF EXISTS public.payment_logs ADD COLUMN IF NOT EXISTS actual_fee NUMERIC;
ALTER TABLE IF EXISTS public.payment_logs ADD COLUMN IF NOT EXISTS estimated_savings NUMERIC;
ALTER TABLE IF EXISTS public.payment_logs ADD COLUMN IF NOT EXISTS savings_percentage NUMERIC;
ALTER TABLE IF EXISTS public.payment_logs ADD COLUMN IF NOT EXISTS comparison_method TEXT;

CREATE INDEX IF NOT EXISTS idx_payment_logs_estimated_savings
  ON public.payment_logs (user_id, estimated_savings DESC)
  WHERE estimated_savings IS NOT NULL;

ALTER TABLE IF EXISTS public.financial_insights DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.financial_events DISABLE ROW LEVEL SECURITY;

COMMIT;
