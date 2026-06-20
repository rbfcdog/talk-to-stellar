# Fraud Screening — StellarExpert Directory

## Overview

Before any outbound Stellar payment is confirmed, the destination address is checked against the StellarExpert public directory. This is a free, unauthenticated API that returns community-tagged labels for known Stellar addresses (exchanges, anchors, malicious actors, etc.).

The check is fail-open: if the API is unavailable or times out, the payment proceeds. A failed screen does not equal confirmed fraud.

---

## API

**Source:** `https://stellar.expert/api/explorer/directory/{address}`

No authentication required. Returns a JSON object with a `tags` array.

Known tags: `malicious`, `exchange`, `anchor`, `issuer`, and others.

---

## Implementation

### Files

```
backend/src/integrations/fraud-screening/
  service.ts   — core screening logic, in-memory cache, StellarExpert fetch
  index.ts     — exports
backend/src/api/controllers/fraud-screening.controller.ts
backend/src/api/routes/fraud-screening.router.ts
```

### ScreenResult shape

| Field | Type | Description |
|---|---|---|
| `address` | `string` | Stellar address checked |
| `tags` | `string[]` | Raw tags from StellarExpert |
| `blocked` | `boolean` | `true` if `malicious` tag present |
| `isMalicious` | `boolean` | Alias for `blocked` |
| `isExchange` | `boolean` | `true` if `exchange` tag present |
| `isAnchor` | `boolean` | `true` if `anchor` tag present |
| `warning` | `string` | Portuguese-language warning text shown to user |
| `note` | `string` | Internal note / reason string |

### Cache

Results are cached in memory with a 1-hour TTL. Cache is keyed by address. This avoids repeated calls to StellarExpert during a single session or when the same address is screened multiple times.

### Fail-open behavior

If `https://stellar.expert/api/explorer/directory/{address}` returns a non-2xx response, times out, or throws, `screenAddress()` returns `{ blocked: false, tags: [] }` with a note indicating the screening was skipped. The payment flow continues.

---

## API Endpoints

### GET /api/fraud-screen/address/:address

Screen a single Stellar address.

Query params:
- `network` — `mainnet` | `testnet` (default: `testnet`)

Response: `ScreenResult`

### GET /api/fraud-screen/domain/:domain

Screen by domain (looks up the Stellar address associated with a domain via federation or directory lookup).

Response: `ScreenResult`

### POST /api/fraud-screen/batch

Screen multiple addresses in one request.

Body:
```json
{ "addresses": ["G...", "G...", "G..."] }
```

Response: `ScreenResult[]`

---

## Integration with WhatsApp Payment Flow

Before the confirmation step of any outbound transfer:

1. Call `screenAddress(destinationAddress)`.
2. If `result.blocked === true`, abort the transfer and send `result.warning` to the user in Portuguese.
3. If `result.blocked === false` (including API failure / fail-open), proceed to confirmation.

```ts
const result = await screenAddress(destination);
if (result.blocked) {
  // abort — show result.warning to user
  return;
}
// proceed with payment
```

---

## Frontend Test Page

Route: `/fraud-screen-test`

Also exposed as Card 3 on the `/payment-link-test` page for quick manual verification.
