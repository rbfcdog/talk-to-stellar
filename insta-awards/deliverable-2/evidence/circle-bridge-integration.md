# Evidence 3 — Circle / Bridge Integration

**Last verified**: 2026-06-16 | **Circle status**: LIVE, END-TO-END VERIFIED

## Circle Mint Sandbox — Full Integration

### Live Execution Verified

```
POST https://api-sandbox.circle.com/v1/businessAccount/payouts
→ HTTP 201 — Wire payout created
→ Status: pending → completed
→ Amount: $10.00 USD
→ Destination: WELLS FARGO BANK, NA ****0010
→ Source wallet: 1017459986
```

### Integration Details

| Component | Status | Detail |
|-----------|--------|--------|
| API authentication | ✅ | SAND_API_KEY format, authenticates against sandbox |
| Wallet | ✅ | `1017459986` — active, custody, "Your Payments Account" |
| Wire destination | ✅ | `1e9fd0c5-db1a-4358-9822-c2a94d89cd88` — WELLS FARGO BANK, NA |
| Mock wire deposit | ✅ | `POST /v1/mocks/payments/wire` — settles in ~10 min |
| Payout creation | ✅ | `POST /v1/businessAccount/payouts` — HTTP 201 |
| Payout polling | ✅ | `GET /v1/payouts/{id}` — status: pending → complete |
| Adapter code | ✅ | `backend/src/api/services/usd-payout-adapters.ts:525-690` |
| Adapter tests | ✅ | 26/26 passing (3 suites) |
| E2E test script | ✅ | `npm run circle:e2e` — full pipeline verification |

### Circle Wire Destination Evidence

| Field | Value |
|-------|-------|
| Provider | Circle Mint sandbox |
| Bank | WELLS FARGO BANK, NA |
| Account | ****0010 |
| Routing | 121000248 |
| Destination ID (last 4) | cd88 |
| Status | complete |
| Virtual Account | enabled |

### Payout Payload (Redacted)

```json
{
  "idempotencyKey": "<uuid>",
  "destination": { "type": "wire", "id": "<redacted>" },
  "amount": { "amount": "10.00", "currency": "USD" },
  "source": { "id": "1017459986", "type": "wallet" },
  "metadata": { "beneficiaryEmail": "team.talktostellar@gmail.com" }
}
```

### Test Commands

```bash
# Full E2E: fund wallet + create payout + verify completion
npm run circle:e2e

# Custom amounts
npm run circle:e2e 5000.00 50.00

# Readiness check only
npm run circle:readiness
```

## Bridge Integration

Bridge remains compatibility-only. The adapter (`CompatibilityPayoutAdapter` base class at `usd-payout-adapters.ts:340`) builds correct Bridge payload shapes but does not execute live payouts — Bridge provider access is pending.

## Provider Adapter Architecture

```
PayoutProviderAdapter (interface)
├── MockPayoutAdapter          — test/stub payouts
├── EtherfusePayoutAdapter    — Etherfuse sandbox  
├── CircleCompatibilityAdapter — Circle Mint sandbox (LIVE)
└── BridgeCompatibilityAdapter — Bridge (compatibility only)

Factory: getPayoutProviderAdapter('circle'|'bridge'|'etherfuse'|'mock')
```
