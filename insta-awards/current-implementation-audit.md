# Current Implementation Audit

## Executive Summary

TalkToStellar already has a substantial implementation for the Instawards SOW
corridor:

```text
Pix funding -> BRL/USD quote -> USDC settlement on Stellar -> payout instruction -> reconciliation
```

The current codebase is best described as a demo-ready or near-demo-ready
institutional settlement orchestration prototype, not a production remittance
platform.

Implemented today:

- A backend transfer lifecycle engine with state transitions.
- BRL-to-USD quote generation backed by Stellar/path quote logic when available.
- Etherfuse Pix funding intent creation and sandbox confirmation paths.
- Stellar settlement evidence creation, with real transaction support when
  signing credentials and destinations are configured.
- Payout-provider adapter interfaces for mock, Etherfuse proof, Circle-shaped,
  and Bridge-shaped flows.
- Reconciliation records that attach quote, Pix, Stellar, payout, fee, and
  evidence metadata.
- A frontend reviewer interface for running the complete route and inspecting
  logs.
- Tests for quote creation, same-name checks, lifecycle state progression,
  settlement evidence, payout instruction, and reconciliation.

Partially implemented:

- Real payout-provider execution. Circle and Bridge adapters can build provider
  shaped payloads, but real execution requires API keys, configured provider
  URLs, and `ENABLE_REAL_PAYOUT_EXECUTION=true`.
- Live USD delivery. The system creates payout instructions and sandbox/proof
  objects, but it does not perform production ACH, wire, Wise, or regulated USD
  bank payout.
- Mainnet validation. Low-value mainnet settlement is guarded and disabled by
  default.
- Operational dashboarding. The demo UI exposes logs and reconciliation, but
  the final reviewer package still needs screenshots, video, exported logs, and
  runbook evidence.

Not implemented:

- Production remittance operations.
- Production money transmission licensing, regulated FX operations, tax
  reporting, AML program operations, or production compliance monitoring.
- Production Wise, ACH, wire, or banking partner payout.
- Multi-corridor expansion beyond the Brazil Pix -> Stellar USDC -> USD payout
  routing concept.

## Codebase Areas Reviewed

| Area | Main files |
| --- | --- |
| Express app route mounting | `backend/src/app.ts` |
| International transfer types | `backend/src/api/services/international-transfer.types.ts` |
| International transfer orchestration | `backend/src/api/services/international-transfer.service.ts` |
| Transfer state machine | `backend/src/api/services/international-transfer-state.service.ts` |
| Transfer repository | `backend/src/api/repository/international-transfer.repository.ts` |
| Transfer migration | `backend/migrations/20260520_00_international_usd_transfers.sql` |
| Transfer API controller | `backend/src/api/controllers/international-transfers.controller.ts` |
| Transfer API routes | `backend/src/api/routes/international-transfers.router.ts` |
| BRL/USD quote service | `backend/src/api/services/brl-usd-quote.service.ts` |
| Quote controller and routes | `backend/src/api/controllers/quotes.controller.ts`, `backend/src/api/routes/quotes.router.ts` |
| Pix funding wrapper | `backend/src/api/services/pix-funding.service.ts` |
| Etherfuse ramp foundation | `backend/src/api/services/anchor.service.ts`, `backend/src/api/routes/ramp.router.ts` |
| Stellar settlement | `backend/src/api/services/stellar-settlement.service.ts` |
| Stellar pathfinding and payments | `backend/src/api/services/stellar.service.ts` |
| Settlement evidence | `backend/src/api/services/settlement-evidence.service.ts` |
| Payout adapters | `backend/src/api/services/usd-payout-adapters.ts` |
| Reviewer UI | `frontend/app/international-transfer/international-transfer-client.tsx`, `frontend/app/institution-settlement/page.tsx` |
| Core tests | `backend/tests/international-transfer.service.test.ts`, `backend/tests/financial-conversion-reference.test.ts` |
| Existing docs | `docs/BRL_USD_INTERNATIONAL_ACCOUNT_DELIVERY.md`, `docs/INSTITUTION_SETTLEMENT_INTERFACE_GUIDE.md`, `sow/SOW_instawards_submission_brl_usd_rail_20260520.md` |

