# Evidence 4 — Payout Instructions

## Status

Foundation ready. Final evidence still requires one settled transfer with a real Stellar transaction hash and a provider payout instruction row.

Current database inspection on 2026-06-15:

- `public.international_payout_instructions`: 0 rows
- `public.international_payout_events`: 0 rows
- current `public.international_transfers` rows contain mock-prefixed Stellar and PIX identifiers
- usable final D2 transfer count: 0

This means payout-instruction evidence is ready as a route/service/schema package, but final real payout evidence cannot be claimed yet.

## Create A Circle Payout Instruction

After a transfer reaches `USDC_SETTLED`:

```bash
BACKEND_URL=http://localhost:3001
OPS_TOKEN=<internal ops token>
TRANSFER_ID=<settled-transfer-id>

curl -s -X POST "${BACKEND_URL}/api/transfers/${TRANSFER_ID}/payout-instruction" \
  -H "Authorization: Bearer ${OPS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{"provider":"circle"}' | jq
```

If the destination ID should be provided per request instead of globally:

```bash
curl -s -X POST "${BACKEND_URL}/api/transfers/${TRANSFER_ID}/payout-instruction" \
  -H "Authorization: Bearer ${OPS_TOKEN}" \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "circle",
    "circleDestinationId": "<linked-circle-wire-bank-id>",
    "circleDestinationType": "wire"
  }' | jq
```

## Status Refresh

```bash
curl -s -X POST "${BACKEND_URL}/api/transfers/${TRANSFER_ID}/payout-status-refresh" \
  -H "Authorization: Bearer ${OPS_TOKEN}" | jq
```

## Evidence Export

```bash
curl -s "${BACKEND_URL}/api/transfers/${TRANSFER_ID}/payout-evidence" \
  -H "Authorization: Bearer ${OPS_TOKEN}" | jq > raw-payout-evidence.json

curl -s "${BACKEND_URL}/api/transfers/${TRANSFER_ID}/reconciliation" \
  -H "Authorization: Bearer ${OPS_TOKEN}" | jq > raw-reconciliation.json
```

## Database Proof

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

## Redaction Rule

Reviewer evidence must not expose raw API keys, account numbers, routing numbers, or raw linked destination IDs. Provider references are hashed; account and routing numbers show last four digits only.

## Final Reviewer Claim After Execution

Use this only after a real settled transfer creates a payout instruction:

```text
For the settled transfer, TalkToStellar created a USD payout instruction, linked it to Stellar settlement evidence, persisted provider request/response evidence, tracked provider status, and exposed a redacted reviewer evidence package.
```
