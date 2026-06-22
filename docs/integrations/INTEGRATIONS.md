# Talk to Stellar — Integrations Reference

WhatsApp-native payment product built on Stellar. This is the single source of truth for all external integrations: what each one does, where the code lives, and what it exposes.

---

## Overview

| Integration | Route Prefix | Status | Purpose |
|---|---|---|---|
| Evolution API | `/api/evolution`, `/webhook/evolution` | Production | WhatsApp backbone — all messaging, AI routing, webhooks |
| Bridge.xyz | `/api/bridge`, `/webhook/bridge` | Production | Fiat anchor — PIX/ACH/SEPA/SPEI ↔ USDC, KYC, virtual accounts |
| Stellar Wallets | `/api/stellar` | Production | Funded Stellar keypairs with USDC trustline per user |
| Payment Watcher | `/api/payment-watcher` | Production | Horizon SSE → WhatsApp push on USDC/XLM receipt |
| SEP-7 Payment Links | `/api/pay-links` | Production | Short URLs wrapping `web+stellar:pay?...` for WhatsApp sharing |
| Fraud Screening | `/api/fraud-screen` | Production | Pre-payment address check via StellarExpert directory |
| DeFindex Yield | `/api/defindex` | Built — needs `DEFINDEX_API_KEY` | Non-custodial USDC yield via Blend Protocol, returns unsigned XDR |
| Passkey Smart Wallets | `/api/passkey-wallets` | Built — needs `LAUNCHTUBE_JWT` | Soroban wallets secured by WebAuthn, fee relay via Launchtube |
| SEP-24 Anchor | `/api/sep24` | Built — deprioritized | Interactive deposit/withdraw with MoneyGram/Vibrant/Anclap |
| SEP-10 Wallet Auth | `/api/wallet-auth` | Built — deprioritized | Auth via Stellar wallet signature (Freighter, Albedo, xBull) |
| Soroswap DEX | `/api/swap` | Built — no env vars needed | Best-price token swaps across all Stellar DEXes (Soroswap, Phoenix, Aqua, SDEX) |
| Reflector Oracle | `/api/oracle` | Production | Decentralized on-chain price feeds — XLM/USD, BRL/USD, EURC/USD |
| CCTP Cross-Chain | `/api/cctp` | Built — needs `CCTP_STELLAR_CONTRACT_ADDRESS` | Receive native USDC from Ethereum/Base/Solana/Polygon directly to Stellar |

---

## Evolution API

WhatsApp messaging backbone. Every user interaction flows through here.

**Files:** `backend/src/api/services/evolution.service.ts` · controller + router at `api/controllers/evolution.controller.ts`

**Boot:** `app.ts` calls `startWebhookAutoConfiguration()`, `startInboundWebhookWorker()`, `startOutboundDeliveryWorker()` on startup.

**Endpoints:**
- `POST /webhook/evolution` — receives all inbound WhatsApp events from Evolution
- `GET /api/evolution/health` — connectivity check
- `POST /api/evolution/test-send` — send test message
- `POST /api/evolution/outbox/drain` — manually flush outbound queue
- `POST /api/evolution/inbox/drain` — manually flush inbound queue

**Key env vars:** `EVOLUTION_API_URL`, `EVOLUTION_INSTANCE`, `EVOLUTION_API_KEY`, `PUBLIC_BACKEND_URL`

---

## Bridge.xyz

Fiat anchor for all supported payment rails. Handles KYC, bank account registration, virtual accounts (fiat deposit instructions), liquidation addresses (auto-drain Stellar → fiat), and transfers.

**Files:** `backend/src/integrations/bridge/` — `config.ts`, `types.ts`, `service.ts`, `index.ts` · `api/controllers/bridge.controller.ts` + `bridge-webhook.router.ts`

**Boot:** `initBridgeService()` called at startup. Webhook signature verified at `/webhook/bridge`.

**Endpoints (by resource):**

