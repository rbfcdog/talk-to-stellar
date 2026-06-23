# TalkToStellar — DoraHacks BUIDL Submission

---

## Project Name
**TalkToStellar**

## Tagline
*The invisible Stellar bank. Users chat. Soroswap, DeFindex, and Bridge do the work.*

## Category
DeFi · Payments · Consumer · AI / Conversational

## Live Demo
- **Web app**: https://talk-to-stellar-owxg.vercel.app
- **Chat**: https://talk-to-stellar-owxg.vercel.app/chat
- **GitHub**: https://github.com/rbfcdog/talk-to-stellar

---

## Description

### The Problem

Stellar is one of the most capable payment and DeFi networks in the world.

And almost nobody uses it directly.

Not because it isn't good enough — but because the surface is wrong. Users don't want to manage trustlines, path-find routes, sign XDR envelopes, or pick between Soroswap, Phoenix, and Aqua. They want to send money, earn yield, and convert currencies. The complexity sits between the intent and the action.

The result: Stellar's infrastructure is underutilized. Soroswap liquidity goes untapped. DeFindex vaults yield without retail deposits. Bridge's wire/ACH rails sit idle for most users. The ecosystem is built — the access layer isn't.

---

### What TalkToStellar Is

TalkToStellar is a **conversational financial platform** built entirely on Stellar infrastructure — where the infrastructure is completely invisible to the user.

The user sends a WhatsApp or Telegram message:

```
"quero trazer dólares do meu banco americano"
"converte 200 reais pra dólar"
"aplica 50 dólares"
"troca 50 XLM por USDC"
"saldo"
```

The AI agent understands the intent, picks the right tool (Bridge wire, Soroswap DEX, DeFindex vault, PIX anchor), builds the transaction or frontend interface, and responds in one line with a link. The user never sees a DEX, a vault, a route, or a contract.

**Stellar does the work. The user just chats.**

---

### Architecture

```
WhatsApp / Telegram / Web Chat
          ↓
  LangChain AI Agent (intent router)
          ↓
┌─────────────────────────────────────┐
│  Tool Layer (invisible to user)     │
│                                     │
│  • Soroswap DEX (token swaps)       │
│  • DeFindex Vaults (yield)          │
│  • Bridge.xyz (wire/ACH USD)        │
│  • Etherfuse PIX (BRL on/off-ramp)  │
│  • Stellar Horizon (settlement)     │
└─────────────────────────────────────┘
          ↓
  Stellar Testnet / Mainnet-ready
          ↓
  Frontend confirmation pages
  (PIN / Passkey / WebAuthn)
```

The AI agent uses **intent routing via system prompt** — no regex, no hardcoded parsers. Each integration is described to the LLM as a natural language routing spec. The model picks the right tool via function calling. New integrations are added by extending the routing spec.

---

### Stellar Ecosystem Integrations

#### Soroswap (DEX Aggregator)
- Token swaps routed through Soroswap's aggregator (covers Phoenix, Aqua, SDEX)
- Live quote → XDR builder → sign in Stellar Lab
- Agent routes to swap interface with `open_swap_interface` tool
- Pair, amount, trade type (EXACT_IN / EXACT_OUT) pre-filled from chat

#### DeFindex (Yield Vaults — SEP-56)
- Users earn yield on USDC and EURC deposits
- Agent calls `prepare_yield_action` → `confirm_yield_action`
- Vault addresses, strategy, and contract details invisible to user
- User sees: "50 USDC prontos pra render. 👇 https://..."

#### Bridge.xyz (Wire / ACH USD Rails)
- Users receive USD from US bank accounts (wire or ACH)
- Agent calls `open_wire_onramp_interface` → shows deposit instructions
- Routing number, account number, bank name pulled from Bridge virtual accounts by session
- User sees: "Dados pra receber dólar de US$ 500 via banco americano. 👇 https://..."

#### Etherfuse (PIX On/Off-Ramp)
- BRL deposits via PIX → USDC on Stellar
- BRL withdrawals from USDC → PIX key
- Full anchor integration (SEP-24 flow)

