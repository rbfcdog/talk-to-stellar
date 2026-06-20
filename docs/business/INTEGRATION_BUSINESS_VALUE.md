# Integration Business Value — TalkToStellar

How every integration serves the WhatsApp-native payments product.

---

## The Product in One Sentence

TalkToStellar is a WhatsApp interface for sending and receiving money in Brazil, powered by Stellar. Users type or speak in Portuguese; the AI agent handles everything behind the scenes — conversion, compliance, settlement.

---

## Core Integrations (Revenue-Critical)

### 1. Bridge.xyz — Fiat Anchor

**What it does:** PIX (BRL) ↔ USDC rails. On-ramp (PIX deposit → USDC in wallet) and off-ramp (USDC → PIX withdrawal to any Brazilian bank account).

**Business value:** This IS the product. Without Bridge, no user can convert real money. Bridge provides the regulated fiat layer — we are not a money transmitter, Bridge is.

**Endpoints used:** `/api/bridge/*` — create customer, KYC, liquidation address, transfer status.

**Revenue model:** Bridge charges a spread; we take 0.30% on top (configurable).

---

### 2. Evolution API — WhatsApp Backbone

**What it does:** Sends and receives WhatsApp messages via the WhatsApp Business API. Runs `speechToText: true` — voice notes are auto-transcribed with the existing OpenAI key and injected as `speechToText` field in the webhook.

**Business value:** The entire UX runs here. No Evolution = no product. Voice support removes the literacy barrier — users in rural Brazil can speak commands instead of typing.

**Revenue model:** Enables acquisition through the channel where Brazilian users already live (WhatsApp has 99% smartphone penetration in Brazil).

---

### 3. Stellar Network (Horizon + SEP-24)

**What it does:** Settlement layer. All USDC transfers happen on-chain. SEP-24 handles the interactive deposit/withdrawal flow with anchors.

**Business value:** Stellar settles in 3-5 seconds for $0.00001 per transaction. This cost structure is impossible to match with legacy banking rails, enabling micropayments and remittances that are economically unviable with traditional fiat.

---

## Real-Time Intelligence Integrations

### 4. Payment Watcher (Horizon SSE)

**What it does:** Maintains a persistent SSE connection to Horizon for each active wallet. When USDC arrives, immediately sends a WhatsApp push notification to the recipient.

