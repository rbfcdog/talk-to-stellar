-- Disable RLS for development
-- Run this in Supabase SQL Editor if RLS is already enabled on tables
-- Disable RLS on all agent tables
ALTER TABLE IF EXISTS agent_sessions DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS agent_states DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS agent_messages DISABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS wallets DISABLE ROW LEVEL SECURITY;
-- Drop existing policies (they'll cause errors if RLS is disabled, but this is safe)
DROP POLICY IF EXISTS "Users can read their own sessions" ON agent_sessions;
DROP POLICY IF EXISTS "Users can read their own states" ON agent_states;
DROP POLICY IF EXISTS "Users can read their own messages" ON agent_messages;
DROP POLICY IF EXISTS "Users can insert their own sessions" ON agent_sessions;
DROP POLICY IF EXISTS "Users can update their own sessions" ON agent_sessions;
-- Verify RLS is disabled
SELECT tablename,
    rowsecurity
FROM pg_tables
WHERE tablename IN (
        'agent_sessions',
        'agent_states',
        'agent_messages',
        'wallets'
    );