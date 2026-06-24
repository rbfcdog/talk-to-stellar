# D1 — Transfer Lifecycle Engine

Repo: https://github.com/rbfcdog/talk-to-stellar · branch `main` · commit `f8a2d91`

## What it does

The orchestrator is a 13-state finite state machine that drives a transfer from creation through quote, PIX intake, Stellar settlement, payout routing, and reconciliation. States are enforced at the database level — you can't skip a state, and you can't edit past events.

## States

```
CREATED → QUOTED → PIX_CHARGE_ISSUED → PIX_FUNDED → CONVERTING
    → STELLAR_SETTLED → PAYOUT_ROUTING → PAYOUT_INSTRUCTED → RECONCILED

Failure branches: QUOTE_EXPIRED, PIX_EXPIRED, FAILED, REFUND_REQUIRED
```

## Key files

- `backend/src/orchestration/TransferOrchestrator.ts` — 625 lines, 13 lifecycle methods
- `backend/src/orchestration/stateMachine.ts` — 67 lines, legal transition table
- `backend/src/orchestration/types.ts` — domain types, Transfer, TransferEvent, TransferState
- `backend/src/orchestration/stellarWatcher.ts` — Horizon polling for settlement confirmation
- `backend/src/orchestration/orchestrationLogger.ts` — structured JSONL audit logs
- `backend/migrations/20260613_00_full_schema.sql` — `transition_transfer()` RPC with optimistic locking

## Tests

```
npm --prefix backend test -- --runInBand tests/orchestration/stateMachine.test.ts
→ 19 tests pass

npm --prefix backend test -- --runInBand tests/orchestration/orchestrator.test.ts
→ lifecycle transitions pass
```

The RPC uses `SELECT ... FOR UPDATE` + `state_version` check. Two concurrent transitions on the same transfer will conflict — one wins, one gets a 40001 error. Events are append-only: `transfer_events` has triggers that prevent updates and deletes.
