-- User-scoped Stellar Mainnet wallet infrastructure.
-- This keeps Mainnet separate from the existing testnet wallet table so the
-- current product runtime can remain testnet-first.

CREATE TABLE IF NOT EXISTS public.stellar_mainnet_wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.agent_sessions(session_id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  public_key TEXT NOT NULL CHECK (public_key ~ '^G[A-Z2-7]{55}$'),
  label TEXT NOT NULL DEFAULT 'Mainnet wallet',
  wallet_kind TEXT NOT NULL DEFAULT 'external_public_key'
    CHECK (wallet_kind IN ('external_public_key')),
  is_primary BOOLEAN NOT NULL DEFAULT true,
  last_synced_at TIMESTAMPTZ,
  last_balance JSONB NOT NULL DEFAULT '[]'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (session_id, public_key)
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_stellar_mainnet_wallets_primary_session
  ON public.stellar_mainnet_wallets (session_id)
  WHERE is_primary;

CREATE INDEX IF NOT EXISTS idx_stellar_mainnet_wallets_user_id
  ON public.stellar_mainnet_wallets (user_id);

CREATE INDEX IF NOT EXISTS idx_stellar_mainnet_wallets_public_key
  ON public.stellar_mainnet_wallets (public_key);

CREATE OR REPLACE FUNCTION public.tts_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_stellar_mainnet_wallets_updated_at
  ON public.stellar_mainnet_wallets;

CREATE TRIGGER trg_stellar_mainnet_wallets_updated_at
BEFORE UPDATE ON public.stellar_mainnet_wallets
FOR EACH ROW
EXECUTE FUNCTION public.tts_touch_updated_at();

ALTER TABLE public.stellar_mainnet_wallets ENABLE ROW LEVEL SECURITY;

