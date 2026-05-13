-- Reinforce uniqueness for identity fields used as transfer identifiers.
-- This migration is idempotent and also cleans legacy duplicates before creating unique indexes.

DO $$
BEGIN
  IF to_regclass('public.agent_sessions') IS NOT NULL THEN
    -- Keep only the newest e-mail per normalized value.
    -- IMPORTANT: email is NOT NULL in agent_sessions, so never write NULL here.
    -- For duplicates (or known placeholders), rewrite secondary rows to deterministic unique placeholders.
    WITH ranked_email AS (
      SELECT
        ctid AS row_id,
        session_id,
        lower(btrim(coalesce(email, ''))) AS normalized_email,
        row_number() OVER (
          PARTITION BY lower(btrim(email))
          ORDER BY coalesce(updated_at, created_at, now()) DESC, session_id DESC
        ) AS rn
      FROM public.agent_sessions
      WHERE email IS NOT NULL AND btrim(email) <> ''
    )
    UPDATE public.agent_sessions s
      SET email = concat(
        'dedup+',
        substr(replace(s.session_id::text, '-', ''), 1, 24),
        '@local.test'
      )
      FROM ranked_email r
      WHERE s.ctid = r.row_id
        AND (
          r.rn > 1
          OR r.normalized_email = 'unknown@example.com'
          OR r.normalized_email LIKE '%@local.test'
        );

    -- Keep only the newest phone number per normalized digits.
    WITH ranked_phone AS (
      SELECT
        ctid AS row_id,
        row_number() OVER (
          PARTITION BY regexp_replace(phone_number, '\D', '', 'g')
          ORDER BY coalesce(updated_at, created_at, now()) DESC, session_id DESC
        ) AS rn
      FROM public.agent_sessions
      WHERE phone_number IS NOT NULL AND btrim(phone_number) <> ''
    )
    UPDATE public.agent_sessions s
      SET phone_number = NULL
      FROM ranked_phone r
      WHERE s.ctid = r.row_id
        AND r.rn > 1;
  END IF;

  IF to_regclass('public.external_accounts') IS NOT NULL THEN
    -- Keep only the newest external_accounts e-mail per normalized value.
    WITH ranked_external_email AS (
      SELECT
        id,
        row_number() OVER (
          PARTITION BY lower(btrim(coalesce(data->>'email', '')))
          ORDER BY coalesce(updated_at, created_at, now()) DESC, id DESC
        ) AS rn
      FROM public.external_accounts
      WHERE btrim(coalesce(data->>'email', '')) <> ''
    )
    UPDATE public.external_accounts ea
      SET data = coalesce(ea.data, '{}'::jsonb) - 'email',
          updated_at = now()
      FROM ranked_external_email r
      WHERE ea.id = r.id
        AND r.rn > 1;

    -- Keep only the newest external_accounts phone per normalized digits.
    WITH ranked_external_phone AS (
      SELECT
        id,
        row_number() OVER (
          PARTITION BY regexp_replace(coalesce(data->>'phone_number', ''), '\D', '', 'g')
          ORDER BY coalesce(updated_at, created_at, now()) DESC, id DESC
        ) AS rn
      FROM public.external_accounts
      WHERE coalesce(data->>'phone_number', '') <> ''
    )
    UPDATE public.external_accounts ea
      SET data = coalesce(ea.data, '{}'::jsonb) - 'phone_number',
          updated_at = now()
      FROM ranked_external_phone r
      WHERE ea.id = r.id
        AND r.rn > 1;

    -- Keep only the newest external_accounts CPF per normalized digits.
    WITH ranked_external_cpf AS (
      SELECT
        id,
        row_number() OVER (
          PARTITION BY regexp_replace(coalesce(data->>'cpf', ''), '\D', '', 'g')
          ORDER BY coalesce(updated_at, created_at, now()) DESC, id DESC
        ) AS rn
      FROM public.external_accounts
      WHERE coalesce(data->>'cpf', '') <> ''
    )
    UPDATE public.external_accounts ea
      SET data = coalesce(ea.data, '{}'::jsonb) - 'cpf',
          updated_at = now()
      FROM ranked_external_cpf r
      WHERE ea.id = r.id
        AND r.rn > 1;
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_sessions_email_lower_unique
  ON public.agent_sessions ((lower(email)))
  WHERE email IS NOT NULL AND btrim(email) <> '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_sessions_phone_unique
  ON public.agent_sessions (phone_number)
  WHERE phone_number IS NOT NULL AND btrim(phone_number) <> '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_external_accounts_data_email_lower_unique
  ON public.external_accounts ((lower(btrim(coalesce(data->>'email', '')))))
  WHERE btrim(coalesce(data->>'email', '')) <> '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_external_accounts_data_phone_unique
  ON public.external_accounts ((regexp_replace(coalesce(data->>'phone_number', ''), '\D', '', 'g')))
  WHERE coalesce(data->>'phone_number', '') <> '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_external_accounts_data_cpf_unique
  ON public.external_accounts ((regexp_replace(coalesce(data->>'cpf', ''), '\D', '', 'g')))
  WHERE coalesce(data->>'cpf', '') <> '';
