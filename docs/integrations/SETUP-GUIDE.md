# TalkToStellar — Integration Setup Guide

Live test panel: `/ecosystem-test` (frontend)

---

## Status at a Glance

| Integration | Endpoint | Keys Required | Status |
|---|---|---|---|
| Stellar Network | `GET /api/network/stats` | none | ✅ live |
| Reflector Oracle | `GET /api/oracle/prices` | none | ✅ live |
| Aquarius DeFi | `GET /api/aquarius/rewards` | none | ✅ live |
| Abroad Finance (PIX) | `GET /api/abroad/corridors` | optional (settlements only) | ✅ live |
| Soroswap DEX | `GET /api/swap/quote` | none | ✅ live |
| CCTP (Circle) | `GET /api/cctp/chains` | none | ✅ live |
| Blend v2 (Lending) | `GET /api/blend/pools` | none | ✅ live (static+on-chain check) |
| Stellar Broker | `GET /api/broker/quote` | none | ✅ live |
| Near Intents 1Click | `GET /api/near-intents/tokens` | none | ✅ live |
| Axelar Cross-chain | `GET /api/axelar/chains` | none | ✅ live |
| Allbridge | `GET /api/allbridge/info` | none | ✅ live (static fallback if API blocked) |
| DeFindex Vaults | `GET /api/defindex/vaults` | optional | ✅ live |
| Fraud Screening | `GET /api/fraud-screen/address/:addr` | TRM_API_KEY | ⚠️ needs key |
| SEP-24 Anchors | `GET /api/sep24/*` | anchor-specific | ⚠️ needs anchor ToS |

---

## 1. Zero-Config (no keys needed)

These work on deploy with no environment variables:

```
GET /api/network/stats          — Stellar testnet/mainnet stats
GET /api/network/health         — Quick latency check
GET /api/oracle/prices          — Reflector on-chain prices
GET /api/aquarius/rewards       — AQUA pool rewards
GET /api/swap/tokens            — Soroswap token list
GET /api/swap/quote             — DEX swap quote
GET /api/cctp/chains            — CCTP supported chains
GET /api/blend/pools            — Blend v2 lending pools
GET /api/broker/quote           — Stellar Broker best-price swap
GET /api/axelar/chains          — Axelar supported chains (60+)
GET /api/near-intents/tokens    — Near Intents supported tokens
GET /api/allbridge/info         — Allbridge Stellar integration info
```

---

## 2. Required Environment Variables

### Core (must have for any feature)

```env
DATABASE_URL=                  # Supabase Postgres connection string
SUPABASE_URL=                  # https://xxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=     # Service role key (from Supabase dashboard)
STELLAR_NETWORK=testnet        # or: mainnet
```

### Bridge.xyz (on/off-ramp, fiat settlement)

```env
BRIDGE_API_KEY=                # From bridge.xyz dashboard
BRIDGE_API_URL=https://api.bridge.xyz/v0
```

Get key: https://bridge.xyz → Dashboard → API Keys

### Abroad Finance (USDC → PIX settlements)

```env
ABROAD_API_URL=https://api.abroad.finance
ABROAD_PARTNER_API_KEY=        # From Abroad Finance partnership
```

Public endpoints (`/public/corridors`, `/qr-decoder/br`) work without a key.
The key is only needed for initiating settlements (POST /payments).

Get key: Email partnerships@abroad.finance or Discord.

### TRM Labs (fraud screening)

```env
TRM_API_KEY=                   # From trmlabs.com
TRM_API_URL=https://api.trmlabs.com
```

Get key: https://trmlabs.com → Request API Access

### DeFindex (yield vaults)

```env
DEFINDEX_API_KEY=              # From PaltaLabs / DeFindex
DEFINDEX_NETWORK=testnet       # or: mainnet
```

Get key: https://docs.defindex.io → Discord (#developers)

### Evolution API (WhatsApp messaging)

```env
EVOLUTION_API_URL=             # Your self-hosted Evolution instance
EVOLUTION_INSTANCE=            # Instance name
EVOLUTION_API_KEY=             # Evolution instance API key
PUBLIC_BACKEND_URL=            # Publicly accessible backend URL for webhooks
```

---

## 3. Migrations to Run

Run these in Supabase SQL Editor in order:

