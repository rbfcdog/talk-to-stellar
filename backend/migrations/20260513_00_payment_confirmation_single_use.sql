BEGIN;

CREATE TABLE IF NOT EXISTS public.payment_confirmations (
  id BIGSERIAL PRIMARY KEY,
  token_hash VARCHAR(255) NOT NULL,
  session_id UUID NOT NULL,
  user_id VARCHAR(255) NOT NULL,
  destination VARCHAR(56) NOT NULL,
  amount VARCHAR(50) NOT NULL,
  asset_code VARCHAR(12) NOT NULL DEFAULT 'XLM',
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$
BEGIN
  ALTER TABLE public.payment_confirmations
    ADD COLUMN IF NOT EXISTS used BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS used_at TIMESTAMPTZ DEFAULT NULL;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS ux_payment_confirmations_token_hash
  ON public.payment_confirmations (token_hash)
  WHERE token_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_payment_confirmations_used
  ON public.payment_confirmations (used);

CREATE INDEX IF NOT EXISTS idx_payment_confirmations_used_at
  ON public.payment_confirmations (used_at);

COMMIT;
