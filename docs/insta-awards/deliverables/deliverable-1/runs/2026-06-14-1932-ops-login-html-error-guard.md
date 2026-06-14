# Run 2026-06-14-1932 - Ops Login HTML Error Guard

## Scope

Added a final guard so `/ops/login` does not show generic JSON errors even if middleware or fallback error handling sees an exception.

## Root Cause

The ops dashboard view still imported a runtime constant from the Supabase-backed history repository. In addition, POST `/ops/login` could pass through idempotency storage if an idempotency header was present, and the global error handler always returned JSON.

## Files Changed

| File | Change |
|---|---|
| `backend/src/api/views/ops-dashboard.view.ts` | Replaced runtime repository import with local `OPS_HISTORY_SOURCES` plus type-only imports. |
| `backend/src/api/services/core/idempotency.service.ts` | Skips idempotency storage for `/ops` browser routes. |
| `backend/src/app.ts` | Renders the transfer login HTML for `/ops/login` errors instead of generic JSON. |
| `docs/project-brain/PAIN-POINTS.md` | Updated fixed issue #46 with the final guard. |
| `docs/project-brain/operations/RUNBOOK.md` | Updated recovery steps to require `6529ec7` or later. |
| `docs/project-brain/product/surfaces/ops-dashboard.md` | Documented the login HTML fallback boundary. |

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

Deploy backend commit `6529ec7` or later, then open `/ops/login`. The response should be an HTML transfer login screen, not JSON with `temporary_unavailable`.
