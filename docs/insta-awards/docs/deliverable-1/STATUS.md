# Deliverable 1 — Status Checklist

Updated: 2026-06-14

## Acceptance Criteria

- [x] `transfers` + `transfer_events` migration exists; rollback SQL is intentionally excluded and DB backup is required before applying
- [ ] Migrations run cleanly against Supabase and schema inspection pasted in `MIGRATIONS.md`
- [x] State machine module with explicit transition map; illegal transitions throw; covered by tests
- [x] Orchestrator coordinates normalized PIX intake, conversion, Stellar settlement, payout routing hook, reconciliation, and full lifecycle management
- [x] Existing international transfer API/service mirrors real Etherfuse/Stellar/payout stages into normalized `transfers`
- [x] Conversational path can surface `public_ref` through `create_usd_bank_transfer_intent`
- [x] Programmatic API: create/read/list normalized transfers with token auth
- [x] Idempotent webhook/settlement handling with replay events logged
- [x] Structured per-transfer orchestration logs + export script
- [x] `/ops` dashboard list + detail with timeline, reconciliation, raw record, and token auth
- [x] Frontend `/admin/transactions` screen for database-backed transfer operations visibility
- [x] Unit + integration tests for state machine/orchestrator pass in this run
- [ ] Manual WhatsApp/Telegram check completed and noted
- [ ] One real Stellar testnet end-to-end transfer executed
- [ ] Dashboard screenshots captured as `dashboard-list.png` / `dashboard-detail.png`
- [ ] All 4 final evidence artifacts refreshed for the same real testnet transfer
- [x] Interim database-backed orchestration logs and transfer record refreshed from normalized `transfers` + `transfer_events`
- [x] Runs documented under `docs/insta-awards/docs/deliverable-1/runs/`

## Evidence Status

| # | Artifact | Path | Status |
|---|----------|------|--------|
| 1 | Repository link + capability map | `evidence/REPO.md` | Needs refresh after final run |
| 2 | Dashboard instructions/screenshots | `evidence/DASHBOARD.md`, `dashboard-list.png`, `dashboard-detail.png` | Instructions exist; screenshots pending |
| 3 | Orchestration logs | `docs/insta-awards/deliverable-1/evidence/orchestration-logs-TTS-2026-000001.json` | Refreshed 2026-06-14 from DB-backed normalized transfer mirrored from legacy `international_transfers`; final real completed testnet transfer still pending |
| 4 | Transfer record | `docs/insta-awards/deliverable-1/evidence/transfer-record-TTS-2026-000001.json` | Refreshed 2026-06-14 from the same DB-backed normalized transfer; final real completed testnet transfer still pending |

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

cd backend
npx ts-node scripts/export-transfer-log.ts 972fda9f-fdec-47bd-a21c-a9326999e948
# PASS: wrote docs/insta-awards/deliverable-1/evidence/orchestration-logs-TTS-2026-000001.json

cd backend
npx ts-node scripts/export-transfer-record.ts 972fda9f-fdec-47bd-a21c-a9326999e948
# PASS: wrote docs/insta-awards/deliverable-1/evidence/transfer-record-TTS-2026-000001.json
```

## Current Blockers Before Declaring Done

1. Apply `backend/migrations/20260613_00_full_schema.sql` to the target Supabase database.
2. Run schema inspection and paste output into `MIGRATIONS.md`.
3. Execute a real Stellar testnet D1 transfer with `LOG_FILE` enabled.
4. Start backend and capture `/ops` list/detail screenshots for that same transfer.
5. Export refreshed log and transfer record evidence for that same `public_ref`.

## Interim Evidence Export

On 2026-06-14, `international_transfers.id = tr_brl_usd_4413c4bb-475f-4cfa-a7e8-50c18e7605ec` was mirrored through `TransferOrchestrator.syncFromInternationalTransfer()` into normalized transfer `972fda9f-fdec-47bd-a21c-a9326999e948` / `TTS-2026-000001`.

That database-backed transfer currently has 8 lifecycle events and ends at `PAYOUT_INSTRUCTED`. The exported JSON files are reviewer-useful for validating architecture, lifecycle transitions, quote flow, payout object handling, and reconciliation metadata shape, but they are not a substitute for the final same-transfer real testnet evidence run.

## Documentation Pointers

- Start here: `README.md`
- Final evidence production steps: `EVIDENCE-RUNBOOK.md`
- Migration details and schema inspection SQL: `MIGRATIONS.md`
- Latest evidence export run: `runs/2026-06-14-1155-evidence-export.md`
