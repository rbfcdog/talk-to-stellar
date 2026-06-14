# Run 2026-06-14-1622 - Ops Login JSON Error Fix

## Scope

Fixed `/ops/login` returning a generic JSON 500 response instead of the transfer operator login screen.

## Root Cause

The ops admin auth service imported the Supabase client at module load. If backend admin DB configuration failed during route initialization, the global JSON error handler could respond before the login page rendered.

## Files Changed

| File | Change |
|---|---|
| `backend/src/api/services/ops-admin-auth.service.ts` | Lazy-loads Supabase only when credential verification needs database access. |
| `backend/src/api/routes/ops.router.ts` | Wraps async ops routes so unexpected failures are forwarded consistently. |
| `backend/tests/ops.routes.test.ts` | Adds regression coverage that `/ops/login` renders HTML before database credentials are needed. |
| `docs/project-brain/**` | Documents fixed reliability issue #46 and runbook recovery steps. |

## Verification

```bash
npm --prefix backend run build
# PASS

npm --prefix backend test -- --runInBand tests/ops.routes.test.ts
# PASS: 1 suite, 5 tests

git diff --check
# PASS
```

## Operator Check

After deploy, open:

```text
/ops/login
```

The page should render `Transfers console`. If submit fails after the form renders, check `JWT_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and the `ops_admin_users` migration/admin row.
