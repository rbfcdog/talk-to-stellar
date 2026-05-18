-- TalkToStellar - preparacao isolada para Stellar Mainnet.
--
-- Esta migration e intencionalmente separada do runner migrate:required.
-- Ela apenas adiciona metadados de rede e uma tabela de perfis de rede para
-- evitar mistura futura entre dados Testnet e Mainnet. O runtime atual deve
-- continuar usando STELLAR_NETWORK=TESTNET.

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE t.typname = 'stellar_network'
      AND n.nspname = 'public'
  ) THEN
    CREATE TYPE public.stellar_network AS ENUM ('TESTNET', 'PUBLIC');
  END IF;
END
$$;

CREATE TABLE IF NOT EXISTS public.stellar_network_configs (
  network public.stellar_network PRIMARY KEY,
  horizon_url TEXT NOT NULL,
  network_passphrase TEXT NOT NULL,
  friendbot_url TEXT,
  stellar_expert_url TEXT NOT NULL,
  active_runtime BOOLEAN NOT NULL DEFAULT false,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.stellar_network_configs (
  network,
  horizon_url,
  network_passphrase,
  friendbot_url,
  stellar_expert_url,
  active_runtime,
  notes
)
VALUES
  (
    'TESTNET',
    'https://horizon-testnet.stellar.org',
    'Test SDF Network ; September 2015',
    'https://friendbot.stellar.org',
    'https://stellar.expert/explorer/testnet',
    true,
    'Rede ativa atual do produto.'
  ),
  (
    'PUBLIC',
    'https://horizon.stellar.org',
    'Public Global Stellar Network ; September 2015',
    NULL,
    'https://stellar.expert/explorer/public',
    false,
    'Perfil preparado para Mainnet. Nao ativar sem cutover aprovado.'
  )
ON CONFLICT (network) DO UPDATE SET
  horizon_url = EXCLUDED.horizon_url,
  network_passphrase = EXCLUDED.network_passphrase,
  friendbot_url = EXCLUDED.friendbot_url,
  stellar_expert_url = EXCLUDED.stellar_expert_url,
  notes = EXCLUDED.notes,
  updated_at = now();

ALTER TABLE IF EXISTS public.agent_sessions
  ADD COLUMN IF NOT EXISTS stellar_network public.stellar_network NOT NULL DEFAULT 'TESTNET';

ALTER TABLE IF EXISTS public.wallets
  ADD COLUMN IF NOT EXISTS stellar_network public.stellar_network NOT NULL DEFAULT 'TESTNET';

ALTER TABLE IF EXISTS public.operations
  ADD COLUMN IF NOT EXISTS stellar_network public.stellar_network NOT NULL DEFAULT 'TESTNET';

ALTER TABLE IF EXISTS public.contacts
  ADD COLUMN IF NOT EXISTS stellar_network public.stellar_network NOT NULL DEFAULT 'TESTNET';

ALTER TABLE IF EXISTS public.external_accounts
  ADD COLUMN IF NOT EXISTS stellar_network public.stellar_network NOT NULL DEFAULT 'TESTNET';

ALTER TABLE IF EXISTS public.payment_logs
  ADD COLUMN IF NOT EXISTS stellar_network public.stellar_network NOT NULL DEFAULT 'TESTNET';

ALTER TABLE IF EXISTS public.payment_confirmations
  ADD COLUMN IF NOT EXISTS stellar_network public.stellar_network NOT NULL DEFAULT 'TESTNET';

DO $$
BEGIN
  IF to_regclass('public.agent_sessions') IS NOT NULL THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_agent_sessions_stellar_network ON public.agent_sessions (stellar_network)';
  END IF;

  IF to_regclass('public.wallets') IS NOT NULL THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_wallets_stellar_network ON public.wallets (stellar_network)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_wallets_network_public_key ON public.wallets (stellar_network, public_key)';
  END IF;

  IF to_regclass('public.operations') IS NOT NULL THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_operations_stellar_network ON public.operations (stellar_network)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_operations_network_created_at ON public.operations (stellar_network, created_at DESC)';
  END IF;

  IF to_regclass('public.contacts') IS NOT NULL THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_contacts_stellar_network ON public.contacts (stellar_network)';
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_contacts_network_owner ON public.contacts (stellar_network, owner_id)';
  END IF;

  IF to_regclass('public.external_accounts') IS NOT NULL THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_external_accounts_stellar_network ON public.external_accounts (stellar_network)';
  END IF;

  IF to_regclass('public.payment_logs') IS NOT NULL THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_payment_logs_stellar_network ON public.payment_logs (stellar_network)';
  END IF;

  IF to_regclass('public.payment_confirmations') IS NOT NULL THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_payment_confirmations_stellar_network ON public.payment_confirmations (stellar_network)';
  END IF;
END
$$;

COMMIT;
