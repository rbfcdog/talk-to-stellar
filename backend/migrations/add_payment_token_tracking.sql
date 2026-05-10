-- Supabase/Postgres migration for payment confirmation idempotency

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
  ADD COLUMN IF NOT EXISTS details JSONB,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_confirmations_token_hash
  ON public.payment_confirmations (token_hash);
CREATE INDEX IF NOT EXISTS idx_payment_confirmations_session_id
  ON public.payment_confirmations (session_id);
CREATE INDEX IF NOT EXISTS idx_payment_confirmations_user_id
  ON public.payment_confirmations (user_id);
CREATE INDEX IF NOT EXISTS idx_payment_confirmations_status
  ON public.payment_confirmations (status);
