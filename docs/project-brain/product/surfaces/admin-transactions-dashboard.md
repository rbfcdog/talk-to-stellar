# Admin Transactions Dashboard — Surface Audit

> **Living document.** Updated when admin transfer visibility or controls change.

## Flow

```
Operator opens /admin/transactions
  -> Enters OPS_DASHBOARD_TOKEN or TRANSFER_API_TOKEN
  -> Frontend calls /api/transfers through the Next.js backend proxy
  -> Backend reads normalized transfers + transfer_events from Supabase
  -> Operator filters/searches transfers
  -> Operator selects a row
  -> Detail pane shows lifecycle events, PIX evidence, Stellar settlement, payout routing, reconciliation, and raw Transfer Record JSON

Operator opens /ops
  -> Enters OPS_DASHBOARD_TOKEN or TRANSFER_API_TOKEN
  -> Backend reads transfers + international_transfers + operations + payment_logs
  -> Operator filters/searches/sorts/paginates the complete database transaction history
  -> Normalized transfer rows link to their lifecycle detail page
```

## Current Behavior

- Read-only operational console for the D1 normalized transfer lifecycle.
- Covers every state in `TransferStateMachine.STATES`.
- Uses the token-protected backend transfer API mounted at `/api/transfers`; list/detail read the normalized D1 `transfers` and `transfer_events` records through `transferRepository`.
- Stores the pasted token only in browser session storage.
- Forwards `Authorization`, `X-Ops-Token`, `X-Api-Key`, legacy transfer ops secret headers, and maps `?token=` to `X-Ops-Token` through the Next.js transfer proxy.
- The backend `/ops` screen is the complete database transaction ledger. It aggregates `transfers`, `international_transfers`, `operations`, and `payment_logs` through `opsHistoryRepository`.
- The backend `/ops` screen is dark-only and uses the same operations-console language as the customer web screens: near-black background, graphite surfaces, translucent borders, gold accent, and TalkToStellar lockup.
- Backend `/ops` surface details now live in [ops-dashboard.md](./ops-dashboard.md) and component primitives in [ops-dashboard-components.md](./ops-dashboard-components.md).
- `GET /api/ops/history` exposes the same protected unified history as JSON.

## Known Issues

- Final reviewer screenshots are still pending until the real Stellar testnet evidence transfer is executed.
- The console does not mutate transfer state; lifecycle changes must continue to go through the orchestrator/API/webhooks.

## Key Files

- `frontend/app/admin/transactions/page.tsx` — route entry point.
- `frontend/app/admin/transactions/admin-transactions-client.tsx` — admin table, filters, detail pane, reconciliation, raw record view.
- `frontend/app/api/transfers/route.ts` — frontend proxy to backend transfer API.
- `frontend/app/api/transfers/[...path]/route.ts` — frontend proxy for transfer detail paths.
- `frontend/lib/backend-proxy.ts` — auth/session/idempotency proxy helper.
- `backend/src/api/controllers/ops.controller.ts` — backend `/ops` dashboard, `/api/ops/history`, and lifecycle JSON handlers.
- `backend/src/api/repository/ops-history.repository.ts` — complete transaction-history aggregation across all authoritative transaction tables.
- `backend/src/api/controllers/international-transfers.controller.ts` — mounted `/api/transfers` list/detail handlers used by the frontend proxy in current route order.
- `backend/src/api/repository/transfer.repository.ts` — Supabase persistence for `transfers` and `transfer_events`.
