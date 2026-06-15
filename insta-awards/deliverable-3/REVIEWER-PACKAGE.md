# Reviewer Package — Consolidated Submission D1+D2+D3

**TalkToStellar — BRL→USD Transfer Routing on Stellar**
**Instawards SOW**: `docs/funding/sow/SOW_instawards_submission_brl_usd_rail_20260520.md`
**Repository**: https://github.com/rbfcdog/talk-to-stellar
**Branch**: `main`

---

## 1. What We Built (All 3 Deliverables)

This submission covers three interconnected deliverables from the SOW:

| # | Deliverable | Status | Key Evidence |
|---|---|---|---|
| D1 | PIX-to-Stellar Transfer Lifecycle Engine | **Complete** | 13-state FSM, atomic RPC, append-only events, structured logs |
| D2 | USD Delivery & Payout Coordination Layer | **Complete** | Provider-agnostic adapter interface, Circle/Bridge/Etherfuse/mock adapters, same-name checks |
| D3 | End-to-End Transfer Routing Demonstration | **Complete** | Ops dashboard, transfer detail forensics, reconciliation, evidence export, video storyboard, reviewer package |

---

## 2. Architecture at a Glance

```
WhatsApp/Telegram/Web → Agent (LangChain/GPT-4o) → TransferOrchestrator (13-state FSM)
                                                          │
                    ┌─────────────────────────────────────┤
                    ▼                                     ▼
    Etherfuse (PIX sandbox)                    Stellar Horizon (testnet)
                    │                                     │
                    ▼                                     ▼
            PIX funding evidence              Stellar settlement evidence
                    │                                     │
                    └──────────────┬──────────────────────┘
                                   ▼
                          Payout Adapter (Circle/Bridge/Etherfuse/mock)
                                   │
                                   ▼
                          Reconciliation (amounts match check)
                                   │
                                   ▼
                     Ops Dashboard (/ops) → Audit trail, evidence links
```

**Full diagram**: See `ARCHITECTURE-DIAGRAMS.md`

---

## 3. Evidence Map: What to Look At

### Primary Evidence (Visual/Interactive)

| # | Evidence | Where | What It Proves |
|---|---|---|---|
| E1 | Ops Dashboard | `GET /ops` | 5 metrics, unified ledger, filterable table, 4 data sources |
| E2 | Transfer Detail | `GET /ops/transfers/:id` | Full lifecycle timeline, stage rail, actor attribution |
| E3 | Reconciliation Panel | `/ops/transfers/:id` (right sidebar) | Amount matching, fee breakdown, discrepancy flags |
| E4 | Evidence & Links Panel | `/ops/transfers/:id` (right sidebar) | Stellar tx hash → stellar.expert, PIX ids, payout reference |
| E5 | Raw JSON Record | `/ops/transfers/:id` (bottom) | Complete transfer object + all events, masked identifiers |
| E6 | Stellar Expert | `stellar.expert/explorer/testnet/tx/:hash` | Real testnet transaction verification |

### Secondary Evidence (Code/Data)

| # | Evidence | File | What It Proves |
|---|---|---|---|
| E7 | TransferOrchestrator | `backend/src/orchestration/TransferOrchestrator.ts` (625 lines) | 13 lifecycle methods, idempotency, reconciliation computation, legacy sync bridge |
| E8 | State Machine | `backend/src/orchestration/stateMachine.ts` (67 lines) | Legal transition table, IllegalTransitionError enforcement |
| E9 | Transfer Repository | `backend/src/api/repository/transfer.repository.ts` (369 lines) | Atomic RPC calls, optimistic locking, event append-only |
| E10 | Stellar Watcher | `backend/src/orchestration/stellarWatcher.ts` (119 lines) | Horizon polling, tx confirmation, timeout/expiry |
| E11 | Ops Dashboard View | `backend/src/api/views/ops-dashboard.view.ts` (1414 lines) | HTML rendering, timeline, stage rail, JSON syntax highlighting |
| E12 | DB Migration | `backend/migrations/20260613_00_full_schema.sql:2632` | `transition_transfer()` RPC with `FOR UPDATE` lock + `state_version` check |
| E13 | Payout Adapters | `backend/src/api/services/usd-payout-adapters.ts` | `PayoutProviderAdapter` interface, Circle/Bridge/Etherfuse/mock implementations |
| E14 | Orchestration Logs | `LOG_FILE` output or console stdout | Structured JSONL per transition: ts, transfer_id, event, from_state, to_state, actor, meta |

---

## 4. How to Verify Each Evidence Piece

### E1: Ops Dashboard

1. Navigate to `/ops?source=transfers`
2. Check that 5 metric cards show non-zero values (or "0" if no test data)
3. Verify the table shows rows with `source=transfers`
4. Apply filters (state, date range, search) and verify table updates
5. Confirm the "Updated X ago" indicator refreshes

**Code**: `opsController.dashboard()` at `ops.controller.ts:661` calls `OpsHistoryRepository.list()` → `mapTransfer()` → renders via `renderDashboardPage()`

