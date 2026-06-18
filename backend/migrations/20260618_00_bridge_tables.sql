-- migration: 20260618_00_bridge_tables.sql
-- purpose: Bridge.xyz integration tables — customers, webhooks, transfers, external accounts, liquidation addresses, virtual accounts
--
-- Run: psql <database_url> -f backend/migrations/20260618_00_bridge_tables.sql
-- Or: apply via Supabase SQL editor

-- ── bridge_customers ────────────────────────────────────────────────
-- Maps TalkToStellar users/sessions to Bridge customer IDs.
-- Bridge is the source of truth — this is a local cache for fast lookup.

CREATE TABLE IF NOT EXISTS public.bridge_customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  local_user_id TEXT,                   -- TalkToStellar session_id or user_id
  bridge_customer_id TEXT UNIQUE NOT NULL,
  email TEXT,
  customer_type TEXT DEFAULT 'individual',  -- individual | business
  status TEXT,                              -- not_started | active | rejected | paused
  kyc_status TEXT,
  endorsements JSONB,                       -- Bridge endorsements array
  has_accepted_tos BOOLEAN DEFAULT false,
  raw_bridge_data JSONB,                    -- Full Bridge API response for debugging
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  last_synced_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_bridge_customers_local_user
  ON public.bridge_customers(local_user_id);
CREATE INDEX IF NOT EXISTS idx_bridge_customers_email
  ON public.bridge_customers(email);
CREATE INDEX IF NOT EXISTS idx_bridge_customers_status
  ON public.bridge_customers(status);

-- ── bridge_external_accounts ─────────────────────────────────────────
-- PIX keys, US bank accounts, IBANs, etc. registered as off-ramp destinations.

CREATE TABLE IF NOT EXISTS public.bridge_external_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bridge_customer_id TEXT NOT NULL REFERENCES public.bridge_customers(bridge_customer_id) ON DELETE CASCADE,
  bridge_external_account_id TEXT UNIQUE NOT NULL,
  account_type TEXT NOT NULL,               -- pix | us | iban | clabe
  currency TEXT NOT NULL,
  account_owner_name TEXT,
  pix_key TEXT,                             -- Masked pix key (email/phone/CPF)
  document_number_last4 TEXT,               -- CPF/CNPJ last 4 digits
  active BOOLEAN DEFAULT true,
  bank_name TEXT,
  last_4 TEXT,                              -- Last 4 digits of account/routing
  raw_bridge_data JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bridge_ext_accts_customer
  ON public.bridge_external_accounts(bridge_customer_id);
CREATE INDEX IF NOT EXISTS idx_bridge_ext_accts_active
  ON public.bridge_external_accounts(active);

-- ── bridge_liquidation_addresses ─────────────────────────────────────
-- Reusable deposit addresses for USDC → PIX off-ramp.

CREATE TABLE IF NOT EXISTS public.bridge_liquidation_addresses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bridge_customer_id TEXT NOT NULL REFERENCES public.bridge_customers(bridge_customer_id) ON DELETE CASCADE,
  bridge_liquidation_address_id TEXT UNIQUE NOT NULL,
  payment_rail TEXT NOT NULL,               -- pix
  currency TEXT NOT NULL,                   -- brl
  chain TEXT NOT NULL,                      -- base | ethereum | solana | stellar
  deposit_address TEXT,                     -- Blockchain address for deposits
  external_account_id TEXT,                 -- Linked PIX external account
  developer_fee_percent TEXT,
  raw_bridge_data JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bridge_liq_addrs_customer
  ON public.bridge_liquidation_addresses(bridge_customer_id);
CREATE INDEX IF NOT EXISTS idx_bridge_liq_addrs_chain
  ON public.bridge_liquidation_addresses(chain);

-- ── bridge_virtual_accounts ──────────────────────────────────────────
-- Virtual accounts for PIX → USDC on-ramp.

