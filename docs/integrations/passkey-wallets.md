# Passkey Smart Wallets

Soroban smart contract wallets secured by WebAuthn (Face ID, Touch ID, or hardware security keys). No seed phrase. Users authenticate with device biometrics; fee sponsoring via Launchtube eliminates the need to hold XLM.

Built on `passkey-kit` by kalepail. Validated at Meridian Pay with 1,000+ users and 50%+ reduction in seed-loss support tickets.

---

## Architecture

### Client/Server Split

**Browser (client)**

- `navigator.credentials.create()` — registers a new WebAuthn credential and deploys the smart wallet contract
- `navigator.credentials.get()` — signs a Stellar transaction XDR using the stored credential
- The browser produces two artifacts: `keyIdBase64` (credential ID, base64url-encoded) and `contractId` (Soroban contract address on Stellar)

**Server**

- `PasskeyServer` from `passkey-kit` handles contract lookup and relay coordination
- Launchtube (`launchtube.xyz`) sponsors transaction fees — the user's wallet pays no XLM
- The backend stores the `(keyIdBase64, contractId, userId)` association in the database

### Transaction Flow

1. User taps "Create Wallet" on `/passkey-wallet-test`
2. Browser calls `navigator.credentials.create()`, receives `keyId` and `contractId`
3. Frontend POSTs `{ user_id, contract_id, key_id_base64, label? }` to `/api/passkey-wallets/register`
4. To send a payment: client builds the unsigned XDR, calls `navigator.credentials.get()` to sign it, then POSTs `{ signedXdr }` to `/api/passkey-wallets/relay`
5. Backend submits via Launchtube — no fees charged to the user

---

## Source Files

| File | Purpose |
|---|---|
| `backend/src/integrations/passkey-wallets/types.ts` | `PasskeyWalletRecord`, `PasskeyWalletCreateInput` |
| `backend/src/integrations/passkey-wallets/service.ts` | `register()`, `getContractId()`, `relayTransaction()`, `getBalance()`, `getSigners()` |
| `backend/src/api/controllers/passkey-wallets.controller.ts` | Request handling |
| `backend/src/api/routes/passkey-wallets.router.ts` | Route definitions |
| `backend/migrations/20260620_01_integrations.sql` | `passkey_wallets` table |

---

## Types

```ts
interface PasskeyWalletRecord {
  id: string;
  user_id?: string;
  email?: string;
  contract_id: string;      // Soroban smart wallet contract address
  key_id_base64: string;    // WebAuthn credential ID (base64url)
  network: string;          // "testnet" | "mainnet"
  label?: string;
  funded: boolean;
  created_at: string;
}

interface PasskeyWalletCreateInput {
  user_id?: string;
  email?: string;
  contract_id: string;
  key_id_base64: string;
  network: string;
  label?: string;
}
```

---

## Database Schema

Table: `passkey_wallets`

| Column | Type | Notes |
|---|---|---|
| `contract_id` | `TEXT PRIMARY KEY` | Soroban contract address |
| `user_id` | `TEXT NOT NULL` | Application user reference |
| `key_id_base64` | `TEXT` | WebAuthn credential ID |
| `label` | `TEXT` | Optional user-facing wallet name |
| `funded` | `BOOLEAN DEFAULT false` | Whether the contract account has been funded |
| `created_at` | `TIMESTAMPTZ` | |

Migration: `backend/migrations/20260620_01_integrations.sql`

---

## API Endpoints

### Register wallet

```
POST /api/passkey-wallets/register
```

Body:
```json
{
  "user_id": "string",
  "contract_id": "string",
  "key_id_base64": "string",
  "label": "string (optional)"
}
```

Stores the `(keyId, contractId, userId)` association after WebAuthn credential creation on the client.

---

### Look up contract ID by key ID

```
GET /api/passkey-wallets/contract-id?keyId=<base64url>
```

Resolves a `contractId` from a `keyId`. Queries `PasskeyServer` first, falls back to the database.

Response:
```json
{ "contractId": "string" }
```

---

### Relay signed transaction

```
POST /api/passkey-wallets/relay
```

Body:
```json
{ "signedXdr": "string" }
```

Submits the WebAuthn-signed Stellar XDR via Launchtube. User pays no fees.

Response:
```json
{ "success": true, "hash": "string" }
```

---

### Get wallet balance

```
GET /api/passkey-wallets/:contractId/balance
```

Returns XLM and USDC balances fetched from Horizon.

---

### Get WebAuthn signers

```
GET /api/passkey-wallets/:contractId/signers
```

Lists the WebAuthn credentials registered as signers on the smart wallet contract.

---

### List wallets for a user

```
GET /api/passkey-wallets?userId=<string>
```

Returns all `PasskeyWalletRecord` rows for the given user.

---

## Environment Variables

| Variable | Required | Default | Notes |
|---|---|---|---|
| `LAUNCHTUBE_URL` | No | `https://launchtube.xyz` (mainnet) or `https://launchtube.xyz/testnet` | Fee relay endpoint |
| `LAUNCHTUBE_JWT` | Yes | — | Auth token for Launchtube; obtain from launchtube.xyz |
| `STELLAR_NETWORK` | No | — | `mainnet` uses `sorobanrpc.com`; `testnet` uses `soroban-testnet.stellar.org` |

---

## Frontend Test Page

`/passkey-wallet-test` — end-to-end test page covering wallet creation, signing, and relay.

---

## Key Properties

- No seed phrase. Credential private key never leaves the device's secure enclave.
- Passkey is bound to the device and domain (origin). A credential created on `app.example.com` cannot be used on a different origin.
- Launchtube fee sponsoring means users can transact without holding any XLM.
- Smart wallet contracts support multiple signers — a user can register additional devices as co-signers via `getSigners()`.
