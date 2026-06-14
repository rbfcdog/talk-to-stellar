# Evidence Runbook — Deliverable 1

Use this runbook to produce the final reviewer evidence package. The four evidence artifacts must corroborate the same transfer.

## Prerequisites

Set the backend environment for the target Supabase and Stellar testnet runtime.

Required or expected:

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
export LOG_FILE="/tmp/talktostellar-orchestration.jsonl"
```

Real Etherfuse PIX funding also requires the Etherfuse env from `docs/project-brain/operations/ENVIRONMENTS.md`. If provider sandbox funding is not available, document the simulated PIX webhook clearly in the run report.

## Step 1 — Apply Migrations

```bash
cd backend
DATABASE_URL=postgresql://... npm run migrate:required
```

Then run the schema inspection SQL in `MIGRATIONS.md` and paste the output into `MIGRATIONS.md` under a new dated section.

## Step 2 — Start Backend

```bash
cd backend
LOG_FILE=/tmp/talktostellar-orchestration.jsonl OPS_DASHBOARD_TOKEN=<review-token> npm run dev
```

Keep this process running while the evidence transfer is executed so JSON logs are captured.

## Step 3 — Execute One Transfer

Preferred path: use the existing international transfer API so the real Etherfuse/Stellar/payout services are exercised and mirrored into the normalized `transfers` table.

High-level sequence:

1. Create BRL/USD quote with `POST /api/quotes/brl-usd`.
2. Create transfer with `POST /api/transfers` using the returned `quote_id`.
3. Create PIX intent with `POST /api/transfers/:legacy_transfer_id/pix-intent`.
4. Confirm PIX funding through Etherfuse webhook, or document the authorized sandbox confirmation path.
5. Settle Stellar with `POST /api/transfers/:legacy_transfer_id/settle-stellar`.
6. Create payout instruction with `POST /api/transfers/:legacy_transfer_id/payout-instruction`.
7. Refresh payout status or use provider webhook until payout status is complete.
8. Confirm the normalized transfer reaches `RECONCILED` in `/ops`.

Record both IDs:

```text
legacy transfer_id:
normalized transfer id:
public_ref:
```

## Step 4 — Capture Dashboard Screenshots

Open:

```text
http://localhost:3001/ops?token=<review-token>&source=transfers
```

The `source=transfers` filter keeps the D1 list screenshot focused on normalized lifecycle records. Opening `/ops` without this filter shows the complete database transaction history.

Capture:

```text
docs/insta-awards/deliverable-1/evidence/dashboard-list.png
```

Then open the completed transfer detail row and capture:

```text
docs/insta-awards/deliverable-1/evidence/dashboard-detail.png
```

The detail screenshot should show:

- The same `public_ref`.
- Full lifecycle timeline.
- Reconciliation panel.
- Raw Transfer Record section.
- Stellar transaction link when available.

## Step 5 — Export Logs

Use the normalized transfer ID or public ref:

```bash
cd backend
npm run instawards:export-log -- <normalized_transfer_id_or_public_ref>
```

Expected output:

```text
docs/insta-awards/deliverable-1/evidence/orchestration-logs-<public_ref>.json
```

The JSON must include:

- `orchestration_logs` from `LOG_FILE`.
- `transfer_events` from the database.
- Every transition from creation to reconciliation.
- Any idempotent replay events if retries occurred.

## Step 6 — Export Transfer Record

```bash
cd backend
npm run instawards:export-record -- <normalized_transfer_id_or_public_ref>
```

Expected output:

```text
docs/insta-awards/deliverable-1/evidence/transfer-record-<public_ref>.json
```

The JSON must include:

- `source_endpoint` and `destination_endpoint`.
- `amount_brl_in`, `amount_usdc_settled`, `amount_usd_out_expected`.
- `quote`, `pix`, `stellar`, `payout`, and `reconciliation`.
- PII masked in endpoint, PIX, and Stellar fields.

## Step 7 — Refresh Evidence Docs

Update:

- `evidence/REPO.md`: branch, file tree summary, and final capability map.
- `evidence/DASHBOARD.md`: final URL/token setup and screenshot paths.
- `STATUS.md`: mark evidence criteria complete only after files exist.
- `runs/<timestamp>.md`: paste commands, results, migration output, and evidence paths.

## Final Check

Before declaring done:

```bash
ls -lh docs/insta-awards/deliverable-1/evidence/
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
