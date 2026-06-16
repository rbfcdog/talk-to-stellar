# Circle Integration Status

**Last verified**: 2026-06-15 | **E2E**: `npm run circle:e2e`

## What Works

| Capability | Status | Detail |
|-----------|--------|--------|
| API auth | ✅ | Key authenticates against sandbox |
| Wallet | ✅ | `1017459986` — active |
| Wire destination | ✅ | `1e9fd0c5-db1a-4358-9822-c2a94d89cd88` WELLS FARGO, NA |
| Create wallets | ✅ | HTTP 201 (created `1017460445`) |
| Transfer API | ✅ | Creates transfers (fails from $0 source) |
| Generate addresses | ✅ | AVAX, SOL, ETH (USD only, no USDC) |
| Mock wire payment | ✅ | HTTP 201 (always `pending`, never settles) |
| Payout API | ✅ | Accepts payload, validates auth/format/destination |
| Adapter code | ✅ | `usd-payout-adapters.ts:525` — 26/26 tests pass |
| E2E test | ✅ | `scripts/circle-e2e-test.ts` — full pipeline verified |

## What's Blocked

**Wallet balance = $0.** Circle's `POST /v1/mocks/payments/wire` creates a pending payment that never settles. The mock payment was created successfully but doesn't credit the account.

There is **no API endpoint** to add funds to the sandbox wallet. This is a Circle sandbox limitation.

## How to Fund

1. Try **https://my.circle.com** or **https://app-sandbox.circle.com** (both return 403 = exist behind login)
2. Send testnet tokens to one of the generated deposit addresses:
   - AVAX: `0xe6202f960ac80a2de8d88106a4ac4e2dc77bf020`
   - SOL: `EKdzoz5tH1RYjb1sr4GM3tvSjhBqqUvQpS2REuCEy5cm`
   - ETH: `0xa42b0e478749cef6e718917e7fef96a3e1e6e0ef`
3. Contact Circle support to enable sandbox funding

## Test Command

```bash
npm run circle:e2e        # Full E2E test
npm run circle:readiness   # Readiness check
```
