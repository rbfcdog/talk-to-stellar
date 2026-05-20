# Security full codebase scan - 2026-05-19

Status: review/update report only. No runtime behavior was changed in this document.

Scope reviewed:
- 741 tracked files in Git.
- Backend, frontend, migrations, Docker/Railway/Evolution docs and current security docs.
- Generated folders and local artifacts excluded from findings: `node_modules`, `frontend/.next`, `backend/dist`, `deprecated/sandbox`.
- `npm audit --json` was run for backend and frontend; both returned zero known dependency vulnerabilities.

## Executive priority

The app is materially better than the older security deep dive: passkey enrollment now requires a real session, legacy startup migrations are opt-in, production-like Supabase config requires `SUPABASE_SERVICE_ROLE_KEY`, and there is a hardening migration for RLS/Vault/public RPCs.

The best work to do now is not another broad refactor. It is to close a few high-impact authorization and secret-exposure gaps:

1. Require session-token auth for wallet profile lookup.
2. Stop sending `session_token` in query strings.
3. Redact logs and idempotency response bodies.
4. Gate all sandbox/demo ramp endpoints with an internal/admin secret.
5. Apply and verify the RLS hardening migration in Supabase.

## Confirmed good posture

### Dependency posture

Backend and frontend `npm audit` returned no known vulnerable packages. This does not prove the app is secure, but it means current risk is mostly application logic, configuration and data exposure.

### Passkey enrollment

The prior WebAuthn/passkey enrollment bypass has been fixed at code level. `backend/src/services/passkey.service.ts` requires `session_id` and `session_token` for passkey registration, and the challenge is tied to the authorized session.

### Legacy migrations

The backend no longer runs legacy Supabase migrations by default. In `backend/src/app.ts`, startup migrations only run if `RUN_LEGACY_STARTUP_MIGRATIONS=true`. In `backend/src/utils/migrate.ts`, the legacy runner also requires `ALLOW_LEGACY_SUPABASE_MIGRATIONS=true` and refuses production-like environments.

### Production Supabase key

`backend/src/config/supabase.ts` requires `SUPABASE_SERVICE_ROLE_KEY` in production-like environments. Falling back to anon key is only allowed outside production-like envs.

### Agent session reads

The main agent session, messages and balance endpoints now call `requireAgentSessionAuth`, which validates `session_token` and expiration.

## High findings still worth fixing

### FIN-01 - Wallet profile endpoint can expose private identity context

Files:
- `backend/src/api/routes/financial.router.ts`
- `backend/src/api/controllers/financial.controller.ts`
- `backend/src/api/services/transaction-history.service.ts`
- `backend/src/api/services/financial-context.service.ts`

Issue:
`GET /api/financial/wallet-profile/:public_key` calls `TransactionHistoryService.getWalletProfile` with `sessionAndUser(req)`, but does not call `requireSessionAuth`. `FinancialContextService.resolve` accepts a raw `session_id` or `user_id` and resolves a latest session without validating `session_token`.

Why it matters:
The endpoint can combine a public Stellar address with internal data from `wallets`, `agent_sessions`, `external_accounts`, `global_profiles` and `payment_logs`. That may reveal email, phone, CPF, PIX key, profile URL and recent receive stats for a wallet. Public balances are not the core problem; the private identity enrichment is.

Recommended fix:
- Require `requireSessionAuth(req, res)` before calling `getWalletProfile`.
- Or split into two endpoints:
  - public endpoint: only public key, public global username and public Stellar balance;
  - private endpoint: enriched contact/PII only for an authenticated session.
- Do not allow `user_id` query/body to act as authentication context.

### AUTH-01 - Session tokens still travel in URLs

Files:
- `backend/src/agent/routes.ts`
- `backend/src/api/controllers/financial.controller.ts`
- `frontend/app/api/chat/route.ts`
- `frontend/components/chat-window.tsx`
- `frontend/app/transactions/transactions-client.tsx`
- `frontend/app/pay-anyone/pay-anyone-client.tsx`
- `frontend/app/claim-payment/claim-payment-client.tsx`