**Business value:** "Your money arrived" is the moment of delight that drives word-of-mouth. Instant notification (vs. bank's 30-minute delay or next-day credit) is a key differentiator.

**Activation:** Starts automatically at server boot, loads all active wallets from Supabase.

---

### 5. Reflector Oracle — Price Feed

**What it does:** Decentralized on-chain price oracle for Stellar assets. 7-node quorum (StellarExpert, Script3, UltraStellar, etc.). Falls back to Horizon order book for XLM and exchangerate-api for BRL.

**Business value:**
- Accurate BRL/USDC rate shown to users before every transaction ("send R$50 = $9.20 USDC")
- FX rate alerts — notify users when XLM or BRL moves significantly
- Required for correct fee calculation in the DeFi yield layer

**Endpoint:** `GET /api/oracle/rates` — returns `{xlm_usd, brl_usd, usdc_usd, meta}`. Used by the AI agent on every conversion.

---

## Security & Trust Integrations

### 6. StellarExpert Fraud Screening

**What it does:** Screens every recipient address against StellarExpert's directory before sending. Tags: `malicious` (block), `exchange` (warn), `anchor` (informational).

**Business value:**
- Prevents users from sending to known scam addresses
- Regulatory/compliance value — demonstrates active fraud prevention
- Fail-open design: if API is down, payment proceeds (never blocks due to our own infrastructure failure)
- 1h in-memory cache per address → 0 latency on repeat sends

**Integration cost:** Zero — StellarExpert directory API is free, no auth required.

---

## DeFi Yield Layer

### 7. DeFindex / Blend Protocol — Yield Vaults

**What it does:** Deposits idle USDC into Soroban-native yield strategies (Blend lending pools). Returns unsigned XDR — user signs client-side, we never hold keys.

**Business value:**
- "Earn 4-8% APY on your USDC balance" — turns TalkToStellar from a payments tool into a savings account
- USDC sitting idle in wallets earns nothing; yield converts inactive users into engaged ones
- Non-custodial: we cannot move user funds, which simplifies compliance enormously

**Endpoint:** `POST /api/defindex/deposit` — takes `{vault, userAddress, amount}`, returns XDR for user to sign.

---

### 8. Soroswap DEX Aggregator — Best-Price Swaps

**What it does:** Routes swaps across Soroswap AMM, Phoenix, Aquarius, and Stellar SDEX to find the best rate. Returns unsigned swap XDR.

**Business value:**
- Users who receive XLM (from yield farming, airdrops, etc.) can convert to USDC at best market rate without leaving WhatsApp
- Enables multi-asset corridor: XLM → USDC → BRL via PIX
- Same XDR build-then-sign pattern as DeFindex — consistent, non-custodial

**Endpoint:** `GET /api/swap/quote`, `POST /api/swap/build`.

---

## Cross-Chain Liquidity

### 9. CCTP V2 — Circle Cross-Chain Transfer Protocol

**What it does:** Burn-and-mint bridge for native USDC across Ethereum, Base, Solana, Avalanche, Polygon → Stellar. Live since May 2026.

**Business value:**
- Opens a massive liquidity corridor: users with USDC on EVM chains can fund their Stellar wallet without touching a CEX
- Crypto-native diaspora (Brazilians working abroad with Ethereum-based payroll) can send USDC home through TalkToStellar
- No counterparty risk: Circle attests and mints native USDC, not wrapped tokens

**Endpoint:** `GET /api/cctp/chains`, `GET /api/cctp/status/:chain/:txHash`.

---

## Credential & Access Layer

### 10. Passkey Wallets (WebAuthn + Launchtube)

**What it does:** Server-side relay for passkey smart wallets created with PasskeyKit (client-side). Stores contract IDs, relays signed transactions via Launchtube (fee sponsoring), and resolves keyId → contractId.

**Business value:**
- Smart contract wallets with no seed phrase — users authenticate with Face ID / fingerprint
- Launchtube sponsors transaction fees → users never need to hold XLM for gas
- Critical for mass-market adoption: seed phrase management is the #1 crypto UX barrier

---

### 11. Payment Links (SEP-7)

**What it does:** Generates `web+stellar:pay?...` URIs with QR codes. Shareable via WhatsApp as a URL that wallet apps can parse and pre-fill.

**Business value:**
- "Share your payment link" — merchants, freelancers, and individuals can request payments without knowing the sender's wallet address
- Deeplinks into any Stellar wallet (Lobstr, Solar, Freighter)
- Enables WhatsApp commerce: "want to buy? here's my link"

---

### 12. WhatsApp Voice Payments (Evolution API + OpenAI)

**What it does:** Evolution API's `speechToText: true` config auto-transcribes voice notes using the existing OpenAI key. The transcription is injected as `speechToText` into the webhook payload.

**Business value:**
- Zero infrastructure cost: no new API keys, no new services — just one config flag
- Removes literacy barrier for the ~27 million low-literacy adults in Brazil
- "Falar para pagar" (speak to pay) is the lowest-friction UX possible

**No additional endpoints:** Transcription happens in Evolution before the webhook reaches us. The AI agent reads `payload.speechToText` like any text message.

---

### 13. MGUSD — MoneyGram Stablecoin (Emerging)

**What it does:** MoneyGram's MGUSD stablecoin, launched June 2, 2026 on Stellar, issued by Bridge (already integrated). Backed by 500K+ retail locations worldwide.

**Business value:**
- When MGUSD goes live for consumer redemption, TalkToStellar users can cash out at any MoneyGram location globally — not just via PIX
- Expands the off-ramp from Brazil-only to 200+ countries
- No new integration needed: Bridge already issues MGUSD, our existing Bridge integration handles it

---

## How It All Connects: A Payment Flow

```
User sends voice note in WhatsApp (PT-BR)
         ↓
Evolution API transcribes (speechToText flag, OpenAI key already set)
         ↓
AI agent receives text intent: "manda 50 reais pro João"
         ↓
Fraud Screening screens João's Stellar address (StellarExpert, 0ms cache hit)
         ↓
Reflector Oracle returns current BRL/USDC rate
         ↓
AI builds transaction: R$50 = 9.20 USDC
         ↓
User sees quote, confirms via WhatsApp reply
         ↓
Bridge transfer executes (USDC sent on Stellar)
         ↓
Payment Watcher detects arrival on João's wallet (Horizon SSE)
         ↓
João receives WhatsApp notification: "Você recebeu $9.20 USDC!"
```

**Total time:** ~5 seconds end-to-end. **Cost:** ~$0.001 in fees. **UX:** Pure WhatsApp.

---

## Revenue Impact by Integration

| Integration | Revenue Type | Current State |
|---|---|---|
| Bridge.xyz | Direct (0.30% spread) | Live |
| Evolution API | Enables all revenue | Live |
| Stellar / Horizon | Infrastructure | Live |
| Payment Watcher | Retention (reduces churn) | Live |
| Reflector Oracle | Accuracy (prevents rate disputes) | Live |
| Fraud Screening | Risk reduction | Live |
| DeFindex Yield | Revenue share on AUM | Built, testnet |
| Soroswap | Swap fee revenue | Built, API TBD |
| CCTP | Liquidity inflow | Built, testnet |
| Passkey Wallets | User acquisition | Built, testnet |
| Payment Links | Merchant acquisition | Live |
| Voice Payments | User acquisition | Config flag only |
| MGUSD | Future off-ramp revenue | Monitoring |
