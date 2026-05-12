-- Global idempotency and duplicate-prevention hardening.

CREATE TABLE IF NOT EXISTS public.idempotency_keys (
  id BIGSERIAL PRIMARY KEY,
  idempotency_key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  method TEXT NOT NULL,
  route TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'completed', 'failed')),
  response_status INTEGER,
  response_body JSONB,
  session_id TEXT,
  user_id TEXT,
  locked_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_idempotency_keys_key
  ON public.idempotency_keys (idempotency_key);
CREATE INDEX IF NOT EXISTS idx_idempotency_keys_route_status
  ON public.idempotency_keys (route, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_idempotency_keys_session
  ON public.idempotency_keys (session_id, created_at DESC);
ALTER TABLE IF EXISTS public.idempotency_keys DISABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.telegram_update_dedupes (
  update_id TEXT PRIMARY KEY,
  chat_id TEXT,
  status TEXT NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'completed', 'failed')),
  response JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE IF EXISTS public.telegram_update_dedupes DISABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.short_links (
  code TEXT PRIMARY KEY,
  url TEXT NOT NULL,
  purpose TEXT,
  token_hash TEXT,
  session_id TEXT,
  user_id TEXT,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_short_links_token_purpose
  ON public.short_links (token_hash, purpose)
  WHERE token_hash IS NOT NULL AND purpose IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_short_links_expires_at ON public.short_links (expires_at);
ALTER TABLE IF EXISTS public.short_links DISABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF to_regclass('public.wallets') IS NOT NULL THEN
    ALTER TABLE public.wallets ADD COLUMN IF NOT EXISTS operation_fingerprint TEXT;
    CREATE UNIQUE INDEX IF NOT EXISTS ux_wallets_session_id ON public.wallets (session_id) WHERE session_id IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS ux_wallets_public_key ON public.wallets (public_key) WHERE public_key IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS ux_wallets_pix_key ON public.wallets (lower(pix_key)) WHERE pix_key IS NOT NULL;
  END IF;

  IF to_regclass('public.external_accounts') IS NOT NULL THEN
    CREATE UNIQUE INDEX IF NOT EXISTS ux_external_accounts_provider_user
      ON public.external_accounts (provider, provider_user_id);
  END IF;

  IF to_regclass('public.user_passkeys') IS NOT NULL THEN
    CREATE UNIQUE INDEX IF NOT EXISTS ux_user_passkeys_credential
      ON public.user_passkeys (credential_id);
  END IF;

  IF to_regclass('public.payment_confirmations') IS NOT NULL THEN
    ALTER TABLE public.payment_confirmations ADD COLUMN IF NOT EXISTS operation_fingerprint TEXT;
    CREATE UNIQUE INDEX IF NOT EXISTS ux_payment_confirmations_token_hash
      ON public.payment_confirmations (token_hash) WHERE token_hash IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS ux_payment_confirmations_payment_hash
      ON public.payment_confirmations (payment_hash) WHERE payment_hash IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS ux_payment_confirmations_fingerprint
      ON public.payment_confirmations (operation_fingerprint) WHERE operation_fingerprint IS NOT NULL;
  END IF;

  IF to_regclass('public.payment_logs') IS NOT NULL THEN
    ALTER TABLE public.payment_logs ADD COLUMN IF NOT EXISTS operation_fingerprint TEXT;
    CREATE UNIQUE INDEX IF NOT EXISTS ux_payment_logs_payment_hash
      ON public.payment_logs (payment_hash) WHERE payment_hash IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS ux_payment_logs_fingerprint
      ON public.payment_logs (operation_fingerprint) WHERE operation_fingerprint IS NOT NULL;
  END IF;

  IF to_regclass('public.operations') IS NOT NULL THEN
    ALTER TABLE public.operations ADD COLUMN IF NOT EXISTS operation_fingerprint TEXT;
    ALTER TABLE public.operations ADD COLUMN IF NOT EXISTS transaction_hash TEXT;
    UPDATE public.operations
      SET transaction_hash = stellar_transaction_hash
      WHERE transaction_hash IS NULL AND stellar_transaction_hash IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS ux_operations_tx_hash
      ON public.operations (transaction_hash) WHERE transaction_hash IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS ux_operations_stellar_tx_hash
      ON public.operations (stellar_transaction_hash) WHERE stellar_transaction_hash IS NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS ux_operations_fingerprint
      ON public.operations (operation_fingerprint) WHERE operation_fingerprint IS NOT NULL;
  END IF;

  IF to_regclass('public.invoices') IS NOT NULL THEN
    ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS operation_fingerprint TEXT;
    CREATE UNIQUE INDEX IF NOT EXISTS ux_invoices_fingerprint
      ON public.invoices (operation_fingerprint) WHERE operation_fingerprint IS NOT NULL;
  END IF;

  IF to_regclass('public.global_profiles') IS NOT NULL THEN
    CREATE UNIQUE INDEX IF NOT EXISTS ux_global_profiles_username
      ON public.global_profiles (lower(username)) WHERE username IS NOT NULL;
  END IF;

  IF to_regclass('public.financial_events') IS NOT NULL THEN
    CREATE UNIQUE INDEX IF NOT EXISTS ux_financial_events_dedupe_key
      ON public.financial_events (dedupe_key) WHERE dedupe_key IS NOT NULL;
  END IF;

  IF to_regclass('public.financial_insights') IS NOT NULL THEN
    ALTER TABLE public.financial_insights ADD COLUMN IF NOT EXISTS dedupe_key TEXT;
    CREATE UNIQUE INDEX IF NOT EXISTS ux_financial_insights_dedupe_key
      ON public.financial_insights (dedupe_key) WHERE dedupe_key IS NOT NULL;
  END IF;

  IF to_regclass('public.agent_messages') IS NOT NULL THEN
    ALTER TABLE public.agent_messages ADD COLUMN IF NOT EXISTS dedupe_key TEXT;
    CREATE UNIQUE INDEX IF NOT EXISTS ux_agent_messages_dedupe_key
      ON public.agent_messages (dedupe_key) WHERE dedupe_key IS NOT NULL;
  END IF;
END $$;
