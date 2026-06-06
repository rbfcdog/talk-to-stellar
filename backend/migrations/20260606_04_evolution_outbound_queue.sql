-- Durable retry queue for WhatsApp messages generated after an Evolution webhook.
-- The inbound webhook is deduped separately; this table preserves the exact
-- outbound text so retries do not re-run the agent or create a different reply.
CREATE TABLE IF NOT EXISTS evolution_outbound_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dedupe_key TEXT NOT NULL UNIQUE,
  provider TEXT NOT NULL DEFAULT 'whatsapp',
  instance TEXT NOT NULL,
  recipient TEXT NOT NULL,
  remote_jid TEXT,
  message_id TEXT,
  text TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sending', 'sent', 'failed', 'dead_letter')),
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 8,
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  locked_at TIMESTAMPTZ,
  sent_at TIMESTAMPTZ,
  last_error TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_evolution_outbound_queue_due
  ON evolution_outbound_queue (status, next_attempt_at)
  WHERE status IN ('pending', 'failed');

CREATE INDEX IF NOT EXISTS idx_evolution_outbound_queue_recipient
  ON evolution_outbound_queue (recipient, created_at DESC);
