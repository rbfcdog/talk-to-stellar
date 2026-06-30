# TalkToStellar — Demo Video Script (~2:00)

A tight, record-ready walkthrough, framed around the **WhatsApp** interface.
Time budget: **~25s intro → ~40s the dollar account (in/out) → ~55s yield**.
Read the narration in **bold**; the *italic* lines tell you what to show and click.

> Tip: record each screen as a short clip, then stitch. Have a logged-in test
> account ready (email `rodtretinha@gmail.com`) so balances are populated. The
> first thing to show is a **WhatsApp message**, then the **link** opening a page —
> make that hop obvious so it's clear the whole product lives in chat.
> Target ~300 spoken words = ~2 min at a natural pace.

---

## 0:00 – 0:25 · Intro (WhatsApp chat)

*Screen: a real **WhatsApp** conversation with TalkToStellar — a couple of
messages already on screen, like texting a friend.*

> **"Meet Marina. She lives in Brazil and just wants to keep some savings in
> dollars — and earn on them. But every option means a crypto wallet, a seed
> phrase, gas fees… stuff that feels scary and easy to get wrong. So she does the
> safe thing: nothing. We built TalkToStellar for her — a dollar bank that lives
> inside WhatsApp. She just texts it. No app, no wallet, no jargon — and
> everything you're about to see is real money, live on Stellar mainnet."**

*Action: type "quero ver minha conta de dólar" and send. The agent replies with
one line and a link — tap the link to open the account page.*

---

## 0:25 – 1:05 · Her dollar account — virtual account, accounts, Stellar wallets

*Screen: the link opens the **dollar account** page (`/wire-onramp`). Scroll
slowly through the account suite: the **virtual account** card, then the
**receiving accounts**, then the **TalkToStellar (Stellar) accounts**.*

> **"One tap, and her whole dollar account opens. Up top, a **virtual US
> account** — real routing and account number. She wires or sends ACH from any US
> bank, and the dollars land here as digital dollars. Below it are her
> **receiving accounts**, and her **TalkToStellar accounts** — these are real,
> custodial Stellar wallets, with the signing key kept in a vault she never
> touches. That's the trick: under the hood it's Bridge plus Stellar wallets, but
> all Marina sees is 'my account' and a balance. And when she wants the money
> back, she cashes out to her US bank the same way — wire or ACH."**

*Action: on the virtual-account card, one-tap copy a field (bank / routing /
account) to show it's real. Scroll to the **receiving accounts** and the
**TalkToStellar accounts** so all three layers are on screen. Optional: cut to
the **Withdraw** page for ~2s — pick a destination bank, show the confirm.*

---

## 1:05 – 2:00 · The money earns by default (`/rendimentos`)

*Screen: the **Returns** (rendimentos) page. Show the balance, the live gain
curve (gains only, per-minute), and the APY. This is the longest beat — slow
down here.*

> **"Here's what makes it a bank she'd actually use: the money doesn't sit idle —
> it earns by default. We're live on mainnet across two protocols — DeFindex
> vaults and Blend lending — and here's her balance and the yield curve, ticking
> up every single minute, showing only the gains, not her deposits. She taps a
> product, picks an amount, and it's working in one tap — no extension, no signing
> pop-ups. Under **Advanced** there's more: extra Blend markets we're rolling out,
> and a Soroswap integration we're wiring in. And it's automatic both ways — when
> she cashes out, the system pulls exactly what she needs back out of the vault
> first, the same way it invested it. Wire and ACH are live today; Pix for Brazil
> is in compliance and lands next. Real dollars in, real mainnet yield, real
> cash-out — all from a chat. That's TalkToStellar."**

*Action: tap the **USDC yield** product → set a small amount → tap **Supply** and
show the green "✓" confirmation. Open **Advanced options** for ~1s. For the
closing line, cut back to the **WhatsApp** chat.*

---

## Screen checklist (in order)

| # | Screen | Route | Show | ~Time |
|---|--------|-------|------|-------|
| 1 | WhatsApp chat | (WhatsApp) | the message + the agent's reply with a link | 0:00–0:25 |
| 2 | Dollar account | `/wire-onramp` | **virtual account** (bank/routing/account, one-tap copy), **receiving accounts**, **TalkToStellar (Stellar) accounts** | 0:25–0:55 |
| 3 | Withdraw (off-ramp) | `/usd-withdraw` | (optional, ~2s) destination bank + confirm | 0:55–1:05 |
| 4 | Returns / yield | `/rendimentos` | balance + per-minute gain curve, DeFindex + Blend live, USDC supply → ✓, **Advanced** (more Blend + Soroswap) | 1:05–1:50 |
| 5 | WhatsApp chat | (WhatsApp) | closing line | 1:50–2:00 |

## Talking-points cheat sheet (keep it accurate)

- **Open like a story:** a real person (Marina) who wants dollar savings but finds
  crypto scary — then "she just texts it." Human first, tech second.
- **The hop to show first:** WhatsApp message → agent reply with a link → link
  opens the page. Make it obvious the product lives in chat.
- **The account suite = three layers:** the **virtual account** (US bank deposit
  details), the **receiving accounts**, and the **TalkToStellar accounts** (real
  custodial Stellar wallets, key vaulted). Name them on screen.
- **On/off-ramp:** **live on mainnet** — receive via the virtual account (wire/ACH
  in), cash out (wire/ACH), all in **USDC**, via Bridge.
- **PIX (Brazil):** **not live yet** — in **compliance**, coming soon. Say "coming",
  don't demo it.
- **Yield (the focus):** **DeFindex** + **Blend** both **live on mainnet**;
  auto-allocated and auto-redeemed on spend. Longest beat.
- **Advanced:** more **Blend** markets being implemented; **Soroswap** "wiring in",
  not finished.

## Recording notes

- Use **Live / Real** mode on the network toggle so balances look real (one
  toggle, top of the yield page).
- Portuguese on screen + English narration reads as "built for the market, told
  to the world" — that's fine.
- Don't show the access-password gate or any operator/detail panels — keep it
  customer-facing.
- If a live supply/withdraw is risky on camera, pre-fund and use a small amount
  (e.g. 1 USDC) so the ✓ confirmation is genuine.
- Keep the account-suite scroll crisp (~30s); spend the saved time on the
  **yield** beat.
