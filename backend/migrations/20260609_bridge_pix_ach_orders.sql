-- bridge_pix_ach_orders: Tracks PIX → USDC → ACH atomic flow states
CREATE TABLE IF NOT EXISTS public.bridge_pix_ach_orders (
  id UUID PRIMARY KEY,
  session_id TEXT,
  user_id TEXT,
  bridge_customer_id TEXT,
  stellar_address TEXT,
  external_account_id TEXT,
  amount_usd TEXT NOT NULL,
  estimated_brl TEXT,
  state TEXT NOT NULL DEFAULT 'awaiting_pix'
    CHECK (state IN ('awaiting_pix', 'pix_received', 'converting_ach', 'completed', 'failed', 'expired')),
  pix_virtual_account_id TEXT,
  pix_key TEXT,
  ach_transfer_id TEXT,
  receipt_url TEXT,
  error_message TEXT,
  developer_fee_usd TEXT,
  bridge_fee_usd TEXT,
  net_amount_usd TEXT,
  destination_bank_last4 TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bridge_pix_ach_orders_session
  ON public.bridge_pix_ach_orders(session_id);
CREATE INDEX IF NOT EXISTS idx_bridge_pix_ach_orders_va
  ON public.bridge_pix_ach_orders(pix_virtual_account_id);
CREATE INDEX IF NOT EXISTS idx_bridge_pix_ach_orders_transfer
  ON public.bridge_pix_ach_orders(ach_transfer_id);
