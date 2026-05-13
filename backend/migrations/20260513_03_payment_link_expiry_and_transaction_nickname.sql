BEGIN;

ALTER TABLE IF EXISTS public.payment_confirmations
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_payment_confirmations_expires_at
  ON public.payment_confirmations (expires_at);

ALTER TABLE IF EXISTS public.payment_logs
  ADD COLUMN IF NOT EXISTS memo TEXT;

CREATE INDEX IF NOT EXISTS idx_payment_logs_user_memo_lower
  ON public.payment_logs (user_id, lower(memo))
  WHERE memo IS NOT NULL AND btrim(memo) <> '';

COMMIT;
