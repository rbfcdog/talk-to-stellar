# Deliverable 2 Submission Checklist

Use this document to assemble the reviewer package for the Week 2 deliverable:

> Provider-agnostic payout adapter interface that converts completed Stellar USDC settlement events into payout instructions for USD account destinations and payout-provider workflows.

The reviewer package should prove four things:

1. Adapter Interface Code
2. Hash Transacao Stellar
3. Integracao Circle/Bridge
4. Payout Instructions

Do not include raw API keys, raw bank account numbers, routing numbers, session tokens, PINs, Supabase service-role keys, Circle API keys, or unmasked customer PII. Evidence should use the repo's redacted snapshots.

## Minimum Package

Create a folder for the final evidence run, for example:

```text
docs/insta-awards/deliverables/deliverable-2/evidence/<YYYY-MM-DD-transfer-ref>/
```

Put these files in it:

| File | What it proves |
|---|---|
| `adapter-interface-code.md` | The provider interface exists, supports multiple providers, and is tested. |
| `stellar-transaction-hash.md` | A real settled Stellar testnet transaction hash is attached to the transfer. |
| `circle-bridge-integration.md` | Circle/Bridge capability output and compatibility or sandbox evidence. |
| `payout-instructions.md` | The payout instruction request/response, stored DB rows, status history, and reconciliation evidence. |
| `raw-payout-evidence.json` | Redacted output from `GET /api/transfers/:id/payout-evidence`. |
| `raw-reconciliation.json` | Redacted output from `GET /api/transfers/:id/reconciliation`. |
| `ops-dashboard-screenshot.png` | Screenshot of the transfer detail page showing settlement, payout, and reconciliation. |

All artifacts should refer to the same `transfer_id`, `public_ref` or normalized ops reference, Stellar transaction hash, payout instruction ID, and provider status.

## Database Prerequisite

Deliverable 2 depends on the schema in:

```text
backend/migrations/20260613_00_full_schema.sql
```

That migration includes the evidence tables:

- `public.international_transfers`
- `public.international_payout_instructions`
- `public.international_payout_events`
- `public.international_transfer_reconciliations`

No separate Week 2 migration is needed if `20260613_00_full_schema.sql` has already been applied to the target Supabase database.

## 1. Adapter Interface Code

Put this in `adapter-interface-code.md`.

Required content:

- Repository URL and branch or commit SHA.
- Code reference for the adapter contract:
  - `backend/src/api/services/usd-payout-adapters.ts`
  - `PayoutProviderAdapter`
  - `CreatePayoutInput`
  - `CircleCompatibilityAdapter`
  - `BridgeCompatibilityAdapter`
  - `EtherfusePixOffRampAdapter`
  - `MockUsdPayoutAdapter`
- Code reference for coordination and evidence:
  - `backend/src/api/services/usd-payout-coordination.service.ts`
  - `UsdPayoutCoordinationService.buildEvidence(...)`
- Test reference:
  - `backend/tests/payout-adapter-contract.test.ts`

Required proof:

```bash
npm --prefix backend test -- --runInBand tests/payout-adapter-contract.test.ts
npm --prefix backend test -- --runInBand tests/international-transfer.routes.test.ts
npm --prefix backend run build
```

Paste the command output summary into the artifact. The key proof is that the tests cover:

- Circle compatibility payload creation.
- Bridge compatibility payload creation.
- Redaction of account/routing fields.
- Circle sandbox endpoint selection.
- Circle status polling normalization.
- Rejection of unsupported payout providers.
- Webhook event normalization.

Expected reviewer claim:

```text
TalkToStellar implements a provider-agnostic payout adapter contract with Circle, Bridge, Etherfuse proof, and mock adapters. The contract creates payout instructions, reports provider capabilities, polls provider status where available, and normalizes provider webhook events.
```

## 2. Hash Transacao Stellar

Put this in `stellar-transaction-hash.md`.

This must be a real Stellar testnet settlement hash from the same transfer used for payout evidence. Do not use placeholder values like `stellar-hash-contract`.

Required content:

- `transfer_id`
- ops `public_ref`, if available
- transfer status at or after `USDC_SETTLED`
- Stellar network, normally testnet
- `stellar_tx_hash`
- `stellar_memo`, if present
- `stellar_asset_code`, normally `USDC`
- settled amount
- timestamp from `stellar_settled_at`
- Stellar explorer URL

Where to get it:

```sql
select
  id as transfer_id,
  status,
  stellar_asset_code,
  stellar_tx_hash,
  stellar_memo,
  stellar_source_account,
  stellar_destination_account,
  quoted_usd_amount,
  stellar_settled_at,
  payout_instruction_id,
  provider_payout_id,
  payout_status
from public.international_transfers
where id = '<transfer_id>';
```

