# TalkToStellar — DoraHacks BUIDL Submission

> **The invisible Stellar bank.** Users chat. Soroswap, DeFindex, Blend, and Bridge do the work.

| | |
|---|---|
| **Project** | TalkToStellar |
| **Tagline** | A bank you talk to — real dollars, real yield, real cash-out, all from a chat. |
| **Category** | DeFi · Payments · Consumer · AI / Conversational |
| **Network** | Stellar (testnet live, mainnet-ready) |
| **Live app** | https://talk-to-stellar-owxg.vercel.app |
| **Chat** | https://talk-to-stellar-owxg.vercel.app/chat |
| **GitHub** | https://github.com/rbfcdog/talk-to-stellar |
| **Pitch deck** | https://docs.google.com/presentation/d/1QjniT8MyUwDwbDIfWl797Mscottl4tdPCIDI_vZNJ3Y/edit |
| **Customer interviews (PT-BR)** | https://drive.google.com/drive/u/0/folders/1HnMCFOUPH1FSmTptT2hlhcuTNkxyrV9M |

---

## The problem

Stellar is one of the most capable payment and DeFi networks in the world — and almost
nobody uses it directly.

Not because it isn't good enough, but because **the surface is wrong**. Users don't want
to manage trustlines, path-find routes, sign XDR envelopes, or choose between Soroswap,
Phoenix, and Aqua. They want to **send money, earn yield, and convert currencies**. The
complexity sits between the intent and the action.

The result: Stellar's infrastructure is underutilized. Soroswap liquidity goes untapped,
DeFindex and Blend yield without retail deposits, and Bridge's wire/ACH rails sit idle for
most users. **The ecosystem is built — the access layer isn't.**

Our customer interviews in Brazil, Argentina, and Colombia pointed at the same wall:

> *"I'd use it if it felt like Nubank and lived in WhatsApp."*

So that's what we built.

---

## What TalkToStellar is

TalkToStellar is a **conversational financial platform built entirely on Stellar
infrastructure — where the infrastructure is completely invisible to the user.**

The user sends a WhatsApp, Telegram, or web-chat message:

```
"quero trazer dólares do meu banco americano"   → receive USD by wire/ACH
"converte 200 reais pra dólar"                    → BRL → USD via PIX
"aplica 50 dólares"                               → earn yield on USDC
"troca 50 XLM por USDC"                           → swap
"saldo"                                           → balance
```

The AI agent understands the intent, picks the right tool (Bridge wire, Soroswap DEX,
DeFindex/Blend yield, PIX anchor), builds the transaction or the right interface, and
replies in one line with a link. The user never sees a DEX, a vault, a route, a chain, or
a contract.

**Stellar does the work. The user just chats.**

---

## The 60-second demo flow

The story arc judges see in the demo video: *money arrives → money grows → money out.*

| Step | Screen | What happens |
|---|---|---|
| 1 | **Chat** | "I want to receive dollars" → agent returns a link |
| 2 | **Receive dollars** (`/wire-onramp`) | Real US bank details (routing + account); a normal wire/ACH lands dollars in the user's account |
| 3 | **Returns** (`/rendimentos`) | Balance + APY, gain-only chart; tap a product → supply USDC in one tap → ✓ confirmed |
| 4 | **Withdraw** (`/usd-withdraw`) | Send dollars back to a US bank over ACH/wire |
| 5 | **Chat** | Receipt and history land back in the conversation |

Throughout, the UI speaks the user's language — "account", "deposit", "earnings" — never
"wallet", "chain", "vault", or a protocol name.

---

## Architecture

```
WhatsApp / Telegram / Web Chat
            │
            ▼
   LangChain AI agent  (intent router via system prompt — no regex, no parsers)
            │
            ▼
┌──────────────────────────────────────────────┐
│  Tool layer  (invisible to the user)          │
│                                               │
│  • Soroswap     — DEX aggregator / swaps      │
│  • DeFindex     — Soroban yield vaults         │
│  • Blend        — Soroban lending pools        │
│  • Bridge.xyz   — wire / ACH USD rails         │
│  • Etherfuse    — PIX BRL on/off-ramp (SEP-24) │
│  • Stellar RPC / Horizon — settlement          │
└──────────────────────────────────────────────┘
            │
            ▼
   Stellar testnet / mainnet-ready
            │
            ▼
   Frontend confirmation pages  (PIN / Passkey / WebAuthn)
```

The agent uses **intent routing via system prompt** — each integration is described to the
LLM as a natural-language routing spec, and the model picks the right tool via function
calling. New integrations are added by extending the spec, not by writing parsers.

---

## Stellar ecosystem integrations

### Soroswap — DEX aggregator
- Token swaps routed through Soroswap's aggregator (covers Phoenix, Aqua, SDEX).
- Live quote → XDR build → sign → submit; the user only sees the output amount.
- Agent routes via `open_swap_interface`; pair, amount, and trade type pre-filled from chat.

### DeFindex — Soroban yield vaults
- Users earn yield on USDC deposits with a single tap.
- Agent calls `prepare_yield_action` → `confirm_yield_action`.
- Vault address, strategy, and contract details stay invisible.
- User sees: *"50 USDC prontos pra render. 👇 https://…"*

### Blend — Soroban lending pools
- USDC supplied directly into Blend's lending market for variable APY.
- One-tap custodial supply from the user's account — no extensions, no signing pop-ups.
- The home view shows the simple **USDC yield**; higher-APY markets live behind *Advanced*.

