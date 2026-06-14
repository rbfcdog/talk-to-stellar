# Dashboard — Deliverable 1

Status: screenshot capture pending after the real testnet evidence transfer.

## Access

1. Set auth and logging:

   ```bash
   export OPS_DASHBOARD_TOKEN="<review-token>"
   export LOG_FILE="/tmp/talktostellar-orchestration.jsonl"
   ```

2. Start the backend:

   ```bash
   cd backend
   npm run dev
   ```

3. Optional frontend admin console:

   ```bash
   cd frontend
   npm run dev
   ```

4. Open the backend ops dashboard:

   ```text
   http://localhost:3001/ops?token=<review-token>&source=transfers
   ```

5. Open the frontend admin transactions dashboard:

   ```text
   http://localhost:3000/admin/transactions
   ```

   Paste the same `<review-token>` into the token prompt. The frontend calls the database-backed transfer API through `/api/transfers`; the Next.js proxy forwards it as `X-Ops-Token`.

Auth options:
- `Authorization: Bearer <review-token>`
- `X-Ops-Token: <review-token>`
- `?token=<review-token>`

Local non-production fallback is `dev-ops-token` only when `OPS_DASHBOARD_TOKEN` and `TRANSFER_API_TOKEN` are unset. Hosted environments must set a token.

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

1. Apply migrations from `docs/insta-awards/docs/deliverable-1/MIGRATIONS.md`.
2. Execute the real testnet transfer flow with `LOG_FILE` set.
3. Open `/ops?token=<review-token>&source=transfers` and capture `dashboard-list.png`.
4. Open the row for the completed `public_ref` and capture `dashboard-detail.png`.
5. Open `/admin/transactions`, select the same completed transfer, and capture an optional frontend admin screenshot if reviewers ask for a richer dashboard view.
6. Save all screenshots in `docs/insta-awards/deliverable-1/evidence/`.

## JSON API

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/ops/history` | GET | Complete protected transaction history across authoritative database tables. |
| `/api/transfers` | GET | List normalized transfers. |
| `/api/transfers/:id` | GET | Read normalized transfer + events when the ID/public ref is not a legacy transfer. |
| `/api/transfers` | POST | Create normalized transfer intent when body contains `amount_brl_in` and no `quote_id`. |

All require token authentication through `INTERNATIONAL_TRANSFER_OPS_SECRET`, `INTERNAL_API_SECRET`, `OPS_DASHBOARD_TOKEN`, or `TRANSFER_API_TOKEN`.
The frontend proxy accepts `?token=` for convenience and forwards it as `X-Ops-Token` because the mounted transfer router authenticates headers.
