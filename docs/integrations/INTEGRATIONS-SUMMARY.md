# Talk to Stellar — Integrations Summary

Definitive reference for all external integrations in the Talk to Stellar project — a WhatsApp-native payment product. One section per integration: what it does, where the code lives, which endpoints it owns, and what environment variables it needs.

---

## Overview Table

| Integration | Route Prefix | Purpose | Status |
|---|---|---|---|
| Bridge.xyz | `/api/bridge`, `/webhook/bridge` | Fiat anchor: PIX/ACH/SEPA/SPEI ↔ USDC, KYC, virtual accounts, liquidation addresses | Production |
| Stellar Wallets | `/api/stellar` | Creates funded Stellar keypairs with USDC trustline per user | Production |
| Payment Watcher | `/api/payment-watcher` | Horizon SSE listener — pushes WhatsApp notifications on USDC/XLM receipt | Production |
| SEP-7 Payment Links | `/api/pay-links` | Generates short URLs wrapping `web+stellar:pay?...` URIs for WhatsApp sharing | Production |
| Fraud Screening | `/api/fraud-screen` | Pre-payment check against StellarExpert directory for malicious addresses | Production |
| DeFindex Yield | `/api/defindex` | Non-custodial USDC yield via Blend Protocol on Stellar — returns unsigned XDR | Built — needs env vars |
| Passkey Smart Wallets | `/api/passkey-wallets` | Soroban smart wallets secured by WebAuthn (Face ID / Touch ID), fee relay via Launchtube | Built — needs env vars |
| SEP-24 Anchor | `/api/sep24` | Interactive deposit/withdrawal sessions with MoneyGram, Vibrant, Anclap | Built — deprioritized |
| SEP-10 Wallet Auth | `/api/wallet-auth` | Authenticate users via Stellar wallet signature (Freighter, Albedo, xBull) | Built — deprioritized |
| Evolution API | `/api/evolution`, `/webhook/evolution` | WhatsApp backbone: inbound/outbound messages, webhook processing, AI agent routing | Production |

---

## Bridge.xyz

**Purpose:** Stripe-owned stablecoin orchestration platform. Handles all fiat on/off-ramp flows: BRL (PIX), USD (ACH/wire/RTP/FedNow), EUR (SEPA/SEPA Instant), MXN (SPEI), and GBP (Faster Payments). Manages customer KYC, external bank accounts, liquidation addresses, virtual accounts, and transfers.

### Files

| File | Role |
|---|---|
| `backend/src/integrations/bridge/config.ts` | `loadBridgeConfig()` — reads all env vars, exposes per-rail limits |
| `backend/src/integrations/bridge/types.ts` | Full type definitions for customers, transfers, VAs, external accounts, webhooks |
| `backend/src/integrations/bridge/service.ts` | API client wrapping every Bridge.xyz endpoint |
| `backend/src/integrations/bridge/index.ts` | Exports `initBridgeService()` called at boot |
| `backend/src/api/controllers/bridge.controller.ts` | Request handlers |
| `backend/src/api/routes/bridge.router.ts` | Route registration |
| `backend/src/api/routes/bridge-webhook.router.ts` | Webhook receiver (signature verification) |

### Endpoints

