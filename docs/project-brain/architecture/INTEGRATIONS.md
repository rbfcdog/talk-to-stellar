# INTEGRATIONS.md — External Service Integrations

> **Living document.** Updated when integrations change, new services are added, or failure modes are discovered.

## Etherfuse (PIX On/Off-Ramp)

- **Endpoint**: `https://api.sand.etherfuse.com` (sandbox)
- **Auth**: API key format `api_<env>:<key>:<org_id>` via `ETHERFUSE_API_KEY` env
- **Client**: `backend/src/integrations/regional-starter-pack/anchors/etherfuse/EtherfuseClient.ts`
- **Features**: Customer registration (KYC), PIX on-ramp quotes + orders, off-ramp, webhook for PIX confirmation
- **Sandbox vs Prod**: Sandbox simulates PIX payments. No real BRL movement. KYC auto-approved.
- **Failure modes**: CPF validation errors, sandbox token minting lag (balance not credited), webhook timing issues
- **Config**: `ETHERFUSE_API_KEY`, `ETHERFUSE_BASE_URL`, `ETHERFUSE_WEBHOOK_SECRET`, `ETHERFUSE_BLOCKCHAIN=stellar`

## Stellar / Horizon

- **Endpoint**: `https://horizon-testnet.stellar.org` (testnet), `https://horizon.stellar.org` (mainnet)
- **Auth**: None for public queries. Secret keys for transaction signing.
- **Client**: `backend/src/config/stellar.ts` → `@stellar/stellar-sdk` Horizon Server
- **Features**: Account queries, pathfinding (strictSendPaths/strictReceivePaths), transaction building + submission, trustline management, Friendbot (testnet funding)
- **D1 watcher**: `backend/src/orchestration/stellarWatcher.ts` polls Horizon for `CONVERTING` normalized transfers that have a submitted tx hash. It confirms via Horizon and calls `TransferOrchestrator.confirmStellarSettlement`; it no longer fabricates settlement evidence.
- **Mainnet**: Infrastructure defined in `.env.mainnet.example`. Disabled by feature flags: `STELLAR_MAINNET_ENABLED=false`, `ENABLE_MAINNET_SETTLEMENT_VALIDATION=false`.
- **Failure modes**: Pathfinding empty (no trustline), Horizon 504 timeouts (handled with retry), testnet rate limiting
- **Config**: `STELLAR_NETWORK`, `STELLAR_HORIZON_URL`, `USDC_ISSUER`, `STELLAR_MAINNET_HORIZON_URL`

## OpenAI / NLU Agent