#### Stellar Native
- Non-custodial: each user has their own Stellar wallet
- Private keys stored in Supabase Vault (never in app tables)
- Signing via PIN (bcrypt) or Passkey (WebAuthn / P-256)
- Smart accounts via OpenZeppelin Soroban contracts
- 13-state transfer orchestration engine with append-only audit log

---

### What's Been Built

| Feature | Status |
|---------|--------|
| WhatsApp integration (Evolution API) | Production |
| Telegram integration | Production |
| LangChain AI agent with intent routing | Production |
| Soroswap swap interface (quote + XDR build) | Built |
| DeFindex yield (deposit / withdraw / balance) | Production (testnet) |
| Bridge.xyz wire/ACH virtual accounts | Built |
| PIX on-ramp / off-ramp (Etherfuse) | Production (sandbox) |
| Conversion engine (BRL ↔ USDC ↔ XLM ↔ EURC) | Production |
| Non-custodial wallet architecture (Supabase Vault) | Production |
| PIN + Passkey / WebAuthn auth | Production |
| Smart accounts (Soroban / OpenZeppelin) | Production |
| 13-state cross-border transfer FSM | Production |
| 45+ frontend pages (Next.js) | Production |
| Row-Level Security on 48+ tables | Production |
| Multi-provider email (SES / Resend / SendGrid) | Production |
| Transaction history + receipts with Stellar hash | Production |
| P2P payments to saved contacts | Production |
| Payment links (pay-anyone flow) | Production |
| Mainnet console (read-only wallet view) | Production |

---

### The Invisible Infrastructure Principle

Every integration follows the same UX rule:

> The user names a financial goal. The platform names a number. The infrastructure is never mentioned.

- "DEX" → user sees "troca direta"
- "DeFindex vault" → user sees "aplicação"
- "Bridge wire" → user sees "banco americano"
- "Soroswap route" → user sees the output amount
- "XDR" → user sees a confirmation button

This isn't hiding complexity for simplicity's sake. It's the correct product abstraction: **users buy outcomes, not mechanisms**. Stellar's infrastructure delivers the outcome. TalkToStellar is the translation layer.

---

### Why This Matters for Stellar

Every user of TalkToStellar is a user of Soroswap, DeFindex, Bridge, and Stellar — they just don't know it. That's the point.

Retail adoption of DeFi infrastructure doesn't come from better UX on protocol frontends. It comes from **embedding the protocol inside products people already use** — like WhatsApp.

TalkToStellar is a proof of concept that Stellar's ecosystem can be packaged into a chat-first experience that feels like a bank, works like DeFi, and requires zero crypto knowledge from the end user.

---

### Team

Solo project by **Rodrigo** — full-stack developer, building on Stellar since the hackathon started.

- GitHub: https://github.com/rbfcdog
- Contact: contact.andreloubet@gmail.com

---

### Links

| | |
|--|--|
| **Live app** | https://talk-to-stellar-owxg.vercel.app |
| **Chat** | https://talk-to-stellar-owxg.vercel.app/chat |
| **PIX flow** | https://talk-to-stellar-owxg.vercel.app/pix-on |
| **Swap UI** | https://talk-to-stellar-owxg.vercel.app/swap |
| **Wire/ACH UI** | https://talk-to-stellar-owxg.vercel.app/wire-onramp |
| **Yield UI** | https://talk-to-stellar-owxg.vercel.app/yield |
| **Mainnet console** | https://talk-to-stellar-owxg.vercel.app/mainnet |
| **GitHub** | https://github.com/rbfcdog/talk-to-stellar |

---

*Built on Stellar. Powered by Soroswap, DeFindex, and Bridge. Delivered by chat.*


**Rodrigo Banin** — Engineer and product builder at the intersection of applied AI and blockchain. Formerly at BTG Pactual, where he built production multi-agent systems, and now building TalkToStellar, a WhatsApp-based AI agent that makes Stellar wallets and transactions accessible through natural language.

**André** — Software engineer and co-founder of EvidenceOne, an AI medical platform built from scratch and now used by 300+ doctors. Experienced in system architecture, LLMs, data pipelines, AWS infrastructure, and agentic coding workflows.

**João Pedro** — Engineer and entrepreneur with experience across physical and digital businesses. Built projects that generated over R$100K in revenue at age 18, combining strategy, data-driven execution, AI, technology, and investments to create scalable financial solutions.
