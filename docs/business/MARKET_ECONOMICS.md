# TalkToStellar — Market & Unit Economics

## Market Sizing (Brazil Focus)

| Segment | Size | Source |
|---|---|---|
| PIX monthly users | 160M | Banco Central (2025) |
| Cross-border payments from Brazil | $45B/year | BCB |
| Freelancer/gig income in USD | $12B/year | PayPal, Payoneer reports |
| Brazilian crypto holders | 26M (12% of pop.) | Triple-A (2025) |
| WhatsApp users in Brazil | 170M | Meta |

### Serviceable Addressable Market (SAM)

Brazilians who regularly convert BRL to USD: freelancers, travelers, investors, small importers.

**SAM: ~5M people × avg $10K/year = $50B flow**

### Target (SOM)

WhatsApp-first users who want a simple dollar account without installing another app.

**Year 1 target: 5,000 active users × avg $5K flow = $25M total flow**

---

## Unit Economics

### Per-Transfer Model (R$1,000 BRL → USD conversion)

| Line | Amount | Who Gets It |
|---|---|---|
| User sends (PIX) | R$ 1,000.00 | Bridge PIX rail |
| Bridge PIX fee | R$ 5.00 (0.50%) | Bridge |
| TalkToStellar spread | R$ 3.00 (0.30%) | **TalkToStellar revenue** |
| Net converted to USDC | ~$177.00 (@ 5.60 BRL/USD) | User's Stellar wallet |

### Revenue Per User

| User Segment | Monthly Flow | TTS Revenue (0.30%) |
|---|---|---|
| Casual ($2K/year flow) | $167/mo | $0.50/mo |
| Regular ($10K/year flow) | $833/mo | $2.50/mo |
| Power ($50K/year flow) | $4,167/mo | $12.50/mo |
| Business ($200K/year flow) | $16,667/mo | $50.00/mo |

### At Scale (5,000 users at $5K avg annual flow)

- **Total flow**: $25M/year
- **TTS revenue**: $75K/year (0.30% spread)
- **Gross margin**: ~85% (server costs ~$500/mo on Railway, OpenAI ~$1K/mo)

### Additional Revenue Streams (post-launch)

| Stream | Rate | Potential at 5K users |
|---|---|---|
| Yield on USD balances (USDB) | 3–4% APR | $30K/year at $1M avg balance |
| Debit card interchange | ~1% per tx | Variable |
| Premium features (API, B2B) | Subscription | TBD |

---

## Cost Structure (Monthly, at 5K users)

| Cost | Estimate |
|---|---|
| Railway (backend + frontend + Evolution) | $200 |
| Supabase (database) | $25 (free tier likely sufficient) |
| OpenAI API (GPT-4o, ~50K queries/mo) | $1,000 |
| Bridge.xyz fees (absorbed in user pricing) | $0 (paid by user) |
| Vercel (frontend) | $20 (free tier likely sufficient) |
| Domain + misc | $30 |
| **Total** | **~$1,275/mo** |

---

## Competitive Fee Comparison

| Provider | BRL→USD Cost | Notes |
|---|---|---|
| Traditional bank | 2.0–5.0% | Hidden spread + IOF |
| Wise | 1.0–1.5% | Requires app + foreign account |
| Remessa Online | 1.3–2.0% | Web only |
| Binance P2P | ~0.5% + risk | No receipt, counterparty risk |
| **TalkToStellar** | **0.80%** | Chat-first, transparent, receipt |

---

## Break-Even

At 0.30% spread and $1,275/mo fixed costs:

**Break-even flow: $425K/month ($5.1M/year)**

This requires ~850 active users at $500/month avg flow, or ~250 regular users at $2K/month.

**Year 1 target of 5,000 users at $5K avg flow = $25M flow = ~7x break-even.**

---

## Key Assumptions & Risks

| Assumption | Risk | Mitigation |
|---|---|---|
| Bridge.xyz PIX fees ~0.50% | May be higher for Brazil | Contract negotiation before launch |
| User acquisition via WhatsApp organic | Slow without paid marketing | Partner with freelancer communities, finfluencers |
| USDC on Stellar maintains deep liquidity | Low risk | Circle is the largest regulated stablecoin; Stellar is deeply integrated |
| Regulatory classification of USDC as moeda vs ativo | Tax treatment uncertainty for off-ramp | Track Receita Federal guidance; classify as moeda in user messaging |
| OpenAI costs scale linearly | Could grow fast with usage | GPT-4o-mini for simple queries; cache common responses |