## Implemented System Capabilities

### 1. Conversational Entry Points

The broader app has conversational interfaces and routing for WhatsApp,
Telegram, and browser-based confirmation flows. These are not the institutional
settlement product by themselves, but they form the existing interface layer
described in the SOW.

Evidence:

- `backend/src/api/agent`
- `backend/src/api/routes/evolution.router.ts`
- `backend/src/api/services/evolution.service.ts`
- `telegram/src`
- `frontend/app/chat`
- `frontend/app/r/[token]`

Current status:

- Implemented as product foundation.
- Not the main Instawards deliverable for this sprint, except where it links
  users or reviewers into transfer-routing screens.

### 2. Stellar Wallet, Asset, and Conversion Infrastructure

The backend includes Stellar account tooling, path quote logic, payment XDR
construction, strict send conversion, transaction submission, trusted asset
guardrails, and transaction evidence recording.

Evidence:

- `backend/src/api/services/stellar.service.ts`
- `backend/src/api/services/financial.service.ts`
- `backend/src/api/services/wallet-balance.service.ts`
- `backend/src/api/repository/stellar-transaction.repository.ts`
- `backend/src/api/routes/financial.router.ts`

Implemented:

- Testnet Stellar operations.
- Path quote and strict-send conversion quote support.
- Asset-payment submission from server-side secret when configured.
- Stellar transaction evidence attachment for transfer records.
- Mainnet activation guards.

Important limit:

- Settlement is real only when the required signing secret, source public key,
  destination, asset issuer, and network configuration are present. Otherwise
  settlement evidence is sandbox/mock evidence when explicitly allowed.

### 3. Pix and Etherfuse Ramp Infrastructure

The app has a substantial Etherfuse integration layer for Pix funding,
on-ramp/off-ramp quotes, orders, KYC/customer management, sandbox simulation,
and testnet fallback flows.

Evidence:

- `backend/src/api/services/anchor.service.ts`
- `backend/src/api/routes/ramp.router.ts`
- `backend/src/api/services/pix-funding.service.ts`
- `backend/src/api/services/etherfuse-webhook.service.ts`

Implemented:

- Etherfuse runtime checks.
- Customer creation and wallet association.
- On-ramp quote/order creation.
- Off-ramp preview/order/submit flow.
- Sandbox Pix simulation for controlled tests.
- Pix-funded transfer helper paths.

Important limit:

- The SOW asks for recording Pix funding events and transfer intents. The code
  supports that. It does not mean the project is operating production Pix
  remittance or production bank payout.

### 4. BRL-to-USD Quote Generation

The `BrlUsdQuoteService` creates active BRL/USD quotes and stores them in the
database.

Evidence:

- `backend/src/api/services/brl-usd-quote.service.ts`
- `backend/src/api/controllers/quotes.controller.ts`
- `backend/src/api/routes/quotes.router.ts`
- `backend/src/app.ts` mounts `app.use('/api/quotes', quotesRouter)`

Implemented:

- `POST /api/quotes/brl-usd`
- Quote IDs.
- Source BRL amount.
- Estimated USDC/USD amount.
- FX rate.
- Platform fee.
- Provider fee estimate.
- Quote expiry.
- Quote status.
- Supabase persistence through `international_transfer_quotes`.

Important limit:

- If a live or testnet path quote is unavailable, the service can use configured
  fallback behavior for sandbox/dev continuity. This should be disclosed in
  reviewer materials and should not be represented as a live production FX
  quote.

### 5. International Transfer Lifecycle Engine

The code has a dedicated transfer lifecycle for the exact institutional rail
described in the SOW.

Evidence:

- `backend/src/api/services/international-transfer.types.ts`
- `backend/src/api/services/international-transfer.service.ts`
- `backend/src/api/services/international-transfer-state.service.ts`
- `backend/src/api/repository/international-transfer.repository.ts`
- `backend/src/api/controllers/international-transfers.controller.ts`
- `backend/src/api/routes/international-transfers.router.ts`
- `backend/src/app.ts` mounts `app.use('/api/transfers', internationalTransfersRouter)`

