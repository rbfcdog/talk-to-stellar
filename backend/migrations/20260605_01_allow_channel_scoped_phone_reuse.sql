-- Phone numbers are channel-scoped identifiers. The same phone can exist on a
-- regular web account and on a WhatsApp account; provider/provider_user_id is
-- the uniqueness boundary for channel ownership.
DROP INDEX IF EXISTS public.idx_agent_sessions_phone_unique;
DROP INDEX IF EXISTS public.idx_external_accounts_data_phone_unique;

CREATE INDEX IF NOT EXISTS idx_agent_sessions_phone_lookup
  ON public.agent_sessions (phone_number)
  WHERE phone_number IS NOT NULL AND btrim(phone_number) <> '';

CREATE INDEX IF NOT EXISTS idx_external_accounts_data_phone_lookup
  ON public.external_accounts ((regexp_replace(coalesce(data->>'phone_number', data->>'phoneNumber', ''), '\D', '', 'g')))
  WHERE nullif(regexp_replace(coalesce(data->>'phone_number', data->>'phoneNumber', ''), '\D', '', 'g'), '') IS NOT NULL;