*Customers / KYC*
- `POST /api/bridge/customers` — create individual KYC customer
- `POST /api/bridge/customers/business` — create business customer
- `PUT /api/bridge/customers/:id` — update customer
- `GET /api/bridge/customers/:id` — get customer
- `GET /api/bridge/customers/by-email` — lookup by email
- `POST /api/bridge/customers/:id/sync` — re-sync from Bridge API
- `POST /api/bridge/customers/:id/kyc-link` — generate KYC link
- `POST /api/bridge/customers/:id/pix-kyc-link` — PIX-specific KYC link
- `GET /api/bridge/customers/:id/readiness` — check KYC + account readiness

*External Accounts (bank / PIX / IBAN / CLABE)*
- `POST /api/bridge/customers/:id/external-accounts/pix-key`
- `POST /api/bridge/customers/:id/external-accounts/us-bank`
- `POST /api/bridge/customers/:id/external-accounts/iban`
- `POST /api/bridge/customers/:id/external-accounts/clabe`
- `GET /api/bridge/customers/:id/external-accounts`
- `GET /api/bridge/external-accounts/:id`
- `DELETE /api/bridge/external-accounts/:id`
- `POST /api/bridge/external-accounts/:id/deactivate`

*Liquidation Addresses*
- `POST /api/bridge/customers/:id/liquidation-addresses/pix`
- `POST /api/bridge/customers/:id/liquidation-addresses`
- `GET /api/bridge/customers/:id/liquidation-addresses`

*Virtual Accounts (fiat on-ramp deposit instructions)*
- `POST /api/bridge/customers/:id/virtual-accounts/brl` — PIX on-ramp
- `POST /api/bridge/customers/:id/virtual-accounts/usd` — ACH on-ramp
- `POST /api/bridge/customers/:id/virtual-accounts/eur` — SEPA on-ramp
- `POST /api/bridge/customers/:id/virtual-accounts/mxn` — SPEI on-ramp
- `POST /api/bridge/customers/:id/virtual-accounts/gbp` — Faster Payments
- `POST /api/bridge/customers/:id/virtual-accounts/cop` — Colombia
- `GET /api/bridge/customers/:id/virtual-accounts` — list from Bridge API
- `GET /api/bridge/customers/:id/virtual-accounts/cached` — list from DB cache

*Transfers (crypto → fiat)*
- `POST /api/bridge/transfers/crypto-to-pix` — USDC → BRL
- `POST /api/bridge/transfers/crypto-to-ach` — USDC → USD ACH
- `POST /api/bridge/transfers/crypto-to-wire` — USDC → USD wire
- `POST /api/bridge/transfers/crypto-to-sepa` — USDC → EUR
- `POST /api/bridge/transfers/crypto-to-spei` — USDC → MXN
- `POST /api/bridge/transfers` — generic
- `GET /api/bridge/transfers` — list all
- `GET /api/bridge/transfers/:id` — get one
- `POST /api/bridge/transfers/:id/sync` — sync status
- `DELETE /api/bridge/transfers/:id` — cancel

*Rates / Misc*
- `GET /api/bridge/exchange-rates`
- `POST /api/bridge/estimate`
- `GET/POST/DELETE /api/bridge/static-memos`
- `POST /webhook/bridge` — Bridge webhook receiver (signature-verified)

**DB tables:** `bridge_customers`, `bridge_external_accounts`, `bridge_liquidation_addresses`, `bridge_virtual_accounts`, `bridge_va_cache`, `bridge_transfers`, `bridge_webhook_events`, `bridge_exchange_rate_estimates`, `bridge_custodial_wallets`

**Key env vars:** `BRIDGE_API_KEY`, `BRIDGE_WEBHOOK_SECRET`, `BRIDGE_SANDBOX=true` (dev)

---

## Stellar Wallets

Creates a funded Stellar keypair with USDC trustline for each user. The sponsor account pays ~2 XLM per wallet. Auto-subscribes new wallets to the Payment Watcher.

**Files:** `backend/src/api/controllers/stellar-wallets.controller.ts` · `api/routes/stellar-wallets.router.ts`

**Endpoints:**
- `POST /api/stellar/wallets` — generate keypair, fund via sponsor, add USDC trustline
- `GET /api/stellar/wallets?userId=...` — list wallets for user
- `DELETE /api/stellar/wallets/:id` — remove wallet record

**DB tables:** `user_stellar_wallets`

**Key env vars:** `STELLAR_WALLET_SPONSOR_SECRET`, `STELLAR_NETWORK`

