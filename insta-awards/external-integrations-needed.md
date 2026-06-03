# External Integrations Needed

This document lists the external services needed to complete, validate, or
demonstrate the Instawards SOW:

```text
Pix funding -> BRL/USD quote -> Stellar USDC settlement -> USD payout instruction -> reconciliation
```

It separates integrations that are required for the SOW evidence from optional
or non-SOW integrations already present in the codebase.

## Priority Summary

| Priority | Integration | Needed for SOW? | Current repo status | Action needed |
| --- | --- | --- | --- | --- |
| P0 | Supabase/Postgres | Yes | Implemented and required at boot. | Ensure migrations are applied and service role is configured. |
| P0 | Stellar Horizon/Testnet | Yes | Implemented. | Configure settlement source/destination and capture tx hash. |
| P0 | Etherfuse sandbox Pix | Yes | Implemented. | Configure sandbox API key, webhook secret, and Pix test flow. |
| P0 | Public backend/frontend deployment | Yes | Implemented through env/proxy patterns. | Ensure public URLs and CORS/webhooks are correct. |
| P1 | Circle or Bridge sandbox/compatibility | Strongly recommended | Adapter interface exists. | Configure at least one sandbox API or preserve dry-run payload evidence. |
| P1 | OpenAI | Needed for chat demo | Implemented. | Configure key/model if demo uses WhatsApp/Telegram natural language. |
| P1 | Evolution WhatsApp | Needed for WhatsApp demo | Implemented. | Configure instance, API key, public webhook, and delivery tests. |
| P2 | Telegram Bot API | Optional channel demo | Implemented. | Configure bot token/webhook only if using Telegram in evidence. |
| P2 | Market FX APIs | Supporting quote sanity | Implemented, no keys needed. | Keep fallback policy explicit. |
| P3 | Twilio WhatsApp | Optional fallback/OTP | Implemented as fallback. | Not required if Evolution works. |
| P3 | SendGrid/email webhook | Not needed now | Code exists but email confirmation is disabled. | Do not include in SOW unless re-enabled. |
| P3 | DeFindex | Not part of this SOW | Implemented for application/yield flows. | Exclude from this Instawards evidence unless separately requested. |

## P0: Supabase/Postgres

### Why it is needed

The SOW requires transfer records, lifecycle states, quote records,
reconciliation metadata, Pix references, Stellar evidence, and payout
instruction records. These are persisted in Supabase/Postgres.

### Code evidence

- `backend/src/config/supabase.ts`
- `backend/src/api/repository/international-transfer.repository.ts`
- `backend/migrations/20260520_00_international_usd_transfers.sql`
- `backend/src/api/services/international-transfer.service.ts`

### Required environment

```text
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
SUPABASE_ANON_KEY
```

### Required database state

The following migration must be applied in the same Supabase project used by
the backend:

```text
backend/migrations/20260520_00_international_usd_transfers.sql
```

Expected tables:

```text
international_transfer_quotes
international_transfers
international_transfer_reconciliations
```

### What is missing or needs verification

- Confirm the migration is applied in the live reviewer environment.
- Export one row from each table for the final evidence package.
- Verify service role key is used by backend; anon key should not be relied on
  in production-like environments.

## P0: Stellar Horizon and Testnet Settlement

### Why it is needed

The SOW requires USDC settlement evidence on Stellar. The code can produce real
testnet transaction hashes when settlement credentials are configured.

### Code evidence

- `backend/src/config/stellar.ts`
- `backend/src/config/assets.ts`
- `backend/src/api/services/stellar.service.ts`
- `backend/src/api/services/stellar-settlement.service.ts`
- `backend/src/api/repository/stellar-transaction.repository.ts`

### Required environment for testnet evidence

```text
STELLAR_NETWORK=TESTNET
STELLAR_HORIZON_URL=https://horizon-testnet.stellar.org
STELLAR_FRIENDBOT_URL=https://friendbot.stellar.org
STELLAR_SECRET_KEY
STELLAR_PUBLIC_KEY
USDC_ASSET_CODE=USDC
USDC_ASSET_ISSUER
USD_OFFRAMP_STELLAR_DESTINATION
PAYOUT_STELLAR_DESTINATION_PUBLIC_KEY
```