CREATE TABLE IF NOT EXISTS public.bridge_virtual_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bridge_customer_id TEXT NOT NULL REFERENCES public.bridge_customers(bridge_customer_id) ON DELETE CASCADE,
  bridge_virtual_account_id TEXT UNIQUE NOT NULL,
  status TEXT NOT NULL,                     -- activated | deactivated
  source_currency TEXT NOT NULL,            -- brl
  destination_currency TEXT NOT NULL,       -- usdc
  destination_chain TEXT NOT NULL,          -- stellar | base | ethereum
  destination_wallet TEXT,                  -- Destination wallet address
  deposit_instructions JSONB,               -- How to send PIX
  developer_fee_percent TEXT,
  raw_bridge_data JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bridge_va_customer
  ON public.bridge_virtual_accounts(bridge_customer_id);
CREATE INDEX IF NOT EXISTS idx_bridge_va_status
  ON public.bridge_virtual_accounts(status);

-- ── bridge_transfers ─────────────────────────────────────────────────
-- One-time transfer records (crypto → PIX, PIX → crypto, etc.)

CREATE TABLE IF NOT EXISTS public.bridge_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bridge_customer_id TEXT NOT NULL REFERENCES public.bridge_customers(bridge_customer_id) ON DELETE CASCADE,
  bridge_transfer_id TEXT UNIQUE NOT NULL,
  local_user_id TEXT,
  state TEXT NOT NULL,                      -- awaiting_funds | completed | failed | returned
  source_currency TEXT,
  source_rail TEXT,
  destination_currency TEXT,
  destination_rail TEXT,
  amount TEXT,
  developer_fee TEXT,
  exchange_fee TEXT,
  receipt JSONB,                            -- Bridge receipt object
  deposit_instructions JSONB,               -- How customer sends funds
  external_account_id TEXT,
  liquidation_address_id TEXT,
  virtual_account_id TEXT,
  raw_bridge_data JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  last_synced_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_bridge_transfers_customer
  ON public.bridge_transfers(bridge_customer_id);
CREATE INDEX IF NOT EXISTS idx_bridge_transfers_state
  ON public.bridge_transfers(state);
CREATE INDEX IF NOT EXISTS idx_bridge_transfers_user
  ON public.bridge_transfers(local_user_id);

-- ── bridge_webhook_events ────────────────────────────────────────────
-- Immutable webhook event log for audit trail and idempotent processing.

CREATE TABLE IF NOT EXISTS public.bridge_webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id TEXT UNIQUE NOT NULL,             -- Bridge event ID for idempotency
  event_sequence BIGINT,
  event_type TEXT NOT NULL,                  -- customer.updated, transfer.completed, etc.
  resource_type TEXT,                        -- customer, transfer, liquidation_address, virtual_account
  resource_id TEXT,                          -- Bridge resource ID
  raw_payload JSONB NOT NULL,
  processed BOOLEAN DEFAULT false,
  processing_error TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  processed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_bridge_wh_events_type
  ON public.bridge_webhook_events(event_type);
CREATE INDEX IF NOT EXISTS idx_bridge_wh_events_resource
  ON public.bridge_webhook_events(resource_type, resource_id);
CREATE INDEX IF NOT EXISTS idx_bridge_wh_events_processed
  ON public.bridge_webhook_events(processed);

-- ── bridge_exchange_rate_estimates ───────────────────────────────────
-- Cache exchange rate lookups for display purposes.

CREATE TABLE IF NOT EXISTS public.bridge_exchange_rate_estimates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_currency TEXT NOT NULL,
  destination_currency TEXT NOT NULL,
  midmarket_rate TEXT,
  buy_rate TEXT,
  sell_rate TEXT,
  queried_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bridge_rates_pair
  ON public.bridge_exchange_rate_estimates(source_currency, destination_currency);
CREATE INDEX IF NOT EXISTS idx_bridge_rates_time
  ON public.bridge_exchange_rate_estimates(queried_at DESC);

-- ── Row-Level Security ───────────────────────────────────────────────
-- Enable RLS on all tables. Default: authenticated users can read their own data.
-- Admin/ops can read/write all. Adjust policies as needed.

ALTER TABLE public.bridge_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bridge_external_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bridge_liquidation_addresses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bridge_virtual_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bridge_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bridge_webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bridge_exchange_rate_estimates ENABLE ROW LEVEL SECURITY;

-- Service role bypass — backend uses service_role key
-- No-op: Supabase service_role bypasses RLS by default.
-- Add specific policies later when frontend user access is built.
