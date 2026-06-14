# Landing Page — Surface Audit

> **Living document.** Updated when the public landing page or early-access capture changes.

## Flow

```
Visitor opens /
  -> CTA renders EarlyAccessSignup
  -> Visitor submits email
  -> Frontend posts POST /api/early-access
  -> Next.js proxy forwards to backend /api/early-access
  -> EarlyAccessSignupService normalizes email and upserts early_access_signups
  -> Visitor sees inline success or validation feedback
```

## Current Behavior

- The active homepage is `frontend/app/page.tsx`, which uses `frontend/components/landing-reluca/`.
- The email form is embedded in the CTA via `frontend/components/landing-reluca/EarlyAccessSignup.tsx`.
- The browser never writes directly to Supabase; it posts to `frontend/app/api/early-access/route.ts`, which proxies to the Express backend.
- The backend endpoint is `backend/src/api/routes/early-access.router.ts`, handled by `backend/src/api/controllers/early-access.controller.ts`.
- `backend/src/api/services/early-access-signup.service.ts` lowercases emails and upserts `early_access_signups` by unique `email`.
- Copy is bilingual in `frontend/components/landing-reluca/content.ts`.

## Known Issues

- No unsubscribe flow exists yet; `unsubscribed_at` is reserved in the table for future handling.
- The list does not send confirmation or notification email; it only captures the address.

## Key Files

- `frontend/app/page.tsx` — active public homepage.
- `frontend/components/landing-reluca/CTA.tsx` — CTA section that includes the signup form.
- `frontend/components/landing-reluca/EarlyAccessSignup.tsx` — email form and client-side validation.
- `frontend/app/api/early-access/route.ts` — Next.js proxy to backend.
- `backend/src/api/routes/early-access.router.ts` — Express route.
- `backend/src/api/controllers/early-access.controller.ts` — request handling and public response.
- `backend/src/api/services/early-access-signup.service.ts` — Supabase upsert logic.
- `backend/migrations/20260613_00_full_schema.sql` — `early_access_signups` table and RLS policy.