---

## Payment Watcher

Singleton service started at boot. Opens one Horizon SSE stream per wallet. On USDC or XLM receipt, looks up the user's phone number via DB join and sends a WhatsApp notification via Evolution. Auto-reconnects after 30s on error.

**Files:** `backend/src/integrations/payment-watcher/service.ts` + `index.ts` · controller + router

**Phone lookup chain:** `wallets.public_key → wallets.session_id → agent_sessions.phone_number`  
Also: `user_stellar_wallets.user_id → agent_sessions.phone_number`

**Endpoints:**
- `GET /api/payment-watcher/status` — active watcher count + address list
- `POST /api/payment-watcher/subscribe` — body: `{ public_key }`
- `POST /api/payment-watcher/unsubscribe` — body: `{ public_key }`

**Key env vars:** `EVOLUTION_API_URL`, `EVOLUTION_INSTANCE`, `EVOLUTION_API_KEY`, `STELLAR_NETWORK`

---

## SEP-7 Payment Links

Generates `web+stellar:pay?destination=G...&amount=...&asset_code=USDC&...` URIs wrapped in short HTTPS URLs. Tapping the link in WhatsApp opens the user's Stellar wallet with everything pre-filled. `times_used` incremented atomically via Postgres RPC on redirect.

**Files:** `backend/src/integrations/payment-links/` — `service.ts`, `types.ts`, `index.ts` · controller + router

**Endpoints:**
- `POST /api/pay-links` — body: `{ destination, amount, asset_code, memo, label }`
- `GET /api/pay-links/:id` — get link
- `GET /api/pay-links?address=G...` — list links for address
- `DELETE /api/pay-links/:id`
- `GET /api/pay-links/:id/redirect` — 302 to SEP-7 URI, increments counter

**DB tables:** `payment_links` (id, stellar_address, amount, asset_code, uri, short_url, times_used, expires_at)

**Key env vars:** `NEXT_PUBLIC_BACKEND_URL` or `APP_URL` (base for short URLs), `STELLAR_NETWORK`

---

## Fraud Screening

Free, no-auth API from stellar.expert. Screens every recipient address before confirming a payment. Fail-open: if the API is unavailable, the payment is not blocked. Results cached in memory for 1 hour.

**Files:** `backend/src/integrations/fraud-screening/service.ts` + `index.ts` · controller + router

**Tags returned:** `malicious` (blocked), `exchange` (warn), `anchor` (inform), `issuer`, others

**Endpoints:**
- `GET /api/fraud-screen/address/:address?network=mainnet` — screen one address
- `GET /api/fraud-screen/domain/:domain` — screen by domain
- `POST /api/fraud-screen/batch` — body: `{ addresses: string[] }`

**Env vars:** None. Calls `https://stellar.expert/api/explorer/directory/{address}` directly.

---

## DeFindex Yield

Non-custodial USDC yield via Blend Protocol on Stellar (~8.6% APY, June 2026). Backend builds unsigned XDRs; user signs in their wallet and submits. Funds never touch the backend.

**SDK:** `@defindex/sdk` v0.3.0. `DepositParams: { caller, amounts: number[], invest }`. Amounts in stroops (1 USDC = 10_000_000).

**Vault:** `CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYW` (mainnet USDC)

**Files:** `backend/src/integrations/defindex/` — `config.ts`, `service.ts`, `index.ts` · controller + router

**Endpoints:**
- `GET /api/defindex/vaults` — health check / list
- `GET /api/defindex/vault/info?vault=<ADDRESS>` — APY, TVL, strategy
- `GET /api/defindex/vault/balance?userAddress=G...` — user position
- `POST /api/defindex/vault/deposit` — body: `{ userAddress, amountStroops }` → `{ xdr }`
- `POST /api/defindex/vault/withdraw` — body: `{ userAddress, sharesAmount }` → `{ xdr }`

**Key env vars:** `DEFINDEX_API_KEY` (required), `DEFINDEX_API_URL` (default: `https://api.defindex.io`), `STELLAR_NETWORK`

---

## Passkey Smart Wallets

Soroban smart contract wallets secured by WebAuthn (Face ID, Touch ID, security keys). No seed phrase. Fee sponsoring via Launchtube means users pay no XLM. WebAuthn credential creation/signing always happens client-side. Backend handles persistence and transaction relay only.

