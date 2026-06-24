# D3 — Architecture Diagrams

Repo: https://github.com/rbfcdog/talk-to-stellar · branch `main` · commit `419673f`

Paste these into https://mermaid.live to render.

---

## System Components

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

    subgraph Orchestration["Orchestration Layer"]
        ORCH["TransferOrchestrator<br/>13-state FSM"]
        WATCH["StellarSettlementWatcher<br/>Horizon poller"]
        STATE["TransferStateMachine<br/>Legal transitions"]
        LOG["orchestrationLogger<br/>Structured JSON logs"]
    end

    subgraph Services["Services Layer"]
        ANCHOR["AnchorService<br/>Etherfuse PIX sandbox"]
        STELLAR["StellarService<br/>Pathfinding, XDR"]
        QUOTE_SVC["QuoteService<br/>BRL/USDC DEX"]
        FEE["FeeService<br/>30bps platform"]
        PAYOUT["PayoutService<br/>USD payout adapters"]
        RECEIPT["ReceiptService<br/>SVG receipts"]
    end

    subgraph Persistence["Persistence"]
        DB["(Supabase PostgreSQL)"]
        TRANSFER_REPO["transfer.repository.ts<br/>RPC + optimistic lock"]
        OPS_REPO["ops-history.repository.ts<br/>Unified read model"]
    end

    subgraph External["External"]
        ETHER["Etherfuse<br/>PIX sandbox"]
        HORIZON["Stellar Horizon<br/>Testnet"]
        OPENAI["OpenAI GPT-4o"]
        CIRCLE["Circle Mint<br/>(sandbox)"]
        BRIDGE["Bridge.xyz<br/>(compat)"]
    end

    WA --> AGENT
    TG --> AGENT
    WEB --> AGENT
    WEB --> XFERS
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

Users enter via WhatsApp, Telegram, web, or the `/ops` dashboard. The agent interprets intent, routes to the orchestrator. The orchestrator drives the state machine, coordinating PIX intake (Etherfuse), Stellar settlement (Horizon), and USD payout (Circle/Bridge). Everything is persisted through PostgreSQL RPCs with optimistic locking.

---

## Transfer State Machine

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
```

13 states. The happy path goes CREATED through RECONCILED in 9 transitions. Failure branches cover expired quotes, expired PIX charges, generic failures, and refunds. Transitions are enforced by `TransferStateMachine.canTransition()` — illegal transitions throw before any side effect.

---

## Money Flow

```mermaid
sequenceDiagram
    actor User
    participant Agent as Agent/API
    participant Orchestrator as TransferOrchestrator
    participant PIX as Etherfuse (sandbox)
    participant Stellar as Stellar Horizon (testnet)
    participant Payout as Circle/Bridge
    participant DB as PostgreSQL

    Note over User,DB: Phase 1 — Intake & Quote

    User->>Agent: Create transfer (BRL amount, destination)
    Agent->>Orchestrator: createTransfer(intent)
    Orchestrator->>DB: create_transfer_with_event() RPC
    DB-->>Orchestrator: Transfer { state: CREATED }

    Agent->>Agent: Get BRL/USDC quote
    Agent->>Orchestrator: attachQuote(transferId, quote)
    Orchestrator->>DB: transition_transfer() → QUOTED

    Note over User,DB: Phase 2 — PIX Funding

    Agent->>PIX: Create PIX charge (sandbox)
    PIX-->>Agent: BrCode + charge_id
    Agent->>Orchestrator: issuePixCharge(transferId, chargeId)
    Orchestrator->>DB: transition_transfer() → PIX_CHARGE_ISSUED

    User->>PIX: Pay PIX (simulated)
    PIX->>Agent: Webhook (e2e_id, paid_at)
    Agent->>Orchestrator: confirmPixFunding(transferId, evidence)
    Orchestrator->>DB: transition_transfer() → PIX_FUNDED

    Note over User,DB: Phase 3 — Stellar Settlement

    Agent->>Orchestrator: beginConversion(transferId)
    Orchestrator->>DB: transition_transfer() → CONVERTING

    Agent->>Stellar: Submit USDC payment
    Stellar-->>Agent: Transaction hash

    loop Every 10s
        StellarSettlementWatcher->>Stellar: GET /transactions/:hash
        Stellar-->>StellarSettlementWatcher: successful, ledger N
    end

    StellarSettlementWatcher->>Orchestrator: confirmStellarSettlement(id, evidence)
    Orchestrator->>DB: transition_transfer() → STELLAR_SETTLED

    Note over User,DB: Phase 4 — Payout & Reconciliation

    Agent->>Orchestrator: routePayout(transferId)
    Orchestrator->>DB: transition_transfer() → PAYOUT_ROUTING

    Agent->>Payout: Circle Mint sandbox payout (wire)
    Payout-->>Agent: payout ID, status: pending → complete

    Agent->>Orchestrator: instructPayout(transferId)
    Orchestrator->>DB: transition_transfer() → PAYOUT_INSTRUCTED

    Agent->>Orchestrator: markReconciled(transferId)
    Orchestrator->>Orchestrator: computeReconciliation() validates amounts
    Orchestrator->>DB: transition_transfer() → RECONCILED
```

BRL enters via PIX, gets converted to USDC on Stellar, settled with a verifiable tx hash, then paid out as USD via Circle wire. Every transition is atomic (PostgreSQL RPC), every event is append-only (triggers prevent edits), and reconciliation compares BRL in vs USDC settled vs USD out using decimal-safe arithmetic.
