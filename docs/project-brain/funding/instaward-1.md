# Instaward #1 — Transfer Lifecycle Engine

**Status**: In progress; final real evidence export pending
**Evidence**: `docs/insta-awards/deliverables/deliverable-1/evidence/`

## Scope (from SOW)
"Expansion of the existing TalkToStellar infrastructure into an orchestration engine capable of coordinating PIX intake, BRL-to-USDC conversion flows, Stellar settlement tracking, payout routing, reconciliation metadata, and transfer lifecycle management."

## Deliverables

| # | Item | Status | Evidence |
|---|------|--------|----------|
| 1 | Repository + code | ✅ | `backend/src/orchestration/` |
| 2 | Dashboard screenshot | Pending final capture | `docs/insta-awards/deliverables/deliverable-1/evidence/DASHBOARD.md` (instructions) |
| 3 | Orchestration logs | Pending final real export | `docs/insta-awards/deliverables/deliverable-1/evidence/orchestration-logs-<public_ref>.json` |
| 4 | Transfer record | Pending final real export | `docs/insta-awards/deliverables/deliverable-1/evidence/transfer-record-<public_ref>.json` |

The active evidence folder intentionally has no log or transfer-record JSON until the same-transfer real Stellar testnet run reaches reconciliation. The export scripts reject non-final evidence before writing files.

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
