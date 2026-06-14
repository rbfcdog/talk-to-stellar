# Security hardening implementation - 2026-05-19

## Implemented

- Browser session secrets now live in HttpOnly cookies (`tts_session_id`, `tts_session_token`) set by the Next.js API proxy.
- Frontend clients no longer store or read `talk-to-stellar.sessionToken` from `localStorage`; legacy keys are only removed.
- Backend session-token compatibility through query string was removed from agent and financial auth paths.
- Wallet PIN hashing now uses a versioned PBKDF2-SHA256 format with random per-PIN salt and a server-side `PIN_PEPPER`.
- Legacy global-salt PIN hashes still verify, and successful legacy PIN checks in external linking/onboarding flows are opportunistically migrated to the new format.
- Rate limits now run in-process and require no external Redis configuration.
- Added `backend/scripts/verify-rls-hardening.sql` to prove the Supabase RLS hardening migration is applied.

## Required env

Backend:

```bash
PIN_PEPPER="long-random-server-side-secret"
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX=300
SENSITIVE_RATE_LIMIT_WINDOW_MS=60000
SENSITIVE_RATE_LIMIT_MAX=30
```

`PIN_PEPPER` is required in production-like environments. `PIN_SALT` remains accepted only as legacy compatibility for old hashes.

## Supabase RLS apply and verify

This must be run from a trusted admin Postgres connection or Supabase SQL Editor:

```bash
psql "$DATABASE_URL" -f backend/migrations/20260518_01_security_hardening_public_surface.sql
psql "$DATABASE_URL" -f backend/scripts/verify-rls-hardening.sql
```

The local workspace currently does not include a direct Postgres `DATABASE_URL`/`SUPABASE_DB_URL`, so the SQL cannot be applied from the app runtime or the service-role REST key alone. Use Supabase SQL Editor or set a direct admin database URL locally/CI before running the commands above.
