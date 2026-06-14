# LESSONS.md — Engineering Lessons from Pain Points

> **Living document.** Updated when new pain-point clusters reveal new engineering rules.

One section per cluster from [PAIN-POINTS.md](../PAIN-POINTS.md). Written so a new hire avoids repeating them.

## A — Quote/Fee Consistency

**Lesson**: Freeze quotes at intent creation. Never re-fetch mid-flow.

- Quote snapshots must be a single atomic operation: load → freeze → display
- Frontend must NOT re-fetch quotes on re-render or navigation
- Fee calculation must be symmetric: pre-compute for BOTH on-ramp and off-ramp during the quote stage
- Every financial amount shown to the user must be immutable from the moment it appears until the user confirms or cancels

## B — Ledger & Balance Correctness

**Lesson**: Balance is a reactive derivative of confirmed on-chain state, never optimistic.

- Never show "balance updated" until Horizon confirms the token
- Portfolio percentages must sum to 100.0% — assert in tests
- Investment performance = time-weighted return, not simple delta. Exclude deposits/withdrawals
- Receipt generation must be idempotent per operation_id

## C — Screen/Flow State Machine

**Lesson**: The backend is the single source of truth for flow state. The frontend reads only.

- Every flow step requires explicit user confirmation before advancing
- Post-condition of any completed transaction: close the initiating window
- Idempotency tokens must be consumed on success, not on first access
- Mobile screens must be scrollable and multi-step (Nubank pattern)
- Every disabled state must explain WHY to the user

## D — i18n Leakage

**Lesson**: The recipient's language config is the only source of truth for recipient-facing text.

- `resolveLocale(recipientId)`, never `resolveLocale(sessionId)` for recipient messages
- Language toggle belongs in app chrome only, never inside a flow
- Audit every surface: who is the recipient? use their locale

## E — Conversational Routing & Intent

**Lesson**: Validate everything the NLU produces before executing.

- "Send to" resolution: User DB → Contacts → Invite prompt. Never block on "not in contacts"
- Asset direction must be validated server-side before execution
- Every user-facing asset reference must come from transaction data, never a default
- Circuit breaker: after 3 NLU failures → escalate to human message + stop retrying
- Pathfinding failures must surface the root cause, not a generic error

## F — Copy & Verbosity

**Lesson**: Every word on screen must earn its place. Delete everything else.

- "Summary:" is banned. "Best route" is the approved alternative
- Completion screen = "✅ Concluído" + amount. Receipt optional.
- PIN screen = masked dots + keypad + cancel. Nothing else.
- Never auto-display a full receipt at the end of a flow

## G — Visual Polish

**Lesson**: Visual attributes must come from a design token system. No inline values.

- Shadows: `shadow-sm`, `shadow-md`, `shadow-lg` — same everywhere
- SVG text must be pixel-verified with the actual renderer
- Charts: step interpolation, not smooth curves. Weekly/monthly toggles
- Dark mode: sent messages = light bubble. Test both modes on every component

## H — Reliability

**Lesson**: Every external API call needs retry + backoff + specific error messages.

- DeFindex, Etherfuse, OpenAI — all need retry with exponential backoff
- Payment links must have health checks + fallback long URLs
- OAuth callback: "find user → login" before "create account" redirect
- Never show a raw API error to the user