Also capture it from the ops dashboard:

```text
/ops/transfers/:id
```

The screenshot should show the Stellar transaction hash in the Evidence/Links or raw transfer record area. The hash should open in the correct Stellar explorer for the configured network.

Expected reviewer claim:

```text
The payout instruction is linked to a completed Stellar USDC settlement by transaction hash. The same hash appears in the database transfer record, payout evidence, reconciliation output, and dashboard detail view.
```

## 3. Integracao Circle/Bridge

Put this in `circle-bridge-integration.md`.

There are two acceptable evidence levels:

| Level | What it means | What to claim |
|---|---|---|
| Compatibility | Provider payload is built and redacted, but no external payout API call is executed. | "Circle/Bridge-compatible payload evidence prepared." |
| Sandbox API | Circle sandbox key, linked bank destination ID, and execution gate are configured, and Circle returns a provider payout ID. | "Circle sandbox payout API call executed." |

Do not claim a real Circle or Bridge payout unless the provider returned a provider payout ID and the redacted provider response is persisted.

Required content:

- Output from:

```bash
BACKEND_URL=https://<backend-host>
OPS_TOKEN=<ops-secret>

curl -s "${BACKEND_URL}/api/transfers/payout-providers" \
  -H "Authorization: Bearer ${OPS_TOKEN}" | jq
```

- Circle environment summary with secrets redacted:

```text
PAYOUT_PROVIDER=circle
ENABLE_REAL_PAYOUT_EXECUTION=false or true
CIRCLE_ENVIRONMENT=sandbox
CIRCLE_API_KEY=[set or missing, never paste value]
CIRCLE_PAYOUT_DESTINATION_ID=[set or missing, never paste value]
CIRCLE_PAYOUT_DESTINATION_TYPE=wire
CIRCLE_SOURCE_WALLET_ID=[optional]
CIRCLE_PAYOUT_CREATE_URL=[blank unless overridden]
CIRCLE_PAYOUT_STATUS_URL=[blank unless overridden]
```

- Bridge capability output from the same `payout-providers` response.
- Explanation of current Bridge level:
  - Bridge adapter exists in `backend/src/api/services/usd-payout-adapters.ts`.
  - It can create redacted compatibility payloads.
  - Live Bridge execution requires provider access, `BRIDGE_API_KEY`, `BRIDGE_PAYOUT_CREATE_URL`, `BRIDGE_PAYOUT_STATUS_URL`, and `ENABLE_REAL_PAYOUT_EXECUTION=true`.

Circle sandbox execution requires:

```text
ENABLE_REAL_PAYOUT_EXECUTION=true
CIRCLE_ENVIRONMENT=sandbox
CIRCLE_API_KEY=<sandbox key>
CIRCLE_PAYOUT_DESTINATION_ID=<linked Circle bank account id>
CIRCLE_PAYOUT_DESTINATION_TYPE=wire
```

`CIRCLE_PAYOUT_DESTINATION_ID` must be a real linked Circle bank account ID. It cannot be any random string for execution. In compatibility mode it can be blank, because no bank payout is sent.

The current sandbox linked-bank setup has already returned a Circle wire bank account ID with status `pending`. Store the returned ID only in backend secret storage or local `.env`; evidence should show only that the destination is configured, plus a hash/tail from `npm --prefix backend run circle:payout-readiness`.

Expected reviewer claim for compatibility mode:

```text
TalkToStellar builds Circle/Bridge-compatible payout payloads and stores redacted provider evidence. Circle/Bridge execution is gated behind provider credentials, a linked payout destination, and ENABLE_REAL_PAYOUT_EXECUTION=true.
```

Expected reviewer claim for Circle sandbox mode:

```text
TalkToStellar executed a Circle sandbox payout API call for a settled Stellar transfer, persisted the provider payout ID, normalized the returned status, and stored redacted provider response evidence.
```

## 4. Payout Instructions

Put this in `payout-instructions.md`.

Required content:

- Request used to create the payout instruction.
- Response from the backend.
- DB row from `international_payout_instructions`.
- Status refresh or webhook evidence, if available.
- Reconciliation output.
- Redaction note showing that provider references are hashed and account numbers expose only last four digits.

Create the instruction after the transfer reaches `USDC_SETTLED`:

```bash
BACKEND_URL=https://<backend-host>
OPS_TOKEN=<ops-secret>
TRANSFER_ID=<transfer-id>

curl -s -X POST "${BACKEND_URL}/api/transfers/${TRANSFER_ID}/payout-instruction" \
  -H "Authorization: Bearer ${OPS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"provider":"circle"}' | jq
```

