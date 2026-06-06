-- Week 2 hardening: enforce payout coordination invariants at the database boundary.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ck_international_payout_instruction_provider'
  ) THEN
    ALTER TABLE public.international_payout_instructions
      ADD CONSTRAINT ck_international_payout_instruction_provider
      CHECK (provider_name IN ('mock', 'etherfuse', 'circle', 'bridge')) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ck_international_payout_instruction_status'
  ) THEN
    ALTER TABLE public.international_payout_instructions
      ADD CONSTRAINT ck_international_payout_instruction_status
      CHECK (status IN ('instruction_created', 'pending', 'completed', 'failed', 'cancelled')) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ck_international_payout_instruction_mode'
  ) THEN
    ALTER TABLE public.international_payout_instructions
      ADD CONSTRAINT ck_international_payout_instruction_mode
      CHECK (execution_mode IN ('mock', 'proof', 'compatibility', 'sandbox_api', 'live_api', 'wise_metadata_only')) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ck_international_payout_instruction_amount'
  ) THEN
    ALTER TABLE public.international_payout_instructions
      ADD CONSTRAINT ck_international_payout_instruction_amount
      CHECK (amount_usd > 0 AND currency = 'USD') NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ck_international_payout_event_provider'
  ) THEN
    ALTER TABLE public.international_payout_events
      ADD CONSTRAINT ck_international_payout_event_provider
      CHECK (provider_name IN ('mock', 'etherfuse', 'circle', 'bridge')) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ck_international_payout_event_status'
  ) THEN
    ALTER TABLE public.international_payout_events
      ADD CONSTRAINT ck_international_payout_event_status
      CHECK (status IN ('instruction_created', 'pending', 'completed', 'failed', 'cancelled')) NOT VALID;
  END IF;
END $$;

COMMENT ON TABLE public.international_payout_instructions IS
  'Service-role-only USD payout coordination records. Provider request and response fields must remain redacted.';

COMMENT ON TABLE public.international_payout_events IS
  'Idempotent normalized payout provider events. Raw secrets and full bank details must not be stored.';
