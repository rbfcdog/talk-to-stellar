# 3. Circle / Bridge Integration

## Circle

We have a live Circle Mint sandbox account. Wallet `1017459986`, wire destination linked to BANK OF AMERICA, NA (account ending in 1098). The API key authenticates against `https://api-sandbox.circle.com`.

The adapter code is at `backend/src/api/services/usd-payout-adapters.ts` lines 525-690 (`CircleCompatibilityAdapter`). It builds the payout payload and POSTs to `/v1/businessAccount/payouts` when `ENABLE_REAL_PAYOUT_EXECUTION=true`. In compatibility mode it just builds the payload without hitting Circle.

We tested it end-to-end: funded the wallet via Circle's mock wire endpoint, waited for settlement (~10 min in sandbox), then dispatched a $10 wire payout. Circle returned HTTP 201 with a payout ID, and the payout completed. All verifiable through the Circle API.

There's an E2E test script at `scripts/circle-e2e-test.ts` that automates the whole flow: `npm run circle:e2e`.

## Bridge

The Bridge adapter exists in the same file (extends `CompatibilityPayoutAdapter`). It builds correct Bridge-shaped payloads but doesn't execute live payouts — we don't have Bridge credentials yet. It'll work the same way as Circle once we do.

## Wire test page

There's a frontend page at `/wire-test` with a one-button "Send wire" flow. Enter an amount, paste the ops secret, click Send. It calls the backend, the backend calls Circle, and the response panel shows the payout ID, status, and raw Circle JSON. Credentials are hardcoded in the backend endpoint so it works in any environment.