### Bridge.xyz — wire / ACH USD rails
- Users receive USD from a US bank account (wire or ACH) and cash back out the same way.
- Agent calls `open_wire_onramp_interface`; routing number, account number, and bank name
  come from a Bridge virtual account scoped to the session.
- User sees: *"Dados pra receber dólar de US$ 500 via banco americano. 👇 https://…"*

### Etherfuse — PIX on/off-ramp
- BRL deposits via PIX → USDC on Stellar, and BRL withdrawals from USDC → PIX key.
- Full anchor integration over the SEP-24 interactive flow.

### Stellar native — custody & settlement
- Per-user isolated keys, generated server-side and stored encrypted in **Supabase Vault**
  — keys never live in app tables.
- Signing is gated by the user's **PIN (bcrypt)** or **Passkey (WebAuthn / P-256)**.
- Smart accounts via OpenZeppelin Soroban contracts.
- A 13-state transfer-orchestration engine with an append-only audit log.

---

## The invisible-infrastructure principle

Every integration follows the same UX rule:

> The user names a financial goal. The platform names a number. The infrastructure is never mentioned.

| Under the hood | What the user sees |
|---|---|
| DEX / Soroswap route | "troca direta" + the output amount |
| DeFindex / Blend | "aplicação" / "rendimento" |
| Bridge wire | "banco americano" |
| Stellar / Base / chain | "conta" (account) — the chain is hidden |
| Wallet | "conta" — never "wallet" |
| XDR envelope | a confirmation button |

This isn't hiding complexity for its own sake — it's the **correct product abstraction**:
users buy outcomes, not mechanisms. Stellar's infrastructure delivers the outcome;
TalkToStellar is the translation layer.

---

## Security & custody model

- **Key isolation:** one Stellar key per user, encrypted at rest in Supabase Vault, never
  exposed to the app layer or the client.
- **Authorization:** every money-moving action is gated by the user's PIN or Passkey;
  confirmation happens on a dedicated page, not in chat.
- **Defense in depth:** Row-Level Security on 48+ tables, idempotency on money routes,
  one-time/expiring secure links for confirmation, and an append-only transfer audit log.
- **Honest about the demo:** the hackathon build runs a shared-access gate on the Bridge
  console for fast iteration; productionizing per-user authorization on the money routes is
  the top item on the roadmap below.

---

## What's been built

| Feature | Status |
|---|---|
| WhatsApp integration (Evolution API) | Production |
| Telegram integration | Production |
| LangChain AI agent with intent routing | Production |
| Soroswap swap interface (quote + XDR build) | Built |
| DeFindex yield (deposit / withdraw / balance) | Production (testnet) |
| Blend lending supply (USDC + advanced markets) | Built (mainnet) |
| Bridge.xyz wire/ACH virtual accounts (on + off-ramp) | Built |
| PIX on-ramp / off-ramp (Etherfuse) | Production (sandbox) |
| Conversion engine (BRL ↔ USDC ↔ XLM ↔ EURC) | Production |
| Per-user vaulted-key architecture (Supabase Vault) | Production |
| PIN + Passkey / WebAuthn auth | Production |
| Smart accounts (Soroban / OpenZeppelin) | Production |
| 13-state cross-border transfer FSM | Production |
| Account-first UI (no wallet/chain/protocol jargon) | Production |
| 45+ frontend pages (Next.js) | Production |
| Row-Level Security on 48+ tables | Production |
| Multi-provider email (SES / Resend / SendGrid) | Production |
| Transaction history + receipts with Stellar hash | Production |
| P2P payments to saved contacts | Production |
| Payment links (pay-anyone flow) | Production |
| Mainnet console (read-only account view) | Production |

---

## Why this matters for Stellar

Every user of TalkToStellar is a user of Soroswap, DeFindex, Blend, Bridge, and Stellar —
they just don't know it. **That's the point.**

Retail adoption of DeFi infrastructure doesn't come from better UX on protocol frontends.
It comes from **embedding the protocol inside products people already use** — like WhatsApp.

TalkToStellar is a proof that Stellar's ecosystem can be packaged into a chat-first
experience that **feels like a bank, works like DeFi, and requires zero crypto knowledge**
from the end user.

---

## Roadmap

- **Per-user authorization** on all money-movement endpoints (session-token + ownership
  checks) — replacing the demo's shared-access gate.
- **Receipts & insights in chat** — shareable receipt images and a "you saved R$ X vs a
  bank" summary after each operation (the backend already computes these).
- **Projected earnings** on the yield screen — "in 1 year this becomes $X".
- **Mainnet GA** for the wire/ACH and yield flows once authorization hardening lands.

---

## Team

Solo project by **Rodrigo** — full-stack developer, building on Stellar.

- GitHub: https://github.com/rbfcdog
- Contact: contact.andreloubet@gmail.com

---

## Links

| | |
|---|---|
| **Live app** | https://talk-to-stellar-owxg.vercel.app |
| **Chat** | https://talk-to-stellar-owxg.vercel.app/chat |
| **PIX flow** | https://talk-to-stellar-owxg.vercel.app/pix-on |
| **Swap UI** | https://talk-to-stellar-owxg.vercel.app/swap |
| **Wire / ACH UI** | https://talk-to-stellar-owxg.vercel.app/wire-onramp |
| **Yield UI** | https://talk-to-stellar-owxg.vercel.app/yield |
| **Mainnet console** | https://talk-to-stellar-owxg.vercel.app/mainnet |
| **GitHub** | https://github.com/rbfcdog/talk-to-stellar |

---

*Built on Stellar. Powered by Soroswap, DeFindex, Blend, and Bridge. Delivered by chat.*
