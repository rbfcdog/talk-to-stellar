-- Durable inbound queue for Evolution WhatsApp webhooks.
-- This lets the public webhook acknowledge Evolution quickly while the agent
-- request and outbound WhatsApp send run in a retryable background worker.
CREATE TABLE IF NOT EXISTS evolution_inbound_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dedupe_key TEXT NOT NULL UNIQUE,
  provider TEXT NOT NULL DEFAULT 'whatsapp',
  instance TEXT NOT NULL,
  recipient TEXT NOT NULL,
  remote_jid TEXT NOT NULL,
  message_id TEXT,
  text_hash TEXT NOT NULL,
  payload JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'dead_letter')),
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 5,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  locked_at TIMESTAMPTZ,
  processed_at TIMESTAMPTZ,
  last_error TEXT,
  result JSONB,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_evolution_inbound_queue_due
  ON evolution_inbound_queue (status, next_attempt_at)
  WHERE status IN ('pending', 'failed');

CREATE INDEX IF NOT EXISTS idx_evolution_inbound_queue_recipient
  ON evolution_inbound_queue (recipient, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_evolution_inbound_queue_message
  ON evolution_inbound_queue (instance, remote_jid, message_id);