`USD_OFFRAMP_STELLAR_DESTINATION` or
`PAYOUT_STELLAR_DESTINATION_PUBLIC_KEY` must point to the settlement recipient
used for the demo.

### Optional low-value mainnet validation

Only use if explicitly intended:

```text
STELLAR_NETWORK=PUBLIC
STELLAR_MAINNET_ALLOW_RUNTIME_ACTIVATION=true
ENABLE_MAINNET_SETTLEMENT_VALIDATION=true
MAX_MAINNET_VALIDATION_AMOUNT_USD=25
```

### What is missing or needs verification

- Configure a funded Stellar testnet source account.
- Ensure source account has enough XLM for fees and reserves.
- Ensure source account has USDC balance for settlement.
- Ensure destination account/trustline is ready for USDC if needed.
- Capture transaction hash, memo, source, destination, asset issuer, network,
  amount, and Horizon/explorer link.

### Risk note

If these variables are not configured, the settlement service may return
mock/sandbox evidence when mocks are explicitly allowed. That is useful for
workflow testing but cannot be presented as real Stellar settlement.

## P0: Etherfuse Sandbox Pix

### Why it is needed

The SOW starts with Pix-funded BRL intake. The repo uses Etherfuse as the
sandbox Pix/on-ramp/off-ramp integration.

### Code evidence

- `backend/src/api/services/anchor.service.ts`
- `backend/src/api/services/pix-funding.service.ts`
- `backend/src/api/controllers/etherfuse-webhook.controller.ts`
- `backend/src/api/routes/webhooks.router.ts`
- `backend/src/api/routes/ramp.router.ts`
- `frontend/app/pix-ramp`

### Required environment

```text
ETHERFUSE_API_KEY
ETHERFUSE_BASE_URL=https://api.sand.etherfuse.com
ETHERFUSE_BLOCKCHAIN=stellar
ETHERFUSE_WEBHOOK_SECRET
```

The API key format expected by the current code is:

```text
api_<environment>:<api_key>:<organization_id>
```

### Optional sandbox/fallback controls

```text
ETHERFUSE_SANDBOX_PIX_FALLBACK
INTERNATIONAL_TRANSFER_ENABLE_MOCK_PIX
ALLOW_OPS_MOCKS
ALLOW_USER_FACING_MOCKS
```

### TESOURO distributor note

Some sandbox Pix settlement paths require the TESOURO distributor configuration:

```text
TESOURO_DISTRIBUTOR_PUBLIC
TESOURO_DISTRIBUTOR_SECRET
TESOURO_ISSUER
```

If these are missing, Pix withdrawal or sandbox settlement flows can fail with
provider/configuration errors instead of producing clean demo evidence.

### Webhook route

```text
POST /api/webhooks/etherfuse/pix
POST /webhooks/etherfuse/pix
```

The controller accepts the secret through:

```text
X-Etherfuse-Webhook-Secret
X-Webhook-Secret
Authorization: Bearer <secret>
?secret=<secret>
```

### What is missing or needs verification

- Confirm Etherfuse sandbox org/key is active.
- Confirm webhook URL points to the public backend.
- Confirm Pix funding intent can be created.
- Confirm funding event moves transfer to `PIX_RECEIVED`.
- Capture Pix order/payment IDs and webhook request/response.

## P0: Public Deployment, CORS, and Frontend Proxy

### Why it is needed

External providers must reach backend webhooks, and reviewers need stable
frontend URLs.

### Code evidence

- `backend/src/app.ts`
- `frontend/lib/backend-proxy.ts`
- `frontend/app/api/quotes/[...path]/route.ts`
- `frontend/app/api/transfers/[...path]/route.ts`
- `scripts/generate-env.mjs`

### Required environment

Backend:

```text
PORT
PUBLIC_BACKEND_URL
FRONTEND_URL
PUBLIC_APP_URL
CORS_ORIGINS
INTERNAL_API_SECRET
AGENT_INGEST_SECRET
```

Frontend:

```text
BACKEND_URL
NEXT_PUBLIC_BACKEND_URL
NEXT_PUBLIC_AGENT_API_URL
NEXT_PUBLIC_FRONTEND_URL
```