Issue:
Several frontend calls still append `session_token` as a query parameter. Backend helpers also still accept `req.query.session_token`.

Why it matters:
Query tokens can leak through browser history, proxy logs, analytics, screenshots, error traces and referrers. A `session_token` is a credential and should be treated like a bearer secret.

Recommended fix:
- Frontend: send `Authorization: Bearer <session_token>` or `X-Session-Token`.
- Backend: keep query-token support only behind a short deprecation period, then remove it from private endpoints.
- Prefer an HttpOnly, Secure, SameSite cookie for browser sessions. Until that exists, use headers and minimize localStorage exposure.

### LOG-01 - Sensitive tool and provider payloads are logged

Files:
- `backend/src/agent/tools.ts`
- `backend/src/integrations/regional-starter-pack/anchors/etherfuse/client.ts`

Issue:
`executeTool` logs `JSON.stringify(toolInput)` at info level. Tool inputs can include `pin`, `session_token`, payment details, recipient data and contact identifiers. The Etherfuse client logs full request bodies and full response text.

Why it matters:
Logs in Railway, local files, third-party observability or support exports become a secondary data store for credentials and financial PII.

Recommended fix:
- Add a centralized redactor for keys like `pin`, `session_token`, `password`, `secret`, `api_key`, `authorization`, `cpf`, `phone_number`, `pix_key`, `email`.
- Log operation metadata, not full payloads.
- Force `LOG_LEVEL=info` or `warn` in production and make debug payload logging opt-in only.

### RAMP-01 - Sandbox wallet resolution returns a live session token by email

Files:
- `backend/src/api/routes/ramp.router.ts`
- `backend/src/api/services/anchor.service.ts`

Issue:
`POST /api/ramp/etherfuse/resolve-wallet` is sandbox-only, but it returns `session_id`, `session_token` and `public_key` after lookup by email.

Why it matters:
If a sandbox/devnet backend is reachable publicly, knowing an email can mint or recover the session credential needed for ramp actions. Sandbox deployments often become demo deployments with real users, so this is high risk.

Recommended fix:
- Require `X-Internal-Api-Secret` for this endpoint.
- Or replace it with an authenticated login/onboarding flow.
- Never return a new or existing `session_token` from an email-only lookup.

### RAMP-02 - Temporary sandbox ramp endpoints are public except for session credentials

Files:
- `backend/src/api/routes/ramp.router.ts`
- `backend/src/api/services/anchor.service.ts`

Issue:
`/etherfuse/sandbox/test-onramp`, `/test-offramp`, `/simulate-fiat` and `/pix-funded-transfer` are gated by sandbox runtime and session credentials, but not by an internal/demo admin secret.

Why it matters:
These endpoints orchestrate money-like test flows, simulate funding and sign/submits testnet transactions. They should not be available to arbitrary internet clients on a public demo backend.

Recommended fix:
- Require `X-Internal-Api-Secret` for all temporary sandbox endpoints.
- Add rate limits per session and per IP.
- Consider disabling them completely unless `ENABLE_RAMP_SANDBOX_TEST_ENDPOINTS=true`.

### PIN-01 - PIN hashing uses a global static salt fallback

Files:
- `backend/src/api/controllers/external.controller.ts`
- `backend/src/api/controllers/external-finalize.controller.ts`
- `backend/src/api/controllers/pay-link.controller.ts`
- `backend/src/api/controllers/pin-reset.controller.ts`
- `backend/src/api/controllers/send-wallet.controller.ts`
- `backend/src/api/services/anchor.service.ts`
- `backend/src/agent/tools.ts`

Issue:
PIN hashing repeatedly uses PBKDF2 with `process.env.PIN_SALT || 'salt'`.

Why it matters:
A low-entropy PIN plus a shared fallback salt is weak if hashes leak. This is especially sensitive because PINs authorize wallet/payment actions.