- `POST /api/bridge/customers` — create individual KYC customer
- `POST /api/bridge/customers/business` — create business KYC customer
- `PUT /api/bridge/customers/:id` — update customer
- `GET /api/bridge/customers/:id` — get customer
- `GET /api/bridge/customers/by-email` — find by email
- `POST /api/bridge/customers/:id/sync` — re-sync from Bridge API
- `POST /api/bridge/customers/:id/kyc-link` — generate KYC link
- `POST /api/bridge/customers/:id/pix-kyc-link` — PIX-specific KYC link
- `GET /api/bridge/customers/:id/readiness` — check KYC + account readiness
- `POST /api/bridge/customers/:id/external-accounts/pix-key` — register PIX key
- `POST /api/bridge/customers/:id/external-accounts/us-bank` — register US bank account
- `POST /api/bridge/customers/:id/external-accounts/iban` — register IBAN (SEPA)
- `POST /api/bridge/customers/:id/external-accounts/clabe` — register CLABE (SPEI)
- `GET /api/bridge/customers/:id/external-accounts` — list external accounts
- `GET /api/bridge/external-accounts/:id` — get external account
- `DELETE /api/bridge/external-accounts/:id` — delete external account
- `POST /api/bridge/external-accounts/:id/deactivate` — deactivate external account
- `POST /api/bridge/customers/:id/liquidation-addresses/pix` — create PIX liquidation address
- `POST /api/bridge/customers/:id/liquidation-addresses` — create any-rail liquidation address
- `GET /api/bridge/customers/:id/liquidation-addresses` — list liquidation addresses
- `GET /api/bridge/customers/:id/liquidation-addresses/:liquidationAddressId` — get one
- `POST /api/bridge/customers/:id/virtual-accounts/brl` — create BRL virtual account (PIX on-ramp)
- `POST /api/bridge/customers/:id/virtual-accounts/usd` — USD virtual account (ACH on-ramp)
- `POST /api/bridge/customers/:id/virtual-accounts/eur` — EUR virtual account (SEPA on-ramp)
- `POST /api/bridge/customers/:id/virtual-accounts/mxn` — MXN virtual account (SPEI on-ramp)
- `POST /api/bridge/customers/:id/virtual-accounts/gbp` — GBP virtual account (Faster Payments on-ramp)
- `POST /api/bridge/customers/:id/virtual-accounts/cop` — COP virtual account (Colombia on-ramp)
- `GET /api/bridge/customers/:id/virtual-accounts` — list VAs from Bridge API
- `GET /api/bridge/customers/:id/virtual-accounts/cached` — list VAs from DB cache
- `GET /api/bridge/virtual-accounts/:id` — get VA
- `POST /api/bridge/virtual-accounts/:id/deactivate` — deactivate VA
- `POST /api/bridge/virtual-accounts/:id/reactivate` — reactivate VA
- `GET /api/bridge/customers/:id/virtual-accounts/:vaId/activity` — VA event history
- `POST /api/bridge/transfers/crypto-to-pix` — USDC → BRL via PIX
- `POST /api/bridge/transfers/crypto-to-ach` — USDC → USD via ACH
- `POST /api/bridge/transfers/crypto-to-wire` — USDC → USD via wire
- `POST /api/bridge/transfers/crypto-to-rtp` — USDC → USD via RTP
- `POST /api/bridge/transfers/crypto-to-sepa` — USDC → EUR via SEPA
- `POST /api/bridge/transfers/crypto-to-spei` — USDC → MXN via SPEI
- `POST /api/bridge/transfers` — generic transfer
- `GET /api/bridge/transfers` — list all transfers
- `GET /api/bridge/transfers/:id` — get transfer
- `POST /api/bridge/transfers/:id/sync` — sync transfer status from Bridge
- `DELETE /api/bridge/transfers/:id` — cancel transfer
- `GET /api/bridge/customers/:id/transfers` — list transfers for customer
- `GET /api/bridge/exchange-rates` — get exchange rate
- `POST /api/bridge/estimate` — estimate payout for a transfer
- `GET /api/bridge/static-memos` — list static memos
- `POST /api/bridge/static-memos` — create static memo
- `GET /api/bridge/static-memos/:id` — get static memo
- `DELETE /api/bridge/static-memos/:id` — delete static memo
- `POST /api/bridge/customers/:id/wallets` — create Bridge custodial wallet (non-Stellar chains)
- `GET /api/bridge/customers/:id/wallets` — list wallets from Bridge
- `GET /api/bridge/customers/:id/wallets/cached` — list wallets from DB
- `GET /api/bridge/customers/:id/wallets/:walletId` — get wallet
- `GET /api/bridge/wallets/:walletId` — get global wallet
- `GET /api/bridge/wallets/balances` — get wallet balances
- `GET /api/bridge/wallets/:walletId/transactions` — wallet transaction history
- `GET /api/bridge/webhooks` — list configured webhooks
- `POST /api/bridge/webhooks` — create webhook
- `GET /api/bridge/webhooks/:id` — get webhook
- `PUT /api/bridge/webhooks/:id` — update webhook
- `DELETE /api/bridge/webhooks/:id` — delete webhook
- `POST /webhook/bridge` — receive Bridge webhook events (signature-verified)

