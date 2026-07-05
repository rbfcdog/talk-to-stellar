-- Allow the same account email to be attached to MULTIPLE agent_sessions.
--
-- The dollar-account wallets are keyed by email (bridge_stellar_wallets.email),
-- so the same user logging in from several devices (each a fresh session) must
-- be able to link the same email on every one of them. The old unique index
-- (idx_agent_sessions_email_lower_unique) allowed the email on only one session
-- at a time, so a second device hit "duplicate key value violates unique
-- constraint" when linking. Drop the uniqueness and keep a plain lookup index.

BEGIN;

DROP INDEX IF EXISTS idx_agent_sessions_email_lower_unique;

-- Non-unique index so email lookups on agent_sessions stay fast.
CREATE INDEX IF NOT EXISTS idx_agent_sessions_email_lower
  ON public.agent_sessions ((lower(email)))
  WHERE email IS NOT NULL AND btrim(email) <> '';

COMMIT;
