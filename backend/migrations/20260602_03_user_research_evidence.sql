-- Real-user evidence log for Stellar Village / Instawards review material.
--
-- This table records observed product sessions and literal feedback from real
-- users. It must not be populated with generated or simulated users.

BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.user_research_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID,
  user_id TEXT,
  email TEXT,
  channel TEXT NOT NULL DEFAULT 'web',
  event_name TEXT NOT NULL,
  event_group TEXT,
  task_label TEXT,
  status TEXT NOT NULL DEFAULT 'observed',
  feedback_text TEXT,
  evidence_url TEXT,
  evidence_type TEXT,
  page_url TEXT,
  route TEXT,
  operation_id TEXT,
  transaction_hash TEXT,
  stellar_network TEXT NOT NULL DEFAULT 'UNKNOWN',
  metadata_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  dedupe_key TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_research_events_user_time
  ON public.user_research_events (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_research_events_session_time
  ON public.user_research_events (session_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_research_events_network_time
  ON public.user_research_events (stellar_network, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_research_events_channel_time
  ON public.user_research_events (channel, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_research_events_event_name
  ON public.user_research_events (event_name);

CREATE INDEX IF NOT EXISTS idx_user_research_events_status
  ON public.user_research_events (status);

CREATE INDEX IF NOT EXISTS idx_user_research_events_metadata_gin
  ON public.user_research_events USING GIN (metadata_json);

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_research_events_dedupe_key_unique
  ON public.user_research_events (dedupe_key)
  WHERE dedupe_key IS NOT NULL;

CREATE OR REPLACE FUNCTION public.set_user_research_events_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_user_research_events_updated_at ON public.user_research_events;
CREATE TRIGGER trg_user_research_events_updated_at
BEFORE UPDATE ON public.user_research_events
FOR EACH ROW
EXECUTE FUNCTION public.set_user_research_events_updated_at();

ALTER TABLE IF EXISTS public.user_research_events ENABLE ROW LEVEL SECURITY;

COMMIT;
