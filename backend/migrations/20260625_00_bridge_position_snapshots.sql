-- bridge_position_snapshots: one daily snapshot per custodial Stellar wallet of
-- its invested position (DeFindex + Blend, in USDC). Written best-effort every
-- time the positions endpoint is read, so the "Real balance line" chart can plot
-- the actual value at each day instead of a flat line at the current amount.
-- One row per (public_key, snapshot_date) — the same day is upserted in place.

BEGIN;

CREATE TABLE IF NOT EXISTS bridge_position_snapshots (
    id              BIGSERIAL PRIMARY KEY,
    public_key      TEXT NOT NULL,                    -- G... Stellar public key
    email           TEXT,                             -- Bridge customer email (optional, for lookup)
    snapshot_date   DATE NOT NULL,                    -- the calendar day this snapshot represents
    defindex_usdc   NUMERIC NOT NULL DEFAULT 0,       -- USDC working in the DeFindex vault that day
    blend_usdc      NUMERIC NOT NULL DEFAULT 0,       -- USDC supplied to Blend that day
    total_usdc      NUMERIC NOT NULL DEFAULT 0,       -- defindex_usdc + blend_usdc
    created_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (public_key, snapshot_date)
);

CREATE INDEX IF NOT EXISTS idx_bridge_position_snapshots_pk_date
    ON bridge_position_snapshots(public_key, snapshot_date);

-- ── RLS ───────────────────────────────────────────────────────────────────────
-- Backend connects with SUPABASE_SERVICE_ROLE_KEY (bypasses RLS).

ALTER TABLE bridge_position_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_manage_bridge_position_snapshots" ON bridge_position_snapshots;
CREATE POLICY "service_role_manage_bridge_position_snapshots"
    ON bridge_position_snapshots
    FOR ALL
    USING (auth.role() = 'service_role')
    WITH CHECK (auth.role() = 'service_role');

GRANT SELECT, INSERT, UPDATE, DELETE ON public.bridge_position_snapshots TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.bridge_position_snapshots_id_seq TO service_role;

COMMIT;
