# Talk To Stellar Technical Description

## Overview

Talk To Stellar is a multi-service product that combines a chat-driven Stellar wallet assistant, an external account onboarding flow, and payment authorization flows based on either passkeys or password-backed sessions.

The repository is organized as a platform rather than a single app. It contains an API backend, a Next.js frontend, a Telegram integration, and a Twilio/WhatsApp webhook service. The backend coordinates wallet creation, contact management, payment preparation, passkey registration, and transaction signing against Stellar testnet. The frontend provides the user-facing onboarding and payment confirmation screens.

## Top-Level Services

### Backend

The backend is a TypeScript and Express API under `backend/`. It is the main application core.

It provides:

- account onboarding and session creation
- wallet creation and Vault-backed secret storage
- contact CRUD and lookup
- Stellar balance and transaction helpers
- passkey registration and authentication flows
- external payment confirmation and settlement flows
- agent-oriented endpoints for chat-driven wallet actions

### Frontend

The frontend lives under `frontend/stellar-chat/` and is a Next.js app.

It provides:

- the onboarding page used from dynamic links
- the payment confirmation page used from dynamic links
- landing and chat UI components
- passkey registration and confirmation UX

### Telegram

The `telegram/` package is a separate bot integration. It appears to mediate chat-based interactions and health checks.

### Twilio / WhatsApp

The `twilio-webhook/` service is a separate integration for webhooks and public HTML surfaces.

### Blindpay

`blindpay/` is a small Node package used by the workspace, likely for payment-related helpers or integration glue.

## Core Backend Architecture

### Entry Points

- `backend/src/server.ts` boots the HTTP server.
- `backend/src/app.ts` wires Express middleware and route modules.
- `backend/src/api/routes/` contains the primary HTTP endpoints.
- `backend/src/agent/` contains the chat and agent workflow and tool routing.

### Important Route Groups

- `/api/actions/*` for authenticated wallet and Stellar utility endpoints.
- `/api/passkeys/*` for passkey registration and login or transaction authorization.
- `/api/external/*` for onboarding and external payment confirmation flows.
- `/api/agent/*` for chat and session-driven actions.

### Key Backend Services

- `backend/src/services/passkey.service.ts` owns WebAuthn registration and authentication challenges, challenge storage, and transaction authorization.
- `backend/src/api/services/user.service.ts` handles user onboarding, wallet creation, and starter contact seeding.
- `backend/src/api/services/stellar.service.ts` wraps Stellar account, XDR, and submission logic.
- `backend/src/services/vault.service.ts` stores and retrieves secret keys.
- `backend/src/repositories/*` and `backend/src/api/repository/*` wrap Supabase access for wallets, users, contacts, operations, sessions, and external mappings.

## Data Model

The backend relies on Supabase and Postgres, with the complete schema defined in `backend/migrations/20260613_00_full_schema.sql`.

Core tables include:

- `agent_sessions` for user sessions and wallet context
- `wallets` for stored wallet metadata and Vault secret references
- `operations` for transaction history and status tracking
- `agent_states` for stateful agent orchestration
- `agent_messages` for conversation history
- `external_accounts` for provider account mappings
- `contacts` for wallet address book entries
- `user_passkeys` for WebAuthn credentials
- `passkey_challenges` for passkey auth challenges

## Authentication Model

The project is passkey-first, but the payment confirmation flow now supports two authorization modes:

- passkey/WebAuthn challenge-response
- password-backed session authorization

The password fallback is stored on the `agent_sessions` record as a hash and is intended to replace passkey approval only when the account was created with a password.

This matters because the repository has more than one account system:

- external onboarding uses `agent_sessions` and `wallets`
- the broader API login path uses the `users` table

## Frontend Flows

### Onboarding

`frontend/stellar-chat/app/create-account/` loads a tokenized onboarding URL, finalizes the account via `/api/external/finalize`, and can optionally register a passkey afterward.

It also accepts an optional password that can later be used for payment confirmation.

### Payment Confirmation

`frontend/stellar-chat/app/confirm-payment/` loads a signed payment token, resolves the payment details, and confirms the transaction.

It can now authorize the payment with either:

- a passkey challenge via `@simplewebauthn/browser`
- an account password entered directly on the page

## External Payment Flow

The payment confirmation pipeline is:

1. The backend issues a tokenized payment link.
2. The frontend loads the confirmation page and decodes the token for display.
3. The frontend requests authorization options from `/api/passkeys/auth-init` when passkeys are used.
4. The frontend sends the signed response or password to `/api/external/finalize`.
5. The backend validates the authorization, loads the wallet secret from Vault, builds the unsigned XDR, signs it, and submits it to Stellar.

## Technology Stack

- TypeScript
- Express
- Next.js
- Supabase/Postgres
- Stellar SDK
- `@simplewebauthn/server` and `@simplewebauthn/browser`
- JSON Web Tokens
- Vault-backed secret storage
- Jest for backend tests

## Operational Notes

- The backend uses environment variables for JWT, Supabase, Stellar, frontend URLs, and passkey origin or RP settings.
- The project appears to target Stellar testnet in several helper paths.
- The repository includes Docker Compose files and Dockerfiles for the backend and frontend.

## Latest Upgrades Implemented

### Asset-Aware Payment Confirmation

- `prepare_payment_confirmation` now carries destination-asset metadata (`destAsset`) in the payment token.
- The backend finalize flow differentiates XLM vs non-native destination assets and builds path payment XDR when needed.
- Confirmation text no longer hardcodes XLM for all cases.

### Quote Transparency (Fees and Slippage)

- For cross-asset transfers, the backend can attach a `payment_quote` into the token.
- The confirmation page renders quote details, network fee, and estimated conversion loss/slippage.

### Phone-First Identity Continuity

- External IDs for WhatsApp/phone are normalized to digits-only.
- Canonical phone mapping is created in `external_accounts` to improve session continuity across channels/devices.
- Account checks can fall back from `whatsapp` to canonical `phone` mapping.

### Contact Growth and Lookup

- Contact invite links are generated via backend tokenized onboarding links.
- Invite onboarding auto-creates a contact record for the inviter.
- Contacts now support `phone_number` and `pix_key` and recipient resolution supports name/phone/PIX lookup.

### Recovery Flow via WhatsApp OTP

- Added endpoints:
	- `POST /api/external/recovery-init`
	- `POST /api/external/recovery-complete`
- Added `recovery_otps` persistence for OTP lifecycle (expiry/attempts/used).

### BRL Snapshot in Operation History

- `operations` now supports `amount_brl` and `amount_usdc` snapshots.
- Payment execution persists snapshot values when available.
- Agent history aggregation includes stored operation values to present BRL-centric transaction context.

## Improvement Ideas For Another Model

- Unify the authentication model so there is one explicit notion of account identity across `agent_sessions`, `users`, and external mappings.
- Add password change, reset, and revocation flows if password-backed sessions remain supported.
- Move authorization mode selection into a shared backend contract so the frontend does not infer too much about passkey availability.
- Add focused tests around payment authorization fallback behavior, especially passkey versus password branches.
- Audit the overlapping session and token concepts and document which token is authoritative for each user journey.
- Extract shared validation and password utilities into dedicated modules if more auth pathways are added later.

## Suggested Entry Files For Exploration

- `backend/src/app.ts`
- `backend/src/services/passkey.service.ts`
- `backend/src/api/controllers/external-finalize.controller.ts`
- `backend/src/api/services/user.service.ts`
- `frontend/stellar-chat/app/create-account/create-account-client.tsx`
- `frontend/stellar-chat/app/confirm-payment/confirm-payment-client.tsx`
