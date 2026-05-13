-- Single-use confirmation tokens for logout links.

CREATE TABLE IF NOT EXISTS public.logout_confirmations (
  id BIGSERIAL PRIMARY KEY,
  token_hash TEXT NOT NULL,
  session_id TEXT,
  user_id TEXT,
  provider TEXT,
  provider_user_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  used BOOLEAN NOT NULL DEFAULT FALSE,
  used_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_logout_confirmations_token_hash
  ON public.logout_confirmations (token_hash)
  WHERE token_hash IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_logout_confirmations_status
  ON public.logout_confirmations (status);

CREATE INDEX IF NOT EXISTS idx_logout_confirmations_used
  ON public.logout_confirmations (used);

CREATE INDEX IF NOT EXISTS idx_logout_confirmations_expires_at
  ON public.logout_confirmations (expires_at);

ALTER TABLE IF EXISTS public.logout_confirmations DISABLE ROW LEVEL SECURITY;
