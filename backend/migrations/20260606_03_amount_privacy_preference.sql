-- Persist the user's preference for hiding monetary values in chat/receipt output.
-- Exact values remain stored in ledger/accounting tables for reconciliation.
ALTER TABLE IF EXISTS agent_sessions
  ADD COLUMN IF NOT EXISTS hide_amounts BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_agent_sessions_hide_amounts
  ON agent_sessions (hide_amounts);
