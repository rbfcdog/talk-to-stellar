# D3 — Setup & Reproduction

Repo: https://github.com/rbfcdog/talk-to-stellar · branch `main`

## What you need

Node.js ≥20, PostgreSQL (or Supabase), Stellar testnet account with USDC trustline, Etherfuse sandbox API key, Git.

## Steps

```bash
git clone https://github.com/rbfcdog/talk-to-stellar.git
cd talk-to-stellar
npm --prefix backend ci
npm --prefix frontend ci
```

Create `backend/.env` with the required keys (see `backend/.env.example`):

```
STELLAR_NETWORK=testnet
STELLAR_HORIZON_URL=https://horizon-testnet.stellar.org
STELLAR_SECRET_KEY=S...
STELLAR_PUBLIC_KEY=G...
SUPABASE_URL=https://<project>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<key>
ETHERFUSE_API_KEY=<sandbox-key>
JWT_SECRET=<random>
OPS_DASHBOARD_TOKEN=<random>
OPENAI_API_KEY=sk-...
```

Apply migrations, build, and start:

```bash
npm --prefix backend run migrate:required
npm --prefix backend run build
npm --prefix backend start
```

Create an ops admin user, seed a test transfer, and open `/ops`. The full setup guide is at `insta-awards/deliverable-3/SETUP.md`.

## Testing Circle

The Circle wire payout is self-contained — credentials are hardcoded in the wire-test endpoint. No env vars needed. Run `npm run circle:e2e` for the full flow, or open `/wire-test` on the frontend for a one-button version.

## Key code paths

- Orchestration: `backend/src/orchestration/`
- Ops dashboard: `backend/src/api/controllers/ops.controller.ts`
- Transfer repository: `backend/src/api/repository/transfer.repository.ts`
- Payout adapters: `backend/src/api/services/usd-payout-adapters.ts`
- DB schema: `backend/migrations/20260613_00_full_schema.sql`
