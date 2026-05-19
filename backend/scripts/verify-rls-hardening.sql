-- Verifies that backend/migrations/20260518_01_security_hardening_public_surface.sql
-- has been applied from a trusted Supabase admin/Postgres connection.

DO $$
DECLARE
  violations integer;
BEGIN
  SELECT count(*) INTO violations
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'exec_sql';

  IF violations > 0 THEN
    RAISE EXCEPTION 'public.exec_sql still exists';
  END IF;

  SELECT count(*) INTO violations
  FROM information_schema.routine_privileges
  WHERE routine_schema = 'public'
    AND routine_name IN ('store_private_key', 'get_private_key')
    AND grantee IN ('PUBLIC', 'anon', 'authenticated');

  IF violations > 0 THEN
    RAISE EXCEPTION 'Vault helper functions are still executable by public/browser roles';
  END IF;

  WITH sensitive_tables(table_name) AS (
    VALUES
      ('agent_sessions'),
      ('wallets'),
      ('operations'),
      ('user_passkeys'),
      ('passkey_challenges'),
      ('agent_states'),
      ('agent_messages'),
      ('external_accounts'),
      ('contacts'),
      ('recovery_otps'),
      ('conversion_rules'),
      ('audit_events'),
      ('scheduled_payments'),
      ('whitelisted_assets'),
      ('pin_reset_tokens'),
      ('payment_logs'),
      ('payment_confirmations'),
      ('financial_insights'),
      ('financial_events'),
      ('currency_rate_history'),
      ('treasury_profiles'),
      ('treasury_recommendations'),
      ('invoices'),
      ('global_profiles'),
      ('idempotency_keys'),
      ('telegram_update_dedupes'),
      ('short_links'),
      ('onboarding_finalizations'),
      ('logout_confirmations'),
      ('receipt_images'),
      ('external_bank_accounts'),
      ('email_confirmations'),
      ('stellar_network_configs')
  )
  SELECT count(*) INTO violations
  FROM sensitive_tables st
  JOIN pg_class c ON c.relname = st.table_name
  JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
  WHERE c.relkind = 'r'
    AND (NOT c.relrowsecurity OR NOT c.relforcerowsecurity);

  IF violations > 0 THEN
    RAISE EXCEPTION 'One or more sensitive tables do not have RLS + FORCE RLS enabled';
  END IF;

  SELECT count(*) INTO violations
  FROM information_schema.table_privileges
  WHERE table_schema = 'public'
    AND grantee IN ('PUBLIC', 'anon', 'authenticated')
    AND table_name IN (
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
    );

  IF violations > 0 THEN
    RAISE EXCEPTION 'Public/browser roles still have direct table privileges on sensitive tables';
  END IF;

  RAISE NOTICE 'RLS hardening verification passed.';
END $$;
