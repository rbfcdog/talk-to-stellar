# Setup Guide — Reproducing the Transfer Routing Demo

**Target**: A reviewer with Node.js and a Stellar testnet account who wants to reproduce the demo end-to-end.

---

## Prerequisites

- **Node.js** ≥ 20
- **npm** ≥ 10
- **PostgreSQL** (or a Supabase project) — used as the backend database
- **Stellar testnet account** with funded XLM and USDC trustline
- **Etherfuse sandbox access** (API key for PIX sandbox)
- **Git** to clone the repository

---

## Step 1: Clone and Install

```bash
git clone https://github.com/rbfcdog/talk-to-stellar.git
cd talk-to-stellar
npm --prefix backend ci
npm --prefix frontend ci
```

---

## Step 2: Environment Variables

Create `backend/.env` with the following variables (names only — see `backend/.env.example` or `backend/.env.mainnet.example` for reference):

```
# Required — Stellar
STELLAR_NETWORK=testnet
STELLAR_HORIZON_URL=https://horizon-testnet.stellar.org
STELLAR_SECRET_KEY=S...
STELLAR_PUBLIC_KEY=G...

# Required — Supabase (PostgreSQL)
SUPABASE_URL=https://<project>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>

# Required — Etherfuse (PIX sandbox)
ETHERFUSE_API_KEY=<sandbox-api-key>
ETHERFUSE_SANDBOX_PIX_FALLBACK=true

# Required — JWT
JWT_SECRET=<random-64-char-string>

# Required — Ops dashboard
OPS_DASHBOARD_TOKEN=<random-token-for-api-access>

# Required — OpenAI (for agent)
OPENAI_API_KEY=sk-...

# Optional — Payout execution (leave OFF for demo)
ALLOW_MOCK_USD_PAYOUTS=true
ALLOW_OPS_MOCKS=true
ENABLE_REAL_PAYOUT_EXECUTION=false

# Optional — Watcher tuning
STELLAR_WATCHER_INTERVAL_MS=10000
STELLAR_WATCHER_MAX_ATTEMPTS=60

# Optional — Structured logging to file
LOG_FILE=./logs/orchestration.jsonl

# Optional — Ops admin session
OPS_ADMIN_SESSION_HOURS=8
```

**Critical**: Set `ALLOW_MOCK_USD_PAYOUTS=true` and `ENABLE_REAL_PAYOUT_EXECUTION=false` to stay in demo mode. Never set `ENABLE_REAL_PAYOUT_EXECUTION=true` for a reviewer demo.

---

## Step 3: Apply Database Migrations

```bash
npm --prefix backend run migrate:required
```

This runs `backend/scripts/run-required-migrations.ts` which applies SQL files from `backend/migrations/` in sorted order:

1. `20260613_00_full_schema.sql` — Creates `transfers` table, `transfer_events` table, `create_transfer_with_event()` RPC, `transition_transfer()` RPC, triggers, indexes, and all other application tables.
2. `20260614_00_ops_admin_auth.sql` — Creates `ops_admin_users` table and auth functions.

Verify the tables exist:
```bash
# Connect to your Supabase SQL editor and run:
SELECT table_name FROM information_schema.tables WHERE table_name IN ('transfers', 'transfer_events', 'ops_admin_users');
```

---

## Step 4: Create an Ops Admin User

```bash
npm --prefix backend run ops:hash-password -- --login=reviewer@example.com --password=<choose-password>
```

This hashes the password with scrypt and inserts a row into `ops_admin_users`. The reviewer will use these credentials to log into `/ops/login`.

> The dashboard now uses session-based authentication (`/ops/login` form with scrypt + JWT cookie). The old `OPS_DASHBOARD_TOKEN` query-param access is still accepted for backward compatibility with scripts and evidence export.

---

## Step 5: Build and Start the Backend

```bash
npm --prefix backend run build
npm --prefix backend start
```

The backend starts on the port specified by `PORT` (default typically 3333).

To run in dev mode (auto-reload):
```bash
npm --prefix backend run dev
```

Verify the server is running:
```bash
curl http://localhost:3333/api/health
```

---

## Step 6: Seed a Test Transfer

### Option A: Via the Ops Dashboard (Recommended for Reviewers)

1. Navigate to `http://localhost:3333/ops/login`
2. Sign in with the ops admin credentials (Step 4)
3. On the dashboard, the "Create transfer" API is available at `POST /api/transfers`

### Option B: Via curl

```bash
curl -X POST http://localhost:3333/api/transfers \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer dev-ops-token" \
  -d '{
    "amount_brl_in": "1000.00",
    "source_endpoint": {
      "institution_type": "individual",
      "masked_identifier": "demo-user"
    },
    "destination_endpoint": {
      "provider_type": "usd_bank",
      "country": "US",
      "masked_account": "****1234",
      "account_holder_name": "John Doe"
    }
  }'
```

This creates a transfer in `CREATED` state with `public_ref` like `TTM-XXXXXX`.

### Option C: Simulate a Full Lifecycle via Code

For a realistic demo, manually advance the transfer through states using the orchestrator API endpoints. The `/api/transfers` endpoints support:

