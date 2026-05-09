# Deployment Notes — TalkToStellar

This file lists minimal, reproducible steps to apply the database migration and run the backend locally or in a container.

## Apply the database migration

- Recommended: open the Supabase project SQL editor and paste the contents of `backend/migrations/supabase_full_setup.sql`.
- Alternatively, run against a Postgres-compatible `DATABASE_URL`:

```bash
# from repo root
psql "$DATABASE_URL" -f backend/migrations/supabase_full_setup.sql
```

Notes:
- The script is idempotent and disables RLS for local/dev convenience. Enable appropriate RLS policies for production.

## Environment variables (examples)

- `DATABASE_URL` — Postgres connection string used by Supabase/backend.
- `VAULT_SECRET_ID` — ID used by backend to read signing keys from Vault (if used).
- `JWT_SECRET` — server JWT signing secret.
- `STELLAR_HORIZON_URL` — Horizon REST endpoint (use testnet or local horizon for integration tests).
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER` — optional, for WhatsApp low-balance alerts.
- `PORT` — server listen port (default 3000)

## Run backend locally

```bash
cd backend
npm ci
# build TypeScript
npm run build
# start server (or use nodemon during development)
npm start
```

## Run tests

```bash
cd backend
npm test
```

Notes on tests:
- Some integration tests contact a Stellar Horizon endpoint. If `STELLAR_HORIZON_URL` is not set or reachable, those tests will fail (observed: `connect ECONNREFUSED` / `Not Found`). Use a reachable Horizon instance or a local mock for CI.

## Run with Docker Compose

```bash
docker-compose up --build
```

## Next operational steps (recommended)

- Wire Twilio credentials and enable `balance-alert.service` send functionality.
- Apply the SQL script to your Supabase project before running the backend against production data.
- After migration, run a full integration test pass with `STELLAR_HORIZON_URL` configured.
