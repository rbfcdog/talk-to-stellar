# Transfer Record — Example (Copy-Paste Template)

> Full transfer record as it appears in the database + ops dashboard forensics view. Use this as a reference for what data is available per transfer.

---

## Transfer

```json
{
  "id": "d4e5f6a7-b8c9-4d0e-a1b2-c3d4e5f6a7b8",
  "public_ref": "TTS-2026-00042",
  "state": "RECONCILED",
  "state_version": 9,
  "source_endpoint": {
    "institution_type": "fintech_br",
    "masked_identifier": "user-****@domain.com"
  },
  "destination_endpoint": {
    "provider_type": "usd_bank",
    "country": "US",
    "masked_account": "****1234",
    "account_holder_name": "Marina Costa"
  },
  "amount_brl_in": "1000.00",
  "amount_usdc_settled": "191.04",
  "amount_usd_out_expected": "191.04",
  "failure_reason": null,
  "quote": {
    "rate": "5.2341",
    "fee_breakdown": [
      { "label": "app fee", "amount": "3.00", "currency": "BRL" },
      { "label": "etherfuse fee", "amount": "0.02", "currency": "BRL" }
    ],
    "expires_at": "2026-06-13T14:27:08Z",
    "quoted_at": "2026-06-13T14:22:08Z",
    "source": "stellar_dex_testnet"
  },
  "pix": {
    "charge_id": "chg_abc123",
    "e2e_id": "E2E-1234567890",
    "paid_at": "2026-06-13T14:24:10Z",
    "payer_masked": "***.123.456-**",
    "provider": "etherfuse_sandbox"
  },
  "stellar": {
    "tx_hash": "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0",
    "ledger": 123456,
    "network": "testnet",
    "settled_at": "2026-06-13T14:24:28Z",
    "asset": "USDC",
    "path_used": ["TESOURO", "USDC"]
  },
  "payout": {
    "routing_status": "instructed",
    "provider_hint": "usd_bank",
    "reference_id": "PO-2026-0042",
    "same_name_check": "passed"
  },
  "reconciliation": {
    "amounts_match": true,
    "fees_total": [
      { "label": "app fee", "amount": "3.00", "currency": "BRL" },
      { "label": "etherfuse fee", "amount": "0.02", "currency": "BRL" }
    ],
    "discrepancies": [],
    "reconciled_by": "system",
    "reconciled_at": "2026-06-13T14:25:01Z"
  },
  "created_at": "2026-06-13T14:22:01Z",
  "updated_at": "2026-06-13T14:25:01Z"
}
```

---

## Lifecycle Events (transfer_events)