Recommended fix:
- Make `PIN_SALT` mandatory in every hosted environment immediately.
- Centralize PIN hashing/verification in one utility.
- Migrate to a versioned hash format with per-user random salt and a server pepper, for example `pbkdf2$v2$iterations$salt$hash`.
- Add attempt counters and lockouts for PIN verification.

### IDEMP-01 - Idempotency stores full response bodies

Files:
- `backend/src/services/idempotency.service.ts`

Issue:
Global idempotency middleware captures and stores the full JSON response body for any POST/PUT/PATCH/DELETE with `Idempotency-Key`.

Why it matters:
Auth, onboarding, payment and ramp responses can contain session tokens, URLs, account details or provider payloads. The `idempotency_keys` table becomes another sensitive data store.

Recommended fix:
- Deny response-body persistence for auth/onboarding/passkey/session/ramp endpoints.
- Store status, route, request hash and a minimal operation id instead.
- Redact sensitive keys before any persistence.
- Scope idempotency rows by route plus authenticated session/user, not just a global key.

### DB-01 - RLS hardening exists but must be applied and verified

Files:
- `backend/migrations/20260518_01_security_hardening_public_surface.sql`
- legacy SQL files in `backend/migrations` and `backend/src/migrations`

Issue:
The hardening migration drops `public.exec_sql`, revokes Vault helper execution from public roles, enables and forces RLS, and revokes table access from `PUBLIC`, `anon` and `authenticated`. That is good, but it only protects the deployed DB after it is actually run from a trusted Supabase admin context.

Why it matters:
Old setup files still contain `SECURITY DEFINER` Vault functions and legacy `exec_sql` patterns. They are no longer in normal startup, but a developer can still accidentally run old full-setup SQL later.

Recommended fix:
- Apply the 20260518 hardening migration in Supabase SQL Editor.
- Keep legacy migration runner disabled in Railway.
- Add CI scanning that fails if a production migration adds `exec_sql`, public Vault access or `DISABLE ROW LEVEL SECURITY`.

## Medium findings

### WEBHOOK-01 - Evolution webhook secret is optional outside production-like envs

Files:
- `backend/src/api/controllers/evolution.controller.ts`
- `backend/src/api/services/evolution.service.ts`

Issue:
If `EVOLUTION_WEBHOOK_SECRET` is missing, webhooks are allowed in non-production-like environments.

Recommendation:
Any public Railway/demo backend should set `EVOLUTION_WEBHOOK_SECRET`. Prefer passing the secret in `X-Evolution-Webhook-Secret` instead of query string when possible.

### RATE-01 - Rate limits are in-memory only

File:
- `backend/src/api/middlewares/security.middleware.ts`

Issue:
The app has global and sensitive rate limits, but buckets are process-local Maps.

Recommendation:
Keep the current in-process limits for the single-backend deployment. If the backend is scaled to multiple replicas later, add a distributed counter service and per-user/session keys for login, PIN, passkey, recovery and payment confirmation.

### FRONT-01 - Browser session is kept in localStorage

Files:
- `frontend/lib/session.ts`
- several frontend clients under `frontend/app` and `frontend/components`

Issue:
`sessionToken` is stored in localStorage.

Recommendation:
Move browser auth to HttpOnly, Secure, SameSite cookies. If that cannot be done now, at least stop URL tokens, add a strict CSP and keep tokens in memory where possible.

### HEADERS-01 - No Content-Security-Policy yet

File:
- `backend/src/api/middlewares/security.middleware.ts`

Issue:
The backend sets useful security headers, but no CSP exists for the frontend surface.

Recommendation:
Add a Next.js CSP header policy and iterate it in report-only mode first. This matters more while localStorage still contains session tokens.

### PROXY-01 - Frontend proxy errors expose backend target URL

Files:
- `frontend/app/api/financial/[...path]/route.ts`
- `frontend/app/api/external/[...path]/route.ts`
- similar proxy routes

