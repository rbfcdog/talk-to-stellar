# Bridge Test Page — Surface Audit

> **Living document.** Updated when `/bridge-test` changes or Bridge mainnet testing failures recur.

## Flow

```
Operator opens /bridge-test
  -> Next.js renders BridgeTestClient
  -> Client sends same-origin requests to /api/bridge
  -> frontend/app/api/bridge/route.ts forwards x-bridge-path to the backend
  -> Backend Bridge routes call Bridge.xyz service methods
  -> Screen manages customers, KYC links, wallets, virtual accounts, activity, balances, liquidation addresses, and transfers
```

## Current Behavior

- Route: `/bridge-test`.
- Purpose: operator-only Bridge mainnet test console for onboarding, wallets, virtual accounts, and money-movement setup checks.
- Uses `BRIDGE_BASE = "/api/bridge"` and passes the backend path through the `x-bridge-path` header.
- Virtual-account cards now fetch balance by virtual-account id, not destination address.

## Known Issues

### Fixed

- **Virtual account wire balance missing** (#58): Fixed by `b067970`. The screen now calls `/customers/:id/virtual-accounts/:virtualAccountId/balance`; the backend combines live VA balance fields, destination wallet balance matches by Bridge wallet id, and `funds_received` activity totals.

### Still Open

- If a recent wire is missing, first check Bridge activity latency before assuming a TalkToStellar balance bug.

## Key Files

- `frontend/app/bridge-test/page.tsx` — route entry point.
- `frontend/app/bridge-test/bridge-test-client.tsx` — operator UI, virtual-account balance render, and `x-bridge-path` calls.
- `frontend/app/api/bridge/route.ts` — same-origin Bridge proxy.
- `backend/src/api/routes/bridge.router.ts` — Bridge route map, including the VA balance endpoint.
- `backend/src/api/controllers/bridge.controller.ts` — customer, wallet, VA, transfer, and VA balance handlers.
- `backend/src/integrations/bridge/service.ts` — Bridge.xyz client calls.
- `backend/src/integrations/bridge/types.ts` — Bridge response and balance/activity types.

## Endpoints

| Purpose | Method | Frontend proxy path | Backend route |
|---------|--------|---------------------|---------------|
| Screen | GET | `/bridge-test` | N/A |
| Bridge proxy | Any | `/api/bridge` + `x-bridge-path` | `/api/bridge/*` |
| Cached VAs | GET | `/api/bridge` + `/customers/:id/virtual-accounts/cached` | `/api/bridge/customers/:id/virtual-accounts/cached` |
| Live VAs | GET | `/api/bridge` + `/customers/:id/virtual-accounts` | `/api/bridge/customers/:id/virtual-accounts` |
| VA activity | GET | `/api/bridge` + `/customers/:id/virtual-accounts/:virtualAccountId/activity` | `/api/bridge/customers/:id/virtual-accounts/:virtualAccountId/activity` |
| VA balance | GET | `/api/bridge` + `/customers/:id/virtual-accounts/:virtualAccountId/balance` | `/api/bridge/customers/:id/virtual-accounts/:virtualAccountId/balance` |
| Wallet balances | GET | `/api/bridge` + `/wallets/balances` | `/api/bridge/wallets/balances` |

## Latest Verification

2026-06-22:

- `npm --prefix backend test -- --runInBand tests/bridge.routes.test.ts -t "summarizes virtual account"` passed.
- `npm --prefix backend run build` passed.
- `npm --prefix frontend run build` passed and listed `/bridge-test`.
