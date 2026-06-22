# OPEN-ISSUES.md — Actionable Backlog

> **Living document.** Items removed when verified fixed, added when new bugs are reported. See [MAINTAINER-GUIDE.md](./MAINTAINER-GUIDE.md).

Every pain point from [PAIN-POINTS.md](./PAIN-POINTS.md) whose fix could NOT be verified in the current code. Only genuinely open issues listed here.

PAIN-POINTS.md currently records 31 fixed, 22 still open, and 3 partially-fixed incidents. This backlog also contains standalone requested items that do not yet have dedicated PAIN-POINTS.md entries.

## Priority: P0 (Blocking Production)

### #32 — Balance Not Credited After On-Ramp
- **Evidence**: "era pra ter mudado o saldo... o on ramp nao esta funcionando"
- **Suspected**: Stellar settlement timing — sandbox completion doesn't guarantee Horizon indexing
- **Suggested fix**: Add a poller that watches Horizon for the settled amount after Etherfuse callback. Only update balance when Horizon confirms the token.
- **Files**: `stellar-settlement.service.ts`, balance display in frontend

### #8 — "Rota Calculada 2/4" Per-Account Stall
- **Evidence**: Specific friend account consistently fails at pathfinding step
- **Suspected**: Missing trustline for the asset being sent
- **Suggested fix**: Add pre-flight check: before pathfinding, verify recipient account has required trustlines. Surface specific error: "Fulano não pode receber USDC — peça para ele ativar em Configurações."
- **Files**: `stellar.service.ts` (pathfinding), agent send tool

### #13 — Investments Page Unreliable
- **Evidence**: "Não foi possível atualizar a aplicação agora"
- **Suspected**: DeFindex API timeout, no retry
- **Suggested fix**: Add retry with exponential backoff (3 attempts, 1s/2s/4s). Show "Tentando novamente..." during retries. After 3 failures, show "Serviço temporariamente indisponível — tente em alguns minutos."
- **Files**: `defindex-yield.service.ts`, frontend investments page

### #39 — Payment Link Unreliable
- **Evidence**: "certifique se que o link de pagamento esta funcionando!!!!!!"
- **Suspected**: URL shortener intermittent failure
- **Suggested fix**: Generate link before the flow starts, not on-demand. Cache the generated link. Fall back to long URL if shortener fails. Add health check before link generation.
- **Files**: Payment token generation, URL shortener integration

### #30 — Quote Drift
- **Evidence**: "foi de 10 pra 10,07 durante a tela" and "tava 10,07 e quando fui confirmar o pix foi pra 10,15"
- **Suspected**: No single-shot quote lock. Frontend re-fetches on re-render.
- **Suggested fix**: Freeze quote at intent creation time. Never re-fetch during a flow. Snapshot rate + fee + amount into a quote object. Use the snapshot until expiry or user cancellation.
- **Files**: `brl-usd-quote.service.ts`, frontend quote fetching. D1 orchestrator partially addresses this for orchestrated transfers only.

### #36 — NLU Outage Loop
- **Evidence**: Repeated "I am having trouble understanding requests right now"
- **Suspected**: No circuit breaker. Same session keeps retrying.
- **Suggested fix**: Circuit breaker: after 3 consecutive NLU failures → escalate to human-readable prompt + stop retrying. Reset on successful intent.
- **Files**: Agent fallback handler

## Priority: P1 (Blocks Good UX)

