-- Supabase SQL Migration for Agent Tables
-- Copy and paste this entire script into Supabase Dashboard > SQL Editor
-- or run: supabase db push
-- Create agent_sessions table
CREATE TABLE IF NOT EXISTS agent_sessions (
    id BIGSERIAL PRIMARY KEY,
    session_id UUID UNIQUE NOT NULL,
    user_id TEXT NOT NULL,
    email TEXT NOT NULL,
    session_token UUID NOT NULL,
    public_key TEXT,
    phone_number TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_agent_sessions_user_id ON agent_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_agent_sessions_created_at ON agent_sessions(created_at);
-- Create wallets table to store Stellar account information
CREATE TABLE IF NOT EXISTS wallets (
    id BIGSERIAL PRIMARY KEY,
    session_id UUID UNIQUE NOT NULL,
    name TEXT,
    public_key TEXT UNIQUE NOT NULL,
    balance JSONB DEFAULT '[]',
    sequence TEXT,
    account_data JSONB,
    last_synced TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (session_id) REFERENCES agent_sessions(session_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_wallets_public_key ON wallets(public_key);
CREATE INDEX IF NOT EXISTS idx_wallets_session_id ON wallets(session_id);
CREATE INDEX IF NOT EXISTS idx_wallets_last_synced ON wallets(last_synced);
-- Create operations table for transaction history and status tracking
CREATE TABLE IF NOT EXISTS operations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id TEXT NOT NULL,
    type TEXT NOT NULL,
    status TEXT NOT NULL,
    amount NUMERIC,
    asset_code TEXT,
    context TEXT,
    stellar_transaction_hash TEXT,
    destination_key TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_operations_user_id ON operations(user_id);
CREATE INDEX IF NOT EXISTS idx_operations_created_at ON operations(created_at);
CREATE INDEX IF NOT EXISTS idx_operations_status ON operations(status);
-- Ensure name column exists for existing environments
ALTER TABLE wallets
ADD COLUMN IF NOT EXISTS name TEXT;
-- Create agent_states table
CREATE TABLE IF NOT EXISTS agent_states (
    id BIGSERIAL PRIMARY KEY,
    session_id UUID UNIQUE NOT NULL,
    detected_intent TEXT,
    action_type TEXT,
    action_params JSONB DEFAULT '{}',
    pending_payment JSONB,
    response_message TEXT,
    success BOOLEAN DEFAULT false,
    error TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (session_id) REFERENCES agent_sessions(session_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_agent_states_session_id ON agent_states(session_id);
CREATE INDEX IF NOT EXISTS idx_agent_states_updated_at ON agent_states(updated_at);
-- Create agent_messages table
CREATE TABLE IF NOT EXISTS agent_messages (
    id BIGSERIAL PRIMARY KEY,
    session_id UUID NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
    content TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (session_id) REFERENCES agent_sessions(session_id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_agent_messages_session_id ON agent_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_agent_messages_created_at ON agent_messages(created_at);
-- Enable RLS (Row Level Security) on tables - DISABLED FOR DEVELOPMENT
-- Uncomment to enable RLS in production
-- ALTER TABLE agent_sessions ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE agent_states ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE agent_messages ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE wallets ENABLE ROW LEVEL SECURITY;
-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column() RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = CURRENT_TIMESTAMP;
RETURN NEW;
END;
$$ language 'plpgsql';
-- Create triggers for updated_at
DROP TRIGGER IF EXISTS update_agent_sessions_updated_at ON agent_sessions;
CREATE TRIGGER update_agent_sessions_updated_at BEFORE
UPDATE ON agent_sessions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_agent_states_updated_at ON agent_states;
CREATE TRIGGER update_agent_states_updated_at BEFORE
UPDATE ON agent_states FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_wallets_updated_at ON wallets;
CREATE TRIGGER update_wallets_updated_at BEFORE
UPDATE ON wallets FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS update_operations_updated_at ON operations;
CREATE TRIGGER update_operations_updated_at BEFORE
UPDATE ON operations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
-- Set up RLS policies (disable for local development/testing, enable for production)
-- For local development with RLS disabled, you can insert/update/delete without restrictions
-- For production, uncomment the policies below:
-- CREATE POLICY "Users can read their own sessions"
--   ON agent_sessions FOR SELECT
--   USING (auth.uid()::text = user_id);
--
-- CREATE POLICY "Users can insert their own sessions"
--   ON agent_sessions FOR INSERT
--   WITH CHECK (auth.uid()::text = user_id);
--
-- CREATE POLICY "Users can update their own sessions"
--   ON agent_sessions FOR UPDATE
--   USING (auth.uid()::text = user_id);
--
-- CREATE POLICY "Users can read their own states"
--   ON agent_states FOR SELECT
--   USING (session_id IN (
--     SELECT session_id FROM agent_sessions 
--     WHERE auth.uid()::text = user_id
--   ));
--
-- CREATE POLICY "Users can read their own messages"
--   ON agent_messages FOR SELECT
--   USING (session_id IN (
--     SELECT session_id FROM agent_sessions 
--     WHERE auth.uid()::text = user_id
--   ));