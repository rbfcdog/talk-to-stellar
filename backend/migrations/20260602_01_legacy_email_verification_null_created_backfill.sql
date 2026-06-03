-- Completes the legacy e-mail verification backfill for old rows that may have
-- a missing created_at value or were skipped by the first cutoff-only migration.
--
-- Cutoff captured when this corrective migration was last updated:
--   2026-06-02T16:40:00Z / 2026-06-02 13:40:00 America/Sao_Paulo

ALTER TABLE IF EXISTS public.agent_sessions
  ADD COLUMN IF NOT EXISTS email_verified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS email_verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS email_verification_source text;

UPDATE public.agent_sessions
SET
  email_verified = true,
  email_verified_at = COALESCE(email_verified_at, TIMESTAMPTZ '2026-06-02T16:40:00Z'),
  email_verification_source = COALESCE(NULLIF(email_verification_source, ''), 'legacy_backfill_20260602_null_created'),
  updated_at = now()
WHERE email_verified IS DISTINCT FROM true
  AND (
    created_at IS NULL
    OR created_at < TIMESTAMPTZ '2026-06-02T16:40:00Z'
  )
  AND (
    btrim(coalesce(email, '')) <> ''
    OR btrim(coalesce(user_id, '')) <> ''
  );

UPDATE public.agent_sessions s
SET
  email_verified = true,
  email_verified_at = COALESCE(s.email_verified_at, TIMESTAMPTZ '2026-06-02T16:40:00Z'),
  email_verification_source = COALESCE(NULLIF(s.email_verification_source, ''), 'legacy_backfill_20260602_external_channel'),
  updated_at = now()
FROM public.external_accounts ea
WHERE s.email_verified IS DISTINCT FROM true
  AND ea.session_id IS NOT NULL
  AND ea.session_id::text = s.session_id::text
  AND lower(btrim(coalesce(ea.provider, ''))) IN ('whatsapp', 'phone', 'telegram', 'evolution', 'whatsapp_evolution')
  AND (
    ea.created_at IS NULL
    OR ea.created_at < TIMESTAMPTZ '2026-06-02T16:40:00Z'
  )
  AND (
    btrim(coalesce(s.email, '')) <> ''
    OR btrim(coalesce(s.user_id, '')) <> ''
  );

CREATE INDEX IF NOT EXISTS idx_agent_sessions_verified_user_id_lower
  ON public.agent_sessions ((lower(user_id)))
  WHERE email_verified = true
    AND user_id IS NOT NULL
    AND btrim(user_id) <> '';
