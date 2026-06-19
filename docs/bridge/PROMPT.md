You are Codex working inside my existing repo. I need you to build a production-ready Bridge.xyz MAINNET integration for a WhatsApp/Telegram/Web fintech product that does Pix ↔ digital dollar flows. Do not create a fake demo-only integration. Implement real Bridge API wrappers, real persistence, real idempotency, real status tracking, and safe mainnet guardrails.

Context:

* Bridge production API base URL should be configurable with `BRIDGE_BASE_URL`, defaulting to `https://api.bridge.xyz/v0`.
* Authentication uses the `Api-Key` header.
* Never hardcode API keys, secrets, webhook public keys, private keys, customer PII, wallet private keys, or production account data.
* Use env vars only. Add `.env.example`, but never put real secrets in it.
* This is MAINNET. Every action that can move real money must be behind explicit confirmation and backend-side guardrails.
* The product UX should avoid crypto language where possible. Use words like “dollar balance”, “Pix payout”, “recipient”, “payment”, “deposit”, “receipt”, “exchange rate”, “status”.
* Do not attempt to bypass Bridge KYC/KYB/endorsements. The correct flow must check customer status, ToS, KYC/KYB, and Bridge endorsements before money movement.
* Focus first on Brazil Pix off-ramp and on-ramp:

  1. USDC on Base/Stellar/etc. → BRL Pix payout
  2. BRL Pix deposit → USDC destination wallet
  3. reusable liquidation address flow
  4. one-time transfer flow
  5. webhooks + polling fallback
  6. receipts + user-facing status messages

Your task:
Inspect the repo deeply before coding. Detect the stack, package manager, framework, database, ORM, API route style, existing wallet/payment modules, existing user model, existing transaction/history/receipt modules, and any existing WhatsApp/Telegram/Web chat flow. Then implement the Bridge integration in the style of this repo.

Work iteratively:

1. First, map the current codebase.
2. Identify the correct files/modules to extend.
3. Create a short implementation plan in `BRIDGE_IMPLEMENTATION_PLAN.md`.
4. Implement in small commits/patches logically:

   * config/env
   * Bridge HTTP client
   * types/schemas
   * database models/migrations
   * service layer
   * API routes/controllers
   * webhooks
   * status sync jobs
   * UX/message integration
   * tests
   * docs/runbook
5. After each major phase, run available lint/typecheck/tests/build commands and fix errors.
6. Never skip compile errors.
7. Never leave placeholder functions for core money movement. If a route is not implemented, fail loudly with a typed error.
8. Prefer typed code, validation schemas, and explicit error handling.

Bridge modules to implement:

A) Configuration
Create a central Bridge config module:

* `BRIDGE_API_KEY`
* `BRIDGE_BASE_URL`
* `BRIDGE_DEFAULT_SOURCE_CHAIN`, default `base`
* `BRIDGE_DEFAULT_SOURCE_CURRENCY`, default `usdc`
* `BRIDGE_DEFAULT_DESTINATION_CURRENCY`, default `brl`
* `BRIDGE_DEFAULT_DESTINATION_RAIL`, default `pix`
* `BRIDGE_DEVELOPER_FEE_PERCENT`, default empty or `0`
* `BRIDGE_WEBHOOK_PUBLIC_KEY`
* `BRIDGE_WEBHOOK_ID`
* `BRIDGE_ENABLE_MAINNET_MONEY_MOVEMENT`, default `false`
* `BRIDGE_REQUIRE_MANUAL_CONFIRMATION`, default `true`
* `APP_PUBLIC_WEBHOOK_URL`

Add validation:

* app must fail startup in production if `BRIDGE_API_KEY` is missing.
* money movement functions must fail unless `BRIDGE_ENABLE_MAINNET_MONEY_MOVEMENT=true`.
* payout creation must require explicit confirmation field like `confirm_mainnet: true`.
* all idempotent POSTs must require or generate stable idempotency keys.

B) Bridge HTTP client
Implement a reusable Bridge API client:

* supports GET/POST/PUT/DELETE
* attaches `Api-Key`
* attaches `Content-Type: application/json`
* attaches `Idempotency-Key` for POST/PUT/DELETE when required
* parses JSON safely
* normalizes Bridge errors
* logs request method/path/status without logging PII or API keys
* supports retry only for safe transient network errors, not blindly for money-moving POSTs unless idempotency key is stable
* supports pagination helpers for list endpoints

Create typed error classes:

