# 4. Payout Instructions

**Repo**: https://github.com/rbfcdog/talk-to-stellar — `main` — `bf9c55a`

## Flow

```
Transfer → USDC_SETTLED → PAYOUT_ROUTING → PAYOUT_INSTRUCTED → RECONCILED
```

## API

```
POST /api/transfers/:id/payout-instruction
Body: { "provider": "circle" }

GET  /api/transfers/:id/payout-evidence

POST /api/transfers/:id/payout-status-refresh

GET  /api/transfers/:id/reconciliation
```

## Database

```sql
-- Payout instruction created
SELECT id, transfer_id, provider_name, provider_payout_id,
       status, execution_mode, amount_usd, created_at
FROM public.international_payout_instructions
WHERE transfer_id = '<transfer-id>';

-- Status events
SELECT id, provider_name, provider_event_id, status, event_type
FROM public.international_payout_events
WHERE transfer_id = '<transfer-id>';
```

## Redaction

- Provider destination IDs: hashed, last-4 only
- Account numbers: `****0010`
- Routing numbers: `****0248`
- API keys: never stored

## Claim

For a settled Stellar USDC transfer, TalkToStellar created a USD payout instruction via Circle Mint sandbox, persisted provider request/response evidence, tracked status through the provider lifecycle, and exposed a redacted reviewer evidence package via `/api/transfers/:id/payout-evidence`.
