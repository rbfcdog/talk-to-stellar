# Institutional Settlement Demo Setup

This setup prepares the backend, frontend, database, Stellar runtime, and payout provider configuration for the institutional settlement walkthrough.

## 1. Required Local Tools

- Node.js 20 or newer.
- npm.
- Access to the repository checkout.
- Supabase database credentials for the target environment.
- Optional: Playwright browser dependencies for automated screenshots.

## 2. Database

Apply the consolidated backend schema from a trusted admin shell:

```bash
cd backend
DATABASE_URL=postgresql://... npm run migrate:required
```

Current schema source of truth:

```text
backend/migrations/20260613_00_full_schema.sql
backend/migrations/20260614_00_ops_admin_auth.sql
```

Do not create a separate D3 migration for the demo. The walkthrough should prove the current transfer, payout, and reconciliation tables.

## 3. Backend Environment

Minimum env for a local compatibility run:

```bash
PORT=3001
SUPABASE_URL=https://...
SUPABASE_SERVICE_ROLE_KEY=...
SUPABASE_ANON_KEY=...

INTERNATIONAL_TRANSFER_OPS_SECRET=replace-with-long-random-secret
OPS_DASHBOARD_TOKEN=replace-with-review-token # JSON/API compatibility
OPS_ADMIN_LOGIN=admin@example.com
OPS_ADMIN_PASSWORD_HASH=generate-with-ops-hash-password
TRANSFER_API_TOKEN=replace-with-review-token
LOG_FILE=/tmp/talktostellar-institution-settlement.jsonl

PAYOUT_PROVIDER=circle
ENABLE_REAL_PAYOUT_EXECUTION=false
CIRCLE_ENVIRONMENT=sandbox
CIRCLE_API_KEY=
CIRCLE_PAYOUT_DESTINATION_ID=
CIRCLE_PAYOUT_DESTINATION_TYPE=wire
CIRCLE_PAYOUT_WEBHOOK_SECRET=replace-with-long-random-secret
PAYOUT_PROVIDER_TIMEOUT_MS=30000
```

Mock-only development toggles, if real provider credentials are unavailable:

```bash
ALLOW_OPS_MOCKS=true
INTERNATIONAL_TRANSFER_ENABLE_MOCK_PIX=true
ALLOW_STELLAR_MOCK_SETTLEMENT=true
ALLOW_MOCK_USD_PAYOUTS=true
```

Use mock toggles only for local walkthrough rehearsal. Final reviewer language must say "mock" when these are enabled.

## 4. Stellar Testnet Environment

For a real Stellar testnet settlement, configure:

```bash
STELLAR_NETWORK=TESTNET
STELLAR_HORIZON_URL=https://horizon-testnet.stellar.org
STELLAR_SECRET_KEY=replace-with-funded-testnet-source-secret
STELLAR_PUBLIC_KEY=replace-with-source-public-key
USD_OFFRAMP_STELLAR_DESTINATION=replace-with-testnet-destination-public-key
USDC_ASSET_CODE=USDC
USDC_ASSET_ISSUER=replace-with-testnet-usdc-issuer
```

`backend/src/api/services/stellar-settlement.service.ts` requires a source secret and destination public key for real settlement. Without them, settlement can only proceed if `ALLOW_STELLAR_MOCK_SETTLEMENT=true`.

## 5. Circle Setup

For Circle compatibility evidence:

```bash
PAYOUT_PROVIDER=circle
ENABLE_REAL_PAYOUT_EXECUTION=false
```

For Circle sandbox execution:

```bash
PAYOUT_PROVIDER=circle
ENABLE_REAL_PAYOUT_EXECUTION=true
CIRCLE_ENVIRONMENT=sandbox
CIRCLE_API_KEY=replace-with-sandbox-key
CIRCLE_PAYOUT_DESTINATION_ID=replace-with-linked-bank-account-id
CIRCLE_PAYOUT_DESTINATION_TYPE=wire
```

Detailed Circle setup:

```text
backend/docs/CIRCLE_INTEGRATION_SETUP.md
```

## 6. Start Services

Backend:

```bash
npm --prefix backend install
LOG_FILE=/tmp/talktostellar-institution-settlement.jsonl npm --prefix backend run dev
```

Frontend:

```bash
npm --prefix frontend install
BACKEND_URL=http://localhost:3001 NEXT_PUBLIC_BACKEND_URL=http://localhost:3001 npm --prefix frontend run dev
```

Expected local URLs:

```text
Backend: http://localhost:3001
Institution settlement demo: http://localhost:3000/institution-settlement
Ops dashboard: http://localhost:3001/ops/login, then /ops?source=transfers
Admin dashboard: http://localhost:3000/admin/transactions
```

## 7. Verification Commands

Docs-only foundation validation:

```bash
git diff --check -- '*.md'
```

Backend and frontend verification before final capture:

```bash
npm --prefix backend run build
npm --prefix backend test -- --runInBand tests/international-transfer.routes.test.ts tests/payout-adapter-contract.test.ts
npm --prefix frontend run build
```
