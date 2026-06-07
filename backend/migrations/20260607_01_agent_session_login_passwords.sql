-- Login password state for account login.
-- Existing users keep PIN login through application fallback until they define
-- a login password; this migration only stores the new password/lockout state.
ALTER TABLE IF EXISTS public.agent_sessions
  ADD COLUMN IF NOT EXISTS login_password_hash TEXT,
  ADD COLUMN IF NOT EXISTS login_failed_attempts INTEGER,
  ADD COLUMN IF NOT EXISTS login_locked_until TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS login_last_failed_at TIMESTAMPTZ;

ALTER TABLE IF EXISTS public.agent_sessions
  ALTER COLUMN login_failed_attempts SET DEFAULT 0;

UPDATE public.agent_sessions
SET login_failed_attempts = 0
WHERE login_failed_attempts IS NULL;

ALTER TABLE IF EXISTS public.agent_sessions
  ALTER COLUMN login_failed_attempts SET NOT NULL;

DO $$
BEGIN
  IF to_regclass('public.agent_sessions') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conrelid = 'public.agent_sessions'::regclass
         AND conname = 'agent_sessions_login_failed_attempts_nonnegative'
     ) THEN
    ALTER TABLE public.agent_sessions
      ADD CONSTRAINT agent_sessions_login_failed_attempts_nonnegative
      CHECK (login_failed_attempts >= 0) NOT VALID;
  END IF;

  IF to_regclass('public.agent_sessions') IS NOT NULL THEN
    ALTER TABLE public.agent_sessions
      VALIDATE CONSTRAINT agent_sessions_login_failed_attempts_nonnegative;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_agent_sessions_login_locked_until
  ON public.agent_sessions (login_locked_until)
  WHERE login_locked_until IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_agent_sessions_login_failed_attempts
  ON public.agent_sessions (login_failed_attempts)
  WHERE login_failed_attempts > 0;

COMMENT ON COLUMN public.agent_sessions.login_password_hash IS
  'Hash used for email/password login. Legacy users can still fall back to PIN until this is set.';
COMMENT ON COLUMN public.agent_sessions.login_failed_attempts IS
  'Consecutive failed email/password login attempts.';
COMMENT ON COLUMN public.agent_sessions.login_locked_until IS
  'Temporary account login lock expiration after repeated failed password attempts.';
COMMENT ON COLUMN public.agent_sessions.login_last_failed_at IS
  'Timestamp of the latest failed email/password login attempt.';
