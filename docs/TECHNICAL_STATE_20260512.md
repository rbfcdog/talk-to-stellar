# TalkToStellar Technical State - 2026-05-12

This document is a technical handoff for another AI/engineer. It describes the current state of the TalkToStellar codebase, the features already implemented, the partially implemented areas, and the best next features to build.

## Product Direction

TalkToStellar is being repositioned as an "Invisible Wallet": a conversational global account that feels like Wise/Nubank inside WhatsApp, Telegram, and web chat.

User-facing language should avoid crypto/Web3 terms. Internally the system still uses Stellar, USDC, XLM, trustlines, path payments, Horizon, XDR, and hashes, but UX copy should say "conta global", "saldo em dólar", "pagamento internacional", "cotação", "liquidação", "comprovante", "taxa" and "operação".

Avoid building yield, staking, DeFi, tokenomics, NFTs, trading, investment advice, or features that create heavy regulatory complexity.

## Repository Layout

Backend:

```text
backend/src/app.ts
backend/src/agent/*
backend/src/api/controllers/*
backend/src/api/routes/*
backend/src/api/services/*
backend/src/migrations/agent.migration.ts
backend/migrations/*.sql
backend/scripts/*.ts
```

Frontend:

```text
frontend/app/chat/*
frontend/components/chat-window.tsx
frontend/app/create-account/*
frontend/app/confirm-payment/*
frontend/app/confirm-conversion/*
frontend/app/claim-payment/*
frontend/app/pay-anyone/*
```

Telegram adapter:

```text
telegram/src/index.js
telegram/src/bot.js
telegram/src/agent-client.js
telegram/src/session-store.js
telegram/src/health-server.js
```

## Runtime Stack

Backend is Node/Express + TypeScript.

Database is Supabase/Postgres with a service-role style backend client in `backend/src/config/supabase.ts`.

Agent uses LangChain/OpenAI via:

```text
backend/src/agent/routes.ts
backend/src/agent/graph.ts
backend/src/agent/tools.ts
```

Frontend is Next.js.

Telegram adapter is a separate Node service that forwards messages to `/api/agent/query`.

## Current Routes

Backend mounts:

```text
/api/agent
/api/actions
/api/external
/api/passkeys
/api/security
/api/financial
```

Financial routes currently exist in `backend/src/api/routes/financial.router.ts`:

```text
GET  /api/financial/activity-feed/:session_id
GET  /api/financial/insights/:session_id
GET  /api/financial/smart-contacts/:session_id
GET  /api/financial/replay/:session_id
GET  /api/financial/savings/:session_id
POST /api/financial/invoices
GET  /api/financial/invoices/:session_id
POST /api/financial/global-profile
GET  /api/financial/global-profile/:session_id
GET  /api/financial/u/:username
```

External routes include:

```text
POST /api/external/check-account
POST /api/external/link-existing
POST /api/external/link-session
POST /api/external/finalize
GET  /api/external/validate-token
POST /api/external/pay-links
POST /api/external/pay-links/claim
POST /api/external/recovery-init
POST /api/external/recovery-complete
POST /api/external/receipts/render
```

## Implemented Core Product Features

Account/onboarding:

```text
agent_sessions
wallets
external_accounts
passkeys
PIN reset
Telegram/web external account linking
```

Payments:

```text
payment confirmation links
payment claim links
recipient login/create-account requirement for linked payments
PIN confirmation before payment
payment token idempotency via payment_confirmations
payment logging via payment_logs
Telegram/WhatsApp-style notification delivery hooks
```

Conversions:

```text
path payment quotes
strict send / strict receive support
quote expiry metadata
quote validation during external finalize
conversion confirmation links
```

Invisible Wallet UX:

```text
product redesign doc exists at docs/INVISIBLE_WALLET_PRODUCT_REDESIGN.md
agent prompt was partially updated but still has old wallet/technical language in places
more copy cleanup is still needed
```

Receipt layer:

```text
backend/src/api/services/payment-receipt.service.ts
backend/src/api/services/receipt-image.service.ts
backend/src/api/controllers/receipt-image.controller.ts
POST /api/external/receipts/render
```

The receipt service sends premium text receipts after completed payments/conversions. The image service generates a dynamic receipt image/card from transaction data.

Financial memory:

```text
get_financial_memory tool
repeat-payment context
monthly conversion
average quote
monthly received
monthly fees
top payer
Wise/economy estimate
recipient insights
risk alert
AI treasury advice
```

## Newly Added Financial Assistant Services

These services were added under `backend/src/api/services/`:

```text
financial-context.service.ts
activity-feed.service.ts
financial-insights.service.ts
smart-contacts.service.ts
payment-replay.service.ts
economy-engine.service.ts
invoice.service.ts
global-profile.service.ts
```

Controller and route:

```text
backend/src/api/controllers/financial.controller.ts
backend/src/api/routes/financial.router.ts
```

Agent tools added in `backend/src/agent/tools.ts`:

```text
get_activity_feed
get_financial_insights
resolve_smart_contact
find_payment_replay_candidate
get_savings_estimate
create_invoice
get_or_create_global_profile
```

Important: these tools are registered and available to the LLM through the general tool loop, but the deterministic intent classifier/graph does not yet have dedicated top-level intents for invoice, global profile, activity feed, or insights. The LLM can call tools in general mode after onboarding, but reliability will be better if explicit intents/handlers are added.

## Database State

Existing important tables:

```text
agent_sessions
wallets
operations
agent_states
agent_messages
external_accounts
contacts
payment_logs
payment_confirmations
pin_reset_tokens
user_passkeys
passkey_challenges
audit_events
conversion_rules
scheduled_payments
whitelisted_assets
```

New AI financial assistant tables:

```text
currency_rate_history
treasury_profiles
treasury_recommendations
financial_insights
financial_events
invoices
global_profiles
```

Smart Contacts expands `contacts` with:

```text
display_name
nickname
role_label
country
preferred_currency
preferred_amount
last_amount
last_direction
last_operation_id
total_sent
total_received
transaction_count
tags
notes
metadata_json
favorite
recurring
```

Economy metadata added to `operations` and `payment_logs`:

```text
estimated_traditional_fee
actual_fee
estimated_savings
savings_percentage
comparison_method
```

## Migrations

New migrations:

```text
backend/migrations/20260512_00_payment_infra_prereqs.sql
backend/migrations/20260512_01_smart_contacts_and_treasury.sql
backend/migrations/20260512_02_activity_feed_insights_economy.sql
backend/migrations/20260512_03_financial_assistant_modules.sql
backend/migrations/20260512_99_financial_assistant_all_in_one.sql
backend/migrations/README_20260512_financial_assistant.md
```

Migration runner:

```text
backend/scripts/run-financial-assistant-migration.ts
npm run migrate:financial-assistant
```

The runner requires `SUPABASE_URL` and one of:

```text
SUPABASE_SERVICE_ROLE_KEY
SUPABASE_SERVICE_KEY
SUPABASE_ANON_KEY
SUPABASE_KEY
```

It requires the Supabase RPC `public.exec_sql(sql text)` to already exist.

## Feature Status Matrix

Smart Activity Feed:

```text
Status: backend implemented, frontend not integrated.
Service: ActivityFeedService
Table: financial_events
Endpoint: GET /api/financial/activity-feed/:session_id
Agent tool: get_activity_feed
Gap: no web chat cards yet; event generation is mostly sync-from-payment_logs.
```

AI Financial Insights:

```text
Status: backend implemented.
Service: FinancialInsightsService
Table: financial_insights
Endpoint: GET /api/financial/insights/:session_id
Agent tool: get_financial_insights
Gap: generated insights are basic and need better dedupe/cache policy.
```

Smart Contacts:

```text
Status: backend implemented.
Service: SmartContactsService
Table: contacts expanded
Endpoint: GET /api/financial/smart-contacts/:session_id
Agent tool: resolve_smart_contact
Gap: no UI management and no full natural-language alias editing handler.
```

Payment Replay:

```text
Status: backend implemented.
Service: PaymentReplayService
Endpoint: GET /api/financial/replay/:session_id
Agent tool: find_payment_replay_candidate
Safety: generates confirmation link, does not move money directly.
Gap: deterministic graph still uses older get_financial_memory replay flow in some cases.
```

Savings vs Banks:

```text
Status: backend implemented.
Service: EconomyEngineService
Endpoint: GET /api/financial/savings/:session_id
Agent tool: get_savings_estimate
Assumption: default traditional fee comparison is configurable via TRADITIONAL_FEE_PCT, default 4.5%.
Gap: fee values in old payment_logs may not have BRL fee metadata, so estimates can be sparse.
```