* `BridgeApiError`
* `BridgeAuthError`
* `BridgeValidationError`
* `BridgeKycRequiredError`
* `BridgeEndorsementRequiredError`
* `BridgeMoneyMovementDisabledError`
* `BridgeWebhookSignatureError`
* `BridgeTransferStateError`

C) Customer/KYC/ToS module
Implement service functions:

* `createBridgeIndividualCustomer(input)`
* `createBridgeBusinessCustomer(input)`
* `getBridgeCustomer(customerId)`
* `updateBridgeCustomer(customerId, patch)`
* `listBridgeCustomers(params)`
* `getBridgeTosAcceptanceLink(customerId)`
* `getBridgeKycLink(customerId)`
* `createBridgeKycLink(input)` if the docs endpoint is available in API reference
* `getBridgeKycLinkStatus(kycLinkId)`
* `ensureCustomerCanUsePix(customerId)`

`ensureCustomerCanUsePix(customerId)` must:

* fetch the Bridge customer
* check customer status
* check ToS acceptance if present
* inspect endorsements
* require `base` and/or `pix` endorsement depending on flow
* return a clear actionable result:

  * `ready`
  * `needs_tos`
  * `needs_kyc`
  * `needs_pix_endorsement`
  * `under_review`
  * `rejected`
  * `paused`
  * `unknown`

Persist Bridge customer IDs mapped to local users:

* local user id
* bridge customer id
* customer type
* status
* ToS status
* KYC status
* endorsements JSON
* timestamps
* last sync time

D) External accounts module
Implement service functions:

* `createPixExternalAccountWithKey(customerId, input)`
* `createPixExternalAccountWithBrCode(customerId, input)`
* `listExternalAccounts(customerId, params)`
* `getExternalAccount(customerId, externalAccountId)`
* `updateExternalAccount(customerId, externalAccountId, patch)`
* `deleteExternalAccount(customerId, externalAccountId)`
* `ensurePixExternalAccount(customerId, pixRecipient)`

Pix account requirements:

* `currency: "brl"`
* `account_type: "pix"` or the exact Bridge-supported shape detected from docs/API response
* support Pix key flow:

  * pix key
  * document number CPF/CNPJ
  * account owner name
  * bank name if required
  * beneficiary address if required
* support BR Code flow:

  * br_code
  * document number CPF/CNPJ
  * account owner name
  * bank name if required
  * beneficiary address if required
* normalize CPF/CNPJ input but never silently alter it in dangerous ways
* validate Pix key types where possible: CPF, CNPJ, email, phone, EVP/random key
* for EVP/random keys, preserve lowercase where required
* do not use US routing/account number fields for Pix
* do not use BRL Virtual Accounts as off-ramp destinations

Persist external accounts:

* local recipient id
* local user id
* bridge customer id
* bridge external account id
* type: pix_key or br_code
* pix key masked
* document number masked
* account owner name
* active status
* raw Bridge metadata JSON
* timestamps

E) Exchange rates module
Implement:

* `getBridgeExchangeRate(from, to)`
* `estimateUsdToBrl(amountUsd)`
* `estimateBrlToUsd(amountBrl)`
* `estimateUsdcToBrl(amountUsdc)`
* `estimateBrlToUsdc(amountBrl)`

Important:

* Bridge exchange rate endpoint is an estimate/courtesy rate, not a locked quote.
* Store estimates used in UX with timestamp.
* Do not promise locked FX unless Bridge provides a real lock/quote in API.
* Show user “estimated” amounts until final receipt.

F) Liquidation address module
This is the preferred product flow for reusable USDC → Pix payout.

Implement service functions:

* `createPixLiquidationAddress(customerId, input)`
* `listLiquidationAddresses(customerId, params)`
* `getLiquidationAddress(customerId, liquidationAddressId)`
* `updateLiquidationAddress(customerId, liquidationAddressId, patch)`
* `findExistingPixLiquidationAddress(customerId, sourceChain, sourceCurrency, externalAccountId)`
* `ensurePixLiquidationAddress(customerId, externalAccountId, options)`

Create liquidation address payload:

* source currency: `usdc` by default
* source chain: `base` by default, but configurable
* destination rail: `pix`
* destination currency: `brl`
* destination external account id
* return instructions:

  * return address on the same source chain
  * include memo when source chain requires memo
* custom developer fee percent if configured and allowed
* travel rule data only if needed/available in the project

Behavior:

* do not create duplicate liquidation addresses for same customer/source/destination; search local DB first and then Bridge if needed
* return reusable deposit instructions to the UX:

  * deposit chain
  * deposit currency
  * deposit address
  * memo/tag if present
  * destination Pix recipient summary
