# Stellar Ecosystem — Integration Reference for TalkToStellar

> Research: June 2026. Mainnet-ready unless noted.
> **Context**: TalkToStellar is a WhatsApp-native payment chatbot. Bridge.xyz handles all fiat on/off-ramps (PIX, ACH, SEPA, SPEI). Stellar is the settlement layer. The anchor problem is solved — what follows is everything else.

---

## Table of Contents

1. [WhatsApp Conversion Architecture — What Actually Matters](#1-whatsapp-conversion-architecture)
2. [Passkey Smart Wallets](#2-passkey-smart-wallets--the-biggest-ux-unlock)
3. [Real-Time Payment Streaming (Horizon SSE)](#3-real-time-payment-streaming-horizon-sse)
4. [SEP-7 Payment Links](#4-sep-7-payment-links)
5. [USDC Yield via DeFindex / Blend](#5-usdc-yield-via-defindex--blend)
6. [StellarExpert Fraud Screening](#6-stellarexpert-fraud-screening)
7. [SEP-31 Programmatic Cross-Border (New Corridors)](#7-sep-31-programmatic-cross-border)
8. [USSD Fallback (Africa / No-Data Markets)](#8-ussd-fallback)
9. [DEX Swaps — When and Why (Not BRL)](#9-dex-swaps)
10. [SEP Protocol Reference Stack](#10-sep-protocol-reference-stack)
11. [Wallets & Multi-Wallet Auth](#11-wallets--multi-wallet-auth)
12. [SDKs](#12-sdks)
13. [Data & Indexing](#13-data--indexing)
14. [Stablecoins on Stellar](#14-stablecoins-on-stellar)
15. [DeFi Protocols](#15-defi-protocols)
16. [Compliance & Identity](#16-compliance--identity)
17. [Key Network Constants](#17-key-network-constants)

---

## 1. WhatsApp Conversion Architecture

This is the mental model for what drives conversion in a WhatsApp-native payment product:

```
[User sends WhatsApp message]
        │
        ▼
[Chatbot parses intent]
        │
        ├─► Send money → generate SEP-7 link or direct Stellar tx
        ├─► Receive money → generate payment link → share on WhatsApp
        ├─► Check balance → Horizon query → "Your balance: $142 USDC (earning 8.6%/yr)"
        └─► Off-ramp → Bridge.xyz (already done)
        │
        ▼
[Horizon SSE streaming detects incoming payment]
        │
        ▼
[WhatsApp push: "João sent you $50 USDC · Balance now $192"]
```

**The three levers that move conversion numbers:**

| Lever | Mechanism | Impact |
|-------|-----------|--------|
| **Onboarding friction** | Passkey wallets (no seed phrase) | #1 drop-off point eliminated |
| **Real-time feedback** | Horizon SSE → WhatsApp push on receipt | Users know money arrived in 3–5s |
| **Balance stickiness** | 8.6% USDC yield via DeFindex | Users keep money in wallet instead of immediately off-ramping |

The Decaf wallet is the closest real-world analog: "Invoice $500" in WhatsApp → get shareable payment link back → zero on/off-ramp fees via MoneyGram. Their entire product is payment links + real-time notifications. We use Bridge instead of MoneyGram but the loop is identical.

---

## 2. Passkey Smart Wallets — The Biggest UX Unlock

**The problem:** Seed phrases kill conversion. Users presented with 12 words during onboarding churn instantly. A WhatsApp bot that requires "write down your seed phrase" before first use loses 60–80% of potential users.

**The solution:** Stellar's native passkey smart wallets. Protocol 21 (2024) added secp256r1 curve support, meaning Soroban smart contracts can verify WebAuthn signatures on-chain. Result: Face ID / fingerprint = send money. No seed phrase. No private key visible.

**Stack:**
- **Passkey Kit** — TypeScript SDK: [github.com/kalepail/passkey-kit](https://github.com/kalepail/passkey-kit)
- **Launchtube** — paymaster equivalent, handles fee/sequence sponsoring so users never need XLM for fees: built by same author
- **Sandbox**: [stellarsandbox.dev](https://stellarsandbox.dev)
- **Production proof**: Meridian Pay deployed at Meridian 2025 to 1,000+ users, no seed phrases

**How it works:**

```typescript
import { PasskeyKit, PasskeyServer } from "passkey-kit";

// 1. Create wallet — triggers Face ID popup, creates Soroban contract on-chain
const account = new PasskeyKit({ rpcUrl, networkPassphrase, factoryContractId });
const { contractId, signedTx } = await account.createWallet("TalkToStellar", "user@email.com");

// 2. Sign a payment — just Face ID, nothing else
const { signedAuthEntries } = await account.sign(tx, { rpId: "talktostellar.com" });

// 3. Submit via Launchtube (handles XLM fees so user doesn't need XLM)
await fetch(launchtubeUrl, {
  method: "POST",
  body: JSON.stringify({ xdr: assembledTx.toXDR() }),
});
```

**Why this is Priority 1:** Our users are WhatsApp users, not crypto users. The Freighter/seed-phrase model is a non-starter. Passkey wallets make onboarding identical to "sign in with Touch ID" on a banking app.

**SDF docs:** [developers.stellar.org/docs/build/apps/smart-wallets](https://developers.stellar.org/docs/build/apps/smart-wallets)

---

## 3. Real-Time Payment Streaming (Horizon SSE)

**The loop that drives retention:** User receives payment → gets a WhatsApp message 3–5 seconds later → feels like a real bank.

Horizon exposes **Server-Sent Events (SSE)** on every endpoint. Open one long-lived connection per user wallet; Horizon pushes events the instant a payment lands.

```typescript
import { Horizon } from "@stellar/stellar-sdk";

const server = new Horizon.Server("https://horizon.stellar.org");

// Stream incoming payments for a wallet
server
  .payments()
  .forAccount("G...")
  .cursor("now")
  .stream({
    onmessage: async (payment) => {
      if (payment.type !== "payment" && payment.type !== "path_payment_strict_send") return;
      if (payment.to !== userStellarAddress) return;

      const amount = payment.amount;
      const asset = payment.asset_code || "XLM";

      // Trigger WhatsApp notification via Evolution/Twilio
      await sendWhatsApp(userPhoneNumber, `💸 Você recebeu ${amount} ${asset}. Saldo: ${newBalance} USDC`);
    },
  });
```

**Infrastructure note:** SSE requires a persistent connection per user. In production:
- Keep a worker process with one SSE connection per active user (or use cursor-based polling for scale)
- QuickNode offers push webhooks with guaranteed delivery if SSE management becomes complex: [quicknode.com/chains/stellar](https://www.quicknode.com/chains/stellar)
- Mercury ([mercurydata.app](https://mercurydata.app)) is the fastest Soroban event indexer if payment events come from smart contracts

**This is already 90% done** — the backend has Horizon queries. The missing piece is the SSE stream staying open and triggering Evolution/WhatsApp messages on receipt.

---

## 4. SEP-7 Payment Links

**What:** `web+stellar:pay?...` URI scheme that encodes a full payment request. When opened on a device with a Stellar wallet (Freighter, LOBSTR, etc.) it pre-fills everything. When sent over WhatsApp, it's a clickable link.

```
web+stellar:pay?destination=GABCD...&amount=50&asset_code=USDC&asset_issuer=GA5Z...&memo=INV-1234&memo_type=text
```

**For non-crypto users:** Wrap in a short URL redirect (`tts.app/pay/abc123`) that detects:
- Mobile with Stellar wallet installed → open `web+stellar:pay?...` deeplink directly
- No wallet → redirect to our onboarding flow with the payment pre-filled after signup

**Practical flow for "request money" use case:**
```typescript
function buildPaymentLink(destination: string, amount: string, memo: string): string {
  const params = new URLSearchParams({
    destination,
    amount,
    asset_code: "USDC",
    asset_issuer: "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN",
    memo,
    memo_type: "text",
    network: "public",
  });
  return `web+stellar:pay?${params.toString()}`;
}

// User says "cobrar R$ 150 do Carlos"
// Bot generates link → "Envie esse link pro Carlos: https://tts.app/pay/abc123"
// Carlos clicks → pays directly from his Stellar wallet
```

**Decaf's entire product is this.** Their WhatsApp bot generates payment links instantly. "Invoice $500" → link → pay. It's the lowest-friction payment request mechanism in the Stellar ecosystem.

**SEP-7 spec:** [github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0007.md](https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0007.md)

---

## 5. USDC Yield via DeFindex / Blend

**Numbers (June 2026):**
- Blend Protocol USDC supply APY: **~8.6%** (DefiLlama)
- For comparison: Coinbase ~4%, Aave ~5%, high-yield savings ~5%
- 8.6% is real, on-chain, and materially above TradFi alternatives

**Why this matters for conversion:** A user with $500 USDC idle earns ~$43/year passively. The message "Your $500 is earning $0.12 today" is a daily retention hook. Meru wallet (LATAM focused) integrated Blend and saw users keeping larger balances and off-ramping less.

**Integration path — DeFindex (recommended):**

DeFindex is a vault layer on top of Blend. You don't manage Blend pools directly — DeFindex handles routing, rebalancing, and accrual. LOBSTR and Airtm have already integrated it.

```bash
npm install @defindex/sdk
```

```typescript
import { DeFindexSDK } from "@defindex/sdk";

// Deposit USDC into yield vault
const sdk = new DeFindexSDK({ network: "mainnet", rpcUrl: SOROBAN_RPC_URL });
await sdk.deposit({ vaultAddress: USDC_VAULT, amount: BigInt(100_000_000), userAddress: userPublicKey });

// Get current yield/balance
const position = await sdk.getPosition({ vaultAddress: USDC_VAULT, userAddress: userPublicKey });
// position.shares, position.currentValue, position.yieldEarned
```

**Direct Blend integration (lower-level):**
```bash
npm install @blend-capital/blend-sdk
```

**Docs:** [docs.defindex.io](https://docs.defindex.io/) | [docs.blend.capital](https://docs.blend.capital/)  
**Case study:** [stellar.org/case-studies/meru-wallet-uses-blend-defi-protocol-for-yield](https://stellar.org/case-studies/meru-wallet-uses-blend-defi-protocol-for-yield)

---

## 6. StellarExpert Fraud Screening

**Integration time: 1 day. Impact: prevents sending to flagged/scam addresses.**

Free, no auth required, CORS open — callable directly from backend or browser.

```typescript
async function screenRecipient(address: string): Promise<void> {
  const res = await fetch(`https://stellar.expert/api/explorer/directory/${address}`);
  const { tags } = await res.json();

  if (tags?.includes("malicious")) throw new Error("Endereço bloqueado: atividade suspeita detectada");
  if (tags?.includes("exchange")) {
    // Warn: "Esse é o endereço de uma exchange, não de um usuário"
  }
}

// Also: block phishing domains before resolving federation addresses
async function screenDomain(domain: string): Promise<void> {
  const res = await fetch(`https://stellar.expert/api/explorer/directory/blocked-domains/${domain}`);
  if (res.ok) throw new Error(`Domínio bloqueado: ${domain}`);
}
```

**Every outbound payment should run through this.** Takes <100ms.

**API docs:** [stellar.expert/openapi.html](https://stellar.expert/openapi.html)

---

## 7. SEP-31 Programmatic Cross-Border

**When:** Adding corridors where Bridge.xyz doesn't have good coverage (sub-Saharan Africa, Philippines, Indonesia, Central America).

SEP-31 is a direct API between your backend (as Sending Anchor) and a Receiving Anchor. No user redirect, no iframe — your server calls theirs, sends USDC, they deliver local currency to the recipient's bank account. Entirely invisible to the user.

**Proven corridors:**
- **Arf**: US → Mexico over SEP-31, no pre-funding: [stellar.org/case-studies/arf](https://stellar.org/case-studies/arf)
- **Bitso**: US → Mexico (MXN), US → Colombia (COP): [docs.bitso.com](https://docs.bitso.com/mm-xb/docs/bitsos-stellar-receiving-anchor-services)
- **Tempo**: Europe → Africa/Asia
- **SatoshiPay**: Africa + SEPA

**Flow:**
```
1. GET {receiving_anchor}/info              → supported corridors, fields required
2. GET {receiving_anchor}/fee?...           → exact fee for amount/currency pair
3. PUT {receiving_anchor}/customer          → submit recipient KYC (SEP-12)
4. POST {receiving_anchor}/transactions     → initiate transfer
5. Send USDC on Stellar with memo from step 4
6. Poll GET /transaction?id=... until completed
```

**Only relevant when Bridge doesn't cover the corridor.** For Brazil (PIX) and US (ACH/wire), Bridge is already the right answer.

---

## 8. USSD Fallback

**Market:** Sub-Saharan Africa. 94–97% of digital financial transactions go through USSD because mobile data is expensive. Smartphones penetration is rising but still low in rural areas.

**Stellar precedent:**
- **Stax** (SDF-backed): USSD-based payments across 10+ African countries, no data required — [communityfund.stellar.org/projects/stax](https://communityfund.stellar.org/projects/stax)
- **SurgePay**: SCF-awarded April 2026, $150k+ in USSD-triggered Stellar transactions in 60 days

**Architecture:** USSD gateway (Africa's Talking, Vonage) → webhook → your backend → Stellar transaction. No app, no internet on the user's side.

**Only relevant if expanding to markets like Nigeria, Kenya, Tanzania, Ghana.** Not needed for Brazil/Mexico.

---

## 9. DEX Swaps

**Bottom line for BRL:** Don't use on-chain DEX for USDC→BRL conversion. Bridge.xyz does it better.

**Why:**
- Soroswap TVL: ~$1.2M (thin). Aquarius: ~$37M but diversified across all pairs.
- BRZ (Transfero's BRL stablecoin) is EVM-native (Ethereum, Solana, BNB), not Stellar.
- BRLT (Settle Network) exists but has no production AMM depth on Stellar.
- B3 (Brazilian exchange) is launching a BRL stablecoin — watch for H2 2026. If it lands on Stellar with real depth, the calculus changes.
- Bridge.xyz charges ~10 bps + handles regulated PIX settlement. On-chain alternatives would cost more and require building the off-ramp separately.

**When DEX swaps ARE useful:**
- XLM → USDC conversion (to fund new wallets or bridge user's XLM holdings)
- EURC → USDC (liquid, tight spread, both Circle assets on Stellar)
- Internal arbitrage between corridors your product supports

```typescript
import { SoroswapSDK, TradeType } from "@soroswap/sdk";

const client = new SoroswapSDK({ apiKey: "sk_..." });
const quote = await client.quote({
  assetIn: "native",  // XLM
  assetOut: USDC_CONTRACT_ID,
  amount: 10_000_000n, // 1 XLM in stroops
  tradeType: TradeType.EXACT_IN,
});
// quote.amountOut, quote.priceImpact, quote.route
```

**Docs:** [docs.soroswap.finance](https://docs.soroswap.finance) | API key: [api.soroswap.finance/register](https://api.soroswap.finance/register)

---

## 10. SEP Protocol Reference Stack

All SEPs: [github.com/stellar/stellar-protocol/tree/master/ecosystem](https://github.com/stellar/stellar-protocol/tree/master/ecosystem)

### SEP-1 — Stellar TOML (Service Discovery)
`https://<domain>/.well-known/stellar.toml` — declares endpoints, assets, signing keys for all other SEPs.

### SEP-7 — URI Scheme / Payment Links
`web+stellar:pay?destination=G...&amount=50&asset_code=USDC&...`  
Standard payment link format. Open by any Stellar wallet. Core to the WhatsApp payment loop.

### SEP-10 — Authentication
Challenge/response proving ownership of a Stellar keypair. Returns JWT. Used by anchors (and our `/api/wallet-auth` endpoint). SEP-45 is the companion for Soroban contract accounts (passkey wallets).

### SEP-24 — Hosted Deposit/Withdrawal (Interactive)
Anchor hosts KYC UI in iframe. **Already handled by Bridge.xyz for our use case.**  
Still relevant if adding MoneyGram for cash-only users (no bank account), but Bridge is the right default.

### SEP-31 — Direct Payment (Cross-Border B2B)
Backend-to-backend programmatic transfer. No user UI. Use for corridors Bridge doesn't cover.

### SEP-38 — Quotes
Get binding exchange rate quotes before initiating a transfer. Works with Bridge's exchange rate API.

### SEP-12 — KYC
Standard for submitting user identity to anchors. Bridge.xyz has its own KYC system — only relevant for other anchors via SEP-6/31.

### SEP-2 — Federation
Resolve human-readable names (`alice*stellar.org`) to Stellar addresses.

### SEP-6 — Programmatic Deposit/Withdrawal
App collects KYC directly (no iframe). Your app owns the UI. Good for custodial flows.

---

## 11. Wallets & Multi-Wallet Auth

### Passkey Smart Wallets (Recommended)

The future of Stellar wallet UX. Face ID / Touch ID, no seed phrase.

- [github.com/kalepail/passkey-kit](https://github.com/kalepail/passkey-kit)
- [developers.stellar.org/docs/build/apps/smart-wallets](https://developers.stellar.org/docs/build/apps/smart-wallets)
- Sandbox: [stellarsandbox.dev](https://stellarsandbox.dev)

### Stellar Wallets Kit (Existing Wallet Users)

Wraps Freighter, Albedo, xBull, LOBSTR, WalletConnect in one API. Good for power users who already have a Stellar wallet.

```bash
npx jsr add @creit-tech/stellar-wallets-kit
```

**Docs:** [stellarwalletskit.dev](https://stellarwalletskit.dev) | [github.com/Creit-Tech/Stellar-Wallets-Kit](https://github.com/Creit-Tech/Stellar-Wallets-Kit)

### Freighter (Browser Extension)

```bash
npm install @stellar/freighter-api
```

```typescript
import { isConnected, getPublicKey, signTransaction } from "@stellar/freighter-api";
const pk = await getPublicKey();
const signed = await signTransaction(xdr, { networkPassphrase: "Public Global..." });
```

### Albedo (No Extension Required)

```bash
npm install @albedo-link/intent
```

```typescript
import albedo from "@albedo-link/intent";
const { pubkey } = await albedo.publicKey({ require_existing: true });
const { signed_envelope_xdr } = await albedo.tx({ xdr, network: "public", submit: false });
```

---

## 12. SDKs

### `@stellar/stellar-sdk` (v14+ → v16.0.0)

```bash
npm install @stellar/stellar-sdk
```

**Note:** v16 breaking changes (June 2026): axios → native fetch, Node 22+, `@stellar/stellar-base` merged in, Protocol 27.

Key namespaces: `Horizon`, `rpc` (Soroban), `Keypair`, `Asset`, `TransactionBuilder`, `Operation`, `Memo`, `Networks`

**GitHub:** [github.com/stellar/js-stellar-sdk](https://github.com/stellar/js-stellar-sdk)

### `@stellar/typescript-wallet-sdk`

Higher-level SDK implementing SEP-1/6/10/12/24/38.

```bash
yarn add @stellar/typescript-wallet-sdk
```

### `@blend-capital/blend-sdk`

```bash
npm install @blend-capital/blend-sdk
```

### `@defindex/sdk`

```bash
npm install @defindex/sdk
```

---

## 13. Data & Indexing

### Horizon REST API

**Mainnet:** `https://horizon.stellar.org`  
**Testnet:** `https://horizon-testnet.stellar.org`

> SDF public Horizon retains 1 year of history (since August 2024). For full history, use StellarExpert or QuickNode full-history nodes.

**Key streaming endpoints:**

```typescript
const server = new Horizon.Server("https://horizon.stellar.org");

// Stream incoming payments
server.payments().forAccount("G...").cursor("now").stream({ onmessage: handler });

// Stream all transactions for an account
server.transactions().forAccount("G...").cursor("now").stream({ onmessage: handler });
```

### StellarExpert API (Free, No Auth)

`https://stellar.expert/api/explorer/`

```
GET /explorer/directory/{address}          → tags: [malicious | exchange | anchor]
GET /explorer/directory/blocked-domains/{domain}
GET /explorer/{network}/asset/{asset}/rating
GET /explorer/{network}/asset/{asset}/holders
```

### Mercury (Soroban Indexer)

Fastest Soroban event indexer. Use for passkey wallet contract events.  
[mercurydata.app](https://mercurydata.app)

### QuickNode

Managed Horizon + Soroban RPC with guaranteed-delivery webhooks.  
[quicknode.com/chains/stellar](https://www.quicknode.com/chains/stellar)

---

## 14. Stablecoins on Stellar

| Stablecoin | Peg | Issuer | Mainnet Issuer | Notes |
|---|---|---|---|---|
| **USDC** | USD | Circle | `GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN` | $223M+ on Stellar. Primary. |
| **EURC** | EUR | Circle | `GDHU6WRG4IEQXM5NZ4BMPKOXHW76MZM4Y2IEMFDVXBSDP6SJY4ITNPP` | MiCA-compliant |
| **PYUSD** | USD | PayPal | — | Live on Stellar since Sep 2025 |
| **MGUSD** | USD | Bridge/MoneyGram | — | Launched June 2, 2026 |
| **YLDS** | USD+yield | Figure | — | SEC-registered; accrues SOFR – 0.50% daily |
| **ARST** | ARS | Settle Network | — | Argentine Peso. Used by Vibrant. |
| **BRLT** | BRL | Settle Network | — | Brazilian Real. No AMM depth. |
| **BRZ** | BRL | Transfero | — | EVM-native, not meaningful on Stellar |
| **NGNT** | NGN | Cowrie | — | Nigerian Naira |
| **EURT** | EUR | Tempo | — | EU licensed |
| **XLM** | Float | Native | N/A | Required: 1 XLM base + 0.5 XLM/trustline |

**CCTP (Circle):** Move native USDC between Stellar ↔ Ethereum, Solana, Base, Avalanche, Arbitrum (23+ chains). No bridge risk. Live since March 2025.

---

## 15. DeFi Protocols

### Blend Protocol (Lending)

TVL: $100.6M Q1 2026 (+25.9% QoQ). USDC supply APY: ~8.6%.

```bash
npm install @blend-capital/blend-sdk
```

**Docs:** [docs.blend.capital](https://docs.blend.capital) | [github.com/blend-capital/blend-contracts-v2](https://github.com/blend-capital/blend-contracts-v2)

### DeFindex (Yield Vaults over Blend)

Simplest integration path. SDK handles pool routing. Meru, LOBSTR, Airtm already use it.

**Docs:** [docs.defindex.io](https://docs.defindex.io)

### Soroswap (DEX Aggregator)

$21M+ cumulative volume. Routes across Soroswap, Aquarius, Phoenix, native SDEX.

```bash
pnpm install soroswap-sdk
```

**Docs:** [docs.soroswap.finance](https://docs.soroswap.finance)

### Aquarius (AMM + Incentives)

$37M+ TVL. AQUA token holders vote on LP rewards. Included in Soroswap routing.

### Phoenix Protocol

Soroban AMM. Included in Soroswap aggregator routing.

### Reflector (Price Oracle)

Used across Stellar DeFi protocols for price feeds.

### Other Active Soroban Protocols

| Protocol | Category |
|---|---|
| Sushi | Concentrated liquidity DEX (PYUSD↔USDC, XLM↔USDC) |
| Slender | Money market lending |
| FxDAO | CDP stablecoin (backed by XLM) |
| Allbridge Core | Cross-chain stablecoin swaps into Stellar |
| Squid | Cross-chain to 80+ networks |

---

## 16. Compliance & Identity

### StellarExpert Directory

Free fraud screening. Screen every outbound payment. See [Section 6](#6-stellarexpert-fraud-screening).

### AML/KYC Providers

| Provider | Notes |
|---|---|
| **Elliptic** | Official SDF partner; XLM + Stellar assets; AI alert review |
| **Chainalysis** | Industry standard transaction monitoring |
| **TRM Labs** | Stellar asset monitoring |

### X-Ray (ZK Proofs, Protocol 25)

BN254 curve + Poseidon hash on mainnet since January 2026. Enables "prove KYC without revealing identity data." Relevant for privacy-preserving compliance in future.

### Native Asset Controls

For tokens TalkToStellar might issue:
- **Authorization Required** — accounts must be approved to hold
- **Authorization Revocable** — freeze accounts
- **Clawback** — reclaim tokens for regulatory remediation

---

## 17. Key Network Constants

```typescript
// ── Mainnet ─────────────────────────────────────────────────────────
const HORIZON_URL              = "https://horizon.stellar.org";
const NETWORK_PASSPHRASE       = "Public Global Stellar Network ; September 2015";
const SOROBAN_RPC_URL          = "https://mainnet.sorobanrpc.com";

// ── Testnet ──────────────────────────────────────────────────────────
const HORIZON_TESTNET          = "https://horizon-testnet.stellar.org";
const NETWORK_PASSPHRASE_TEST  = "Test SDF Network ; September 2015";
const SOROBAN_RPC_TESTNET      = "https://soroban-testnet.stellar.org";

// ── USDC ─────────────────────────────────────────────────────────────
const USDC_ISSUER_MAINNET      = "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN";
const USDC_ISSUER_TESTNET      = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";

// ── EURC ─────────────────────────────────────────────────────────────
const EURC_ISSUER_MAINNET      = "GDHU6WRG4IEQXM5NZ4BMPKOXHW76MZM4Y2IEMFDVXBSDP6SJY4ITNPP";

// ── Reserve requirements ─────────────────────────────────────────────
// Base account:      1.0 XLM
// Per trustline:     0.5 XLM
// 1 trustline:       minimum 1.5 XLM
// 2 trustlines:      minimum 2.0 XLM
// Passkey contract:  ~2.5 XLM (contract deployment cost, sponsorable)

// ── Fees ─────────────────────────────────────────────────────────────
// Minimum fee:       100 stroops (0.0001 XLM) per operation
// Launchtube:        sponsors fees — users need zero XLM
```

---

## Integration Roadmap (Re-prioritized for WhatsApp Conversion)

### Priority 1 — Passkey Smart Wallets (1–2 weeks)
**Impact: Eliminates #1 conversion killer — the seed phrase.**

Install `passkey-kit` + Launchtube. Replace current wallet creation flow with Face ID / Touch ID. Users onboard in a single biometric tap, same UX as a banking app. [Meridian Pay](https://stellar.org/blog/ecosystem/building-meridian-pay-smart-wallet-on-stellar) already proved this at scale.

---

### Priority 2 — Horizon SSE → WhatsApp Push (3–5 days)
**Impact: "Money arrived" message in 3–5 seconds. Core retention loop.**

Open SSE stream per active user. On payment event → call Evolution/WhatsApp API with formatted message: `"💸 João te enviou R$ 150 (50 USDC). Saldo: R$ 470"`. Users who get real-time confirmations come back.

---

### Priority 3 — SEP-7 Payment Links (2–3 days)
**Impact: "Request money" feature via WhatsApp link. Decaf's entire product.**

Generate `web+stellar:pay?...` links. Wrap in `tts.app/pay/{id}` short URLs. User says "cobra R$ 200 do Pedro" → bot sends Pedro a link → Pedro clicks → pays. No app download required.

---

### Priority 4 — StellarExpert Fraud Screening (1 day)
**Impact: Block scam addresses silently. Zero user friction.**

One API call before every outbound payment. Already has all the data needed. No auth, no rate limits for reasonable use.

---

### Priority 5 — USDC Yield via DeFindex (2–4 weeks)
**Impact: 8.6% APY → users keep larger balances → don't immediately off-ramp.**

Install `@defindex/sdk`. Offer opt-in yield on idle USDC. Daily WhatsApp update: `"Você ganhou R$ 0,38 hoje 📈 Total: R$ 14,20 este mês"`. Meru wallet case study shows this materially reduces off-ramp frequency.

---

### Priority 6 — SEP-31 New Corridors (2–4 weeks per corridor)
**Impact: Expand beyond Bridge's coverage (Africa, SE Asia, Central America).**

Only relevant when Bridge doesn't serve the target market. Use Bitso (MXN, COP), Tempo (EUR, Africa), SatoshiPay for other corridors.

---

### Priority 7 — USSD (Only for Africa Expansion)
**Impact: Reach users without smartphones or data plans.**

Only if expanding to sub-Saharan Africa. Not needed for Brazil/LATAM. Stax's model shows it works at scale.

---

## Why DEX Swaps Won't Replace Bridge for BRL

For the record: on-chain USDC→BRL conversion on Stellar's DEX is not production-ready.

- Soroswap TVL: ~$1.2M (thin)
- BRZ (Transfero) is EVM-native, not on Stellar at meaningful depth
- BRLT (Settle) exists but has no production AMM pool
- B3 is launching a BRL stablecoin (watch H2 2026 — if it lands on Stellar with anchor support, revisit)
- Bridge.xyz: ~10 bps + regulated PIX settlement built in — vastly better

**Bridge stays. DEX is for XLM→USDC conversion and internal corridor arbitrage only.**

---

*Sources: stellar.org, developers.stellar.org, defillama.com, docs.soroswap.finance, docs.blend.capital, docs.defindex.io, decaf.so, quicknode.com, stellar.expert, mercurydata.app, communityfund.stellar.org, messari.io/report/state-of-stellar-q1-2026*
