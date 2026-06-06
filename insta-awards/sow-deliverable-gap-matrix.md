# SOW Deliverable Gap Matrix

## Status Legend

| Status | Meaning |
| --- | --- |
| Implemented | Code exists and is wired into the app. |
| Partial | Foundation exists, but the SOW needs hardening, validation, or evidence. |
| Not implemented | No production-quality implementation found. |
| Out of scope | The SOW explicitly excludes this from the sprint. |

## Deliverable 1: PIX-to-Stellar Transfer Lifecycle Engine

| SOW requirement | Current implementation | Status | Remaining gap |
| --- | --- | --- | --- |
| Create BRL-to-USD transfer intents | `InternationalTransferService.createTransferFromQuote` creates transfer records from active quotes. | Implemented | Add more HTTP-level tests and clearer reviewer examples. |
| Generate BRL-to-USD quotes | `BrlUsdQuoteService` creates quotes through `/api/quotes/brl-usd`. | Implemented | Add quote provenance to reviewer output so fallback/testnet quotes are obvious. |
| Record Pix funding events | `PixFundingService` creates Pix funding intents and stores Pix order/payment IDs on transfers. | Implemented | Add more failure/retry paths for rejected or expired Pix funding events. |
| Coordinate BRL-to-USDC conversion flow | Transfer states include `BRL_TO_USDC_PENDING`; settlement service models the USDC leg. | Partial | Need clearer ledger/evidence fields proving whether the BRL->USDC leg was real Etherfuse, Stellar path, or sandbox representation. |
| Track Stellar USDC settlement | `StellarSettlementService` attaches hash, memo, source, destination, asset, amount, and network. | Implemented | Demo must run with real testnet settlement credentials to produce hashes for reviewers. |
| Manage lifecycle states | `InternationalTransferStateService` enforces transitions. | Implemented | Add more tests for failure, refund, and illegal transitions. |
| Persist reconciliation metadata | `international_transfer_reconciliations` table and `SettlementEvidenceService` exist. | Implemented | Add exportable reconciliation JSON examples to final evidence package. |
| Integrate existing conversational infrastructure | Existing WhatsApp/Telegram agent can link into app flows; institution flow is available as web UI. | Partial | Add explicit chat command/link for institution settlement demo if needed for reviewer flow. |

## Deliverable 2: USD Delivery and Payout Coordination Layer

| SOW requirement | Current implementation | Status | Remaining gap |
| --- | --- | --- | --- |
| Provider-agnostic payout adapter interface | `PayoutProviderAdapter` exists and `payout-adapter-contract.md` documents the contract. | Implemented | Keep provider-specific snapshots current as adapters evolve. |
| Payout destination metadata | Transfer types and payloads store account holder, bank, routing, account, type, country, provider label. | Implemented | Add stricter validation and masking rules for reviewer logs. |
| Same-name account alignment checks | `IdentityAlignmentService` sets `MATCHED`, `MISMATCHED`, or `UNKNOWN` with risk notes. | Implemented | Add reviewer-facing explanation and hard blocking mode for required same-name routes. |
| Payout reference IDs | Adapters return provider instruction/reference IDs and store them on transfer records. | Implemented | Add examples for each adapter in evidence docs. |
| Payout status tracking | Adapter interface exposes status; `POST /api/transfers/:id/payout-status-refresh` updates transfer and reconciliation status. | Partial | Add scheduled polling or provider webhook ingestion after a sandbox provider is selected. |
| Settlement evidence attachment | `StellarTransactionRepository` and transfer service attach Stellar settlement evidence. | Implemented | Run a configured testnet proof and capture transaction hash. |
| Mock or sandbox provider responses | Mock adapter and Etherfuse sandbox/proof adapter exist. | Implemented | Clearly label mock/sandbox in UI and evidence package. |
| Circle compatibility | `CircleCompatibilityAdapter` builds provider-shaped payload and optionally POSTs when enabled. | Partial | Needs real sandbox credentials or documented dry-run output for evidence. |
| Bridge compatibility | `BridgeCompatibilityAdapter` builds provider-shaped payload and optionally POSTs when enabled. | Partial | Needs real sandbox credentials or documented dry-run output for evidence. |
| Wise-compatible payout systems | Destination metadata can represent Wise-compatible USD account details, and adapters force `wise_metadata_only` for Wise-labeled destinations. | Partial | No Wise API integration or payout execution. This remains metadata/mock compatibility only for now. |

## Deliverable 3: End-to-End Transfer Routing Demonstration

| SOW requirement | Current implementation | Status | Remaining gap |
| --- | --- | --- | --- |
| Reviewer-ready UI | `/institution-settlement` and `/international-transfer` provide a full API tester and log UI. | Implemented | Polish final copy, screenshots, and walkthrough for reviewers. |
| Complete flow from Pix intake to payout instruction | UI calls quote, transfer, Pix intent, funding confirmation, Stellar settlement, payout instruction, reconciliation. | Implemented | Run and record a clean end-to-end demo in a stable environment. |
| Settlement evidence attachment | Settlement evidence is persisted and visible through reconciliation. | Implemented | Provide transaction hash evidence when real settlement credentials are enabled. |
| Lifecycle tracking | UI and backend show lifecycle states. | Implemented | Add exported lifecycle log sample. |
| Orchestration logging | UI records request/response logs with redaction. | Implemented | Persist logs server-side or export JSON for final review package. |
| Architecture diagrams | Some diagrams/docs exist in `docs`; this folder now adds SOW-specific maps. | Partial | Add final diagram image or Mermaid diagram to demo package. |
| API walkthroughs | Existing docs include curl examples for quote, transfer, Pix intent, settlement, payout, reconciliation. | Implemented | Validate examples against deployed backend before submission. |
| Screenshots | UI exists but screenshots are not generated by this audit. | Partial | Capture screenshots after running the final demo environment. |
| Demo video | Not present in repo. | Not implemented | Record final 5-10 minute reviewer video. |

## Out-of-Scope Alignment

| SOW out-of-scope item | Current repo behavior | Assessment |
| --- | --- | --- |
| Production remittance operations | No public production remittance launch is implemented. | Aligned. |
| Regulated financial operations and licensing | No licensing/compliance operations are implemented. | Aligned. |
| Consumer wallet expansion | Consumer UX exists from previous work, but this sprint's institutional layer is separate. | Mostly aligned. Avoid adding new retail UX scope to this SOW. |
| Full production off-ramp integration | No production Wise/ACH/wire payout is implemented. | Aligned. |
| Multi-currency/multi-corridor expansion | The institutional SOW focuses on BRL -> USDC -> USD. Broader asset conversion exists elsewhere but is not the SOW rail. | Aligned. |

## Highest Priority Gaps

1. Produce clean testnet settlement evidence with a real Stellar hash.
2. Validate at least one provider adapter path with sandbox credentials or a
   documented dry-run payload if access is unavailable.
3. Add payout status refresh behavior beyond initial instruction creation.
4. Package screenshots, API responses, reconciliation records, and logs.
5. Strengthen failure/refund path tests.
6. Keep every reviewer-facing message explicit that this is testnet/sandbox and
   not a production remittance operation.
