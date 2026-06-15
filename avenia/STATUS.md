# Circle Integration Status

**Last verified**: 2026-06-15 | **Tests**: 26/26 passing | **E2E**: script verified

## Live Sandbox Verification

```
Wallet     : 1017459986 (active, custody)
Wire       : 1e9fd0c5-db1a-4358-9822-c2a94d89cd88 (WELLS FARGO BANK, NA ****0010)
API auth   : PASS (SAND_API_KEY authenticated)
Payout req : PASS (payload accepted, Circle responds with code 5006)
```

## End-to-End Test

```bash
npx tsx scripts/circle-e2e-test.ts [amount]
```

Produces:
```
PIPELINE
  Wallet        : PASS
  Wire linked   : PASS
  API auth      : PASS
  Payload       : PASS
  Circle API    : PASS (processed request)
  Wallet funded : FAIL ($0)
  Payout sent   : PENDING (needs funding)
```

## What's Needed

The Circle sandbox wallet has $0. To fund it:

1. Log into Circle at https://login.circle.com
2. Navigate to Sandbox Console
3. Add test funds to wallet `1017459986`
4. Re-run `npx tsx scripts/circle-e2e-test.ts`

Alternatively: send testnet USD to the AVAX deposit address:
```
0xa42b0e478749cef6e718917e7fef96a3e1e6e0ef
```

## Adapter Code

- `backend/src/api/services/usd-payout-adapters.ts:525-690` — CircleCompatibilityAdapter
- Compat mode: builds payload without executing
- Live mode (`ENABLE_REAL_PAYOUT_EXECUTION=true`): POSTs to Circle sandbox
- Idempotency key fix: uses `crypto.randomUUID()` (Circle requires UUID format)
