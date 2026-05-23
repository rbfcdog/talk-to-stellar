-- Prevent duplicate assistant messages when login completion and chat hydration
-- both try to create the first session guidance at the same time.
ALTER TABLE IF EXISTS public.agent_messages
  ADD COLUMN IF NOT EXISTS dedupe_key TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS ux_agent_messages_dedupe_key
  ON public.agent_messages (dedupe_key)
  WHERE dedupe_key IS NOT NULL;
