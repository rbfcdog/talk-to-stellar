# Bridge.xyz — Database Migrations

## Existing

### `bridge_pix_ach_orders` (pre-existing)

```sql
CREATE TABLE IF NOT EXISTS public.bridge_pix_ach_orders (
  -- from migration 20260613_00_full_schema.sql:2389
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT,
  bridge_customer_id TEXT,
  -- ... amount, state, pix/ach details
  bridge_fee_usd TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

Used by `BridgePixAchService` for the PIX→USDC→ACH atomic flow. Indexes on `session_id`, `pix_virtual_account_id`, `ach_transfer_id`.

## None Needed (Current State)

The current Bridge integration (customers, PIX accounts, liquidation addresses, virtual accounts, exchange rates) is **pass-through** — it proxies requests to Bridge's API and returns responses directly. No local persistence is done.

This means:
- Customer lookup → calls Bridge API each time
- External account listing → calls Bridge API each time
- Exchange rate → calls Bridge API each time

This is intentional — Bridge is the source of truth and the API is fast enough for operator/test use.

## Recommended for Production

If you need local persistence (offline access, caching, webhook processing), add these tables:

### `bridge_customers`
Maps local user/session IDs to Bridge customer IDs.

```sql
CREATE TABLE public.bridge_customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  local_user_id TEXT,           -- TalkToStellar session_id or user_id
  bridge_customer_id TEXT UNIQUE NOT NULL,
  email TEXT,
  status TEXT,                  -- not_started, active, rejected
  kyc_status TEXT,
  endorsements JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  last_synced_at TIMESTAMPTZ
);
CREATE INDEX idx_bridge_customers_user ON bridge_customers(local_user_id);
CREATE INDEX idx_bridge_customers_email ON bridge_customers(email);
```

### `bridge_webhook_events`
Stores incoming webhook events for audit and idempotency.

```sql
CREATE TABLE public.bridge_webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id TEXT UNIQUE NOT NULL,
  event_sequence BIGINT,
  event_type TEXT NOT NULL,     -- customer.updated, transfer.completed, etc.
  resource_type TEXT,           -- customer, transfer, liquidation_address, etc.
  resource_id TEXT,
  raw_payload JSONB NOT NULL,
  processed BOOLEAN DEFAULT false,
  processing_error TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  processed_at TIMESTAMPTZ
);
CREATE INDEX idx_bridge_wh_events_type ON bridge_webhook_events(event_type);
CREATE INDEX idx_bridge_wh_events_rid ON bridge_webhook_events(resource_id);
```

### `bridge_transfers`
Caches transfer records from Bridge.

```sql
CREATE TABLE public.bridge_transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bridge_transfer_id TEXT UNIQUE NOT NULL,
  bridge_customer_id TEXT NOT NULL,
  local_user_id TEXT,
  state TEXT NOT NULL,          -- awaiting_funds, completed, etc.
  source_currency TEXT,
  source_rail TEXT,
  destination_currency TEXT,
  destination_rail TEXT,
  amount TEXT,
  receipt JSONB,
  deposit_instructions JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  last_synced_at TIMESTAMPTZ
);
```

## Summary

| Table | Exists | Needed Now | Notes |
|-------|--------|-----------|-------|
| `bridge_pix_ach_orders` | Yes | n/a | Pre-existing PIX→ACH flow |
| `bridge_customers` | No | Recommended | Map local users to Bridge customers |
| `bridge_webhook_events` | No | Recommended | Audit trail + idempotency |
| `bridge_transfers` | No | Recommended | Cache transfer state |
| `bridge_external_accounts` | No | Optional | Cache PIX keys |
| `bridge_liquidation_addresses` | No | Optional | Cache deposit addresses |
| `bridge_virtual_accounts` | No | Optional | Cache on-ramp accounts |

**No migration is needed right now.** The integration works via API pass-through. Add persistence when you need webhook processing or offline customer lookup.
