-- Recreate external identity unique indexes so empty/invalid identity values
-- do not collide, and alias rows do not duplicate phone/email/CPF identities.

DO $$
BEGIN
  IF to_regclass('public.external_accounts') IS NOT NULL THEN
    -- Remove blank normalized identity values before creating partial indexes.
    UPDATE public.external_accounts
      SET data = coalesce(data, '{}'::jsonb) - 'phone_number' - 'phoneNumber',
          updated_at = now()
      WHERE nullif(regexp_replace(coalesce(data->>'phone_number', data->>'phoneNumber', ''), '\D', '', 'g'), '') IS NULL
        AND (
          coalesce(data->>'phone_number', '') <> ''
          OR coalesce(data->>'phoneNumber', '') <> ''
        );

    UPDATE public.external_accounts
      SET data = coalesce(data, '{}'::jsonb) - 'cpf',
          updated_at = now()
      WHERE nullif(regexp_replace(coalesce(data->>'cpf', ''), '\D', '', 'g'), '') IS NULL
        AND coalesce(data->>'cpf', '') <> '';

    UPDATE public.external_accounts
      SET data = coalesce(data, '{}'::jsonb) - 'email',
          updated_at = now()
      WHERE nullif(lower(btrim(coalesce(data->>'email', ''))), '') IS NULL
        AND coalesce(data->>'email', '') <> '';

    -- If legacy alias rows duplicated an identity value, keep it only on the
    -- newest row. Provider/provider_user_id still links all aliases.
    WITH ranked_phone AS (
      SELECT
        id,
        row_number() OVER (
          PARTITION BY regexp_replace(coalesce(data->>'phone_number', data->>'phoneNumber', ''), '\D', '', 'g')
          ORDER BY coalesce(updated_at, created_at, now()) DESC, id DESC
        ) AS rn
      FROM public.external_accounts
      WHERE nullif(regexp_replace(coalesce(data->>'phone_number', data->>'phoneNumber', ''), '\D', '', 'g'), '') IS NOT NULL
    )
    UPDATE public.external_accounts ea
      SET data = coalesce(ea.data, '{}'::jsonb) - 'phone_number' - 'phoneNumber' - 'whatsapp_number' - 'whatsappNumber',
          updated_at = now()
      FROM ranked_phone r
      WHERE ea.id = r.id
        AND r.rn > 1;

    WITH ranked_email AS (
      SELECT
        id,
        row_number() OVER (
          PARTITION BY lower(btrim(coalesce(data->>'email', '')))
          ORDER BY coalesce(updated_at, created_at, now()) DESC, id DESC
        ) AS rn
      FROM public.external_accounts
      WHERE nullif(lower(btrim(coalesce(data->>'email', ''))), '') IS NOT NULL
    )
    UPDATE public.external_accounts ea
      SET data = coalesce(ea.data, '{}'::jsonb) - 'email',
          updated_at = now()
      FROM ranked_email r
      WHERE ea.id = r.id
        AND r.rn > 1;

    WITH ranked_cpf AS (
      SELECT
        id,
        row_number() OVER (
          PARTITION BY regexp_replace(coalesce(data->>'cpf', ''), '\D', '', 'g')
          ORDER BY coalesce(updated_at, created_at, now()) DESC, id DESC
        ) AS rn
      FROM public.external_accounts
      WHERE nullif(regexp_replace(coalesce(data->>'cpf', ''), '\D', '', 'g'), '') IS NOT NULL
    )
    UPDATE public.external_accounts ea
      SET data = coalesce(ea.data, '{}'::jsonb) - 'cpf',
          updated_at = now()
      FROM ranked_cpf r
      WHERE ea.id = r.id
        AND r.rn > 1;
  END IF;
END $$;

DROP INDEX IF EXISTS public.idx_external_accounts_data_email_lower_unique;
DROP INDEX IF EXISTS public.idx_external_accounts_data_phone_unique;
DROP INDEX IF EXISTS public.idx_external_accounts_data_cpf_unique;

DO $$
BEGIN
  IF to_regclass('public.external_accounts') IS NOT NULL THEN
    CREATE UNIQUE INDEX IF NOT EXISTS idx_external_accounts_data_email_lower_unique
      ON public.external_accounts ((lower(btrim(coalesce(data->>'email', '')))))
      WHERE nullif(lower(btrim(coalesce(data->>'email', ''))), '') IS NOT NULL;

    CREATE UNIQUE INDEX IF NOT EXISTS idx_external_accounts_data_phone_unique
      ON public.external_accounts ((regexp_replace(coalesce(data->>'phone_number', data->>'phoneNumber', ''), '\D', '', 'g')))
      WHERE nullif(regexp_replace(coalesce(data->>'phone_number', data->>'phoneNumber', ''), '\D', '', 'g'), '') IS NOT NULL;

    CREATE UNIQUE INDEX IF NOT EXISTS idx_external_accounts_data_cpf_unique
      ON public.external_accounts ((regexp_replace(coalesce(data->>'cpf', ''), '\D', '', 'g')))
      WHERE nullif(regexp_replace(coalesce(data->>'cpf', ''), '\D', '', 'g'), '') IS NOT NULL;
  END IF;
END $$;
