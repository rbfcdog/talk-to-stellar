# PAIN-POINTS.md — TalkToStellar Development Pains

> **Living document.** Updated every time a bug is reported or fixed. Last updated: 2026-06-22. See [MAINTAINER-GUIDE.md](./MAINTAINER-GUIDE.md) for the update workflow.

52 documented incidents from founder WhatsApp testing sessions (June 2026). Clustered into 8 themes ranked by frequency × severity.

---

## Cluster A — Quote/Fee Consistency (4 incidents, SEVERITY: HIGH)

### #30 — Quote Drift
> **Quote**: "foi de 10 pra 10,07 durante a tela... nao mude durante, so de o valor qd carregar td (cotação + taxas)" and "tava 10,07 e quando fui confirmar o pix foi pra 10,15, nao faça com q isso aconteca"
> **Gloss**: Quote changed from R$10.00 to R$10.07 during the screen, and later from R$10.07 to R$10.15 at PIX confirmation.

- **Where**: `backend/src/api/services/brl-reference-rate.service.ts:100` (quoteStrictSend), `backend/src/api/services/brl-usd-quote.service.ts:68` (createQuote). The frontend re-fetches quotes on render/re-mount, not just once.
- **Root cause**: No single-shot quote lock. The quote is computed fresh on every API call via live Stellar DEX pathfinding. Frontend re-renders trigger re-fetches. No "quote snapshot" is frozen at intent-creation time.
- **Status**: **Still open**. The orchestrator (D1) now snapshots quotes via `attachQuote()` but the frontend still live-fetches before calling it.
- **Fixing commit**: None yet for the frontend. The D1 orchestrator (`TransferOrchestrator.ts:attachQuote()`) partially addresses this for orchestrated transfers only.
- **Lesson**: **Freeze quotes at intent creation**. Never re-fetch a quote mid-flow. Snapshot once, use the snapshot until expiry.

### #15 — Off-Ramp Fee Not Instant
> **Quote**: "fee not being calculated for some reason, it should be calculated like it is for on ramp, off ramp should be calculated instantly also"
> **Gloss**: Off-ramp fee calculation was asynchronous/delayed, unlike on-ramp which showed it immediately.

- **Where**: `backend/src/api/services/anchor.service.ts` (off-ramp methods around line 5000+). On-ramp fee is computed pre-confirmation; off-ramp fee is computed post-submission.
- **Root cause**: Asymmetric fee timing — on-ramp pre-computes during quote, off-ramp computes during execution. Inconsistent architecture across the two ramp directions.
- **Status**: **Fixed** by `1b34edc` (Calculate PIX off-ramp fees before destination key). The `createOffRampForSession` method in `anchor.service.ts:5577` now computes `brlExactFeeBridge` before persisting the ramp operation.
- **Lesson**: **Fee calculation must be symmetric and instant for all flows**. Pre-compute during quote stage for both on-ramp and off-ramp.

### #30b — Estimate Updating During Screen
> Implicit in #30: the estimate updates while the screen is open instead of loading once complete.
- **Where**: Frontend conversion screen — `frontend/` (React component re-fetches quote on state change).
- **Root cause**: React re-render triggers API re-fetch. No "once loaded, freeze" pattern in the component lifecycle.
- **Status**: **Still open**. Related to #30 above — same root cause (no snapshot).
- **Lesson**: **UI must show a loading state → show final value → freeze**. Never stream-update a financial amount.

---

## Cluster B — Ledger & Balance Correctness (5 incidents, SEVERITY: HIGH)

### #32 — Balance Not Credited
> **Quote**: "era pra ter mudado o saldo, teste o on ramp e o off ramp, nao esta alterando o saldo nesse caso. o on ramp nao esta funcionando... teste extensivamente se funciona"
> **Gloss**: On-ramp completed but wallet balance showed R$0.00 before and after.

- **Where**: Balance computation depends on Stellar Horizon account query (`backend/src/api/services/stellar.service.ts` + wallet balance aggregation). The on-ramp Etherfuse flow may complete without the Stellar settlement actually landing (sandbox timing).
- **Root cause**: The "PIX received" status and "balance updated" are decoupled events. Etherfuse sandbox simulates fiat receipt but the actual Tesouro token minting on Stellar may lag or fail silently. Frontend reads stale balance.
- **Status**: **Still open** — sandbox timing issue, needs polling after settlement.
- **Lesson**: **Balance display must be a reactive derivative of confirmed on-chain state**, not optimistic. Poll Horizon until the token appears, then update UI.

### #34 — Distribution Math
> **Quote**: "a distribuição ta errada, era pra soma de tudo dar 100%, mas o usd ta 100% como assim"
> **Gloss**: Portfolio distribution showed USD at 100% even with other assets present.

- **Where**: Frontend portfolio computation. Asset distribution is computed client-side from balance data.
- **Root cause**: Division-by-total error. Likely the denominator excludes certain asset types or uses a stale total.
- **Status**: **Still open**.
- **Lesson**: **Portfolio percentages must sum to 100.0%**. Assert this in tests. Never compute percentages from partial data.

### #11 — Investment Performance Counts Deposits
> **Quote**: "faça as porcentagens nao considerarem as inclusões de saldo da pessoa, so o que de fato foi proveniente das vaults"
> **Gloss**: Investment performance % included deposits/withdrawals, not just vault yield.

- **Where**: `backend/src/api/services/defindex-yield.service.ts` — yield computation. The percentage change likely uses `(currentBalance - initialBalance) / initialBalance` which conflates deposits with yield.
- **Root cause**: No separation between "principal change" (deposits/withdrawals) and "yield change" (vault earnings). Time-weighted return not implemented.
- **Status**: **Fixed** by `dcec791` (Exclude cashflows from return analysis). The `cashflowDelta` function in `frontend/lib/portfolio-period-analysis.ts:53-64` identifies deposit/withdraw actions. `analyzePortfolioPeriod` at line 101 subtracts `cashflowChange` from raw change: `rawChange - cashflowChange`. The UI in `rendimentos-client.tsx:1043-1047` displays "Fluxo ignorado" / "Cash flow ignored" when cashflow is detected.
- **Lesson**: **Use time-weighted return (TWR) for investment performance**, not simple balance delta. Exclude cash flows from return calculation.

### #33 — Duplicate Receipts
> **Quote**: "quando fiz on ramp deu 2 comprovantes, sendo q era pra dar 1"
> **Gloss**: One on-ramp generated two receipts.

- **Where**: `backend/src/api/services/receipt-image.service.ts` + `backend/src/api/services/payment-receipt.service.ts`. Receipt generation is triggered per-event, not per-operation.
- **Root cause**: Two events fire for one on-ramp completion (e.g., "PIX received" + "Settlement confirmed"). Both trigger receipt generation. No deduplication by operation ID.
- **Status**: **Fixed** by `0da597da` (Deduplicate Pix auto-pay receipts). The receipt system now has two-layer deduplication: (1) DB-level `dedupe_key` unique constraint in `agent_messages` table (`payment-receipt.service.ts:329-337`), (2) in-memory `Set<string>` for external delivery dedupe (`payment-receipt.service.ts:346-356`). The dedupe key is threaded from the PIX auto-pay flow through `anchor.service.ts:8713-8738`.
- **Lesson**: **Receipt generation must be idempotent per operation ID**. Deduplicate by `operation_id` or `pix_payment_id`.

