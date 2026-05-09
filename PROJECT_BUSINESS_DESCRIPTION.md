# TalkToStellar Business Description

## Executive Summary

TalkToStellar is a conversational payments product that lets people create or access a wallet, manage contacts, check balances, and approve payments through familiar chat-based experiences. The current product is designed around a wallet-first flow with external onboarding links, chat integrations, and secure transaction approval.

The business goal is simple: reduce the friction of sending and managing value by turning wallet actions into natural conversations and short approval flows.

## What The Product Does Today

The product currently supports the following end-user journeys:

- Create a new wallet from an onboarding link.
- Resume an existing wallet session from an external channel.
- Register and use a passkey for stronger approval flows.
- Use a password as an alternate approval method in the payment confirmation flow.
- Check wallet balances and recent activity.
- Save and look up contacts for faster payments.
- Prepare, confirm, sign, and submit Stellar payments.
- Route users from Telegram or WhatsApp-style entry points into the correct onboarding or confirmation flow.

## Main Business Value

TalkToStellar lowers the effort needed to move value. Instead of forcing users to learn crypto tooling, the product guides them through a small number of clear actions:

1. Start from a message, link, or chat bot.
2. Verify identity or confirm access.
3. Create or reuse the wallet.
4. Review payment details.
5. Approve the action with a passkey or password.

This makes the product easier to understand for non-technical users and easier to integrate into customer support, payments, and onboarding journeys.

## Current User Journeys

### Onboarding Journey

Users can enter the system through a dynamic onboarding URL. The flow currently supports:

- creating a new wallet and storing the secret securely
- linking the wallet to an external identity mapping
- optionally registering a passkey
- optionally setting a password for later payment approval

If the same Telegram or external account already exists but does not yet have a password or passkey, the product now treats that user as not fully onboarded and sends them through onboarding again.

### Payment Approval Journey

When a payment must be confirmed, the product presents a dedicated confirmation page. The user can approve the payment in two ways:

- with a passkey
- with a password, if one was set during onboarding

This gives the product a flexible approval model while keeping the final payment authorization explicit.

### Chat-Based Wallet Journey

The chat layer can receive wallet-related messages and forward them into the backend agent. The current experience supports:

- sending queries from Telegram
- validating whether the sender already has an account
- redirecting incomplete users back to onboarding
- forwarding valid users to the wallet assistant

## Current Feature Set

### Wallet and Account Features

- Wallet creation
- Wallet reuse from existing external mappings
- Secure secret storage through Vault
- Session-based wallet context
- External account linking

### Authorization Features

- Passkey registration and authentication
- Password-backed payment approval
- Authorization required before payment submission
- Re-onboarding when no credential exists yet

### Money Movement Features

- Payment preparation
- Payment confirmation
- Stellar transaction signing and submission
- Balance checking
- Recent transaction history
- Asset conversion and quote flows in the agent layer

### Contact Features

- Create contacts
- List contacts
- Resolve payment recipients by saved contact
- Seed starter contacts for new users

### Chat and Channel Features

- Telegram bot integration
- WhatsApp/Twilio webhook surface
- Link-based onboarding from external messages
- Chat-to-wallet handoff through the backend agent

## Integrations

### Backend Core

The backend is the main orchestration layer. It connects wallet creation, authorization, contact lookup, and payment submission.

### Frontend

The Next.js frontend handles the user-facing onboarding and payment confirmation pages. It is the main place where users complete account setup or approve a payment.

### Telegram

Telegram is currently used as a chat entry point. It checks whether the sender already has an account and either forwards them to the wallet assistant or sends them back to onboarding.

### Twilio / WhatsApp

The Twilio webhook service provides a separate channel for messaging and webhook testing. It shows that the product can be surfaced through WhatsApp-style experiences as well.

### Supabase

Supabase is used as the persistent data layer for sessions, wallets, contacts, external mappings, passkeys, and transaction state.

### Stellar Network

The product signs and submits Stellar transactions, checks balances, and works with Stellar-based assets and payment flows.

### Vault

Wallet secrets are stored in Vault rather than being kept in plain text.

### Passkeys and Passwords

The product supports passkey flows and password-backed approval for confirmation steps.

### External Token-Based Links

The product relies on signed links for onboarding and payment confirmation, which makes it easy to move users from chat or another surface into a secure browser flow.

## Operational Shape

The repository is organized as a multi-surface product rather than a single app:

- backend API for wallet and payment orchestration
- frontend app for onboarding and confirmation screens
- Telegram integration for chat-driven acquisition and support
- Twilio webhook service for messaging surfaces
- shared database and secret-storage dependencies

This setup makes the product easy to expand into new channels without rewriting the wallet core.

## Business Readiness Today

What is already in place:

- A clear onboarding flow
- A secure secret storage path
- Chat-based entry points
- Secure payment approval paths
- Contact management
- Stellar transaction execution
- Clear separation between public-facing screens and backend signing logic

What is still worth improving next:

- A single unified notion of user identity across all channels
- Clearer recovery and reset flows for passwords and passkeys
- More explicit lifecycle handling for already-onboarded external accounts
- Stronger business analytics around onboarding conversion and payment completion
- Better documentation for channel-specific setup and operations

## Best Short Description For Another LLM

TalkToStellar is a chat-first Stellar wallet product with secure onboarding, contact management, payment preparation, and payment approval through passkeys or passwords. It integrates a Next.js frontend, a TypeScript/Express backend, Supabase persistence, Vault secret storage, Telegram messaging, Twilio/WhatsApp surfaces, and Stellar transaction signing.

## Suggested Files To Review

- [backend/src/api/controllers/external-finalize.controller.ts](backend/src/api/controllers/external-finalize.controller.ts)
- [backend/src/api/controllers/external.controller.ts](backend/src/api/controllers/external.controller.ts)
- [backend/src/services/passkey.service.ts](backend/src/services/passkey.service.ts)
- [frontend/stellar-chat/app/create-account/create-account-client.tsx](frontend/stellar-chat/app/create-account/create-account-client.tsx)
- [frontend/stellar-chat/app/confirm-payment/confirm-payment-client.tsx](frontend/stellar-chat/app/confirm-payment/confirm-payment-client.tsx)
- [telegram/src/bot.js](telegram/src/bot.js)
- [twilio-webhook/server.js](twilio-webhook/server.js)