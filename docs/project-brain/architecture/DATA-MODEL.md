# DATA-MODEL.md — Database Schema

> **Living document.** Updated when tables, columns, or migrations change.

Supabase PostgreSQL. No ORM — raw queries via `@supabase/supabase-js`. Repository pattern.

The complete SQL schema lives only in `backend/migrations/20260613_00_full_schema.sql`. It replaces the former incremental migrations and runtime bootstrap code.

## Core Tables

### users
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| email | text | unique |
| phone_number | text | WhatsApp number |
| stellar_public_key | text | main Stellar wallet |
| created_at | timestamptz | |
| updated_at | timestamptz | |

**Used by**: UserRepository, auth, onboarding, all flows

### contacts
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| owner_id | uuid FK→users | |
| contact_name | text | |
| stellar_public_key | text | recipient's Stellar key |
| pix_key | text | recipient's PIX key |
| country | text | |
| preferred_currency | text | USD, BRL, CETES, XLM |
| created_at | timestamptz | |

**Used by**: Send-to-contact flow, agent contact lookup

### wallets
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| user_id | uuid FK→users | |
| public_key | text | Stellar public key |
| vault_secret_id | text | encrypted secret key ref |
| created_at | timestamptz | |

**Used by**: All Stellar operations, balance computation

### operations
| Column | Type | Notes |
|--------|------|-------|
| id | text PK | OP-xxxxxx format |
| user_id | uuid FK→users | |
| type | text | PIX_ONRAMP, CONVERSION, SEND, OFF_RAMP, etc |
| status | text | PENDING, COMPLETED, FAILED |
| amount | text | string decimal |
| asset_code | text | BRL, USDC, XLM, CETES |
| stellar_transaction_hash | text | nullable |
| context | jsonb | operation-specific data |
| created_at | timestamptz | |

**Used by**: Transaction history, receipts

### agent_sessions
| Column | Type | Notes |
|--------|------|-------|
| session_id | text PK | |
| user_id | uuid FK→users | |
| state | jsonb | agent conversation state |
| created_at | timestamptz | |

**Used by**: Agent context persistence, WhatsApp/Telegram flows

### international_transfers
| Column | Type | Notes |
|--------|------|-------|
| transfer_id | text PK | |
| quote_id | text FK→international_transfer_quotes | |
| status | text | QUOTE_CREATED..PAYOUT_COMPLETED |
| brl_amount | text | decimal string |
| pix_payment_id | text | Etherfuse ref |
| stellar_tx_hash | text | settlement proof |
| payout_provider | text | mock/circle/bridge/etherfuse |
| payout_destination | jsonb | USD bank metadata; Circle can include `providerDestinationId`/`circleBankAccountId` for linked bank account execution |
| payout_instruction_id | text | persisted payout instruction reference |
| provider_payout_id | text | provider-side payout reference |
| payout_status | text | instruction_created/pending/completed/failed/cancelled |
| reconciliation_metadata | jsonb | full reconciliation evidence |
| created_at | timestamptz | |

**Used by**: International transfer lifecycle

### international_payout_instructions
| Column | Type | Notes |
|--------|------|-------|
| id | text PK | payout instruction ID |
| transfer_id | text FK→international_transfers | one instruction per transfer |
| provider_name | text | mock/circle/bridge/etherfuse |
| provider_payout_id | text | provider reference; unique with provider |
| status | text | instruction_created/pending/completed/failed/cancelled |
| execution_mode | text | mock/proof/compatibility/sandbox_api/live_api/wise_metadata_only |
| amount_usd | text | decimal string |
| destination_metadata | jsonb | redacted destination metadata |
| settlement_evidence | jsonb | Stellar hash/memo/asset evidence |
| provider_request | jsonb | redacted provider request payload |
| provider_response | jsonb | redacted provider response payload |
| status_history | jsonb | normalized payout observations |

**Used by**: Circle payout foundation, payout evidence endpoint, webhook lookup.

### international_payout_events
| Column | Type | Notes |
|--------|------|-------|
| id | text PK | internal event ID |
| transfer_id | text FK→international_transfers | |
| payout_instruction_id | text FK→international_payout_instructions | |
| provider_name | text | mock/circle/bridge/etherfuse |
| provider_event_id | text | unique with provider for idempotency |
| provider_payout_id | text | provider reference |
| status | text | normalized payout status |
| event_type | text | provider event type |
| evidence | jsonb | redacted webhook payload |
| occurred_at | timestamptz | provider event time |

**Used by**: Circle/Bridge/Etherfuse payout webhook idempotency and status transitions.

### transfers (NEW — D1)
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| public_ref | text unique | TTS-YYYY-NNNNNN |
| state | transfer_state enum | CREATED..RECONCILED |
| state_version | integer | optimistic locking |
| source_endpoint | jsonb | {institution_type, masked_identifier} |
| destination_endpoint | jsonb | {provider_type, country, masked_account} |
| amount_brl_in | text | decimal string |
| amount_usdc_settled | text | decimal string |
| amount_usd_out_expected | text | decimal string |
| quote | jsonb | {rate, fee_breakdown[], expires_at, source} |
| pix | jsonb | {charge_id, e2e_id, paid_at, payer_masked, provider} |
| stellar | jsonb | {tx_hash, ledger, network, settled_at, asset, path_used} |
| payout | jsonb | {routing_status, provider_hint, reference_id, same_name_check} |
| reconciliation | jsonb | {amounts_match, fees_total[], discrepancies[], reconciled_by} |
| legacy_transfer_id | text | FK to international_transfers |
| created_at | timestamptz | |
| updated_at | timestamptz | auto-updated trigger |

