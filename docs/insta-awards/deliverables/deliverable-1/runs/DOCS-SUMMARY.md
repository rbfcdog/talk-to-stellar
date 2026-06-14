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
| [`2026-06-14-1155-evidence-export.md`](./2026-06-14-1155-evidence-export.md) | Run 2026-06-14-1155 - Database Evidence Export | 640 | Refreshed orchestration logs and transfer record JSON from a DB-backed normalized transfer mirrored from a legacy international transfer row. Evidence reaches `PAYOUT_INSTRUCTED`; final same-transfer real testnet completion remains pending. | English or mostly English. |
| [`2026-06-14-1214-ops-admin-login.md`](./2026-06-14-1214-ops-admin-login.md) | Run 2026-06-14-1214 - Ops Admin Login | 520 | Added DB-backed `/ops/login`, HTTP-only session cookies, CSRF-protected logout, `ops_admin_users` migration/bootstrap, hash utility, tests, and updated operator docs. | English or mostly English. |
| [`2026-06-14-1357-ops-admin-migration-supabase-fix.md`](./2026-06-14-1357-ops-admin-migration-supabase-fix.md) | Run 2026-06-14-1357 - Ops Admin Migration Supabase Fix | 313 | Removed `psql` meta-commands from the ops admin migration so it can run in Supabase SQL Editor; admin creation now runs as a separate function call or migration-runner step. | English or mostly English. |
| [`2026-06-14-1406-frontend-ops-rewrite.md`](./2026-06-14-1406-frontend-ops-rewrite.md) | Run 2026-06-14-1406 - Frontend Ops Rewrite | 255 | Added a Next.js rewrite so `/ops/login` on the frontend host reaches the backend-rendered ops dashboard instead of the frontend 404 page. | English or mostly English. |
| [`2026-06-14-1622-ops-login-json-error-fix.md`](./2026-06-14-1622-ops-login-json-error-fix.md) | Run 2026-06-14-1622 - Ops Login JSON Error Fix | 234 | Lazy-loaded Supabase for ops admin verification so `/ops/login` renders the transfer operator form before database credentials are needed. | English or mostly English. |
| [`2026-06-14-1628-ops-login-import-boundary-fix.md`](./2026-06-14-1628-ops-login-import-boundary-fix.md) | Run 2026-06-14-1628 - Ops Login Import Boundary Fix | 236 | Lazy-loaded dashboard repositories and the transfer orchestrator so `/ops/login` can render before Supabase-backed dashboard modules initialize. | English or mostly English. |
| [`2026-06-14-1932-ops-login-html-error-guard.md`](./2026-06-14-1932-ops-login-html-error-guard.md) | Run 2026-06-14-1932 - Ops Login HTML Error Guard | 258 | Removed the final runtime repository import from the ops view, bypassed idempotency for `/ops`, and added an HTML fallback for `/ops/login` errors. | English or mostly English. |

## Notes

- This file is an English index summary for the folder. It does not replace the source documents.
- Source files that still contain Portuguese are marked in the language note column for follow-up translation.
- Generated summaries intentionally skip `DOCS-SUMMARY.md` to avoid recursive noise.
