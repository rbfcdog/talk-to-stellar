# Documentation Summary: insta-awards/deliverables/deliverable-1/runs

Generated summary for `docs/insta-awards/deliverables/deliverable-1/runs`. Last generated: 2026-06-14.

## Markdown Files

| File | Title | Words | Summary | Language note |
|------|-------|-------|---------|---------------|
| [`2026-06-12-0315.md`](./2026-06-12-0315.md) | Run 2026-06-12-0315 | 439 | The `transfer_events` table migration failed due to duplicate migration version key. Run this SQL manually in Supabase SQL Editor: Result: Clean (0 errors) | English or mostly English. |
| [`2026-06-13-1752.md`](./2026-06-13-1752.md) | Run 2026-06-13-1752 | 519 | Recommended: Manual SQL order: | English or mostly English. |
| [`2026-06-13-1755.md`](./2026-06-13-1755.md) | Run 2026-06-13-1755 | 240 | Documentation-only update under `docs/insta-awards/deliverables/deliverable-1/`. No migrations were run in this documentation-only session. | English or mostly English. |
| [`2026-06-13-1819.md`](./2026-06-13-1819.md) | Run 2026-06-13-1819 | 478 | Added a frontend admin transactions screen for the D1 transfer lifecycle records and documented the surface. No new migrations were added or run in this session. | English or mostly English. |
| [`2026-06-14-1142-dashboard-polish.md`](./2026-06-14-1142-dashboard-polish.md) | Run 2026-06-14-1142 - Ops Dashboard Polish | 371 | Production-grade visual/UX upgrade for `/ops` and `/ops/transfers/:id`, with centralized tokens, reusable primitives, read-only fee normalization, tests, and live list screenshots. Detail screenshots remain pending because `transfers` has zero rows. | English or mostly English. |
| [`2026-06-14-1214-ops-admin-login.md`](./2026-06-14-1214-ops-admin-login.md) | Run 2026-06-14-1214 - Ops Admin Login | 520 | Added DB-backed `/ops/login`, HTTP-only session cookies, CSRF-protected logout, `ops_admin_users` migration/bootstrap, hash utility, tests, and updated operator docs. | English or mostly English. |
| [`2026-06-14-1357-ops-admin-migration-supabase-fix.md`](./2026-06-14-1357-ops-admin-migration-supabase-fix.md) | Run 2026-06-14-1357 - Ops Admin Migration Supabase Fix | 313 | Removed `psql` meta-commands from the ops admin migration so it can run in Supabase SQL Editor; admin creation now runs as a separate function call or migration-runner step. | English or mostly English. |
| [`2026-06-14-1406-frontend-ops-rewrite.md`](./2026-06-14-1406-frontend-ops-rewrite.md) | Run 2026-06-14-1406 - Frontend Ops Rewrite | 255 | Added a Next.js rewrite so `/ops/login` on the frontend host reaches the backend-rendered ops dashboard instead of the frontend 404 page. | English or mostly English. |
| [`2026-06-14-1622-ops-login-json-error-fix.md`](./2026-06-14-1622-ops-login-json-error-fix.md) | Run 2026-06-14-1622 - Ops Login JSON Error Fix | 234 | Lazy-loaded Supabase for ops admin verification so `/ops/login` renders the transfer operator form before database credentials are needed. | English or mostly English. |
| [`2026-06-14-1628-ops-login-import-boundary-fix.md`](./2026-06-14-1628-ops-login-import-boundary-fix.md) | Run 2026-06-14-1628 - Ops Login Import Boundary Fix | 236 | Lazy-loaded dashboard repositories and the transfer orchestrator so `/ops/login` can render before Supabase-backed dashboard modules initialize. | English or mostly English. |
| [`2026-06-14-1652-ops-login-cors-bypass.md`](./2026-06-14-1652-ops-login-cors-bypass.md) | Run 2026-06-14-1652 - Ops Login CORS Bypass | 268 | Let server-rendered `/ops` browser routes bypass backend CORS middleware so frontend-hosted login form posts reach the ops controller while JSON APIs keep strict CORS behavior. | English or mostly English. |
| [`2026-06-14-1932-ops-login-html-error-guard.md`](./2026-06-14-1932-ops-login-html-error-guard.md) | Run 2026-06-14-1932 - Ops Login HTML Error Guard | 258 | Removed the final runtime repository import from the ops view, bypassed idempotency for `/ops`, and added an HTML fallback for `/ops/login` errors. | English or mostly English. |
| [`2026-06-14-2224-ops-dashboard-cleanup.md`](./2026-06-14-2224-ops-dashboard-cleanup.md) | Run 2026-06-14-2224 - Ops Dashboard Cleanup | 271 | Cleaned the backend-rendered `/ops` dashboard, restored a useful Forensics entry point, added print/session controls, and documented Deliverable 1 evidence file locations. | English or mostly English. |
| [`2026-06-14-2245-real-evidence-only.md`](./2026-06-14-2245-real-evidence-only.md) | Run 2026-06-14-2245 - Real Evidence Only | 328 | Removed non-final D1 log/transfer-record JSON from the active evidence folder and added export guards so final reviewer evidence cannot be written unless the transfer is reconciled with real Stellar testnet evidence. | English or mostly English. |
| [`2026-06-14-2259-real-stellar-json-evidence.md`](./2026-06-14-2259-real-stellar-json-evidence.md) | Run 2026-06-14-2259 - Real Stellar JSON Evidence | 298 | Added two real JSON evidence files from `payment_logs.id = 2`, verified on Horizon testnet ledger `2488252`, while keeping final D1 PIX-to-payout evidence marked pending. | English or mostly English. |

## Notes

- This file is an English index summary for the folder. It does not replace the source documents.
- Source files that still contain Portuguese are marked in the language note column for follow-up translation.
- Generated summaries intentionally skip `DOCS-SUMMARY.md` to avoid recursive noise.
