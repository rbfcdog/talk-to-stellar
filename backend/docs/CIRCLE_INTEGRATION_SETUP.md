# Circle Integration Setup

Scope: backend setup for the Circle Mint USD payout path in the BRL -> USDC -> USD coordination layer.

This guide explains how to connect TalkToStellar's Circle payout adapter to Circle Mint. It is an operator setup runbook, not a replacement for Circle onboarding, compliance review, treasury approval, or production account approval.

TTS rail covered here:

```text
PIX BRL funding -> Stellar USDC settlement -> Circle Mint USD bank payout
```

## Official Circle References

- Set up a Circle Mint sandbox account and API key: `https://developers.circle.com/circle-mint/quickstarts/getting-started`
- Link a bank account for Mint fiat flows: `https://developers.circle.com/circle-mint/howtos/deposit-fiat`
- Withdraw fiat to a linked bank account: `https://developers.circle.com/circle-mint/howtos/withdraw-fiat`
- Create a payout API reference: `https://developers.circle.com/api-reference/circle-mint/account/create-business-payout`
- Get a payout API reference: `https://developers.circle.com/api-reference/circle-mint/account/get-business-payout`

## Local Implementation

Circle payout coordination is implemented in:

- `backend/src/api/services/usd-payout-adapters.ts` - `CircleCompatibilityAdapter`
- `backend/src/api/services/usd-payout-coordination.service.ts` - capability and evidence snapshots
- `backend/src/api/services/international-transfer.service.ts` - payout creation, polling, webhook application, reconciliation
- `backend/src/api/controllers/international-transfers.controller.ts` - ops and webhook authorization
- `backend/src/api/routes/international-transfers.router.ts` - `/api/transfers` payout routes

Implementation details are documented in `backend/docs/CIRCLE_PAYOUT_FOUNDATION.md`.

## Prerequisites

- Circle Mint sandbox account access.
- Circle Mint sandbox API key.
- Circle Mint balance available for payout execution when testing real sandbox calls.
- A linked Circle bank account destination ID for the USD destination.
- Backend `.env` configured from `backend/.env.example`.
- `INTERNATIONAL_TRANSFER_OPS_SECRET` or another accepted internal ops token configured for payout routes.
- Database schema applied from `backend/migrations/20260613_00_full_schema.sql`.

## 1. Create And Verify Circle Sandbox Access

Create the sandbox account and API key in Circle Mint, then verify connectivity from a trusted shell:

```bash
export CIRCLE_API_KEY="replace-with-sandbox-key"

curl -s https://api-sandbox.circle.com/ping

curl -s https://api-sandbox.circle.com/v1/configuration \
  -H "Authorization: Bearer ${CIRCLE_API_KEY}"
```

Keep the API key out of frontend env files, browser code, logs, screenshots, and committed documentation.

## 2. Capture The Linked Bank Destination ID

Circle Mint bank payouts require a linked bank account ID. TalkToStellar does not submit raw routing or account numbers to Circle's payout endpoint.

Use one of these options:

- Link or view the bank account in the Circle Mint console and copy its bank account ID.
- Use Circle's bank-account linking flow, then copy the returned bank account `id`.

Store the destination ID globally:

```bash
CIRCLE_PAYOUT_DESTINATION_ID=9d1fa351-b24d-442a-8aa5-e717db1ed636
CIRCLE_PAYOUT_DESTINATION_TYPE=wire
```

Or store it on a transfer destination before payout creation:

```json
{
  "payout_destination": {
    "accountHolderName": "Example Recipient",
    "accountHolderType": "individual",
    "country": "US",
    "providerDestinationId": "9d1fa351-b24d-442a-8aa5-e717db1ed636",
    "providerDestinationType": "wire",
    "providerLabel": "other"
  }
}
```

The adapter also accepts `circleBankAccountId` in `payout_destination` for the same purpose.

Current sandbox note: the configured Circle wire bank is found by the sandbox API with status `complete` and description `WELLS FARGO BANK, NA ****0010`. Store the returned bank `id` only in backend secret storage or local `.env`; do not commit the raw ID, API key, account number, or routing number.

## 3. Configure Backend Environment

Start in compatibility mode. This builds Circle-compatible payout evidence without calling Circle:

