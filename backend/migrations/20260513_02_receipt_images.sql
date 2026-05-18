-- Persistent receipt images for hosted receipt/download pages.
-- Safe to run repeatedly.

CREATE TABLE IF NOT EXISTS public.receipt_images (
  code TEXT PRIMARY KEY,
  operation_id TEXT,
  tx_hash TEXT,
  session_id TEXT,
  user_id TEXT,
  receipt_type TEXT,
  image_data_url TEXT NOT NULL,
  image_mime TEXT NOT NULL DEFAULT 'image/svg+xml',
  metadata JSONB DEFAULT '{}',
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.receipt_images
  ADD COLUMN IF NOT EXISTS operation_id TEXT,
  ADD COLUMN IF NOT EXISTS tx_hash TEXT,
  ADD COLUMN IF NOT EXISTS session_id TEXT,
  ADD COLUMN IF NOT EXISTS user_id TEXT,
  ADD COLUMN IF NOT EXISTS receipt_type TEXT,
  ADD COLUMN IF NOT EXISTS image_data_url TEXT,
  ADD COLUMN IF NOT EXISTS image_mime TEXT NOT NULL DEFAULT 'image/svg+xml',
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_receipt_images_tx_hash
  ON public.receipt_images (tx_hash)
  WHERE tx_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_receipt_images_session_created
  ON public.receipt_images (session_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_receipt_images_user_created
  ON public.receipt_images (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_receipt_images_expires_at
  ON public.receipt_images (expires_at);

ALTER TABLE IF EXISTS public.receipt_images ENABLE ROW LEVEL SECURITY;