**Flow:** browser `navigator.credentials.create()` → sends `keyIdBase64` + `contractId` to backend → backend stores, looks up, relays signed XDRs via Launchtube.

**Files:** `backend/src/integrations/passkey-wallets/` — `service.ts`, `types.ts`, `index.ts` · controller + router

**Endpoints:**
- `POST /api/passkey-wallets/register` — body: `{ user_id, contract_id, key_id_base64, label? }`
- `GET /api/passkey-wallets/contract?keyId=<base64url>` — resolve contractId from keyId
- `POST /api/passkey-wallets/relay` — body: `{ signedXdr }` → `{ success, hash }`
- `GET /api/passkey-wallets/:contractId/balance` — XLM + USDC from Horizon
- `GET /api/passkey-wallets/:contractId/signers` — WebAuthn signers on contract
- `GET /api/passkey-wallets?userId=...` — list wallets for user

**DB tables:** `passkey_wallets` (contract_id PK, user_id, key_id_base64, label, funded, network)

**Key env vars:** `LAUNCHTUBE_JWT` (required), `LAUNCHTUBE_URL` (default: `https://launchtube.xyz`), `STELLAR_NETWORK`

---

## Soroswap DEX Aggregator

Aggregates liquidity across every Stellar DEX in a single quote: Soroswap AMM, Phoenix, Aqua, and the classic Stellar DEX (SDEX). Returns the optimal route and builds an unsigned XDR — same sign-then-submit pattern as DeFindex. Enables in-chat token swaps ("swap 50 USDC to XLM").

**Files:** `backend/src/integrations/soroswap/` — `types.ts`, `config.ts`, `service.ts`, `index.ts` · `api/controllers/soroswap.controller.ts` · `api/routes/soroswap.router.ts`

**API used:** `https://api.soroswap.finance`. Current REST-wrapper mode can run without an API key when the provider permits unauthenticated calls; SDK mode requires `SOROSWAP_API_KEY`.

**Testing workflow:** See [`SOROSWAP-SDK-TESTING-FLOW.md`](./SOROSWAP-SDK-TESTING-FLOW.md) for the wallet creation, quote, XDR build, sign, submit, and verification checklist.

**Endpoints:**
- `GET /api/swap/quote?assetIn=USDC&assetOut=XLM&amount=10&tradeType=EXACT_IN` — best price + route across all protocols
- `POST /api/swap/build` — body: `{ quote, senderAddress, slippageBps? }` → `{ xdr }` (user signs + submits)
- `GET /api/swap/tokens` — list of all tradable tokens with addresses

**Known mainnet token addresses:**
- USDC SAC: `CCW67TSZV3SSS2HXMBQ5JFGCKJNZT7WSEE9MCZGE6H4SXNVGXNWMSE`
- XLM SAC: `CAS3J7GYLGXMF6TDJBBYYSE3HQ6BBSMLNUQ34T6TZMYMW2EVH34XOWMA`

**Key env vars:** `SOROSWAP_API_URL` (default: `https://api.soroswap.finance`), `SOROSWAP_API_KEY` (required for SDK/authenticated provider mode), `SOROSWAP_DEFAULT_SLIPPAGE_BPS` (default: 50), `STELLAR_NETWORK`

---

## Reflector Oracle

Decentralized on-chain price oracle maintained by 7 trusted Stellar ecosystem organisations (StellarExpert, Script3, UltraStellar, xyclooLabs, PublicNode, Lightsail, CreitTech). Free, no auth. Used by the AI agent to show accurate real-time rates in WhatsApp messages. Falls back to Horizon order book for XLM and exchangerate-api.com for BRL if Reflector is unavailable.

**Files:** `backend/src/integrations/reflector/` — `types.ts`, `service.ts`, `index.ts` · `api/controllers/reflector.controller.ts` · `api/routes/reflector.router.ts`

**Cache:** 5-minute in-memory TTL per asset. Fail-open: always returns a price (cached or fallback) rather than throwing.