Implemented states:

```text
QUOTE_CREATED
PIX_PENDING
PIX_RECEIVED
BRL_TO_USDC_PENDING
USDC_SETTLEMENT_PENDING
USDC_SETTLED
PAYOUT_INSTRUCTION_CREATED
PAYOUT_PENDING
PAYOUT_COMPLETED
FAILED
REFUNDED
```

Implemented API surface:

```text
POST /api/transfers
POST /api/transfers/:id/pix-intent
POST /api/transfers/:id/funding-confirmation
POST /api/transfers/:id/settle-stellar
POST /api/transfers/:id/payout-instruction
GET  /api/transfers/:id/reconciliation
GET  /api/transfers/:id
```

Implemented lifecycle behavior:

- Create a transfer from an active quote.
- Validate same-name payout alignment.
- Create a Pix funding intent.
- Confirm source funding through controlled webhook/sandbox path.
- Move through BRL-to-USDC and Stellar settlement states.
- Attach Stellar hash/memo/evidence where available.
- Create a payout instruction through a provider adapter.
- Store reconciliation data.

### 6. Database Persistence

The international settlement data model exists in a Supabase/Postgres migration.

Evidence:

- `backend/migrations/20260520_00_international_usd_transfers.sql`

Implemented tables:

- `international_transfer_quotes`
- `international_transfers`
- `international_transfer_reconciliations`

Implemented persistence fields include:

- Quote IDs and quote status.
- BRL amount, USD amount, USDC amount, FX rate.
- Sender/recipient identity.
- Payout destination metadata.
- Same-name match status and risk notes.
- Pix order/payment IDs.
- Stellar transaction hash, memo, source, destination, amount, network.
- Payout provider/instruction/reference status.
- Reconciliation metadata.
- Error codes and error messages.

### 7. Payout Coordination Layer

The provider-agnostic payout adapter interface is implemented.

Evidence:

- `backend/src/api/services/usd-payout-adapters.ts`

Adapters:

- `MockUsdPayoutAdapter`
- `EtherfusePixOffRampAdapter`
- `CircleCompatibilityAdapter`
- `BridgeCompatibilityAdapter`

Implemented:

- Common adapter interface.
- Payout instruction creation.
- Payout status lookup.
- Provider reference IDs.
- Same-name and destination metadata pass-through.
- Circle/Bridge-shaped payload construction.
- Optional provider POST execution when explicitly enabled.
- Etherfuse off-ramp proof preparation and optional sandbox execution.

Important limit:

- This is not production USD bank payout. It is an adapter and compatibility
  layer. The SOW allows sandbox/mock payout-provider responses during the
  sprint, but reviewer materials must avoid claiming production Wise/ACH/wire
  delivery.

### 8. Settlement Evidence and Reconciliation

The system can generate reconciliation objects combining quote, Pix, Stellar,
payout, metrics, and evidence metadata.

Evidence:

- `backend/src/api/services/settlement-evidence.service.ts`
- `backend/src/api/repository/international-transfer.repository.ts`
- `backend/src/api/repository/stellar-transaction.repository.ts`

Implemented:

- Fee and route metrics.
- Metric validation.
- On-ramp/off-ramp evidence fields.
- Stellar settlement evidence.
- Payout instruction evidence.
- Reconciliation persistence.

Important limit:

- The reconciliation object is strong enough for demo/review, but final
  submission still needs exported logs, screenshots, transaction hashes, and a
  video package.

### 9. Reviewer and Demo UI

The frontend includes a dedicated interface for the institution settlement
flow.

Evidence:

- `frontend/app/institution-settlement/page.tsx`
- `frontend/app/international-transfer/page.tsx`
- `frontend/app/international-transfer/international-transfer-client.tsx`

Implemented:

- Quote creation.
- Transfer creation.
- Pix funding intent.
- Funding confirmation.
- Stellar settlement.
- Payout instruction.
- Reconciliation loading.
- Guided state timeline.
- Request/response logs.
- Fee and evidence panels.
- Sensitive field redaction for logs.

Important limit:

- The UI is a reviewer/demo console, not a production operations console and
  not a polished institutional dashboard.

### 10. Tests

The core institutional transfer flow has backend tests.

Evidence:

- `backend/tests/international-transfer.service.test.ts`
- `backend/tests/financial-conversion-reference.test.ts`

Implemented test coverage:

- BRL/USD quote creation using path quote data.
- Same-name match and mismatch behavior.
- Full transfer lifecycle through Pix confirmation, Stellar settlement, payout
  instruction, and reconciliation.
- Fee metric validation in reconciliation.
- Conversion quote safety tests around suspicious sandbox rates.

Remaining test gaps:

- End-to-end HTTP route tests for `/api/transfers`.
- Provider adapter contract tests for Circle/Bridge payload formats.
- Payout polling/webhook tests.
- Failure-state tests for rejected funding, failed settlement, failed payout,
  and refund paths.
- Snapshot/evidence tests for reviewer output.

## What Is Not Fully Implemented

### Production Remittance Operations

Not implemented and intentionally out of scope.

The repo does not launch a public production remittance business and does not
operate a regulated production cross-border money transmission service.

### Regulated FX and Licensing Operations

Not implemented and intentionally out of scope.

The code can coordinate quotes, evidence, and settlement metadata, but it does
not implement licensing, tax reporting, production AML operations, sanctions
monitoring, FX registration, or regulated compliance workflows.

### Production USD Bank Payout

Not implemented.

The payout layer creates provider-agnostic payout instructions and sandbox or
compatibility payloads. It does not execute a production Wise payout, ACH, wire,
or live bank USD delivery.

### Verified Circle/Bridge Sandbox Integration

Partially implemented.

The adapters exist and can POST to configured provider URLs if API keys and
`ENABLE_REAL_PAYOUT_EXECUTION=true` are present. The repo does not itself prove
that provider sandbox credentials are currently configured in deployment.

### Automated Payout Status Polling

Partially implemented.

Adapters expose status methods, but a full recurring payout polling service or
provider webhook ingestion layer for destination payout status is not complete
as an operational subsystem.

### Final Reviewer Evidence Package

Partially implemented.

The code can generate the evidence, but the final package still needs to be
assembled:

- Demo video.
- Screenshots.
- API request/response examples.
- Transaction hashes where real testnet/mainnet validation was configured.
- Transfer records.
- Reconciliation JSON exports.
- Architecture diagrams.
- Setup instructions.

### Mainnet Settlement Validation

Partially implemented and guarded.

The code has runtime guards for small-value mainnet validation, but execution
requires explicit environment activation and amount limits. This is correct for
the SOW because the sprint does not require production operations.

## Current SOW Readiness Estimate

| Area | Readiness | Reason |
| --- | --- | --- |
| Transfer lifecycle engine | High | Dedicated service, state machine, persistence, API, and tests exist. |
| Pix funding event recording | High | Etherfuse and sandbox Pix funding paths exist and attach IDs to transfer records. |
| BRL/USD quote generation | High | Quote service, routes, persistence, and tests exist. |
| Stellar settlement evidence | Medium-high | Real settlement is supported when configured; mock/sandbox evidence is supported otherwise. |
| Payout adapter layer | Medium | Interface and adapters exist; production provider execution remains gated and unproven. |
| Reconciliation metadata | High | Reconciliation service and persistence exist. |
| Reviewer demo environment | Medium-high | UI exists; final evidence package still needs capture and polish. |
| Regulated production operation | Not in scope | Correctly absent for this Instawards sprint. |

## Bottom Line

The current repository already satisfies a large part of the engineering
foundation for the SOW. The 30-day sprint should be focused on hardening,
integration validation, operational observability, payout adapter proof, and
reviewer evidence rather than starting the settlement architecture from
scratch.
