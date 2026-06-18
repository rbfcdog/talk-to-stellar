# Migrations

Apply in order:

## 1. Full Schema (required)

```bash
psql <database_url> -f backend/migrations/20260613_00_full_schema.sql
```

- 48+ tables: wallets, operations, contacts, transfers, transfer_events, agent_sessions, external_accounts, payment_logs, etc.
- Row-Level Security on all tables
- `create_transfer_with_event()` and `transition_transfer()` RPCs
- Append-only event triggers

## 2. Ops Admin Auth (required)

```bash
psql <database_url> -f backend/migrations/20260614_00_ops_admin_auth.sql
```

- `ops_admin_users` table with scrypt password hashing
- Admin session management

## 3. Bridge Tables (optional — only if using Bridge.xyz)

```bash
psql <database_url> -f backend/migrations/20260618_00_bridge_tables.sql
```

- `bridge_customers`, `bridge_external_accounts`, `bridge_liquidation_addresses`
- `bridge_virtual_accounts`, `bridge_transfers`, `bridge_webhook_events`
- `bridge_exchange_rate_estimates`

## Quick apply via Supabase

Open Supabase SQL Editor and paste the contents of each migration file in order.
