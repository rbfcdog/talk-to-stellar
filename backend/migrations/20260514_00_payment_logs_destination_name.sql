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

