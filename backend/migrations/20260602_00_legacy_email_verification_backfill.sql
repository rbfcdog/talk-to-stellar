  -- Marks accounts created before the email-verification rollout as already verified.
  -- Cutoff captured when this migration was authored:
  --   2026-06-02T15:52:09Z / 2026-06-02 12:52:09 America/Sao_Paulo
  --
  -- Newer accounts still need the normal e-mail confirmation code.

  ALTER TABLE IF EXISTS public.agent_sessions
    ADD COLUMN IF NOT EXISTS email_verified boolean NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS email_verified_at timestamptz,
    ADD COLUMN IF NOT EXISTS email_verification_source text;

  UPDATE public.agent_sessions
  SET
    email_verified = true,
    email_verified_at = COALESCE(email_verified_at, TIMESTAMPTZ '2026-06-02T15:52:09Z'),
    email_verification_source = COALESCE(NULLIF(email_verification_source, ''), 'legacy_backfill_20260602'),
    updated_at = now()
  WHERE created_at < TIMESTAMPTZ '2026-06-02T15:52:09Z'
    AND email_verified IS DISTINCT FROM true
    AND (
      btrim(coalesce(email, '')) <> ''
      OR btrim(coalesce(user_id, '')) <> ''
    );

  CREATE INDEX IF NOT EXISTS idx_agent_sessions_email_verified
    ON public.agent_sessions (email_verified, email_verified_at);

  CREATE INDEX IF NOT EXISTS idx_agent_sessions_verified_email_lower
    ON public.agent_sessions ((lower(email)))
    WHERE email_verified = true
      AND email IS NOT NULL
      AND btrim(email) <> '';
