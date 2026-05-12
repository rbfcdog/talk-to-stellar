-- Savings feed and exact fee metadata for payment-focused operations.
-- This migration is additive and safe to run multiple times.

BEGIN;

ALTER TABLE IF EXISTS public.payment_logs
  ADD COLUMN IF NOT EXISTS actual_fee NUMERIC,
  ADD COLUMN IF NOT EXISTS estimated_savings NUMERIC,
  ADD COLUMN IF NOT EXISTS savings_percentage NUMERIC,
  ADD COLUMN IF NOT EXISTS comparison_method TEXT;

CREATE INDEX IF NOT EXISTS idx_payment_logs_savings_feed
  ON public.payment_logs (user_id, completed_at DESC, estimated_savings DESC)
  WHERE status = 'success';

CREATE INDEX IF NOT EXISTS idx_payment_logs_metadata_platform_spread
  ON public.payment_logs USING GIN (metadata)
  WHERE metadata ? 'platform_spread_fee';

CREATE INDEX IF NOT EXISTS idx_financial_events_savings_feed
  ON public.financial_events (user_id, created_at DESC)
  WHERE event_type = 'savings_estimated';

COMMIT;