### Env Vars

| Variable | Required | Notes |
|---|---|---|
| `BRIDGE_API_KEY` | Yes | Bridge API key |
| `BRIDGE_API_URL` | No | Default: `https://api.bridge.xyz/v0` |
| `BRIDGE_WEBHOOK_SECRET` | Yes (prod) | Signature verification for `/webhook/bridge` |
| `BRIDGE_WEBHOOK_PUBLIC_KEY` | No | Alternative webhook verification |
| `BRIDGE_WEBHOOK_ID` | No | ID of the configured webhook in Bridge |
| `APP_PUBLIC_WEBHOOK_URL` | No | Public URL Bridge calls for webhooks |
| `BRIDGE_ENABLED` | No | Feature flag; default true in non-prod |
| `BRIDGE_SANDBOX` | No | Use sandbox environment; default true in non-prod |
| `BRIDGE_ENABLE_MAINNET_MONEY_MOVEMENT` | No | Default true when API key present |
| `BRIDGE_REQUIRE_MANUAL_CONFIRMATION` | No | Default false |
| `BRIDGE_DEVELOPER_FEE` | No | Default `0.30` (%) |
| `BRIDGE_MIN_BRL_AMOUNT` / `BRIDGE_MAX_BRL_AMOUNT` | No | Default 10 / 50000 |
| `BRIDGE_MIN_USDC_AMOUNT` / `BRIDGE_MAX_USDC_AMOUNT` | No | Default 5 / 10000 |

### DB Tables

- `bridge_customers` — cached Bridge customer records + KYC status
- `bridge_external_accounts` — registered bank/PIX/IBAN/CLABE accounts
- `bridge_liquidation_addresses` — auto-drain Stellar → fiat addresses
- `bridge_virtual_accounts` — fiat deposit instructions per currency
- `bridge_va_cache` — VA data cache to reduce API calls
- `bridge_transfers` — transfer records with state tracking
- `bridge_webhook_events` — raw webhook event log
- `bridge_exchange_rate_estimates` — cached rate estimates
- `bridge_custodial_wallets` — Bridge-hosted wallets (Base/Ethereum/Solana/Tempo/Tron)

### Status

**Production** — all fiat rails implemented. KYC approval from Bridge required before live PIX on-ramp works. Sandbox available for development.

---

## Stellar Wallets

**Purpose:** Creates a funded Stellar keypair for each user with a USDC trustline established. The generated wallet is the user's non-custodial Stellar address for receiving and sending USDC within the product.

### Files

| File | Role |
|---|---|
| `backend/src/api/controllers/stellar-wallets.controller.ts` | `createWallet`, `listWallets`, `deleteWallet` handlers |
| `backend/src/api/routes/stellar-wallets.router.ts` | Route registration |

### Endpoints

- `POST /api/stellar/wallets` — create a new Stellar keypair, fund via sponsor, establish USDC trustline
- `GET /api/stellar/wallets` — list wallets (query: `userId`)
- `DELETE /api/stellar/wallets/:id` — remove wallet record

### Env Vars

| Variable | Required | Notes |
|---|---|---|
| `STELLAR_WALLET_SPONSOR_SECRET` | Yes | Stellar secret key of the sponsor account that funds new wallets |
| `STELLAR_NETWORK` | No | `testnet` (default) or `mainnet` |

### DB Tables

- `user_stellar_wallets` — maps user IDs to Stellar public keys

### Status

**Production** — auto-subscribes newly created wallets to the Payment Watcher at creation time.

---

## Payment Watcher

**Purpose:** Singleton service that monitors all user Stellar wallets via Horizon SSE streams and sends a WhatsApp push notification whenever USDC or XLM arrives.

### Files

| File | Role |
|---|---|
| `backend/src/integrations/payment-watcher/service.ts` | Core SSE logic, phone lookup, Evolution API call |
| `backend/src/integrations/payment-watcher/index.ts` | Exports singleton `paymentWatcher` |
| `backend/src/api/controllers/payment-watcher.controller.ts` | Status/subscribe/unsubscribe handlers |
| `backend/src/api/routes/payment-watcher.router.ts` | Route registration |

