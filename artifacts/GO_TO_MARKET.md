# TalkToStellar — Go-to-Market Strategy

## Positioning

> *"Sua conta global no WhatsApp. Fale, converta, invista."*

TalkToStellar is a **chat-first global account** for Brazilians who want dollar exposure without downloading another app. It's not a remittance bridge. It's not a crypto wallet. It's the account itself — accessed through conversation.

## Distribution Channels

### Channel 1: WhatsApp (Primary)

**Why**: 170M Brazilian users. Daily active behavior. Zero install friction.

**How**:
1. User saves the TalkToStellar WhatsApp number
2. Sends "oi" — bot responds with onboarding guide
3. User creates account via secure link, sets PIN
4. User sends "colocar 100 reais via PIX" — QR appears
5. User's PIX arrives → USDC appears in balance
6. User converts, sends, invests — all in chat

**Growth**: QR code on landing page → "Fale conosco no WhatsApp". Viral loops: "Pague Ana via TalkToStellar" links bring new users.

### Channel 2: Telegram (Secondary)

Same flow, Telegraf bot. Appeals to tech-savvy Brazilian community (crypto-adjacent, early adopters).

### Channel 3: Web Chat (Onboarding Funnel)

**talktostellar.com/chat** — web-based chat interface for users who discover via search or links. Converts to WhatsApp/Telegram for daily use.

### Channel 4: Product-Led Growth

- **"Pay Anyone" links**: User sends a payment link; recipient must create account to claim. Every payment is an acquisition event.
- **Receipt sharing**: Every transaction generates a visual receipt. Users share receipts on social media. Organic reach.

## Target Personas (Launch Phase)

| Persona | Pain | Acquisition | Message |
|---|---|---|---|
| **Dollarizing freelancer** | Loses 3% on every client payment converted | Freelancer groups, Twitter/LinkedIn | "Receba em dólar direto no WhatsApp. Taxa 0.30%." |
| **Crypto-curious professional** | Uses exchange but wants simpler UX | Telegram crypto groups, Stellar community | "USDC na sua conta. Fale com seu dinheiro. Sem exchange." |
| **Small e-commerce importer** | Complex FX, multiple platforms | Partner with small biz communities | "Converta reais para pagar fornecedor. Comprovante verificável." |
| **Travel-saver** | Wants dollar reserve without opening foreign account | Instagram/TikTok finfluencers | "Guarde dólar pelo WhatsApp. Saque quando quiser via PIX." |

## Launch Phases

### Phase 0: Pre-Launch (Current)
- ✅ All 3 channels working (WhatsApp, Telegram, Web)
- ✅ PIX on/off-ramp in sandbox
- ✅ Bridge.xyz integration coded
- 🔄 Bridge.xyz PIX access requested
- 🔄 Landing page repositioned to "conta global no chat"

### Phase 1: Alpha (50–100 users)
- Activate Bridge.xyz production PIX rail
- Invite-only via WhatsApp
- Manual onboarding with founder support
- Track: conversion completion rate, retention at 7/30 days
- Goal: prove chat-first flow converts

### Phase 2: Closed Beta (500–1,000 users)
- Public waitlist + invite codes
- Add USD ACH off-ramp (Bridge)
- Launch "Pay Anyone" viral loop
- Track: CAC, LTV, viral coefficient
- Goal: $50K monthly flow

### Phase 3: Open Launch (5,000+ users)
- Remove waitlist
- Add yield product (USDB on idle balances)
- Partner with freelancer platforms for integration
- Content marketing: receipt breakdowns, fee comparisons
- Goal: $25M annualized flow, revenue-positive

## Key Metrics (North Star)

| Metric | Target (Year 1) |
|---|---|
| Active users | 5,000 |
| Monthly flow | $2M |
| Revenue (0.30% spread) | $6K/mo |
| 30-day retention | >40% |
| PIX on-ramp completion rate | >60% |
| Support tickets per 100 users | <5 |
| Viral coefficient (k) | >1.1 |

## Competitive Moats

1. **Chat-first UX** — No one else does financial operations entirely in chat. The AI agent understands intent in natural language, reducing friction to zero.
2. **Stellar settlement** — 5-second finality, sub-cent fees, public audit trail. Traditional rails can't match this.
3. **Bridge.xyz/Stripe backing** — Enterprise compliance, MSB license, banking relationships. Hard to replicate as a startup.
4. **Multi-rail architecture** — PIX on/off-ramp, ACH, Wire, SEPA all through one API (Bridge). Not tied to a single payment method.
5. **Network effects** — Every payment to a new person is an acquisition event. Every shared receipt is an ad.

## Risk Matrix

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Brazil crypto regulation tightens | Medium | High | Classify USDC as "moeda digital", not "criptoativo" in user comms |
| Bridge.xyz delays PIX access | Low | High | Etherfuse production as fallback |
| User doesn't complete onboarding | High | Medium | Reduce steps: PIX → see balance within 2 minutes of first message |
| WhatsApp blocks commercial bots | Low | Critical | Telegram + Web Chat as fallback channels |
| OpenAI costs spike with scale | Medium | Low | Cache frequent responses; switch to gpt-4o-mini for simple intents |
| Competition (Wise, Nubank) adds chat | Medium | Medium | Our moat is Stellar verification + 0.30% spread. Compete on transparency. |

## Fundraising Narrative

> "Brazilians send $45B across borders every year, losing $1.6B to hidden fees. TalkToStellar replaces that entire stack with a WhatsApp conversation. PIX brings money in. Stellar settles it. Bridge (Stripe) handles regulation. The user just talks to an AI and gets a receipt."
