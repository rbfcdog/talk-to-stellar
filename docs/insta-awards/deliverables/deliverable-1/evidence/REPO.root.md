# Repository Capability Map — Deliverable 1

Status: final refresh after 2026-06-14 test run.

## Repo URL

`https://github.com/anomalyco/talk-to-stellar`

Branch: `main`

## Capability Map

| SOW capability | Code path | Lines | Test path | Test lines |
|---|---|---|---|---|
| State machine (explicit transition map, illegal transitions throw) | `backend/src/orchestration/stateMachine.ts` | 67 | `backend/tests/orchestration/stateMachine.test.ts` | 91 |
| Orchestrator lifecycle (CREATED→RECONCILED, idempotent replays, reconciliation) | `backend/src/orchestration/TransferOrchestrator.ts` | 625 | `backend/tests/orchestration/orchestrator.test.ts` | 258 |
| Orchestration types (Transfer, Event, Quote, Pix, Stellar, Payout, Reconciliation) | `backend/src/orchestration/types.ts` | 182 | (covered by orchestrator test) | — |
| Decimal arithmetic | `backend/src/orchestration/decimal.ts` | 88 | (covered by orchestrator test) | — |
| JSON orchestration logging | `backend/src/orchestration/orchestrationLogger.ts` | 72 | (covered by orchestrator test) | — |
| Stellar Horizon watcher | `backend/src/orchestration/stellarWatcher.ts` | 119 | (covered by integration) | — |
| International transfer service (legacy API → normalized mirror, payout coordination) | `backend/src/api/services/international-transfer.service.ts` | 913 | `backend/tests/international-transfer.routes.test.ts` | 722 |
| International transfer types | `backend/src/api/services/international-transfer.types.ts` | 533 | (covered by routes test) | — |
| International transfer lifecycle | `backend/src/api/services/international-transfer-lifecycle.ts` | 266 | (covered by routes test) | — |
| International transfer state service | `backend/src/api/services/international-transfer-state.service.ts` | 37 | (covered by routes test) | — |
| International transfer errors | `backend/src/api/services/international-transfer.errors.ts` | 42 | (covered by routes test) | — |
| Payout adapter layer (Mock, Etherfuse, Circle, Bridge, registry, webhook normalization) | `backend/src/api/services/usd-payout-adapters.ts` | 943 | `backend/tests/payout-adapter-contract.test.ts` | 264 |
| International transfers router (HTTP endpoints) | `backend/src/api/routes/international-transfers.router.ts` | 22 | (covered by routes test) | — |
| Evidence export — orchestration log | `backend/scripts/export-transfer-log.ts` + `backend/src/scripts/export-transfer-log.ts` | 1 + impl | (manual CLI) | — |
| Evidence export — transfer record | `backend/scripts/export-transfer-record.ts` + `backend/src/scripts/export-transfer-record.ts` | 1 + impl | (manual CLI) | — |
| **Totals** | | **3,911** | | **1,335** |

## Combined Verification

```bash
npm --prefix backend run build
npm --prefix backend test -- --runInBand \
  tests/orchestration/stateMachine.test.ts \
  tests/orchestration/orchestrator.test.ts \
  tests/payout-adapter-contract.test.ts \
  tests/international-transfer.routes.test.ts
```

Expected: **4 suites, 34 tests, all passing**.

Result (2026-06-14): **4 suites, 34 tests, all passing**.

## Key File List

| File | Purpose |
|------|---------|
| `backend/src/orchestration/stateMachine.ts:1` | Explicit transition map with `canTransition()`, `assertTransition()`, `nextAllowed()`, `isTerminal()`, `isFailure()` |
| `backend/src/orchestration/TransferOrchestrator.ts:1` | Lifecycle engine: `createTransfer`, `attachQuote`, `issuePixCharge`, `confirmPixFunding` (idempotent), `beginConversion`, `confirmStellarSettlement` (idempotent), `routePayout`, `instructPayout`, `markReconciled`, `syncFromInternationalTransfer` |
| `backend/src/orchestration/types.ts:1` | `Transfer`, `TransferEvent`, `QuoteSnapshot`, `PixEvidence`, `StellarEvidence`, `PayoutEvidence`, `ReconciliationMetadata` |
| `backend/src/api/services/international-transfer.service.ts:1` | Legacy transfer CRUD, payout lifecycle, evidence builders (`getReviewerEvidence`, `getWorkflow`, `getPayoutEvidence`, `getOrchestrationLog`) |
| `backend/src/api/services/usd-payout-adapters.ts:1` | `PayoutProviderAdapter` interface, `MockUsdPayoutAdapter`, `EtherfusePixOffRampAdapter`, `CircleCompatibilityAdapter`, `BridgeCompatibilityAdapter`, `getPayoutProviderAdapter` registry, capabilities, webhook normalization |
| `backend/src/api/routes/international-transfers.router.ts:1` | Express router mounting all transfer endpoints with auth middleware |
| `backend/migrations/20260613_00_full_schema.sql` | Complete DB bootstrap: `transfers`, `transfer_events`, `international_transfers`, atomic RPCs |
| `backend/src/api/repository/transfer.repository.ts` | Supabase repository with atomic RPCs for `transfers` and `transfer_events` |

## Ops Dashboard

| Path | Purpose |
|------|---------|
| `/ops/login` | DB-backed browser login via `public.ops_admin_users` |
| `/ops?source=transfers` | Normalized lifecycle record list |
| `/ops/transfers/:id` | Detail view: lifecycle rail, reconciliation, raw JSON |
| `/admin/transactions` | Frontend admin table for `transfers` + `transfer_events` |

## Relevant Docs

| Doc | Path |
|-----|------|
| Evidence runbook | `insta-awards/deliverable-1/EVIDENCE-RUNBOOK.md` |
| Dashboard instructions | `insta-awards/deliverable-1/evidence/DASHBOARD.md` |
| D1 status checklist | `docs/insta-awards/deliverables/deliverable-1/STATUS.md` |
| Migration details | `docs/insta-awards/deliverables/deliverable-1/MIGRATIONS.md` |
| Final D1 run report | `insta-awards/deliverable-1/runs/2026-06-14-final.md` |
