# Backend

## Onboarding flow

The backend exposes two public endpoints for external providers such as Telegram:

```text
POST /api/external/check-account
POST /api/external/finalize
```

`/api/external/check-account` receives `{ provider, provider_user_id }` and returns:
- `exists: true` with the linked `sessionId`, or
- `exists: false` with a dynamic `creationUrl` and a 24-hour JWT `token`.

`/api/external/finalize` consumes that `token` and creates the `agent_sessions` row, optionally creates a `wallets` row, and links `external_accounts`.

## Required env vars

```bash
JWT_SECRET=change-me
CREATE_ACCOUNT_BASE=http://localhost:3000
SUPABASE_URL=https://...
SUPABASE_SERVICE_ROLE_KEY=...
SUPABASE_ANON_KEY=...
```

## Circle USD payout foundation

The Circle payout adapter is documented in:

```text
backend/docs/CIRCLE_PAYOUT_FOUNDATION.md
backend/docs/CIRCLE_INTEGRATION_SETUP.md
```

The foundation document covers Circle Mint payout payloads, required env vars, sandbox/live gating, payout status polling, webhook intake, and redacted evidence rules. The setup document covers Circle sandbox setup, linked bank destination IDs, backend env, sandbox execution, webhooks, production gating, and troubleshooting. The implementation lives in `backend/src/api/services/usd-payout-adapters.ts`.

## Database migrations

The SQL migration source of truth is:

```text
backend/migrations/20260613_00_full_schema.sql
backend/migrations/20260614_00_ops_admin_auth.sql
```

The first file is the database bootstrap. The second file is the current incremental migration for DB-backed ops dashboard login and optional admin bootstrap.

Apply it from a trusted admin context with:

```bash
DATABASE_URL=postgresql://... npm run migrate:required
```

To create or rotate the first ops admin during migration:

```bash
read -rs OPS_ADMIN_PASSWORD
export OPS_ADMIN_PASSWORD
export OPS_ADMIN_PASSWORD_HASH="$(npm run ops:hash-password --silent)"
export OPS_ADMIN_LOGIN="admin@example.com"
DATABASE_URL=postgresql://... npm run migrate:required
unset OPS_ADMIN_PASSWORD OPS_ADMIN_PASSWORD_HASH
```

Do not add parallel SQL migrations under other folders or restore runtime schema bootstraps.

## Development

```bash
npm install
npm run dev
```

## Build and test

```bash
npm run build
npm test
```

## Folder map

```text
src/api/agent/          Conversational agent routes, graph, tools, prompts
src/api/controllers/    Express controllers
src/api/routes/         Express routers
src/api/repository/     Supabase repository layer
src/api/services/       Business services
src/config/             Runtime, Stellar, Supabase, asset, secret config
src/db/                 Legacy local database bootstrap helpers
src/integrations/       External provider clients/adapters
src/orchestration/      Transfer lifecycle engine
src/scripts/            Importable script implementations
scripts/                Runnable operational scripts
migrations/             The only SQL migration directory
tests/                  Jest tests
```