* persist:

  * bridge liquidation address id
  * deposit address
  * source chain
  * source currency
  * destination rail/currency
  * external account id
  * status
  * developer fee percent
  * raw Bridge object
  * timestamps

G) One-time Transfers module
Implement one-time transfer creation for:

1. Crypto → Pix:

   * source: USDC on configured chain
   * destination: BRL Pix external account
   * useful when we want one transfer per payment
2. Pix/BRL fiat → USDC:

   * source: BRL/Pix or Bridge-supported fiat source where available
   * destination: USDC wallet address
3. USD/ACH/Wire → USDC if existing product needs it, but do not prioritize over Pix

Functions:

* `createCryptoToPixTransfer(customerId, input)`
* `createPixToUsdcTransfer(customerId, input)`
* `getTransfer(transferId)`
* `listTransfers(params)`
* `cancelTransferIfAwaitingFunds(transferId)`
* `syncTransferStatus(transferId)`
* `mapBridgeTransferStateToLocalStatus(state)`

Use Bridge transfer states:

* awaiting_funds
* funds_received
* payment_submitted
* payment_processed
* in_review
* kyc_required
* kyc_in_review
* developer_kyb_required
* canceled
* error
* returned
* refund_in_flight
* refund_failed
* refunded
* undeliverable

Local statuses:

* created
* waiting_for_deposit
* deposit_received
* processing
* paid
* review
* kyc_required
* failed
* returned
* refunded
* canceled

For crypto deposits:

* support `allow_any_from_address` when user may send from exchange/wallet where from address is not known
* include exact deposit instructions returned by Bridge
* include memo if returned
* configure return instructions when supported
* never assume destination tx hash is final until final processed state

Persist transfers:

* local payment id
* bridge transfer id
* bridge customer id
* local user id
* source/destination JSON
* amount
* source currency
* destination currency
* source rail/chain
* destination rail
* external account id
* developer fee
* exchange fee if returned
* final amount if returned
* state
* receipt JSON
* source deposit instructions JSON
* destination tx hash
* created/updated timestamps
* last synced at

H) Virtual accounts module
Implement Pix onramp via BRL Virtual Account where Bridge account/endorsement supports it.

Functions:

* `createBrlVirtualAccount(customerId, destinationWallet)`
* `createUsdVirtualAccount(customerId, destinationWallet)` if useful
* `listVirtualAccounts(customerId, params)`
* `getVirtualAccount(customerId, virtualAccountId)`
* `deactivateVirtualAccount(customerId, virtualAccountId)`
* `reactivateVirtualAccount(customerId, virtualAccountId)`
* `getVirtualAccountActivity(customerId, virtualAccountId, params)`
* `syncVirtualAccountActivity(...)`

Important:

* BRL Virtual Account is for receiving Pix deposits and converting/onward delivering to crypto.
* Do NOT use BRL Virtual Account as Pix off-ramp destination.
* Store returned Pix/BRL deposit instructions for the user.
* Use webhooks and activity API for deposit tracking.

Persist:

* local user id
* bridge customer id
* bridge virtual account id
* source currency
* source rails
* destination currency
* destination chain
* destination wallet address
* deposit instructions JSON
* status
* raw Bridge object
* timestamps

I) Webhooks
Implement Bridge webhook endpoint:

* path should match repo conventions, e.g. `/api/webhooks/bridge`
* must receive raw request body
* must verify `X-Webhook-Signature`
* signature format: `t=<timestamp>,v0=<base64 signature>`
* reject missing/invalid signatures
* reject old timestamps, e.g. older than 10 minutes
* verify against `BRIDGE_WEBHOOK_PUBLIC_KEY`
* return 200 quickly after durable event persistence
* process asynchronously if existing job queue exists
* idempotently handle duplicate events by `event_id`

Implement webhook event handling for:

* customer
* kyc_link
* transfer
* liquidation_address.drain
* virtual_account.activity
* external_account

Persist webhook events:

* event id
* event sequence if present
* event category
* event type
* raw payload
* processed status
* processing error
* created at
* processed at

Webhook actions:

* customer updated → sync local customer/KYC/endorsements
* kyc_link updated → sync KYC status
* external_account created/updated → sync external account active/deactivation details
* transfer created/updated → sync payment status + receipt
* liquidation address drain/activity → create/update local off-ramp transaction
* virtual account activity → create/update Pix onramp transaction

Add admin/dev function to:

* create webhook endpoint in disabled state
* list webhook events
* list webhook logs if endpoint exists
* enable webhook after local verification

