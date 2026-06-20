# Payment Links Integration (SEP-7)

## Overview

Generates SEP-7 `web+stellar:pay?...` URIs wrapped in short HTTPS URLs for easy sharing in WhatsApp. Recipients tap the link, are redirected to the SEP-7 URI, and their Stellar wallet app opens with the payment pre-filled.

Primary use case: merchants sharing payment requests in WhatsApp groups.

## URI Format

```
web+stellar:pay?destination=G...&amount=10&asset_code=USDC&asset_issuer=GA5Z...&memo=label
```

On testnet, `network_passphrase=Test%20SDF%20Network%20%3B%20September%202015` is appended automatically. On mainnet the passphrase is omitted.

XLM payments omit `asset_code` and `asset_issuer`. For USDC the issuer defaults to the mainnet Circle issuer (`GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN`) if none is provided.

## Files

| File | Role |
|------|------|
| `backend/src/integrations/payment-links/types.ts` | `CreatePaymentLinkInput` and `Sep7PaymentLink` types |
| `backend/src/integrations/payment-links/service.ts` | `PaymentLinksService` — URI builder and DB CRUD |
| `backend/src/integrations/payment-links/index.ts` | Re-exports service |
| `backend/src/api/controllers/payment-links.controller.ts` | Request handlers |
| `backend/src/api/routes/payment-links.router.ts` | Route registration |

## Service Methods

| Method | Signature | Description |
|--------|-----------|-------------|
| `buildSep7Uri` | `(input: CreatePaymentLinkInput) → string` | Constructs the `web+stellar:pay?...` URI. Does not write to DB. |
| `create` | `(input) → Promise<Sep7PaymentLink>` | Generates a 12-char UUID-derived ID, builds the URI, constructs the short URL (`{APP_BASE_URL}/pay/{id}`), inserts into `payment_links`, returns the row. |
| `get` | `(id: string) → Promise<Sep7PaymentLink | null>` | Fetches one link by ID. |
| `recordUse` | `(id: string) → Promise<void>` | Calls the `increment_payment_link_use` Supabase RPC function. Best-effort, non-blocking. |
| `list` | `(stellarAddress, limit?) → Promise<Sep7PaymentLink[]>` | Returns up to `limit` (default 20) links for a given `stellar_address`, newest first. |
| `delete` | `(id: string) → Promise<void>` | Deletes a link by ID. |

`APP_BASE_URL` is resolved from `NEXT_PUBLIC_BACKEND_URL` → `APP_URL` → `https://talktostellar.com`.

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/pay-links` | Create a link. Body: `{ destination, amount, asset_code, asset_issuer, memo, label, created_by }` |
| `GET` | `/api/pay-links/:id` | Fetch a single link by ID |
| `GET` | `/api/pay-links` | List links. Query param: `address` (stellar address) |
| `DELETE` | `/api/pay-links/:id` | Delete a link |
| `GET` | `/api/pay-links/:id/redirect` | 302 redirect to the SEP-7 URI; increments the `times_used` counter |

## Database

Table: `payment_links`

Migration: `20260620_01_integrations.sql` (migration #8)

Key columns: `id` (12-char string PK), `stellar_address`, `amount`, `asset_code`, `asset_issuer`, `memo`, `memo_type`, `label`, `message`, `uri`, `short_url`, `expires_at`, `times_used`, `created_at`.

`times_used` is incremented via the `increment_payment_link_use` Postgres function (called through Supabase RPC) every time the redirect endpoint is hit.

## WhatsApp Flow

1. User asks the agent (or calls the API) to create a payment link.
2. Service returns the `short_url` (`https://talktostellar.com/pay/{id}`).
3. User copies the short URL and pastes it into a WhatsApp chat or group.
4. Recipient taps the link → hits `GET /api/pay-links/:id/redirect` → 302 to the SEP-7 URI.
5. Mobile OS hands off the `web+stellar:` URI to the installed Stellar wallet app.
6. Wallet opens with destination, amount, and memo pre-filled.

## Environment Variables

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_BACKEND_URL` or `APP_URL` | Base URL used to construct `short_url`. Defaults to `https://talktostellar.com`. |
| `STELLAR_NETWORK` | `testnet` or `mainnet` — controls whether `network_passphrase` is included in the URI |
