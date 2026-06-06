-- Week 2: provider-agnostic USD payout coordination evidence and event history.

CREATE TABLE IF NOT EXISTS public.international_payout_instructions (
  id TEXT PRIMARY KEY,
  transfer_id TEXT NOT NULL REFERENCES public.international_transfers(id) ON DELETE CASCADE,
  provider_name TEXT NOT NULL,
  provider_payout_id TEXT NOT NULL,
  status TEXT NOT NULL,
  execution_mode TEXT NOT NULL,
  amount_usd NUMERIC NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  destination_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  settlement_evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  provider_request JSONB NOT NULL DEFAULT '{}'::jsonb,
  provider_response JSONB NOT NULL DEFAULT '{}'::jsonb,
  status_history JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_international_payout_instruction_transfer
  ON public.international_payout_instructions (transfer_id);

CREATE UNIQUE INDEX IF NOT EXISTS ux_international_payout_provider_reference
  ON public.international_payout_instructions (provider_name, provider_payout_id);

CREATE INDEX IF NOT EXISTS idx_international_payout_instruction_status
  ON public.international_payout_instructions (status, updated_at DESC);

CREATE TABLE IF NOT EXISTS public.international_payout_events (
  id TEXT PRIMARY KEY,
  transfer_id TEXT NOT NULL REFERENCES public.international_transfers(id) ON DELETE CASCADE,
  payout_instruction_id TEXT NOT NULL REFERENCES public.international_payout_instructions(id) ON DELETE CASCADE,
  provider_name TEXT NOT NULL,
  provider_event_id TEXT NOT NULL,
  provider_payout_id TEXT NOT NULL,
  status TEXT NOT NULL,
  event_type TEXT,
  evidence JSONB NOT NULL DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_international_payout_provider_event
  ON public.international_payout_events (provider_name, provider_event_id);

CREATE INDEX IF NOT EXISTS idx_international_payout_events_transfer
  ON public.international_payout_events (transfer_id, occurred_at DESC);

ALTER TABLE IF EXISTS public.international_payout_instructions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS public.international_payout_events ENABLE ROW LEVEL SECURITY;
