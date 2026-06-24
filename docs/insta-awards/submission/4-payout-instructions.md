# 4. Payout Instructions

A transfer goes through these states: `USDC_SETTLED → PAYOUT_ROUTING → PAYOUT_INSTRUCTED → RECONCILED`.

## Creating an instruction

```
POST /api/transfers/:id/payout-instruction
{ "provider": "circle" }
```

This triggers the adapter. If Circle sandbox execution is enabled, it fires a real API call. The response is persisted in `international_payout_instructions`.

## Evidence endpoints

```
GET  /api/transfers/:id/payout-evidence
GET  /api/transfers/:id/reconciliation
POST /api/transfers/:id/payout-status-refresh
```

The evidence endpoint returns a checklist (4 items: adapter code, tx hash, Circle/Bridge, payout instructions), rail info (PIX → Stellar USDC → USD bank wire), settlement evidence, identity check status, instruction details, status history, and destination metadata.

## Database

```sql
-- Payout row
select id, transfer_id, provider_name, provider_payout_id,
       status, execution_mode, amount_usd, created_at
from public.international_payout_instructions
where transfer_id = '<transfer-id>';

-- Status events
select id, provider_name, provider_event_id, status, event_type
from public.international_payout_events
where transfer_id = '<transfer-id>';
```

## Redaction

All exported evidence is redacted. Bank account numbers show only last 4 digits. Routing numbers are truncated. API keys and raw destination IDs stay on the backend. What the reviewer sees is clean and safe to share.