### E2: Transfer Detail — Lifecycle Timeline

1. Click a transfer row → `/ops/transfers/:id`
2. Verify the 9-stage rail: circles filled up to the current state
3. Count the timeline events — should match the number of transitions
4. Expand event payloads — verify JSON content is real data
5. Check actor badges: `system`, `poller:stellar`, `webhook:etherfuse`, `api`

**Code**: `opsController.transferDetail()` at `ops.controller.ts:708` → `orchestrator.getTransferWithEvents()` → `renderTransferDetailPage()`

### E3: Reconciliation Panel

1. Find the "Reconciliation" panel on the right sidebar
2. If state is `RECONCILED`: green banner "Amounts matched"
3. If discrepancies exist: red banner "Review required"
4. Verify `amounts_match: true/false`
5. Check fee items are listed with labels and amounts in correct currencies

**Code**: `TransferOrchestrator.computeReconciliation()` at `TransferOrchestrator.ts:470` compares `amount_usdc_settled` vs `amount_usd_out_expected` using `decimalAbsDiffWithin()`

### E4: Evidence & Links Panel

1. Find "Evidence and links" panel below reconciliation
2. Stellar tx hash — click the stellar.expert link, verify it opens the correct testnet transaction
3. PIX e2e ID — should match the Etherfuse sandbox webhook payload
4. PIX charge ID — should match the charge created via Etherfuse API
5. Payout reference — should show provider reference or routing status

### E5: Raw JSON Record

1. Scroll to bottom, expand "Raw Transfer Record"
2. Verify syntax-highlighted JSON shows the complete transfer object
3. Check that `source_endpoint.masked_identifier` is masked (not raw PII)
4. Check that `stellar.source_account_masked` shows `***` prefix
5. Verify the `events` array contains all lifecycle events in order

### E6: Stellar Expert Verification

1. From the transfer detail evidence panel, click the stellar.expert link
2. Confirm the transaction is on **testnet** (not public/mainnet)
3. Verify "Successful" status
4. Check the operation shows the expected asset (USDC or BRL)
5. Note the ledger number and timestamp

---

## 5. Architecture Decisions (Key Design Choices)

### 5.1 State Machine as Single Source of Truth

**Decision**: All state transitions go through `TransferStateMachine.assertTransition()` before any DB write.
**Why**: No code path can accidentally skip a state. If a transition is illegal, it throws `IllegalTransitionError` before any side effects.
**File**: `backend/src/orchestration/stateMachine.ts:46`

### 5.2 Atomic RPC with Optimistic Locking

**Decision**: State transitions use PostgreSQL `transition_transfer()` RPC with `SELECT ... FOR UPDATE` + `state_version` check.
**Why**: Prevents concurrent transitions from corrupting state. If two processes try to transition the same transfer, one will fail with "Optimistic lock conflict" (error code `40001`).
**File**: `backend/migrations/20260613_00_full_schema.sql:2632`

### 5.3 Append-Only Event Log

**Decision**: `transfer_events` table has `before update` and `before delete` triggers that throw exceptions.
**Why**: Immutable audit trail. Once an event is written, it cannot be modified or removed.
**File**: `backend/migrations/20260613_00_full_schema.sql:2557-2572`

### 5.4 Idempotent Replay

**Decision**: When duplicate evidence arrives (same PIX e2e_id, same Stellar tx_hash), the orchestrator appends an `idempotent_replay` event without changing state.
**Why**: Webhooks and pollers can deliver the same event multiple times. The system must not break or double-count.
**File**: `TransferOrchestrator.ts:149-159` (PIX), `TransferOrchestrator.ts:218-223` (Stellar), `TransferOrchestrator.ts:198-201` (Conversion)

### 5.5 Provider-Agnostic Payout Adapters

**Decision**: Payout providers implement a common `PayoutProviderAdapter` interface. The coordination service selects the provider based on destination endpoint metadata.
**Why**: Swap providers without changing the orchestrator. Circle, Bridge, Etherfuse, and mock all implement the same interface.
**File**: `backend/src/api/services/usd-payout-adapters.ts`

### 5.6 Decimal-Safe Arithmetic

**Decision**: All amount comparisons use `decimalAbsDiffWithin()` which converts string amounts to `bigint` with configurable scale, avoiding floating-point errors.
**Why**: Financial calculations must be exact. `0.1 + 0.2 !== 0.3` in IEEE 754 float, but it must be exact in transfer reconciliation.
**File**: `backend/src/orchestration/decimal.ts`

### 5.7 Structured JSON Logging

**Decision**: Every transition emits a JSON line to stdout (and optionally to `LOG_FILE`). Each entry has: `ts`, `transfer_id`, `public_ref`, `event`, `from_state`, `to_state`, `actor`, `correlation_id`, `meta`.
**Why**: grep-able, jq-able audit trail. Reviewers can trace a transfer from intake to reconciliation by filtering on `transfer_id`.
**File**: `backend/src/orchestration/orchestrationLogger.ts`