If not using global `CIRCLE_PAYOUT_DESTINATION_ID`, pass the linked destination on the protected request:

```bash
curl -s -X POST "${BACKEND_URL}/api/transfers/${TRANSFER_ID}/payout-instruction" \
  -H "Authorization: Bearer ${OPS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"provider":"circle","circleDestinationId":"<linked-circle-wire-bank-id>","circleDestinationType":"wire"}' | jq
```

Refresh status:

```bash
curl -s -X POST "${BACKEND_URL}/api/transfers/${TRANSFER_ID}/payout-status-refresh" \
  -H "Authorization: Bearer ${OPS_TOKEN}" | jq
```

Export evidence:

```bash
curl -s "${BACKEND_URL}/api/transfers/${TRANSFER_ID}/payout-evidence" \
  -H "Authorization: Bearer ${OPS_TOKEN}" | jq > raw-payout-evidence.json

curl -s "${BACKEND_URL}/api/transfers/${TRANSFER_ID}/reconciliation" \
  -H "Authorization: Bearer ${OPS_TOKEN}" | jq > raw-reconciliation.json
```

Database proof:

```sql
select
  id,
  transfer_id,
  provider_name,
  provider_payout_id,
  status,
  execution_mode,
  amount_usd,
  currency,
  destination_metadata,
  settlement_evidence,
  provider_request,
  provider_response,
  status_history,
  created_at,
  updated_at
from public.international_payout_instructions
where transfer_id = '<transfer_id>';
```

If a webhook or status event was captured:

```sql
select
  id,
  transfer_id,
  payout_instruction_id,
  provider_name,
  provider_event_id,
  provider_payout_id,
  status,
  event_type,
  evidence,
  occurred_at,
  created_at
from public.international_payout_events
where transfer_id = '<transfer_id>'
order by occurred_at desc;
```

Reconciliation proof:

```sql
select
  transfer_id,
  quote_id,
  pix_payment_id,
  pix_order_id,
  stellar_tx_hash,
  stellar_memo,
  payout_instruction_id,
  provider_payout_id,
  final_payout_status,
  evidence,
  created_at,
  updated_at
from public.international_transfer_reconciliations
where transfer_id = '<transfer_id>';
```

Expected reviewer claim:

```text
For the settled transfer, TalkToStellar created a USD payout instruction, linked it to Stellar settlement evidence, persisted provider request/response evidence, tracked provider status, and exposed a redacted reviewer evidence package.
```

## Reviewer Demo Order

Use this order in the screen-share:

1. Open the GitHub repo and show `backend/src/api/services/usd-payout-adapters.ts`.
2. Show the passing `payout-adapter-contract.test.ts` result.
3. Open `/ops` and filter to the target transfer.
4. Open `/ops/transfers/:id`.
5. Point to the Stellar hash and open the explorer link.
6. Point to payout provider, payout instruction ID, status, and reconciliation panel.
7. Show `raw-payout-evidence.json` and `raw-reconciliation.json`.
8. Show `GET /api/transfers/payout-providers` capability output.

## Submission Boundary

Use precise language:

- Say "compatibility evidence" when `ENABLE_REAL_PAYOUT_EXECUTION=false`.
- Say "Circle sandbox API execution" when Circle returned a provider payout ID from the sandbox API (CURRENT STATE — verified 2026-06-16 with payout ID `a17b4923-3dd2-44da-ac06-e8cd070d8484`).
- Say "production payout" only after production Circle approval, production credentials, treasury approval, and a real provider response.
- Say "Bridge compatibility adapter" unless Bridge provider credentials and endpoints were actually used.
- Say "Wise metadata only" unless a Wise API integration has been implemented and executed.

## Final Acceptance Check

Before submitting, confirm:

- The four evidence labels are covered: Adapter Interface Code, Hash Transacao Stellar, Integracao Circle/Bridge, Payout Instructions.
- All artifacts reference the same transfer.
- `stellar_tx_hash` is present and not a placeholder.
- `payout_instruction_id` is present.
- `provider_payout_id` is present or clearly labeled as compatibility/mock evidence.
- `execution_mode` is visible: `compatibility`, `sandbox_api`, `live_api`, `proof`, `mock`, or `wise_metadata_only`.
- Redaction is applied to provider destination IDs and bank details.
- The dashboard screenshot shows the transfer detail, timeline/evidence, and payout/reconciliation sections.
- The package does not expose secrets or unmasked bank details.
