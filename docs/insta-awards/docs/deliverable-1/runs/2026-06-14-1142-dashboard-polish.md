# Run 2026-06-14-1142 - Ops Dashboard Polish

## Scope

Production-grade visual/UX upgrade for the existing backend `/ops` ledger and `/ops/transfers/:id` forensic detail page. No orchestration logic, state machine transitions, money movement, or write APIs changed.

The requested frontend-design skill was read from the available local skill path and applied to the existing Express-rendered stack.

## Files Changed

| File | Change |
|------|--------|
| `backend/src/api/views/ops-dashboard.view.ts` | Added centralized tokens, page shell, primitives, list/detail rendering, refresh/copy/toast behavior. |
| `backend/src/api/controllers/ops.controller.ts` | Replaced inline HTML with read-only filtering, sorting, pagination, metrics, and view rendering. |
| `backend/src/api/repository/ops-history.repository.ts` | Added additive fee normalization fields for ops metrics. |
| `backend/tests/ops.routes.test.ts` | Updated protected dashboard route assertions for the polished console. |
| `backend/tests/ops-history.repository.test.ts` | Added fee normalization coverage. |
| `docs/project-brain/product/surfaces/ops-dashboard.md` | Added surface audit, tokens, screenshots, extension notes. |
| `docs/project-brain/product/surfaces/ops-dashboard-components.md` | Added component primitive inventory. |
| `docs/project-brain/product/surfaces/ops-dashboard/screenshots/list-populated.png` | Live-data populated list screenshot. |
| `docs/project-brain/product/surfaces/ops-dashboard/screenshots/list-needs-attention.png` | Live-data needs-attention filter screenshot. |
| `docs/project-brain/product/surfaces/ops-dashboard/screenshots/mobile-list.png` | Mobile stacked list screenshot. |

## Read-Only Fields / Endpoints

- Added `fee_amount`, `fee_asset`, and `fee_label` to normalized `OpsHistoryRecord` rows.
- `GET /api/ops/history` now returns those additive fields when the source row exposes fee metadata.
- No new endpoint was added.
- Reason: `/ops` needs a read-only admin fee metric without querying or changing transfer execution.

## Libraries

- No libraries added.
- Used existing Playwright dependency from `frontend/` for screenshots.

## Commands Run

- `npm run build` in `backend/`
- `npm test -- ops.routes.test.ts ops-history.repository.test.ts --runInBand` in `backend/`
- `OPS_DASHBOARD_TOKEN=dev-ops-token PORT=3011 npm start` in `backend/`
- `curl "http://127.0.0.1:3011/ops?token=dev-ops-token"`
- `curl "http://127.0.0.1:3011/api/ops/history?token=dev-ops-token"`
- `npx playwright screenshot --viewport-size=1440,1100 "http://127.0.0.1:3011/ops?token=dev-ops-token" .../list-populated.png`
- `npx playwright screenshot --viewport-size=1440,1100 "http://127.0.0.1:3011/ops?token=dev-ops-token&needs_attention=1" .../list-needs-attention.png`
- Playwright Chromium script for mobile list screenshot scrolled to stacked rows.

## Live Data Observed

`GET /api/ops/history?token=dev-ops-token` returned:

```json
{
  "total": 1540,
  "source_counts": {
    "transfers": 0,
    "international_transfers": 2,
    "operations": 1482,
    "payment_logs": 56
  },
  "source_errors": {}
}
```

## Screenshots Produced

- `docs/project-brain/product/surfaces/ops-dashboard/screenshots/list-populated.png`
- `docs/project-brain/product/surfaces/ops-dashboard/screenshots/list-needs-attention.png`
- `docs/project-brain/product/surfaces/ops-dashboard/screenshots/mobile-list.png`

## Left Open

- Detail screenshots are pending because the configured Supabase data currently has zero normalized lifecycle rows in `transfers`.
- Do not seed fake money movement into the shared database for screenshots. Capture detail success/failed/mobile after a real seeded/testnet lifecycle transfer exists.
