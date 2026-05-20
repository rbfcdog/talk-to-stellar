CREATE TABLE IF NOT EXISTS public.international_transfer_quotes (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  institution_id TEXT,
  source_currency TEXT NOT NULL DEFAULT 'BRL',
  destination_currency TEXT NOT NULL DEFAULT 'USD',
  brl_amount NUMERIC NOT NULL,
  estimated_usdc_amount NUMERIC NOT NULL,
  estimated_usd_amount NUMERIC NOT NULL,
  fx_rate NUMERIC NOT NULL,
  platform_fee JSONB NOT NULL DEFAULT '{}'::jsonb,
  estimated_provider_fee JSONB NOT NULL DEFAULT '{}'::jsonb,
  total_fee JSONB NOT NULL DEFAULT '{}'::jsonb,
  quote_status TEXT NOT NULL DEFAULT 'ACTIVE',
  quote_source TEXT NOT NULL DEFAULT 'configured_fallback_rate',
  expires_at TIMESTAMPTZ NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.international_transfers (
  id TEXT PRIMARY KEY,
  quote_id TEXT NOT NULL REFERENCES public.international_transfer_quotes(id),
  status TEXT NOT NULL DEFAULT 'QUOTE_CREATED',
  user_id TEXT,
  institution_id TEXT,
  sender_identity JSONB NOT NULL DEFAULT '{}'::jsonb,
  recipient_identity JSONB NOT NULL DEFAULT '{}'::jsonb,
  brl_amount NUMERIC NOT NULL,
  quoted_usd_amount NUMERIC NOT NULL,
  fx_rate NUMERIC NOT NULL,
  fees JSONB NOT NULL DEFAULT '{}'::jsonb,
  stellar_asset_code TEXT NOT NULL DEFAULT 'USDC',
  stellar_asset_issuer TEXT,
  stellar_tx_hash TEXT,
  stellar_memo TEXT,
  stellar_source_account TEXT,
  stellar_destination_account TEXT,
  payout_provider TEXT,
  payout_destination JSONB NOT NULL DEFAULT '{}'::jsonb,
  payout_instruction_id TEXT,
  provider_payout_id TEXT,
  payout_status TEXT,
  pix_payment_id TEXT,
  pix_order_id TEXT,
  pix_status TEXT,
  same_name_payout_required BOOLEAN NOT NULL DEFAULT true,
  same_name_match_status TEXT NOT NULL DEFAULT 'UNKNOWN',
  identity_risk_notes TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  reconciliation_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  error_logs JSONB NOT NULL DEFAULT '[]'::jsonb,
  pix_received_at TIMESTAMPTZ,
  stellar_settled_at TIMESTAMPTZ,
  payout_completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.international_transfer_reconciliations (
  transfer_id TEXT PRIMARY KEY REFERENCES public.international_transfers(id) ON DELETE CASCADE,
  quote_id TEXT NOT NULL REFERENCES public.international_transfer_quotes(id),
  pix_payment_id TEXT,
  pix_order_id TEXT,
  stellar_tx_hash TEXT,
  stellar_memo TEXT,
  payout_instruction_id TEXT,
  provider_payout_id TEXT,
  final_payout_status TEXT,
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_international_transfer_quotes_user
  ON public.international_transfer_quotes (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_international_transfers_user
  ON public.international_transfers (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_international_transfers_status
  ON public.international_transfers (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_international_transfers_pix_order
  ON public.international_transfers (pix_order_id)
  WHERE pix_order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_international_transfers_stellar_hash
  ON public.international_transfers (stellar_tx_hash)
  WHERE stellar_tx_hash IS NOT NULL;

ALTER TABLE IF EXISTS public.international_transfer_quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.international_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.international_transfer_reconciliations ENABLE ROW LEVEL SECURITY;
