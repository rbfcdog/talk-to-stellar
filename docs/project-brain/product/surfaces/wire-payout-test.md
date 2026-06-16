# Wire Payout Test Screen — Surface Audit

> **Living document.** Updated when the Circle wire payout test surface changes.

## Flow

```
Operator opens /wire-test
  -> Uses the default D2 transfer or enters another transfer_id
  -> Frontend loads /api/transfers/payout-providers through the Next.js proxy
  -> Frontend loads /api/transfers/:id/payout-evidence through the Next.js proxy
  -> Operator pastes INTERNATIONAL_TRANSFER_OPS_SECRET when a protected action is needed
  -> Create wire instruction calls POST /api/transfers/:id/payout-instruction with provider=circle
  -> Refresh wire status calls POST /api/transfers/:id/payout-status-refresh
  -> Screen displays redacted payout evidence, USDC rail metadata, Circle readiness, and Stellar testnet link
```

## Current Behavior

- Operator-facing frontend screen for testing Circle wire payout coordination from the browser.
- Route: `/wire-test`.
- Default transfer: `tr_d2_circle_stellar_payment_2`.
- Uses the existing same-origin transfer API proxy, so Circle API keys and bank-account configuration remain backend-only.
- Stores the pasted ops secret only in browser `sessionStorage` under `tts-wire-test-ops-secret`.
- Reads are available without ops secret: provider readiness and redacted payout evidence.
- Mutations require backend ops authorization: create/replay Circle payout instruction and refresh provider payout status.
- The evidence panel intentionally renders redacted payout evidence, hashed provider references, final-four bank fields, USDC rail metadata, and the Stellar testnet transaction link.

## Known Issues

- This screen proves instruction creation and status polling against Circle sandbox. It does not prove final bank delivery until the provider status reaches a terminal completed state.
- It depends on `BACKEND_URL` or `NEXT_PUBLIC_BACKEND_URL` resolving through `frontend/lib/backend-proxy.ts`; local default is `http://localhost:3001`.

## Key Files

- `frontend/app/wire-test/page.tsx` — route entry point.
- `frontend/app/wire-test/wire-test-client.tsx` — test controls, endpoint list, evidence rendering, and protected action calls.
- `frontend/app/api/transfers/route.ts` — frontend proxy to backend transfer API.
- `frontend/app/api/transfers/[...path]/route.ts` — frontend proxy for payout evidence and action paths.
- `frontend/lib/backend-proxy.ts` — forwards ops authorization headers to the backend.
- `backend/src/api/controllers/international-transfers.controller.ts` — payout provider, payout evidence, payout instruction, and payout refresh handlers.
- `backend/src/api/services/international-transfer.service.ts` — Circle payout orchestration and persistence boundary.
- `backend/src/api/services/usd-payout-adapters.ts` — provider adapter interface and Circle adapter.
- `backend/src/api/services/usd-payout-coordination.service.ts` — redacted reviewer evidence contract.

## Endpoints

| Purpose | Method | Frontend path |
|---------|--------|---------------|
| Screen | GET | `/wire-test` |
| Provider readiness | GET | `/api/transfers/payout-providers` |
| Redacted payout evidence | GET | `/api/transfers/:id/payout-evidence` |
| Create/replay Circle wire instruction | POST | `/api/transfers/:id/payout-instruction` |
| Refresh Circle payout status | POST | `/api/transfers/:id/payout-status-refresh` |
