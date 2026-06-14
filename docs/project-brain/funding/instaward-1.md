# Instaward #1 — Transfer Lifecycle Engine

**Status**: In progress; interim DB-backed evidence refreshed 2026-06-14
**Evidence**: `docs/insta-awards/deliverables/deliverable-1/evidence/`

## Scope (from SOW)
"Expansion of the existing TalkToStellar infrastructure into an orchestration engine capable of coordinating PIX intake, BRL-to-USDC conversion flows, Stellar settlement tracking, payout routing, reconciliation metadata, and transfer lifecycle management."

## Deliverables

| # | Item | Status | Evidence |
|---|------|--------|----------|
| 1 | Repository + code | ✅ | `backend/src/orchestration/` |
| 2 | Dashboard screenshot | Pending final capture | `docs/insta-awards/deliverables/deliverable-1/evidence/DASHBOARD.md` (instructions) |
| 3 | Orchestration logs | Interim refreshed | `docs/insta-awards/deliverables/deliverable-1/evidence/orchestration-logs-TTS-2026-000001.json` |
| 4 | Transfer record | Interim refreshed | `docs/insta-awards/deliverables/deliverable-1/evidence/transfer-record-TTS-2026-000001.json` |

Interim evidence is database-backed from normalized `TTS-2026-000001`, mirrored from legacy `international_transfers.id = tr_brl_usd_4413c4bb-475f-4cfa-a7e8-50c18e7605ec`. It proves lifecycle handling through `PAYOUT_INSTRUCTED`. Final completion still requires a same-transfer real Stellar testnet run through completion/reconciliation plus dashboard screenshots.

## Key Artifacts
- `backend/src/orchestration/stateMachine.ts` — 13-state transition map
- `backend/src/orchestration/TransferOrchestrator.ts` — engine with idempotency
- `backend/src/orchestration/stellarWatcher.ts` — autonomous settlement poller
- `backend/src/api/routes/ops.router.ts` — dashboard routes
- `backend/tests/orchestration/` — 32 tests (all pass)

## Test Results
```
PASS stateMachine.test.ts — 19 tests
PASS orchestrator.test.ts — 13 tests (full lifecycle + idempotency)
Total: 32 passed, 0 failed
```
