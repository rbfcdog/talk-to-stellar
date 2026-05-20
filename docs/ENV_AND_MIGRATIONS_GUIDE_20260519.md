# Env and migrations guide - security hardening

This guide is for deploying the hardening commit that moved session secrets to HttpOnly cookies, added the new PIN hash format, added Redis-backed rate limits, and prepared the Supabase RLS hardening SQL.

Commit to deploy:

```bash
4bf6d5a fix: harden sessions pin and rate limits
```

## 1. Backend env

Set these in the backend service on Railway.

```bash
PIN_PEPPER="generate-a-long-random-secret-and-never-commit-it"
UPSTASH_REDIS_REST_URL="https://your-upstash-url"
UPSTASH_REDIS_REST_TOKEN="your-upstash-token"
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX=300
SENSITIVE_RATE_LIMIT_WINDOW_MS=60000
SENSITIVE_RATE_LIMIT_MAX=30
```

Important:

- `PIN_PEPPER` must stay stable forever. If you change it later, PIN hashes created with the old pepper will stop validating.
- If the old deployment used a custom `PIN_SALT`, keep `PIN_SALT` in Railway too. Old PIN hashes still need it during migration.
- If there was no custom `PIN_SALT`, legacy hashes still verify with the old default fallback.
- Do not expose `PIN_PEPPER`, `PIN_SALT`, Redis tokens, Supabase service role keys, or internal API secrets in frontend env.

Redis is recommended in production because memory rate limits only protect one backend process. In Railway, create an Upstash Redis service, copy the REST URL/token, and put them in the backend service env.

## 2. Frontend env

The frontend must call the backend through the Next.js API proxy so cookies can remain HttpOnly.

Set in Vercel/Railway frontend:

```bash
BACKEND_URL="https://your-backend-service.up.railway.app"
NEXT_PUBLIC_BACKEND_URL="https://your-backend-service.up.railway.app"
NEXT_PUBLIC_AGENT_API_URL="https://your-backend-service.up.railway.app/api/agent/query"
```

Use the same public frontend domain in backend passkey env:

```bash
PASSKEY_RP_ID="your-frontend-domain.com"
PASSKEY_ORIGIN="https://your-frontend-domain.com"
CREATE_ACCOUNT_BASE="https://your-frontend-domain.com"
PAYMENT_CONFIRM_BASE="https://your-frontend-domain.com"
FRONTEND_URL="https://your-frontend-domain.com"
PUBLIC_APP_URL="https://your-frontend-domain.com"
```

Do not add `session_token` to URLs or frontend localStorage. The browser should only talk to `/api/chat`, `/api/agent/*`, `/api/external/*`, `/api/financial/*`, `/api/passkeys/*`, `/api/ramp/*`, and `/api/session`.

## 3. Supabase RLS migration

This cannot be applied with `SUPABASE_SERVICE_ROLE_KEY` through the app. You need Supabase SQL Editor or a direct Postgres admin connection.

Option A - Supabase SQL Editor:

1. Open Supabase project.
2. Go to SQL Editor.
3. Paste the contents of:

```bash
backend/migrations/20260518_01_security_hardening_public_surface.sql
```

4. Run it.
5. Paste and run:

```bash
backend/scripts/verify-rls-hardening.sql
```

Option B - direct Postgres URL:

```bash
export DATABASE_URL="postgresql://postgres.your-ref:YOUR_PASSWORD@aws-...pooler.supabase.com:6543/postgres?sslmode=require"

psql "$DATABASE_URL" -f backend/migrations/20260518_01_security_hardening_public_surface.sql
psql "$DATABASE_URL" -f backend/scripts/verify-rls-hardening.sql
```

Expected verification result:

```text
NOTICE:  RLS hardening verification passed.
DO
```

What this SQL does:

- drops `public.exec_sql(text)`;
- revokes browser/public execution on Vault helper functions;
- enables and forces RLS on sensitive tables;
- removes direct table grants from `PUBLIC`, `anon`, and `authenticated`;
- keeps `service_role` access for backend server-side code.

## 4. Deploy order

Use this order to avoid partial rollout issues:

1. Add backend env: `PIN_PEPPER`, Redis REST URL/token, and keep old `PIN_SALT` if it existed.
2. Add frontend/backend URL env if missing.
3. Deploy backend from commit `4bf6d5a`.
4. Deploy frontend from commit `4bf6d5a`.
5. Apply the Supabase RLS hardening SQL.
6. Run the RLS verification SQL.
7. Test login, create account, passkey registration, chat, PIX ramp, and payment confirmation.

## 5. Functional tests after deploy

Session/cookie:

```bash
curl -i https://your-frontend-domain.com/api/session
```

Before login it should return unauthenticated. After login/create-account in browser, DevTools should show HttpOnly cookies named:

```text
tts_session_id
tts_session_token
```

They should not appear in `localStorage`.

Rate limit:

```bash
for i in $(seq 1 35); do
  curl -s -o /dev/null -w "%{http_code}\n" https://your-backend-domain.com/api/passkeys/register/options
done
```

Sensitive endpoints should eventually return `429` if the limit is exceeded.

PIN migration:

- Existing users with old PIN hashes should still be able to authenticate.
- When they use external linking/onboarding flows successfully, the backend opportunistically rewrites the PIN hash to the new versioned format.
- New PIN resets and new account creation write only the new format.

## 6. Rollback notes

Rollback app code only if necessary, but avoid rolling back the Supabase RLS SQL unless you are debugging with a protected staging database.

Do not rotate `PIN_PEPPER` during rollback. Keep it stable so new hashes remain usable.

If Redis has an outage, the app falls back to local in-memory rate limits. That keeps the app online, but distributed rate-limit protection is weaker until Redis is back.

## 7. Env checklist

Backend Railway:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_ANON_KEY`
- `JWT_SECRET`
- `OPENAI_API_KEY`
- `PIN_PEPPER`
- `PIN_SALT` if previously used
- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`
- `INTERNAL_API_SECRET`
- `CORS_ORIGINS`
- `PASSKEY_RP_ID`
- `PASSKEY_ORIGIN`
- `CREATE_ACCOUNT_BASE`
- `PAYMENT_CONFIRM_BASE`
- `FRONTEND_URL`
- `PUBLIC_APP_URL`

Frontend:

- `BACKEND_URL`
- `NEXT_PUBLIC_BACKEND_URL`
- `NEXT_PUBLIC_AGENT_API_URL`

Supabase admin/local only:

- `DATABASE_URL` or `SUPABASE_DB_URL` for `psql`
