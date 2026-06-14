# Env and migrations guide - security hardening and institution settlement

This guide is for deploying the hardening commit that moved session secrets to HttpOnly cookies, added the new PIN hash format, added backend rate limits, and prepared the Supabase RLS hardening SQL.

It also covers the institution-to-institution settlement rail. The table names still use the internal prefix `international_transfer_*` because that is the backend storage contract, but the product surface should be described as BRL source institution -> Stellar USDC blockchain settlement -> USD destination institution.

Commit to deploy:

```bash
4bf6d5a fix: harden sessions pin and rate limits
```

## 0. Fix the missing quote table error

If the frontend shows this error:

```text
Failed to create BRL/USD quote: Could not find the table 'public.international_transfer_quotes' in the schema cache
```

it means the backend code was deployed before the Supabase migration was applied to the same Supabase project used by Railway. The API endpoint `/api/quotes/brl-usd` is working, but PostgREST cannot see the required table.

Run the institution settlement migration:

```bash
backend/migrations/20260613_00_full_schema.sql
```

Option A - Supabase SQL Editor:

1. Open the Supabase project whose URL matches the backend `SUPABASE_URL`.
2. Go to SQL Editor.
3. Paste the full contents of `backend/migrations/20260613_00_full_schema.sql`.
4. Run the SQL.
5. Wait a few seconds and retry `/api/quotes/brl-usd`.

Option B - direct Postgres URL:

```bash
export DATABASE_URL="postgresql://postgres.your-ref:YOUR_PASSWORD@aws-...pooler.supabase.com:6543/postgres?sslmode=require"
psql "$DATABASE_URL" -f backend/migrations/20260613_00_full_schema.sql
```

Verify the tables exist:

```sql
select
  to_regclass('public.international_transfer_quotes') as quotes,
  to_regclass('public.international_transfers') as transfers,
  to_regclass('public.international_transfer_reconciliations') as reconciliations;
```

Expected result:

```text
public.international_transfer_quotes | public.international_transfers | public.international_transfer_reconciliations
```

If the query returns null for any table, the migration was run in the wrong Supabase project or failed before completion.

Minimum backend env for this rail:

```bash
SUPABASE_URL="https://your-project.supabase.co"
SUPABASE_SERVICE_ROLE_KEY="your-service-role-key"
STELLAR_NETWORK="TESTNET"
USDC_ASSET_CODE="USDC"
USDC_ASSET_ISSUER="testnet-or-mainnet-usdc-issuer"
ETHERFUSE_API_KEY="api_sand_or_live_key"
ETHERFUSE_WEBHOOK_SECRET="shared-webhook-secret"
PAYOUT_PROVIDER="etherfuse"
ENABLE_REAL_PAYOUT_EXECUTION="false"
ENABLE_MAINNET_SETTLEMENT_VALIDATION="false"
MAX_MAINNET_VALIDATION_AMOUNT_USD="25"
INTERNATIONAL_TRANSFER_ENABLE_MOCK_PIX="true"
ETHERFUSE_SANDBOX_PIX_FALLBACK="true"
```

Minimum frontend env:

```bash
BACKEND_URL="https://your-backend-service.up.railway.app"
NEXT_PUBLIC_BACKEND_URL="https://your-backend-service.up.railway.app"
ETHERFUSE_WEBHOOK_SECRET="shared-webhook-secret"
```

Notes:

- Use `PAYOUT_PROVIDER=etherfuse` for the institution rail tester when you want the on-ramp and off-ramp proof surfaces to be Etherfuse-shaped. The off-ramp proof prepares a sandbox payload by default.
- Use `PAYOUT_PROVIDER=mock` only when you want a pure USD payout mock without Etherfuse off-ramp evidence.
- Keep Circle/Bridge credentials disabled until provider credentials and compliance approval are ready.
- Keep `STELLAR_NETWORK=TESTNET` while the rest of the app is still operating on testnet.
- `ENABLE_REAL_PAYOUT_EXECUTION=false` prevents real payout execution even if a compatibility adapter is selected.
- `INTERNATIONAL_TRANSFER_ENABLE_MOCK_PIX=true` lets the tester create sandbox funding intents without requiring a real Pix payment.
- `ETHERFUSE_SANDBOX_PIX_FALLBACK=true` lets Etherfuse sandbox off-ramp tests fall back to local PIX settlement proof when no sandbox fiat account is registered.
- The tables have RLS enabled, but the backend writes with `SUPABASE_SERVICE_ROLE_KEY`. Do not use anon/browser keys for these settlement records.

## 1. Backend env

Set these in the backend service on Railway.

```bash
PIN_PEPPER="generate-a-long-random-secret-and-never-commit-it"
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX=300
SENSITIVE_RATE_LIMIT_WINDOW_MS=60000
SENSITIVE_RATE_LIMIT_MAX=30
```

Important:

- `PIN_PEPPER` must stay stable forever. If you change it later, PIN hashes created with the old pepper will stop validating.
- If the old deployment used a custom `PIN_SALT`, keep `PIN_SALT` in Railway too. Old PIN hashes still need it during migration.
- If there was no custom `PIN_SALT`, legacy hashes still verify with the old default fallback.
- Do not expose `PIN_PEPPER`, `PIN_SALT`, Supabase service role keys, or internal API secrets in frontend env.
- Rate limits are in-process and do not require an external Redis service.

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
backend/migrations/20260613_00_full_schema.sql
```

4. Run it.
5. Paste and run:

```bash
backend/scripts/verify-rls-hardening.sql
```

Option B - direct Postgres URL:

```bash
export DATABASE_URL="postgresql://postgres.your-ref:YOUR_PASSWORD@aws-...pooler.supabase.com:6543/postgres?sslmode=require"

psql "$DATABASE_URL" -f backend/migrations/20260613_00_full_schema.sql
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

1. Add backend env: `PIN_PEPPER`, rate-limit values, and keep old `PIN_SALT` if it existed.
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

Rate limits are local to the backend process. If you later run multiple backend replicas, each replica will have its own counter.

## 7. Env checklist

Backend Railway:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_ANON_KEY`
- `JWT_SECRET`
- `OPENAI_API_KEY`
- `PIN_PEPPER`
- `PIN_SALT` if previously used
- `RATE_LIMIT_WINDOW_MS`
- `RATE_LIMIT_MAX`
- `SENSITIVE_RATE_LIMIT_WINDOW_MS`
- `SENSITIVE_RATE_LIMIT_MAX`
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
