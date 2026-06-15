# Ops Dashboard - Surface Audit

> **Living document.** Updated when the backend `/ops` ledger or `/ops/transfers/:id` forensic view changes.

## Flow

```
Operator opens /ops
  -> Frontend rewrites /ops and /ops/* to the backend when served from the Next.js host
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
- The login page renders before admin database or dashboard data modules are needed. Supabase-backed modules are lazy-loaded only after the operator submits credentials or opens an authenticated dashboard. `/ops` bypasses idempotency storage and backend CORS middleware for server-rendered browser routes, and the global error handler falls back to the login HTML for `/ops/login`, so setup/configuration errors should not replace the form with generic JSON.
- Visible login copy is transfer-focused only: title "Transfers console", operator email/password fields, and helper text about reviewing transfer status, payout progress, and reconciliation evidence. Implementation terms such as database table names, dashboard tokens, cookies, and migrations stay out of the screen.
- The deployed frontend serves `/ops/login` through the `frontend/next.config.mjs` rewrite to the backend. The frontend environment must set `BACKEND_URL` or `NEXT_PUBLIC_BACKEND_URL` to the backend origin.
- `backend/migrations/20260614_00_ops_admin_auth.sql` is plain SQL so it can run in Supabase SQL Editor. The first admin is created by `public.upsert_ops_admin_user(...)` after the migration, or automatically by `backend/scripts/run-required-migrations.ts` when `OPS_ADMIN_LOGIN` and `OPS_ADMIN_PASSWORD_HASH` are set.
- `/ops` and `/ops/transfers/:id` no longer accept query-token browser entry; unauthenticated requests redirect to `/ops/login`.
- `OPS_DASHBOARD_TOKEN` / `TRANSFER_API_TOKEN` remain compatibility auth for JSON API clients, not the operator browser workflow.
- `/ops` renders a production-grade ledger console with top bar, environment badge, refresh control, print action, quiet operator/session controls, compact positive metric cards, a single filter strip, sortable table, pagination, copy buttons, relative timestamps, and responsive stacked mobile rows.
- The Ledger/Forensics top nav is always meaningful: Ledger opens the unified history, while Forensics opens `source=transfers` on the list page and the `#transfer-detail` section on a transfer detail page.
- The page no longer uses meta refresh. It polls in place every 30 seconds and replaces only dashboard fragments.
- Metrics are read-only and computed from loaded ledger records across the full visible ledger: all transfers, total BRL to USDC volume, completed ledger records, and admin fee total.
- In-flight and needs-attention counts are intentionally not hero metrics. Operators can still inspect status and category through the table, status pills, search, source, group, and date filters without the first screen reading like an incident report.
- The print view removes interactive chrome, uses A4 landscape, keeps the ledger table and metrics legible on paper/PDF, and hides raw JSON by default.
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