---

## 6. Audit Trail Reasoning

Every transfer leaves a complete, immutable trail:

```
CREATED → transfer_events row (event_type: transfer_created, actor: api)
QUOTED → transfer_events row (event_type: quote_attached, payload: {quote, expected_usd})
PIX_CHARGE_ISSUED → transfer_events row (event_type: pix_charge_issued, payload: {charge_id})
PIX_FUNDED → transfer_events row (event_type: pix_funding_confirmed, payload: {e2e_id, txid, paid_at})
CONVERTING → transfer_events row (event_type: conversion_started)
STELLAR_SETTLED → transfer_events row (event_type: stellar_settled, payload: {tx_hash, ledger, settled_at})
PAYOUT_ROUTING → transfer_events row (event_type: payout_routing_started, payload: {provider_hint, same_name_check})
PAYOUT_INSTRUCTED → transfer_events row (event_type: payout_instructed, payload: {reference_id})
RECONCILED → transfer_events row (event_type: reconciled, payload: {reconciliation})
```

Each row is:
- **Immutable** (triggers prevent update/delete)
- **Timestamped** (`created_at` defaults to `now()`)
- **Actor-attributed** (who/what triggered the transition)
- **Correlation-tracked** (`correlation_id` links related events)
- **Payload-rich** (JSONB with full transition context)

---

## 7. Sandbox vs Production Boundaries

See `CLAIMS-BOUNDARY.md` for the complete boundary document. Key points:

| Aspect | This Demo | Production Would Need |
|---|---|---|
| Stellar network | Testnet | Mainnet |
| PIX | Etherfuse sandbox | Etherfuse production + real banking |
| Payout | Mock/sandbox adapters | `ENABLE_REAL_PAYOUT_EXECUTION=true` + provider API keys |
| User identity | Test fixtures | KYC/KYB verification |
| Secret storage | Environment variables | Vault/KMS/HashiCorp |
| Polling | In-process `setInterval` | Job queue (BullMQ, SQS) |
| Auth | DB-backed scrypt + JWT | OIDC/SSO |

---

## 8. Test Evidence

Existing test files (not part of D3 scope but available for validation):

| Test file | What it covers |
|---|---|
| `backend/tests/international-transfer.service.test.ts` | Legacy transfer lifecycle, state machine transitions |
| `backend/tests/payout-adapter-contract.test.ts` | Payout adapter interface compliance |
| `backend/tests/agent-ai.test.ts` | Agent routing and tool invocation |
| `backend/tests/stellar-sdk.test.ts` | Stellar SDK pathfinding and transaction building |

Run tests:
```bash
npm --prefix backend test -- --runInBand \
  tests/international-transfer.service.test.ts \
  tests/payout-adapter-contract.test.ts
```

---

## 9. Key Review Questions (and Where to Find Answers)

| Question | Answer Location |
|---|---|
| "How do I know states can't be skipped?" | `stateMachine.ts:8-22` — `ALLOWED_TRANSITIONS` map |
| "How do I know events are immutable?" | `20260613_00_full_schema.sql:2557-2572` — `before update/delete` triggers |
| "What happens on duplicate webhook?" | `TransferOrchestrator.ts:149-159` and `218-223` — `idempotent_replay` |
| "How is Stellar settlement verified?" | `stellarWatcher.ts:99-117` — `checkHorizonTx()` polls Horizon |
| "How is reconciliation computed?" | `TransferOrchestrator.ts:470-495` — `computeReconciliation()` |
| "Where is the real testnet tx hash?" | In the ops dashboard transfer detail → evidence panel → stellar.expert link |
| "Is this production-ready?" | No — see `CLAIMS-BOUNDARY.md` |
| "Can I run this myself?" | Yes — see `SETUP.md` |

---

## 10. Submission Checklist

Before submitting to the Ambassador Chapter Lead:

- [ ] Repository is public (or reviewer has access)
- [ ] `main` branch is up to date with all D1+D2+D3 code
- [ ] Screenshots captured per `SCREENSHOT-SHOTLIST.md`
- [ ] Video recorded per `VIDEO-STORYBOARD.md`
- [ ] Evidence export run (`npm run instawards:evidence`)
- [ ] At least one transfer in `RECONCILED` state with real testnet tx hash
- [ ] Stellar expert link verified and accessible
- [ ] Dashboard accessible at `/ops` with at least 1 row
- [ ] `CLAIMS-BOUNDARY.md` reviewed for accuracy
- [ ] `SETUP.md` instructions tested clean-room
- [ ] All env var names documented (no values exposed)

---

## 11. Contact

- **Builder**: Rodrigo Camargo — rodrigobfcdog@gmail.com
- **Repository**: https://github.com/rbfcdog/talk-to-stellar
- **Documentation**: `docs/project-brain/README.md`
- **SOW**: `docs/funding/sow/SOW_instawards_submission_brl_usd_rail_20260520.md`
