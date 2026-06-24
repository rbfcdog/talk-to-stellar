# Evidence - Diagramas de Arquitetura

## Status

Ready for reviewer submission. These Mermaid diagrams describe the complete transfer-routing demonstration from PIX intake through quote, Stellar settlement, payout instruction, evidence, and dashboard review.

## 1. End-to-End Reviewer Flow

```mermaid
sequenceDiagram
    autonumber
    actor Reviewer
    participant Web as Web Demo UI
    participant QuoteAPI as Quote API
    participant TransferAPI as Transfer API
    participant Pix as PIX Funding Service
    participant Stellar as Stellar Settlement Service
    participant Payout as USD Payout Adapter
    participant Evidence as Evidence and Reconciliation
    participant Ops as Ops Dashboard

    Reviewer->>Web: Open transfer routing demo
    Web->>QuoteAPI: Request BRL to USD quote
    QuoteAPI-->>Web: Quote, fees, expiry, route metadata
    Web->>TransferAPI: Create transfer from accepted quote
    TransferAPI-->>Web: transfer_id and initial lifecycle state
    Web->>Pix: Request PIX funding intent
    Pix-->>TransferAPI: PIX reference and funding status
    TransferAPI->>Stellar: Trigger USDC settlement after funding
    Stellar-->>TransferAPI: Stellar tx hash or labeled simulation result
    TransferAPI->>Payout: Create USD payout instruction
    Payout-->>TransferAPI: payout_instruction_id and provider status
    TransferAPI->>Evidence: Build workflow, payout, reconciliation, and record artifacts
    Reviewer->>Ops: Open same transfer in ops dashboard
    Ops-->>Reviewer: Lifecycle timeline, evidence links, and final record
```

## 2. Service Architecture

```mermaid
flowchart LR
    subgraph Frontend
        DemoUI["/institution-settlement"]
        AdminUI["/admin/transactions"]
        OpsUI["/ops"]
    end

    subgraph Backend_API
        QuoteRoutes["quotes.router"]
        TransferRoutes["international-transfers.router"]
        OpsRoutes["ops.router"]
    end

    subgraph Core_Services
        QuoteService["BrlUsdQuoteService"]
        TransferService["InternationalTransferService"]
        PixService["PixFundingService"]
        StellarSettlement["StellarSettlementService"]
        PayoutCoordination["UsdPayoutCoordinationService"]
        EvidenceService["SettlementEvidenceService"]
        Orchestrator["TransferOrchestrator"]
    end

    subgraph Providers
        Etherfuse["Etherfuse PIX"]
        Horizon["Stellar Horizon"]
        Circle["Circle Payout API"]
        MockProvider["Compatibility/mock provider"]
    end

    subgraph Database
        InternationalTransfers["international_transfers"]
        PayoutInstructions["international_payout_instructions"]
        PayoutEvents["international_payout_events"]
        Reconciliations["international_transfer_reconciliations"]
        Transfers["transfers"]
        TransferEvents["transfer_events"]
    end

    DemoUI --> QuoteRoutes --> QuoteService
    DemoUI --> TransferRoutes --> TransferService
    AdminUI --> TransferRoutes
    OpsUI --> OpsRoutes

    TransferService --> PixService --> Etherfuse
    TransferService --> StellarSettlement --> Horizon
    TransferService --> PayoutCoordination
    PayoutCoordination --> Circle
    PayoutCoordination --> MockProvider
    TransferService --> EvidenceService
    TransferService --> Orchestrator

    TransferService --> InternationalTransfers
    PayoutCoordination --> PayoutInstructions
    PayoutCoordination --> PayoutEvents
    EvidenceService --> Reconciliations
    Orchestrator --> Transfers
    Orchestrator --> TransferEvents
    OpsRoutes --> Transfers
    OpsRoutes --> TransferEvents
```

## 3. Lifecycle State Model

```mermaid
stateDiagram-v2
    [*] --> CREATED
    CREATED --> QUOTED: quote attached
    QUOTED --> PIX_CHARGE_ISSUED: funding intent created
    PIX_CHARGE_ISSUED --> PIX_FUNDED: provider confirms funding
    PIX_FUNDED --> CONVERTING: settlement route starts
    CONVERTING --> STELLAR_SETTLED: USDC settlement confirmed
    STELLAR_SETTLED --> PAYOUT_ROUTING: payout adapter selected
    PAYOUT_ROUTING --> PAYOUT_INSTRUCTED: payout instruction stored
    PAYOUT_INSTRUCTED --> RECONCILED: evidence matches route

    CREATED --> FAILED
    QUOTED --> QUOTE_EXPIRED
    PIX_CHARGE_ISSUED --> PIX_EXPIRED
    CONVERTING --> FAILED
    PAYOUT_ROUTING --> FAILED
    PAYOUT_INSTRUCTED --> REFUND_REQUIRED
```

## 4. Evidence Artifact Model

```mermaid
flowchart TD
    Run["One demo transfer run"] --> Quote["Quote response"]
    Run --> Workflow["workflow.json"]
    Run --> ReviewerEvidence["reviewer-evidence.json"]
    Run --> PayoutEvidence["payout-evidence.json"]
    Run --> OrchestrationLog["orchestration-log.json"]
    Run --> Reconciliation["reconciliation.json"]
    Run --> FinalRecord["final-transfer-record.json"]
    Run --> Screenshots["screenshots/*.png"]
    Run --> Video["video demo"]

    Quote --> FinalRecord
    Workflow --> FinalRecord
    ReviewerEvidence --> FinalRecord
    PayoutEvidence --> FinalRecord
    OrchestrationLog --> FinalRecord
    Reconciliation --> FinalRecord

    FinalRecord --> ReviewerPackage["REVIEWER-PACKAGE.md"]
    Screenshots --> ReviewerPackage
    Video --> ReviewerPackage
```

## 5. API Walkthrough

```mermaid
flowchart TB
    A["POST /api/quotes/brl-usd"] --> B["POST /api/transfers"]
    B --> C["POST /api/transfers/:id/pix-intent"]
    C --> D["Funding confirmation webhook or sandbox step"]
    D --> E["POST /api/transfers/:id/settle-stellar"]
    E --> F["POST /api/transfers/:id/payout-instruction"]
    F --> G["GET /api/transfers/:id/payout-evidence"]
    G --> H["GET /api/transfers/:id/reconciliation"]
    H --> I["GET /api/transfers/:id/workflow"]
    I --> J["Open /ops detail for same transfer"]
```

## Code References

| Layer | File |
|---|---|
| Quote route | `backend/src/api/routes/quotes.router.ts` |
| Transfer routes | `backend/src/api/routes/international-transfers.router.ts` |
| Transfer service | `backend/src/api/services/international-transfer.service.ts` |
| PIX funding | `backend/src/api/services/pix-funding.service.ts` |
| Stellar settlement | `backend/src/api/services/stellar-settlement.service.ts` |
| Payout adapter | `backend/src/api/services/usd-payout-adapters.ts` |
| Payout coordination | `backend/src/api/services/usd-payout-coordination.service.ts` |
| Evidence builder | `backend/src/api/services/settlement-evidence.service.ts` |
| Lifecycle orchestrator | `backend/src/orchestration/TransferOrchestrator.ts` |
| Ops dashboard | `backend/src/api/controllers/ops.controller.ts` |
