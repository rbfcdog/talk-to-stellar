# Run 2026-06-14-1652 - Ops Login CORS Bypass

## Scope

Fixed the remaining `/ops/login` submission failure where the transfer login page rendered but posting credentials returned the page with `Could not open the transfers console. Try again in a few seconds.`

## Root Cause

The frontend serves `/ops/login` through a Next.js rewrite to the backend. The GET navigation can render without CORS, but the submitted form may include an `Origin` header from the frontend host. If that origin is not configured in backend CORS env, global CORS rejects the request before the ops controller runs.

## Files Changed

| File | Change |
|---|---|
| `backend/src/app.ts` | Wrapped CORS middleware so server-rendered `/ops` browser routes bypass CORS before body parsing and routing. |
| `backend/src/api/middlewares/security.middleware.ts` | Added `isOpsBrowserRoutePath(...)` to keep the bypass narrow to `/ops` and `/ops/*`. |
| `backend/tests/security.middleware.test.ts` | Added regression coverage that unknown origins remain denied and `/api/ops/*` is not part of the `/ops` browser bypass. |
| `docs/project-brain/PAIN-POINTS.md` | Added fixed pain point #47. |
| `docs/project-brain/operations/RUNBOOK.md` | Added diagnosis for the rendered-login submit error. |
| `docs/project-brain/product/surfaces/ops-dashboard.md` | Documented the `/ops` CORS boundary. |

## Verification

```bash
npm --prefix backend test -- --runInBand tests/security.middleware.test.ts tests/ops.routes.test.ts
# PASS: 2 suites, 7 tests

npm --prefix backend run build
# PASS

git diff --check -- '*.md'
# PASS
```

## Operator Check

Deploy backend commit `002ccd9` or later. Then open `/ops/login` from the frontend host, submit the operator email/password, and confirm the request reaches the ops controller. If credentials are wrong, the page should say `Invalid operator credentials` instead of `Could not open the transfers console`.
