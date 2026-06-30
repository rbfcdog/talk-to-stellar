# TalkToStellar

**The invisible Stellar bank.** Users chat. Bridge, DeFindex, Blend, and Soroswap do the work — chained into one money lifecycle.

| Field | Value |
|---|---|
| **Project** | TalkToStellar |
| **Tagline** | A bank you talk to — real dollars, real yield, real cash-out, all from a chat. |
| **Category** | DeFi · Payments · Consumer · AI / Conversational |
| **Network** | Stellar mainnet — wire/ACH + DeFindex + Blend live; Pix in compliance |
| **Live app** | https://talktostellar.com |
| **Chat** | https://talktostellar.com/chat |
| **Pitch deck** | https://docs.google.com/presentation/d/1QjniT8MyUwDwbDIfWl797Mscottl4tdPCIDI_vZNJ3Y/edit |
| **Customer interviews (PT-BR)** | https://drive.google.com/drive/u/0/folders/1HnMCFOUPH1FSmTptT2hlhcuTNkxyrV9M |
| **GitHub** | https://github.com/rbfcdog/talk-to-stellar |

---

## The problem

Stellar is one of the most capable payment and DeFi networks in the world — and almost nobody uses it directly.

Not because it isn't good enough, but because **the surface is wrong**. The pieces a real financial life needs are all there — a fiat ramp (Bridge), yield (DeFindex, Blend), a DEX (Soroswap), settlement (Stellar core) — but they're **separate products**, each with its own wallet, trustlines, XDR envelopes, contract addresses, and chain mechanics. To go from "dollars in my US bank" to "dollars earning yield" to "dollars back in my bank", a user today has to stitch four protocols together by hand.

So they don't. The result is an ecosystem that is **built but underused**: Soroswap liquidity goes untapped, DeFindex and Blend yield without retail deposits, and Bridge's wire/ACH rails sit idle for most people. **The infrastructure exists — the layer that makes it act as one product doesn't.**

Our customer interviews in Brazil, Argentina, and Colombia pointed at the same wall:

> *"I'd use it if it felt like Nubank and lived in WhatsApp."*

The job isn't to build another protocol frontend. It's to make the protocols that already exist **compose into a single thing a person can actually use** — and hide every seam.

---

## What TalkToStellar is

TalkToStellar is a **conversational financial platform that chains Stellar's ecosystem into one money lifecycle — where the infrastructure is completely invisible to the user.**

