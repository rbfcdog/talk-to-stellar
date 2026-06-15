# Architecture Diagrams — Deliverable 3

> Source: `docs/project-brain/architecture/SYSTEM-MAP.md`, `docs/project-brain/architecture/MONEY-FLOWS.md`
> All diagrams use Mermaid syntax. Render at https://mermaid.live or in any Mermaid-compatible viewer.

---

## (a) System Component Architecture

```mermaid
graph TD
    subgraph Surfaces["Surfaces (User Entry)"]
        WA["WhatsApp Bot<br/>Evolution API v2"]
        TG["Telegram Bot<br/>Telegram Webhook"]
        WEB["Web Frontend<br/>React/Next.js"]
        OPS["/ops Dashboard<br/>Server-rendered HTML"]
    end

    subgraph API["API Layer (Express.js)"]
        AGENT["/api/agent<br/>LangChain/LangGraph<br/>OpenAI GPT-4o"]
        XFERS["/api/transfers<br/>Transfer CRUD"]
        OPS_HISTORY["/api/ops/history<br/>Unified Ledger"]
        QUOTES["/api/quotes<br/>BRL/USDC"]
        WH["/api/webhooks<br/>Etherfuse, Bridge"]
    end

    subgraph Orchestration["Orchestration Layer (D1 Core)"]
        ORCH["TransferOrchestrator<br/>13-state FSM"]
        WATCH["StellarSettlementWatcher<br/>Horizon poller"]
        STATE["TransferStateMachine<br/>Legal transitions"]
        LOG["orchestrationLogger<br/>Structured JSON logs"]
    end

    subgraph Services["Services Layer"]
        ANCHOR["AnchorService<br/>Etherfuse PIX sandbox"]
        STELLAR["StellarService<br/>Pathfinding, XDR, settlement"]
        QUOTE_SVC["QuoteService<br/>BRL/USDC DEX quotes"]
        FEE["FeeService<br/>30bps platform spread"]
        PAYOUT["PayoutService<br/>USD payout adapters"]
        RECEIPT["ReceiptService<br/>SVG receipt generation"]
    end

    subgraph Persistence["Persistence"]
        DB["(Supabase PostgreSQL)"]
        REPO["Repository Layer"]
        TRANSFER_REPO["transfer.repository.ts<br/>RPC + optimistic locking"]
        OPS_REPO["ops-history.repository.ts<br/>Unified read model"]
    end

    subgraph External["External Integrations"]
        ETHER["Etherfuse<br/>PIX sandbox API"]
        HORIZON["Stellar Horizon<br/>Testnet"]
        OPENAI["OpenAI GPT-4o"]
        CIRCLE["Circle Mint<br/>(sandbox/dev)"]
        BRIDGE["Bridge.xyz<br/>(compatibility layer)"]
    end

    WA --> AGENT
    TG --> AGENT
    WEB --> AGENT
    WEB --> XFERS
    WEB --> QUOTES
    OPS --> OPS_HISTORY

    AGENT --> XFERS
    AGENT --> QUOTES
    XFERS --> ORCH
    OPS_HISTORY --> OPS_REPO
    ORCH --> TRANSFER_REPO
    ORCH --> STATE
    ORCH --> LOG
    WATCH --> HORIZON
    WATCH --> ORCH

    ANCHOR --> ETHER
    STELLAR --> HORIZON
    QUOTE_SVC --> HORIZON
    PAYOUT --> CIRCLE
    PAYOUT --> BRIDGE
    PAYOUT --> ETHER

    TRANSFER_REPO --> DB
    OPS_REPO --> DB
```

### Module → File Map (Key Files for D3)

| Module | File Path | Lines |
|---|---|---|
| TransferOrchestrator | `backend/src/orchestration/TransferOrchestrator.ts` | 625 |
| State Machine | `backend/src/orchestration/stateMachine.ts` | 67 |
| Domain Types | `backend/src/orchestration/types.ts` | 182 |
| StellarSettlementWatcher | `backend/src/orchestration/stellarWatcher.ts` | 119 |
| Orchestration Logger | `backend/src/orchestration/orchestrationLogger.ts` | 72 |
| Decimal Utils | `backend/src/orchestration/decimal.ts` | ~60 |
| Transfer Repository | `backend/src/api/repository/transfer.repository.ts` | 369 |
| Ops History Repository | `backend/src/api/repository/ops-history.repository.ts` | 414 |
| Ops Controller | `backend/src/api/controllers/ops.controller.ts` | 779 |
| Ops Dashboard View | `backend/src/api/views/ops-dashboard.view.ts` | 1414 |
| Ops Router | `backend/src/api/routes/ops.router.ts` | 26 |
| Payout Adapters | `backend/src/api/services/usd-payout-adapters.ts` | ~500 |
| Payout Coordination | `backend/src/api/services/usd-payout-coordination.service.ts` | ~400 |
| Legacy Sync Bridge | `backend/src/api/services/international-transfer.service.ts:862-910` | 49 |
| DB Migration | `backend/migrations/20260613_00_full_schema.sql:2574-2700` | ~150 |