### Endpoints

- `GET /api/payment-watcher/status` — returns active watcher count and list of watched addresses
- `POST /api/payment-watcher/subscribe` — body: `{ publicKey }` — opens SSE stream for address
- `DELETE /api/payment-watcher/unsubscribe/:publicKey` — closes SSE stream for address

### Env Vars

| Variable | Required | Notes |
|---|---|---|
| `EVOLUTION_API_URL` | Yes | Used to send WhatsApp notifications on payment receipt |
| `EVOLUTION_INSTANCE` | Yes | Evolution instance name |
| `EVOLUTION_API_KEY` | Yes | Evolution auth key |
| `STELLAR_NETWORK` | No | Determines which Horizon endpoint to connect to |

### DB Tables

None. Uses `wallets`, `user_stellar_wallets`, and `agent_sessions` for phone number resolution.

### Status

**Production** — starts automatically at boot via `paymentWatcher.start()`. Reconnects after 30-second delay on SSE error. Only USDC and XLM payments trigger notifications; other assets are silently ignored.

---

## SEP-7 Payment Links

**Purpose:** Generates SEP-7 `web+stellar:pay?...` URIs wrapped in short HTTPS URLs for sharing in WhatsApp. Tapping the link opens the recipient's Stellar wallet app with destination, amount, and memo pre-filled.

### Files

| File | Role |
|---|---|
| `backend/src/integrations/payment-links/service.ts` | URI builder and DB CRUD (`create`, `get`, `list`, `delete`, `recordUse`) |
| `backend/src/integrations/payment-links/types.ts` | `CreatePaymentLinkInput`, `Sep7PaymentLink` types |
| `backend/src/integrations/payment-links/index.ts` | Re-exports service |
| `backend/src/api/controllers/payment-links.controller.ts` | Request handlers |
| `backend/src/api/routes/payment-links.router.ts` | Route registration |

### Endpoints

- `POST /api/pay-links` — create a link; body: `{ destination, amount, asset_code, asset_issuer, memo, label, created_by }`
- `GET /api/pay-links/:id` — fetch a single link
- `GET /api/pay-links` — list links for an address (query: `address`)
- `DELETE /api/pay-links/:id` — delete a link
- `GET /api/pay-links/:id/redirect` — 302 redirect to SEP-7 URI; increments `times_used`

### Env Vars

| Variable | Required | Notes |
|---|---|---|
| `NEXT_PUBLIC_BACKEND_URL` or `APP_URL` | No | Base for `short_url`; defaults to `https://talktostellar.com` |
| `STELLAR_NETWORK` | No | Controls whether `network_passphrase` is appended |

### DB Tables

- `payment_links` — `id` (12-char PK), `stellar_address`, `amount`, `asset_code`, `asset_issuer`, `memo`, `uri`, `short_url`, `expires_at`, `times_used`, `created_at`

### Status

**Production** — USDC issuer defaults to Circle mainnet issuer when not provided. `times_used` incremented via `increment_payment_link_use` Postgres RPC.

---

## Fraud Screening

**Purpose:** Pre-payment address check against the StellarExpert public directory. Blocks payments to addresses tagged `malicious`; warns on exchanges and anchors. Fail-open: API unavailability does not block the payment.

### Files

| File | Role |
|---|---|
| `backend/src/integrations/fraud-screening/service.ts` | Core screening logic, 1-hour in-memory cache, StellarExpert fetch |
| `backend/src/integrations/fraud-screening/index.ts` | Exports `screenAddress()` |
| `backend/src/api/controllers/fraud-screening.controller.ts` | Request handlers |
| `backend/src/api/routes/fraud-screening.router.ts` | Route registration |

### Endpoints

- `GET /api/fraud-screen/address/:address` — screen one address; query: `network`
- `GET /api/fraud-screen/domain/:domain` — screen by domain
- `POST /api/fraud-screen/batch` — screen multiple addresses; body: `{ addresses: string[] }`

### Env Vars

None. Calls `https://stellar.expert/api/explorer/directory/{address}` — no auth required.

### DB Tables

None. Results are cached in memory (1-hour TTL).

### Status

