-- Reinforce uniqueness for identity fields used as transfer identifiers.

CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_sessions_email_lower_unique
  ON public.agent_sessions ((lower(email)))
  WHERE email IS NOT NULL AND btrim(email) <> '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_sessions_phone_unique
  ON public.agent_sessions (phone_number)
  WHERE phone_number IS NOT NULL AND btrim(phone_number) <> '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_external_accounts_data_email_lower_unique
  ON public.external_accounts ((lower(btrim(coalesce(data->>'email', '')))))
  WHERE btrim(coalesce(data->>'email', '')) <> '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_external_accounts_data_phone_unique
  ON public.external_accounts ((regexp_replace(coalesce(data->>'phone_number', ''), '\D', '', 'g')))
  WHERE coalesce(data->>'phone_number', '') <> '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_external_accounts_data_cpf_unique
  ON public.external_accounts ((regexp_replace(coalesce(data->>'cpf', ''), '\D', '', 'g')))
  WHERE coalesce(data->>'cpf', '') <> '';
