# TalkToStellar — PULSO Hackathon Demo Flow

A ready-to-record walkthrough for the 1–2 minute demo video and the live pitch.
Everything below maps to screens and integrations that exist in this repo.

---

## The one-liner

**TalkToStellar is a bank you talk to.** Latin Americans manage real money —
reais, dollars, and on-chain yield — from WhatsApp. The chat hides every piece
of crypto infrastructure; under the hood it runs on Stellar.

## The problem (customer discovery angle)

People in Brazil, Argentina, and Colombia want dollar savings that earn yield,
but the tools are crypto-native: wallets, seed phrases, gas, DEX UIs. Our
interviews pointed at the same wall — *"I'd use it if it felt like Nubank and
lived in WhatsApp."* So that's what we built.

## What's load-bearing on Stellar

| Capability | Stellar integration | Where in repo |
|---|---|---|
| Dollar yield (auto) | **DeFindex** USDC vault (Soroban) | `backend/src/integrations/defindex` |
| Per-asset lending | **Blend** v2 pools (Soroban) | `backend/src/integrations/blend` |
| Best-price conversions / liquidity | **Soroswap** aggregator + path payments | `backend/src/integrations/soroswap` |
| Fiat on/off-ramp (BRL PIX, USD wire/ACH) | **Bridge.xyz** → Stellar USDC | `backend/src/integrations/bridge` |
| Custodial accounts & signing | Stellar testnet + mainnet, vaulted keys | `backend/src/integrations/stellar-network` |

The integration is not on a slide — money actually moves: a real
`payment_processed` USD off-ramp and a live mainnet DeFindex USDC vault position
exist on this account today.

---

## Demo script (≈ 90 seconds)

> Record web in dark mode. Use the **Demo** (testnet) toggle for the funded
> ~283 USD wallet, then show **Real money** to prove it's not a mock.

### Scene 1 — "A bank in your chat" (0:00–0:20)
1. Open WhatsApp. Type: **"quanto tô rendendo?"**
2. The assistant answers inline with the balance and earnings — no app, no
   wallet. (Tool: `get_yield_balance`.)
3. Type: **"quero aplicar 100 dólares"** → the assistant replies with one line +
   👇 + a link to the investment suite. *Read in chat, act via link.*

### Scene 2 — Nubank-grade yield (0:20–0:50)
4. Open the link → **/rendimentos** "Seu dinheiro".
5. Show the calm default: **Earnings** (a growing line) and **Invest**. No
   jargon, no protocol names, advanced tools tucked away.
6. Tap a preset and **one-tap auto-invest** — funds sweep into the dollar yield
   vault. (DeFindex under the hood; the user only sees "aplicação".)
7. Toggle **Demo → Real money** to show the same flow on a real mainnet wallet.

### Scene 3 — Real-world rails (0:50–1:20)
8. Back in chat: **"sacar 50 dólares pra minha conta americana"** → link to
   **/usd-withdraw**.
9. On the page: available USD, pick a US bank, choose **ACH (cheaper)** or
   **Wire (same-day)**, confirm. (Bridge crypto-to-ach/wire off-ramp — the same
   path that already produced a real `payment_processed` transfer.)
10. Mention the mirror flow exists for **PIX in reais** and **USD wire deposit**.

### Scene 4 — The reveal (1:20–1:30)
11. "Everything you just saw — yield, swaps, on/off-ramp — runs on **Stellar**.
    The user never typed a seed phrase or paid gas." End on the clean home.

---

## Talking points for the live pitch

- **Integration depth:** three Soroban protocols (DeFindex, Blend, Soroswap)
  plus a fiat bridge, orchestrated server-side; conversions auto-route via path
  payments; custodial signing across testnet **and** mainnet.
- **Ecosystem impact:** brings real Latin American fiat (PIX BRL, USD wire/ACH)
  onto Stellar and into DeFi yield, behind a WhatsApp UX anyone can use.
- **Customer discovery:** the "make it feel like Nubank, keep it in WhatsApp"
  insight drove the whole design — infrastructure invisibility is a product
  rule, enforced in the agent's system prompt.
- **Deployment quality:** live testnet flows for the video; a funded mainnet
  DeFindex vault position and a settled mainnet off-ramp prove production
  readiness.

## Pre-demo checklist

- [ ] Backend `BRIDGE_ACCESS_PASSWORD` set (gates the real-money wallet view).
- [ ] Testnet demo wallet funded (~283 USD) for the "Demo" toggle.
- [ ] A US bank external account saved on the demo customer (for the off-ramp tap).
- [ ] WhatsApp/Telegram bot reachable; agent responds to the three prompts above.
- [ ] Dark mode on; record at phone aspect ratio for the chat, desktop for web.

## Submission packet (PULSO requirements)

- **Repo:** this repository (public, with README). ✅
- **Stellar integration:** load-bearing — see table above. ✅
- **Pitch deck:** cover problem → WhatsApp UX → Stellar rails → traction.
- **Demo video:** record the script above (1–2 min).
- **3 customer interviews:** record + drop an accessible drive link.
