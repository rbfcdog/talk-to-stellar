-- Bridge custodial wallets (managed by Bridge.xyz, not self-custody)
-- Chains: base, ethereum, solana, tempo, tron (NOT Stellar)

CREATE TABLE IF NOT EXISTS bridge_custodial_wallets (
    id TEXT PRIMARY KEY,                  -- Bridge's bw_xxx ID
    customer_id TEXT NOT NULL,
    chain TEXT NOT NULL,
    address TEXT NOT NULL,
    initiation_required BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ,
    synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS bridge_custodial_wallets_customer_id ON bridge_custodial_wallets (customer_id);

ALTER TABLE bridge_custodial_wallets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_manage_bridge_custodial_wallets" ON bridge_custodial_wallets;
CREATE POLICY "service_role_manage_bridge_custodial_wallets"
    ON bridge_custodial_wallets FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

GRANT SELECT, INSERT, UPDATE, DELETE ON public.bridge_custodial_wallets TO service_role;
