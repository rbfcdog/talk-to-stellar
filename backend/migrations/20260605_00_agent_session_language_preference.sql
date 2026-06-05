ALTER TABLE IF EXISTS public.agent_sessions
ADD COLUMN IF NOT EXISTS language TEXT;

ALTER TABLE IF EXISTS public.agent_sessions
ADD COLUMN IF NOT EXISTS preferred_language TEXT;

CREATE INDEX IF NOT EXISTS idx_agent_sessions_preferred_language
ON public.agent_sessions(preferred_language);
