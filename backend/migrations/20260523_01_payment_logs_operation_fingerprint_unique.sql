-- Required for payment_logs upsert(onConflict: operation_fingerprint).
-- Without this unique index, successful payments can complete on-chain but fail to persist
-- the real fee/hash metadata used by receipts and savings summaries.

CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_logs_operation_fingerprint_unique
  ON public.payment_logs (operation_fingerprint)
  WHERE operation_fingerprint IS NOT NULL;
