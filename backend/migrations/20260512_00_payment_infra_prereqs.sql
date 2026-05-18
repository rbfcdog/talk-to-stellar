-- TalkToStellar payment infrastructure prerequisites.
-- Run before the AI financial assistant migrations when the database was not
-- already upgraded with upgrade_payment_logging.sql and add_payment_token_tracking.sql.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

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
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_payment_logs_session_id ON public.payment_logs (session_id);
CREATE INDEX IF NOT EXISTS idx_payment_logs_user_id ON public.payment_logs (user_id);
CREATE INDEX IF NOT EXISTS idx_payment_logs_payment_hash ON public.payment_logs (payment_hash);
CREATE INDEX IF NOT EXISTS idx_payment_logs_status ON public.payment_logs (status);
CREATE INDEX IF NOT EXISTS idx_payment_logs_user_completed_at ON public.payment_logs (user_id, completed_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_logs_destination_public_key ON public.payment_logs (destination_public_key);
CREATE INDEX IF NOT EXISTS idx_payment_logs_operation_type ON public.payment_logs (operation_type);

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

ALTER TABLE IF EXISTS public.payment_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.payment_confirmations ENABLE ROW LEVEL SECURITY;

COMMIT;