Invoice AI Light:

```text
Status: backend implemented.
Service: InvoiceService
Table: invoices
Endpoint: POST /api/financial/invoices
Agent tool: create_invoice
Behavior: creates a payment link requiring recipient login/create-account to receive.
Gap: no public invoice page/card UI; generated link currently uses claim-payment flow.
```

Global Account Identity:

```text
Status: backend implemented.
Service: GlobalProfileService
Table: global_profiles
Endpoints: POST/GET /api/financial/global-profile, GET /api/financial/u/:username
Agent tool: get_or_create_global_profile
Gap: no Next.js public page /u/[username] yet; backend returns profile JSON and QR URL.
```

AI Treasury:

```text
Status: partially implemented inside get_financial_memory and quote persistence.
Tables: currency_rate_history, treasury_profiles, treasury_recommendations
Behavior: stores USD/BRL quotes, computes basic BRL risk alert and behavior-based suggestions.
Gap: should not be framed as investment advice; needs clearer user-facing disclaimers and automated notification flow.
```

## Agent State

Intent enum in `backend/src/agent/types.ts` still has:

```text
login
onboard
wallet
wallet_logout
contacts
payment
payment_link
balance
history
financial_memory
conversion
price_quote
pix
general
```

Current deterministic flows in `AgentGraph` cover:

```text
wallet creation/import
login/onboarding guard
contacts
payments
payment links
conversions
price quote
financial memory
logout
history/balance through LLM/tools or handlers
```

Financial memory mode detection includes:

```text
repeat_payment
monthly_conversion
average_quote
monthly_received
monthly_fees
top_payer
wise_savings
recipient_insights
risk_alert
treasury_advice
summary
```

Recommended next agent work:

```text
Add explicit intents: invoice, global_profile, activity_feed, and insights.
Add deterministic handlers for each so investor demo flows do not depend on general LLM tool choice.
Update system prompt to fully remove wallet/crypto wording from normal UX.
```

## Frontend State

Current frontend is mostly chat/onboarding/payment confirmation:

```text
frontend/components/chat-window.tsx
frontend/components/chat-sidebar.tsx
frontend/app/create-account/*
frontend/app/login/*
frontend/app/confirm-payment/*
frontend/app/confirm-conversion/*
frontend/app/claim-payment/*
frontend/app/pay-anyone/*
```

Claim-payment was changed so recipient must log in or create an account to receive linked payments.

Not yet implemented:

```text
web chat activity feed cards
web chat insight cards
smart contacts panel
invoice visual card
public /u/[username] profile page
QR receive page
```

## Telegram/WhatsApp State

Telegram adapter forwards user messages to the backend agent.

Transfer notification service can save assistant messages and send external channel notifications where mappings exist.

Receipt delivery is backend-authoritative, but WhatsApp integration depends on configured external notify environment. Telegram notify uses either notify URL or bot token depending on env.

## Current Build/Test State

Latest verified command:

```bash
cd backend
npm run build
```

Result: passed after adding missing agent tool executor functions.

Previously relevant tests existed for:

```text
agent-tools.test.ts
payment-receipt.service.test.ts
receipt-image.service.test.ts
quote-expiry.service.test.ts
external-finalize.controller.test.ts
external-controller.test.ts
```

Full test suite was not rerun after the final documentation request.

## Known Technical Risks

The worktree is currently dirty with many modified and untracked files. Some changes are from earlier feature work and should not be reverted casually.

`backend/src/agent/routes.ts` still contains user-facing references to wallet/blockchain-style concepts. This conflicts with the final Invisible Wallet product philosophy.

`backend/src/migrations/agent.migration.ts` was updated with new tables, but there are also standalone SQL migrations. Keep both in sync if startup migrations remain enabled.

`ActivityFeedService.syncFromPayments()` derives feed events from `payment_logs`. This is pragmatic for demo, but a production event system should write `financial_events` at the source of each operation.

`FinancialInsightsService.generateUserInsights()` inserts new rows every time insights are listed. It needs dedupe/upsert or cached periods to avoid duplicated insights.

`InvoiceService` uses claim-payment links as the payment URL. This is demo-ready but not a complete invoice/payment-request product surface.

