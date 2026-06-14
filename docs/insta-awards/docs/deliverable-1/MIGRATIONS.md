# Migrations — Deliverable 1

Updated: 2026-06-13

## Migration File

| File | Purpose |
|------|---------|
| `backend/migrations/20260613_00_full_schema.sql` | Creates the complete TalkToStellar database from zero, including D1 `transfers`, `transfer_events`, append-only guards, public-ref generation, and atomic lifecycle RPCs. |

## Run Commands

Recommended:

```bash
cd backend
DATABASE_URL=postgresql://... npm run migrate:required
```

Direct `psql`:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f backend/migrations/20260613_00_full_schema.sql
```

The repository no longer carries a generic rollback migration. Back up an existing database before applying the consolidated bootstrap.

## Resulting Schema

Expected objects:

```text
public.transfer_state enum
public.transfer_public_ref_seq sequence
public.generate_transfer_public_ref() function
public.transfers table
public.transfer_events table
public.create_transfer_with_event(...) function
public.transition_transfer(...) function
public.prevent_transfer_events_mutation() function
```

Expected `transfers` columns:

```text
id uuid primary key default gen_random_uuid()
public_ref text not null unique default generate_transfer_public_ref()
state transfer_state not null default 'CREATED'
state_version integer not null default 1
source_endpoint jsonb
destination_endpoint jsonb
amount_brl_in text
amount_usdc_settled text
amount_usd_out_expected text
quote jsonb
pix jsonb
stellar jsonb
payout jsonb
reconciliation jsonb
legacy_transfer_id text
actor jsonb default '{}'
failure_reason text
created_at timestamptz not null default now()
updated_at timestamptz not null default now()
```

Expected `transfer_events` columns:

```text
id uuid primary key default gen_random_uuid()
transfer_id uuid not null references transfers(id) on delete cascade
from_state transfer_state
to_state transfer_state not null
event_type text not null
payload jsonb default '{}'
actor text not null
correlation_id text
created_at timestamptz not null default now()
```

## Schema Inspection Commands

Run after applying the consolidated migration:

```sql
select table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in ('transfers', 'transfer_events')
order by table_name;

select column_name, data_type, udt_name, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'transfers'
order by ordinal_position;

select column_name, data_type, udt_name, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'transfer_events'
order by ordinal_position;

select routine_name
from information_schema.routines
where routine_schema = 'public'
  and routine_name in (
    'create_transfer_with_event',
    'transition_transfer',
    'generate_transfer_public_ref',
    'prevent_transfer_events_mutation'
  )
order by routine_name;
```

## Run Status This Session

Verified on 2026-06-13 against an empty PostgreSQL 16 database with minimal Supabase `auth`, `vault`, and role stubs. The migration completed, created 46 public tables and 47 public functions, preserved required seed rows, and left no `public.exec_sql` function. The same file also completed a second application after the idempotency guard for the service-role policy was added.

## Evidence Linkage

After the migration is applied, continue with `EVIDENCE-RUNBOOK.md`. The final evidence transfer should use the migrated `transfers` and `transfer_events` schema so `/ops`, exported logs, and exported transfer record all reference the same `public_ref`.