```bash
PAYOUT_PROVIDER=circle
ENABLE_REAL_PAYOUT_EXECUTION=false

CIRCLE_API_KEY=replace-with-sandbox-key
CIRCLE_ENVIRONMENT=sandbox
CIRCLE_API_BASE_URL=
CIRCLE_PAYOUT_DESTINATION_ID=replace-with-linked-bank-account-id
CIRCLE_PAYOUT_DESTINATION_TYPE=wire
CIRCLE_SOURCE_WALLET_ID=
CIRCLE_PAYOUT_CREATE_URL=
CIRCLE_PAYOUT_STATUS_URL=
CIRCLE_PAYOUT_WEBHOOK_SECRET=replace-with-long-random-secret
PAYOUT_WEBHOOK_SECRET=
PAYOUT_PROVIDER_TIMEOUT_MS=30000

INTERNATIONAL_TRANSFER_OPS_SECRET=replace-with-long-random-ops-secret
```

Notes:

- Leave `CIRCLE_API_BASE_URL`, `CIRCLE_PAYOUT_CREATE_URL`, and `CIRCLE_PAYOUT_STATUS_URL` blank unless you need an explicit override.
- With `CIRCLE_ENVIRONMENT=sandbox`, defaults resolve to `https://api-sandbox.circle.com/v1/businessAccount/payouts`.
- With `CIRCLE_ENVIRONMENT=production` or `prod`, defaults resolve to `https://api.circle.com/v1/businessAccount/payouts`.
- `CIRCLE_SOURCE_WALLET_ID` is optional. If omitted, Circle uses the account's main wallet.
- `CIRCLE_PAYOUT_WEBHOOK_SECRET` is preferred for Circle webhooks. `PAYOUT_WEBHOOK_SECRET` is the shared fallback.

## 4. Check Adapter Capabilities

Before starting the backend, verify the local backend env is ready:

```bash
npm --prefix backend run circle:payout-readiness
```

The output redacts the API key and destination ID. It should report `circle_sandbox_api_execution: true` only when `CIRCLE_API_KEY`, `CIRCLE_PAYOUT_DESTINATION_ID`, `CIRCLE_ENVIRONMENT=sandbox`, and `ENABLE_REAL_PAYOUT_EXECUTION=true` are all set.

Current verified readiness on 2026-06-16:

- Circle sandbox API key present in backend env.
- Linked wire destination present and found through Circle API.
- Linked destination status: `complete`.
- Circle balances endpoint returned HTTP 200.
- Circle wire-bank list endpoint returned HTTP 200.
- No mutating payout was created by the readiness probe.

Run the backend and inspect provider capabilities:

```bash
npm --prefix backend run dev
```

In another shell:

```bash
BACKEND_URL=http://localhost:3001

curl -s "${BACKEND_URL}/api/transfers/payout-providers" | jq
```

Expected setup phases:

| Capability mode | Meaning |
|-----------------|---------|
| `compatibility` | Missing execution gate, API key, or destination ID. No Circle payout is executed. |
| `sandbox_api` | Sandbox API key, linked destination ID, and execution gate are configured. |
| `live_api` | Production Circle endpoint is selected. Use only after production approval. |

If `blockers` includes `ENABLE_REAL_PAYOUT_EXECUTION is false.`, the adapter is intentionally in evidence-only mode.

## 5. Create A Payout Instruction

The transfer must already have:

- Status at or beyond `USDC_SETTLED`.
- A persisted Stellar transaction hash.
- A same-name check result of `MATCHED` when same-name payout is required.
- A payout destination with `accountHolderName` and `country`.

Create the payout instruction:

```bash
BACKEND_URL=http://localhost:3001
OPS_TOKEN="replace-with-ops-secret"
TRANSFER_ID="replace-with-transfer-id"

curl -s -X POST "${BACKEND_URL}/api/transfers/${TRANSFER_ID}/payout-instruction" \
  -H "Authorization: Bearer ${OPS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"provider":"circle"}' | jq
```

If you need to use the linked bank destination only for one request instead of global env:

```bash
curl -s -X POST "${BACKEND_URL}/api/transfers/${TRANSFER_ID}/payout-instruction" \
  -H "Authorization: Bearer ${OPS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "circle",
    "circleDestinationId": "replace-with-linked-bank-account-id",
    "circleDestinationType": "wire"
  }' | jq
```

In compatibility mode, the response should move the transfer into payout coordination without executing Circle. The evidence should show a Circle Mint payout payload and a note that no bank payout was executed.

## 6. Enable Sandbox Execution

Only after the sandbox key and linked bank destination ID are validated:

```bash
ENABLE_REAL_PAYOUT_EXECUTION=true
CIRCLE_ENVIRONMENT=sandbox
CIRCLE_API_KEY=replace-with-sandbox-key
CIRCLE_PAYOUT_DESTINATION_ID=replace-with-linked-bank-account-id
```

Restart the backend, check `/api/transfers/payout-providers`, and confirm the Circle provider reports `sandbox_api`.

Then create a payout instruction for a settled test transfer. Circle execution calls:

```text
POST /v1/businessAccount/payouts
```

The adapter sends:

