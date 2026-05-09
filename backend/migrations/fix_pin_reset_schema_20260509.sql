BEGIN;

-- 0) Extensions
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- 1) agent_sessions: ensure both PIN hash columns exist
ALTER TABLE public.agent_sessions
  ADD COLUMN IF NOT EXISTS password_hash TEXT,
  ADD COLUMN IF NOT EXISTS session_password_hash TEXT;

-- Backfill missing values between legacy/new columns
UPDATE public.agent_sessions
SET session_password_hash = password_hash
WHERE session_password_hash IS NULL AND password_hash IS NOT NULL;

UPDATE public.agent_sessions
SET password_hash = session_password_hash
WHERE password_hash IS NULL AND session_password_hash IS NOT NULL;

-- Keep both columns in sync for old/new code paths
CREATE OR REPLACE FUNCTION public.sync_agent_session_pin_hash()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.session_password_hash IS NULL AND NEW.password_hash IS NOT NULL THEN
    NEW.session_password_hash := NEW.password_hash;
  ELSIF NEW.password_hash IS NULL AND NEW.session_password_hash IS NOT NULL THEN
    NEW.password_hash := NEW.session_password_hash;
  ELSIF NEW.password_hash IS DISTINCT FROM OLD.password_hash
        AND NEW.session_password_hash IS NOT DISTINCT FROM OLD.session_password_hash THEN
    NEW.session_password_hash := NEW.password_hash;
  ELSIF NEW.session_password_hash IS DISTINCT FROM OLD.session_password_hash
        AND NEW.password_hash IS NOT DISTINCT FROM OLD.password_hash THEN
    NEW.password_hash := NEW.session_password_hash;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_agent_session_pin_hash ON public.agent_sessions;
CREATE TRIGGER trg_sync_agent_session_pin_hash
BEFORE INSERT OR UPDATE ON public.agent_sessions
FOR EACH ROW
EXECUTE FUNCTION public.sync_agent_session_pin_hash();

-- 2) pin_reset_tokens: create table compatible with TEXT user_id model
-- (no hard FK to auth.users, because this app can use email/text user ids)
CREATE TABLE IF NOT EXISTS public.pin_reset_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  session_id UUID NOT NULL,
  reset_token TEXT UNIQUE NOT NULL,
  token_hash TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ NULL,
  new_pin_hash TEXT NULL
);

-- If table exists with wrong type (e.g. UUID), convert safely
DO $$
DECLARE
  v_type TEXT;
BEGIN
  SELECT data_type
    INTO v_type
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'pin_reset_tokens'
    AND column_name = 'user_id';

  IF v_type IS NOT NULL AND v_type <> 'text' THEN
    ALTER TABLE public.pin_reset_tokens
      ALTER COLUMN user_id TYPE TEXT USING user_id::TEXT;
  END IF;
END $$;

-- Ensure required columns exist (for partially created tables)
ALTER TABLE public.pin_reset_tokens
  ADD COLUMN IF NOT EXISTS user_id TEXT,
  ADD COLUMN IF NOT EXISTS session_id UUID,
  ADD COLUMN IF NOT EXISTS reset_token TEXT,
  ADD COLUMN IF NOT EXISTS token_hash TEXT,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT now(),
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS used_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS new_pin_hash TEXT;

-- Useful indexes
CREATE INDEX IF NOT EXISTS idx_pin_reset_tokens_user_expires
  ON public.pin_reset_tokens (user_id, expires_at);

CREATE INDEX IF NOT EXISTS idx_pin_reset_tokens_session_id
  ON public.pin_reset_tokens (session_id);

CREATE INDEX IF NOT EXISTS idx_pin_reset_tokens_used_at
  ON public.pin_reset_tokens (used_at);

CREATE INDEX IF NOT EXISTS idx_pin_reset_tokens_token_hash
  ON public.pin_reset_tokens (token_hash);

-- 3) In this project we use backend service role; keep table unrestricted
-- to avoid reset flow failures in environments with RLS defaults.
ALTER TABLE public.pin_reset_tokens DISABLE ROW LEVEL SECURITY;

COMMIT;

