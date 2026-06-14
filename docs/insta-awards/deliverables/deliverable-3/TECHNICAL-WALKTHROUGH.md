# Technical Walkthrough

This walkthrough maps the reviewer demo to current APIs, services, state transitions, and evidence outputs.

## 1. Quote

Request:

```http
POST /api/quotes/brl-usd
Content-Type: application/json

{
  "brl_amount": "1000",
  "user_id": "demo-user",
  "institution_id": "demo-institution"
}
```

Code path:

- `backend/src/api/routes/quotes.router.ts`
- `backend/src/api/controllers/quotes.controller.ts`
- `backend/src/api/services/brl-usd-quote.service.ts`

Evidence:

- `quote.quote_id`
- BRL input amount.
- estimated USDC/USD output amount.
- fee breakdown.
- quote expiration.

## 2. Transfer Creation

Request:

```http
POST /api/transfers
Content-Type: application/json
```

Required body fields:

- `quote_id`
- `sender_identity`
- `recipient_identity`
- `payout_destination.accountHolderName`
- `payout_destination.country`

Code path:

- `backend/src/api/routes/international-transfers.router.ts`
- `backend/src/api/controllers/international-transfers.controller.ts`
- `backend/src/api/services/international-transfer.service.ts`
- `backend/src/api/services/identity-alignment.service.ts`

Evidence:

- `transfer.transfer_id`
- quote linked to transfer.
- same-name account alignment result.
- payout destination metadata with sensitive values redacted in evidence.

## 3. PIX Funding Intent

Request:

```http
POST /api/transfers/:id/pix-intent
Content-Type: application/json
```

Real provider path:

- requires Etherfuse session credentials.
- creates an on-ramp order through `AnchorService`.

Mock rehearsal path:

```json
{
  "mock_pix_intent": true
}
```

The mock path requires:

```bash
ALLOW_OPS_MOCKS=true
INTERNATIONAL_TRANSFER_ENABLE_MOCK_PIX=true
```

Code path:

- `backend/src/api/services/pix-funding.service.ts`
- `backend/src/api/services/anchor.service.ts`
- `backend/src/api/services/international-transfer.service.ts`

Evidence:

- PIX order/payment ID.
- copy-paste payload or provider evidence.
- funding status.

## 4. PIX Funding Confirmation

Provider path:

```text
Etherfuse webhook -> backend controller -> InternationalTransferService.handlePixConfirmation()
```

Sandbox rehearsal path:

```http
POST /api/transfers/:id/funding-confirmation
Authorization: Bearer <ops-token>
Content-Type: application/json

{
  "status": "completed",
  "event": "pix.received"
}
```

Code path:

- `backend/src/api/controllers/etherfuse-webhook.controller.ts`
- `backend/src/api/controllers/international-transfers.controller.ts`
- `backend/src/api/services/international-transfer.service.ts`

State impact:

```text
PIX_PENDING -> PIX_RECEIVED -> BRL_TO_USDC_PENDING
```

Normalized orchestration mirror:

```text
PIX_CHARGE_ISSUED -> PIX_FUNDED
```

## 5. Stellar Settlement

Request:

```http
POST /api/transfers/:id/settle-stellar
Authorization: Bearer <ops-token>
```

Real testnet path requires:

- `STELLAR_NETWORK=TESTNET`
- `STELLAR_SECRET_KEY`
- `USD_OFFRAMP_STELLAR_DESTINATION`
- `USDC_ASSET_ISSUER`

Mock rehearsal path requires:

```bash
ALLOW_OPS_MOCKS=true
ALLOW_STELLAR_MOCK_SETTLEMENT=true
```

Code path:

- `backend/src/api/services/stellar-settlement.service.ts`
- `backend/src/api/services/stellar.service.ts`
- `backend/src/api/repository/stellar-transaction.repository.ts`

Evidence:

- `stellar_tx_hash`
- memo.
- source and destination account metadata.
- USDC amount.
- network and execution mode.

State impact:

```text
BRL_TO_USDC_PENDING -> USDC_SETTLEMENT_PENDING -> USDC_SETTLED
```

Normalized orchestration mirror:

```text
CONVERTING -> STELLAR_SETTLED
```

## 6. USD Payout Coordination

Request:

```http
POST /api/transfers/:id/payout-instruction
Authorization: Bearer <ops-token>
Content-Type: application/json

{
  "provider": "circle"
}
```

Circle compatibility path:

- `ENABLE_REAL_PAYOUT_EXECUTION=false`
- builds Circle Mint payout payload evidence.
- does not call Circle or execute a bank payout.

Circle sandbox path:

- `ENABLE_REAL_PAYOUT_EXECUTION=true`
- `CIRCLE_API_KEY` present.
- `CIRCLE_PAYOUT_DESTINATION_ID` or per-transfer `providerDestinationId` present.
- calls Circle Mint `POST /v1/businessAccount/payouts`.

Code path:

- `backend/src/api/services/usd-payout-adapters.ts`
- `backend/src/api/services/usd-payout-coordination.service.ts`
- `backend/src/api/services/international-transfer.service.ts`

Evidence:

- payout instruction ID.
- provider payout ID when provider returns one.
- provider payload redacted.
- destination metadata redacted.
- execution mode.

State impact:

```text
USDC_SETTLED -> PAYOUT_INSTRUCTION_CREATED -> PAYOUT_PENDING or PAYOUT_COMPLETED
```

Normalized orchestration mirror:

```text
STELLAR_SETTLED -> PAYOUT_ROUTING -> PAYOUT_INSTRUCTED
```

## 7. Payout Status And Webhook

Polling:

```http
POST /api/transfers/:id/payout-status-refresh
Authorization: Bearer <ops-token>
```

Webhook:

```http
POST /api/transfers/payout-events/circle
X-Payout-Webhook-Secret: <secret>
```

Code path:

- `backend/src/api/controllers/international-transfers.controller.ts`
- `backend/src/api/services/usd-payout-adapters.ts`
- `backend/src/api/repository/international-transfer.repository.ts`

Evidence:

- normalized payout status.
- raw provider status.
- provider event ID.
- redacted webhook payload.

## 8. Reconciliation And Reviewer Evidence

Reviewer endpoints:

```http
GET /api/transfers/:id/reconciliation
GET /api/transfers/:id/orchestration-log
GET /api/transfers/:id/reviewer-evidence
GET /api/transfers/:id/payout-evidence
GET /api/transfers/:id/workflow
```

Code path:

- `backend/src/api/services/settlement-evidence.service.ts`
- `backend/src/api/services/international-transfer-lifecycle.ts`
- `backend/src/orchestration/TransferOrchestrator.ts`

Final reviewer evidence should show:

- quote, PIX, Stellar, payout, and reconciliation artifacts.
- the same transfer ID across API output, screenshots, and video.
- privacy notes for redacted bank/account/customer fields.
- clear labels for real testnet, sandbox, compatibility, or mock execution.