```
backend/migrations/20260613_00_full_schema.sql      ← MUST RUN FIRST (base schema)
backend/migrations/20260618_00_bridge_tables.sql    ← bridge_customers cache table
backend/migrations/20260618_01_user_stellar_wallets.sql
backend/migrations/20260618_02_bridge_custodial_wallets.sql
backend/migrations/20260618_03_bridge_va_cache.sql
backend/migrations/20260620_00_sep24_wallet_auth.sql
backend/migrations/20260620_01_integrations.sql
```

**Why order matters:** `20260613` creates core tables that all others reference.
If you get FK violations, you skipped a migration.

---

## 4. Where Each Integration Lives in TalkToStellar

### Payment Flow (WhatsApp → PIX)

```
User sends "pagar R$50" on WhatsApp
    ↓
Evolution API webhook → backend
    ↓
Reflector Oracle        — get current XLM/USD + BRL/USD rates
Soroswap / Broker       — convert XLM→USDC at best rate
Abroad Finance          — USDC→PIX settlement (R$50 to recipient)
Fraud Screening (TRM)   — screen recipient address before sending
```

**Files:**
- `backend/src/integrations/abroad-finance/service.ts`
- `backend/src/integrations/soroswap/service.ts`
- `backend/src/integrations/stellar-broker/service.ts`
- `backend/src/integrations/reflector/service.ts`
- `backend/src/integrations/fraud-screening/service.ts`

### On-Ramp (PIX → USDC)

```
User sends PIX to Bridge virtual account
    ↓
Bridge webhook fires → backend receives
    ↓
USDC lands on user's Stellar wallet
    ↓
Optionally: Deposit to DeFindex vault for yield
```

**Files:**
- `backend/src/integrations/bridge/service.ts`
- `backend/src/api/controllers/bridge.controller.ts`
- `backend/src/api/controllers/bridge-webhook.controller.ts`
- `backend/src/integrations/defindex/service.ts`

### Cross-Chain Inbound (ETH/SOL → Stellar USDC)

```
User holds USDC on Base or Ethereum
    ↓
Option A: Allbridge     — direct USDC bridge (1:1, no slippage)
Option B: CCTP          — Circle native USDC burn+mint
Option C: Axelar        — GMP message + ITS token transfer
Option D: Near Intents  — 1Click API solver execution
    ↓
USDC arrives on Stellar → can be used for PIX payments
```

**Files:**
- `backend/src/integrations/cctp/service.ts`
- `backend/src/integrations/allbridge/service.ts`
- `backend/src/integrations/axelar/service.ts`
- `backend/src/integrations/near-intents/service.ts`

### Yield (idle USDC earning)

```
User not actively spending → suggest yield
    ↓
Blend v2 lending pool   — supply USDC, earn ~8% APY
DeFindex vaults         — automated yield strategies
Aquarius AMM            — LP position + AQUA rewards
    ↓
Daily WhatsApp message: "Você ganhou R$0.42 hoje no Blend"
```

**Files:**
- `backend/src/integrations/blend/service.ts`
- `backend/src/integrations/defindex/service.ts`
- `backend/src/integrations/aquarius/service.ts`

### Wallet Auth & Smart Accounts

```
New user onboards via WhatsApp
    ↓
Passkey wallet created (no seed phrase)
SEP-10 web auth for SEP-24 anchor flows
Stellar Wallets Kit for Freighter/Albedo/xBull connections
    ↓
SEP-24 interactive flow for regulated anchor on-ramp
```

**Files:**
- `backend/src/integrations/passkey-wallets/`
- `backend/src/api/routes/wallet-auth.router.ts`
- `backend/src/api/routes/sep24.router.ts`
- `frontend/app/wallet-connect-test/`
- `frontend/app/passkey-wallet-test/`

### BRL Stablecoins

```
User asks "quanto tenho em BRL?"
    ↓
Check Stellar wallet for:
    BRZ (Transfero)  — GDVKY2GU2DRXBERTI7QUMZY7BMMV35SPCYZYGOLRJN6PXSO57KXH7UUS
    BRLT (Titan)     — GDVKY2GU2DRXBERTI7QUMZY7BMMV35SPCYZYGOLRJN6PXSO57KXH7UUS
    ↓
Reflector Oracle price → show combined BRL balance
```

**Files:**
- `backend/src/integrations/brl-stablecoins/`

---

## 5. Quick API Reference

### Swap / DEX

