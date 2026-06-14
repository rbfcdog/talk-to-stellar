# Orchestration Logs — Transfer Lifecycle Evidence

> Copy-paste ready. Generated from the TransferOrchestrator event log. Each event is append-only, immutable, and ordered by `created_at`.

---

## Event Types

| Event | From | To | Actor | Description |
|-------|------|----|-------|-------------|
| `transfer_created` | — | `CREATED` | `api` / `whatsapp_bot` / `telegram_bot` | Transfer intent created with BRL amount, source, destination |
| `quote_attached` | `CREATED` | `QUOTED` | `api` / `system` | BRL→USDC quote frozen with rate, fees, TTL |
| `pix_charge_issued` | `QUOTED` | `PIX_CHARGE_ISSUED` | `api` / `whatsapp_bot` | PIX charge/cobrança created via Etherfuse |
| `pix_funding_confirmed` | `PIX_CHARGE_ISSUED` | `PIX_FUNDED` | `webhook:etherfuse` | Etherfuse confirms PIX payment received |
| `conversion_started` | `PIX_FUNDED` | `CONVERTING` | `system` | BRL→USDC pathfinding begins |
| `stellar_settled` | `CONVERTING` | `STELLAR_SETTLED` | `poller:stellar` / `api` | Horizon confirms settlement tx |
| `payout_routing_started` | `STELLAR_SETTLED` | `PAYOUT_ROUTING` | `system` | USD payout provider selected |
| `payout_instructed` | `PAYOUT_ROUTING` | `PAYOUT_INSTRUCTED` | `api` | Payout instruction sent to provider |
| `reconciled` | `PAYOUT_INSTRUCTED` | `RECONCILED` | `system` / `api` | Amounts matched, reconciliation complete |
| `failed` | _any active_ | `FAILED` | `system` / `webhook` | Irrecoverable error |
| `refund_required` | _any active_ | `REFUND_REQUIRED` | `system` | Refund needed |
| `idempotent_replay` | _same state_ | _same state_ | `api` | Replay detected, no state change |

---

## Example: Full Lifecycle Event Log

Transfer: `TTS-2026-00042` — BRL 1,000.00 → USDC → Payout to US bank

```
Event #1  | 2026-06-13T14:22:01Z  | api
  transfer_created
  START → CREATED
  BRL in: 1000.00 | Source: fintech_br | Destination: usd_bank (US)

Event #2  | 2026-06-13T14:22:08Z  | system
  quote_attached
  CREATED → QUOTED
  Rate: 5.2341 BRL/USD | Fees: R$3.00 (app) + R$0.02 (provider)
  Expires: 2026-06-13T14:27:08Z

Event #3  | 2026-06-13T14:22:32Z  | whatsapp_bot
  pix_charge_issued
  QUOTED → PIX_CHARGE_ISSUED
  PIX charge: e2e_id=abc123 | BrCode generated

Event #4  | 2026-06-13T14:24:10Z  | webhook:etherfuse
  pix_funding_confirmed
  PIX_CHARGE_ISSUED → PIX_FUNDED
  PIX paid at 14:24:10 | Amount: R$1,000.00

Event #5  | 2026-06-13T14:24:15Z  | system
  conversion_started
  PIX_FUNDED → CONVERTING
  Path: TESOURO → USDC via Stellar DEX

Event #6  | 2026-06-13T14:24:28Z  | poller:stellar
  stellar_settled
  CONVERTING → STELLAR_SETTLED
  TX: a1b2c3d4e5f6... | Ledger: 123456 | USDC: 191.04

Event #7  | 2026-06-13T14:24:30Z  | system
  payout_routing_started
  STELLAR_SETTLED → PAYOUT_ROUTING
  Provider: usd_bank | Same-name check: passed

Event #8  | 2026-06-13T14:24:45Z  | api
  payout_instructed
  PAYOUT_ROUTING → PAYOUT_INSTRUCTED
  Reference: PO-2026-0042 | Status: pending

Event #9  | 2026-06-13T14:25:01Z  | system
  reconciled
  PAYOUT_INSTRUCTED → RECONCILED
  Amounts match: Yes | Discrepancies: None
  Fees: R$3.00 (app fee) + R$0.02 (provider) = R$3.02 total
```

---

## How to Export Orchestration Logs

### From the Ops Dashboard
1. Open `/ops` (authenticated)
2. Click any transfer row → opens forensics detail
3. Scroll to **Raw Transfer Record** → expand → copy JSON

### From the API
```bash
# List transfers
curl -H "Authorization: Bearer <token>" http://localhost:3001/api/transfers

# Get single transfer with events
curl -H "Authorization: Bearer <token>" http://localhost:3001/api/transfers/<id>
```

### From the CLI
```bash
cd backend
npx ts-node src/scripts/export-transfer-log.ts <transfer_id>
```

### Export all history as JSON
```bash
curl -H "Authorization: Bearer <token>" "http://localhost:3001/api/ops/history" | jq
```

---

## Event Payload Schema

Every `transfer_event` row has this shape:

```json
{
  "id": "uuid",
  "transfer_id": "uuid",
  "from_state": "CREATED | null",
  "to_state": "QUOTED",
  "event_type": "quote_attached",
  "payload": {
    "rate": "5.2341",
    "fee_breakdown": [
      { "label": "app fee", "amount": "3.00", "currency": "BRL" }
    ],
    "quoted_at": "2026-06-13T14:22:08Z"
  },
  "actor": "system",
  "correlation_id": "uuid",
  "created_at": "2026-06-13T14:22:08Z"
}
```