- `idempotencyKey`
- `destination.id`
- `destination.type`
- `amount.amount`
- `amount.currency=USD`
- optional `source.id`
- metadata linking the payout to the TalkToStellar transfer and Stellar settlement
- `route=PIX_BRL_TO_STELLAR_USDC_TO_USD_BANK`
- `settlement_asset_code=USDC`
- `off_ramp_source_asset_code=USDC`

## 7. Poll Status

Refresh payout status after Circle returns a provider payout ID:

```bash
curl -s -X POST "${BACKEND_URL}/api/transfers/${TRANSFER_ID}/payout-status-refresh" \
  -H "Authorization: Bearer ${OPS_TOKEN}" | jq
```

Circle status polling uses:

```text
GET /v1/businessAccount/payouts/{id}
```

Normalized TalkToStellar statuses are stored on the transfer and in `international_payout_instructions`.

## 8. Configure Webhook Intake

Point Circle payout notifications at:

```text
POST https://YOUR_BACKEND/api/transfers/payout-events/circle
```

Send the configured secret as either:

```text
X-Payout-Webhook-Secret: <CIRCLE_PAYOUT_WEBHOOK_SECRET>
```

or:

```text
Authorization: Bearer <CIRCLE_PAYOUT_WEBHOOK_SECRET>
```

Local webhook test:

```bash
curl -s -X POST "${BACKEND_URL}/api/transfers/payout-events/circle" \
  -H "X-Payout-Webhook-Secret: ${CIRCLE_PAYOUT_WEBHOOK_SECRET}" \
  -H "Content-Type: application/json" \
  -d '{"id":"evt_test","type":"payouts","data":{"id":"replace-with-provider-payout-id","status":"complete"}}' | jq
```

Webhook events are normalized and persisted in `international_payout_events`.

## 9. Capture Evidence

Use these endpoints for reviewer or operator evidence:

```bash
curl -s "${BACKEND_URL}/api/transfers/${TRANSFER_ID}/payout-evidence" \
  -H "Authorization: Bearer ${OPS_TOKEN}" | jq

curl -s "${BACKEND_URL}/api/transfers/${TRANSFER_ID}/reconciliation" \
  -H "Authorization: Bearer ${OPS_TOKEN}" | jq
```

Do not claim a real Circle payout unless:

- `international_payout_instructions.provider_payout_id` contains the Circle payout ID.
- Provider response evidence is persisted and redacted.
- The transfer has a Stellar settlement hash linked to the payout instruction.
- Status polling or webhook evidence confirms the payout lifecycle state.

## 10. Production Gate

Before setting `CIRCLE_ENVIRONMENT=production` or using `https://api.circle.com`:

- Confirm Circle production account approval.
- Use a production API key stored only in backend secret storage.
- Confirm the production linked bank account ID.
- Confirm treasury funding and payout limits.
- Confirm compliance approval for same-name account rules and recipient restrictions.
- Run a small controlled production payout and capture reconciliation evidence.

Production `.env` should keep explicit intent:

```bash
PAYOUT_PROVIDER=circle
ENABLE_REAL_PAYOUT_EXECUTION=true
CIRCLE_ENVIRONMENT=production
CIRCLE_API_KEY=replace-with-production-key
CIRCLE_PAYOUT_DESTINATION_ID=replace-with-production-linked-bank-account-id
```

## Troubleshooting

| Symptom | Likely cause | Fix |
|---------|--------------|-----|
| Provider capability is `compatibility` | Execution gate is off or required config is missing | Check `/api/transfers/payout-providers` blockers. |
| `CIRCLE_API_KEY is missing.` | Backend env does not include the key | Add sandbox key to backend secret storage and restart. |
| `CIRCLE_PAYOUT_DESTINATION_ID ... is missing.` | No linked bank destination ID is configured | Add `CIRCLE_PAYOUT_DESTINATION_ID` or per-transfer `providerDestinationId`. |
| Circle returns `401` | Wrong API key, wrong environment, or malformed auth header | Verify sandbox vs production key and `Bearer` auth. |
| Payout instruction is blocked before Circle | Transfer has not reached `USDC_SETTLED` or same-name check failed | Complete settlement and identity alignment first. |
| Status stays `pending` | Circle has not completed or returned the payout yet | Poll status and verify webhook delivery. |
| Returned or failed payout | Bank-side rejection, insufficient balance, or provider risk failure | Keep evidence, review Circle response, and retry with a new idempotency key only after operations approval. |

## Verification

```bash
npm --prefix backend test -- --runInBand tests/payout-adapter-contract.test.ts
npm --prefix backend run build
```

For docs-only changes, at minimum run:

```bash
git diff --check -- '*.md'
```