### #17, #18, #20, #23 — Flow State Machine
- **Issues**: Back-navigation breaks flow (#17), auto-advance without Confirm (#18), no Nubank-style multi-step (#20), conversion screen too long (#23)
- **Suggested fix**: Implement server-authoritative flow state. Client reads state, doesn't write it. Every step requires explicit Continue. Split conversion into: (1) input assets/amount, (2) review quote + fee, (3) PIN confirmation.
- **Files**: All frontend flow components, conversion screen, PIX screen, PIN screen

### #10, #24, #41 — i18n Leakage (Partially Fixed)
- **Issues**: Some surfaces may still use sender locale (#10 — receipts/notifications fixed, audit remaining), toggle in wrong place (#24), onboarding i18n note (#41)
- **Suggested fix**: Full codebase audit of all remaining surfaces (agent WhatsApp/Telegram responses, web screens via deep-link, email confirmations). Move language toggle to header/settings only. Add language toggle mention at end of onboarding.
- **Files**: All surfaces — agent responses, notifications (partially done), web screens, receipts (done)

### #26 — Inverted Conversion Direction
- **Evidence**: "converti 10 reais pra usd mas fez o caminho contrario"
- **Suspected**: NLU swapping from/to currencies
- **Suggested fix**: Add server-side validation: if user requests "10 BRL to USD" and has BRL balance, validate that `from=BRL, to=USD`. Reject inversions and ask for clarification.
- **Files**: Agent intent extraction, conversion validation

### #19 — Wrong Asset in Progress Message
- **Evidence**: PIX on-ramp targeting USD but message said "Conversão para XLM em processamento"
- **Suspected**: Asset code field not propagated from the ramp intent to the progress notification. Hardcoded XLM fallback.
- **Suggested fix**: Every user-facing asset reference must come from the transaction data. Add `target_asset` field to all progress events.
- **Files**: Agent response templates, notification service

### #29 — Send With Funding Paths
- **Evidence**: "eh pra levar pra conversao e pra pix, nao so pra pix"
- **Suspected**: Agent only shows PIX on-ramp path when balance insufficient
- **Suggested fix**: "Insufficient balance" must offer all funding paths: (1) convert existing balance, (2) PIX on-ramp, (3) both. Cross-asset sends must transparently convert at best rate.
- **Files**: Agent send tool, funding resolution logic

### #25 — Empty-Balance Visual Feedback
- **Evidence**: "quando nao tem saldo, mostre visualmente pro usuário que nao tem saldo"
- **Suspected**: Disabled button without contextual message
- **Suggested fix**: Every disabled/inactive state must explain WHY. "Saldo insuficiente: você tem R$0.00 em USDC."
- **Files**: Frontend send/conversion screens, balance view

### #34 — Distribution Math
- **Evidence**: "a distribuição ta errada, era pra soma de tudo dar 100%"
- **Suspected**: Division-by-total error. Denominator may exclude certain assets.
- **Suggested fix**: Recompute total from live balance data. Assert sum = 100% in tests.
- **Files**: Frontend portfolio computation, `lib/asset-distribution.ts`

### #16 — Link Expiry False Positives (Partially Fixed)
- **Evidence**: Link expired because previous failed attempt consumed it (core issue may remain)
- **Suspected**: Token still consumed on first access in some paths, not only on success
- **Suggested fix**: Audit ALL token consumption points. Only mark tokens as `used` on successful completion. Allow retry with same token within TTL.
- **Files**: Payment token validation, `stellar.service.ts`

## Priority: P2 (Polish)

### #1 — PIX Confirmation Pop-Up Aesthetics (Partially Fixed)
- **Evidence**: "fazer tela de confirmação pix ser um pop-up mais bonitinho"
- **Suspected**: Popup exists but needs further aesthetic refinement
- **Suggested fix**: Further polish of `PixCompletionPopup` component
- **Files**: `pix-ramp-client.tsx`

### #21 — Stray Words
- **Evidence**: "tire esse avançado da interface"
- **Suggested fix**: Full UI text audit for "Avançado" and other non-essential labels
- **Files**: All frontend components

### #31 — PIN Screen Copy
- **Evidence**: "tire a parte de: limpar o PIN e o texto Confirmação do PIX"
- **Suggested fix**: Simplify PIN screen to: masked dots + numeric keypad + cancel button. Nothing else.
- **Files**: Frontend PIN screen component

### #27 — PIN Protection for Balance/History
- **Evidence**: Request PIN for viewing balances and history
- **Suggested fix**: Add PIN gate to balance view and transaction history pages.
- **Files**: Frontend balance/history screens, PIN component (`SecurePinGate`)

### #28 — Web Chat Dark Mode
- **Evidence**: "no chat web ta preto no modo escuro as mensagens q eu mando"
- **Suspected**: Dark mode CSS variable not applied to self-sent messages
- **Suggested fix**: Fix sent message bubble color in dark mode (light bubble for sent, dark for received)
- **Files**: Frontend web chat component, dark mode CSS variables

### #35 — Receive-Currency UX
- **Evidence**: "coloque em cima das moedas de receber: 'receber em:'"
- **Suggested fix**: Add "Receber em:" label above currency selection. Add Continue button before QR code.
- **Files**: Frontend receive/send screens

### #38 — FAQ Page
- **Evidence**: Requested, not built
- **Suggested fix**: Create FAQ page matching existing page design style.
- **Files**: New frontend page at `/faq`

### #37 — General UX Directive
- **Evidence**: "melhorar a UX o maximo possivel, faça o que precisa ser preenchido mais aparente possível"
- **Suggested fix**: Ongoing UX improvement following the principles in `product/UX-PRINCIPLES.md`
- **Files**: All frontend surfaces

## Status Notes

- **31 documented fixes confirmed** (see PAIN-POINTS.md Status Summary for full commit table)
- **3 partially fixed** (#1, #10, #16)
- **22 documented pain points still open** — predominantly UX/flow-state, conversational routing, and reliability gaps
- The backend correctness issues (quote/fee consistency, ledger/balance) are largely resolved
- The frontend UX flow issues and conversational routing improvements are the current bottleneck