**Endpoints:**
- `GET /api/oracle/price/:asset` — single asset price (XLM, USDC, BRL, BTC, ETH, EUR…)
- `GET /api/oracle/prices?assets=XLM,USDC,BRL` — multiple assets in one call
- `GET /api/oracle/rates` — convenience: returns `{ xlm_usd, brl_usd, usdc_usd: 1, meta }` — primary endpoint for the AI agent

**Key env vars:** None required. `STELLAR_NETWORK` controls which Horizon fallback is used.

---

## CCTP Cross-Chain Bridge

Circle's Cross-Chain Transfer Protocol V2, live on Stellar since May 20, 2026. Burn-and-mint mechanism: user burns USDC on a source chain → Circle attests → native USDC mints on Stellar. Backend tracks attestation status and gives users step-by-step Portuguese instructions for bridging from any supported chain.

**Files:** `backend/src/integrations/cctp/` — `types.ts`, `config.ts`, `service.ts`, `index.ts` · `api/controllers/cctp.controller.ts` · `api/routes/cctp.router.ts`

**Supported source chains:** Ethereum (domain 0), Avalanche (1), Solana (5), Base (6), Polygon (7)

**Attestation API:** `https://iris-api.circle.com/v2/messages/{sourceDomain}?transactionHash={txHash}` (mainnet) — polled until `status: complete`

**Endpoints:**
- `GET /api/cctp/chains` — list supported chains with contract addresses and instructions
- `GET /api/cctp/status?txHash=0x...&chain=base` — poll attestation status for a cross-chain transfer
- `GET /api/cctp/instructions?stellarAddress=G...&amount=50&chain=base` — returns Portuguese step-by-step bridge instructions

**Key env vars:** `CCTP_STELLAR_CONTRACT_ADDRESS` (Stellar receiver contract — get from circlefin/stellar-cctp), `STELLAR_NETWORK`

---

## SEP-24 Anchor (deprioritized)

Interactive deposit/withdrawal sessions with third-party Stellar anchors. Built but deprioritized — Bridge.xyz handles all active fiat rails. Available for MoneyGram cash corridors or regions without Bridge coverage.

**Files:** `backend/src/integrations/sep24/` — `config.ts`, `client.ts`, `service.ts`, `types.ts`, `index.ts` · controller + router

**Endpoints:** `GET /api/sep24/anchors` · `/anchors/:domain/toml` · `/anchors/:domain/info` · `POST /sep24/auth` · `POST /sep24/deposit` · `POST /sep24/withdraw` · `GET /sep24/transactions` · `GET /sep24/transactions/:id`

**DB tables:** `anchor_sessions`, `anchor_transactions`

---

## SEP-10 Wallet Auth (deprioritized)

Authenticates users via Stellar wallet signature. Supports Freighter, Albedo, xBull, any SEP-10 wallet. Issues 24-hour JWT. Primary auth path is phone + PIN via WhatsApp; this covers web/DApp flows.

**Files:** `backend/src/integrations/stellar-wallets-auth/` — `service.ts`, `types.ts`, `index.ts` · controller + router

**Endpoints:** `GET /api/wallet-auth/challenge?account=G...` · `POST /wallet-auth/verify` · `GET /wallet-auth/session?address=G...` · `POST /wallet-auth/validate`

**DB tables:** `wallet_auth_sessions`

---

## Migrations

Run in order via Supabase SQL Editor:

| # | File | What it creates |
|---|---|---|
| 1 | `20260613_00_full_schema.sql` | Full schema — 48+ tables, RLS, RPCs |
| 2 | `20260614_00_ops_admin_auth.sql` | Ops admin users + sessions |
| 3 | `20260618_00_bridge_tables.sql` | Bridge customer/transfer/webhook tables |
| 4 | `20260618_01_user_stellar_wallets.sql` | `user_stellar_wallets` |
| 5 | `20260618_02_bridge_custodial_wallets.sql` | `bridge_custodial_wallets` |
| 6 | `20260618_03_bridge_va_cache.sql` | `bridge_va_cache` |
| 7 | `20260620_00_sep24_wallet_auth.sql` | `anchor_sessions`, `anchor_transactions`, `wallet_auth_sessions` |
| 8 | `20260620_01_integrations.sql` | `payment_links`, `passkey_wallets`, `increment_payment_link_use()` |
