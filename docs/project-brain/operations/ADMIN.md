# ADMIN.md — Ops Dashboard & Admin Tools

> **Living document.** Updated when ops endpoints change or new admin tools are added.

## Ops Dashboard

- **URL**: frontend host `/ops/login` in deployed environments; `http://localhost:3001/ops/login` when opening the backend directly.
- **Browser auth**: `GET /ops` redirects to `GET /ops/login`. The login is checked against `public.ops_admin_users`, then stored in an HTTP-only, SameSite=Lax cookie.
- **Frontend routing**: Next.js rewrites `/ops` and `/ops/*` to the backend through `frontend/next.config.mjs`. Set `BACKEND_URL` or `NEXT_PUBLIC_BACKEND_URL` in the frontend environment and redeploy the frontend.
- **Admin bootstrap**: generate `OPS_ADMIN_PASSWORD_HASH` with `npm --prefix backend run ops:hash-password`, then run `OPS_ADMIN_LOGIN=... OPS_ADMIN_PASSWORD_HASH=... DATABASE_URL=... npm --prefix backend run migrate:required`. If applying migrations in Supabase SQL Editor, run `backend/migrations/20260614_00_ops_admin_auth.sql` first, then call `select public.upsert_ops_admin_user(lower('admin@example.com'), 'generated-salt-hash', null);`.
- **Compatibility API auth**: `OPS_DASHBOARD_TOKEN` or `TRANSFER_API_TOKEN` still works for JSON clients through bearer/header/query token. Browser dashboard entry should use the DB login, not a query token.

### Features
- Complete database transaction history from `transfers`, `international_transfers`, `operations`, and `payment_logs`
- Source table, type/route, status, amounts, transaction hash/external reference, and timestamps
- Filters by database source, status group, and exact status
- Auto-refresh every 30s
- Dark-only presentation aligned with the login screen's grid, surfaces, borders, and gold accent
- Normalized `transfers` rows link to D1 lifecycle detail: stage rail, full timeline from `transfer_events`, reconciliation panel, raw JSON, and Stellar explorer link

## Frontend Admin Transactions Dashboard

- **URL**: `http://localhost:3000/admin/transactions`
- **Auth**: manual ops/API token entry in the page; the token is stored in session storage only.
- **Backend source**: `GET /api/transfers` and `GET /api/transfers/:id` through the Next.js proxy, then the mounted Express transfer router. The list/detail handlers read normalized D1 records through `transferRepository`.

### Features
- Transfer table with all D1 states, PIX evidence, Stellar transaction metadata, payout routing status, and reconciliation status.
- Search by public ref, transfer id, PIX evidence, Stellar hash, payout ref, or endpoint metadata.
- Detail pane with lifecycle rail, `transfer_events` timeline, reconciliation panel, Stellar explorer link, and copyable raw Transfer Record JSON.
- Auto-refresh toggle for active operational monitoring.
- The Next.js proxy forwards bearer/API/ops headers and maps `?token=` to `X-Ops-Token` for direct API links.

## JSON API

| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| `/api/ops/history` | GET | Ops session cookie or token | Complete database transaction history |
| `/api/transfers` | GET | Ops session cookie or token | List transfers |
| `/api/transfers/:id` | GET | Ops session cookie or token | Transfer detail + events |
| `/api/transfers` | POST | Token, or ops session cookie plus `X-Ops-Csrf` | Create transfer intent |

## Admin Fee Wallet

- **Config**: `TALKTOSTELLAR_FEE_TREASURY_PUBLIC_KEY`
- **How it works**: Every platform fee (30bps) is routed to this Stellar public key during settlement
- **Runbook**: `docs/operations/ADMIN_FEE_WALLET_RUNBOOK.md`

## Receipts System

- SVGs rendered via Resvg (`@resvg/resvg-js`)
- Receipts generated on operation completion
- Two-layer deduplication: DB-level `dedupe_key` unique constraint + in-memory `Set<string>` for external delivery (fixed by `0da597da`)

## Ops Secret

- `INTERNATIONAL_TRANSFER_OPS_SECRET` — internal API auth for sensitive operations
- Used by: advance transfer state manually, force settlement, authorize payouts

## Export Script (D1)

```bash
npx ts-node backend/src/scripts/export-transfer-log.ts <transfer_id>
npx ts-node backend/src/scripts/export-transfer-record.ts <transfer_id>
```

Outputs orchestration logs + transfer events, plus the complete redacted transfer record, to `docs/insta-awards/deliverable-1/evidence/`.
