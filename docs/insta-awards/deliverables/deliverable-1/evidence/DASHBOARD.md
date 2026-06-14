# Dashboard — Deliverable 1

Status: screenshot capture pending after the real testnet evidence transfer.

## Access

1. Set auth, admin bootstrap, and logging:

   ```bash
   export OPS_DASHBOARD_TOKEN="<review-token>" # JSON/API compatibility only
   export OPS_ADMIN_LOGIN="admin@example.com"
   export LOG_FILE="/tmp/talktostellar-orchestration.jsonl"
   ```

   Generate `OPS_ADMIN_PASSWORD_HASH` with `npm --prefix backend run ops:hash-password --silent` and apply the migration as described in `MIGRATIONS.md`.

2. Start the backend:

   ```bash
   cd backend
   npm run dev
   ```

3. Start the frontend with the backend proxy target configured:

   ```bash
   cd frontend
   BACKEND_URL=http://localhost:3001 npm run dev
   ```

4. Open the ops dashboard on the frontend host:

   ```text
   http://localhost:3000/ops/login
   ```

   Sign in with the bootstrapped `OPS_ADMIN_LOGIN`, then open `/ops?source=transfers`. The Next.js rewrite forwards `/ops` and `/ops/*` to the backend while keeping the frontend URL.

5. Backend-direct fallback:

   ```text
   http://localhost:3001/ops/login
   ```

6. Open the frontend admin transactions dashboard:

   ```text
   http://localhost:3000/admin/transactions
   ```

   Paste the same `<review-token>` into the token prompt. The frontend calls the database-backed transfer API through `/api/transfers`; the Next.js proxy forwards it as `X-Ops-Token`.

For local development without the inline env, set `BACKEND_URL=http://localhost:3001` or `NEXT_PUBLIC_BACKEND_URL=http://localhost:3001` in the frontend environment and restart/redeploy the frontend.

Browser auth is DB-backed through `public.ops_admin_users` and an HTTP-only session cookie. Token auth remains available only for JSON API clients:
- `Authorization: Bearer <review-token>`
- `X-Ops-Token: <review-token>`
- `?token=<review-token>` for JSON API calls

## What the Reviewer Will See

### `/ops`

- Complete operational history across `transfers`, `international_transfers`, `operations`, and `payment_logs`.
- Use `source=transfers` to isolate normalized D1 lifecycle records for reviewer evidence.
- Database source, reference, type/route, status, amounts, transaction hash/external reference, and created time.
- Summary metrics: total records, active queue, completed count, and failure count.
- Auto-refresh every 30 seconds.

### `/ops/transfers/:id`

- Stage rail for the full lifecycle.
- Amounts, PIX charge, Stellar transaction link, and payout reference.
- Timeline from `transfer_events`.
- Reconciliation panel with amount match, fees, discrepancies, reconciled by/at.
- Raw pretty-printed Transfer Record JSON.

### `/admin/transactions`

- Frontend admin table dedicated to normalized `transfers` and `transfer_events`; `/ops` defaults to the complete cross-table history.
- All D1 states available in the state filter.
- Search across public ref, transfer id, PIX evidence, Stellar hash, payout ref, and endpoint metadata.
- Detail pane with lifecycle rail, PIX intake, conversion, payout routing, reconciliation, event timeline, Stellar explorer link, and copyable raw Transfer Record JSON.

## Screenshot Instructions

Use the same completed transfer for dashboard screenshots, orchestration logs, and transfer record evidence.

1. Apply migrations from `docs/insta-awards/deliverables/deliverable-1/MIGRATIONS.md`.
2. Execute the real testnet transfer flow with `LOG_FILE` set.
3. Open `http://localhost:3000/ops/login`, sign in, then open `/ops?source=transfers` and capture `dashboard-list.png`.
4. Open the row for the completed `public_ref` and capture `dashboard-detail.png`.
5. Open `/admin/transactions`, select the same completed transfer, and capture an optional frontend admin screenshot if reviewers ask for a richer dashboard view.
6. Save all screenshots in `docs/insta-awards/deliverables/deliverable-1/evidence/`.

## JSON API

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/ops/history` | GET | Complete protected transaction history across authoritative database tables. |
| `/api/transfers` | GET | List normalized transfers. |
| `/api/transfers/:id` | GET | Read normalized transfer + events when the ID/public ref is not a legacy transfer. |
| `/api/transfers` | POST | Create normalized transfer intent when body contains `amount_brl_in` and no `quote_id`. |

All require either the ops session cookie from `/ops/login`, or token authentication through `INTERNATIONAL_TRANSFER_OPS_SECRET`, `INTERNAL_API_SECRET`, `OPS_DASHBOARD_TOKEN`, or `TRANSFER_API_TOKEN`.
The frontend proxy accepts `?token=` for convenience and forwards it as `X-Ops-Token` because the mounted transfer router authenticates headers.
