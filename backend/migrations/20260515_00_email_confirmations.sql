CREATE TABLE IF NOT EXISTS public.email_confirmations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  purpose text NOT NULL,
  code_hash text NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT email_confirmations_purpose_check CHECK (purpose IN ('create_account', 'login'))
);

CREATE INDEX IF NOT EXISTS idx_email_confirmations_lookup
  ON public.email_confirmations (email, purpose, code_hash)
  WHERE used_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_email_confirmations_email_purpose_created
  ON public.email_confirmations (email, purpose, created_at DESC)
  WHERE used_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_email_confirmations_expires_at
  ON public.email_confirmations (expires_at);

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_email_confirmations_updated_at ON public.email_confirmations;
CREATE TRIGGER set_email_confirmations_updated_at
  BEFORE UPDATE ON public.email_confirmations
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.email_confirmations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_manage_email_confirmations"
ON public.email_confirmations
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_confirmations TO service_role;
