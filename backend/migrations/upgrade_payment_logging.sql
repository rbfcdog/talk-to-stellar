-- Supabase/Postgres migration for detailed payment logging

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
  metadata JSONB,
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
  ADD COLUMN IF NOT EXISTS metadata JSONB,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_payment_logs_session_id
  ON public.payment_logs (session_id);
CREATE INDEX IF NOT EXISTS idx_payment_logs_user_id
  ON public.payment_logs (user_id);
CREATE INDEX IF NOT EXISTS idx_payment_logs_payment_hash
  ON public.payment_logs (payment_hash);
CREATE INDEX IF NOT EXISTS idx_payment_logs_status
  ON public.payment_logs (status);