```
POST /api/transfers                    → CREATED
POST /api/transfers/:id/quote          → QUOTED
POST /api/transfers/:id/pix-charge     → PIX_CHARGE_ISSUED
POST /api/transfers/:id/pix-funding    → PIX_FUNDED
POST /api/transfers/:id/convert        → CONVERTING
POST /api/transfers/:id/stellar-settle → STELLAR_SETTLED
POST /api/transfers/:id/route-payout   → PAYOUT_ROUTING
POST /api/transfers/:id/instruct-payout → PAYOUT_INSTRUCTED
POST /api/transfers/:id/reconcile      → RECONCILED
```

---

## Step 7: Verify Stellar Settlement

If you advance a transfer to `CONVERTING` and record a `stellar.submitted_tx_hash`, the `StellarSettlementWatcher` will poll Horizon for confirmation.

**To get a real testnet tx hash**:

```bash
# Use the Stellar testnet helper script
npm --prefix backend run stellar:first-tx
```

Or manually submit a payment using the Stellar Laboratory: https://laboratory.stellar.org/#?network=test

Once you have a valid testnet transaction hash, advance the transfer:

```bash
curl -X POST http://localhost:3333/api/transfers/<transfer-uuid>/stellar-settle \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer dev-ops-token" \
  -d '{
    "tx_hash": "<your-testnet-tx-hash>",
    "ledger": 123456,
    "network": "testnet",
    "settled_at": "2026-06-14T00:00:00Z",
    "source_account_masked": "stellar:***abcd",
    "asset": "USDC",
    "path_used": ["BRL", "USDC"]
  }'
```

---

## Step 8: Access the Dashboard

1. Open `http://localhost:3333/ops/login`
2. Sign in with ops admin credentials
3. You should now see the dashboard at `http://localhost:3333/ops`
4. Filter by `source=transfers` to see D1 lifecycle records
5. Click any transfer reference to open the detail view at `/ops/transfers/:id`
6. Verify the lifecycle timeline, reconciliation panel, and evidence links

**Without login** (token-based access for scripts):
```
http://localhost:3333/ops?token=dev-ops-token
```

**JSON API** (machine-readable):
```bash
curl http://localhost:3333/api/transfers \
  -H "Authorization: Bearer dev-ops-token"

curl http://localhost:3333/api/transfers/<uuid> \
  -H "Authorization: Bearer dev-ops-token"
```

---

## Step 9: Verify on Stellar Expert

1. From the transfer detail page, find the Stellar tx hash in the Evidence & links panel
2. Click the stellar.expert link, or manually navigate to:
   ```
   https://stellar.expert/explorer/testnet/tx/<transaction-hash>
   ```
3. Confirm the transaction exists, is successful, and matches the recorded asset/path

---

## Step 10: Export Evidence (Optional)

```bash
npm run instawards:evidence -- \
  --api-base=http://localhost:3333 \
  --transfer-id=<transfer-uuid> \
  --dashboard-url=http://localhost:3000 \
  --label="Reviewer evidence run"
```

This writes redacted evidence artifacts to `insta-awards/evidence-runs/<run-id>/`.

Or export a single transfer record:
```bash
npm --prefix backend run instawards:export-record -- <transfer-uuid-or-public-ref>
```

---

## Troubleshooting

| Symptom | Check |
|---|---|
| Dashboard shows "Could not load the operations ledger" | Supabase connection: is `SUPABASE_URL` correct? Are migrations applied? |
| No transfers appear | Run `POST /api/transfers` to create one, or check `source=transfers` filter |
| Stellar settlement never confirms | Check `STELLAR_WATCHER_INTERVAL_MS` and `STELLAR_HORIZON_URL`. Is the tx hash valid for testnet? |
| Ops login fails | Run `npm --prefix backend run ops:hash-password` to create/reset credentials |
| "401 Unauthorized" on API calls | Add `Authorization: Bearer dev-ops-token` header (or value of `OPS_DASHBOARD_TOKEN`) |
| Payout stuck at ROUTING | Set `ALLOW_MOCK_USD_PAYOUTS=true` and `ENABLE_REAL_PAYOUT_EXECUTION=false` |

---

## Quick Verification Command

After setup, run this to verify the full stack:

```bash
# 1. Health check
curl -s http://localhost:3333/api/health | jq .

# 2. Create a transfer
TRANSFER=$(curl -s -X POST http://localhost:3333/api/transfers \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer dev-ops-token" \
  -d '{"amount_brl_in":"100.00","source_endpoint":{"institution_type":"test","masked_identifier":"test"},"destination_endpoint":{"provider_type":"usd_bank","country":"US","masked_account":"****1234"}}')
echo $TRANSFER | jq .transfer.id

# 3. List all transfers
curl -s http://localhost:3333/api/transfers \
  -H "Authorization: Bearer dev-ops-token" | jq '.transfers | length'

# 4. Check dashboard metrics (JSON)
curl -s "http://localhost:3333/api/ops/history?source=transfers" \
  -H "Authorization: Bearer dev-ops-token" | jq '.records | length'
```