J) Receipts and user-facing UX
Integrate with existing receipt/history/feed/chat modules.

For every payment/off-ramp/on-ramp, create a receipt object:

* local transaction id
* Bridge resource type: transfer/liquidation/virtual_account_activity
* Bridge resource id
* status
* source amount/currency
* destination amount/currency
* estimated exchange rate
* final exchange rate if known
* Bridge exchange fee if returned
* developer fee if returned
* network/gas fee if returned
* Pix recipient masked
* destination tracking info if returned
* destination tx hash if crypto
* created/processed timestamps
* user-friendly status message
* raw Bridge receipt JSON

User-facing statuses:

* “Waiting for deposit”
* “Deposit received”
* “Converting dollars to reais”
* “Sending Pix”
* “Pix sent”
* “Under review”
* “Action needed: KYC”
* “Payment failed”
* “Refund in progress”
* “Refunded”

For WhatsApp/Telegram:

* Add commands/intents like:

  * “send 50 dollars to pix”
  * “offramp 20 usdc to pix”
  * “create pix payout”
  * “where do I deposit?”
  * “payment status”
  * “show receipt”
* The assistant should guide:

  1. collect amount
  2. collect Pix key / BR Code
  3. collect recipient name + CPF/CNPJ if required
  4. estimate BRL
  5. show confirmation
  6. create external account if needed
  7. create liquidation address or one-time transfer
  8. return deposit instructions
  9. track status
  10. send receipt

K) Database/schema
Use the repo’s existing DB/ORM. If none exists, create a minimal persistence layer matching the project style.

Add tables/models for:

* bridge_customers
* bridge_external_accounts
* bridge_liquidation_addresses
* bridge_virtual_accounts
* bridge_transfers
* bridge_webhook_events
* bridge_receipts or extend existing receipts/transactions
* bridge_exchange_rate_estimates

Add indexes:

* bridge customer id
* local user id
* transfer id
* external account id
* liquidation address id
* virtual account id
* webhook event id unique
* local transaction id
* status
* created_at

L) API routes/controllers
Expose backend routes matching project conventions. Suggested routes:

Customer:

* `POST /api/bridge/customers`
* `GET /api/bridge/customers/:id`
* `POST /api/bridge/customers/:id/sync`
* `GET /api/bridge/customers/:id/kyc-link`
* `GET /api/bridge/customers/:id/tos-link`
* `GET /api/bridge/customers/:id/readiness`

External Accounts:

* `POST /api/bridge/customers/:id/external-accounts/pix-key`
* `POST /api/bridge/customers/:id/external-accounts/br-code`
* `GET /api/bridge/customers/:id/external-accounts`
* `GET /api/bridge/customers/:id/external-accounts/:externalAccountId`
* `DELETE /api/bridge/customers/:id/external-accounts/:externalAccountId`

Liquidation:

* `POST /api/bridge/customers/:id/liquidation-addresses/pix`
* `GET /api/bridge/customers/:id/liquidation-addresses`
* `GET /api/bridge/customers/:id/liquidation-addresses/:liquidationAddressId`
* `PUT /api/bridge/customers/:id/liquidation-addresses/:liquidationAddressId`

Transfers:

* `POST /api/bridge/transfers/crypto-to-pix`
* `POST /api/bridge/transfers/pix-to-usdc`
* `GET /api/bridge/transfers/:transferId`
* `POST /api/bridge/transfers/:transferId/sync`
* `DELETE /api/bridge/transfers/:transferId`

Virtual Accounts:

* `POST /api/bridge/customers/:id/virtual-accounts/brl`
* `GET /api/bridge/customers/:id/virtual-accounts`
* `GET /api/bridge/customers/:id/virtual-accounts/:virtualAccountId`
* `GET /api/bridge/customers/:id/virtual-accounts/:virtualAccountId/activity`

Rates:

* `GET /api/bridge/exchange-rates?from=usd&to=brl`
* `POST /api/bridge/estimate`

Webhooks:

* `POST /api/webhooks/bridge`
* admin-only: `POST /api/admin/bridge/webhooks`
* admin-only: `PUT /api/admin/bridge/webhooks/:id/enable`

M) Security and compliance guardrails

* Never expose Bridge API key to frontend.
* Never log full Pix key, CPF/CNPJ, bank account numbers, addresses, or API response bodies containing PII.
* Mask sensitive values in logs and UI:

  * CPF: `***.***.***-12`
  * CNPJ: `**.***.***/****-12`
  * Pix email: `r***@domain.com`
  * phone: `+55******1234`