Issue:
Proxy error responses include `target`, which can disclose internal backend URLs and paths.

Recommendation:
Return a generic error to the browser and log the target server-side only.

## RLS activation procedure

Run this only in Supabase SQL Editor or another trusted DB admin context. Do not run it through the app and do not re-enable the legacy `exec_sql` runner.

### 1. Confirm Railway/backend env

Required:

```bash
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
JWT_SECRET=32+ chars random value
PIN_SALT=long random value until per-user salt migration exists
RUN_LEGACY_STARTUP_MIGRATIONS=false
ALLOW_LEGACY_SUPABASE_MIGRATIONS=false
```

For public deployments also set:

```bash
CORS_ORIGINS=https://your-frontend-domain
PUBLIC_APP_URL=https://your-frontend-domain
FRONTEND_URL=https://your-frontend-domain
EVOLUTION_WEBHOOK_SECRET=long random value
INTERNAL_API_SECRET=long random value
SHORT_LINK_PROXY_SECRET=long random value
LOG_LEVEL=info
```

### 2. Apply the hardening SQL

Open Supabase Dashboard -> SQL Editor and paste/run:

```text
backend/migrations/20260518_01_security_hardening_public_surface.sql
```

That migration:
- drops `public.exec_sql(text)`;
- revokes Vault helper RPC access from `PUBLIC`, `anon` and `authenticated`;
- grants Vault helper execution only to `service_role`;
- enables and forces RLS on sensitive tables;
- revokes direct table access from public/browser roles;
- grants service-role table and sequence access.

### 3. Verify RLS state

Run:

```sql
select
  schemaname,
  tablename,
  rowsecurity,
  forcerowsecurity
from pg_tables
where schemaname = 'public'
order by tablename;
```

Every sensitive app table should show:

```text
rowsecurity = true
forcerowsecurity = true
```

### 4. Verify dangerous RPCs

Run:

```sql
select
  n.nspname as schema,
  p.proname as function_name,
  r.rolname as role_name,
  has_function_privilege(r.rolname, p.oid, 'execute') as can_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
cross join (values ('anon'), ('authenticated'), ('service_role')) as r(rolname)
where n.nspname = 'public'
  and p.proname in ('exec_sql', 'store_private_key', 'get_private_key')
order by p.proname, r.rolname;
```

Expected:
- `exec_sql` should not exist.
- `anon` and `authenticated` should not execute `store_private_key` or `get_private_key`.
- `service_role` may execute Vault helpers because the backend needs them.

### 5. Verify direct table grants

Run:

```sql
select
  grantee,
  table_name,
  privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and grantee in ('anon', 'authenticated')
order by grantee, table_name, privilege_type;
```

Expected:
- No direct grants for sensitive app tables.
- If any direct grant remains, review whether it is intentionally public. For this backend-owned architecture, almost all browser access should go through the backend service role, not direct Supabase browser queries.

## Recommended implementation order

1. Patch `FIN-01`: require `session_token` for wallet profile enrichment or return a sanitized public profile.
2. Patch `LOG-01` and `IDEMP-01`: redact logs and idempotency response bodies.
3. Patch `RAMP-01/RAMP-02`: require internal secret for sandbox/demo endpoints.
4. Patch `AUTH-01`: migrate frontend calls to headers and remove query-token auth from backend.
5. Patch `PIN-01`: mandatory `PIN_SALT`, central utility, then per-user salt migration.
6. Apply RLS hardening in Supabase and save verification screenshots/output for audit evidence.
7. Add CI guardrails for migration anti-patterns and secret scanning.

## What not to do

- Do not run `RUN_LEGACY_STARTUP_MIGRATIONS=true` in Railway.
- Do not restore `public.exec_sql`.
- Do not expose sandbox ramp helper endpoints on a public URL without an internal secret.
- Do not paste real `session_id`, `session_token`, API keys, Stellar secrets or Supabase service role keys in docs, videos or support chats.
