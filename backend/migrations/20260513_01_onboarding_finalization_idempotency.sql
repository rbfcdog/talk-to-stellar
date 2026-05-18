-- Idempotency guard for onboarding finalization links.
-- Safe to run repeatedly.

CREATE TABLE IF NOT EXISTS public.onboarding_finalizations (
  id BIGSERIAL PRIMARY KEY,
  token_hash TEXT NOT NULL,
  provider TEXT NOT NULL,
  provider_user_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'processing',
  used BOOLEAN NOT NULL DEFAULT false,
  used_at TIMESTAMPTZ,
  session_id TEXT,
  user_id TEXT,
  response_status INTEGER,
  result JSONB,
  data JSONB,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

ALTER TABLE public.onboarding_finalizations
  ADD COLUMN IF NOT EXISTS token_hash TEXT,
  ADD COLUMN IF NOT EXISTS provider TEXT,
  ADD COLUMN IF NOT EXISTS provider_user_id TEXT,
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'processing',
  ADD COLUMN IF NOT EXISTS used BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS used_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS session_id TEXT,
  ADD COLUMN IF NOT EXISTS user_id TEXT,
  ADD COLUMN IF NOT EXISTS response_status INTEGER,
  ADD COLUMN IF NOT EXISTS result JSONB,
  ADD COLUMN IF NOT EXISTS data JSONB,
  ADD COLUMN IF NOT EXISTS error TEXT,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS ux_onboarding_finalizations_token_hash
  ON public.onboarding_finalizations (token_hash)
  WHERE token_hash IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_onboarding_finalizations_provider_user
  ON public.onboarding_finalizations (provider, provider_user_id)
  WHERE provider IS NOT NULL AND provider_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_onboarding_finalizations_status
  ON public.onboarding_finalizations (status);

CREATE INDEX IF NOT EXISTS idx_onboarding_finalizations_used
  ON public.onboarding_finalizations (used);

CREATE INDEX IF NOT EXISTS idx_onboarding_finalizations_completed_at
  ON public.onboarding_finalizations (completed_at DESC);

ALTER TABLE IF EXISTS public.onboarding_finalizations ENABLE ROW LEVEL SECURITY;
