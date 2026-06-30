# TalkToStellar

TalkToStellar is a conversational financial product that turns reais into digital dollars and moves value using Pix, Stellar, and a simple chat experience.

The user doesn't need to understand crypto wallets, issuers, trustlines, XDR, pathfinding, anchors, or blockchain. They chat over WhatsApp, Telegram, or web chat: check balance, simulate cost, add money via Pix, send to contacts, convert balance, track history, and receive receipts.

In one sentence:

```text
TalkToStellar turns Pix into a conversational BRL -> USD conversion route, using Stellar as the settlement rail, with fee transparency and verifiable evidence.
```

## Stellar Integrations (The Heart Of The Project)

Everything in this product runs on **load-bearing** Stellar integrations — they
move real money and are what makes the product work, not slideware. A dollar
comes in, is custodied, put to work earning yield, and withdrawn entirely
through these pieces, with settlement on Stellar (USDC SAC, path payments, and
Soroban contracts).

| Integration | Stellar layer | What it carries (load-bearing) | Network |
| --- | --- | --- | --- |
| **Bridge.xyz** | USDC SAC + custodial accounts | Real dollar on/off-ramp: virtual accounts (USD), per-email Stellar wallets with a vaulted key, wire/ACH withdrawal in USDC, and internal transfers across every account. Pix (BRL) is in the compliance phase at Bridge and not yet live on mainnet. | Mainnet (wire/ACH live; Pix pending) |
| **DeFindex** | Soroban contract | "Put your dollars to work": deposit/withdraw into an auto-optimized USDC vault, signed with the wallet's key | Mainnet + Testnet |
| **Blend** | Soroban contract | Lending yield: supply USDC into a pool, with live APY | Mainnet + Testnet |
| **Soroswap** | Soroban + path payments | Internal conversion (the user thinks "dollars", not token pairs) and XLM/USDC liquidity provision via zap | Mainnet |
| **Auto-yield** | Orchestrates DeFindex + Blend + Soroswap | Sweeps idle balance and automatically splits it into yield; runs on both networks and on a scheduler | Mainnet + Testnet |
| **Stellar SDK / Horizon / RPC** | Protocol core | Account, balance, trustline, XDR build/sign/submit, public history and evidence | Mainnet + Testnet |

