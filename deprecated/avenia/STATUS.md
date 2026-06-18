# Circle Integration — Working

**Last verified**: 2026-06-16 01:12 UTC | **Status**: FULLY OPERATIONAL

## End-to-End Flow (Verified Live)

```
1. Wallet verified     → 1017459986 (active)
2. Wire destination    → WELLS FARGO BANK, NA ****0010 (complete)
3. Mock wire deposit   → HTTP 201 (settles in ~10 min in sandbox)
4. Balance confirmed   → $125,000.00 USD
5. Payout dispatched   → HTTP 201 (wire payout created)
```

## Run the E2E Test

```bash
npm run circle:e2e              # Fund + payout (handles 10-min settlement wait)
npm run circle:e2e 5000.00 50.00  # Custom amounts (fund $5000, payout $50)
```

The script:
- Checks wallet/wire status
- Creates mock wire deposit if wallet is empty
- Polls for settlement (up to 15 min)
- Dispatches wire payout once funded
- Polls for payout completion

## Adapter Code

`backend/src/api/services/usd-payout-adapters.ts:525-690`

| Mode | Trigger | Behavior |
|------|---------|----------|
| Compatibility | `ENABLE_REAL_PAYOUT_EXECUTION=false` | Builds payload, no Circle API call |
| Sandbox API | `ENABLE_REAL_PAYOUT_EXECUTION=true` + sandbox key | POSTs to Circle, executes real sandbox payout |

## Configuration

```
CIRCLE_API_KEY=SAND_API_KEY:1ba6d187bbea40a20f83b3cb5ea75c0e:d463658f8c0033b459bb2a6226141df5
CIRCLE_ENVIRONMENT=sandbox
CIRCLE_BASE_URL=https://api-sandbox.circle.com
CIRCLE_SOURCE_WALLET_ID=1017459986
CIRCLE_PAYOUT_DESTINATION_ID=1e9fd0c5-db1a-4358-9822-c2a94d89cd88
CIRCLE_PAYOUT_DESTINATION_TYPE=wire
ENABLE_REAL_PAYOUT_EXECUTION=true
```
