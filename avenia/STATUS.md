# Circle Integration Status

**Last verified**: 2026-06-15 23:20 UTC  
**Test run**: 26/26 passing (3 suites)

## Live Sandbox Test Results

```
=== Circle Capabilities ===
provider_name: "circle"
execution_mode: "sandbox_api"
configured: true
execution_enabled: true
blockers: []

=== LIVE Circle Sandbox Payout ===
Circle responded: "Insufficient Funds"
```

| Check | Status |
|-------|--------|
| API key authentication | ✅ Authenticated (SAND_API_KEY format) |
| Wire destination linked | ✅ WELLS FARGO BANK, NA ****0010 (ID `1e9fd0c5-db1a-4358-9822-c2a94d89cd88`) |
| Wallet exists | ✅ ID `1017459986`, active, "Your Payments Account" |
| POST /v1/businessAccount/payouts | ✅ Payload accepted by Circle API |
| Circle response | ⚠️ "Insufficient Funds" — wallet has $0 balance |
| Mock deposit endpoint | ❌ Circle sandbox mock endpoint returns 500 (Circle-side issue) |

## What's Needed to Complete the Payout

The Circle sandbox wallet has $0 balance. To fund it:

1. **Circle Developer Dashboard**: Log into `https://console.circle.com` and manually add test funds
2. **Blockchain deposit**: Send testnet USDC to the wallet's blockchain address
3. **Contact Circle**: The sandbox mock endpoint (`POST /v1/mocks/payments/wire`) is returning 500

## Env Configuration (backend/.env)

```
CIRCLE_API_KEY=SAND_API_KEY:1ba6d187bbea40a20f83b3cb5ea75c0e:d463658f8c0033b459bb2a6226141df5
CIRCLE_ENVIRONMENT=sandbox
CIRCLE_PAYOUT_DESTINATION_ID=1e9fd0c5-db1a-4358-9822-c2a94d89cd88
CIRCLE_PAYOUT_DESTINATION_TYPE=wire
CIRCLE_SOURCE_WALLET_ID=1017459986
ENABLE_REAL_PAYOUT_EXECUTION=true
```

## Adapter Code

- `backend/src/api/services/usd-payout-adapters.ts:525-690` — `CircleCompatibilityAdapter`
- Compat mode: builds payload without executing (14 tests)
- Live mode (`ENABLE_REAL_PAYOUT_EXECUTION=true`): POSTs to Circle sandbox API
- Payout endpoint: `POST https://api-sandbox.circle.com/v1/businessAccount/payouts`
- Status endpoint: `GET https://api-sandbox.circle.com/v1/businessAccount/payouts/{id}`
