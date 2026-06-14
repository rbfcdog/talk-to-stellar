# Run 2026-06-14-1357 - Ops Admin Migration Supabase Fix

## Scope

Fixed the ops admin auth migration so it can run directly in Supabase SQL Editor.

## Root Cause

`backend/migrations/20260614_00_ops_admin_auth.sql` included `psql` client meta-commands (`\if`, `\echo`) for optional admin bootstrap. Supabase SQL Editor sends SQL directly to Postgres and rejects those backslash commands with `ERROR: 42601`.

## Files Changed

| File | Change |
|---|---|
| `backend/migrations/20260614_00_ops_admin_auth.sql` | Removed `psql` meta-commands; kept only plain SQL table, policy, and function DDL. |
| `backend/scripts/run-required-migrations.ts` | Moved optional admin bootstrap to a separate post-migration `select public.upsert_ops_admin_user(...)` call when env vars are set. |
| `docs/insta-awards/docs/deliverable-1/MIGRATIONS.md` | Documented Supabase SQL Editor flow and separate admin creation SQL. |
| `docs/project-brain/PAIN-POINTS.md` | Added fixed reliability issue #43. |
| `docs/project-brain/OPEN-ISSUES.md` | Updated fixed-count summary. |
| `docs/project-brain/operations/RUNBOOK.md` | Added recovery steps for the exact `\if` syntax error. |
| `docs/project-brain/operations/ADMIN.md` | Added Supabase SQL Editor admin bootstrap note. |
| `docs/project-brain/product/surfaces/ops-dashboard.md` | Documented the plain-SQL migration boundary. |

## Correct Supabase SQL Editor Flow

1. Run `backend/migrations/20260614_00_ops_admin_auth.sql`.
2. Generate a hash locally:

```bash
OPS_ADMIN_PASSWORD='your-long-password' npm --prefix backend run ops:hash-password --silent
```

3. Run this SQL in Supabase, replacing the login and generated hash:

```sql
select public.upsert_ops_admin_user(
  lower('admin@example.com'),
  'paste-generated-scrypt-hash-here',
  null
);
```

Do not paste the plaintext password into Supabase.

## Commands To Run

```bash
npm --prefix backend run build
# PASS

MIGRATION_DRY_RUN=1 OPS_ADMIN_LOGIN='Admin@TalkToStellar.test' OPS_ADMIN_PASSWORD_HASH='salt:hash' npm --prefix backend run migrate:required --silent
# PASS: listed required migrations and post-migration admin bootstrap

npm --prefix backend test -- --runInBand tests/ops.routes.test.ts
# PASS: 1 suite, 4 tests

git diff --check
# PASS
```

## Open Items

- Apply the updated `backend/migrations/20260614_00_ops_admin_auth.sql` in the target Supabase project.
- Create the admin with `public.upsert_ops_admin_user(...)`.
