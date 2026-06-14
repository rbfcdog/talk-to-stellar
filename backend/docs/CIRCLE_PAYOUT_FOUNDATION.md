# Circle Payout Foundation

Scope: Instawards Week 2, USD Delivery & Payout Coordination Layer.

## Current Implementation

The Circle foundation is implemented in:

- `backend/src/api/services/usd-payout-adapters.ts` — `CircleCompatibilityAdapter`
- `backend/src/api/services/usd-payout-coordination.service.ts` — capability and evidence builder
- `backend/src/api/services/international-transfer.service.ts` — payout instruction creation, status refresh, webhook application, reconciliation
- `backend/src/api/controllers/international-transfers.controller.ts` — HTTP handlers
- `backend/src/api/routes/international-transfers.router.ts` — `/api/transfers` payout routes
- `backend/src/api/repository/international-transfer.repository.ts` — persistence for payout instructions and payout events

The adapter uses Circle Mint's bank payout model:

- create payout: `POST /v1/businessAccount/payouts`
- get payout: `GET /v1/businessAccount/payouts/{id}`
- default sandbox base URL: `https://api-sandbox.circle.com`
- default production base URL: `https://api.circle.com`

Circle payouts require a linked Circle bank account destination ID. Raw routing/account details are not sent to Circle payout execution; they remain redacted destination metadata for reviewer evidence and same-name controls.

## Execution Modes

| Mode | When | Result |
|------|------|--------|
| `compatibility` | Missing API key, missing destination ID, or `ENABLE_REAL_PAYOUT_EXECUTION=false` | Builds official Circle payload evidence but does not execute a bank payout. |
| `sandbox_api` | Circle sandbox URL + API key + destination ID + execution enabled | Calls Circle sandbox payout endpoint and stores redacted response evidence. |
| `live_api` | Circle production URL + API key + destination ID + execution enabled | Calls Circle production payout endpoint. Use only after compliance and treasury approval. |
| `wise_metadata_only` | Destination label is `wise` | Stores metadata only; no Circle/Wise payout execution. |

## Required Environment

```bash
PAYOUT_PROVIDER=circle
ENABLE_REAL_PAYOUT_EXECUTION=false

CIRCLE_API_KEY=
CIRCLE_ENVIRONMENT=sandbox
CIRCLE_API_BASE_URL=
CIRCLE_PAYOUT_DESTINATION_ID=
CIRCLE_PAYOUT_DESTINATION_TYPE=wire
CIRCLE_SOURCE_WALLET_ID=
CIRCLE_PAYOUT_CREATE_URL=
CIRCLE_PAYOUT_STATUS_URL=
CIRCLE_PAYOUT_WEBHOOK_SECRET=
PAYOUT_WEBHOOK_SECRET=
PAYOUT_PROVIDER_TIMEOUT_MS=30000
```

Notes:

- Leave `ENABLE_REAL_PAYOUT_EXECUTION=false` for compatibility evidence.
- Set `CIRCLE_PAYOUT_DESTINATION_ID` to the linked Circle wire bank account ID before any sandbox or live execution.
- `CIRCLE_PAYOUT_CREATE_URL` and `CIRCLE_PAYOUT_STATUS_URL` are optional overrides. If blank, the adapter derives Circle sandbox/production URLs from `CIRCLE_ENVIRONMENT` or `CIRCLE_API_BASE_URL`.
- `CIRCLE_SOURCE_WALLET_ID` is optional. If omitted, Circle uses the account's main wallet.

## Operator Flow

After a transfer reaches `USDC_SETTLED` with a Stellar transaction hash:

```http
POST /api/transfers/:id/payout-instruction
Authorization: Bearer <ops-token>

{
  "provider": "circle"
}
```

Then refresh status:

```http
POST /api/transfers/:id/payout-status-refresh
Authorization: Bearer <ops-token>
```

Provider webhooks are accepted at:

```http
POST /api/transfers/payout-events/circle
X-Payout-Webhook-Secret: <CIRCLE_PAYOUT_WEBHOOK_SECRET>
```

Evidence endpoints:

```http
GET /api/transfers/payout-providers
GET /api/transfers/:id/payout-evidence
GET /api/transfers/:id/reconciliation
```

## Evidence Rules

- Persisted `provider_payload`, `provider_response`, and webhook evidence are redacted through `payoutProviderEvidenceSnapshot()`.
- Bank account and routing numbers show only last four digits in local evidence.
- Circle destination IDs are stored as short hashes in evidence.
- A real/sandbox payout must not be claimed unless Circle returned a provider payout ID and the response is persisted in `international_payout_instructions`.

## Verification

```bash
npm --prefix backend test -- --runInBand tests/payout-adapter-contract.test.ts
npm --prefix backend run build
```