### What is missing or needs verification

- Public backend URL must not be localhost.
- Frontend proxy routes must point to the deployed backend.
- CORS must include the deployed frontend domain.
- Webhook URLs generated for Evolution/Etherfuse must match the public backend.

## P1: Circle Compatibility Adapter

### Why it matters

The SOW says the sprint may validate compatibility with APIs and payout flows
associated with providers such as Circle or Bridge where sandbox/developer
access is available. Circle is one candidate for that validation.

### Code evidence

- `backend/src/api/services/usd-payout-adapters.ts`

### Required environment for real/sandbox POST

```text
PAYOUT_PROVIDER=circle
CIRCLE_API_KEY
CIRCLE_PAYOUT_CREATE_URL
ENABLE_REAL_PAYOUT_EXECUTION=true
```

### Current behavior

- Without `ENABLE_REAL_PAYOUT_EXECUTION=true`, the adapter prepares a
  provider-shaped payload but does not POST to Circle.
- With the flag and configured URL/key, it POSTs to the configured create URL
  using bearer auth.

### What is missing or needs verification

- Confirm Circle sandbox/API access exists.
- Confirm the expected request body matches Circle's currently approved API
  endpoint for the account.
- Capture sandbox response or explicitly label payload as dry-run
  compatibility evidence.

## P1: Bridge Compatibility Adapter

### Why it matters

Bridge is the other provider named in the SOW as a possible compatibility path.

### Code evidence

- `backend/src/api/services/usd-payout-adapters.ts`

### Required environment for real/sandbox POST

```text
PAYOUT_PROVIDER=bridge
BRIDGE_API_KEY
BRIDGE_PAYOUT_CREATE_URL
ENABLE_REAL_PAYOUT_EXECUTION=true
```

### Current behavior

- Without `ENABLE_REAL_PAYOUT_EXECUTION=true`, the adapter prepares a
  provider-shaped payload but does not POST to Bridge.
- With the flag and configured URL/key, it POSTs to the configured create URL
  using bearer auth.

### What is missing or needs verification

- Confirm Bridge sandbox/API access exists.
- Confirm request body and destination account format.
- Capture sandbox response or explicitly label payload as dry-run
  compatibility evidence.

## P1: Wise-Compatible Destination Metadata

### Why it matters

The SOW positions TalkToStellar as the rail before a user's existing global USD
account, such as Wise, Revolut, Mercury, or another USD account provider.

### Code evidence

- `backend/src/api/services/international-transfer.types.ts`
- `backend/src/api/services/identity-alignment.service.ts`
- `frontend/app/international-transfer/international-transfer-client.tsx`

### Current behavior

The code captures destination metadata:

```text
accountHolderName
accountHolderType
bankName
routingNumber
accountNumber
accountType
country
providerLabel
```

It also records same-name alignment status:

```text
MATCHED
MISMATCHED
UNKNOWN
```

### What is missing or needs verification

- No production Wise API integration exists.
- No ACH/wire execution exists.
- Reviewer materials should say "Wise-compatible destination metadata" or
  "provider-compatible payout instruction", not "Wise payout executed".

## P1: OpenAI LLM

### Why it matters

The SOW references existing conversational WhatsApp/Telegram settlement
interfaces. OpenAI powers the LLM agent for those channels.

### Code evidence

- `backend/src/app.ts`
- `backend/src/api/agent/graph.ts`
- `backend/src/api/agent/routes.ts`
- `backend/src/api/services/payment-feedback.service.ts`

### Required environment

```text
OPENAI_API_KEY
OPENAI_MODEL
TEMPERATURE
```

### What is missing or needs verification

- Confirm key is configured in the deployed backend.
- Confirm the chat can answer general capability questions and route users to
  Pix/conversion/application/history/profile flows.
- For SOW evidence, capture at least one conversational request that opens or
  references the institutional settlement route, if using a chat demo.

## P1: Evolution WhatsApp

### Why it matters

WhatsApp is a core existing channel for TalkToStellar. It is useful for
demonstrating conversational access to the settlement infrastructure, though
the SOW's institutional transfer proof can also be demonstrated through the web
reviewer UI.

