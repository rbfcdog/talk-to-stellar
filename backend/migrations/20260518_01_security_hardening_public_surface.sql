-- Security hardening for production Supabase projects.
-- Run this from a trusted Supabase SQL/admin context, not through app startup.

BEGIN;

-- Remove the generic SQL executor. Application runtime must not expose a
-- SECURITY DEFINER RPC capable of running arbitrary SQL text.
DROP FUNCTION IF EXISTS public.exec_sql(text);

-- Vault helpers are allowed only for the backend service role. Browser-facing
-- roles must never be able to store or read private keys directly.
DO $$
DECLARE
  proc regprocedure;
  role_name text;
BEGIN
  FOR proc IN
    SELECT p.oid::regprocedure
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname IN ('store_private_key', 'get_private_key')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', proc);

    FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated']
    LOOP
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %I', proc, role_name);
      END IF;
    END LOOP;

    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', proc);
    END IF;
  END LOOP;
END $$;

-- The backend uses the Supabase service role and should bypass RLS. Public
-- anon/authenticated roles get no direct table access by default.
DO $$
DECLARE
  table_name text;
  role_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'agent_sessions',
    'wallets',
    'operations',
    'user_passkeys',
    'passkey_challenges',
    'agent_states',
    'agent_messages',
    'external_accounts',
    'contacts',
    'recovery_otps',
    'conversion_rules',
    'audit_events',
    'scheduled_payments',
    'whitelisted_assets',
    'pin_reset_tokens',
    'payment_logs',
    'payment_confirmations',
    'financial_insights',
    'financial_events',
    'currency_rate_history',
    'treasury_profiles',
    'treasury_recommendations',
    'invoices',
    'global_profiles',
    'idempotency_keys',
    'telegram_update_dedupes',
    'short_links',
    'onboarding_finalizations',
    'logout_confirmations',
    'receipt_images',
    'external_bank_accounts',
    'email_confirmations',
    'stellar_network_configs'
  ]
  LOOP
    IF to_regclass(format('public.%I', table_name)) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', table_name);
      EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', table_name);
      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC', table_name);

      FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated']
      LOOP
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = role_name) THEN
          EXECUTE format('REVOKE ALL ON TABLE public.%I FROM %I', table_name, role_name);
        END IF;
      END LOOP;

      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
        EXECUTE format('GRANT ALL ON TABLE public.%I TO service_role', table_name);
      END IF;
    END IF;
  END LOOP;
END $$;

-- Keep service-role access to sequences used by INSERTs after table grants.
DO $$
DECLARE
  seq record;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    FOR seq IN
      SELECT schemaname, sequencename
      FROM pg_sequences
      WHERE schemaname = 'public'
    LOOP
      EXECUTE format('GRANT USAGE, SELECT, UPDATE ON SEQUENCE %I.%I TO service_role', seq.schemaname, seq.sequencename);
    END LOOP;
  END IF;
END $$;

COMMIT;