### #49 — Conversion Insufficient Balance Shown as Temporary Error
> **Quote**: "7 (93,3%)\n\nConversion not completed\n\nI could not finish that right now. Try again in a few seconds.\n\nError ID: TTS-20260615164337-6RF248\nPIN\n\nConversion progress\n\nThe conversion stopped before completion. Check the highlighted error above before trying again."
> **Gloss**: A conversion with insufficient TESOURO balance reached the confirmation screen but showed a generic temporary error instead of saying the balance was insufficient.

- **Where**: `backend/src/utils/public-error.ts`, `frontend/lib/public-errors.ts`, `backend/src/api/controllers/external-finalize.controller.ts`, `frontend/app/confirm-conversion/confirm-conversion-client.tsx`.
- **Root cause**: The exact backend error was `Saldo de TESOURO insuficiente para a conversão. Necessário: 123, disponível: 89.6400000.` The public error mappers only recognized contiguous `saldo insuficiente`, so `Saldo de <ASSET> insuficiente` fell through to `temporary_unavailable`.
- **Status**: **Fixed** by `227832a` (Fix conversion insufficient balance error copy). `publicErrorCode()` in `backend/src/utils/public-error.ts` and `mapPublicError()` in `frontend/lib/public-errors.ts` now classify asset-specific insufficient balance messages as `insufficient_balance`; regression tests cover the exact TESOURO conversion error shape.
- **Lesson**: **Balance errors must stay actionable through every layer**. Asset-specific messages such as `Saldo de TESOURO insuficiente` must map to insufficient-balance copy, not a generic retry.

---

## Cluster C — Screen/Flow State Machine (8 incidents, SEVERITY: HIGH)

### #4 — Window Not Closing After Conversion
> **Quote**: "after conversion done from the conversion normal screen, the screen didn't close, it was supposed to close"
> **Gloss**: Conversion completed but the conversion window stayed open.

- **Where**: Frontend conversion flow — the modal/page doesn't auto-close on success.
- **Root cause**: No "on complete → close" hook in the conversion component. The success callback updates state but doesn't trigger window dismissal.
- **Status**: **Fixed** by `6569ae0` (Auto close completed conversion screen). The `PixCompletionPopup` component in `pix-ramp-client.tsx:3799` now accepts `autoClose` prop and conditionally renders an intermediate-page close message.
- **Lesson**: **Every completion state must auto-dismiss its surface**. Post-condition of any transaction: close the initiating window.

### #16 — Link Expiry False Positives
> **Quote**: "mesmo que eu nao tenha usado ta dando muito rapido isso de expirar, talvez seja pq eu tenha tentado converter e deu errado"
> **Gloss**: Payment link expired immediately, likely because a previous failed conversion consumed the token.

- **Where**: `backend/src/api/services/stellar.service.ts` — payment token generation and validation. Tokens are marked "used" on ANY attempt, including failed ones.
- **Root cause**: Single-use tokens are consumed on first access, not on successful completion. Failed attempt → token burned → retry shows "expired."
- **Status**: **Partially fixed** by `5a55e6c` (Fix completed short-link state) and `92cc83d` (Increase short-link expiry windows & suppress trivial fee lines). Link expiry windows extended. Core issue (token consumed on failure) may still remain for some paths.
- **Lesson**: **Idempotency tokens must only be consumed on success**, or use multi-attempt tokens with a short TTL.

### #17 — Back-Navigation Breaks Flow
> **Quote**: "quando volto a tela pra details, da esse erro mesmo que eu nao tenha mandado nada, faça com que o envio seja independente das mudanças de tela e so avance da chave pro pin quando o usuario apertar em confirmar"
> **Gloss**: Back-navigation triggers error; send should be independent of screen changes, only advance on explicit Confirm.

- **Where**: Frontend navigation state + PIN screen component. The flow state is tied to browser navigation, not a standalone state machine.
- **Root cause**: Browser back button resets component state, but the backend session state already advanced (e.g., PIX key registered). Mismatch causes "already used" error.
- **Status**: **Still open**.
- **Lesson**: **Flow state must be server-authoritative**. Client navigation should read state, not write it. Back button should return to the last valid state, not reset it.

### #18 — Flow Completion & Window Close
> **Quote**: "make so person needs to press continue to go to pin screen and after it ends, make sure to close the window also, even if the pix screen was after the conversion"
> **Gloss**: Add explicit Continue before PIN. Close window on completion, even for chained flows.

- **Where**: All frontend flow screens. The PIN screen appears automatically without explicit user confirmation.
- **Root cause**: Flow auto-advances from detail → PIN without user action. User needs an explicit "Continue" button to confirm they've reviewed the details.
- **Status**: **Still open**.
- **Lesson**: **Every flow step requires explicit user confirmation before advancing**. Never auto-advance past a detail/review screen.

### #14 — Mobile PIN Cut Off
> **Quote**: "on Phone screen, the pin part is not appearing because its too low and cant scroll, make sure everything fits"
> **Gloss**: PIN input section was below the fold on mobile, not scrollable.

- **Where**: Frontend PIN screen CSS/layout. The PIN keypad is fixed at the bottom of a non-scrollable container.
- **Root cause**: `overflow: hidden` or `height: 100vh` on the PIN container without scroll. Mobile viewport variations (keyboard, safe areas) push content out.
- **Status**: **Fixed** by `c9227c6` (Fix mobile PIX withdrawal PIN layout). The `MobilePixStepper` component in `pix-ramp-client.tsx:3958` now uses `sticky top-2` positioning with mobile-first layout, 3-stage grid flow, responsive grid, and `md:hidden` visibility.
- **Lesson**: **Every mobile screen must be scrollable**. Test with iPhone SE and Galaxy Fold viewports. Never assume `100vh` fits without scroll.

### #20 — Nubank-Style Multi-Step Navigation
> **Quote**: "coloque menos scroll e coloque tipo a nubank que vai avançando as páginas e confirmando as operações"
> **Gloss**: Use Nubank-style multi-step pages with explicit Continue, not long scrolling.