**Production** — integrated into the outbound payment confirmation flow. Portuguese-language `warning` field is shown directly to WhatsApp users when `blocked === true`.

---

## DeFindex Yield

**Purpose:** Non-custodial USDC yield routing via Blend Protocol on Stellar (~8.6% APY). The backend builds unsigned XDRs for deposit/withdraw; the user signs them in their own wallet. Funds never touch the backend.

### Files

| File | Role |
|---|---|
| `backend/src/integrations/defindex/config.ts` | `loadDefindexConfig()`, vault addresses per network |
| `backend/src/integrations/defindex/service.ts` | SDK wrapper, `buildDepositXdr`, `buildWithdrawXdr`, `getBalance`, `getVaultInfo` |
| `backend/src/integrations/defindex/index.ts` | Exports |
| `backend/src/api/controllers/defindex.controller.ts` | Request handlers |
| `backend/src/api/routes/defindex.router.ts` | Route registration |

### Endpoints

- `GET /api/defindex/vaults` — list available vaults from DeFindex API
- `GET /api/defindex/vault/info?vault=<ADDRESS>` — vault APY, TVL, strategy details
- `GET /api/defindex/vaults/:vault/info` — same, path-param form
- `GET /api/defindex/vault/balance?userAddress=G...` — user's USDC position in vault
- `POST /api/defindex/vault/deposit` — body: `{ userAddress, amountStroops }` → returns `{ xdr }`
- `POST /api/defindex/vault/withdraw` — body: `{ userAddress, sharesAmount }` → returns `{ xdr }`

### Env Vars

| Variable | Required | Notes |
|---|---|---|
| `DEFINDEX_API_KEY` | No | Free tier available at defindex.io |
| `DEFINDEX_API_URL` | No | Default: `https://api.defindex.io` |
| `STELLAR_NETWORK` | Yes | `mainnet` or `testnet` |

### DB Tables

None. Balances fetched live from Stellar.

### Status

**Built — needs env vars** — `DEFINDEX_API_KEY` required for production. Daily WhatsApp yield notifications in BRL planned. Vault address: `CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYW` (verify at `https://api.defindex.io/vaults`).

---

## Passkey Smart Wallets

**Purpose:** Soroban smart contract wallets secured by WebAuthn (Face ID, Touch ID, hardware keys). No seed phrase. Fee sponsoring via Launchtube means users transact without holding XLM. Built on `passkey-kit` by kalepail.

### Files

| File | Role |
|---|---|
| `backend/src/integrations/passkey-wallets/service.ts` | `register`, `getContractId`, `relayTransaction`, `getBalance`, `getSigners` |
| `backend/src/integrations/passkey-wallets/types.ts` | `PasskeyWalletRecord`, `PasskeyWalletCreateInput` |
| `backend/src/integrations/passkey-wallets/index.ts` | Exports |
| `backend/src/api/controllers/passkey-wallets.controller.ts` | Request handlers |
| `backend/src/api/routes/passkey-wallets.router.ts` | Route registration |

### Endpoints

- `POST /api/passkey-wallets/register` — body: `{ user_id, contract_id, key_id_base64, label? }` — stores wallet record after browser-side WebAuthn credential creation
- `GET /api/passkey-wallets/contract-id?keyId=<base64url>` — resolve `contractId` from `keyId`
- `POST /api/passkey-wallets/relay` — body: `{ signedXdr }` — submits signed XDR via Launchtube; returns `{ success, hash }`
- `GET /api/passkey-wallets/:contractId/balance` — XLM and USDC balances from Horizon
- `GET /api/passkey-wallets/:contractId/signers` — list WebAuthn signers on the contract
- `GET /api/passkey-wallets?userId=<string>` — list all wallets for a user

### Env Vars

| Variable | Required | Notes |
|---|---|---|
| `LAUNCHTUBE_JWT` | Yes | Auth token from launchtube.xyz for fee relay |
| `LAUNCHTUBE_URL` | No | Default: `https://launchtube.xyz` (mainnet) or testnet equivalent |
| `STELLAR_NETWORK` | No | Selects Soroban RPC endpoint |

### DB Tables

- `passkey_wallets` — `contract_id` (PK), `user_id`, `key_id_base64`, `label`, `funded`, `created_at`

