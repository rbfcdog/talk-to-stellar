# Repository Evidence — Deliverable 1

Status: needs final refresh after the real testnet evidence run.

## Repo URL

`https://github.com/anomalyco/talk-to-stellar`

Branch: record the branch name from the final submission run.

## Capability Map

| SOW capability | Current code path |
|---|---|
| PIX intake coordination | `backend/src/api/services/pix-funding.service.ts`, `backend/src/api/controllers/etherfuse-webhook.controller.ts`, mirrored by `backend/src/orchestration/TransferOrchestrator.ts` |
| BRL-to-USDC conversion flow | `backend/src/api/services/brl-usd-quote.service.ts`, `backend/src/api/services/stellar-settlement.service.ts`, normalized by `TransferOrchestrator.attachQuote()` / `beginConversion()` |
| Stellar settlement tracking | `backend/src/orchestration/stellarWatcher.ts`, `TransferOrchestrator.confirmStellarSettlement()` |
| Payout routing hook | `backend/src/api/services/usd-payout-coordination.service.ts`, `TransferOrchestrator.routePayout()` / `instructPayout()` |
| Reconciliation metadata | `TransferOrchestrator` reconciliation builder, `transfers.reconciliation`, `transfer_events` |
| Lifecycle management | `backend/src/orchestration/stateMachine.ts`, `backend/src/orchestration/TransferOrchestrator.ts` |
| Existing conversational integration | `backend/src/api/agent/tools.ts` returns `public_ref`; `international-transfer.service.ts` mirrors existing stages into normalized transfers |
| Programmatic API | `backend/src/api/controllers/international-transfers.controller.ts`, `backend/src/api/controllers/ops.controller.ts` |
| Ops dashboard | `backend/src/api/controllers/ops.controller.ts`, `backend/src/api/routes/ops.router.ts` |
| Evidence export | `backend/scripts/export-transfer-log.ts`, `backend/scripts/export-transfer-record.ts` |

## Key Files

| File | Purpose |
|------|---------|
| `backend/migrations/20260613_00_full_schema.sql` | Complete database bootstrap, including `transfers`, append-only `transfer_events`, public refs, and atomic RPCs. |
| `backend/src/api/repository/transfer.repository.ts` | Supabase repository using atomic RPCs. |
| `backend/src/orchestration/decimal.ts` | Decimal-string arithmetic. |
| `backend/src/orchestration/orchestrationLogger.ts` | JSON orchestration logs. |
| `backend/src/orchestration/TransferOrchestrator.ts` | Normalized lifecycle engine. |
| `backend/src/orchestration/stateMachine.ts` | Explicit transition map and `IllegalTransitionError`. |
| `backend/src/orchestration/stellarWatcher.ts` | Horizon watcher for submitted settlement tx hashes. |
| `backend/src/api/controllers/ops.controller.ts` | `/ops` dashboard and JSON API helpers. |

## Current Verification

```bash
npm --prefix backend run build
npm --prefix backend test -- --runInBand tests/orchestration/stateMachine.test.ts tests/orchestration/orchestrator.test.ts
npm --prefix backend test -- --runInBand tests/international-transfer.routes.test.ts
```

Latest run report: `docs/insta-awards/deliverables/deliverable-1/runs/2026-06-13-1752.md`.
