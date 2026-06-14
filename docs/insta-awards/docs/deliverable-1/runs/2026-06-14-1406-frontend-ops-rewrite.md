# Run 2026-06-14-1406 - Frontend Ops Rewrite

## Scope

Fixed the frontend `/ops/login` 404 by proxying the backend-rendered ops dashboard through the Next.js frontend host.

## Root Cause

`/ops/login` existed in the backend Express app, but the Next.js frontend had no `/ops` page or rewrite. Opening `frontend-domain/ops/login` therefore hit the Next.js 404 page instead of the backend dashboard login.

## Files Changed

| File | Change |
|---|---|
| `frontend/next.config.mjs` | Added rewrites for `/ops` and `/ops/:path*` to the configured backend origin. |
| `docs/project-brain/PAIN-POINTS.md` | Added fixed reliability issue #44. |
| `docs/project-brain/OPEN-ISSUES.md` | Updated fixed-count summary. |
| `docs/project-brain/operations/RUNBOOK.md` | Added diagnosis and recovery steps for frontend `/ops/login` 404. |
| `docs/project-brain/operations/ADMIN.md` | Documented frontend ops URL and required backend proxy env. |
| `docs/project-brain/operations/ENVIRONMENTS.md` | Documented `BACKEND_URL` / `NEXT_PUBLIC_BACKEND_URL` for frontend proxying. |
| `docs/project-brain/product/surfaces/ops-dashboard.md` | Documented the frontend rewrite boundary. |
| `docs/insta-awards/docs/deliverable-1/evidence/DASHBOARD.md` | Updated reviewer access steps to use frontend `/ops/login`. |

## Runtime Requirement

Set the frontend environment to the backend origin, then rebuild/redeploy the frontend:

```bash
BACKEND_URL=https://your-backend.example.com
```

Local dev:

```bash
cd frontend
BACKEND_URL=http://localhost:3001 npm run dev
```

Then open:

```text
http://localhost:3000/ops/login
```

## Commands To Run

```bash
npm --prefix frontend run build
# PASS: Next.js build completed and routes manifest includes /ops rewrites

git diff --check
# PASS
```

## Open Items

- Redeploy the frontend so the Next.js rewrite config is active in production.