- **Endpoint**: OpenAI API (GPT-4o)
- **Auth**: `OPENAI_API_KEY` env
- **Client**: `@langchain/openai` (ChatOpenAI), `@langchain/langgraph` (StateGraph agent)
- **Features**: Intent routing, structured tool calling, multi-turn conversation
- **Failure modes**: NLU outage loop (need circuit breaker — pain point #36), inverted conversion direction (#26), wrong asset in messages (#19)
- **Config**: `OPENAI_API_KEY`, `OPENAI_MODEL=gpt-4o`

## DeFindex (Yield Vaults)

- **Endpoint**: `https://api.defindex.io`
- **Auth**: `DEFINDEX_API_KEY` env
- **Client**: `@defindex/sdk` (npm package)
- **Features**: USDC vault, CETES vault, deposit/withdraw, APY display
- **Failure modes**: API timeout (#13 — investments page failing), rate limits
- **Config**: `DEFINDEX_API_KEY`, `DEFINDEX_BASE_URL`, `DEFINDEX_NETWORK=testnet`, `DEFINDEX_USDC_VAULT`, `DEFINDEX_CETES_VAULT`

## Evolution API (WhatsApp)

- **Endpoint**: `http://localhost:8080` (local) or Railway-hosted
- **Auth**: `EVOLUTION_API_KEY` env
- **Client**: `backend/src/api/services/notifications/evolution.service.ts`
- **Features**: Inbound webhook processing, outbound message delivery, queue-based retry with exponential backoff, deduplication
- **Inbound queue**: `evolution_inbound_queue` table, deduplicated by instance:recipient:text_hash, max 8 retries
- **Outbound queue**: `evolution_outbound_queue` table
- **Failure modes**: Callback URL troubleshooting (see `WHATSAPP_EVOLUTION_CALLBACK_TROUBLESHOOTING.md`), message delivery failures
- **Config**: `EVOLUTION_API_URL`, `EVOLUTION_API_KEY`, `EVOLUTION_INSTANCE=main`

## Circle Mint (USD Payout Foundation)

- **Endpoint**: `https://api-sandbox.circle.com` by default for sandbox; `https://api.circle.com` for production
- **Auth**: Bearer API key via `CIRCLE_API_KEY`
- **Client**: `backend/src/api/services/usd-payout-adapters.ts` — `CircleCompatibilityAdapter`
- **Features**: Circle Mint `/v1/businessAccount/payouts` payload creation, linked bank destination ID support through env or protected request options, USDC settlement metadata on payout requests, sandbox/live execution gating, payout status polling, payout webhook normalization, redacted evidence storage
- **Routes**: `POST /api/transfers/:id/payout-instruction`, `POST /api/transfers/:id/payout-status-refresh`, `POST /api/transfers/payout-events/circle`, `GET /api/transfers/:id/payout-evidence`
- **Persistence**: `international_payout_instructions`, `international_payout_events`, `international_transfer_reconciliations`
- **Execution control**: Real Circle calls require `ENABLE_REAL_PAYOUT_EXECUTION=true`, `CIRCLE_API_KEY`, and a linked bank account ID in `CIRCLE_PAYOUT_DESTINATION_ID`, `payout_destination.providerDestinationId`, or protected request `circleDestinationId`
- **Wire-test evidence control**: `POST /api/transfers/wire-test/send` requires backend-held `CIRCLE_API_KEY`, a linked Circle destination from backend env/protected request, and a 64-character Stellar transaction hash. The frontend renders the returned `stellar_evidence.explorer` URL and does not store Circle credentials.
- **Verified state on 2026-06-16**: Backend env has sandbox API key, execution gate, source wallet, and linked wire destination. Non-mutating Circle API checks returned HTTP 200 for balances and wire-bank list, and the configured destination was found with status `complete`. TTS then created a Circle sandbox payout instruction for transfer `tr_d2_circle_stellar_payment_2`, persisted a provider response in `international_payout_instructions`, refreshed provider status to `completed`, and exposed payout evidence with `ready=true` and `execution_mode=sandbox_api`.
- **USDC rail**: `PIX_BRL_TO_STELLAR_USDC_TO_USD_BANK` metadata is persisted with `settlement_asset_code=USDC`, `off_ramp_source_asset_code=USDC`, and the Stellar settlement transaction hash.
- **Failure modes**: Missing linked bank account ID, insufficient Circle balance, payout `failed`, returned wires after `complete`, name mismatch at receiving bank, webhook secret mismatch
- **Config**: `PAYOUT_PROVIDER=circle`, `CIRCLE_API_KEY`, `CIRCLE_ENVIRONMENT`, `CIRCLE_API_BASE_URL`, `CIRCLE_PAYOUT_DESTINATION_ID`, `CIRCLE_PAYOUT_DESTINATION_TYPE=wire`, `CIRCLE_SOURCE_WALLET_ID`, `CIRCLE_PAYOUT_CREATE_URL`, `CIRCLE_PAYOUT_STATUS_URL`, `CIRCLE_PAYOUT_WEBHOOK_SECRET`, `PAYOUT_WEBHOOK_SECRET`, `PAYOUT_PROVIDER_TIMEOUT_MS`
- **Docs**: `backend/docs/CIRCLE_PAYOUT_FOUNDATION.md`, `backend/docs/CIRCLE_INTEGRATION_SETUP.md`; readiness command `npm --prefix backend run circle:payout-readiness`

## Bridge.xyz (PIX/ACH — Alternate Rail)

- **Endpoint**: Bridge.xyz API (Stripe-owned)
- **Auth**: `BRIDGE_API_KEY` env
- **Client**: `backend/src/integrations/bridge/` — service, client, types, config
- **Features**: PIX virtual accounts, ACH off-ramp, webhook for deposit confirmation; `/bridge-test` can read live VA balances by combining VA fields, destination Bridge wallet balances, and VA `/history` activity totals; `/bridge-test` also exposes a VA -> Bridge wallet -> Stellar wallet relationship endpoint plus Bridge-wallet-to-Stellar USDC transfer action; payout adapter currently remains compatibility-oriented while provider access is pending
- **Failure modes**: Virtual account setup failures, webhook signature validation, recent wire deposits not yet posted to VA activity
- **Config**: `BRIDGE_API_KEY`, `BRIDGE_WEBHOOK_SECRET`

## Resend (Email)

- **Endpoint**: Resend API
- **Auth**: `RESEND_API_KEY` env
- **Client**: `backend/src/api/services/` — email confirmation flow
- **Features**: Email confirmation codes, transactional emails
- **Config**: `RESEND_API_KEY`, `EMAIL_FROM`, `EMAIL_CONFIRMATION_TTL_SECONDS=600`

## Telegram

- **Endpoint**: Telegram Bot API
- **Auth**: `TELEGRAM_BOT_TOKEN` env
- **Client**: `backend/src/api/services/notifications/` — telegram notification service
- **Features**: Inbound messages, outbound notifications, inline keyboards
- **Failure modes**: 401 errors (see `docs/operations/telegram-401-runbook.md`)
- **Config**: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_NOTIFY_URL`

## Auth (Passkeys + Google OAuth)

- **Passkeys**: `@simplewebauthn/server` — WebAuthn/FIDO2
- **Google OAuth**: Google Identity Services
- **Config**: `PASSKEY_RP_ID=localhost`, `PASSKEY_ORIGIN=http://localhost:3000`, `JWT_SECRET`
