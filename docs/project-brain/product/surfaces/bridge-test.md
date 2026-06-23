# Bridge Test Page — Surface Audit

> **Living document.** Updated when `/bridge-test` changes or Bridge mainnet testing failures recur.

## Flow

```
Operator opens /bridge-test
  -> Next.js renders BridgeTestClient
  -> Client sends same-origin requests to /api/bridge
  -> frontend/app/api/bridge/route.ts forwards x-bridge-path to the backend
  -> Backend Bridge routes call Bridge.xyz service methods
  -> Screen manages customers, KYC links, wallets, virtual accounts, activity, balances, liquidation addresses, Bridge-to-Stellar connections, and transfers
```

## Current Behavior

- Route: `/bridge-test`.
- Purpose: operator-only Bridge mainnet test console for onboarding, wallets, virtual accounts, and money-movement setup checks.
- Uses `BRIDGE_BASE = "/api/bridge"` and passes the backend path through the `x-bridge-path` header.
- Virtual-account cards now fetch balance by virtual-account id, not destination address.
- Bridge VA activity is read from the provider `/history` endpoint; `funds_received` is preferred over `payment_processed` per deposit id to avoid double-counting.
- The Bridge-to-Stellar connection map shows each virtual account, its linked Bridge destination wallet, wallet balance, and the active Stellar wallet.
- Operators can create a USD virtual account that settles directly to the selected Stellar wallet, or initiate a Bridge-wallet-to-Stellar USDC transfer when a Bridge wallet balance exists.

## Known Issues

### Fixed

- **Virtual account wire balance missing** (#58): Fixed by `b067970`. The screen now calls `/customers/:id/virtual-accounts/:virtualAccountId/balance`; the backend combines live VA balance fields, destination wallet balance matches by Bridge wallet id, and `funds_received` activity totals.
- **Bridge VA balance provider-path drift** (#59): Fixed by `3087e4c`. The backend now uses Bridge's customer-scoped virtual-account lookup and `/history` activity endpoint, and it can still return received wire totals when destination wallet lookup emits `Bridge wallet not found`.
- **Bridge virtual-account wallet connection missing** (#64): Fixed by `34b27a7`. The screen now renders a mainnet VA -> Bridge wallet -> Stellar wallet connection map, direct USD-to-Stellar VA creation, and a Bridge-wallet-to-Stellar transfer action.

### Still Open

- If a recent wire is missing, first check Bridge activity latency before assuming a TalkToStellar balance bug.

## Key Files

- `frontend/app/bridge-test/page.tsx` — route entry point.
- `frontend/app/bridge-test/bridge-test-client.tsx` — operator UI, virtual-account balance render, Bridge-to-Stellar connection map, and `x-bridge-path` calls.
- `frontend/app/api/bridge/route.ts` — same-origin Bridge proxy.
- `backend/src/api/routes/bridge.router.ts` — Bridge route map, including VA balance, connection, and Bridge-wallet-to-Stellar transfer endpoints.
- `backend/src/api/controllers/bridge.controller.ts` — customer, wallet, VA, transfer, VA balance, and connection handlers.
- `backend/src/integrations/bridge/service.ts` — Bridge.xyz client calls.
- `backend/src/integrations/bridge/types.ts` — Bridge response and balance/activity types.

## Endpoints

| Purpose | Method | Frontend proxy path | Backend route |
|---------|--------|---------------------|---------------|
| Screen | GET | `/bridge-test` | N/A |
| Bridge proxy | Any | `/api/bridge` + `x-bridge-path` | `/api/bridge/*` |
| Cached VAs | GET | `/api/bridge` + `/customers/:id/virtual-accounts/cached` | `/api/bridge/customers/:id/virtual-accounts/cached` |
| Live VAs | GET | `/api/bridge` + `/customers/:id/virtual-accounts` | `/api/bridge/customers/:id/virtual-accounts` |
| VA activity | GET | `/api/bridge` + `/customers/:id/virtual-accounts/:virtualAccountId/activity` | `/api/bridge/customers/:id/virtual-accounts/:virtualAccountId/activity` → Bridge `/history` |
| VA balance | GET | `/api/bridge` + `/customers/:id/virtual-accounts/:virtualAccountId/balance` | `/api/bridge/customers/:id/virtual-accounts/:virtualAccountId/balance` |
| VA connection map | GET | `/api/bridge` + `/customers/:id/virtual-accounts/connections?stellar_address=...` | `/api/bridge/customers/:id/virtual-accounts/connections` |
| Wallet balances | GET | `/api/bridge` + `/wallets/balances` | `/api/bridge/wallets/balances` |
| Bridge wallet to Stellar | POST | `/api/bridge` + `/customers/:id/wallets/:walletId/transfer-to-stellar` | `/api/bridge/customers/:id/wallets/:walletId/transfer-to-stellar` |

## Latest Verification

2026-06-23:

- `npm --prefix backend test -- --runInBand tests/bridge.routes.test.ts` passed.
- `npm --prefix backend test -- --runInBand tests/bridge.routes.test.ts -t "summarizes virtual account"` passed.
- `npm --prefix backend test -- --runInBand tests/bridge.routes.test.ts tests/bridge.service.test.ts -t "virtual account"` passed.
- `npm --prefix backend run build` passed.
- `npm --prefix frontend run build` passed and listed `/bridge-test`.
