# Bridge.xyz — Integration Status

**Last updated**: 2026-06-18  
**Repo**: https://github.com/rbfcdog/talk-to-stellar · branch `main` · commit `fdf79de`  
**Environment**: MAINNET (live API key) — `sk-live-bbb56c8778670d6f7324754dc7274368`  
**Backend**: Railway — `https://talk-to-stellar-production-e284.up.railway.app`  
**Frontend**: Vercel — Next.js static deploy

---

## Architecture

```
Browser (/bridge-test)
    ↓ POST /api/bridge  (same origin, no CORS)
Next.js API Route (/api/bridge/route.ts)
    ↓ fetch (server-to-server)
Railway Backend (/api/bridge/*)
    ↓ BridgeService → BridgeClient
Bridge.xyz API (https://api.bridge.xyz/v0)
```

The frontend is a static Next.js page. It sends all API calls to a single endpoint `/api/bridge` with an `x-bridge-path` header specifying the target Bridge path. A Next.js serverless function reads the header, forwards the request to the Railway backend, and returns the response. This avoids CORS issues by making all calls same-origin.

---

## Files

### Core Integration (`backend/src/integrations/bridge/`)

| File | Lines | Purpose |
|------|-------|---------|
| `config.ts` | 67 | Loads + validates env vars. 14 mainnet safety flags |
| `client.ts` | 118 | HTTP client — GET/POST/PUT/DELETE with `Api-Key`, idempotency, error parsing |
| `types.ts` | 294 | TypeScript types for all Bridge API resources |
| `service.ts` | 451 | Service layer — customers, KYC, transfers, external accounts, liquidation addresses, virtual accounts, exchange rates |
| `index.ts` | 50 | Module barrel exports |

### API Layer (`backend/src/api/`)

| File | Lines | Purpose |
|------|-------|---------|
| `controllers/bridge.controller.ts` | 581 | HTTP request handlers — 18 controller methods |
| `routes/bridge.router.ts` | 91 | Express router — 16 routes under `/api/bridge` |
| `middlewares/bridge-mainnet.middleware.ts` | 114 | Auth, mainnet gate, amount validation |
| `controllers/bridge-webhook.controller.ts` | ~80 | Webhook handler (pre-existing) |
| `routes/bridge-webhook.router.ts` | 8 | Webhook endpoint at `/webhook/bridge` (pre-existing) |
| `services/bridge-pix-ach.service.ts` | 357 | PIX→ACH state machine (pre-existing) |

### Frontend

| File | Lines | Purpose |
|------|-------|---------|
| `app/bridge-test/page.tsx` | 11 | Next.js page metadata |
| `app/bridge-test/bridge-test-client.tsx` | 570 | Full test UI — 5-step flow |
| `app/api/bridge/route.ts` | 47 | Serverless proxy to Railway backend |

### Docs

| File | Purpose |
|------|---------|
| `bridge/BRIDGE_MAINNET.md` | Full integration docs |
| `bridge/BRIDGE_IMPLEMENTATION_PLAN.md` | Implementation plan |
| `bridge/docs/bridge-errors.md` | Error reference |

---

## API Routes (16 routes, all mounted at `/api/bridge`)

### Customers

| Method | Path | Controller | Status |
|--------|------|-----------|--------|
| `POST` | `/customers` | `createCustomer` | Works |
| `GET` | `/customers/by-email` | `findCustomerByEmail` | Works — searches all customers by email |
| `GET` | `/customers/:id` | `getCustomer` | Works |
| `POST` | `/customers/:id/sync` | `syncCustomer` | Works — syncs from Bridge |
| `POST` | `/customers/:id/kyc-link` | `getKycLink` | Works — returns Persona KYC + ToS URLs |
| `GET` | `/customers/:id/readiness` | `getCustomerReadiness` | Works — shows endorsements, KYC status |

### External Accounts (PIX)

| Method | Path | Controller | Status |
|--------|------|-----------|--------|
| `POST` | `/customers/:id/external-accounts/pix-key` | `createPixKeyExternalAccount` | Blocked by KYC |
| `GET` | `/customers/:id/external-accounts` | `listExternalAccounts` | Works — returns empty array |
| `GET` | `/external-accounts/:externalAccountId` | `getExternalAccount` | Works |
| `DELETE` | `/external-accounts/:externalAccountId` | `deleteExternalAccount` | Works |

