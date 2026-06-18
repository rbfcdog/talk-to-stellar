-- Fix: early_access_signups table
-- Copy-paste this entire block into your Supabase SQL Editor and run it.

-- Helper function (safe to re-run — uses CREATE OR REPLACE)
CREATE OR REPLACE FUNCTION update_updated_at_column() RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Early access signup table
CREATE TABLE IF NOT EXISTS public.early_access_signups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  status text NOT NULL DEFAULT 'subscribed',
  locale text NOT NULL DEFAULT 'pt-BR',
  source text NOT NULL DEFAULT 'landing-reluca',
  campaign text,
  referrer text,
  page_url text,
  metadata_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  subscribed_at timestamptz NOT NULL DEFAULT now(),
  last_subscribed_at timestamptz NOT NULL DEFAULT now(),
  unsubscribed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT early_access_signups_email_lowercase_check CHECK (email = lower(email)),
  CONSTRAINT early_access_signups_email_format_check CHECK (email ~* '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'),
  CONSTRAINT early_access_signups_status_check CHECK (status IN ('subscribed', 'unsubscribed')),
  CONSTRAINT early_access_signups_locale_check CHECK (locale IN ('pt-BR', 'en'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_early_access_signups_email
  ON public.early_access_signups (email);

CREATE INDEX IF NOT EXISTS idx_early_access_signups_created
  ON public.early_access_signups (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_early_access_signups_status_created
  ON public.early_access_signups (status, created_at DESC);

DROP TRIGGER IF EXISTS set_early_access_signups_updated_at ON public.early_access_signups;
CREATE TRIGGER set_early_access_signups_updated_at
  BEFORE UPDATE ON public.early_access_signups
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.early_access_signups ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_manage_early_access_signups" ON public.early_access_signups;
CREATE POLICY "service_role_manage_early_access_signups"
ON public.early_access_signups
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

GRANT SELECT, INSERT, UPDATE, DELETE ON public.early_access_signups TO service_role;
