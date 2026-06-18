# Stellar Ecosystem — Integration Reference for TalkToStellar

> Research date: June 2026. All protocols marked mainnet-ready unless noted.
> TalkToStellar already integrates Bridge.xyz (on/off-ramp via USDC on Stellar) and calls Horizon directly for balance checking.

---

## Table of Contents

1. [SEP Protocol Stack](#1-sep-protocol-stack)
2. [Live Anchors — Fiat Gateways](#2-live-anchors--fiat-gateways)
3. [DEX & DeFi on Stellar](#3-dex--defi-on-stellar)
4. [Stablecoins on Stellar](#4-stablecoins-on-stellar)
5. [Wallets & Auth](#5-wallets--auth)
6. [SDKs](#6-sdks)
7. [Data & Indexing](#7-data--indexing)
8. [NFTs & Tokenization](#8-nfts--tokenization)
9. [Compliance & Identity](#9-compliance--identity)
10. [Integration Roadmap for TalkToStellar](#10-integration-roadmap-for-talktostellar)
11. [Key Network Constants](#11-key-network-constants)

---

## 1. SEP Protocol Stack

SEPs (Stellar Ecosystem Proposals) are the interoperability standards for the Stellar ecosystem. Every anchor, wallet, and exchange converges on these HTTP APIs. Defined at [stellar/stellar-protocol](https://github.com/stellar/stellar-protocol/tree/master/ecosystem).

---

### SEP-1 — Stellar TOML (Service Discovery)

**What:** A well-known file at `https://<domain>/.well-known/stellar.toml` that declares signing keys, supported assets, and service endpoints. Every other SEP depends on it.

**Key fields returned:**
- `WEB_AUTH_ENDPOINT` → SEP-10 auth
- `TRANSFER_SERVER_SEP0024` → SEP-24 deposit/withdraw
- `ANCHOR_QUOTE_SERVER` → SEP-38 quotes
- `DIRECT_PAYMENT_SERVER` → SEP-31 cross-border
- `SIGNING_KEY`, `CURRENCIES[]`

```typescript
import { StellarToml } from "@stellar/stellar-sdk";
const toml = await StellarToml.Resolver.resolve("moneygram.com");
// toml.WEB_AUTH_ENDPOINT, toml.TRANSFER_SERVER_SEP0024, etc.
```

---

### SEP-10 — Authentication

**What:** Proves ownership of a Stellar key via a challenge transaction. Returns a JWT used for all subsequent anchor calls.

**Flow:**
1. `GET /auth?account=G...` → receive challenge XDR
2. User wallet signs the challenge
3. `POST /auth` with signed XDR → receive JWT (`Authorization: Bearer <JWT>`)

**Raw implementation (no SDK):**
```javascript
const { transaction, network_passphrase } = await (await fetch(`${WEB_AUTH_ENDPOINT}?account=${pk}`)).json();
// sign transaction with user keypair or wallet (Freighter/Albedo)
const { token } = await (await fetch(WEB_AUTH_ENDPOINT, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ transaction: signedXDR }),
})).json();
```

**Wallet SDK:**
```typescript
const sep10 = await anchor.sep10();
const authToken = await sep10.authenticate({ accountKp: userKeyPair });
```

**Note:** SEP-45 is the companion for Soroban contract accounts (C...). SEP-10 handles G.../M... accounts.

---

### SEP-24 — Hosted Deposit & Withdrawal (Interactive) ⭐ Most important

**What:** Anchor hosts all KYC UI in an iframe/webview. Your app initiates and polls; the anchor handles everything else. Supported by MoneyGram, Vibrant, Settle, Tempo, SatoshiPay, and 60+ others.

**Endpoints:**
| Endpoint | Purpose |
|---|---|
| `GET /info` | Supported assets, min/max amounts |
| `POST /transactions/deposit/interactive` | Initiate deposit → returns `{url, id}` |
| `POST /transactions/withdraw/interactive` | Initiate withdrawal → returns `{url, id}` |
| `GET /transaction?id=<id>` | Poll status |
| `GET /transactions?asset_code=USDC` | List user's transactions |

**Full TypeScript flow (wallet SDK):**
```typescript
import { Wallet, IssuedAssetId } from "@stellar/typescript-wallet-sdk";

const wallet = Wallet.MainNet();
const anchor = wallet.anchor({ homeDomain: "moneygram.com" });

// 1. Auth
const sep10 = await anchor.sep10();
const authToken = await sep10.authenticate({ accountKp: userKeyPair });

// 2. Initiate deposit
const sep24 = await anchor.sep24();
const deposit = await sep24.deposit({
  assetCode: "USDC",
  authToken,
  extraFields: { email_address: "user@example.com" }, // SEP-9 pre-fill
});
// deposit.url → open in iframe/modal
// deposit.id → use for polling

// 3. Watch status
const watcher = sep24.watcher();
watcher.watchOneTransaction({
  authToken,
  assetCode: "USDC",
  id: deposit.id,
  onMessage: (tx) => {
    if (tx.status === "pending_user_transfer_start") {
      // For withdrawals: build and submit Stellar transaction with memo
    }
  },
  onSuccess: (tx) => console.log("Complete!", tx),
  onError: (tx) => console.error("Failed:", tx),
});
```

**Transaction statuses to handle:**
- `pending_user_transfer_start` → user must send USDC (withdrawal flow)
- `pending_external` → anchor processing fiat
- `completed` → done
- `refunded` / `expired` / `error`

---

### SEP-6 — Programmatic Deposit & Withdrawal

**What:** App collects KYC data and submits it directly (no iframe). Best for custodial apps where your server holds user keys.

**Difference from SEP-24:** Your app handles KYC collection (via SEP-12) instead of the anchor's webview.

**Flow:** `GET /info` → `GET /deposit` or `GET /withdraw` → `PUT /customer` (SEP-12 KYC) → poll `GET /transaction?id=<id>`

---

### SEP-12 — KYC API

**What:** Standard for wallets to submit user KYC to anchors. Submit once, reuse across multiple anchors. Used with SEP-6 (SEP-24 handles KYC itself in the webview).

**Fields:** `first_name`, `last_name`, `email_address`, `birth_date`, `bank_account_number`, `photo_id_front` (base64), `photo_id_back`, etc.

**Endpoints:**
- `GET /customer?account=G...` → fetch existing KYC status
- `PUT /customer` → submit/update KYC data
- `POST /customer/files` → upload binary files (ID photos)
- `DELETE /customer/<id>` → GDPR erasure

---

### SEP-38 — Anchor RFQ (Quotes)

**What:** Get binding exchange rate quotes before initiating a transfer. Shows exact fees and final amount received.

**Endpoints:** `GET /info` (pairs), `GET /price` (indicative), `POST /quote` (firm, reserves capital)

```typescript
const sep38 = await anchor.sep38();
const quote = await sep38.requestQuote({
  sellAsset: "stellar:USDC:GA5Z...",
  buyAsset: "iso4217:USD",
  sellAmount: "100",
  context: "sep24",
});
// quote.price, quote.expires_at, quote.fee
```

Pass `quote.id` as `quote_id` in your SEP-24 deposit/withdraw call for locked-in pricing.

---

### SEP-31 — Cross-Border Payments (B2B)

**What:** API for regulated sending institutions (fintechs, banks) to send money directly to anchor receiving institutions without user interaction. For remittance corridors where both sides are businesses.

**Example:** Your app as Sending Anchor sends USD → USDC → Bitso (Receiving Anchor) → MXN to recipient bank.

**Flow:** `POST /transactions` on the receiving anchor with amount, corridor info, and pre-verified KYC IDs.

---

### SEP-2 — Federation

**What:** Resolves human-readable addresses (`alice*example.com`) to Stellar G... addresses (with optional memo).

```typescript
// Lookup: alice*example.com
GET https://FEDERATION_SERVER/federation?q=alice*example.com&type=name
// → { stellar_address, account_id, memo_type, memo }
```

---

### SEP-7 — URI Scheme (QR Payments)

**What:** `web+stellar:pay?...` URL/QR that triggers a Stellar transaction in the user's wallet. Good for POS-style payment flows.

---

## 2. Live Anchors — Fiat Gateways

Full directory (69+ anchors, 170+ currencies): [anchors.stellar.org](https://anchors.stellar.org/?standard=SEP-24)

### MoneyGram Ramps ⭐

**Protocols:** SEP-1, SEP-10, SEP-24  
**Asset:** USDC on Stellar  
**Coverage:** Cash in/out at 350,000+ agent locations in 170+ countries  
**Limits:** On-ramp $5–$950 USDC; off-ramp $5–$2,500 USDC  
**Assets:**
- Mainnet: `USDC / GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN`
- Testnet: `USDC / GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5`

**Getting access:** Email `[email protected]` with your `stellar.toml` (for non-custodial) or wallet domain + key addresses (for custodial).

**Wallets integrated:** LOBSTR, Vibrant/Vesseo, Beans App, CiNKO, Changera, Chipper Cash, 15+ total.

**June 2026 new:** MoneyGram launched **MGUSD** stablecoin on Stellar (issued via Bridge/Stripe, M0 infrastructure).

**Docs:** [developer.moneygram.com](https://developer.moneygram.com/moneygram-developer/docs/integrate-moneygram-ramps)  
**Postman collection:** [postman.com/sdf-eng](https://www.postman.com/sdf-eng/sdf-public-workspace/documentation/ossy3ql/moneygram-stellar-api)  
**MVP wallet reference:** [github.com/stellar/moneygram-access-wallet-mvp](https://github.com/stellar/moneygram-access-wallet-mvp)

---

### Vibrant / Vesseo (Sunship)

**Focus:** LATAM, primarily Argentina (93% user base). 282% MAU growth in 1 year.  
**What:** Non-custodial USDC wallet + anchor for ARS and 16 country cash in/out.  
**Backend anchor for ARS:** `arst.settle.network` (Settle Network)

---

### Settle Network / Stablex

**SDF investment:** $3M  
**Stablecoins:** ARST (Argentine Peso, 1:1 ARS), BRLT (Brazilian Real, 1:1 BRL)  
**Focus:** LATAM B2B and retail FX settlement; largest digital asset settlement network in LATAM  
**SEPs:** SEP-24 and/or SEP-6 for ARST/BRLT  
**Docs:** [settle.network](https://www.settle.network/)

---

### Bitso (Mexico, Argentina, Colombia)

**Type:** Stellar Receiving Anchor (SEP-31)  
**Corridors:** US → Mexico (MXN), US → Argentina (ARS), US → Colombia (COP)  
**Use case:** International remittances + last-mile local bank disbursement  
**Docs:** [docs.bitso.com](https://docs.bitso.com/mm-xb/docs/bitsos-stellar-receiving-anchor-services)

---

### Cowrie (Nigeria)

**Stablecoin:** NGNT (Nigerian Naira, 1:1 NGN)  
**Corridor:** Nigeria ↔ Europe (with Tempo). €500k/week, ~10s settlement.

---

### Tempo (Europe)

**Licensed:** EU Electronic Money Institution, Paris  
**Stablecoin:** EURT (Euro, 1:1 EUR)  
**Focus:** Europe ↔ Africa, Europe ↔ Asia corridors  
**SEPs:** SEP-24

---

### SatoshiPay (Africa + Micropayments)

**Focus:** Africa, SEPA (EUR), mobile money networks  
**SEPs:** SEP-24

---

### Anclap (Argentina + LATAM)

**Features:** USD savings (USDC), ARS on/off-ramp, international debit card tied to Stellar  
**SEPs:** SEP-24, SEP-6, SEP-12 (SEP-31 in development)

---

### Brazil: Foxbit + Mercado Bitcoin

Both are regulated Brazilian exchanges co-issuing **BRL1** stablecoin on Stellar. Support PIX deposits and stablecoin withdrawals.

---

## 3. DEX & DeFi on Stellar

### SDEX — Stellar Native Order Book DEX

**What:** Built into the Stellar protocol. No smart contracts needed. Every account can place limit orders directly.

```typescript
import { Operation, Asset } from "@stellar/stellar-sdk";

// Atomic multi-hop swap: XLM → USDC
const pathPayment = Operation.pathPaymentStrictSend({
  sendAsset: Asset.native(),     // XLM
  sendAmount: "10",
  destination: recipientKey,
  destAsset: USDC_ASSET,
  destMin: "9.5",               // slippage protection
  path: [],                     // empty = Stellar finds path automatically
});
```

**Horizon order book:** `GET /order_book?selling=XLM&buying=USDC:GA5Z...`  
**Path finding:** `GET /paths/strict-send` or `/paths/strict-receive`

---

### Stellar AMM (Protocol 18+)

**Model:** Constant product (x × y = k) — same as Uniswap v2  
**Fee:** 30 basis points (0.30%) per trade, fixed, accrues to LPs  
**Pool shares:** Non-transferable. Pool ID is SHA-256 of the sorted asset pair.

**Add liquidity:**
```typescript
// 1. Add trustline for pool share asset
Operation.changeTrust({ asset: new StellarSdk.LiquidityPoolAsset(assetA, assetB, StellarSdk.LiquidityPoolFeeV18) })
// 2. Deposit
Operation.liquidityPoolDeposit({ liquidityPoolId: "<id>", maxAmountA: "100", maxAmountB: "100", minPrice: {n:1,d:1}, maxPrice: {n:1,d:1} })
// 3. Withdraw
Operation.liquidityPoolWithdraw({ liquidityPoolId: "<id>", amount: "50", minAmountA: "0", minAmountB: "0" })
```

---

### Soroswap — DEX Aggregator ⭐

**What:** First DEX aggregator on Stellar. Routes trades across Soroswap AMM, Aquarius, Phoenix, and native SDEX for best execution. $21M+ cumulative swap volume.

**Install:** `pnpm install soroswap-sdk`  
**API:** `https://api.soroswap.finance` (free key at `/register`)

```typescript
import { SoroswapSDK, SupportedProtocols, TradeType } from "@soroswap/sdk";

const client = new SoroswapSDK({ apiKey: "sk_..." });

// 1. Get aggregated quote
const quote = await client.quote({
  assetIn: "CAS3J7GYLGXMF6TDJBBYYSE3HQ6BBSMLNUQ34T6TZMYMW2EVH34XOWMA",  // XLM
  assetOut: "CDTKPWPLOURQA2SGTKTUQOWRCBZEORB4BWBOMJ3D3ZTQQSGE5F6JBQLV",  // USDC
  amount: 10_000_000n,
  tradeType: TradeType.EXACT_IN,
  protocols: [SupportedProtocols.SDEX, SupportedProtocols.SOROSWAP, SupportedProtocols.PHOENIX],
});

// 2. Build XDR transaction
const buildResponse = await client.build({ quote, from: "G...", to: "G..." });

// 3. Sign + submit
const signedXdr = await freighterApi.signTransaction(buildResponse.xdr, { network: "MAINNET" });
await client.send(signedXdr);
```

**Contract addresses (mainnet):**
- Factory: `CA4HEQTL2WPEUYKYKCDOHCDNIV4QHNJ7EL4J4NQ6VADP7SYHVRYZ7AW2`
- Router: `CAG5LRYQ5JVEUI5TEID72EYOVX44TTUJT5BQR2J6J77FH65PCCFAJDDH`

**Docs:** [docs.soroswap.finance](https://docs.soroswap.finance) | [GitHub](https://github.com/soroswap)

---

### Aquarius — Liquidity Incentive Layer

**What:** Stellar's DeFi hub and AMM. AQUA token holders vote on which liquidity pairs receive rewards. Rewards distributed hourly to AMM LPs and SDEX market makers.

**TVL:** $40M+ (Q1 2026)  
**ICE token:** Lock AQUA → get boosted voting power and yield (veCRV model)  
**Total supply:** 100B AQUA (fixed, no further issuance after March 2025)

**Integration:** Via Soroswap aggregator (routes through Aquarius automatically) or direct via Soroban SDK.

**Docs:** [docs.aqua.network](https://docs.aqua.network) | [GitHub: soroban-amm](https://github.com/AquaToken/soroban-amm)

---

### Phoenix Protocol

**What:** Soroban-based AMM DEX. Launched mainnet May 2024. Included in Soroswap aggregator routing.

**GitHub:** [github.com/Phoenix-Protocol-Group](https://github.com/Phoenix-Protocol-Group)

---

### Blend Protocol — Lending ⭐

**What:** Overcollateralized lending and borrowing on Soroban (by Script3). Permissionless pool creation. TVL: $100.6M (Q1 2026, up 25.9% QoQ).

**Install:** `npm install @blend-capital/blend-sdk`

```typescript
import { PoolContract, RequestType } from "@blend-capital/blend-sdk";
import { TransactionBuilder, Networks, BASE_FEE, rpc } from "@stellar/stellar-sdk";

const server = new rpc.Server("https://soroban-rpc.stellar.org");
const pool = new PoolContract("POOL_CONTRACT_ID");
const sourceAccount = await server.getAccount(wallet.publicKey);

const tx = new TransactionBuilder(sourceAccount, { fee: BASE_FEE, networkPassphrase: Networks.PUBLIC })
  .addOperation(pool.submit({
    from: wallet.publicKey,
    spender: wallet.publicKey,
    to: wallet.publicKey,
    requests: [{ request_type: RequestType.SupplyCollateral, address: "USDC_CONTRACT", amount: BigInt(100_000_000) }],
  }))
  .setTimeout(180)
  .build();

const sim = await server.simulateTransaction(tx);
// assemble, sign, submit
```

**Docs:** [docs.blend.capital](https://docs.blend.capital/) | [GitHub](https://github.com/blend-capital/blend-contracts-v2)

---

### DeFindex — Yield Vaults (Simpler Blend Integration)

**What:** Tokenized vaults on top of Blend. Wallets plug into DeFindex; DeFindex manages the underlying protocol routing. Beans App saw 3× average deposit amount and 70%+ user retention after integration.

**Docs:** [docs.defindex.io](https://docs.defindex.io/)

---

### Other Active Soroban DeFi Protocols (2025–2026)

| Protocol | Category | Notes |
|---|---|---|
| Sushi | Concentrated liquidity DEX | First on Stellar; pools: PYUSD↔USDC, XLM↔USDC |
| Slender | Lending | Money market on Soroban |
| FxDAO | CDP / Stablecoin | Decentralized stablecoins backed by XLM |
| Templar | CDP | Borrow USDC against XLM and RWA collateral |
| XycLoans | Flash loans | Risk-free yield for lenders |
| Hoops Finance | Yield analytics | Risk-adjusted analytics for Soroban pools |
| Reflector | Oracle | Price oracle used across DeFi protocols |
| Allbridge Core | Bridge | Native stablecoin swaps into Stellar ecosystem |
| Squid | Bridge | Cross-chain; connects Stellar to 80+ chains |
| StellarBroker | DEX Aggregator | Multi-source liquidity router |

---

## 4. Stablecoins on Stellar

| Stablecoin | Peg | Issuer | Notes |
|---|---|---|---|
| **USDC** | USD | Circle | Primary. $223M+ on Stellar. Mainnet issuer: `GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN` |
| **EURC** | EUR | Circle | MiCA-compliant. EUR corridors. `GDHU6WRG4IEQXM5NZ4BMPKOXHW76MZM4Y2IEMFDVXBSDP6SJY4ITNPP` |
| **PYUSD** | USD | PayPal | Live on Stellar since Sep 2025. 400M+ PayPal users. |
| **MGUSD** | USD | Bridge/MoneyGram | Launched June 2, 2026. MoneyGram's cash network stablecoin. |
| **YLDS** | USD (yield) | Figure | SEC-registered; SOFR – 0.50% yield accrued daily. |
| **ARST** | ARS | Settle Network | Argentine Peso. Used by Vibrant. |
| **BRLT** | BRL | Settle Network | Brazilian Real. |
| **NGNT** | NGN | Cowrie | Nigerian Naira. |
| **EURT** | EUR | Tempo | Euro. EU licensed. |
| **XLM** | Floating | Stellar native | Required for fees + reserves. 1 XLM base + 0.5 XLM/trustline. |

**CCTP (Circle Cross-Chain Transfer Protocol):** Launched on Stellar March 2025. Move native USDC between Stellar and Ethereum, Solana, Base, Avalanche, Arbitrum (23+ chains) with no bridge risk.

---

## 5. Wallets & Auth

### Freighter — Browser Extension + Mobile

**The standard non-custodial Stellar wallet.** Non-custodial: keys never leave the device.

**Install:** `npm install @stellar/freighter-api`

```typescript
import { isConnected, getPublicKey, signTransaction, signAuthEntry } from "@stellar/freighter-api";

const available = await isConnected();
const publicKey = await getPublicKey();      // triggers connect popup first time

const signedXdr = await signTransaction(transactionXDR, {
  networkPassphrase: "Public Global Stellar Network ; September 2015",
});

// For Soroban smart contract auth entries:
const signedEntry = await signAuthEntry(authEntryXDR);
```

**Chrome extension:** [freighter.app](https://freighter.app)  
**Developer docs:** [developers.stellar.org/docs/build/guides/freighter](https://developers.stellar.org/docs/build/guides/freighter)

---

### Stellar Wallets Kit — Multi-Wallet Abstraction ⭐

**What:** Single package that wraps Freighter, Albedo, xBull, LOBSTR, WalletConnect, and more behind one unified interface.

```bash
npx jsr add @creit-tech/stellar-wallets-kit
```

**Wallets supported:** Freighter, Albedo, xBull, Rabet, LOBSTR, Hana, HOT Wallet, Klever, WalletConnect  
**Methods:** `getAddress()`, `signTransaction()`, `setWallet()`, `openModal()`  
**Docs:** [stellarwalletskit.dev](https://stellarwalletskit.dev) | [GitHub](https://github.com/Creit-Tech/Stellar-Wallets-Kit)

---

### Albedo — Web-Based Signer (No Extension Required)

**What:** Browser-based delegated signer. Opens a secure popup from albedo.link. Good fallback for users without Freighter.

**Install:** `npm install @albedo-link/intent`

```typescript
import albedo from "@albedo-link/intent";

// Get public key (login)
const { pubkey } = await albedo.publicKey({ require_existing: true });

// Sign a transaction
const { signed_envelope_xdr } = await albedo.tx({
  xdr: unsignedTransactionXDR,
  network: "public",
  submit: false,
});

// Payment intent (no XDR required)
await albedo.pay({ amount: "10", destination: "G...", asset_code: "USDC", asset_issuer: "GA5Z...", network: "public" });
```

**Intents:** `public_key`, `sign_message`, `tx`, `pay`, `trust`, `exchange`, `implicit_flow`  
**GitHub:** [github.com/stellar-expert/albedo](https://github.com/stellar-expert/albedo)

---

### LOBSTR (Ultra Stellar)

**What:** Leading Stellar wallet (iOS, Android, Chrome extension). Built by Ultra Stellar.  
**Integration:** WalletConnect v2 for dApps; `@lobstrco/signer-extension-api` for browser extension.  
**Features:** SDEX trading, Aquarius/ICE voting, Blend integration, SEP standards.

---

### StellarX (Ultra Stellar)

**What:** Advanced DEX trading platform. First decentralized platform with global fiat gateways. 500+ trading pairs.  
**API:** No proprietary API — uses Stellar's native Horizon and Soroban RPC directly.

---

## 6. SDKs

### `@stellar/stellar-sdk` (JavaScript/TypeScript) ⭐

**The core SDK for all Stellar operations.**

```bash
npm install @stellar/stellar-sdk
```

**Latest:** v16.0.0 (June 2026). Breaking changes: axios → fetch, Node 22+, `@stellar/stellar-base` merged in, Protocol 27 support.

**Namespaces:**
- `Horizon` — REST client for Horizon API
- `rpc` (formerly `SorobanRpc`) — JSON-RPC client for Soroban smart contracts
- `Keypair`, `Asset`, `TransactionBuilder`, `Operation`, `Memo`, `Networks`

**Generate TypeScript bindings from Soroban contracts:**
```bash
npx @stellar/stellar-sdk generate \
  --contract-id CABC...XYZ \
  --network mainnet \
  --output-dir ./contract-client
```

**GitHub:** [github.com/stellar/js-stellar-sdk](https://github.com/stellar/js-stellar-sdk)  
**Docs:** [stellar.github.io/js-stellar-sdk](https://stellar.github.io/js-stellar-sdk/)

---

### `@stellar/typescript-wallet-sdk`

**Higher-level SDK for wallet and anchor integration.** Implements SEP-1, SEP-6, SEP-10, SEP-12, SEP-24, SEP-38, SEP-7, SEP-30.

```bash
yarn add @stellar/typescript-wallet-sdk
```

```typescript
import { Wallet } from "@stellar/typescript-wallet-sdk";

const wallet = Wallet.MainNet();
const anchor = wallet.anchor({ homeDomain: "testanchor.stellar.org" });
const sep10 = await anchor.sep10();
const authToken = await sep10.authenticate({ accountKp: myKeypair });
const info = await anchor.getInfo();
const sep24 = await anchor.sep24();
```

**npm:** [@stellar/typescript-wallet-sdk](https://www.npmjs.com/package/@stellar/typescript-wallet-sdk)

---

### Community SDKs

| Language | Package |
|---|---|
| Python | `stellar-sdk` (PyPI) |
| iOS/macOS | `stellar-ios-mac-sdk` (Soneso) |
| Flutter/Dart | `stellar_flutter_sdk` (Soneso) |
| PHP | `stellar-php-sdk` (Soneso) |
| Kotlin/JVM | `kmp-stellar-sdk` (Soneso) |
| Java | `java-stellar-sdk` (Lightsail) |
| C#/.NET | `dotnet-stellar-sdk` (Beans BV) |
| Go | Unified Go SDK (SDF official) |

---

## 7. Data & Indexing

### Horizon REST API

**Mainnet:** `https://horizon.stellar.org`  
**Testnet:** `https://horizon-testnet.stellar.org`  

> **Note:** SDF public Horizon retains only 1 year of history (since August 2024). For full history use StellarExpert or a third-party provider.

**Key endpoints:**

| Resource | Endpoint |
|---|---|
| Account details | `GET /accounts/{id}` |
| Account transactions | `GET /accounts/{id}/transactions` |
| Account payments | `GET /accounts/{id}/payments` |
| Order book | `GET /order_book?selling=XLM&buying=USDC:GA5Z...` |
| Payment paths | `GET /paths/strict-send` |
| Fee stats | `GET /fee_stats` |
| Liquidity pools | `GET /liquidity_pools` |
| Trade aggregations | `GET /trade_aggregations` |
| Submit transaction | `POST /transactions` |

**SSE Streaming:**
```typescript
import { Horizon } from "@stellar/stellar-sdk";
const server = new Horizon.Server("https://horizon.stellar.org");

server.payments().forAccount("G...").cursor("now").stream({
  onmessage: (payment) => console.log(payment),
});
```

---

### StellarExpert Open API (Free, No Auth)

**Base:** `https://stellar.expert/api/explorer`  
**Docs:** [stellar.expert/openapi.html](https://stellar.expert/openapi.html)  
**CORS:** Enabled — callable directly from browser.

```
# Screen recipient before transfer
GET /explorer/directory/{address}
→ { tags: ["malicious"|"exchange"|"anchor"|"issuer"|...] }

GET /explorer/directory/blocked-domains/{domain}
→ block fraudulent phishing domains

GET /explorer/{network}/asset/{asset}/rating
GET /explorer/{network}/asset/{asset}/holders
GET /explorer/{network}/ledger/sequence-from-timestamp?timestamp=...
```

**Use for TalkToStellar:** Fraud screening on all recipient addresses.

```typescript
const info = await (await fetch(`https://stellar.expert/api/explorer/directory/${address}`)).json();
if (info?.tags?.includes("malicious")) throw new Error("Flagged recipient");
```

---

### StellarBeat

**What:** Network monitoring for nodes, validators, quorum health.  
**URL:** [stellarbeat.io](https://stellarbeat.io) | API: `https://api.stellarbeat.io/docs/`

---

### Third-Party Indexers

| Provider | Notes |
|---|---|
| **Mercury** ([mercurydata.app](https://mercurydata.app)) | Fastest Soroban indexer; "Retroshades" for custom in-contract indexing |
| **SubQuery** | Stellar + Soroban combined; open-source; SCF grant recipient |
| **Goldsky** | ETL/mirror pipelines for streaming Stellar data to your database |
| **BlockEden.xyz** | Soroban RPC + GraphQL indexer API |
| **Space and Time** | ZK-proofs for tamper-proof SQL on Stellar data (launched Q4 2025) |
| **OBSRVR** | Real-time gateway + structured ledger pipelines |

> **Horizon is being progressively replaced** by Stellar RPC (for Soroban) and purpose-built indexers. Third-party providers (QuickNode, Ankr, Nodies, Lightsail) offer full-history Horizon + RPC Archive.

---

## 8. NFTs & Tokenization

### NFTs on Stellar — SEP-50 (Soroban)

**Standard:** SEP-50 (authored by OpenZeppelin + SDF, March 2025 draft). The new Soroban-native NFT standard. Supersedes classic SEP-39.

**Key interface methods:** `balance(owner)`, `owner_of(token_id)`, `transfer(from, to, token_id)`, `transfer_from(spender, from, to, token_id)`, `approve(approver, approved, token_id, live_until_ledger)`, `name()`, `symbol()`, `token_uri(token_id)`

**Extensions available (via OpenZeppelin Wizard):** `NonFungibleBurnable`, `NonFungibleEnumerable`, `Ownable`, Royalties, Soulbound (non-transferable), Batch/Consecutive

**Deploy flow:**
```bash
# 1. Generate contract at wizard.openzeppelin.com/stellar
# 2. Build
stellar contract build
# 3. Deploy
stellar contract deploy --wasm [path] --source-account [account] --network mainnet --alias MyNFT -- --owner [address]
# 4. Mint
stellar contract invoke --id MyNFT --source-account [account] --network mainnet -- mint --to [address]
```

**Marketplace:** No dedicated marketplace yet on Stellar (as of mid-2026). First major deployment: Meridian 2025 conference NFTs collected via QR/NFC + Freighter.

**OpenZeppelin Stellar Docs:** [docs.openzeppelin.com/stellar-contracts](https://docs.openzeppelin.com/stellar-contracts)  
**SEP-50 spec:** [github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0050.md](https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0050.md)

---

### Real-World Asset (RWA) Tokenization

**Scale (end-2025):** $785M in on-chain RWAs (158% YoY); crossed $1B in January 2026.

| Platform | Asset | Scale |
|---|---|---|
| Franklin Templeton (BENJI) | Tokenized US Treasury MMF | $580M+, SEC-registered |
| Figure (YLDS) | Yield-bearing USD instrument | Live May 2026 |
| RedSwan | Commercial real estate | $100M+ |
| Ondo Finance | Tokenized Treasuries (USDY) | 2025 partner |
| Etherfuse | Tokenized bonds (Mexico) | 2025 partner |
| SG Forge (Société Générale) | Bank-grade tokenized assets | 2025 partner |
| DTCC | Settlement infrastructure | Partnership; deployment H1 2027 |
| Marshall Islands | Sovereign digital instrument | $1.3B UBI distributed on-chain |

**Technical approach:** Classic assets via trustlines (simple), or Soroban smart contracts (programmable yield/compliance).

---

## 9. Compliance & Identity

### StellarExpert Directory — Fraud Screening

Screen every recipient before transfer (free, no auth):
```typescript
const res = await fetch(`https://stellar.expert/api/explorer/directory/${address}`);
const { tags } = await res.json();
if (tags?.includes("malicious")) blockTransfer();

// Check if a domain is known phishing
const blocked = await fetch(`https://stellar.expert/api/explorer/directory/blocked-domains/${domain}`);
```

---

### Native Asset Controls (Issuer-Level)

For tokens your app might issue:
- **Authorization Required:** accounts must be explicitly approved to hold
- **Authorization Revocable:** issuer can freeze accounts
- **Clawback:** reclaim tokens (regulatory remediation)
- These are flags on the Stellar account, not smart contracts

---

### X-Ray (Protocol 25, January 2026)

**What:** ZK (zero-knowledge) primitives added to Stellar mainnet. BN254 curve + Poseidon hash.  
**Use:** Selective disclosure — prove "I am KYC'd" without revealing all identity data. Privacy-preserving compliance.

---

### Third-Party AML/KYC

| Provider | Notes |
|---|---|
| **Elliptic** | Official SDF partner; XLM + Stellar assets; AI Copilot for alert review |
| **Chainalysis** | Industry standard transaction monitoring |
| **TRM Labs** | Stellar asset monitoring |

---

### Stellar Aid Assist / Stellar Disbursement Platform (SDP)

**What:** Open-source bulk payment platform for aid organizations. Up to 10,000 payments per batch (CSV). USDC + MoneyGram cash-out. UNHCR deployed in Ukraine.

**Cash-out wallets integrated:** Decaf, Beans App, Vesteo, Freedom Pay, VIA Wallet.

**GitHub:** [github.com/stellar/stellar-disbursement-platform-backend](https://github.com/stellar/stellar-disbursement-platform-backend)

---

## 10. Integration Roadmap for TalkToStellar

Prioritized by impact and integration effort:

### Priority 1 — MoneyGram Cash In/Out (1–2 weeks)
**Adds:** Cash deposits and withdrawals at 350,000+ agent locations worldwide. No bank account needed.
```
yarn add @stellar/typescript-wallet-sdk
```
1. Email `[email protected]` to get allowlisted
2. Implement SEP-10 auth against `homeDomain: "moneygram.com"`
3. Build SEP-24 deposit/withdraw flow (open MoneyGram iframe in a modal)
4. Poll for `pending_user_transfer_start`, then send USDC with memo
5. Test on testnet with Circle Faucet USDC

---

### Priority 2 — Multi-Anchor Fiat Gateway (2–4 weeks)
**Adds:** SEPA/EUR (Tempo), LATAM (Settle/Bitso), Africa (SatoshiPay) — all use the same SEP-24 protocol.
- Browse [anchors.stellar.org](https://anchors.stellar.org) filtered for SEP-24
- Nearly 100% code reuse from MoneyGram integration
- Dynamically discover anchor services via `anchor.getInfo()` and `anchor.sep1()`

---

### Priority 3 — Multi-Wallet Auth (1–2 weeks)
**Adds:** Let users connect their own self-custody Stellar wallets.
```bash
npx jsr add @creit-tech/stellar-wallets-kit
```
Wraps Freighter, Albedo, xBull, LOBSTR, WalletConnect in one API.

---

### Priority 4 — Soroswap DEX Swaps (1–2 days)
**Adds:** In-app token swaps (XLM ↔ USDC, EURC ↔ USDC) with aggregated best rates.
```bash
pnpm install soroswap-sdk
```
Register at `api.soroswap.finance/register` → quote → build → send.

---

### Priority 5 — EURC + SEP-38 Quotes (1 week)
**Adds:** EUR denomination support + live exchange rate quotes before transfer.
1. Add EURC trustline support
2. Use `sep38.requestQuote()` for live USDC↔EURC rates with fee breakdown

---

### Priority 6 — USDC Yield via DeFindex (2–4 weeks)
**Adds:** Users earn yield on idle USDC balances. Wallets get revenue share.
- Easier path: [docs.defindex.io](https://docs.defindex.io) — tokenized vaults, no direct Blend interaction
- Direct path: `@blend-capital/blend-sdk` with `PoolContract.submit(RequestType.SupplyCollateral, ...)`

---

### Priority 7 — StellarExpert Fraud Screening (1 day)
**Adds:** Block malicious recipient addresses and known phishing domains.
```typescript
const res = await fetch(`https://stellar.expert/api/explorer/directory/${recipientAddress}`);
const { tags } = await res.json();
if (tags?.includes("malicious")) throw new Error("Flagged");
```

---

## 11. Key Network Constants

```typescript
// ── Mainnet ─────────────────────────────────────────────────────────
const HORIZON_URL = "https://horizon.stellar.org";
const NETWORK_PASSPHRASE = "Public Global Stellar Network ; September 2015";
const SOROBAN_RPC_URL = "https://mainnet.sorobanrpc.com";

// ── Testnet ──────────────────────────────────────────────────────────
const HORIZON_TESTNET = "https://horizon-testnet.stellar.org";
const NETWORK_PASSPHRASE_TESTNET = "Test SDF Network ; September 2015";
const SOROBAN_RPC_TESTNET = "https://soroban-testnet.stellar.org";

// ── USDC ─────────────────────────────────────────────────────────────
const USDC_CODE = "USDC";
const USDC_ISSUER_MAINNET = "GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN";
const USDC_ISSUER_TESTNET = "GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5";

// ── EURC ─────────────────────────────────────────────────────────────
const EURC_CODE = "EURC";
const EURC_ISSUER_MAINNET = "GDHU6WRG4IEQXM5NZ4BMPKOXHW76MZM4Y2IEMFDVXBSDP6SJY4ITNPP";

// ── Account reserve requirements ─────────────────────────────────────
// Base reserve:     1.0 XLM
// Per trustline:    0.5 XLM
// 1 trustline (USDC only): minimum 1.5 XLM
// 2 trustlines (USDC+EURC): minimum 2.0 XLM

// ── Fees ─────────────────────────────────────────────────────────────
// Minimum fee: 100 stroops (0.0001 XLM) per operation
// Surge pricing during congestion — check /fee_stats first
```

---

## Ecosystem Status Summary (June 2026)

| Category | Status | TTS Relevance |
|---|---|---|
| SEP-24 anchors | 69+ live, 170+ currencies | **High — core fiat gateway** |
| MoneyGram cash ramps | 350k+ locations, 170 countries | **High — immediate integration** |
| USDC (Circle) | $223M on Stellar, CCTP live | **High — already integrated** |
| EURC (Circle) | MiCA-compliant, mainnet | **High — EUR corridors** |
| PYUSD (PayPal) | Live on Stellar | **Medium — future** |
| MGUSD (MoneyGram) | Launched June 2026 | **Low — watch** |
| Soroswap aggregator | $21M+ volume, mainnet | **Medium — add swap UI** |
| Aquarius AMM | $40M+ TVL, mainnet | **Medium — via Soroswap** |
| Blend lending | $100.6M TVL (Q1 2026) | **Medium — yield product** |
| DeFindex vaults | Mainnet, wallet integrations | **Medium — simpler yield** |
| Freighter wallet | Mainnet + mobile WalletConnect | **High — wallet auth** |
| Stellar Wallets Kit | All major wallets unified | **High — multi-wallet** |
| Albedo | No extension required | **Medium — fallback signer** |
| StellarExpert API | Free, no auth, CORS open | **High — fraud screening** |
| Horizon API | Public, free | **High — already using** |
| CCTP cross-chain USDC | Stellar↔ETH/SOL/AVAX/ARB | **Medium — future** |
| NFTs (SEP-50) | Draft standard, Soroban | **Low — future** |
| RWA tokenization | $1B+ on Stellar | **Low — institutional** |

---

*Sources: stellar.org, developers.stellar.org, docs.soroswap.finance, docs.aqua.network, docs.blend.capital, docs.defindex.io, developer.moneygram.com, stellar.expert, anchors.stellar.org, messari.io/report/state-of-stellar-q1-2026*