### Liquidation Addresses (USDC → PIX)

| Method | Path | Controller | Status |
|--------|------|-----------|--------|
| `POST` | `/customers/:id/liquidation-addresses/pix` | `createPixLiquidationAddress` | Blocked by KYC |
| `GET` | `/customers/:id/liquidation-addresses` | `listLiquidationAddresses` | Works — returns empty array |

### Virtual Accounts (PIX → USDC)

| Method | Path | Controller | Status |
|--------|------|-----------|--------|
| `POST` | `/customers/:id/virtual-accounts/brl` | `createBrlVirtualAccount` | Blocked by KYC |
| `GET` | `/customers/:id/virtual-accounts` | `listVirtualAccounts` | Works — returns empty array |

### Transfers

| Method | Path | Controller | Status |
|--------|------|-----------|--------|
| `POST` | `/transfers/crypto-to-pix` | `createCryptoToPixTransfer` | Blocked by KYC |
| `GET` | `/transfers/:transferId` | `getTransfer` | Works |
| `POST` | `/transfers/:transferId/sync` | `syncTransfer` | Works |

### Exchange Rates & Estimates

| Method | Path | Controller | Status |
|--------|------|-----------|--------|
| `GET` | `/exchange-rates` | `getExchangeRate` | Works — USD↔BRL, COP, EUR, GBP, MXN |
| `POST` | `/estimate` | `estimatePayout` | Works — estimates conversion amount |

---

## Bridge.xyz API — Direct Test Results

All endpoints tested with live API key on 2026-06-18.

| Endpoint | HTTP | Notes |
|----------|------|-------|
| `GET /customers` | 200 | 4 customers found |
| `GET /customers/:id` | 200 | Full data including `tos_link`, endorsements |
| `POST /customers` | 201 | Creates new customer |
| `PUT /customers/:id` | 200 | Updates PII |
| `POST /kyc_links` | 200/409 | Returns Persona URL (409=duplicate, returns existing link) |
| `GET /exchange_rates?from=usd&to=brl` | 200 | Rate: ~5.17 |
| `GET /exchange_rates?from=brl&to=usd` | 200 | Rate: ~0.19 |
| `GET /exchange_rates?from=usd&to=eur` | 200 | |
| `GET /exchange_rates?from=usd&to=mxn` | 200 | |
| `GET /exchange_rates?from=usd&to=gbp` | 200 | |
| `GET /webhooks` | 200 | |
| `GET /transfers` | 200 | |
| `GET /external_accounts` | 200 | |
| `GET /virtual_accounts` | 200 | |
| `GET /liquidation_addresses` | 200 | |
| `GET /static_memos` | 200 | |
| `GET /kyc_links` | 200 | |
| `GET /customers/:id/external_accounts` | 200 | Empty array — no accounts created yet |
| `GET /customers/:id/liquidation_addresses` | 200 | Empty array |
| `GET /customers/:id/transfers` | 200 | Empty array |
| `GET /customers/:id/virtual_accounts` | 200 | Empty array |
| `POST /customers/:id/external_accounts` | 400 | `missing_address_data` — needs KYC |
| `POST /customers/:id/liquidation_addresses` | 400 | `missing_address_data` — needs KYC |
| `POST /customers/:id/virtual_accounts` | 400 | `missing_address_data` — needs KYC |
| `GET /bridge_wallets` | 404 | Not available on this plan |
| `GET /developers/fees` | 404 | Not available on this plan |

---

## KYC Blocker — Detailed

### Customer `a@gmail.com` (ID: `86e0b4c4-6234-4175-8ba3-d2a7595d2f5f`)

**Status**: `not_started` — has not completed any KYC steps.

**Current endorsements**:
- `base`: `incomplete` — needs: terms_of_service_v1, tax_identification_number, address_of_residence, date_of_birth, min_age_18, government_id_document, selfie_verification, post_processing
- `sepa`: `incomplete` — similar requirements

**What works without KYC**:
- Listing customer data
- Getting exchange rates
- Creating new customers
- Getting KYC links (Persona + ToS URLs)

