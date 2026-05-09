-- Migration: Create PIN Reset Tokens Table
-- Supabase-compatible SQL

BEGIN;

-- Create pin_reset_tokens table
CREATE TABLE IF NOT EXISTS public.pin_reset_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  session_id uuid NOT NULL,
  reset_token text UNIQUE NOT NULL,
  token_hash text UNIQUE NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  expires_at timestamp with time zone NOT NULL,
  used_at timestamp with time zone,
  new_pin_hash text,
  CONSTRAINT fk_user_id FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_pin_reset_token_hash ON public.pin_reset_tokens(token_hash);
CREATE INDEX IF NOT EXISTS idx_pin_reset_user_expires ON public.pin_reset_tokens(user_id, expires_at);
CREATE INDEX IF NOT EXISTS idx_pin_reset_used_at ON public.pin_reset_tokens(used_at);

-- Enable Row Level Security (RLS)
ALTER TABLE public.pin_reset_tokens ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can view their own reset tokens
CREATE POLICY "users_view_own_reset_tokens" 
ON public.pin_reset_tokens 
FOR SELECT 
USING (user_id = auth.uid());

-- RLS Policy: Service role can insert
CREATE POLICY "service_insert_reset_tokens" 
ON public.pin_reset_tokens 
FOR INSERT 
WITH CHECK (true);

-- RLS Policy: Service role can update
CREATE POLICY "service_update_reset_tokens" 
ON public.pin_reset_tokens 
FOR UPDATE 
WITH CHECK (true);

-- Grant permissions
GRANT SELECT, INSERT, UPDATE ON public.pin_reset_tokens TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.pin_reset_tokens TO service_role;

COMMIT;