- **Where**: All frontend operation screens (conversion is the worst offender — see #23).
- **Root cause**: Single long-scroll screens designed for desktop, not mobile. No step-by-step progression pattern.
- **Status**: **Still open**.
- **Lesson**: **Mobile flows must be multi-step with explicit Continue**. Max 3-4 visible elements per step. See `product/UX-PRINCIPLES.md`.

### #23 — Conversion Screen Too Long
> **Quote**: "esta muito longa pra celular, faça multi etapas igual pix... corte o maximo de coisa possível"
> **Gloss**: Conversion screen is too long for mobile. Make it multi-step like PIX flow.

- **Where**: Frontend conversion screen — single page with all details (source, destination, rate, fee, quote, pin).
- **Root cause**: Monolithic conversion page combines input + quote + confirmation + PIN into one scroll.
- **Status**: **Still open**.
- **Lesson**: **Split conversion into: (1) input assets/amount, (2) review quote + fee, (3) PIN confirmation**. See #20.

### #25 — Empty-Balance Visual Feedback
> **Quote**: "quando nao tem saldo nessa tela, mostre visualmente pro usuário que nao tem saldo, nao deixe so travado"
> **Gloss**: When balance is zero, show visual feedback instead of a frozen/locked screen.

- **Where**: Frontend send/conversion screens — when balance is 0, the Continue button is disabled but there's no explanation.
- **Root cause**: Disabled button without contextual message. User doesn't know WHY they can't proceed.
- **Status**: **Still open**.
- **Lesson**: **Every disabled state must explain WHY**. "Saldo insuficiente: você tem R$0.00 em USDC" is better than a grayed-out button.

---

## Cluster D — i18n Leakage (3 incidents, SEVERITY: MEDIUM)

### #10 — Recipient Sees Wrong Language
> **Quote**: "se a minha config ta em inglês, faça TUDO meu ser em inglês, analise TODA a codebase e garanta que tudo venha em ingles caso esteja em ingles"
> **Gloss**: User with EN config received PT messages because the sender's locale leaked through.

- **Where**: i18n resolution across all surfaces. The locale is likely resolved from the sender/session context, not the recipient's profile. Agent messages (WhatsApp/Telegram) and system notifications both affected.
- **Root cause**: **Sender's locale is used for recipient-facing messages**. The i18n resolution chain doesn't check the recipient's language preference.
- **Status**: **Partially fixed** by `916fcb6` (Respect recipient language for receipts). Language is now resolved from session data via `resolveSessionLanguage()` in `transfer-notification.service.ts:275` and persisted across multiple storage layers (`updateSessionLanguagePreference`, `updateAgentStateLanguagePreference`, `updateExternalLanguagePreference` in `routes.ts:750-776`). Receipt service also calls `resolveReceiptLanguage` per-recipient. **Full codebase audit still needed** — some surfaces may still use sender locale.
- **Lesson**: **Recipient's language config is the ONLY source of truth for recipient-facing text**. The sender's locale must never leak. Rule: `resolveLocale(recipientId)`, never `resolveLocale(sessionId)` for recipient messages.

### #24 — Language Toggle Placement
> **Quote**: "nao eh pra ter o botão de ingles no meio dessa tela de conversão, so no coisinho do canto direito superior"
> **Gloss**: Language toggle appeared mid-screen in the conversion flow. Should only be in the top-right corner.

- **Where**: Frontend conversion screen — language toggle component rendered inside the flow.
- **Root cause**: The language toggle is included in the shared layout component, which appears everywhere including mid-flow screens. Should be restricted to the shell/header only.
- **Status**: **Still open**.
- **Lesson**: **Language toggle belongs in the app chrome (header/profile), never inside a transactional flow**. Flow screens should be locale-consistent from start to finish.

### #41 — Onboarding i18n Note
> **Quote**: Closing message should mention the product can be toggled to English (and vice-versa in the PT version).
- **Where**: Onboarding completion message — `backend/src/api/services/` (onboarding flow).
- **Root cause**: Missing post-onboarding message about language toggle availability.
- **Status**: **Still open**.
- **Lesson**: **Every onboarding flow must end with "You can change the language in settings"** in both supported locales.

---

## Cluster E — Conversational Routing & Intent (6 incidents, SEVERITY: HIGH)

### #6 — Send Blocked by Contact DB
> **Quote**: bot replied 'I could not find "r238257@dac.unicamp.br" in your saved contacts' → "eh pra mandar automaticamente mesmo que nao esteja nos contatos, so tem q checar se a pessoa existe no banco de dados"
> **Gloss**: Send shouldn't require saved contacts — should check the user database directly.

- **Where**: `backend/src/api/agent/` — the agent's send tool checks contacts, not users. The `ContactRepository` is queried before the `UserRepository`.
- **Root cause**: Agent tool implementation uses "Look up contact first" logic. Should: look up user by identifier (email/phone) → if exists, allow send → if not, prompt to invite.
- **Status**: **Fixed** by `9106c6a` (Resolve PIX recipients outside saved contacts). `tools.ts:6828-6833` now queries `wallets` table by `pix_key` BEFORE falling back to contacts. The `resolveTransferRecipientReference` in `anchor.service.ts:8170-8214` additionally queries `agent_sessions` by email/phone for active user sessions.
- **Lesson**: **"Send to" resolution order: User DB → Contacts → Invite prompt**. Never block on "not in contacts."

### #26 — Inverted Conversion Direction
> **Quote**: "converti 10 reais pra usd mas fez o caminho contrario??"
> **Gloss**: User asked to convert 10 BRL to USD but the conversion executed USD to BRL.

- **Where**: `backend/src/api/agent/` — intent extraction from NLU. The agent interpreted "10 reais para dólar" incorrectly, swapping source and destination.
- **Root cause**: NLU hallucination of asset direction. The prompt/structured tool doesn't enforce a strict "source → destination" order. `from_currency` and `to_currency` can be swapped by the LLM.
- **Status**: **Still open**.
- **Lesson**: **Validate asset direction server-side before execution**. If user has BRL balance and wants USD, `from=BRL, to=USD` is the only valid direction. Reject inverted intents and ask for clarification.

### #19 — Wrong Asset in Progress Message
> **Quote**: PIX on-ramp targeting USD but message said "Conversão para XLM em processamento" → "eh pra conversao pra USD em andamento, nao XLM!!!! tem q otimizar isso e ja fazer tudo de uma vez"
> **Gloss**: "Converting to XLM" shown when target was USD.

- **Where**: Agent response template or notification service — the progress message uses a hardcoded or incorrectly resolved asset code.
- **Root cause**: Asset code field not propagated from the ramp intent to the progress notification. Default/hardcoded XLM fallback used.
- **Status**: **Still open**.
- **Lesson**: **Every user-facing asset reference must come from the transaction data**, never a default. Add a `target_asset` field to all progress events.

### #7 — Missing PIX Origin in Notification
> **Quote**: "should have said the origin of the pix... should have said who sent the pix to me, it was another key"
> **Gloss**: Received-PIX notification didn't show who sent it.

- **Where**: `backend/src/api/services/notifications/evolution.service.ts` + notification templates. The PIX received event doesn't include payer identity in the message.
- **Root cause**: Etherfuse PIX webhook may not include payer name in sandbox mode. The notification template doesn't have a `payer_name` field.
- **Status**: **Fixed** by `749d906` (Show real sender on PIX-funded receipts). The `pixFundedTransferSenderLabel` in `anchor.service.ts:8563-8579` resolves sender from email → providerUserId → userId → publicKey. Incoming transfer notifications now include sender identity via `resolveHumanLabel()` in `transfer-notification.service.ts:398-473` which searches `agent_sessions`, `wallets`, and `contacts`. Receipt images now include "De <sender>" text (`receipt-image.service.ts:239`).
- **Lesson**: **"Received money" notifications must include: amount, currency, sender identity**. If sender identity is unavailable from the provider, show "Recebido via PIX" with the masked PIX key.

### #36 — NLU Outage Loop
> **Quote**: repeated "I am having trouble understanding requests right now. Try again in a few seconds."
> **Gloss**: Agent got stuck in an error loop, repeating the same fallback message.

- **Where**: `backend/src/api/agent/` — the agent's fallback/error handler. When NLU fails, it returns a generic retry message. If the retry also fails, the same message repeats.
- **Root cause**: No circuit breaker or escalation after N consecutive NLU failures. No backoff. Same session keeps hitting the same error.
- **Status**: **Still open**.
- **Lesson**: **Implement a circuit breaker**: after 3 consecutive NLU failures → escalate to a human-readable prompt ("Parece que estou com dificuldades. Tente novamente mais tarde ou acesse talktostellar.com"). Reset on successful intent.

### #8 — "Rota Calculada 2/4" Stall
> **Quote**: "em apenas uma conta específica do meu amigo, quando ele faz uma transferência pix pra outra pessoa, da erro 'a operação parou antes de concluir' na parte da transação e rota calculada 2/4, itere por esse erro"
> **Gloss**: One specific account consistently fails at step 2/4 "rota calculada" during PIX transfer.

- **Where**: `backend/src/api/services/stellar.service.ts:884-961` (pathfinding). The `quoteStrictSendConversion` or `quotePathPayment` call fails for this specific account. Possibly a trustline issue, asset issuer mismatch, or liquidity problem in the Stellar DEX for that account's asset pairs.
- **Root cause**: Missing trustline for the specific asset on that account. The Stellar pathfinding returns empty paths when the destination account can't receive the asset. No helpful error propagated to the user.
- **Status**: **Still open** — needs per-account diagnosis via trustline pre-flight check. The pathfinding (`stellar.service.ts:884-961`) still shows generic errors. See `operations/incidents/rota-2-4-stall.md`.
- **Lesson**: **Pathfinding failures must surface the root cause**: "Sua conta não possui a trustline para USDC. Configure em Configurações > Carteira." Never show a generic "operation stopped" error.

### #29 — Send With Funding Paths
> **Quote**: "nesse caso eh pra levar pra conversao e pra pix, nao so pra pix, eh pra incentivar os 2 caminhos" + "tem q fazer a conversão pra chegar como dolar na Marina Costa"
> **Gloss**: When sending, show both funding paths (PIX on-ramp + conversion). Cross-asset delivery must convert to the recipient's preferred currency.

- **Where**: Agent flow for "send to contact" when sender has insufficient balance. Currently only offers PIX on-ramp path.
- **Root cause**: The agent's funding resolution only shows the PIX on-ramp path. Should also offer conversion from existing balance + partial on-ramp. Cross-asset delivery (BRL→USD) requires an explicit conversion step.
- **Status**: **Still open**.
- **Lesson**: **"Insufficient balance" must offer all funding paths: (1) convert existing balance, (2) PIX on-ramp, (3) both**. Cross-asset sends must transparently convert at the best available rate.

---

## Cluster F — Copy & Verbosity (5 incidents, SEVERITY: MEDIUM)

### #2 — "Summary" Banned
> **Quote**: "nao precisa falar summary, so precisa falar, escolhemos a melhor rota, faça o mais simples pro usuario" and stronger: "nao coloque em nenhum caso summary, eh so pra falar q escolheu a melhor rota!!"
> **Gloss**: Never use the word "Summary" in any message. Just say "we chose the best route."

- **Where**: Agent response templates across all conversation flows. Search for `"Summary:"` or `"Resumo:"` in agent prompts and notification templates.
- **Root cause**: Verbose AI-generated templates include section headers like "Summary" that the founder explicitly banned.
- **Status**: **Fixed** by `f24d6f1` (Strip summary labels from user messages). The `stripUserFacingSummaryLabels()` function in `backend/src/utils/user-facing-text.ts:6` strips both `Summary:` and `Resumo:` labels with various separators. Additionally `ec286d3` (Simplify receipt route summaries) further simplified receipt text.
- **Lesson**: **"Summary:" is on the banned words list**. Replace with "Escolhemos a melhor rota:" or nothing.

### #21 — Stray Words
> **Quote**: "tire esse avançado da interface, tire essas palavras aleatorias espalhadas, deixe so o essencial"
> **Gloss**: Remove "Avançado" and other stray words from the UI.

- **Where**: Frontend UI components — "Advanced" labels, extra section headers.
- **Root cause**: Developer-added labels that don't serve the user. "Advanced options" sections that should be collapsed or removed.
- **Status**: **Still open**.
- **Lesson**: **Every word on screen must earn its place**. If it's not essential for the user to complete their task, delete it.

### #22 — Receipts at Flow End
> **Quote**: "tire o recibo do final das telas, mostre so o pagamento concluído!!!"
> **Gloss**: Don't show the receipt at the end of a flow. Just show "Pagamento concluído."

- **Where**: All frontend flow completion screens — receipt is auto-shown after completion.
- **Root cause**: Receipt generation is attached to the success callback. Founder wants a simple "Done" screen with the receipt available as a secondary action (e.g., "View receipt" link).
- **Status**: **Fixed** by `e8cf1ea` (Remove receipt link from PIX completion popup). The `PixCompletionPopup` component (`pix-ramp-client.tsx:3838-3924`) no longer renders any receipt link or receipt button — just checkmark, title, amount, metadata rows, and close/return button.
- **Lesson**: **Completion screen: show "✅ Concluído" + amount + optional "Ver comprovante"**. Never auto-display the full receipt.

### #31 — PIN Screen Copy
> **Quote**: "na parte do PIN mude a estetica tire a parte de: limpar o PIN e o texto Confirmação do PIX..."
> **Gloss**: PIN screen has too much text — remove "Clear PIN" and "PIX confirmation" labels.

- **Where**: Frontend PIN screen component.
- **Root cause**: Default PIN component includes developer-friendly labels that don't need to be shown to users.
- **Status**: **Still open**.
- **Lesson**: **PIN screen should have: (1) masked PIN dots, (2) numeric keypad, (3) cancel button**. Nothing else.

### #45 — Ops Login Copy Exposes Implementation Details
> **Quote**: "make so in this only say stuff about the trabsfers, dont maenting database, tikesns or anything, make user friendly. teel me which user and password to use"
> **Gloss**: The ops login screen should speak only about transfers, not database tables, tokens, cookies, or migration details.

- **Where**: `backend/src/api/views/ops-dashboard.view.ts`.
- **Root cause**: The secure login implementation shipped with implementation-facing explanatory copy on the visible login page.
- **Status**: **Fixed by `34ce523`**. The login page now says "Transfers console", "Operator email", "Open transfers", and a transfer-focused helper line. The route tests assert the visible screen no longer contains `ops_admin_users`.
- **Lesson**: **Operator-facing screens should describe the job, not the plumbing**. Security details belong in docs and runbooks, not visible product copy.

---

## Cluster G — Visual Polish (7 incidents, SEVERITY: MEDIUM)

### #1 — PIX Confirmation Pop-Up Aesthetics
> **Quote**: "fazer tela de confirmação pix ser um pop-up mais bonitinho, melhorar a estetica final"
> **Gloss**: PIX confirmation screen should be a polished pop-up, not a plain page.

- **Where**: Frontend PIX confirmation screen.
- **Root cause**: Generic confirmation layout, not a designed modal/pop-up experience.
- **Status**: **Partially fixed** by `75376ff` (Polish PIX completion popup) and `82ba3a4` (Polish frontend interaction system). The `PixCompletionPopup` component now exists as a designed modal with checkmark, amount, metadata, and close button. Further aesthetic polishing (the "mais bonitinho" directive) remains open.
- **Lesson**: **Confirmation must be a designed modal with: icon, amount, recipient, and a single action button**.

### #5 — Visual Consistency (Shadows)
> **Quote**: "deixar mesmo sombreado e estetica em conversao e pix, normalizar a UI, colocar mais interativo as operações, tipo nubank"
> **Gloss**: Shadows and aesthetics should be consistent between conversion and PIX screens.

- **Where**: Frontend CSS across conversion and PIX screens. Shadow values, border-radius, spacing differ.
- **Root cause**: CSS defined per-component, no shared design token system.
- **Status**: **Fixed** by `1c5550c` (Normalize PIX and conversion operation UI) and `82ba3a4` (Polish frontend interaction system). Shadows, aesthetics, and interaction patterns were normalized across PIX and conversion surfaces.
- **Lesson**: **Every visual attribute must come from a design token system**. Shadows: `shadow-sm`, `shadow-md`, `shadow-lg`. No inline box-shadow values.

### #9 — SVG Letter Spacing
> **Quote**: "nos svgs, as letras nao tao igualmente espaçadas... faça todos os espaços serem uniformes, production grade"
> **Gloss**: SVG-rendered text has uneven letter spacing. Must be production-grade uniform.

- **Where**: `backend/src/api/services/receipt-image.service.ts` — uses Resvg for SVG rendering. Font kerning/letter-spacing issues in the SVG template.
- **Root cause**: Resvg rendering of system fonts may not respect `letter-spacing` CSS. Font metrics differ between the browser preview and the renderer.
- **Status**: **Fixed** by `bd6b73d` (Normalize receipt SVG typography). The `textAttrs` function in `receipt-image.service.ts:86-88` now explicitly sets `letter-spacing="0"`, `font-kerning="normal"`, and `text-rendering="geometricPrecision"` on every SVG text element.
- **Lesson**: **SVG rendering must be pixel-verified**. Use monospace fonts or explicitly set `letter-spacing` and verify output with the actual renderer.

### #12 — Charts
> **Quote**: "faça os gráficos terem a opção semanal e mensal... ser menos smooth, e ser mais discreto... na pagina de investimentos"
> **Gloss**: Charts need weekly/monthly toggles, less smooth curves, more discrete.

- **Where**: Frontend investments page — chart library (likely Recharts or Chart.js).
- **Root cause**: Default smooth curve interpolation (monotone/catmull-rom). No time-range toggle.
- **Status**: **Fixed** by `d4b1d98` (Add investment chart time windows). `ChartWindow` type (`rendimentos-client.tsx:78`) now supports "weekly" and "monthly" options with toggle buttons (lines 318-339). Chart data recomputes when the window changes.
- **Lesson**: **Investment charts: step interpolation (not smooth), weekly/monthly toggle, muted colors**. See Nubank's investment charts for reference.

### #28 — Web Chat Dark Mode
> **Quote**: "no chat web ta preto no modo escuro as mensagens q eu mando, era pra estar branco"
> **Gloss**: Web chat in dark mode shows sent messages as black instead of white.

- **Where**: Frontend web chat component — `backendMessageStyle` or message bubble CSS.
- **Root cause**: Dark mode CSS variable not applied to self-sent messages. Sent messages inherit the background color instead of using a distinct sent-message color.
- **Status**: **Still open**.
- **Lesson**: **Dark mode sent messages = light bubble (e.g., #2563eb or WhatsApp green)**. Received messages = dark bubble. Test both modes on every component.

### #48 — Ops Dashboard Visual Pollution and Forensics Entry
> **Quote**: "the foresincs ain working and make the UI more clean on dashboard, make so its very printable"
> **Gloss**: The ops dashboard needed a cleaner, less visually noisy ledger layout, a working Forensics entry point, and a print-friendly view.

- **Where**: `backend/src/api/views/ops-dashboard.view.ts`.
- **Root cause**: The server-rendered dashboard had drifted between markup and CSS: metrics were emitted as `metric-bar` while older CSS targeted `metric-grid`, the filter area lost key structure, the top bar no longer exposed quiet session/print actions, and the Forensics nav only had a useful anchor on detail pages.
- **Status**: **Fixed by `6555da6`**. `renderPageShell()` now always exposes a Forensics link (`/ops?source=transfers` on the ledger, `#transfer-detail` on detail); `renderMetricCards()` renders compact styled metric cards; `renderControls()` renders a single clean filter strip with source, group, search, dates, rows, and needs-attention; the top bar has quiet refresh/print/session controls; the print button calls `window.print()` and print CSS targets the new metric classes.
- **Lesson**: **Operations dashboards need stable information hierarchy**. Metrics, filters, table, and forensic navigation must be visually distinct, printable, and backed by the same CSS classes the renderer actually emits.

### #50 — Ops Dashboard Metric Says Today Instead of All Transfers
> **Quote**: "make so is ALL tarsnfers, not today"
> **Gloss**: The ops dashboard hero metric should show all loaded ledger transfers, not only records created today.

- **Where**: `backend/src/api/controllers/ops.controller.ts`, `backend/tests/ops.routes.test.ts`, `docs/project-brain/product/surfaces/ops-dashboard.md`.
- **Root cause**: `dashboardMetrics()` filtered records through `isSameLocalDate()` before rendering the first card and BRL-to-USDC volume card, so the dashboard reported "Transfers today" and "BRL to USDC today" even though the operator wanted the full ledger.
- **Status**: **Fixed by `fe90af9`**. `dashboardMetrics()` now uses all loaded ledger records, labels the first card "All transfers", labels the volume card "BRL to USDC total", and the route test asserts the old "today" copy is absent.
- **Lesson**: **Ops hero metrics must match the ledger scope shown on screen**. If the table is a full-ledger console, the summary cards should not silently narrow to a daily slice.

---

## Cluster H — Reliability (14 incidents, SEVERITY: HIGH)

### #42 — Ops Dashboard Omits Historical Transactions
> **Quote**: "in hs sccreen, should appear all tranactions done trhought the whole database history!!!!!!"
> **Gloss**: The operations dashboard must show the complete persisted transaction history, not only normalized D1 lifecycle transfers.

- **Where**: `backend/src/api/controllers/ops.controller.ts`, `backend/src/api/repository/transfer.repository.ts`, `/ops`.
- **Root cause**: `/ops` reads only the new `transfers` and `transfer_events` tables. Historical and non-D1 transactions are persisted in `operations`, `payment_logs`, and `international_transfers`, so the dashboard can show zero while transaction history exists elsewhere in the database.
- **Status**: **Fixed in current working tree; commit pending**. `ops-history.repository.ts` aggregates every row from `transfers`, `international_transfers`, `operations`, and `payment_logs`; `/ops` now renders the unified history. Verified against configured Supabase on 2026-06-13: 1,540 records loaded (1,482 operations, 56 payment logs, 2 international transfers, 0 normalized transfers).
- **Lesson**: **Operations history screens must aggregate every authoritative transaction table**. A lifecycle-specific table cannot be presented as the complete database ledger.

### #43 — Supabase SQL Editor Rejects Ops Admin Migration
> **Quote**: "Failed to run sql query: ERROR:  42601: syntax error at or near \"\\\" LINE 160: \\if :{?ops_admin_login}" and "gaver this when running migration"
> **Gloss**: Applying the ops admin auth migration in Supabase SQL Editor failed because the migration contained `psql` backslash meta-commands.

- **Where**: `backend/migrations/20260614_00_ops_admin_auth.sql:160`, `backend/scripts/run-required-migrations.ts`.
- **Root cause**: The migration mixed plain PostgreSQL with `psql` client directives (`\if`, `\echo`, variable interpolation). Those commands work only inside the `psql` CLI and are rejected by Supabase SQL Editor.
- **Status**: **Fixed by `949db79`**. `backend/migrations/20260614_00_ops_admin_auth.sql` is now plain SQL only. `backend/scripts/run-required-migrations.ts` performs optional admin bootstrap as a separate `select public.upsert_ops_admin_user(...)` step after migrations.
- **Lesson**: **Migrations must be plain SQL unless clearly marked runner-only**. Supabase SQL Editor compatibility is required for founder/reviewer setup.

### #44 — Frontend `/ops/login` Returns 404
> **Quote**: "This page could not be found. when ops/login"
> **Gloss**: Opening `/ops/login` on the frontend host returned the Next.js 404 page even though the backend dashboard route existed.

- **Where**: `frontend/next.config.mjs`, `backend/src/api/routes/ops.router.ts`.
- **Root cause**: `/ops/login` was implemented only in the backend Express app. The Next.js frontend had API proxies but no `/ops` rewrite, so `frontend-domain/ops/login` never reached the backend dashboard.
- **Status**: **Fixed by `f321a52`**. `frontend/next.config.mjs` now rewrites `/ops` and `/ops/:path*` to the configured backend URL, preserving the backend-rendered dashboard and HTTP-only ops cookies on the frontend host.
- **Lesson**: **Operator browser routes must be reachable from the deployed frontend domain**. When a route is backend-rendered, the frontend must either own an equivalent page or explicitly proxy the path.

### #46 — Ops Login Returns Generic JSON Error Instead of Screen
> **Quote**: "success false message \"Não consegui concluir agora. Tente novamente em alguns segundos.\" code \"temporary_unavailable\" support_code \"TTS-20260614192005-WTC3UF\" error \"Não consegui concluir agora. Tente novamente em alguns segundos.\" status 500 gave this pn login!!!!!, why dindt show teh screen??"
> **Gloss**: `/ops/login` returned a generic JSON 500 response instead of rendering the transfer operator login screen.

- **Where**: `backend/src/api/controllers/ops.controller.ts`, `backend/src/api/services/ops-admin-auth.service.ts`, `backend/src/api/routes/ops.router.ts`, `backend/src/api/views/ops-dashboard.view.ts`, `backend/src/app.ts`, `backend/tests/ops.routes.test.ts`.
- **Root cause**: The ops controller, ops admin auth service, and ops dashboard view imported Supabase-backed dashboard modules at module load. If backend admin DB configuration failed during route initialization, the global JSON error handler could answer before the login page rendered. Async ops routes also lacked a shared wrapper for forwarding unexpected failures consistently.
- **Status**: **Fixed by `4b10d31`, `c4d38bd`, and `6529ec7`**. Supabase and dashboard data modules are lazy-loaded only when credential verification or an authenticated dashboard request needs them; `/ops/login` renders before database credentials are required. Ops routes now use a shared async wrapper, idempotency storage bypasses `/ops`, and the global error handler renders the transfer login HTML for `/ops/login` instead of JSON. A regression test confirms `/ops/login` returns HTML even when `JWT_SECRET` and Supabase env vars are absent, and a direct module-load check confirms `ops.router` loads with Supabase env removed.
- **Lesson**: **Login pages must render before protected dependencies are needed**. Do dependency checks on submit, not while preparing the public form.

### #47 — Ops Login Form Submit Shows HTML Error
> **Quote**: "TESTNET Transfers console Sign in to review transfer status, payout progress, and reconciliation evidence. Could not open the transfers console. Try again in a few seconds. Operator email Password gave this still"
> **Gloss**: `/ops/login` rendered the operator login screen, but submitting the form returned the same screen with a generic "Could not open the transfers console" error.

- **Where**: `backend/src/app.ts`, `backend/src/api/middlewares/security.middleware.ts`, `backend/tests/security.middleware.test.ts`.
- **Root cause**: The backend global CORS middleware could reject the frontend-hosted `/ops/login` form POST before the ops controller ran. The GET navigation rendered because it did not need CORS, but the POST carried an `Origin` header from the frontend rewrite host. When that origin was not configured in backend CORS env, the global error handler rendered the fallback login page error.
- **Status**: **Fixed by `002ccd9`**. Server-rendered `/ops` browser routes now bypass CORS middleware while JSON APIs keep strict CORS behavior. `/ops` remains protected by CSRF, DB-backed admin credentials, and HTTP-only session cookies. A regression test verifies only `/ops` browser paths are marked for the bypass and `/api/ops/*` remains outside it.
- **Lesson**: **Do not put CORS in front of same-site server-rendered form posts**. CORS is for browser API access; `/ops` HTML uses CSRF and cookie auth.

### #51 — Wire Test Screen Returned 404 Until Servers Were Rebuilt
> **Quote**: "iterate rn, it doesnt work, make until wire works on circle"
> **Gloss**: The `/wire-test` page loaded, but the new Circle wire-send API path was not available from the running frontend/backend processes, so the screen could not send a Circle wire payout.

- **Where**: `frontend/app/wire-test/wire-test-client.tsx`, `frontend/app/api/wire-test/send/route.ts`, `backend/src/api/routes/international-transfers.router.ts`, `backend/src/api/controllers/international-transfers.controller.ts`.
- **Root cause**: The current source contained `POST /api/wire-test/send` and backend `POST /api/transfers/wire-test/send`, but the running frontend/backend processes were started before those routes were loaded. The running servers returned 404 until rebuilt/restarted from current source.
- **Status**: **Fixed by current code and verified deployment restart**. `frontend/app/api/wire-test/send/route.ts` proxies to `backend/src/api/controllers/international-transfers.controller.ts:399`, and a clean `npm --prefix frontend run build` lists `/api/wire-test/send`. Verified on 2026-06-16: direct backend send returned Circle HTTP 201 with payout ID present; frontend proxy returned HTTP 200 with Circle HTTP 201; Playwright drove `/wire-test`, clicked `Send`, and the UI showed "Wire sent".
- **Lesson**: **After adding server/API routes, rebuild and restart every process before testing the browser surface**. A page can render while its newly added route is missing from the running server.

### #52 — Wire Test Send Collapsed Upstream Failure Into HTTP 500
> **Quote**: "HTTP 500 2026-06-16 19:14:52Z Status Failed Send wire $10 failed with HTTP 500 ... still given 500 when trying to use. when you tested it work"
> **Gloss**: The deployed `/wire-test` screen showed a generic HTTP 500 even though the Circle/backend result needed to be visible to the operator.

- **Where**: `frontend/app/api/wire-test/send/route.ts`, `frontend/app/wire-test/wire-test-client.tsx`, `docs/project-brain/product/surfaces/wire-payout-test.md`.
- **Root cause**: The Next.js route handler assumed a single configured backend URL and assumed the upstream response was JSON. If the frontend deployment had a missing/stale backend URL, network failure, or non-JSON upstream response, the browser-facing route returned `Failed to proxy request to backend` with HTTP 500 instead of preserving the backend/Circle status. The production backend route itself was mounted: Railway `/health` returned 200 and unauthenticated `POST /api/transfers/wire-test/send` returned 403.
- **Status**: **Fixed by `1ab10cd`**. The frontend wire-test proxy now tries configured backend URLs, uses the Railway backend as deployed fallback, reads non-JSON backend responses safely, and returns structured `backend_url`, `backend_http_status`, and attempts metadata. The UI now displays the upstream message and keeps raw details visible. Verified on 2026-06-16: built frontend route returned HTTP 200 with Circle HTTP 201 and payout id present for a $1 sandbox wire; invalid ops auth returned structured HTTP 403 rather than HTTP 500.
- **Lesson**: **Serverless proxy routes must preserve upstream status and diagnostics**. Do not turn backend reachability, authorization, or provider errors into an opaque 500.

### #53 — Payment Watcher SSE Storm and Key Integrations Backend Unreachable
> **Quote**: "gvomg this 2000 times every deploy, thats why backend is unreachable??? whats happening? still giving also TalkToStellar Key Integrations ... Backend unreachable ... also this in key-integrations/ frontend. fix the logging and page issuae. for all in this session and in the next iterations, push all to main"
> **Gloss**: Production logs emitted repeated `[payment-watcher] SSE error ... Not Found` warnings during deploys, and the `/key-integrations` page showed `Backend unreachable` for Abroad Finance, Reflector, and Soroswap.

- **Where**: `backend/src/integrations/payment-watcher/service.ts:152`, `frontend/app/api/[...path]/route.ts:4`, `frontend/lib/backend-proxy.ts:13`, `frontend/next.config.mjs:7`, `frontend/app/key-integrations/key-integrations-client.tsx`.
- **Root cause**: The payment watcher opened Horizon SSE streams for every stored wallet without first checking whether the Stellar account existed. Unfunded accounts return Horizon `404 Not Found`, and the old handler logged each SSE error as a warning while scheduling reconnects without closing/deduplicating pending reconnects. Separately, the generic Next.js `/api/[...path]` proxy had its own localhost fallback, so deployed key-integrations calls could report `Backend unreachable` when backend env was absent or stale.
- **Status**: **Fixed by `ef1f793` and `299a21d`**. `subscribe()` now preflights Horizon account existence with a timeout, treats `404` as an unfunded-account retry at debug level, closes failed streams, deduplicates reconnect timers, uses exponential backoff for transient stream/preflight failures, and exposes reconnecting counts in `status()`. The frontend catch-all route now uses `proxyBackendApi()` and production builds fall back to the deployed Railway backend instead of `localhost:3001`. Soroswap token discovery now returns a built-in Stellar token list when the upstream token endpoint fails or returns empty, keeping the `/key-integrations` token panel usable. Regression coverage: `backend/tests/payment-watcher.service.test.ts:75`, `frontend/__tests__/unit/api-catchall-proxy.test.ts:25`, and `backend/tests/soroswap.service.test.ts:178`.
- **Lesson**: **Background watchers must distinguish expected not-yet-funded accounts from operational failures**. Do not open noisy long-lived streams before a cheap existence check, and do not let deployed browser-facing proxies default to localhost.

### #54 — Soroswap Quote Provider 400
> **Quote**: "Soroswap /quote returned 400: {\"message\":\"Failed to get Soroswap contract address: Failed to fetch contract data: Request failed with status code 404\",\"error\":\"Bad Request\",\"statusCode\":400}"
> **Gloss**: `/api/swap/quote` reached the backend but returned Soroswap's upstream contract-discovery 400 instead of a usable quote.

- **Where**: `backend/src/integrations/soroswap/service.ts:91`, `backend/src/integrations/soroswap/service.ts:149`, `backend/src/integrations/soroswap/service.ts:199`, `frontend/app/key-integrations/key-integrations-client.tsx:664`, `frontend/app/key-integrations/key-integrations-client.tsx:727`.
- **Root cause**: `SoroswapService.getQuote()` treated Soroswap API `/quote` as the only quote source. When Soroswap's upstream contract lookup returned `404` internally and surfaced as HTTP 400, the controller propagated the provider error. The key-integrations UI then showed the raw error and still offered an XDR-build path even though no Soroswap quote object was available.
- **Status**: **Fixed by `17a821f`**. `getQuote()` now falls back to `StellarBrokerService.getQuote()` for pricing when Soroswap `/quote` fails, marks the response with `source: "stellar-broker-fallback"` and `buildAvailable: false`, and blocks Soroswap XDR build attempts for fallback quotes. The key-integrations panel shows the fallback source/warning and hides the XDR builder for fallback quotes. Regression coverage: `backend/tests/soroswap.service.test.ts:102`, `backend/tests/soroswap.service.test.ts:127`, and `backend/tests/soroswap.service.test.ts:209`.
- **Lesson**: **Provider-specific quote failures need a pricing fallback and an explicit capability boundary**. A fallback quote can keep pricing visible, but transaction-build controls must be disabled unless the quote source can build a compatible XDR.

### #55 — Horizon Preflight HTTP 429 Burst
> **Quote**: "err]  [2026-06-22T15:36:55.289Z] [WARN] [payment-watcher] Horizon preflight failed for GA2RJTB4...: Horizon account check returned HTTP 429; retrying in 120s" and "giving this error. after finishing, push the changes to main"
> **Gloss**: Payment watcher account preflight sent many Horizon account checks in the same deploy window and hit Horizon HTTP 429.

- **Where**: `backend/src/integrations/payment-watcher/service.ts:27`, `backend/src/integrations/payment-watcher/service.ts:224`, `backend/src/integrations/payment-watcher/service.ts:240`, `backend/tests/payment-watcher.service.test.ts:96`.
- **Root cause**: The previous deploy-hardening preflight checked every stored wallet before opening SSE, but only used a 50ms boot stagger and per-wallet retry timers. On rate limit, every wallet logged its own warning and scheduled reconnect using stream backoff, so a burst of accounts could hit Horizon at once and repeat noisy warnings.
- **Status**: **Fixed by `935822b`**. Account preflights now go through a serialized queue with configurable spacing (`PAYMENT_WATCHER_ACCOUNT_CHECK_SPACING_MS`, default 1000ms), respect Horizon `Retry-After` on HTTP 429, pause further account checks during rate-limit windows, log one global rate-limit warning, and schedule reconnects after the provider cooldown.
- **Lesson**: **External preflights need a global rate limiter, not only per-wallet backoff**. Any watcher that fans out over stored wallets must serialize provider checks and honor `429` cooldowns.

### #13 — Investments Page Failing
> **Quote**: "Não foi possível atualizar a aplicação agora" when applying dollars → "make sure the investment page always works"
> **Gloss**: Investment page showed a generic error instead of completing the deposit.

- **Where**: `backend/src/api/services/defindex-yield.service.ts` + frontend investments page. The DeFindex API call fails and the frontend shows a generic error.
- **Root cause**: DeFindex API timeout or rate limit. No retry logic. Generic error message without retry button.
- **Status**: **Still open**.
- **Lesson**: **Every external API call needs: (1) retry with backoff, (2) specific error messages per failure mode, (3) retry button in UI**. Never show a raw error to the user.

### #39 — Payment Link Reliability
> **Quote**: "certifique se que o link de pagamento esta funcionando!!!!!!"
> **Gloss**: Payment link generation was unreliable.

- **Where**: Payment link/confirmation URL generation — `backend/src/api/services/stellar.service.ts` + external service URL shortener.
- **Root cause**: URL generation or short-link service intermittent failure. No health check before generating links.
- **Status**: **Still open**.
- **Lesson**: **Payment links must have: (1) health check before generation, (2) fallback long URL if shortener fails, (3) TTL that matches the operation's expiration**.

### #35 — Receive-Currency UX
> **Quote**: "coloque em cima das moedas de receber: 'receber em:'... tambem nao pule direto pra parte do qr code, coloque um botão continuar"
> **Gloss**: Add "Receber em:" label above currency options. Don't skip to QR code — add a Continue button.

- **Where**: Frontend on-ramp/send screens — currency selection + QR code display.
- **Root cause**: Missing label for currency options. Auto-advance to QR code without confirmation step.
- **Status**: **Still open**.
- **Lesson**: **Every selection needs: (1) a label explaining what it is, (2) explicit Continue before proceeding**. "Receber em: [USD] [BRL] [CETES]" → Continue.

### #3 — Google Login → Create Account Redirect
> **Quote**: "login do Google redireciona pra tela de criar conta mesmo quando ja tem conta, faça fazer o login direto nesse caso, no máximo so pedir mandar codigo"
> **Gloss**: Google login redirects existing users to "create account" instead of logging them in.

- **Where**: `backend/src/api/controllers/external.controller.ts` — Google OAuth callback logic. The callback checks if the Google email exists in the user DB. If not found (or lookup fails), redirects to create-account.
- **Root cause**: No fallback: "email exists → login" vs "email not found → create account." The existence check may be timing out or returning null for valid users.
- **Status**: **Fixed** by `b35f00c` (Fix Google sign-in existing account flow). The `checkAccount` method in `external.controller.ts:618-688` now finds existing external accounts, verifies linked sessions/wallets/credentials, and returns the existing session if valid. The `linkExistingAccount` method (`external.controller.ts:729-976`) does multi-source lookup: external mappings → identity lock → token session → email/user_id across `agent_sessions` → fallback to `external_accounts`.
- **Lesson**: **OAuth callback must: (1) find user by email, (2) if found → issue JWT + redirect to home, (3) if not found AND email confirmed by provider → create account silently + login, (4) only show create-account if email is genuinely new**.

---

## Top Pains Ranked

Ranked by frequency × severity across the 52 documented incidents:

| Rank | Cluster | Count | Severity | Summary |
|------|---------|-------|----------|---------|
| 1 | **C — Flow State Machine** | 8 | HIGH | Windows don't close, flows auto-advance, links expire, PIN cut off |
| 2 | **E — Conversational Routing** | 6 | HIGH | Wrong intents, wrong assets, contact blocking, NLU outage loops |
| 3 | **A — Quote/Fee Consistency** | 4 | HIGH | Values change mid-flow, off-ramp fee not instant |
| 4 | **B — Ledger & Balance** | 5 | HIGH | Balance not credited, distribution math wrong, duplicate receipts, insufficient-balance copy |
| 5 | **H — Reliability** | 14 | HIGH | Admin history incomplete, dashboard access, login rendering/submission, migration setup, wire-test stale deploy/proxy failure, watcher/proxy deploy failure, Horizon preflight rate-limit fix, Soroswap provider fallback, investments fail, payment links unreliable, login redirects wrong |
| 6 | **G — Visual Polish** | 7 | MEDIUM | SVG spacing, shadows, charts, dark mode, dashboard cleanliness |
| 7 | **F — Copy & Verbosity** | 5 | MEDIUM | "Summary" banned, stray words, implementation copy, receipts auto-shown |
| 8 | **D — i18n Leakage** | 3 | MEDIUM | Wrong language, toggle placement, onboarding note |

## Status Summary

- **Confirmed fixed**: 27 (issues #2, #3, #4, #5, #6, #7, #9, #11, #12, #14, #15, #22, #33, #42, #43, #44, #45, #46, #47, #48, #49, #50, #51, #52, #53, #54, #55)
- **Partially fixed**: 3 (#1 — popup exists but needs further polish, #10 — receipt language fixed but full audit pending, #16 — expiry windows extended but token-consume-on-failure may remain)
- **Still open**: 22 (issues #8, #13, #17, #18, #19, #20, #21, #23, #24, #25, #26, #28, #29, #30, #30b, #31, #32, #34, #35, #36, #39, #41)
- **Not verifiable in current code**: 0

**Key**: 27 of 52 documented founder-reported pain points have been fixed since the testing sessions. The 22 remaining open items are predominantly UX/flow-state polish and conversational routing improvements. Three additional items are partially fixed.

Fixing commits verified in codebase:
| Issue | Commit | What was fixed |
|-------|--------|----------------|
| #2 | `f24d6f1` | Strip "Summary:" labels from user messages |
| #3 | `b35f00c` | Google sign-in: find existing user before redirecting to create-account |
| #4 | `6569ae0` | Auto-close completed conversion screen |
| #5 | `1c5550c`, `82ba3a4` | Normalize PIX and conversion UI |
| #6 | `9106c6a` | Resolve PIX recipients from user DB beyond saved contacts |
| #7 | `749d906` | Show sender identity on PIX-funded receipts |
| #9 | `bd6b73d` | Normalize SVG letter-spacing, kerning, text-rendering |
| #10 | `916fcb6` | Respect recipient language for receipts and notifications |
| #11 | `dcec791` | Exclude cashflows from investment return analysis |
| #12 | `d4b1d98` | Add weekly/monthly chart time window toggles |
| #14 | `c9227c6` | Fix mobile PIX withdrawal PIN layout |
| #15 | `1b34edc` | Calculate PIX off-ramp fees before destination key |
| #16 | `5a55e6c`, `92cc83d` | Fix completed short-link state, extend expiry windows |
| #22 | `e8cf1ea` | Remove receipt link from PIX completion popup |
| #33 | `0da597da` | Deduplicate PIX auto-pay receipts (DB + in-memory) |
| #49 | `227832a` | Map asset-specific insufficient conversion balance errors to insufficient-balance copy |
| #40 | Via config | Admin fee wallet configured via `TALKTOSTELLAR_FEE_TREASURY_PUBLIC_KEY` |
| #42 | Commit pending | Aggregate all authoritative transaction tables in `/ops`; verified 1,540 live database records |
| #43 | `949db79` | Make ops admin auth migration plain SQL for Supabase SQL Editor; move bootstrap to runner/function call |
| #44 | `f321a52` | Rewrite frontend `/ops` paths to the backend ops dashboard |
| #45 | `34ce523` | Replace implementation-facing ops login copy with transfer-focused operator copy |
| #46 | `4b10d31`, `c4d38bd`, `6529ec7` | Render `/ops/login` before admin DB/dashboard access and keep login errors on the HTML screen |
| #47 | `002ccd9` | Let server-rendered `/ops` browser routes bypass CORS so frontend-hosted login form POST reaches the controller |
| #48 | `6555da6` | Clean the ops dashboard visual hierarchy, restore Forensics entry, and add printable controls |
| #50 | `fe90af9` | Change ops dashboard hero metrics from today-only to all loaded ledger records |
| #51 | Current code, deployment restart | Build/start current frontend and backend so `/api/wire-test/send` and `/api/transfers/wire-test/send` are mounted; verified Circle HTTP 201 through UI |
| #52 | `1ab10cd` | Harden `/api/wire-test/send` backend fallback/error passthrough and show upstream Circle/backend status in the UI |
| #53 | `ef1f793`, `299a21d` | Preflight/dedupe payment watcher Horizon streams, route key-integrations API calls through the shared production-aware backend proxy, and keep Soroswap token discovery usable with built-in fallback tokens |
| #54 | `17a821f` | Fall back from Soroswap quote 400s to Stellar Broker pricing and disable XDR build for fallback quotes |
| #55 | `935822b` | Serialize payment watcher Horizon account preflights, honor HTTP 429 cooldowns, and replace per-wallet warning bursts with one provider-level warning |
