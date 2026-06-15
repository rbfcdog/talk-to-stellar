# Deliverable 1 — Status Checklist

Updated: 2026-06-14

## Acceptance Criteria

- [x] `transfers` + `transfer_events` migration exists; DB-backed ops admin login migration exists; rollback SQL is intentionally excluded and DB backup is required before applying
- [ ] Updated plain-SQL migrations run cleanly against Supabase and schema inspection pasted in `MIGRATIONS.md`
- [x] State machine module with explicit transition map; illegal transitions throw; covered by tests
- [x] Orchestrator coordinates normalized PIX intake, conversion, Stellar settlement, payout routing hook, reconciliation, and full lifecycle management
- [x] Existing international transfer API/service mirrors real Etherfuse/Stellar/payout stages into normalized `transfers`
- [x] Conversational path can surface `public_ref` through `create_usd_bank_transfer_intent`
- [x] Programmatic API: create/read/list normalized transfers with token auth
- [x] Idempotent webhook/settlement handling with replay events logged
- [x] Structured per-transfer orchestration logs + export script
- [x] `/ops` dashboard list + detail with timeline, reconciliation, raw record, DB-backed browser login, and token-compatible JSON API auth
- [x] Frontend `/admin/transactions` screen for database-backed transfer operations visibility
- [x] Unit + integration tests for state machine/orchestrator pass in this run
- [ ] Manual WhatsApp/Telegram check completed and noted
- [ ] One real Stellar testnet end-to-end transfer executed
- [ ] Dashboard screenshots captured as `dashboard-list.png` / `dashboard-detail.png`
- [ ] All 4 final evidence artifacts refreshed for the same real testnet transfer
- [ ] Final orchestration logs and transfer record exported from a reconciled real Stellar testnet transfer
- [x] Runs documented under `docs/insta-awards/deliverables/deliverable-1/runs/`

## Evidence Status

| # | Artifact | Path | Status |
|---|----------|------|--------|
| 1 | Repository link + capability map | `evidence/REPO.md` | Needs refresh after final run |
| 2 | Dashboard instructions/screenshots | `evidence/DASHBOARD.md`, `dashboard-list.png`, `dashboard-detail.png` | Instructions exist; screenshots pending |
| 3 | Orchestration logs | `docs/insta-awards/deliverables/deliverable-1/evidence/orchestration-logs-TTS-REAL-STELLAR-PAYMENT-2.json` | Real historical Stellar payment JSON exists; final D1 PIX-to-payout log still pending |
| 4 | Transfer record | `docs/insta-awards/deliverables/deliverable-1/evidence/transfer-record-TTS-REAL-STELLAR-PAYMENT-2.json` | Real historical Stellar payment JSON exists; final D1 PIX-to-payout transfer record still pending |

## Verification This Run

```bash
npm --prefix backend run build
# PASS: TypeScript compile

npm --prefix backend test -- --runInBand tests/orchestration/stateMachine.test.ts tests/orchestration/orchestrator.test.ts
# PASS: 2 suites, 21 tests

npm --prefix backend test -- --runInBand tests/international-transfer.routes.test.ts
# PASS: 1 suite, 5 tests

npm --prefix frontend run build
# PASS: Next.js build; /admin/transactions route generated

npm --prefix backend test -- --runInBand tests/ops.routes.test.ts tests/ops-history.repository.test.ts tests/orchestration/stateMachine.test.ts tests/orchestration/orchestrator.test.ts tests/international-transfer.routes.test.ts
# PASS: 5 suites, 33 tests
```

## Current Blockers Before Declaring Done

1. Apply the updated plain-SQL `backend/migrations/20260613_00_full_schema.sql` and `backend/migrations/20260614_00_ops_admin_auth.sql` to the target Supabase database.
2. Run schema inspection and paste output into `MIGRATIONS.md`.
3. Execute a real Stellar testnet D1 transfer with `LOG_FILE` enabled.
4. Start backend and capture `/ops` list/detail screenshots for that same transfer.
5. Export refreshed log and transfer record evidence for that same `public_ref`.

## Evidence Export Policy

The active evidence folder intentionally contains no final D1 PIX-to-payout log or transfer-record JSON until the final same-transfer run is complete.

The export scripts now reject non-final evidence before writing files. A transfer must be `RECONCILED`, include a real PIX evidence value, include a 64-character Stellar transaction hash, include a positive Stellar ledger number, and include reconciliation metadata.

The active evidence folder also contains two real historical Stellar-payment JSON files exported from `payment_logs.id = 2` and verified against Horizon testnet ledger `2488252`. Those files are useful as non-generated Stellar evidence, but they are not the final D1 PIX-to-payout package.

## Documentation Pointers

- Start here: `README.md`
- Final evidence production steps: `EVIDENCE-RUNBOOK.md`
- Migration details and schema inspection SQL: `MIGRATIONS.md`
- Latest dashboard cleanup run: `runs/2026-06-14-2224-ops-dashboard-cleanup.md`
