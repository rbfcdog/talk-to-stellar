# Institutional Settlement Architecture Diagrams

These diagrams describe the current reviewer flow. They are documentation diagrams; the source of truth remains the code paths named under each diagram.

For the award upload label `Diagramas de Arquitetura`, submit:

```text
docs/insta-awards/deliverables/deliverable-3/evidence/diagramas-de-arquitetura.md
```

That evidence file contains the reviewer-ready Mermaid diagram set for the end-to-end transfer routing demonstration.

## Rendered PNGs

- [End-to-end flow](./diagrams/01-end-to-end-flow.png)
- [Service map](./diagrams/02-service-map.png)
- [State model](./diagrams/03-state-model.png)
- [Evidence model](./diagrams/04-evidence-model.png)
- [Reviewer screens](./diagrams/05-reviewer-screens.png)

## End-To-End Flow

```mermaid
sequenceDiagram
    actor User
    participant Web
    participant Backend
    participant Etherfuse
    participant Stellar
    participant Circle

    User->>Web: Start transfer
    Web->>Backend: Quote BRL to USD
    Backend-->>Web: Quote + fees
    Web->>Backend: Create transfer + PIX intent
    Backend->>Etherfuse: PIX funding intent
    Etherfuse-->>Backend: Funding confirmed
    Backend->>Stellar: Settle USDC
    Stellar-->>Backend: tx hash + evidence
    Web->>Backend: Payout instruction
    Backend->>Circle: USD payout
    Circle-->>Backend: Payout status
    Backend->>Backend: Reconcile + build evidence
    Backend-->>Web: Reviewer package
```

Code references:

- `frontend/app/institution-settlement/page.tsx`
- `frontend/app/international-transfer/use-settlement-console.ts`
- `backend/src/api/routes/quotes.router.ts`
- `backend/src/api/routes/international-transfers.router.ts`
- `backend/src/api/services/international-transfer.service.ts`
- `backend/src/api/services/settlement-evidence.service.ts`

## Service Map

```mermaid
flowchart LR
    UI[Institution Settlement UI] --> QAPI[POST /api/quotes/brl-usd]
    UI --> TAPI["/api/transfers routes"]
    QAPI --> Quote[BrlUsdQuoteService]
    TAPI --> ITS[InternationalTransferService]
    ITS --> Pix[PixFundingService]
    Pix --> Etherfuse[Etherfuse PIX sandbox/API]
    ITS --> Stellar[StellarSettlementService]
    Stellar --> StellarSvc[StellarService]
    StellarSvc --> Horizon[Stellar Horizon]
    ITS --> Adapter[USD Payout Adapter]
    Adapter --> Circle[Circle Mint payout API]
    Adapter --> EtherfuseProof[Etherfuse proof path]
    Adapter --> Mock[Ops mock path]
    ITS --> Evidence[SettlementEvidenceService]
    Evidence --> Reviewer[Reviewer evidence JSON]
    ITS --> Orchestrator[TransferOrchestrator]
    Orchestrator --> Ops["/ops dashboard"]
```

Code references:

- `backend/src/api/services/brl-usd-quote.service.ts`
- `backend/src/api/services/pix-funding.service.ts`
- `backend/src/api/services/stellar-settlement.service.ts`
- `backend/src/api/services/usd-payout-adapters.ts`
- `backend/src/orchestration/TransferOrchestrator.ts`
- `backend/src/api/controllers/ops.controller.ts`

## State Model

```mermaid
stateDiagram-v2
    [*] --> CREATED
    CREATED --> QUOTED
    QUOTED --> PIX_CHARGE_ISSUED
    PIX_CHARGE_ISSUED --> PIX_FUNDED
    PIX_FUNDED --> CONVERTING
    CONVERTING --> STELLAR_SETTLED
    STELLAR_SETTLED --> PAYOUT_ROUTING
    PAYOUT_ROUTING --> PAYOUT_INSTRUCTED
    PAYOUT_INSTRUCTED --> RECONCILED
    CREATED --> FAILED
    QUOTED --> QUOTE_EXPIRED
    PIX_CHARGE_ISSUED --> PIX_EXPIRED
    PAYOUT_INSTRUCTED --> REFUND_REQUIRED
```

Code references:

- `backend/src/orchestration/types.ts`
- `backend/src/orchestration/stateMachine.ts`
- `backend/src/orchestration/TransferOrchestrator.ts`

Legacy international transfer states are mirrored into the normalized lifecycle. The connector is implemented in `InternationalTransferService.syncOrchestration()` and `TransferOrchestrator.fromLegacyTransfer()`.

## Evidence Model

```mermaid
flowchart TD
    Transfer[international_transfers row] --> Reconciliation[international_transfer_reconciliations]
    Transfer --> PayoutInstruction[international_payout_instructions]
    PayoutInstruction --> PayoutEvents[international_payout_events]
    Transfer --> ReviewerEvidence[GET /api/transfers/:id/reviewer-evidence]
    Transfer --> PayoutEvidence[GET /api/transfers/:id/payout-evidence]
    Transfer --> Workflow[GET /api/transfers/:id/workflow]
    Transfer --> OpsTransfer[transfers normalized row]
    OpsTransfer --> OpsEvents[transfer_events]
    OpsEvents --> OpsDashboard["/ops detail page"]
```

Code references:

- `backend/src/api/repository/international-transfer.repository.ts`
- `backend/src/api/repository/transfer.repository.ts`
- `backend/src/api/services/settlement-evidence.service.ts`
- `backend/migrations/20260613_00_full_schema.sql`

## Reviewer Screens

```mermaid
flowchart LR
    Demo["/institution-settlement"] --> EvidenceCards[Week 1 and Week 2 evidence cards]
    Demo --> Lifecycle[Lifecycle timeline]
    Demo --> Payout[Payout coordination panel]
    Ops["/ops?source=transfers"] --> OpsList[Normalized transfer list]
    Ops --> OpsDetail[Timeline, reconciliation, raw record]
    Admin["/admin/transactions"] --> AdminList[Searchable transfer table]
    Admin --> AdminDetail[Detail drawer and JSON record]
```

Code references:

- `frontend/app/international-transfer/settlement-console-view.tsx`
- `frontend/app/international-transfer/use-settlement-console.ts`
- `frontend/app/admin/transactions/`
- `backend/src/api/controllers/ops.controller.ts`
