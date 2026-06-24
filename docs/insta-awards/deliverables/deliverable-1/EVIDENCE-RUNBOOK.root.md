# Evidence Runbook — Deliverable 1

How to generate the final D1 reviewer evidence package. Every artifact must reference the same transfer.

## Prerequisites

Set environment variables for the target Supabase and Stellar testnet:

```bash
export SUPABASE_URL="..."
export SUPABASE_SERVICE_ROLE_KEY="..."
export STELLAR_NETWORK="TESTNET"
export STELLAR_HORIZON_URL="https://horizon-testnet.stellar.org"
export STELLAR_SECRET_KEY="..."
export STELLAR_PUBLIC_KEY="..."
export USD_OFFRAMP_STELLAR_DESTINATION="..."
export USDC_ASSET_ISSUER="..."
export OPS_DASHBOARD_TOKEN="<review-token>"
export OPS_ADMIN_LOGIN="admin@example.com"
export LOG_FILE="/tmp/talktostellar-orchestration.jsonl"
```

If using real Etherfuse PIX funding, add the Etherfuse env vars from `docs/project-brain/operations/ENVIRONMENTS.md`.

---

## Step 1 — Apply Migrations

```bash
cd backend

# Generate hashed admin password
read -rs OPS_ADMIN_PASSWORD
export OPS_ADMIN_PASSWORD
export OPS_ADMIN_PASSWORD_HASH="$(npm run ops:hash-password --silent)"

# Run required migrations
DATABASE_URL="$SUPABASE_URL" npx ts-node scripts/run-required-migrations.ts

unset OPS_ADMIN_PASSWORD OPS_ADMIN_PASSWORD_HASH
```

Then run the schema inspection SQL from `docs/insta-awards/deliverables/deliverable-1/MIGRATIONS.md` and paste the output under a new dated section.

---

## Step 2 — Run End-to-End Test Transfer (Legacy international_transfer)

Start the backend with logging enabled:

```bash
cd backend
LOG_FILE=/tmp/talktostellar-orchestration.jsonl \
OPS_DASHBOARD_TOKEN=<review-token> \
npm run dev
```

In a separate terminal, execute the transfer lifecycle through the legacy international transfer API:

```bash
# 1. Create BRL/USD quote
curl -s -X POST http://localhost:3001/api/quotes/brl-usd \
  -H 'Content-Type: application/json' \
  -H 'x-request-id: evidence-run-1' \
  -H 'x-correlation-id: evidence-run-1' \
  -d '{"brl_amount":"560","user_id":"evidence-runner"}' | jq .

# 2. Create transfer
export QUOTE_ID="<quote_id from step 1>"
curl -s -X POST http://localhost:3001/api/transfers \
  -H 'Content-Type: application/json' \
  -H 'x-request-id: evidence-run-1' \
  -H 'x-correlation-id: evidence-run-1' \
  -H 'x-international-transfer-ops-secret: <ops-secret>' \
  -d "{\"quote_id\":\"$QUOTE_ID\",\"payout_destination\":{\"accountHolderName\":\"Destination LLC\",\"accountHolderType\":\"business\",\"country\":\"US\"}}" | jq .

# 3. Create PIX intent
export LEGACY_TX_ID="<transfer_id from step 2>"
curl -s -X POST "http://localhost:3001/api/transfers/$LEGACY_TX_ID/pix-intent" \
  -H 'Content-Type: application/json' \
  -H 'x-request-id: evidence-run-1' \
  -H 'x-correlation-id: evidence-run-1' \
  -H 'x-international-transfer-ops-secret: <ops-secret>' \
  -d '{"session_id":"evidence-session","session_token":"evidence-token"}' | jq .

# 4. Confirm PIX funding (sandbox or Etherfuse webhook)
# Option A — sandbox confirmation (document if not real Etherfuse):
curl -s -X POST "http://localhost:3001/api/transfers/$LEGACY_TX_ID/funding-confirmation" \
  -H 'Content-Type: application/json' \
  -H 'x-request-id: evidence-run-1' \
  -H 'x-correlation-id: evidence-run-1' \
  -H 'x-international-transfer-ops-secret: <ops-secret>' \
  -d '{"status":"completed"}' | jq .

# 5. Settle Stellar
curl -s -X POST "http://localhost:3001/api/transfers/$LEGACY_TX_ID/settle-stellar" \
  -H 'Content-Type: application/json' \
  -H 'x-request-id: evidence-run-1' \
  -H 'x-correlation-id: evidence-run-1' \
  -H 'x-international-transfer-ops-secret: <ops-secret>' \
  -d '{}' | jq .

# 6. Create payout instruction
curl -s -X POST "http://localhost:3001/api/transfers/$LEGACY_TX_ID/payout-instruction" \
  -H 'Content-Type: application/json' \
  -H 'x-request-id: evidence-run-1' \
  -H 'x-correlation-id: evidence-run-1' \
  -H 'x-international-transfer-ops-secret: <ops-secret>' \
  -d '{"provider":"circle"}' | jq .

# 7. Refresh payout status until complete
curl -s -X POST "http://localhost:3001/api/transfers/$LEGACY_TX_ID/payout-status-refresh" \
  -H 'Content-Type: application/json' \
  -H 'x-request-id: evidence-run-1' \
  -H 'x-correlation-id: evidence-run-1' \
  -H 'x-international-transfer-ops-secret: <ops-secret>' \
  -d '{}' | jq .
```

