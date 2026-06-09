# TalkToStellar — Executive Summary

## What We Do

TalkToStellar converts reais (BRL) into dollars (USD) through a chat interface.
Users talk to an AI assistant on WhatsApp, Telegram, or web — describe what they want — and the system executes the transaction with transparent fees and verifiable Stellar receipts.

## The Problem

Brazilians pay 2–5% in hidden spreads to convert BRL to USD. The process is fragmented across multiple apps (bank → brokerage → international account). There's no transparent evidence of the rate applied or fees charged.

## Our Solution

A conversational account that lives in chat. Users bring reais in via PIX, convert to dollars, hold balances, earn yield, and send payments to contacts — all through natural language messages.

**PIX is the interface. Stellar is the settlement rail. Bridge.xyz (Stripe) is the regulated converter.**

## Market

- **110 million** PIX users in Brazil
- **$45B** annual cross-border payments from Brazil (2025)
- **$12B** freelancer/gig economy dollar revenue from Brazil
- Traditional FX cost: 3.5% average ($1,575 on a $45K transfer)

## Revenue Model

| Revenue Stream | Rate |
|---|---|
| Conversion spread (BRL ↔ USD) | 0.30% |
| PIX on-ramp provider margin | ~0.50% |
| PIX off-ramp provider margin | ~0.50% |
| Future: yield on idle balances | 3–4% APR |
| Future: card interchange | ~1% |

## Competitive Advantage

| We | Traditional (Wise, bank) | Crypto (exchange) |
|---|---|---|
| Chat-first. No app install | ✅ | ❌ | ❌ |
| Transparent fee before confirm | ✅ | ❌ | ❌ |
| Verifiable blockchain receipt | ✅ | ❌ | ❌ |
| PIX native (Brazil focus) | ✅ | ✅ | ❌ |
| AI agent understands intent | ✅ | ❌ | ❌ |
| 0.30% spread (vs 1.5–3.5%) | ✅ | ❌ | ❌ |

## Technology

- **AI Agent**: LangGraph + GPT-4o routes user intent to tools
- **Settlement**: Stellar blockchain (5-second finality, $0.00001 fees)
- **Fiat rails**: Bridge.xyz (Stripe-owned, US MSB licensed) for PIX and ACH
- **Infrastructure**: Supabase, Railway, Vercel

## Traction

- Live on WhatsApp, Telegram, and web chat
- Working PIX on/off-ramp (sandbox) with Etherfuse
- Real Stellar Testnet settlement with hash receipts
- DeFindex yield vaults integrated
- 200+ automated tests
- Mainnet read-only dashboard ready

## Team

**Rodrigo Banin Ferraz de Camargo** — Founder. Full-stack engineer. Built the entire platform: backend (Express + LangGraph + Stellar SDK), frontend (Next.js + Tailwind), WhatsApp integration (Evolution API), Telegram bot (Telegraf), and PIX ramp (Etherfuse).

## Ask

Seeking strategic partnership or investment to:
1. Activate Bridge.xyz for production PIX/ACH rails
2. Launch regulated BRL↔USD conversion in Brazil
3. Scale user acquisition via WhatsApp and Telegram
4. Build card issuance and yield products

## Contact

**TalkToStellar** · talktostellar.com · github.com/rbfcdog/talk-to-stellar
