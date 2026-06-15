# Instaward #1 — Transfer Lifecycle Engine

**Status**: In progress; real historical Stellar JSON exists; final D1 same-transfer export pending
**Evidence**: `docs/insta-awards/deliverables/deliverable-1/evidence/`

## Scope (from SOW)
"Expansion of the existing TalkToStellar infrastructure into an orchestration engine capable of coordinating PIX intake, BRL-to-USDC conversion flows, Stellar settlement tracking, payout routing, reconciliation metadata, and transfer lifecycle management."

## Deliverables

| # | Item | Status | Evidence |
|---|------|--------|----------|
| 1 | Repository + code | ✅ | `backend/src/orchestration/` |
| 2 | Dashboard screenshot | Pending final capture | `docs/insta-awards/deliverables/deliverable-1/evidence/DASHBOARD.md` (instructions) |
| 3 | Orchestration logs | Real historical Stellar JSON exists; final D1 export pending | `docs/insta-awards/deliverables/deliverable-1/evidence/orchestration-logs-TTS-REAL-STELLAR-PAYMENT-2.json` |
| 4 | Transfer record | Real historical Stellar JSON exists; final D1 export pending | `docs/insta-awards/deliverables/deliverable-1/evidence/transfer-record-TTS-REAL-STELLAR-PAYMENT-2.json` |

The active evidence folder contains two real historical Stellar-payment JSON files from `payment_logs.id = 2`, verified against Horizon testnet transaction `e0309ddfdfb0a3514b8c8f58a13a3442650485c2691c8b271fadcbd27305d094`, ledger `2488252`. These files are not the final same-transfer D1 PIX-to-payout package. The final D1 exporters still reject non-final transfer evidence before writing files.

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
