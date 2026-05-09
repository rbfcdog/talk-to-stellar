-- Migration: Add features for payment tracking, alerts, conversions, and audit
-- Implements: contact history, low-balance alerts, auto-conversion rules, categories, spending summary, audit log, trustline management
-- 1. Add contact_id FK to operations (for per-contact history)
ALTER TABLE operations
ADD COLUMN IF NOT EXISTS contact_id UUID;
-- 2. Add category and memo fields to operations (for spending breakdown)
ALTER TABLE operations
ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'other';
ALTER TABLE operations
ADD COLUMN IF NOT EXISTS memo TEXT;
-- amount_usdc and amount_brl may already exist, add if not:
ALTER TABLE operations
ADD COLUMN IF NOT EXISTS amount_usdc NUMERIC;
ALTER TABLE operations
ADD COLUMN IF NOT EXISTS amount_brl NUMERIC;
-- 3. Add alert_threshold to wallets (for low-balance alerts)
ALTER TABLE wallets
ADD COLUMN IF NOT EXISTS alert_threshold_usdc NUMERIC DEFAULT 5.00;
ALTER TABLE wallets
ADD COLUMN IF NOT EXISTS last_balance_alert_at TIMESTAMP;
-- 4. Create conversion_rules table (for auto-conversion rules)
CREATE TABLE IF NOT EXISTS conversion_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wallet_id BIGINT NOT NULL,
    session_id UUID NOT NULL,
    from_asset_code TEXT NOT NULL,
    to_asset_code TEXT NOT NULL,
    trigger_type TEXT NOT NULL CHECK (trigger_type IN ('on_receive', 'on_threshold')),
    min_amount NUMERIC DEFAULT 0.1,
    enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (wallet_id) REFERENCES wallets(id) ON DELETE CASCADE,
    FOREIGN KEY (session_id) REFERENCES agent_sessions(session_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_conversion_rules_wallet_id ON conversion_rules(wallet_id);
CREATE INDEX IF NOT EXISTS idx_conversion_rules_enabled ON conversion_rules(enabled);
-- 5. Create audit_events table (for session audit log)
CREATE TABLE IF NOT EXISTS audit_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL,
    event_type TEXT NOT NULL,
    ip_hash TEXT,
    user_agent TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (session_id) REFERENCES agent_sessions(session_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_audit_events_session_id ON audit_events(session_id);
CREATE INDEX IF NOT EXISTS idx_audit_events_event_type ON audit_events(event_type);
CREATE INDEX IF NOT EXISTS idx_audit_events_created_at ON audit_events(created_at);
-- 6. Add auto-conversion tracking to operations (type: auto_conversion)
-- Already covered by category and memo fields, but we can add a flag:
ALTER TABLE operations
ADD COLUMN IF NOT EXISTS is_auto_conversion BOOLEAN DEFAULT false;
-- Ensure legacy databases have the user_id column before any user_id-based views
ALTER TABLE operations
ADD COLUMN IF NOT EXISTS user_id TEXT;
CREATE INDEX IF NOT EXISTS idx_operations_user_id ON operations(user_id);
-- 7. Add trustline tracking to operations (type: trustline_setup)
ALTER TABLE operations
ADD COLUMN IF NOT EXISTS trustline_asset_code TEXT;
-- 8. Add opt-out flag for wallet health summary
ALTER TABLE agent_sessions
ADD COLUMN IF NOT EXISTS opt_out_weekly_summary BOOLEAN DEFAULT false;
-- 9. Create scheduled_payments table (for future use)
CREATE TABLE IF NOT EXISTS scheduled_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL,
    recipient_public_key TEXT NOT NULL,
    recipient_name TEXT,
    amount NUMERIC NOT NULL,
    asset_code TEXT DEFAULT 'XLM',
    category TEXT DEFAULT 'other',
    memo TEXT,
    scheduled_for TIMESTAMP NOT NULL,
    status TEXT DEFAULT 'pending' CHECK (
        status IN ('pending', 'completed', 'failed', 'cancelled')
    ),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (session_id) REFERENCES agent_sessions(session_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_scheduled_payments_session_id ON scheduled_payments(session_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_payments_scheduled_for ON scheduled_payments(scheduled_for);
CREATE INDEX IF NOT EXISTS idx_scheduled_payments_status ON scheduled_payments(status);
-- 10. Add whitelisted_assets configuration table
CREATE TABLE IF NOT EXISTS whitelisted_assets (
    id BIGSERIAL PRIMARY KEY,
    asset_code TEXT UNIQUE NOT NULL,
    asset_issuer TEXT,
    trusted BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO whitelisted_assets (asset_code, asset_issuer, trusted)
VALUES (
        'USDC',
        'GBZ46DBWTLU45IU75G5NR2EY3DEC5ZGJCVYCNGVRBU57WV6DC4OPI7PK',
        true
    ),
    (
        'USDT',
        'GDGQVOKHW4VEJRU77QCE6EM7BNUH7CFLY5G2WQGVD57XFHVKNQXKXQX',
        true
    ),
    (
        'BRL',
        'GCKG7UJA4YHCL6MBEVGCWO42CDONOTYU64E53X2SWAHS2CWHXDAKXOL5',
        true
    );
    (
        'BRL',
        'GENBWJ2EVFUJXJ7WQF3GFFQGNW24LZZFQKQ4L2IHHW2NBUFSJ3BFIXSX',
        true
    ),
    (
        'CNY',
        'GBHSQKRX2RCQJAWQZ24KSRKNLXV4OXNQYH2QIBY4MSPJHV6C3KZH3JOK',
        true
    ) ON CONFLICT (asset_code) DO NOTHING;
-- 11. Create triggers for conversion_rules updated_at
DROP TRIGGER IF EXISTS update_conversion_rules_updated_at ON conversion_rules;
CREATE TRIGGER update_conversion_rules_updated_at BEFORE
UPDATE ON conversion_rules FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
-- 12. Create triggers for scheduled_payments updated_at
DROP TRIGGER IF EXISTS update_scheduled_payments_updated_at ON scheduled_payments;
CREATE TRIGGER update_scheduled_payments_updated_at BEFORE
UPDATE ON scheduled_payments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
-- 13. Add indexes for common queries
CREATE INDEX IF NOT EXISTS idx_operations_contact_id ON operations(contact_id);
CREATE INDEX IF NOT EXISTS idx_operations_category ON operations(category);
CREATE INDEX IF NOT EXISTS idx_operations_is_auto_conversion ON operations(is_auto_conversion);
-- 14. Create view for spending summary
CREATE OR REPLACE VIEW spending_summary AS
SELECT o.user_id,
    o.category,
    o.asset_code,
    COUNT(*) as transaction_count,
    SUM(o.amount) as total_amount,
    SUM(o.amount_usdc) as total_usdc,
    SUM(o.amount_brl) as total_brl,
    DATE_TRUNC('month', o.created_at) as month
FROM operations o
WHERE o.status = 'success'
GROUP BY o.user_id,
    o.category,
    o.asset_code,
    DATE_TRUNC('month', o.created_at);
-- 15. Create view for contact summary
CREATE OR REPLACE VIEW contact_payment_summary AS
SELECT o.user_id,
    o.contact_id,
    o.destination_key,
    COUNT(*) as payment_count,
    SUM(o.amount) as total_amount,
    SUM(o.amount_usdc) as total_usdc,
    MAX(o.created_at) as last_payment_at,
    DATE_TRUNC('month', MAX(o.created_at)) as month
FROM operations o
WHERE o.status = 'success'
    AND o.type = 'PAYMENT'
GROUP BY o.user_id,
    o.contact_id,
    o.destination_key;