The user sends a WhatsApp, Telegram, or web-chat message; an AI agent maps the intent to the right integration, builds the transaction (signed server-side with the user's vaulted key), and replies in one line with a link. The user never sees a DEX, a vault, a route, a chain, or a contract.

```
"quero trazer dolares do meu banco americano"  ->  receive USD by wire/ACH   (Bridge)
"aplica meus dolares"                          ->  earn yield on USDC        (DeFindex + Blend)
"converte 50 XLM pra dolar"                    ->  swap / convert            (Soroswap)
"saca 100 dolares pro meu banco"               ->  cash out wire/ACH         (Bridge, auto-redeem)
"saldo"                                        ->  balance                   (Stellar core)
```

**Stellar does the work. The user just chats.**

---

## What was already there — and what each integration added

We didn't start from zero. TalkToStellar was already a **working conversational bank for Brazil**, and the hackathon work was about **plugging Stellar's ecosystem into that existing product** — reusing the same rails, not rebuilding them.

**What the product already had (the base):**

- A **conversational AI agent** (WhatsApp / Telegram / web) with intent routing.
- **Per-user custodial Stellar wallets** with the signing key in **Supabase Vault**.
- **PIN (bcrypt) + Passkey (WebAuthn)** auth and dedicated **confirmation pages**.
- **PIX on/off-ramp (BRL)**, a **conversion engine** (BRL / USDC / XLM / CETES), **saved contacts**, **P2P payments**, **payment links**.
- **Balance, history, and receipts** with a Stellar hash; a 13-state transfer FSM, RLS, idempotency, and an audit log.

The key point: **every integration plugged into those existing rails** — the same agent spec, the same vaulted-key custody, the same PIN/passkey confirmation pages, the same receipts and history. Adding a protocol meant *extending the agent's routing spec and dropping in one tool*, not standing up new infrastructure.

| Already had | The integration that built on it | What it added |
|---|---|---|
| BRL-only ramp (PIX) + custodial wallets | **Bridge.xyz** | A **real USD rail** — virtual US accounts (wire/ACH in), USD off-ramp, and a full custodial account suite. Turned a BRL bank into a **dollar** bank. |
| Idle USDC sitting in the wallet | **DeFindex** | **Yield** — one-tap deposit/withdraw into an auto-optimized vault. Idle dollars now earn. |
| A single yield source | **Blend** | A **second yield market** (lending) running beside DeFindex, plus higher-APY markets under Advanced. |
| A "convert" UX backed by simple swaps | **Soroswap** | Real **DEX conversion via path payments** and **XLM/USDC liquidity (zap)** behind the same "convert" button. |
| Manual deposit/withdraw per protocol | **Auto-yield** | The **orchestration** that chains DeFindex + Blend + Soroswap — auto-allocate idle USDC and **auto-redeem on spend**, so money is always earning yet always spendable. |

The sum is bigger than the parts: the existing conversational/custody/security layer **multiplied** every integration, because each one inherited a finished UX, a signer, and a confirmation flow on day one.

---

## How the integrations come together

This is the core of the project: the integrations aren't a feature list, they're a **pipeline**. Follow a single dollar through the stack — every leg is load-bearing, every leg settles on Stellar, and the handoffs are automatic.

1. **In — Bridge.** A virtual US account gives the user real routing/account numbers. A normal wire or ACH lands **USDC in their own custodial Stellar wallet** (live on mainnet).
2. **Custody — Stellar.** Each user gets one isolated Stellar key, generated server-side and encrypted in **Supabase Vault**; gas is **sponsored by the platform**, so the user never holds or thinks about XLM.
3. **Earn (automatic) — DeFindex + Blend + Soroswap.** Idle USDC is swept and **split across DeFindex (vault) and Blend (lending)** by the auto-yield orchestrator. **Soroswap** handles any conversion in the path — e.g. swapping idle XLM into USDC first, or zapping a single USDC amount into balanced XLM/USDC liquidity — all via path payments.
4. **Hold — yield by default.** The user's balance doesn't sit idle; it's working across protocols, with a live per-minute gain curve and APY.
5. **Spend (automatic) — auto-redeem.** Because the money is always in yield, the instant any transaction needs USDC the system **redeems exactly the shortfall** back out of DeFindex, then Blend — the exact inverse of the initial allocation. The user never manually "exits" a position.
6. **Out — Bridge.** The off-ramp sends USDC back to the user's US bank over **wire or ACH**.

Every signing leg uses the wallet's vaulted key; every settlement, hash, and receipt is on Stellar. The agent chooses the tool; the chaining is the product.

---

## The integrations, one by one

Each entry: what it **added** to the existing product, and what it **plugged into**.

### Bridge.xyz — the dollar rail (on/off-ramp) · live on mainnet
- **Added:** a real **USD rail**. Virtual US account → the user receives USD by **wire/ACH**, arriving as **USDC on Stellar**; **off-ramp** back to a US bank (wire/ACH) that **auto-redeems from yield** first; per-email **custodial Stellar wallets** with the key vaulted; a **unified internal transfer** across every account (custodial-to-custodial, custodial-to-stellar, stellar-to-stellar, stellar-to-custodial).
- **Plugged into:** the existing custodial-wallet model and confirmation flow — so a BRL-only conversational bank became a **dollar** bank without a new UX.
- *Pix (BRL) is in Bridge's compliance phase — wired in, but not yet enabled for mainnet.*

### DeFindex — yield vault (Soroban) · live on mainnet
- **Added:** **yield on idle dollars**. One-tap USDC deposit/withdraw into an auto-optimized vault; `buildVaultAction` -> sign -> submit.
- **Plugged into:** the vaulted-key signer and PIN/passkey confirmation — the user just sees "aplicacao", never a vault address or contract. It's the first leg the auto-yield split funds and the first it redeems on a spend.

### Blend — lending pool (Soroban) · live on mainnet
- **Added:** a **second yield market** (lending) beside DeFindex, with live APY and higher-APY markets under **Advanced** (`buildSupplyXdr` + signed submit).
- **Plugged into:** the same one-tap supply UX and auto-yield split — two protocols, one "rendimento" surface.

### Soroswap — conversion & liquidity (Soroban + path payments)
- **Added:** real **on-chain conversion** behind the existing "convert" button — swaps via path payments — plus **XLM/USDC liquidity (zap)** from a single USDC amount.
- **Plugged into:** the product's conversion engine and quote/fee UX — the user keeps thinking "dollars", not token pairs. *Being wired in / expanded now.*

### Auto-yield — the orchestrator that ties three protocols together
- **Added:** the **glue**. Sweeps idle USDC and splits it across **DeFindex + Blend** (configurable split), optionally swapping idle XLM (above a gas reserve) via **Soroswap** first; its inverse — **auto-redeem on spend** — makes "money always earning" safe for a bank-like UX. Runs on both networks and on a scheduler.
- **Plugged into:** the transfer FSM and the spend paths — so every off-ramp/transfer pulls exactly what it needs back out of yield automatically.

### Stellar native — custody & settlement (the base every integration reuses)
- Per-user isolated keys, encrypted in **Supabase Vault**; signing gated by **PIN (bcrypt)** or **Passkey (WebAuthn / P-256)**; platform-sponsored reserves so users never hold XLM.
- A 13-state transfer-orchestration engine with an append-only audit log; every operation carries a Stellar hash for verifiable evidence. **This is the layer the four integrations above plugged into — it's why each one shipped fast and felt finished.**

---

## Architecture

A message comes in over **WhatsApp, Telegram, or web chat**. A **LangChain AI agent** routes the intent (via system prompt — no regex, no parsers) to an invisible **tool layer**, which signs and settles on **Stellar mainnet** and returns a one-line reply with a confirmation link.

The tool layer:

- **Bridge.xyz** — wire / ACH USD rails
- **DeFindex** — Soroban yield vaults
- **Blend** — Soroban lending pools
- **Soroswap** — swaps / liquidity (path payments)
- **Auto-yield** — orchestrates the three above
- **Stellar RPC / Horizon** — settlement

Money-moving actions finish on a dedicated **frontend confirmation page** (PIN / Passkey / WebAuthn), never in chat.

The agent uses **intent routing via system prompt** — each integration is described to the LLM as a natural-language routing spec, and the model picks the right tool via function calling. New integrations are added by extending the spec, not by writing parsers.

---

## The invisible-infrastructure principle

Every integration follows the same UX rule:

> The user names a financial goal. The platform names a number. The infrastructure is never mentioned.

| Under the hood | What the user sees |
|---|---|
| DEX / Soroswap route | "troca direta" + the output amount |
| DeFindex / Blend | "aplicacao" / "rendimento" |
| Bridge wire | "banco americano" |
| Stellar / chain | "conta" (account) — the chain is hidden |
| Wallet | "conta" — never "wallet" |
| XDR envelope | a confirmation button |

This isn't hiding complexity for its own sake — it's the **correct product abstraction**: users buy outcomes, not mechanisms. Stellar's infrastructure delivers the outcome; TalkToStellar is the translation layer that makes the four protocols feel like one bank.

---

## Security & custody model

- **Key isolation:** one Stellar key per user, encrypted at rest in Supabase Vault, never exposed to the app layer or the client.
- **Authorization:** every money-moving action is gated by the user's PIN or Passkey; confirmation happens on a dedicated page, not in chat.
- **Defense in depth:** Row-Level Security on 48+ tables, idempotency on money routes, one-time/expiring secure links for confirmation, and an append-only transfer audit log.

---

## Why this matters for Stellar

Every user of TalkToStellar is a user of Bridge, DeFindex, Blend, and Soroswap at once — they just don't know it. **That's the point.** The value isn't any single integration; it's that they're **chained into one lifecycle** a non-crypto user can run from a chat box.

Retail adoption of DeFi infrastructure doesn't come from better UX on protocol frontends. It comes from **composing the protocols into a product people already use** — like WhatsApp — so that a dollar can ramp in, earn across two yield markets, and ramp out, without the user ever meeting a wallet, a route, or a contract.

---

## Roadmap

- **Pix (BRL) on mainnet** once Bridge clears compliance — the flow is already wired in.
- **More Blend markets** in Advanced, and **deeper Soroswap** conversion/LP integration.
- **Per-user authorization** hardening on all money-movement endpoints.
- **Receipts & insights in chat** — shareable receipts and a "you saved R$ X vs a bank" summary after each operation (the backend already computes these).

---

## Pitch & research

- **Pitch deck:** https://docs.google.com/presentation/d/1QjniT8MyUwDwbDIfWl797Mscottl4tdPCIDI_vZNJ3Y/edit
- **Customer interviews (PT-BR):** https://drive.google.com/drive/u/0/folders/1HnMCFOUPH1FSmTptT2hlhcuTNkxyrV9M — recorded interviews across Brazil / Argentina / Colombia that shaped the "feels like Nubank, lives in WhatsApp" thesis.

---

## Links

| Surface | URL |
|---|---|
| **Live app** | https://talktostellar.com |
| **Chat** | https://talktostellar.com/chat |
| **Wire / ACH UI** | https://talktostellar.com/wire-onramp |
| **Yield UI** | https://talktostellar.com/rendimentos |
| **Withdraw UI** | https://talktostellar.com/usd-withdraw |
| **Mainnet console** | https://talktostellar.com/mainnet |
| **Pitch deck** | https://docs.google.com/presentation/d/1QjniT8MyUwDwbDIfWl797Mscottl4tdPCIDI_vZNJ3Y/edit |
| **Customer interviews (PT-BR)** | https://drive.google.com/drive/u/0/folders/1HnMCFOUPH1FSmTptT2hlhcuTNkxyrV9M |
| **GitHub** | https://github.com/rbfcdog/talk-to-stellar |

---

*Built on Stellar. Bridge ramps it in, DeFindex and Blend make it earn, Soroswap moves it, and the chain settles it — delivered by chat.*