```json
[
  {
    "id": "evt-0001",
    "transfer_id": "d4e5f6a7-b8c9-4d0e-a1b2-c3d4e5f6a7b8",
    "from_state": null,
    "to_state": "CREATED",
    "event_type": "transfer_created",
    "payload": {
      "amount_brl_in": "1000.00",
      "source_institution": "fintech_br",
      "destination_country": "US"
    },
    "actor": "api",
    "correlation_id": "corr-0001",
    "created_at": "2026-06-13T14:22:01Z"
  },
  {
    "id": "evt-0002",
    "transfer_id": "d4e5f6a7-b8c9-4d0e-a1b2-c3d4e5f6a7b8",
    "from_state": "CREATED",
    "to_state": "QUOTED",
    "event_type": "quote_attached",
    "payload": {
      "rate": "5.2341",
      "fee_breakdown": [
        { "label": "app fee", "amount": "3.00", "currency": "BRL" }
      ],
      "source": "stellar_dex_testnet"
    },
    "actor": "system",
    "correlation_id": "corr-0002",
    "created_at": "2026-06-13T14:22:08Z"
  },
  {
    "id": "evt-0003",
    "transfer_id": "d4e5f6a7-b8c9-4d0e-a1b2-c3d4e5f6a7b8",
    "from_state": "QUOTED",
    "to_state": "PIX_CHARGE_ISSUED",
    "event_type": "pix_charge_issued",
    "payload": {
      "charge_id": "chg_abc123",
      "provider": "etherfuse_sandbox"
    },
    "actor": "whatsapp_bot",
    "correlation_id": "corr-0003",
    "created_at": "2026-06-13T14:22:32Z"
  },
  {
    "id": "evt-0004",
    "transfer_id": "d4e5f6a7-b8c9-4d0e-a1b2-c3d4e5f6a7b8",
    "from_state": "PIX_CHARGE_ISSUED",
    "to_state": "PIX_FUNDED",
    "event_type": "pix_funding_confirmed",
    "payload": {
      "e2e_id": "E2E-1234567890",
      "paid_at": "2026-06-13T14:24:10Z",
      "amount_brl": "1000.00"
    },
    "actor": "webhook:etherfuse",
    "correlation_id": "corr-0004",
    "created_at": "2026-06-13T14:24:10Z"
  },
  {
    "id": "evt-0005",
    "transfer_id": "d4e5f6a7-b8c9-4d0e-a1b2-c3d4e5f6a7b8",
    "from_state": "PIX_FUNDED",
    "to_state": "CONVERTING",
    "event_type": "conversion_started",
    "payload": {
      "source_asset": "TESOURO",
      "destination_asset": "USDC"
    },
    "actor": "system",
    "correlation_id": "corr-0005",
    "created_at": "2026-06-13T14:24:15Z"
  },
  {
    "id": "evt-0006",
    "transfer_id": "d4e5f6a7-b8c9-4d0e-a1b2-c3d4e5f6a7b8",
    "from_state": "CONVERTING",
    "to_state": "STELLAR_SETTLED",
    "event_type": "stellar_settled",
    "payload": {
      "tx_hash": "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0",
      "ledger": 123456,
      "network": "testnet",
      "amount_usdc": "191.04",
      "path": ["TESOURO", "USDC"]
    },
    "actor": "poller:stellar",
    "correlation_id": "corr-0006",
    "created_at": "2026-06-13T14:24:28Z"
  },
  {
    "id": "evt-0007",
    "transfer_id": "d4e5f6a7-b8c9-4d0e-a1b2-c3d4e5f6a7b8",
    "from_state": "STELLAR_SETTLED",
    "to_state": "PAYOUT_ROUTING",
    "event_type": "payout_routing_started",
    "payload": {
      "provider": "usd_bank",
      "country": "US",
      "same_name_check": "passed"
    },
    "actor": "system",
    "correlation_id": "corr-0007",
    "created_at": "2026-06-13T14:24:30Z"
  },
  {
    "id": "evt-0008",
    "transfer_id": "d4e5f6a7-b8c9-4d0e-a1b2-c3d4e5f6a7b8",
    "from_state": "PAYOUT_ROUTING",
    "to_state": "PAYOUT_INSTRUCTED",
    "event_type": "payout_instructed",
    "payload": {
      "reference_id": "PO-2026-0042",
      "provider": "usd_bank"
    },
    "actor": "api",
    "correlation_id": "corr-0008",
    "created_at": "2026-06-13T14:24:45Z"
  },
  {
    "id": "evt-0009",
    "transfer_id": "d4e5f6a7-b8c9-4d0e-a1b2-c3d4e5f6a7b8",
    "from_state": "PAYOUT_INSTRUCTED",
    "to_state": "RECONCILED",
    "event_type": "reconciled",
    "payload": {
      "amounts_match": true,
      "discrepancies": [],
      "fees_total": [
        { "label": "app fee", "amount": "3.00", "currency": "BRL" },
        { "label": "etherfuse fee", "amount": "0.02", "currency": "BRL" }
      ],
      "reconciled_by": "system"
    },
    "actor": "system",
    "correlation_id": "corr-0009",
    "created_at": "2026-06-13T14:25:01Z"
  }
]
```

---

## Unified Ledger Row (ops_history)

This transfer also appears in the unified ops ledger as:

| Field | Value |
|-------|-------|
| id | `d4e5f6a7-...` |
| source | `transfers` |
| source_record_id | `d4e5f6a7-b8c9-4d0e-a1b2-c3d4e5f6a7b8` |
| lifecycle_transfer_id | `d4e5f6a7-b8c9-4d0e-a1b2-c3d4e5f6a7b8` |
| reference | `TTS-2026-00042` |
| kind | `BRL → USDC → USD payout` |
| status | `RECONCILED` |
| category | `completed` |
| route | `fintech_br → stellar_testnet → usd_bank (US)` |
| source_amount | `1000.00` |
| source_asset | `BRL` |
| destination_amount | `191.04` |
| destination_asset | `USDC` |
| transaction_hash | `a1b2c3d4e5f6...` |
| external_reference | `PO-2026-0042` |
| fee_amount | `3.00` |
| fee_asset | `BRL` |
| fee_label | `app fee` |
| created_at | `2026-06-13T14:22:01Z` |
| updated_at | `2026-06-13T14:25:01Z` |

---

## How to Get This Data

### Live from the Dashboard
1. Go to `/ops` → click any transfer row
2. Expand **Raw Transfer Record** → copy entire block

### From the API
```bash
curl -H "Authorization: Bearer <token>" \
  http://localhost:3001/api/transfers/<transfer_id> | jq
```

### From Supabase
```sql
-- Get transfer
SELECT * FROM transfers WHERE public_ref = 'TTS-2026-00042';

-- Get events (ordered)
SELECT * FROM transfer_events
WHERE transfer_id = 'd4e5f6a7-b8c9-4d0e-a1b2-c3d4e5f6a7b8'
ORDER BY created_at ASC;
```