**What requires KYC**:
- Creating PIX external accounts
- Creating liquidation addresses
- Creating virtual accounts
- Creating transfers
- Any money movement

### Steps to unblock

1. **Accept ToS** — Click ToS link returned by KYC endpoint, accept terms
2. **Complete Persona KYC** — Click Persona link, upload ID, take selfie, enter address
3. **Provide CPF + birth date** — `PUT /customers/:id` with `tax_identification_number` + `date_of_birth`
4. **Wait for verification** — Bridge processes KYC (manual review)
5. **Check endorsements** — Once `base: approved`, money movement works

### ToS Link (from customer GET response)
```
https://compliance.bridge.xyz/accept-terms-of-service?customer_id=86e0b4c4-6234-4175-8ba3-d2a7595d2f5f&developer_id=613f92a5-e5e1-4076-9559-d93bcfecb45a
```

### Persona KYC Link (from KYC endpoint)
```
https://bridge.withpersona.com/verify?fields%5Bdeveloper_id%5D=613f92a5-e5e1-4076-9559-d93bcfecb45a&fields%5Bemail_address%5D=a%40gmail.com&...
```

---

## Mainnet Safety Guards

All default to OFF/SAFE:

| Env Var | Default | Purpose |
|---------|---------|---------|
| `BRIDGE_ENABLE_MAINNET_MONEY_MOVEMENT` | `false` | All money movement disabled |
| `BRIDGE_REQUIRE_MANUAL_CONFIRMATION` | `true` | Requires `confirm_mainnet: true` in body |
| `BRIDGE_MIN_BRL_AMOUNT` | `10` | Minimum BRL per transfer |
| `BRIDGE_MAX_BRL_AMOUNT` | `50000` | Maximum BRL per transfer |
| `BRIDGE_MIN_USDC_AMOUNT` | `5` | Minimum USDC per transfer |
| `BRIDGE_MAX_USDC_AMOUNT` | `10000` | Maximum USDC per transfer |
| `BRIDGE_DEFAULT_SOURCE_CHAIN` | `base` | Default blockchain |
| `BRIDGE_DEFAULT_SOURCE_CURRENCY` | `usdc` | Default source currency |
| `BRIDGE_DEFAULT_DESTINATION_RAIL` | `pix` | Default off-ramp |

---

## Key Lessons Learned

1. **Bridge returns `{ count, data: [...] }` for lists** — must unwrap `.data`, not return the response directly
2. **`GET /customers/by-email` route must come before `GET /customers/:id`** — Express matches in order
3. **KYC (Persona flow) is mandatory** for all money movement — cannot be automated via API
4. **`account_type: "pix"` not `"pix_key"`** — real API differs from initial assumptions
5. **`pix_key` is an object `{ pix_key, document_number }`** — not a plain string
6. **`POST /customers` does not accept `country` at top level** — goes in `residential_address`
7. **Exchange rate path is `/exchange_rates?from=X&to=Y`** — not `/exchange_rate?from_currency=...`
8. **Static Next.js pages can't use `next.config.mjs` rewrites** — must use API route proxy
9. **Catch-all `[...path]` API routes fail on Vercel** — use single endpoint with custom header
10. **Idempotency-Key header causes 422 on GET requests** — only needed for POST/PUT/DELETE

---

## What's Ready for Production

- Customer management (create, get, list, find by email)
- KYC link generation (Persona + ToS URLs)
- Exchange rate lookup (5 fiat pairs)
- Payout estimation
- Mainnet safety guards (all off by default)
- Full test UI at `/bridge-test`

## What Needs KYC First

- PIX external account creation (off-ramp destination)
- Liquidation address creation (USDC → PIX reusable deposits)
- Virtual account creation (PIX → USDC on-ramp)
- Transfer creation (one-time payments)
- Webhook event processing

## What's Not Yet Built

- Webhook management UI (CRUD for webhook endpoints)
- Transfer status sync jobs (polling fallback)
- WhatsApp/Telegram UX integration for Bridge flows
- Receipt generation for Bridge payments
- Static memos for recurring payments
- Prefunded accounts
- Bridge wallet management
- Stellar USDC → Bridge deposit integration (end-to-end PIX off-ramp from TalkToStellar wallet)