---

## (b) Transfer Lifecycle State Machine

### States (13 total)

```
CREATED → QUOTED → PIX_CHARGE_ISSUED → PIX_FUNDED → CONVERTING
    → STELLAR_SETTLED → PAYOUT_ROUTING → PAYOUT_INSTRUCTED → RECONCILED

Failure branches:
  CREATED → QUOTE_EXPIRED → FAILED
  QUOTED → QUOTE_EXPIRED → FAILED
  PIX_CHARGE_ISSUED → PIX_EXPIRED → FAILED
  Any active state → FAILED
  FAILED → REFUND_REQUIRED
  PAYOUT_INSTRUCTED → REFUND_REQUIRED
```

### Mermaid State Diagram

```mermaid
stateDiagram-v2
    [*] --> CREATED
    CREATED --> QUOTED: quote_attached
    CREATED --> QUOTE_EXPIRED: quote_expired
    CREATED --> FAILED: failed

    QUOTED --> PIX_CHARGE_ISSUED: pix_charge_issued
    QUOTED --> QUOTE_EXPIRED: quote_expired
    QUOTED --> FAILED: failed

    PIX_CHARGE_ISSUED --> PIX_FUNDED: pix_funding_confirmed
    PIX_CHARGE_ISSUED --> PIX_EXPIRED: pix_expired
    PIX_CHARGE_ISSUED --> FAILED: failed

    PIX_FUNDED --> CONVERTING: conversion_started
    PIX_FUNDED --> FAILED: failed

    CONVERTING --> STELLAR_SETTLED: stellar_settled
    CONVERTING --> FAILED: failed

    STELLAR_SETTLED --> PAYOUT_ROUTING: payout_routing_started
    STELLAR_SETTLED --> FAILED: failed

    PAYOUT_ROUTING --> PAYOUT_INSTRUCTED: payout_instructed
    PAYOUT_ROUTING --> FAILED: failed

    PAYOUT_INSTRUCTED --> RECONCILED: reconciled
    PAYOUT_INSTRUCTED --> REFUND_REQUIRED: refund_required
    PAYOUT_INSTRUCTED --> FAILED: failed

    QUOTE_EXPIRED --> FAILED
    PIX_EXPIRED --> FAILED
    FAILED --> REFUND_REQUIRED

    RECONCILED --> [*]
    REFUND_REQUIRED --> [*]

    note right of RECONCILED: Terminal (success)
    note right of REFUND_REQUIRED: Terminal (failure)
```

### Transition Enforcement

All transitions are enforced by `TransferStateMachine.canTransition()` in `backend/src/orchestration/stateMachine.ts:42`. Illegal transitions throw `IllegalTransitionError`. The state machine is the **single source of truth** — no code path can bypass it.

```typescript
// stateMachine.ts:8-22
const ALLOWED_TRANSITIONS: Record<TransferState, TransferState[]> = {
  CREATED:              ['QUOTED', 'QUOTE_EXPIRED', 'FAILED'],
  QUOTED:               ['PIX_CHARGE_ISSUED', 'QUOTE_EXPIRED', 'FAILED'],
  PIX_CHARGE_ISSUED:    ['PIX_FUNDED', 'PIX_EXPIRED', 'FAILED'],
  PIX_FUNDED:           ['CONVERTING', 'FAILED'],
  CONVERTING:           ['STELLAR_SETTLED', 'FAILED'],
  STELLAR_SETTLED:      ['PAYOUT_ROUTING', 'FAILED'],
  PAYOUT_ROUTING:       ['PAYOUT_INSTRUCTED', 'FAILED'],
  PAYOUT_INSTRUCTED:    ['RECONCILED', 'REFUND_REQUIRED', 'FAILED'],
  RECONCILED:           [],
  QUOTE_EXPIRED:        ['FAILED'],
  PIX_EXPIRED:          ['FAILED'],
  FAILED:               ['REFUND_REQUIRED'],
  REFUND_REQUIRED:      [],
};
```

### Database-Level Atomicity

State transitions are executed via the PostgreSQL RPC `transition_transfer()` (`backend/migrations/20260613_00_full_schema.sql:2632`):
- `SELECT ... FOR UPDATE` locks the row
- Checks `state_version` for optimistic locking (throws `40001` on conflict)
- Updates `state`, increments `state_version`, applies JSONB updates
- Inserts a `transfer_events` row atomically in the same transaction

