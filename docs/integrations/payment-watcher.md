# Payment Watcher Integration

## Overview

Singleton service that maintains long-lived Horizon SSE (Server-Sent Events) connections for every wallet stored in the database. When a USDC or XLM payment arrives, it resolves the wallet owner's WhatsApp phone number and sends a push notification via the Evolution API.

## How It Works

On boot, `paymentWatcher.start()` loads all wallet public keys from the database and opens one SSE stream per address against the Horizon `/accounts/:id/payments?cursor=now` endpoint.

When a payment event arrives:

1. Filters to USDC and XLM only. Other assets are silently ignored.
2. Resolves the phone number via one of two lookup paths:
   - `wallets.public_key` → `wallets.session_id` → `agent_sessions.phone_number`
   - `user_stellar_wallets.user_id` → `agent_sessions.phone_number`
3. Sends a WhatsApp message using a raw `fetch` call to the Evolution API.

On SSE error, the connection is closed and re-opened automatically after a 30-second delay.

## Files

| File | Role |
|------|------|
| `backend/src/integrations/payment-watcher/service.ts` | Core SSE logic, phone lookup, Evolution API call |
| `backend/src/integrations/payment-watcher/index.ts` | Exports singleton `paymentWatcher` instance |
| `backend/src/api/controllers/payment-watcher.controller.ts` | Request handlers for status/subscribe/unsubscribe |
| `backend/src/api/routes/payment-watcher.router.ts` | Route registration |

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/payment-watcher/status` | Returns count of active watchers and list of watched addresses |
| `POST` | `/api/payment-watcher/subscribe` | Body: `{ publicKey: string }` — opens an SSE connection for the address |
| `DELETE` | `/api/payment-watcher/unsubscribe/:publicKey` | Closes and removes the SSE connection for the address |

## Auto-Subscribe

`stellar-wallets.controller.ts` calls `paymentWatcher.subscribe(publicKey)` immediately after a wallet is created in the database. No manual registration is required for new wallets.

## Boot Sequence

`app.ts` calls `paymentWatcher.start()` at startup. This queries all wallet public keys from the database and calls `subscribe()` for each one.

## Reconnect Behavior

If an SSE stream emits an error, the service closes the connection and schedules a re-open after 30 seconds.

## Required Environment Variables

| Variable | Purpose |
|----------|---------|
| `EVOLUTION_API_URL` | Base URL of the Evolution API instance |
| `EVOLUTION_INSTANCE` | Evolution instance name |
| `EVOLUTION_API_KEY` | API key for Evolution authentication |
| `STELLAR_NETWORK` | `testnet` or `mainnet` — determines which Horizon endpoint to use |

## Asset Filtering

Only `USDC` and `XLM` payments trigger a WhatsApp notification. Payments in any other asset are received but discarded without side effects.

## Phone Number Lookup

Two lookup paths are tried in order:

1. `wallets.public_key` → `wallets.session_id` → `agent_sessions.phone_number`
2. `user_stellar_wallets.user_id` → `agent_sessions.phone_number`

If neither path resolves a phone number, the notification is skipped and a warning is logged.
