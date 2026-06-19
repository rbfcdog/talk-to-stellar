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

## 4. User Stellar Wallets (required for wallet generation feature)

```bash
psql <database_url> -f backend/migrations/20260618_01_user_stellar_wallets.sql
```

- `user_stellar_wallets` table — multiple Stellar addresses per user email
- RLS enabled, service_role only
- Needed for the "Generate Stellar wallet" button on `/mainnet` and Step 2 on `/bridge-test`
- Secret keys are never stored; public keys + funded/trustline status are

**Required env var (Railway):**

```
STELLAR_WALLET_SPONSOR_SECRET=S...   # funded mainnet Stellar account, ~2 XLM per wallet
```

Without it wallets are generated unfunded. With it they are auto-funded and Bridge-ready.

## 5. Bridge Custodial Wallets (required for Bridge wallet persistence)

```bash
psql <database_url> -f backend/migrations/20260618_02_bridge_custodial_wallets.sql
```

- `bridge_custodial_wallets` table — stores Bridge-managed wallet IDs, chains, addresses per customer
- RLS enabled, service_role only
- Populated automatically when wallets are created or listed via `/bridge-test`
- On page load, wallets are fetched from this table instantly (no Bridge API roundtrip)

## Quick apply via Supabase

Open Supabase SQL Editor and paste the contents of each migration file in order.