---

## (c) Money Flow Sequence

```mermaid
sequenceDiagram
    actor User
    participant Agent as Agent/API
    participant Orchestrator as TransferOrchestrator
    participant PIX as Etherfuse (sandbox)
    participant Stellar as Stellar Horizon (testnet)
    participant Payout as Payout Adapter
    participant DB as PostgreSQL

    Note over User,DB: Phase 1: Intake & Quote

    User->>Agent: Create transfer intent (BRL amount, destination)
    Agent->>Orchestrator: createTransfer(intent)
    Orchestrator->>DB: create_transfer_with_event() RPC
    DB-->>Orchestrator: Transfer { state: CREATED, state_version: 1 }
    Orchestrator-->>Agent: Transfer with public_ref

    Agent->>Agent: Get BRL/USDC quote from DEX paths
    Agent->>Orchestrator: attachQuote(transferId, quote)
    Orchestrator->>DB: transition_transfer() → QUOTED
    DB-->>Orchestrator: Transfer { state: QUOTED, state_version: 2 }
    Orchestrator-->>Agent: Transfer with quote + expected USD

    Note over User,DB: Phase 2: PIX Funding

    Agent->>PIX: Create PIX charge (sandbox)
    PIX-->>Agent: PIX BrCode + charge_id
    Agent->>Orchestrator: issuePixCharge(transferId, {charge_id, provider})
    Orchestrator->>DB: transition_transfer() → PIX_CHARGE_ISSUED
    DB-->>Orchestrator: Transfer { state: PIX_CHARGE_ISSUED, state_version: 3 }

    User->>PIX: Pay PIX (simulated in sandbox)
    PIX->>Agent: Webhook: payment confirmed (e2e_id, txid, paid_at)
    Agent->>Orchestrator: confirmPixFunding(transferId, pixEvidence)
    Orchestrator->>DB: transition_transfer() → PIX_FUNDED
    DB-->>Orchestrator: Transfer { state: PIX_FUNDED, state_version: 4 }

    Note over User,DB: Phase 3: Stellar Settlement

    Agent->>Orchestrator: beginConversion(transferId)
    Orchestrator->>DB: transition_transfer() → CONVERTING
    DB-->>Orchestrator: Transfer { state: CONVERTING, state_version: 5 }

    Agent->>Stellar: Submit USDC payment (XDR)
    Stellar-->>Agent: Transaction hash

    loop Every 10s
        StellarSettlementWatcher->>Stellar: GET /transactions/:hash
        Stellar-->>StellarSettlementWatcher: { successful: true, ledger: N }
    end

    StellarSettlementWatcher->>Orchestrator: confirmStellarSettlement(id, stellarEvidence)
    Orchestrator->>Orchestrator: computeReconciliation()
    Orchestrator->>DB: transition_transfer() → STELLAR_SETTLED
    DB-->>Orchestrator: Transfer { state: STELLAR_SETTLED, state_version: 6 }

    Note over User,DB: Phase 4: Payout & Reconciliation

    Agent->>Orchestrator: routePayout(transferId, {provider_hint, same_name_check})
    Orchestrator->>DB: transition_transfer() → PAYOUT_ROUTING

    Agent->>Payout: Create payout instruction (adapter interface)
    Payout-->>Agent: reference_id

    Agent->>Orchestrator: instructPayout(transferId, referenceId)
    Orchestrator->>DB: transition_transfer() → PAYOUT_INSTRUCTED

    Agent->>Orchestrator: markReconciled(transferId)
    Orchestrator->>Orchestrator: computeReconciliation() validates amounts
    Orchestrator->>DB: transition_transfer() → RECONCILED
    DB-->>Orchestrator: Transfer { state: RECONCILED, state_version: 9 }
```

### Evidence Points

At each phase, evidence is attached to the transfer record as immutable JSONB:

| Phase | Evidence Field | Verifiable At |
|---|---|---|
| Quote | `transfer.quote` (rate, fee_breakdown, expires_at) | `/ops/transfers/:id` → Quote section |
| PIX | `transfer.pix` (charge_id, e2e_id, txid, paid_at, payer_masked) | `/ops/transfers/:id` → Evidence & links panel |
| Stellar | `transfer.stellar` (tx_hash, ledger, settled_at, source_account_masked, asset, path_used) | `/ops/transfers/:id` → Evidence & links panel + stellar.expert link |
| Payout | `transfer.payout` (routing_status, provider_hint, reference_id, same_name_check) | `/ops/transfers/:id` → Evidence & links panel |
| Reconciliation | `transfer.reconciliation` (amounts_match, fees_total, discrepancies, reconciled_by) | `/ops/transfers/:id` → Reconciliation panel |
