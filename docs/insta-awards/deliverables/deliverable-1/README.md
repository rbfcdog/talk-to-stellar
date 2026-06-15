# Deliverable 1 — PIX-to-Stellar Transfer Lifecycle Engine

This folder tracks the Instawards Deliverable 1 implementation and evidence package for the TalkToStellar PIX-to-Stellar transfer lifecycle engine.

## Current Status

Status: in progress, not final-submission ready.

The code implementation has been advanced and targeted tests pass, but the deliverable should not be marked complete until:

1. The consolidated migration is applied to the target Supabase database.
2. Schema inspection output is pasted into `MIGRATIONS.md`.
3. One real Stellar testnet transfer is executed end to end.
4. `/ops` list and detail screenshots are captured for that same transfer.
5. Log and transfer record evidence are exported for the same `public_ref`.

## Folder Index

| File or folder | Purpose |
|---|---|
| `PLAN.md` | Mandatory exploration findings, architecture map, implementation plan, and assumptions. |
| `STATUS.md` | Acceptance checklist and current blockers. |
| `DELIVERABLE-LOCATIONS.md` | Quick map for repository, dashboard, orchestration log, and transfer record evidence paths. |
| `MIGRATIONS.md` | Consolidated migration, application command, backup requirement, and schema inspection SQL. |
| `EVIDENCE-RUNBOOK.md` | Exact steps to produce the final four reviewer evidence artifacts. |
| `runs/` | Per-session run reports. Every working session must add a timestamped report. |
| `evidence/REPO.md` | Repository/capability map evidence. Refresh after final testnet run. |
| `evidence/DASHBOARD.md` | Dashboard access and screenshot instructions. |
| `evidence/orchestration-logs-*.json` | Exported orchestration logs. Existing files may be stale until final run. |
| `evidence/transfer-record-*.json` | Exported transfer record. Existing files may be stale until final run. |

## Implementation Map

| SOW requirement | Code path |
|---|---|
| Transfer lifecycle state machine | `backend/src/orchestration/stateMachine.ts` |
| State transitions and reconciliation | `backend/src/orchestration/TransferOrchestrator.ts` |
| Atomic persistence | `backend/src/api/repository/transfer.repository.ts`, `backend/migrations/20260613_00_full_schema.sql` |
| PIX intake bridge | `backend/src/api/services/international-transfer.service.ts`, `backend/src/api/controllers/etherfuse-webhook.controller.ts` |
| BRL-to-USDC quote/settlement bridge | `backend/src/api/services/brl-usd-quote.service.ts`, `backend/src/api/services/stellar-settlement.service.ts` |
| Stellar settlement watcher | `backend/src/orchestration/stellarWatcher.ts` |
| Payout routing hook/stub | `backend/src/api/services/usd-payout-coordination.service.ts`, `TransferOrchestrator.routePayout()` |
| Structured JSON logs | `backend/src/orchestration/orchestrationLogger.ts` |
| Operational dashboard | `backend/src/api/controllers/ops.controller.ts`, `backend/src/api/routes/ops.router.ts` |
| Frontend admin transaction screen | `frontend/app/admin/transactions/`, `frontend/app/api/transfers/`, `frontend/lib/backend-proxy.ts` |
| Export scripts | `backend/scripts/export-transfer-log.ts`, `backend/scripts/export-transfer-record.ts` |

## Verified Commands From Latest Implementation Run

```bash
npm --prefix backend run build
npm --prefix backend test -- --runInBand tests/orchestration/stateMachine.test.ts tests/orchestration/orchestrator.test.ts
npm --prefix backend test -- --runInBand tests/international-transfer.routes.test.ts
npm --prefix frontend run build
```

Latest documented result: see `runs/2026-06-13-1819.md`.

## Completion Rule

Do not declare Deliverable 1 complete from unit tests alone. The signed SOW reviewers will check four evidence items:

1. Repository link/code.
2. Dashboard screenshot.
3. Structured orchestration logs.
4. Complete Transfer Record with reconciliation metadata.

Items 2-4 must refer to the same completed transfer.