* Require authenticated local user before creating any customer/payment.
* Enforce local authorization: user can only access their own Bridge resources.
* Admin routes must require admin auth.
* Mainnet money movement must require:

  * `BRIDGE_ENABLE_MAINNET_MONEY_MOVEMENT=true`
  * user confirmation
  * KYC/readiness checks
  * Pix endorsement readiness
  * valid external account
  * amount limits
* Add min/max amount config:

  * `BRIDGE_MIN_BRL_AMOUNT`
  * `BRIDGE_MAX_BRL_AMOUNT`
  * `BRIDGE_MIN_USDC_AMOUNT`
  * `BRIDGE_MAX_USDC_AMOUNT`
* Add rate limiting to money movement endpoints.
* Add audit logs for:

  * customer creation/update
  * external account creation/deletion
  * transfer creation/cancellation
  * liquidation address creation/update
  * webhook event processing
* Add explicit `dry_run` support for frontend flows that only estimate/show confirmation and do not call Bridge money-moving endpoints.

N) Tests
Add tests using the repo’s testing framework:

* Bridge client sends headers correctly
* API key never returned to client
* idempotency key required for POSTs
* Pix external account payload validation
* BR Code payload validation
* liquidation address payload validation
* transfer payload validation
* exchange rate parsing
* customer readiness mapping
* webhook signature verification:

  * valid signature accepted
  * missing signature rejected
  * invalid signature rejected
  * old timestamp rejected
  * duplicate event id idempotent
* transfer state mapping
* sensitive field masking
* money movement disabled guard
* manual confirmation guard
* user authorization guard

Use mocked Bridge responses. Do not hit mainnet in tests unless an explicit integration test flag is enabled.

Add optional integration tests:

* only run with `RUN_BRIDGE_MAINNET_INTEGRATION_TESTS=true`
* never create a real transfer unless `BRIDGE_ENABLE_MAINNET_MONEY_MOVEMENT=true`
* include a smoke test for `GET /customers` or equivalent harmless endpoint
* include exchange rate smoke test
* include customer readiness fetch for a known test customer id only if env var is present

O) Docs
Create:

* `docs/bridge-mainnet.md`
* `docs/bridge-pix-flow.md`
* `docs/bridge-runbook.md`
* update `.env.example`

Docs must explain:

* required env vars
* mainnet safety flags
* Pix off-ramp flow
* Pix on-ramp flow
* when to use Liquidation Address vs one-time Transfer
* why BRL Virtual Account is not an off-ramp destination
* how to configure webhooks
* how to test webhook signature verification
* how to manually sync a transfer
* common Bridge states and local states
* troubleshooting:

  * KYC required
  * Pix endorsement missing
  * external account inactive
  * transfer awaiting funds
  * undeliverable
  * returned/refunded
  * webhook not firing
  * duplicate liquidation address
  * amount mismatch
  * memo missing on memo-based chains

P) Recommended product behavior
Implement the main user flow like this:

Flow 1: USDC → Pix using reusable liquidation address

1. user asks to send dollars to Pix
2. backend checks/creates local Bridge customer mapping
3. backend checks customer readiness and Pix endorsement
4. collect recipient Pix data
5. create or reuse Pix external account
6. create or reuse Pix liquidation address
7. show user:

   * amount estimate
   * deposit address
   * chain
   * currency
   * memo if required
   * recipient masked
8. when Bridge webhook arrives, update transaction
9. send status updates
10. send final receipt

Flow 2: USDC → Pix using one-time transfer

1. user asks for a one-time Pix payout
2. collect amount + recipient
3. create Pix external account if needed
4. create transfer with stable idempotency key
5. return Bridge source deposit instructions
6. track transfer state via webhook and polling
7. send final receipt

Flow 3: Pix → USDC using BRL virtual account

1. create BRL virtual account for customer with USDC destination wallet
2. show Pix deposit instructions / BR Code returned by Bridge
3. Bridge receives Pix and converts/sends to destination
4. webhook/activity updates status
5. receipt generated

Q) Deliverables checklist
At the end, provide a summary:

* files changed
* env vars added
* routes added
* DB migrations added
* tests added
* commands run
* remaining manual steps
* any uncertain Bridge payload shapes that must be verified against live API response

Do not stop after creating only stubs. Build the full vertical slice for Pix off-ramp first:

1. config
2. client
3. customer readiness
4. Pix external account
5. liquidation address
6. webhook
7. receipt/status
8. tests

Then build the one-time transfer flow.
Then build BRL virtual account onramp.
Then build admin/docs/testing.
