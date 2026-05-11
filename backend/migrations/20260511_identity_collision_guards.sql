-- Identity collision guards for onboarding/login data.
-- Ensures uniqueness across primary identity fields.

CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_sessions_email_lower_unique
  ON agent_sessions ((lower(email)))
  WHERE email IS NOT NULL AND btrim(email) <> '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_sessions_phone_unique
  ON agent_sessions (phone_number)
  WHERE phone_number IS NOT NULL AND btrim(phone_number) <> '';

CREATE UNIQUE INDEX IF NOT EXISTS idx_external_accounts_data_cpf_unique
  ON external_accounts ((regexp_replace(coalesce(data->>'cpf', ''), '\D', '', 'g')))
  WHERE coalesce(data->>'cpf', '') <> '';