Record these IDs for later steps:

```text
legacy transfer_id:    <LEGACY_TX_ID>
stellar_tx_hash:       <from settle-stellar response>
payout_instruction_id: <from payout-instruction response>
```

---

## Step 3 — Sync to Orchestration Engine

Mirror the completed legacy transfer into the normalized `transfers` table:

```bash
cd backend

npx ts-node -e "
import { supabase } from './src/config/supabase';
import { orchestrator } from './src/orchestration/TransferOrchestrator';

(async () => {
  const legacyId = '<LEGACY_TX_ID>';
  const { data, error } = await supabase
    .from('international_transfers')
    .select('*')
    .eq('id', legacyId)
    .single();
  if (error) throw error;
  const transfer = await orchestrator.syncFromInternationalTransfer(
    { transfer_id: data.id, ...data },
    'system',
    'instawards-final-evidence-2026-06-14'
  );
  console.log(JSON.stringify({
    id: transfer?.id,
    public_ref: transfer?.public_ref,
    state: transfer?.state,
    legacy_transfer_id: transfer?.legacy_transfer_id,
  }, null, 2));
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
"
```

Record:

```text
normalized transfer id: <from output>
public_ref:             <from output, e.g. TTS-2026-000002>
```

---

## Step 4 — Export Evidence with Export Scripts

Use the normalized transfer ID or `public_ref`:

```bash
cd backend

# Export orchestration logs
npm run instawards:export-log -- <normalized_transfer_id_or_public_ref>
# Writes: insta-awards/deliverable-1/evidence/orchestration-logs-<public_ref>.json

# Export transfer record
npm run instawards:export-record -- <normalized_transfer_id_or_public_ref>
# Writes: insta-awards/deliverable-1/evidence/transfer-record-<public_ref>.json
```

Verify the exports contain:

- `orchestration-logs-*.json`: `orchestration_logs` from `LOG_FILE`, `transfer_events` from DB, every transition from creation to reconciliation, any idempotent replays.
- `transfer-record-*.json`: `source_endpoint`, `destination_endpoint`, `amount_brl_in`, `amount_usdc_settled`, `amount_usd_out_expected`, `quote`, `pix`, `stellar`, `payout`, `reconciliation`, with PII masked.

---

## Step 5 — Capture Dashboard Screenshots

Start the frontend (if not already running):

```bash
cd frontend
BACKEND_URL=http://localhost:3001 npm run dev
```

Open browser:

1. **Login**: `http://localhost:3000/ops/login` — sign in with `OPS_ADMIN_LOGIN` and the password whose hash was migrated in Step 1.

2. **List screenshot**: Open `http://localhost:3000/ops?source=transfers` — the `source=transfers` filter isolates normalized lifecycle records.
   - Capture as: `insta-awards/deliverable-1/evidence/dashboard-list.png`

3. **Detail screenshot**: Click the row for the completed `public_ref` to open the transfer detail page.
   - Must show: `public_ref`, full lifecycle timeline, reconciliation panel, raw transfer record section, Stellar transaction link.
   - Capture as: `insta-awards/deliverable-1/evidence/dashboard-detail.png`

Optional: Open `http://localhost:3000/admin/transactions` and capture an additional frontend admin screenshot.

---

## Step 6 — Verify on stellar.expert

If the transfer used real Stellar testnet:

```text
https://stellar.expert/explorer/testnet/tx/<stellar_tx_hash>
```

Capture a screenshot if reviewers require blockchain evidence. Save to `insta-awards/deliverable-1/evidence/stellar-expert.png`.

---

## Step 7 — Package for Submission

Verify all required files exist:

```bash
ls -lh insta-awards/deliverable-1/evidence/
```

Required files:

```text
REPO.md
DASHBOARD.md
dashboard-list.png
dashboard-detail.png
orchestration-logs-<public_ref>.json
transfer-record-<public_ref>.json
```

Update status docs:

- `insta-awards/deliverable-1/evidence/REPO.md` — update branch, file tree summary, capability map with line counts.
- `insta-awards/deliverable-1/evidence/DASHBOARD.md` — update screenshot paths and token setup.
- `docs/insta-awards/deliverables/deliverable-1/STATUS.md` — check off all acceptance criteria.

Final verification:

```bash
npm --prefix backend run build
npm --prefix backend test -- --runInBand \
  tests/orchestration/stateMachine.test.ts \
  tests/orchestration/orchestrator.test.ts \
  tests/payout-adapter-contract.test.ts \
  tests/international-transfer.routes.test.ts
# Expected: 4 suites, 34 tests, all passing
```