### Status

**Built — needs env vars** — `LAUNCHTUBE_JWT` required. Passkeys are origin-bound: credentials created on `app.example.com` cannot be used on a different domain. Frontend test page: `/passkey-wallet-test`.

---

## SEP-24 Anchor

**Purpose:** Interactive deposit/withdrawal sessions with third-party Stellar anchors (MoneyGram, Vibrant, Anclap). Opens an anchor-hosted iframe/redirect flow for cash in/out. Deprioritized since Bridge.xyz handles fiat more directly, but the integration is fully built.

### Files

| File | Role |
|---|---|
| `backend/src/integrations/sep24/config.ts` | `loadSep24Config()`, `KNOWN_ANCHORS` list |
| `backend/src/integrations/sep24/client.ts` | SEP-10/SEP-24 HTTP client |
| `backend/src/integrations/sep24/service.ts` | Session orchestration |
| `backend/src/integrations/sep24/types.ts` | Type definitions |
| `backend/src/integrations/sep24/index.ts` | Exports |
| `backend/src/api/controllers/sep24.controller.ts` | Request handlers |
| `backend/src/api/routes/sep24.router.ts` | Route registration |

### Endpoints

- `GET /api/sep24/anchors` — list known anchors (MoneyGram, Vibrant, Anclap)
- `GET /api/sep24/anchors/:domain/toml` — fetch anchor's stellar.toml
- `GET /api/sep24/anchors/:domain/info` — fetch anchor's `/info` endpoint
- `POST /api/sep24/auth` — perform SEP-10 authentication with anchor
- `POST /api/sep24/deposit` — start an interactive deposit session
- `POST /api/sep24/withdraw` — start an interactive withdrawal session
- `GET /api/sep24/transactions` — list transactions for an anchor session
- `GET /api/sep24/transactions/:id` — get a specific transaction

### Env Vars

| Variable | Required | Notes |
|---|---|---|
| `STELLAR_WALLET_SPONSOR_SECRET` | Yes | Signs SEP-10 challenge transactions |
| `STELLAR_NETWORK` | No | `testnet` (default) or `mainnet` |

### DB Tables

- `anchor_sessions` — SEP-10 session tokens per anchor per user
- `anchor_transactions` — deposit/withdrawal transaction records from anchor

### Status

**Built — deprioritized** — Bridge.xyz covers PIX/ACH/SEPA natively. SEP-24 remains available for cash-based corridors (MoneyGram physical locations) or regions without Bridge coverage.

---

## SEP-10 Wallet Auth

**Purpose:** Authenticate users via a Stellar wallet signature using the SEP-10 challenge/response protocol. Supports Freighter, Albedo, xBull, and any SEP-10-compliant wallet. Issues a 24-hour JWT on success.

### Files

| File | Role |
|---|---|
| `backend/src/integrations/stellar-wallets-auth/service.ts` | `buildChallenge`, `verifyChallenge`, `verifyToken`, `getSession` |
| `backend/src/integrations/stellar-wallets-auth/types.ts` | `WalletAuthSession`, `WalletAuthVerifyResult` |
| `backend/src/integrations/stellar-wallets-auth/index.ts` | Exports |
| `backend/src/api/controllers/wallet-auth.controller.ts` | Request handlers |
| `backend/src/api/routes/wallet-auth.router.ts` | Route registration |

### Endpoints

- `GET /api/wallet-auth/challenge?account=G...` — returns unsigned challenge XDR + `network_passphrase`
- `POST /api/wallet-auth/verify` — body: `{ signedXdr, account, walletType? }` — returns `{ token, expires_at, stellar_address }`
- `GET /api/wallet-auth/session?address=G...` — fetch active session for address
- `POST /api/wallet-auth/validate` — validate an existing JWT token

### Env Vars

| Variable | Required | Notes |
|---|---|---|
| `STELLAR_WALLET_SPONSOR_SECRET` | Yes | Server keypair that signs challenge transactions |
| `JWT_SECRET` or `SUPABASE_JWT_SECRET` | Yes | Signs issued JWT tokens; falls back to `dev-secret-change-in-prod` |
| `APP_DOMAIN` | No | Included in challenge as `web_auth_domain`; defaults to `talktostellar.com` |
| `STELLAR_NETWORK` | No | `testnet` (default) or `mainnet` |