### Code evidence

- `backend/src/api/services/notifications/evolution.service.ts`
- `backend/src/api/controllers/evolution.controller.ts`
- `backend/src/api/routes/evolution.router.ts`
- `backend/src/app.ts`

### Required environment

```text
EVOLUTION_API_URL
EVOLUTION_API_KEY
EVOLUTION_INSTANCE
EVOLUTION_WEBHOOK_SECRET
PUBLIC_BACKEND_URL
EVOLUTION_AGENT_URL
EVOLUTION_AGENT_TIMEOUT_MS
EVOLUTION_CONTENT_DEDUPE_TTL_MS
```

Optional send tuning:

```text
EVOLUTION_NOTIFY_SEND_ATTEMPTS
EVOLUTION_NOTIFY_SEND_TIMEOUT_MS
EVOLUTION_SEND_TEXT_BODY_VERSION
EVOLUTION_WEBHOOK_RECONCILE_INTERVAL_MS
EVOLUTION_WEBHOOK_CONFIGURE_INITIAL_DELAY_MS
```

### Webhook routes

```text
POST /api/evolution/webhook
POST /webhook/evolution
POST /webhook/evolution/:event
```

### What is missing or needs verification

- Confirm Evolution instance is connected.
- Confirm webhook auto-configuration succeeds.
- Confirm inbound message reaches `/api/agent/query`.
- Confirm outbound reply succeeds.
- Capture WhatsApp screenshot and backend logs for the final package if using
  this channel as evidence.

## P2: Telegram Bot API

### Why it matters

Telegram is an optional conversational channel. It is not required to prove the
institutional settlement layer if WhatsApp or web UI evidence is enough.

### Code evidence

- `telegram/src/index.js`
- `telegram/src/bot.js`
- `telegram/src/agent-client.js`
- `backend/src/api/services/notifications/transfer-notification.service.ts`

### Required environment

Telegram service:

```text
TELEGRAM_BOT_TOKEN
TELEGRAM_AGENT_URL
TELEGRAM_BOT_MODE
TELEGRAM_WEBHOOK_URL
TELEGRAM_WEBHOOK_PATH
TELEGRAM_NOTIFY_SECRET
AGENT_INGEST_SECRET
```

Backend notification fallback:

```text
TELEGRAM_NOTIFY_URL
TELEGRAM_BOT_TOKEN
TELEGRAM_NOTIFY_SECRET
```

### What is missing or needs verification

- Configure BotFather token.
- Confirm webhook or polling mode.
- Confirm `AGENT_INGEST_SECRET` matches backend.
- Capture one Telegram chat if using Telegram as evidence.

## Removed: Market FX Reference APIs

### Why it matters

The conversion system no longer uses external market USD/BRL references for
quote sanity, fallback display, receipts, or transaction execution. Rates are
derived from the transaction route values themselves.

### Code evidence

- `backend/src/api/services/quote-rate-sanity.service.ts`
- `backend/src/utils/fee-display.ts`
- `backend/src/api/services/transaction-rate.service.ts`

### External APIs used

```text
None for conversion pricing.
```

### Relevant environment

```text
BRL_USDC_REFERENCE_SAMPLE_USDC
USD_BRL_SANITY_MIN
USD_BRL_SANITY_MAX
```

### What is missing or needs verification

- Ensure every reviewer quote/receipt shows `source: transaction_values`.
- If a route is unavailable, the product should show unavailable instead of inventing a rate.
- Capture transaction route source/destination amounts in final reviewer evidence.

## P3: Twilio WhatsApp Fallback

### Why it exists

The code can use Twilio for recovery OTPs and as a WhatsApp notification
fallback if Evolution is unavailable.

### Code evidence

- `backend/src/api/controllers/external-recovery.controller.ts`
- `backend/src/api/services/notifications/transfer-notification.service.ts`

### Required environment

```text
TWILIO_ACCOUNT_SID
TWILIO_AUTH_TOKEN
TWILIO_WHATSAPP_NUMBER
TWILIO_PHONE_NUMBER
```

### SOW status

Not required for the Instawards settlement demo if Evolution or the web reviewer
UI is used.

