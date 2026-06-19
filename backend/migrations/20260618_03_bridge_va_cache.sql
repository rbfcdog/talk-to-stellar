-- Bridge virtual account cache (fast-load without Bridge API roundtrip)
-- Same pattern as bridge_custodial_wallets — no FK constraints, id = Bridge's va_xxx ID

CREATE TABLE IF NOT EXISTS bridge_va_cache (
    id TEXT PRIMARY KEY,              -- Bridge's va_xxx ID
    customer_id TEXT NOT NULL,
    status TEXT,                      -- activated | deactivated
    source_currency TEXT,             -- usd | brl | eur | mxn | gbp | cop
    destination_chain TEXT,
    destination_address TEXT,
    source_deposit_instructions JSONB,
    destination JSONB,
    developer_fee_percent TEXT,
    created_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ,
    synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS bridge_va_cache_customer_id ON bridge_va_cache (customer_id);

ALTER TABLE bridge_va_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_manage_bridge_va_cache" ON bridge_va_cache;
CREATE POLICY "service_role_manage_bridge_va_cache"
    ON bridge_va_cache FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

GRANT SELECT, INSERT, UPDATE, DELETE ON public.bridge_va_cache TO service_role;
