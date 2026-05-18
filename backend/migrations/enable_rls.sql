-- Enable RLS on legacy agent tables.
-- Run this in Supabase SQL Editor if an old development database has RLS disabled.
ALTER TABLE IF EXISTS agent_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS agent_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS agent_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS wallets ENABLE ROW LEVEL SECURITY;
-- Drop stale permissive policies from older local experiments.
DROP POLICY IF EXISTS "Users can read their own sessions" ON agent_sessions;
DROP POLICY IF EXISTS "Users can read their own states" ON agent_states;
DROP POLICY IF EXISTS "Users can read their own messages" ON agent_messages;
DROP POLICY IF EXISTS "Users can insert their own sessions" ON agent_sessions;
DROP POLICY IF EXISTS "Users can update their own sessions" ON agent_sessions;
-- Verify RLS is enabled.
SELECT tablename,
    rowsecurity
FROM pg_tables
WHERE tablename IN (
        'agent_sessions',
        'agent_states',
        'agent_messages',
        'wallets'
    );