`GlobalProfileService` returns backend JSON; frontend public profile page does not exist yet.

Some old copy still exposes "USDC", "XLM", "trustline", "wallet", "hash", or "Stellar" in user-facing contexts. Needs full copy audit.

## Best Next Features To Implement

1. Deterministic agent handlers for new financial assistant features.

Add new intents and handlers for:

```text
invoice
global_profile
activity_feed
insights
```

This makes demo prompts reliable:

```text
quanto economizei esse mês?
gera uma cobrança de 120 dólares para Ana
qual meu link para receber?
me lembra de cobrar João amanhã
vou viajar para Argentina
```

2. Web chat cards for Activity Feed and Insights.

Use `/api/financial/activity-feed/:session_id` and `/api/financial/insights/:session_id` in `frontend/components/chat-window.tsx` or a new side panel. This is high visual impact and uses backend already written.

3. Public global profile page.

Create `frontend/app/u/[username]/page.tsx` that calls backend `/api/financial/u/:username`, shows profile, QR code, accepted currencies, and receive/payment request CTA.

4. Invoice visual card and payment-request page.

Create a lightweight invoice card in web chat and optionally a public invoice view. Keep wording as "cobrança" or "payment request", not fiscal invoice.

5. Event-source integration for financial_events.

Instead of only syncing from `payment_logs`, write feed events at:

```text
payment finalized
conversion finalized
claim link created/claimed
invoice created/paid
quote expired
```

6. Insight dedupe/cache.

Add a uniqueness strategy:

```text
user_id + type + period_start + period_end
```

Then upsert insights instead of inserting duplicates.

7. Full Invisible Wallet copy audit.

Search and replace normal UX copy in:

```text
backend/src/agent/routes.ts
backend/src/agent/graph.ts
backend/src/agent/tools.ts
frontend/app/*
frontend/components/*
telegram/src/*
```

Keep technical terms only in internal logs, developer docs, and explicitly technical user requests.

8. Better Smart Contacts commands.

Implement natural language updates:

```text
salva João como meu editor
marca Ana como favorita
cliente EUA é o fornecedor americano
quanto já mandei pro João?
```

## Suggested Demo Flow After Next Iteration

```text
Usuário: quanto economizei esse mês?
Bot: returns FinancialInsightsService/EconomyEngineService result.

Usuário: manda o mesmo valor pro João
Bot: PaymentReplayService finds candidate and returns confirmation link.

Usuário: gera uma cobrança de 120 dólares para Ana
Bot: InvoiceService creates invoice/payment request and returns shareable link.

Usuário: qual meu link para receber?
Bot: GlobalProfileService returns /u/username and QR.

Web chat: shows financial_events feed and financial_insights cards.
```

## Files Most Relevant For Next AI

Backend services:

```text
backend/src/api/services/activity-feed.service.ts
backend/src/api/services/financial-insights.service.ts
backend/src/api/services/smart-contacts.service.ts
backend/src/api/services/payment-replay.service.ts
backend/src/api/services/economy-engine.service.ts
backend/src/api/services/invoice.service.ts
backend/src/api/services/global-profile.service.ts
```

Agent:

```text
backend/src/agent/tools.ts
backend/src/agent/graph.ts
backend/src/agent/routes.ts
backend/src/agent/types.ts
```

Routes:

```text
backend/src/api/routes/financial.router.ts
backend/src/api/controllers/financial.controller.ts
backend/src/app.ts
```

Migrations:

```text
backend/migrations/20260512_99_financial_assistant_all_in_one.sql
backend/scripts/run-financial-assistant-migration.ts
backend/migrations/README_20260512_financial_assistant.md
```

Frontend:

```text
frontend/components/chat-window.tsx
frontend/app/chat/page.tsx
frontend/app/claim-payment/claim-payment-client.tsx
frontend/app/pay-anyone/pay-anyone-client.tsx
```

Receipts:

```text
backend/src/api/services/payment-receipt.service.ts
backend/src/api/services/receipt-image.service.ts
backend/src/api/controllers/receipt-image.controller.ts
```

Payment finalization:

```text
backend/src/api/controllers/external-finalize.controller.ts
backend/src/api/controllers/pay-link.controller.ts
backend/src/services/external.service.ts
```