**Used by**: TransferOrchestrator (D1), ops dashboard, `GET /api/transfers`.
**Migration**: `backend/migrations/20260613_00_full_schema.sql`
**Notes**: `public_ref` is generated by PostgreSQL sequence `transfer_public_ref_seq` through `generate_transfer_public_ref()`. State writes use optimistic locking via `state_version`.

### transfer_events (NEW — D1)
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| transfer_id | uuid FK→transfers | CASCADE delete |
| from_state | transfer_state | nullable (null for creation) |
| to_state | transfer_state | |
| event_type | text | transfer_created, pix_funding_confirmed, etc |
| payload | jsonb | event-specific data |
| actor | text | whatsapp_bot/telegram_bot/api/system/webhook/poller |
| correlation_id | text | |
| created_at | timestamptz | |

**Used by**: Audit trail, ops dashboard timeline
**Migration**: `backend/migrations/20260613_00_full_schema.sql`
**Append-only guard**: `prevent_transfer_events_mutation()` rejects update/delete.

### Ops transaction-history read model

`backend/src/api/repository/ops-history.repository.ts` is a read-only application-level aggregation across:

- `transfers` — normalized D1 lifecycle records.
- `international_transfers` — BRL/USD institutional transfer records.
- `operations` — PIX, conversion, send, off-ramp, investment, and other internal operations.
- `payment_logs` — detailed Stellar payment and conversion logs.

The repository pages through every source, normalizes rows into one operational-history shape, sorts newest-first, and reports source-specific query errors. It does not create a new database table or hide source-table identity.

**Used by**: `/ops`, `GET /api/ops/history`

### D1 transfer lifecycle RPCs
| Function | Purpose |
|----------|---------|
| `create_transfer_with_event(...)` | Creates a `transfers` row and its initial `transfer_created` event atomically. |
| `transition_transfer(...)` | Locks the transfer row, checks `state_version`, updates state/metadata, and inserts one `transfer_events` row in the same DB transaction. |

**Rollback**: No repository rollback migration. Restore from a database backup or use a reviewed incident-specific rollback.

### bridge_pix_ach_orders
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| status | text | awaiting_pix..completed |
| pixVirtualAccountId | text | Bridge.xyz ref |
| created_at | timestamptz | |

**Used by**: Bridge.xyz PIX→ACH flow (alternate rail)

### conversion_rules
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| wallet_id | uuid FK→wallets | |
| from_asset_code | text | |
| to_asset_code | text | |
| min_amount | text | |
| enabled | boolean | |

**Used by**: Auto-conversion rules (onboarding)

### audit_events
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| session_id | text | |
| event_type | text | |
| metadata | jsonb | |
| created_at | timestamptz | |

**Used by**: General audit logging

### early_access_signups
| Column | Type | Notes |
|--------|------|-------|
| id | uuid PK | |
| email | text unique | lowercased by `EarlyAccessSignupService`; RLS-protected |
| status | text | `subscribed` or `unsubscribed` |
| locale | text | `pt-BR` or `en` |
| source | text | defaults to `landing-reluca` |
| campaign | text | optional campaign/source attribution |
| referrer | text | optional browser referrer |
| page_url | text | optional page URL that submitted the form |
| metadata_json | jsonb | shallow component metadata |
| subscribed_at | timestamptz | first subscription timestamp |
| last_subscribed_at | timestamptz | latest submission timestamp |
| unsubscribed_at | timestamptz | reserved for future unsubscribe handling |
| created_at | timestamptz | |
| updated_at | timestamptz | trigger-maintained |

**Used by**: Landing early-access email list.
**Write path**: `frontend/components/landing-reluca/EarlyAccessSignup.tsx` → `frontend/app/api/early-access/route.ts` → `backend/src/api/routes/early-access.router.ts` → `backend/src/api/services/early-access-signup.service.ts`.
**Migration**: `backend/migrations/20260613_00_full_schema.sql`
**RLS**: Enabled; service role has table access. Browser roles have no direct table permissions.

## Flow → Table Mapping

| Flow | Tables Touched |
|------|---------------|
| On-ramp (PIX→balance) | agent_sessions, wallets, operations, international_transfers, international_transfer_quotes |
| Conversion | wallets, operations, conversion_rules |
| Send | contacts, wallets, operations |
| Off-ramp | wallets, operations |
| Investments | wallets, operations |
| Orchestration (D1) | transfers, transfer_events, international_transfers via `legacy_transfer_id` bridge |
| Ops complete transaction history | reads transfers, international_transfers, operations, payment_logs |
| Landing early-access signup | early_access_signups |
