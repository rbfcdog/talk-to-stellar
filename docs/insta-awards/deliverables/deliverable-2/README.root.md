# Deliverable 2 — USD Delivery & Payout Coordination Layer

**Last verified**: 2026-06-16 | **Circle**: LIVE sandbox execution | **Tests**: 26/26 passing

## Scope

Provider-agnostic payout adapter layer that turns completed Stellar USDC settlement events into USD payout instructions for bank-account payout workflows.

## Evidence Checklist

| Evidence | Status | Artifact |
|----------|--------|----------|
| Adapter Interface Code | ✅ Ready | `evidence/adapter-interface-code.md`, `usd-payout-adapters.ts` |
| Hash Transacao Stellar | ✅ Template ready (real tx pending transfer run) | `evidence/stellar-transaction-hash.md` |
| Integracao Circle/Bridge | ✅ Circle live sandbox verified | `evidence/circle-bridge-integration.md` |
| Payout Instructions | ✅ Ready | `evidence/payout-instructions.md` |

## Circle Integration — Live Sandbox Verified

```
POST https://api-sandbox.circle.com/v1/businessAccount/payouts
→ HTTP 201  payout_id: a17b4923-3dd2-44da-ac06-e8cd070d8484
→ Wallet: 1017459986
→ Wire: WELLS FARGO BANK, NA ****0010
→ Status: pending → completed
```

**Full E2E test**: `npm run circle:e2e` — funds wallet via mock wire, polls for settlement, dispatches payout.

## Implementation Map

| What | Where |
|------|-------|
| Adapter interface + providers | `backend/src/api/services/usd-payout-adapters.ts` |
| Circle readiness check | `backend/scripts/circle-payout-readiness.ts` |
| E2E test | `scripts/circle-e2e-test.ts` |
| Payout coordination | `backend/src/api/services/usd-payout-coordination.service.ts` |
| HTTP routes | `backend/src/api/routes/international-transfers.router.ts` |
| Schema | `backend/migrations/20260613_00_full_schema.sql` |

## Verification

```bash
npm --prefix backend test -- --runInBand tests/payout-adapter-contract.test.ts
npm --prefix backend test -- --runInBand tests/international-transfer.routes.test.ts
npm --prefix backend run build
npm run circle:e2e
npm run circle:readiness
```
