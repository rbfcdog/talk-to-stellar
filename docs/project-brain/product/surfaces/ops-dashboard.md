# Ops Dashboard - Surface Audit

> **Living document.** Updated when the backend `/ops` ledger or `/ops/transfers/:id` forensic view changes.

## Flow

```
Operator opens /ops
  -> Redirected to /ops/login if no valid ops session cookie
  -> Login is checked against ops_admin_users
  -> Backend sets an HTTP-only SameSite=Lax ops session cookie
  -> Backend reads transfers, international_transfers, operations, payment_logs
  -> Operator filters/searches/sorts the normalized ledger
  -> Lifecycle rows link to /ops/transfers/:id
  -> Detail page shows status, timeline, reconciliation, evidence, raw JSON
```

## Before

- Server-rendered Express page in `backend/src/api/controllers/ops.controller.ts`.
- Inline controller CSS, 30-second full-page meta refresh, no reusable primitives.
- Four debug metrics: total, active, completed, failures.
- Filters were source/category/status selects only.
- Detail page showed a rail, basic key/value data, simple event rows, and open raw JSON.

## Token Source

The dashboard tokens now live in one source of truth: `backend/src/api/views/ops-dashboard.view.ts`.

| Token | Value / rule |
|------|--------------|
| Background | `--ops-bg: #06070a`, `--ops-bg-raised: #090b0f` |
| Surfaces | `--ops-surface`, `--ops-surface-2`, `--ops-surface-3` |
| Borders | `--ops-border`, `--ops-border-strong` |
| Brand accent | `--ops-gold`, `--ops-gold-light` |
| Status palette | neutral muted, info blue, active amber, success green, attention red |
| Radius | `--ops-radius: 8px`, `--ops-radius-sm: 6px` |
| Spacing | 4/8/12/16/20/24/32px scale |
| Typography | sans for UI; `--ops-font-mono` for references, hashes, amounts, timestamps, JSON |

This matches the existing `tts-op-page` dark operations language in `frontend/app/globals.css`: near-black background, graphite surfaces, gold action color, subtle hairline borders, and dense financial data.

## Current Behavior

- `/ops/login` is the browser entry point. It uses a CSRF cookie + hidden token, checks the submitted login/password against `public.ops_admin_users`, then signs a short-lived HTTP-only session cookie with `JWT_SECRET`.
- `/ops` and `/ops/transfers/:id` no longer accept query-token browser entry; unauthenticated requests redirect to `/ops/login`.
- `OPS_DASHBOARD_TOKEN` / `TRANSFER_API_TOKEN` remain compatibility auth for JSON API clients, not the operator browser workflow.
- `/ops` renders a production-grade ledger console with top bar, environment badge, refresh control, metrics, controls, status legend, sortable table, pagination, copy buttons, relative timestamps, and responsive stacked mobile rows.
- The page no longer uses meta refresh. It polls in place every 30 seconds and replaces only dashboard fragments.
- Metrics are read-only and computed from loaded ledger records: transfers today, BRL to USDC volume today, in-flight count, needs-attention count, admin fee total.
- Needs-attention includes failed, expired, refund, discrepant, and active records not updated for more than two hours.
- `/ops/transfers/:id` renders the forensic view: public reference header, status pill, amount summary, lifecycle rail/timeline, reconciliation banner, fee table, evidence links, and collapsed syntax-highlighted raw JSON.
- `GET /api/ops/history` remains protected and additive. It now includes normalized read-only fee fields when available.

## Status System

Status pills are dot + label, not color alone.

| Tone | States / statuses |
|------|-------------------|
| Neutral | `CREATED`, `QUOTED`, unknown passive states |
| Info | `PIX_CHARGE_ISSUED` |
| Active | `PIX_FUNDED`, `CONVERTING`, `PAYOUT_ROUTING`, pending/processing statuses |
| Success | `STELLAR_SETTLED`, `PAYOUT_INSTRUCTED`, `RECONCILED`, completed/success statuses |
| Attention | `FAILED`, `QUOTE_EXPIRED`, `PIX_EXPIRED`, `REFUND_REQUIRED`, failed/error/refund/discrepancy statuses |

## Screenshots

Captured from local backend `http://127.0.0.1:3011` against configured Supabase data on 2026-06-14:

| Screenshot | Path |
|------------|------|
| List, populated | `docs/project-brain/product/surfaces/ops-dashboard/screenshots/list-populated.png` |
| List, needs attention | `docs/project-brain/product/surfaces/ops-dashboard/screenshots/list-needs-attention.png` |
| Mobile list, stacked rows | `docs/project-brain/product/surfaces/ops-dashboard/screenshots/mobile-list.png` |

Detail screenshots are pending because live verification returned `source_counts.transfers = 0`, so no normalized lifecycle transfer existed to open at `/ops/transfers/:id`.

Capture steps once a seeded/testnet lifecycle transfer exists:

1. Run `OPS_DASHBOARD_TOKEN=dev-ops-token PORT=3011 npm start` from `backend/`.
2. Confirm `curl "http://127.0.0.1:3011/api/ops/history?token=dev-ops-token"` returns `source_counts.transfers > 0`.
3. Open `http://127.0.0.1:3011/ops/login`, sign in with the bootstrapped `OPS_ADMIN_LOGIN`, then click a lifecycle row.
4. Capture:
   - success detail: `docs/project-brain/product/surfaces/ops-dashboard/screenshots/detail-success.png`
   - failed detail: `docs/project-brain/product/surfaces/ops-dashboard/screenshots/detail-failed.png`
   - mobile detail: `docs/project-brain/product/surfaces/ops-dashboard/screenshots/mobile-detail.png`

## Extending

- Add a state pill: update `STATE_LABELS` or the tone rules in `backend/src/api/views/ops-dashboard.view.ts`; the list, detail header, legend, and timeline share the same renderer.
- Add a column: add a normalized read-only field to `OpsHistoryRecord`, map it in `ops-history.repository.ts`, then add one table cell and sort key in `ops.controller.ts`.
- Add a metric: compute it in `dashboardMetrics()` in `ops.controller.ts`; render remains data-driven through `OpsDashboardMetric`.
- Add a detail panel: compose it in `ops-dashboard.view.ts` using the existing `panel`, `kv-list`, `evidence-list`, `json-block`, and copy primitives.

## Key Files

- `backend/src/api/views/ops-dashboard.view.ts` - tokens, page shell, primitives, list/detail rendering, refresh/copy/toast script.
- `backend/src/api/controllers/ops.controller.ts` - protected route handlers and read-only list shaping.
- `backend/src/api/repository/ops-history.repository.ts` - cross-table ledger normalization.
- `backend/tests/ops.routes.test.ts` - protected HTML/JSON route coverage.
- `backend/tests/ops-history.repository.test.ts` - source normalization and fee metadata coverage.
