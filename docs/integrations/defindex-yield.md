# DeFindex Yield Integration

## Overview

DeFindex is a yield-routing layer built on top of Blend Protocol on Stellar. It enables non-custodial USDC yield (~8.6% APY as of June 2026, source: DefiLlama) without the backend ever holding user funds.

Retention precedent: Meru wallet saw measurable user retention improvement after surfacing daily yield notifications.

---

## Architecture

The backend's only role is XDR construction. Funds never touch the backend.

```
User request
  → Backend builds unsigned XDR via @defindex/sdk
  → XDR returned to user / frontend
  → User signs in their Stellar wallet
  → Signed XDR submitted to Stellar network (by user or backend)
```

---

## SDK

Package: `@defindex/sdk` v0.3.0

```ts
import { DefindexSDK } from '@defindex/sdk';

const sdk = new DefindexSDK({
  apiKey: process.env.DEFINDEX_API_KEY,         // optional
  baseUrl: process.env.DEFINDEX_API_URL,         // default: https://api.defindex.io
  defaultNetwork: 'mainnet' | 'testnet',
});
```

### DepositParams

```ts
{
  caller: string;      // user's Stellar public key
  amounts: number[];   // in stroops (1 USDC = 10_000_000)
  invest: boolean;     // true to immediately route to strategy
}
```

### WithdrawParams

```ts
{
  caller: string;
  amounts: number[];   // in stroops
}
```

All amounts are in stroops. 1 USDC = 10,000,000 stroops.

---

## Configuration

### Env vars

| Var | Required | Default | Description |
|---|---|---|---|
| `DEFINDEX_API_KEY` | No | — | API key (free tier available) |
| `DEFINDEX_API_URL` | No | `https://api.defindex.io` | API base URL |
| `STELLAR_NETWORK` | Yes | `testnet` | `mainnet` or `testnet` |

### Vault addresses

| Network | Address |
|---|---|
| Mainnet | `CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYW` |
| Testnet | `CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYW` |

Verify current vault addresses at `https://api.defindex.io/vaults`.

---

## Files

```
backend/src/integrations/defindex/
  config.ts    — DefindexConfig interface, vault constants, loadDefindexConfig()
  service.ts   — SDK wrapper, deposit/withdraw XDR builders, balance/info fetchers
  index.ts     — exports
backend/src/api/controllers/defindex.controller.ts
backend/src/api/routes/defindex.router.ts
```

---

## API Endpoints

### GET /api/defindex/vaults

Health check. Returns available vaults from the DeFindex API.

### GET /api/defindex/vault/info

Query params: `vault=<ADDRESS>`

Also available as: `GET /api/defindex/vaults/:vault/info`

Returns vault APY, TVL, and active strategy details.

### GET /api/defindex/vault/balance

Query params: `userAddress=G...`

Returns the user's current USDC position in the vault (shares converted to USDC).

### POST /api/defindex/vault/deposit

Body:
```json
{
  "userAddress": "G...",
  "amountStroops": 10000000
}
```

Returns:
```json
{ "xdr": "<unsigned XDR string>" }
```

User must sign and submit the XDR to Stellar network.

### POST /api/defindex/vault/withdraw

Body:
```json
{
  "userAddress": "G...",
  "sharesAmount": 9950000
}
```

Returns:
```json
{ "xdr": "<unsigned XDR string>" }
```

---

## WhatsApp Daily Notification

When a user holds a position in the vault, a daily message surfaces their yield:

> "Você ganhou R$0,65 hoje com seu USDC 💰"

The backend fetches the user's balance delta to compute the daily earnings and formats them in BRL.

---

## Frontend Test Page

Route: `/yield-test`

Manual deposit/withdraw form for verifying XDR generation and wallet signing flow end-to-end.