## P3: SendGrid or Email Webhook

### Why it exists

The code contains email confirmation delivery through SendGrid or a custom
webhook, but email confirmation is intentionally disabled in the current build.

### Code evidence

- `backend/src/api/services/email-confirmation.service.ts`

### Required environment if re-enabled later

```text
SENDGRID_API_KEY
EMAIL_CONFIRMATION_WEBHOOK_URL
EMAIL_CONFIRMATION_WEBHOOK_SECRET
EMAIL_FROM
TALKTOSTELLAR_EMAIL_FROM
```

### SOW status

Not needed for this Instawards SOW.

## P3: DeFindex

### Why it exists

The repo includes DeFindex vault/application functionality for separate
application/yield flows. That is not the focus of the Pix-to-USD transfer
routing SOW.

### Code evidence

- `backend/src/api/services/defindex-yield.service.ts`
- `backend/src/api/services/anchor.service.ts`
- `frontend/app/yield`
- `frontend/app/investments`

### Relevant environment

```text
DEFINDEX_API_KEY
DEFINDEX_BASE_URL
DEFINDEX_NETWORK
DEFINDEX_TIMEOUT_MS
DEFINDEX_ENABLE_EXECUTION
DEFINDEX_COMPLIANCE_APPROVED
DEFINDEX_ALLOW_MAINNET_EXECUTION
DEFINDEX_USDC_VAULT
DEFINDEX_CETES_VAULT
DEFINDEX_XLM_VAULT
DEFINDEX_TESOURO_VAULT
DEFINDEX_VAULTS_JSON
```

### SOW status

Exclude from this Instawards evidence unless the final demo explicitly wants to
show broader TalkToStellar product functionality. It can distract reviewers
from the Pix -> Stellar USDC -> USD payout-routing corridor.

## Minimum Integration Set for the Final SOW Demo

For the strongest clean demo, configure:

```text
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
OPENAI_API_KEY
STELLAR_NETWORK=TESTNET
STELLAR_HORIZON_URL=https://horizon-testnet.stellar.org
STELLAR_SECRET_KEY
STELLAR_PUBLIC_KEY
USDC_ASSET_CODE=USDC
USDC_ASSET_ISSUER
USD_OFFRAMP_STELLAR_DESTINATION
ETHERFUSE_API_KEY
ETHERFUSE_BASE_URL=https://api.sand.etherfuse.com
ETHERFUSE_WEBHOOK_SECRET
PUBLIC_BACKEND_URL
FRONTEND_URL
NEXT_PUBLIC_BACKEND_URL
PAYOUT_PROVIDER=etherfuse
```

Then choose one payout validation route:

```text
PAYOUT_PROVIDER=circle
CIRCLE_API_KEY
CIRCLE_PAYOUT_CREATE_URL
ENABLE_REAL_PAYOUT_EXECUTION=true
```

or:

```text
PAYOUT_PROVIDER=bridge
BRIDGE_API_KEY
BRIDGE_PAYOUT_CREATE_URL
ENABLE_REAL_PAYOUT_EXECUTION=true
```

If no Circle/Bridge sandbox access is available, keep `PAYOUT_PROVIDER=etherfuse`
or `mock` for the demo, but label the payout as sandbox/proof or dry-run
compatibility evidence.

## Integration Evidence Checklist

Before submission, capture:

- Supabase migration confirmation.
- Quote API response with quote source.
- Pix funding intent response.
- Pix webhook or sandbox funding confirmation.
- Stellar testnet transaction hash.
- Transfer row with lifecycle status.
- Reconciliation JSON.
- Payout instruction payload.
- Circle/Bridge sandbox response or clearly labeled dry-run payload.
- Screenshot of `/institution-settlement`.
- Optional WhatsApp or Telegram chat screenshot if using conversational demo.
- Environment summary with secrets redacted.

## Integrations Not Needed for This SOW

Do not block the SOW on:

- Production Wise API access.
- Production ACH/wire payout access.
- Production remittance licensing.
- DeFindex vault execution.
- Email confirmation.
- Twilio fallback, if Evolution works.
- Mainnet execution, unless doing a deliberate low-value validation.