> Technical detail for each integration is in the
> [Stellar Integrations (Product Core)](#stellar-integrations-product-core) section.

> **Pix status:** wire/ACH on/off-ramp for USD is live on mainnet through Bridge.
> Pix (BRL) is still in the compliance phase at Bridge and is not yet enabled for
> mainnet — it is wired in the product but stays disabled until Bridge clears it.

## Live Product

| Surface | Link |
| --- | --- |
| Landing page | https://talktostellar.com |
| Web chat | https://talktostellar.com/chat |
| Pix flow | https://talktostellar.com/pix-on |
| History | https://talktostellar.com/transactions |
| Stellar Mainnet console | https://talktostellar.com/mainnet |

The product already demonstrates a real user experience, payments and conversions in a secure Testnet/sandbox environment, conversational integration, and a read-only Mainnet layer for viewing public Stellar wallets without asking for a secret key.

Unrestricted real movement on Mainnet remains blocked by design until there are a secure signer, limits, operational approval, compliance, and regulated partners.

## Executive Summary

Brazil has one of the best domestic payment infrastructures in the world with Pix. Even so, converting BRL into USD and delivering that value into international accounts is still expensive, fragmented, and opaque.

The user often already has a preferred destination for dollars: Wise, a global account, an international bank, a brokerage, an investment account, a business account, or another provider. TalkToStellar doesn't need to replace those destinations.

The thesis is more direct:

```text
Be the cheapest, simplest, and most transparent route before the money reaches the destination the user already chose.
```

TalkToStellar combines:

- Pix as a familiar BRL entry point;
- Stellar as the settlement and evidence layer;
- USDC / digital dollar as USD value infrastructure;
- WhatsApp, Telegram, and web chat as the interface;
- visible fees and savings as the conversion trigger.

The user asks:

```text
"how much does it cost to send 5000 reais?"
"I want to send 100 dollars to Ana"
"balance"
"how much did I save this year?"
```

The system responds with a quote, fee, savings versus traditional methods, a confirmation link, and a receipt with Stellar evidence when applicable.

## Problem

Moving money from Brazil into dollar value still takes too many steps.

The problem isn't only the final account. It's the path the money takes to get there:

- banks hide cost in the FX spread;
- users compare quotes manually;
- Pix, FX, stablecoins, a global account, the receipt, and support live in separate places;
- crypto products require technical knowledge;
- the user rarely knows the real fee paid;
- small businesses lack a simple programmable layer for BRL -> USD.

At its core, the user's intent is simple:

```text
"I have reais and I want usable dollars somewhere else."
```

## Solution

TalkToStellar is a conversational BRL -> USD conversion and movement layer.

The user doesn't operate a wallet manually. The product translates natural language into a guided financial flow:

```text
User sends a message
-> TalkToStellar understands the intent
-> backend computes quote and fees
-> user funds or confirms with Pix/PIN
-> value is settled or evidenced via Stellar
-> receipt comes back in the same conversation channel
```

The product's focus is to make the financial value obvious:

- how much the user sends;
- how much arrives;
- what fee was paid;
- what a traditional method would charge;
- how much the user saved;
- where the transaction can be verified.

This positions TalkToStellar as a payment, conversion, and trust product.

## Product Experience

### Conversational Entry

The user starts on WhatsApp, Telegram, or web chat.

- Signed links for onboarding and confirmation.
- Token expiry and payload validation.
- PIN-protected payment confirmation.
- PIN reset with a temporary token and single-use invalidation.
- Audit logs for critical events.
- `POST /api/agent/query` requires `x-agent-ingest-secret` when `source` is `telegram` or `whatsapp`. Prefer `AGENT_INGEST_SECRET` with the same value on the backend and adapters. For compatibility, the backend and Telegram also accept `INTERNAL_API_SECRET` or `TELEGRAM_NOTIFY_SECRET` as a resolved fallback; without a shared secret, the backend refuses the request.

```text
balance
contacts
how much does it cost to send 5000 reais?
I want to send 100 dollars to Ana
I want to add 100 reais via Pix
I want to withdraw 50 reais to my Pix
how much did I save this year?
```

The language is financial and familiar, not crypto. The product talks about balance, Pix, dollars, contacts, fees, history, receipt, and savings.

### Pix As The Entry Point

Pix is the natural entry point for Brazilian users.

The product prepares the Pix flow, shows the fee, guides confirmation, updates the operation state, and delivers the receipt. In sandbox/Testnet, this demonstrates the operating model safely. In production, this layer should be connected to regulated Pix/FX partners.

Note: on the Bridge rail, Pix (BRL) is still in the compliance phase and not yet enabled for mainnet — the flow is wired into the product but stays disabled until Bridge clears it. Wire/ACH (USD) on/off-ramp is already live on mainnet.

### Payments To Saved Contacts

The product requires recipient clarity.

If the user asks to pay Ana, Ana has to be a real saved contact on their account. This reduces operational error and creates a more bank-like experience:

- validates the saved contact;
- validates the destination;
- validates the amount;
- shows the fee;
- asks for confirmation;
- records a receipt.

### Fees And Savings As Part Of The Product

TalkToStellar should not hide the fee in the final number.

The experience is built around a simple message:

```text
You paid this fee.
A traditional bank would charge this.
You saved this.
```

This concept shows up in:

- cost simulations;
- Pix screens;
- conversion previews;
- receipts;
- savings summaries;
- balance context.

The goal is to make savings appear every time the user interacts with money.

### Receipt With Evidence

After a payment or conversion, the user receives a receipt in the same channel.

The receipt can include:

- operation time;
- recipient;
- amount sent;
- amount delivered;
- fee paid;
- estimated savings;
- Stellar hash when present;
- history link;
- receipt link.

To the user it looks like a simple financial receipt. To the technical reviewer, there's verifiable evidence behind it.

## Why Stellar

Stellar makes sense because the problem here isn't speculation. It's settlement, interoperability, low cost, and traceability.

TalkToStellar uses Stellar as infrastructure:

- fast settlement;
- low network cost;
- stablecoin support;
- public transaction evidence;
- Testnet for safe development;
- Mainnet readiness with public-wallet reads and controlled future execution.

The product doesn't sell "crypto" to the user. It sells savings, clarity, and convenience. Stellar stays behind the scenes as the rail that enables the experience.

## Stellar Integrations (Product Core)

The integrations below are **load-bearing**: they move real money and hold the
product up, they aren't just on the slide. Every dollar that comes in is
on-ramped, custodied, put to work earning yield, and withdrawn by these pieces —
all settlement happens on Stellar (USDC SAC + path payments + Soroban contracts).

### Bridge.xyz — dollar in and out (on/off-ramp)

A fiat<>USDC rail that gives the user a real dollar account without needing a US
bank.

- **Virtual accounts (USD/EUR/MXN/GBP/COP/BRL):** the user receives wire/ACH
  details and the money arrives as USDC on Stellar.
- **Per-email custodial wallets (`bridge_stellar_wallets`):** a mainnet Stellar
  wallet per account, with the signing key kept in a vault
  (`vault_secret_id`) — the user never touches a secret key.
- **Real off-ramp:** `crypto-to-{ach,wire,pix,rtp,sepa,spei}` via liquidation
  addresses — USDC leaves the wallet and lands in the user's bank account.
  Wire/ACH (USD) is live on mainnet; the Pix (BRL) rail is in Bridge's
  compliance phase and not yet enabled for mainnet.
- **Unified internal transfer (`/internal-transfer`):** moves USDC between any
  account in the suite — custodial⇄custodial, custodial→stellar,
  stellar→stellar, stellar→custodial — signing the Stellar legs with the
  wallet's vaulted key.

### DeFindex — yield vault (Soroban)

An auto-optimized USDC vault. The backend builds the deposit/withdraw operation
(`buildVaultAction`), signs it with the wallet's key, and submits — on mainnet
and testnet. It's the foundation of "put your dollars to work."

### Blend — lending pool (Soroban)

Direct USDC supply into a Blend pool (`buildSupplyXdr` + signed submit). It sits
side by side with DeFindex, with live APY, and joins the auto-investment split.

### Soroswap — liquidity and conversion (Soroban + path payments)

- **Internal conversion:** swaps and conversions happen behind the scenes via
  path payments (the user thinks "dollars", not token pairs).
- **Liquidity provision (zap):** invest into an XLM/USDC pool from a single USDC
  amount — the backend swaps half into XLM and adds balanced liquidity
  (`buildAddLiquidityXdr`), all signed with the vaulted key.
- **Live data:** TVL/fee/reserves read from Horizon for the LP yield simulator.

### Auto-yield — put idle balance to work

Sweeps the wallet's idle USDC and splits it between DeFindex and Blend
(configurable split); optionally swaps idle XLM (above the gas reserve) into
USDC first. Works on both networks and also runs on a scheduler.

### Two-wallet architecture

- **Testnet = session wallet** (login/`wallets`, by `session_id`) for safe
  demos.
- **Mainnet = Bridge wallet** (`bridge_stellar_wallets`, found by email) where
  the real dollars live. Gas is sponsored by the platform (sponsored reserves),
  so the user doesn't need to hold XLM.

| Integration | Stellar layer | What it carries |
| --- | --- | --- |
| Bridge.xyz | USDC SAC / custodial accounts | Dollar in and out, account suite, internal transfers |
| DeFindex | Soroban contract | Yield in an auto-optimized vault |
| Blend | Soroban contract | Lending yield |
| Soroswap | Soroban + path payments | Internal conversion and liquidity provision (LP) |
| Auto-yield | Orchestrates DeFindex+Blend+Soroswap | Automatically puts idle balance to work |

## Market

Initial audiences:

- Brazilians who dollarize their savings;
- travelers who top up global accounts;
- freelancers who pay or get paid for international services;
- startups and small businesses with a USD need;
- fintechs that need a programmable Pix -> USD layer;
- users who already have Wise, Revolut, Mercury, a brokerage, or an international bank.

The strategy isn't to compete head-on with global accounts.

The strategy is to become the conversion route the user trusts before sending to those accounts.

## Business Model

Possible revenue streams:

- transparent fee per conversion;
- Pix on-ramp/off-ramp fee;
- fee per B2B transfer;
- API/SaaS for businesses;
- premium reconciliation and reporting;
- revenue from regulated off-ramp/payout partners;
- in-house financial products once there's trust and volume.

The product should win by the savings it delivers to the user, not by margin hidden in confusing FX.

## Go-To-Market

The first promise is simple:

```text
Convert cheaper and send to the destination you already use.
```

This builds trust and transactional volume.

Once the user recognizes TalkToStellar as the cheapest, most practical route from BRL to USD, the product can expand into:

- saved international destinations;
- B2B flows;
- inter-institution settlement;
- treasury and reconciliation;
- native financial products inside the TalkToStellar ecosystem.

The entry point is savings. The long-term opportunity is control of the financial flow.

## Product Built So Far

The project already includes:

- a live landing page;
- web chat;
- WhatsApp integration via the Evolution API;
- Telegram integration;
- link-based onboarding;
- PIN confirmation;
- saved contacts;
- payment confirmation links;
- Pix on-ramp/off-ramp flow;
- dollar on/off-ramp via Bridge.xyz (USD virtual accounts + ACH/wire withdrawal);
- per-email custodial Stellar wallets with a vaulted key;
- an account suite (virtual accounts, custodial, Stellar) with internal transfers between them;
- yield in DeFindex (vault) and Blend (lending) with live APY;
- Soroswap liquidity provision (XLM/USDC zap) inside the app;
- auto-yield that puts idle balance to work on both networks;
- fee- and savings-oriented UX;
- transaction history;
- receipt generation;
- Stellar Testnet infrastructure and custodial execution on Mainnet;
- payout adapter architecture;
- reconciliation and settlement-evidence models;
- documentation for demo, deploy, fees, security, and Mainnet readiness.

This is not just a landing page. The repository contains a full-stack product, conversational integration, and evolving settlement infrastructure.

## High-Level Architecture

```text
WhatsApp / Telegram / Web
        |
        v
Conversational agent
        |
        v
Quote, fee, contact, Pix, and payment tools
        |
        v
Orchestration backend and transactional state
        |
        v
Stellar integrations  ──  Bridge (on/off-ramp + custody)
                      ──  DeFindex / Blend (yield, Soroban)
                      ──  Soroswap (conversion + liquidity)
                      ──  Auto-yield (orchestrates the three)
        |
        v
Stellar settlement / evidence / receipts
        |
        v
History, reconciliation, and notifications
```

Main components:

- `frontend/`: Next.js interface;
- `backend/`: TypeScript API, agent, Stellar services, Pix adapters, and fee services;
- `telegram/`: Telegram adapter;
- `evolution/`: WhatsApp/Evolution support;
- `docs/`: demo, deploy, security, UX, fees, and Mainnet guides.

## Current Mainnet Position

The product has a live Mainnet surface:

```text
https://talktostellar.com/mainnet
```

Current state:

- the user can attach a Stellar Mainnet public key;
- the app reads public balances and operations;
- secret keys are never requested;
- Mainnet payments stay disabled until there's a signer, limits, manual approval, compliance, and operation with partners.

This is the right stage to demonstrate Mainnet readiness without taking on premature risk of moving real value.

## Regulatory And Operational Reality

TalkToStellar should not be presented as a bank, a licensed payment institution, or an international remittance operation ready to scale without proper partners.

The path to production requires:

- a regulated Pix/FX partner;
- KYC/KYB;
- sanctions screening;
- transaction monitoring;
- IOF and tax-treatment review;
- a payout/off-ramp provider;
- limits and manual review;
- a secure signer and treasury controls;
- legal and compliance review.

The right framing today is:

```text
A live product and infrastructure in validation for conversational BRL -> USD conversion using Stellar.
```

## Roadmap

### Phase 1 - Product Validation

- improve WhatsApp-first UX;
- strengthen Pix flows;
- make savings visible in every interaction;
- validate real users with public Mainnet wallet reads;
- collect feedback on conversion intent and trust in the receipt.

### Phase 2 - Partner Pilot

- integrate a regulated Pix/FX/off-ramp partner;
- enable controlled low-value flows;
- add compliance checks;
- expand reconciliation and the operations dashboard;
- support business users and saved international destinations.

### Phase 3 - Settlement Infrastructure

- inter-institution routing;
- payout provider adapters;
- USD delivery instructions;
- treasury controls;
- an API for businesses.

### Phase 4 - Native Financial Ecosystem

- retain more value inside TalkToStellar;
- launch in-house account controls;
- broaden B2B products;
- explore native financial products on Stellar.

## Investor Thesis

TalkToStellar combines three strong behaviors:

1. Brazilians already use Pix every day.
2. Users and businesses increasingly want dollar exposure and usage.
3. Conversational interfaces reduce friction in financial actions.

The product thesis is practical: reduce conversion friction and show savings clearly.

The infrastructure thesis is deeper: use Stellar as the settlement and evidence rail behind a familiar chat experience.

If TalkToStellar earns trust as the simplest and cheapest way to go from BRL to USD, it can evolve from "conversion route" into "financial operating layer" for people and businesses.

## Running Locally

Local startup:

```bash
chmod +x start-local.sh
./start-local.sh
```

Local URLs:

```text
Frontend: http://localhost:3000
Backend:  http://localhost:3001
```

Build backend:

```bash
cd backend
npm run build
```

Build frontend:

```bash
cd frontend
npm run build
```

Agent evals:

```bash
cd backend
npm run eval:agent
```

## Business And Technology Appendix

This section summarizes the project from a more operational point of view: what business the product wants to be, which flows already exist, how the system is assembled, and which decisions need to be clear before production.

### Commercial Proposition

TalkToStellar is a conversion, payment, and evidence layer for users who start in BRL and need to reach USD, Pix, contacts, or an external public key without operating crypto infrastructure directly.

The product captures value at three moments:

- before the operation, by showing quote, fee, destination, and estimated savings;
- during the operation, by reducing friction with chat, short links, PIN, and review screens;
- after the operation, by delivering history, receipt, and traceability.

The differentiator isn't just "using Stellar". The differentiator is hiding the right complexity and revealing the financial information that matters: how much leaves, how much arrives, what fee was paid, and where the operation can be audited.

### Priority Personas

| Persona | Main pain | Value delivered |
| --- | --- | --- |
| Individual user | Convert BRL to USD without comparing several platforms | Clear quote, Pix, balance, history, and receipt |
| Freelancer or creator | Receive/pay in dollars with less friction | Conversational flow, contacts, and secure confirmation |
| Small business | Reconcile recurring payments and conversions | History, evidence, and operational reporting |
| Fintech/API product | Add a Pix -> USD route without building it all | Modular backend, adapters, and reusable endpoints |

### Core Product Flows

1. **Account and session**
   The user enters via chat, link, or web. The backend creates or retrieves the session, wallet, and conversation state. The session is protected by a token, HttpOnly cookies on the frontend, and backend validations.

2. **Balance and history**
   The experience shows balances in simple language and queries consolidated history from operations, payment logs, and receipts.

3. **Pix on-ramp**
   The user adds reais via Pix. The system creates the intent, tracks status, updates the balance, and keeps the experience separate from the provider's technical details.

4. **Conversion**
   The user picks source, destination, and amount. The conversion screen asks the backend for a real route, shows an estimate, and only then unlocks confirmation.

5. **Payment to a contact**
   The user picks a saved contact, reviews amount and destination, confirms with PIN, and receives a receipt. This avoids sending to ambiguous recipients.

6. **External send**
   The user sends to an external public key on a dedicated screen. The interface validates the key, balance, destination, and PIN before submitting.

7. **Pix off-ramp**
   The user provides a Pix key and reviews how much leaves the balance and how much arrives in reais. If the balance is short, the screen should offer conversion or a Pix top-up.

### Technical Architecture

The system is split into experience surfaces, financial orchestration, and integration infrastructure.

| Layer | Responsibility | Main directories |
| --- | --- | --- |
| Frontend | Web screens, confirmation, Pix, conversion, history, account, and chat UX | `frontend/app`, `frontend/components`, `frontend/lib` |
| Agent | Intent interpretation, tool selection, and conversational response | `backend/src/api/agent` |
| Backend API | Session, wallet, payments, conversion, Pix, receipts, and audit | `backend/src/api` |
| Stellar | XDR, signing, submit, path payment, balances, and evidence | `backend/src/api/services/stellar.service.ts` |
| Providers | Pix, WhatsApp, Telegram, email, payout, and external integrations | `backend/src/integrations`, `telegram`, `evolution` |
| Data | Session state, wallets, operations, contacts, links, and receipts | Supabase/Postgres via repositories |

Simplified flow of an operation:

```text
Message or web screen
-> intent and parameter normalization
-> preview/quote creation
-> review on a dedicated page
-> PIN/passkey when applicable
-> backend execution
-> Stellar/external provider submit
-> transaction log
-> receipt and response to the user
```

### Operational Data Model

The product's main entities are:

- `agent_sessions`: session, user, channel, and token state;
- `wallets`: Stellar wallet linked to the session/user;
- `contacts`: saved recipients and delivery keys;
- `operations`: internal financial operations and status;
- `payment_logs`: payments, conversions, hashes, and execution metadata;
- `payment_confirmations`: single-use confirmation links;
- `short_links`: short public links with expiry;
- `activity_feed`: friendly history for the interface;
- `user_passkeys` and `passkey_challenges`: WebAuthn credentials and challenges when enabled.

In practice, `operations` is the operational control layer and `payment_logs` is the payments/conversions evidence layer. Screens should prefer consolidated data and never expose raw database errors.

### Security And Controls

Controls already handled or planned in the design:

- signed, expirable links for onboarding, login, and confirmation;
- mandatory PIN for sensitive confirmation;
- passkey/WebAuthn as a strong authentication path;
- HttpOnly cookies for web sessions;
- `x-agent-ingest-secret` to protect ingestion from WhatsApp/Telegram;
- idempotency keys on mutating operations;
- audit logs for critical events;
- sanitized public messages so schema, constraints, or stack traces aren't exposed;
- read-only Mainnet until there's a signer and approved operation.

### External Integrations

| Integration | Current use | Note |
| --- | --- | --- |
| Stellar SDK/Horizon | Account, balance, XDR, submit, and public history | Testnet and custodial execution on Mainnet |
| Bridge.xyz | Dollar on/off-ramp, virtual accounts, custodial wallets, internal transfers | Wire/ACH (USD) live on mainnet behind an access password; Pix (BRL) in Bridge's compliance phase, not yet enabled for mainnet |
| DeFindex | USDC yield vault (Soroban) | Mainnet + testnet; vault configurable via env |
| Blend | USDC lending pool (Soroban) | Live APY; joins the auto-yield split |
| Soroswap | Conversion (path payments) and XLM/USDC liquidity provision | Add-liquidity requires USDC+XLM funded in the wallet |
| Supabase | Operational database, session, wallets, snapshots, and logs | Needs migrations applied outside startup |
| Evolution API | WhatsApp | Requires an instance and aligned secrets |
| Telegram/Telegraf | Telegram bot | An invalid token throws `401 Unauthorized` at startup |
| Etherfuse sandbox | Pix/on-ramp/off-ramp and sandbox assets | Production requires a partner and regulatory framing |
| SendGrid/email | Confirmations and recovery | Optional depending on the enabled flow |

### Production Criteria

Before treating the product as a financial operation in production, these points need to be settled:

- a regulated Pix/FX/off-ramp partner and an operational contract;
- KYC/KYB and screening appropriate to the user's country;
- limits per user, operation, day, and destination;
- a monitoring, alerting, and manual-review routine;
- reconciliation across bank, provider, Stellar, and database;
- a chargeback/refund/operational-error policy;
- a secure signer, key segregation, and a recovery plan;
- terms, privacy policy, and risk disclosure;
- observability correlating `request_id`, session, operation, and hash.

### Metrics That Matter

Business metrics:

- converted volume;
- active users per channel;
- completion rate for Pix, conversion, and payment;
- estimated savings delivered to the user;
- revenue per operation;
- per-user recurrence.

Technical metrics:

- error per flow and per provider;
- quote time;
- time to confirmation;
- time to submit/settlement;
- idempotency failures;
- balance divergence;
- rate of expired or double-used links.

### What This Repo Should Not Promise Yet

This repository should not be presented as:

- a bank;
- a ready, regulated global account;
- unrestricted international remittance;
- a Mainnet custodian without additional controls;
- a substitute for compliance, KYC, a Pix/FX partner, or legal counsel.

The correct positioning is: a live full-stack product, with real UX and conversion/payment infrastructure in validation, ready to evolve into a regulated pilot with partners.

## Summary

TalkToStellar is building a conversational BRL -> USD route for Brazil.

The product doesn't ask the user to become a crypto expert. It uses familiar channels, Pix, contacts, transparent fees, and receipts, while Stellar provides settlement, low cost, and verifiable evidence behind the scenes.

The short-term opportunity is cheaper conversion. The long-term opportunity is to become the financial-flow layer for people and businesses moving between reais and dollars.
