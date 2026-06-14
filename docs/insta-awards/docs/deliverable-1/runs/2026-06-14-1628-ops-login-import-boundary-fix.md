# Run 2026-06-14-1628 - Ops Login Import Boundary Fix

## Scope

Fixed the remaining `/ops/login` JSON 500 path after the first login-rendering fix.

## Root Cause

`backend/src/api/controllers/ops.controller.ts` still imported Supabase-backed dashboard repositories and the transfer orchestrator at module load. Even though the admin auth service had been lazy-loaded, importing the controller could still pull dashboard data modules before the login form rendered.

## Files Changed

| File | Change |
|---|---|
| `backend/src/api/controllers/ops.controller.ts` | Replaced top-level dashboard repository/orchestrator imports with lazy `require(...)` helpers used only after authentication or API access. |
| `docs/project-brain/PAIN-POINTS.md` | Updated fixed issue #46 with the deeper import-boundary fix. |
| `docs/project-brain/operations/RUNBOOK.md` | Updated recovery steps to require `c4d38bd` or later. |
| `docs/project-brain/product/surfaces/ops-dashboard.md` | Documented that `/ops/login` does not load dashboard data modules before rendering. |

## Verification

```bash
npm --prefix backend run build
# PASS

npm --prefix backend test -- --runInBand tests/ops.routes.test.ts
# PASS: 1 suite, 5 tests

env -u SUPABASE_URL -u SUPABASE_SERVICE_ROLE_KEY -u SUPABASE_ANON_KEY -u SUPABASE_KEY -u JWT_SECRET npm --prefix backend exec -- ts-node -e "require('./src/api/routes/ops.router'); console.log('ops router loaded without supabase env')"
# PASS

git diff --check
# PASS
```

## Operator Check

After deploy, `/ops/login` should render `Transfers console` before any admin database verification runs.
