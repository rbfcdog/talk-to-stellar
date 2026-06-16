# Evidence 4 — Payout Instructions

## Status

Ready. A Circle sandbox payout instruction was created through the TTS application and persisted in the database.

Current database inspection on 2026-06-16:

- `public.international_payout_instructions`: 1 row
- `public.international_payout_events`: 0 rows
- active D2 transfer: `tr_d2_circle_stellar_payment_2`
- active D2 payout instruction: `circle_instruction_e0be3785-0b35-4690-9eb6-5f99b66167ab`
- active D2 Stellar hash shape: `64:hex64`
- active D2 provider: `circle`
- active D2 execution mode: `sandbox_api`
- active D2 payout status: `completed`

This means payout-instruction evidence is ready. Circle sandbox status polling observed `completed`; do not claim production bank delivery from sandbox evidence.

## Create A Circle Payout Instruction

Executed request shape after transfer reached `USDC_SETTLED`:

```bash
BACKEND_URL=http://localhost:3001
OPS_TOKEN=<internal ops token>
TRANSFER_ID=tr_d2_circle_stellar_payment_2

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

Status refresh was run after creation. Final observed result:

```text
transfer_status: PAYOUT_COMPLETED
payout_status: completed
status_history_count: 6
```

## Persisted USDC Rail Evidence

When the transfer is eligible and the Circle instruction is created, the persisted row in `public.international_payout_instructions` must show:

- `provider_name = circle`
- `execution_mode = sandbox_api` for sandbox execution, or `compatibility` for non-mutating payload evidence
- `settlement_evidence.asset_code = USDC`
- `settlement_evidence.off_ramp_source_asset_code = USDC`
- `settlement_evidence.route = PIX_BRL_TO_STELLAR_USDC_TO_USD_BANK`
- `provider_request.metadata.stellar_tx_hash` matching the transfer settlement hash
- redacted `provider_response` from Circle when execution mode is `sandbox_api`

## Evidence Export

```bash
curl -s "${BACKEND_URL}/api/transfers/tr_d2_circle_stellar_payment_2/payout-evidence" \
  -H "Authorization: Bearer ${OPS_TOKEN}" | jq > raw-payout-evidence.json

curl -s "${BACKEND_URL}/api/transfers/tr_d2_circle_stellar_payment_2/reconciliation" \
  -H "Authorization: Bearer ${OPS_TOKEN}" | jq > raw-reconciliation.json
```

Redacted export committed for review:

```text
docs/insta-awards/deliverables/deliverable-2/evidence/circle-sandbox-payout-redacted.json
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

## Reviewer Claim

Use this claim:

```text
For transfer tr_d2_circle_stellar_payment_2, TalkToStellar created a Circle sandbox USD payout instruction, linked it to Stellar USDC settlement evidence, persisted provider request/response evidence, tracked provider status to completed, and exposed a redacted reviewer evidence package.
```
