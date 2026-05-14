-- Persist one user-facing external bank destination per wallet/session for PIX off-ramp.
-- No transaction wrapper: this file is executed statement-by-statement through exec_sql.

CREATE TABLE IF NOT EXISTS public.external_bank_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL,
  user_id VARCHAR(255) NOT NULL,
  wallet_public_key VARCHAR(56) NOT NULL,
  label VARCHAR(120) NOT NULL DEFAULT 'Conta bancária externa TalkToStellar',
  institution VARCHAR(120) NOT NULL DEFAULT 'Banco externo vinculado',
  branch VARCHAR(20) NOT NULL,
  account_number VARCHAR(32) NOT NULL,
  pix_key VARCHAR(255) NOT NULL,
  rail VARCHAR(20) NOT NULL DEFAULT 'PIX',
  country VARCHAR(2) NOT NULL DEFAULT 'BR',
  currency VARCHAR(12) NOT NULL DEFAULT 'BRL',
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE IF EXISTS public.external_bank_accounts
  ADD COLUMN IF NOT EXISTS session_id UUID,
  ADD COLUMN IF NOT EXISTS user_id VARCHAR(255),
  ADD COLUMN IF NOT EXISTS wallet_public_key VARCHAR(56),
  ADD COLUMN IF NOT EXISTS label VARCHAR(120) NOT NULL DEFAULT 'Conta bancária externa TalkToStellar',
  ADD COLUMN IF NOT EXISTS institution VARCHAR(120) NOT NULL DEFAULT 'Banco externo vinculado',
  ADD COLUMN IF NOT EXISTS branch VARCHAR(20),
  ADD COLUMN IF NOT EXISTS account_number VARCHAR(32),
  ADD COLUMN IF NOT EXISTS pix_key VARCHAR(255),
  ADD COLUMN IF NOT EXISTS rail VARCHAR(20) NOT NULL DEFAULT 'PIX',
  ADD COLUMN IF NOT EXISTS country VARCHAR(2) NOT NULL DEFAULT 'BR',
  ADD COLUMN IF NOT EXISTS currency VARCHAR(12) NOT NULL DEFAULT 'BRL',
  ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE UNIQUE INDEX IF NOT EXISTS idx_external_bank_accounts_wallet_active
  ON public.external_bank_accounts (wallet_public_key)
  WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_external_bank_accounts_session
  ON public.external_bank_accounts (session_id);

CREATE INDEX IF NOT EXISTS idx_external_bank_accounts_user
  ON public.external_bank_accounts (user_id);

ALTER TABLE IF EXISTS public.external_bank_accounts DISABLE ROW LEVEL SECURITY;