```bash
# Soroswap quote
GET /api/swap/quote?assetIn=XLM&assetOut=USDC&amount=100&tradeType=EXACT_IN

# Stellar Broker best-price (routes across all DEXs)
GET /api/broker/quote?from=XLM&to=USDC&amount=100

# Stellar Broker receive-side (how much XLM to get 50 USDC)
GET /api/broker/quote?from=XLM&to=USDC&amount=50&direction=receive
```

### Oracle Prices

```bash
# Current prices (XLM, BRL, USDC, EURC, BTC, ETH)
GET /api/oracle/prices?assets=XLM,BRL,BTC

# Response: { XLM: { price: 0.215, source: "reflector" }, BRL: { price: 0.193 } }
```

### PIX / Abroad Finance

```bash
# List USDC→PIX corridors
GET /api/abroad/corridors

# Decode PIX QR code
POST /api/abroad/decode-pix
{ "qr": "00020126580014br.gov.bcb.pix..." }

# Corridor info for STELLAR specifically
GET /api/abroad/corridors
# Look for: blockchain=STELLAR, cryptoCurrency=USDC, paymentMethod=PIX
# minAmount: $1, maxAmount: $20,000
```

### Bridge.xyz

```bash
# Find/create customer
GET  /api/bridge/customers/by-email?email=user@example.com
POST /api/bridge/customers

# Virtual accounts (on-ramp)
GET  /api/bridge/customers/:customerId/virtual-accounts
POST /api/bridge/customers/:customerId/virtual-accounts

# KYC link
POST /api/bridge/customers/:customerId/kyc-link
```

### Blend v2 Lending

```bash
# Pool list (Stellar + Orbit pools)
GET /api/blend/pools

# Specific pool
GET /api/blend/pools/stellar
GET /api/blend/pools/orbit

# Contract addresses
GET /api/blend/addresses
```

### Cross-Chain

```bash
# Axelar supported chains
GET /api/axelar/chains
# Returns 60+ chains, check stellar_supported field

# CCTP supported chains
GET /api/cctp/chains
# Returns EVM chains that can bridge USDC to Stellar (domain 4)

# Allbridge integration info
GET /api/allbridge/info
# Returns supported tokens on Stellar + SDK install instructions

# Near Intents tokens
GET /api/near-intents/tokens

# Near Intents quote
POST /api/near-intents/quote
{ "asset_in": "nep141:eth.bridge.near", "asset_out": "nep141:ft.usdc.near", "amount_in": "1000000000000000000" }
```

### Fraud Screening

```bash
# Screen a Stellar address
GET /api/fraud-screen/address/GABCDEF...

# Response: { blocked: false, riskScore: 2, tags: [], source: "trm" }
```

### Ecosystem Overview (all-in-one)

```bash
# Full portfolio + rates + network for any Stellar address
GET /api/ecosystem/GABCDEF...

# Portuguese WhatsApp summary
GET /api/ecosystem/GABCDEF.../summary
```

---

## 6. How Integrations Fit the Narrative

TalkToStellar turns Stellar into **Brazil's invisible payment rails**.

The user only sees WhatsApp. Underneath:

```
PIX payment in    →  Bridge virtual account (USD rail)
                  →  USDC on Stellar (5s, $0.0001 fee)
                  →  Reflector prices for fx rate
                  →  Abroad Finance for settlement
PIX payment out   →  USDC burned, BRL sent to recipient
```

**Yield layer** — idle USDC doesn't sit still:
```
Blend v2 (lending) + DeFindex (automated vaults) + Aquarius (AMM rewards)
= user earns while funds wait between payments
```

**Cross-chain inbound** — USDC comes from anywhere:
```
Base/ETH/SOL USDC  →  Allbridge or CCTP  →  Stellar USDC  →  PIX
```

**Best execution** — every swap is optimized:
```
Soroswap + Stellar Broker together = best XLM/USDC price across every liquidity source on Stellar
```

**Security** — every outbound payment is screened:
```
TRM Labs fraud screen on recipient address before any transfer executes
```

This is the full stack: **WhatsApp → Stellar → PIX**, with DeFi yield on top.

---

## 7. Testing URLs

| What | URL |
|---|---|
| Ecosystem dashboard | `/ecosystem-test` |
| Anchor test (Bridge) | `/bridge-test` |
| Anchor SEP-24 | `/anchor-test` |
| Passkey wallet | `/passkey-wallet-test` |
| Wallet connect | `/wallet-connect-test` |
| Backend health | `GET /health` |