### DB Tables

- `wallet_auth_sessions` — `stellar_address` (unique), `token`, `wallet_type`, `expires_at`, `created_at`

### Status

**Built — deprioritized** — the primary auth path uses phone number + PIN via WhatsApp. Wallet auth is available for web/DApp flows where a browser wallet is present.

---

## Evolution API

**Purpose:** WhatsApp messaging backbone for the entire product. Handles all inbound user messages (routing to the AI agent), outbound message delivery (payment notifications, confirmations, daily summaries), webhook ingestion from Evolution, and auto-configuration of the webhook endpoint on startup.

### Files

| File | Role |
|---|---|
| `backend/src/api/services/notifications/evolution.service.ts` | Full service: send text, webhook processing, inbound/outbound queue workers, deduplication, auto-config |
| `backend/src/api/controllers/evolution.controller.ts` | HTTP handlers |
| `backend/src/api/routes/evolution.router.ts` | Route registration (mounted at both `/api/evolution` and `/webhook/evolution`) |

### Endpoints

- `GET /api/evolution/health` — Evolution API connectivity check
- `POST /api/evolution/test-send` — send a test WhatsApp message
- `POST /api/evolution/test-notify` — send a test notification
- `POST /api/evolution/outbox/drain` — manually trigger outbound delivery worker
- `POST /api/evolution/inbox/drain` — manually trigger inbound processing worker
- `POST /webhook/evolution` — receive inbound WhatsApp webhook events from Evolution
- `POST /webhook/evolution/:event` — receive typed webhook events

### Env Vars

| Variable | Required | Notes |
|---|---|---|
| `EVOLUTION_API_URL` | Yes | Base URL of the Evolution API instance |
| `EVOLUTION_INSTANCE` | Yes | Evolution instance name |
| `EVOLUTION_API_KEY` | Yes | API key for Evolution auth |
| `EVOLUTION_AGENT_URL` | No | URL of the AI agent endpoint; defaults to internal route |
| `EVOLUTION_WEBHOOK_SYNC_PROCESSING` | No | `true` to process webhooks synchronously (default: async queue) |
| `PUBLIC_BACKEND_URL` | Yes (prod) | Public URL registered with Evolution for webhook delivery |

### DB Tables

Uses `agent_sessions` (phone number → session state) and internal queue tables for inbound/outbound message buffering. No dedicated Evolution tables.

### Status

**Production** — central to all user interactions. `startWebhookAutoConfiguration()`, `startInboundWebhookWorker()`, and `startOutboundDeliveryWorker()` are called at boot in `app.ts`. In-memory ring buffer keeps last 20 webhook receipts for diagnostics.

---

## Quick Start — Minimum Env Vars to Run Locally

These are the minimum variables needed to boot the backend with core functionality working:

```env
# Database
SUPABASE_URL=<your-supabase-project-url>
SUPABASE_SERVICE_ROLE_KEY=<service-role-key>

# WhatsApp (Evolution API)
EVOLUTION_API_URL=https://your-evolution-instance.example.com
EVOLUTION_INSTANCE=your-instance-name
EVOLUTION_API_KEY=your-evolution-api-key
PUBLIC_BACKEND_URL=https://your-ngrok-or-tunnel-url

# Stellar
STELLAR_NETWORK=testnet
STELLAR_WALLET_SPONSOR_SECRET=<testnet-funded-keypair-secret>

# AI Agent
OPENAI_API_KEY=<openai-api-key>

# JWT (auth)
JWT_SECRET=dev-secret-change-in-prod

# Bridge.xyz (omit to disable fiat rails)
BRIDGE_API_KEY=<bridge-api-key>
BRIDGE_WEBHOOK_SECRET=<bridge-webhook-secret>
```

Bridge is feature-flagged: omitting `BRIDGE_API_KEY` disables all `/api/bridge` routes without crashing. DeFindex (`DEFINDEX_API_KEY`) and Passkey Wallets (`LAUNCHTUBE_JWT`) can be added later when testing those flows.
