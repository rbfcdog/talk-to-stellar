# Stellar Wallets Kit — Multi-Wallet Auth

## What it does

Implements **SEP-10 wallet authentication** for our own backend — any Stellar wallet can authenticate without a password:

- Freighter (browser extension)
- Albedo (web-based, no extension)
- xBull (extension + mobile)
- LOBSTR (mobile + browser)
- WalletConnect (QR-based)

The wallet signs a server-issued challenge transaction → server issues a JWT → JWT used for authenticated API calls.

## Protocol

SEP-10 is Stellar's standard for proving control of a Stellar account without a password:

```
Client                          Server
  |                               |
  |  GET /challenge?account=G..   |
  |  <—————————————————————————   |  Server builds tx with random nonce, signs with server key
  |                               |
  |  (wallet signs the tx)        |
  |                               |
  |  POST /verify {signed XDR}   |
  |  ————————————————————————>    |
  |                               |  Verify client signed + server signed → issue JWT
  |  <— { token, expires_at }     |
```

## Backend architecture

```
backend/src/integrations/stellar-wallets-auth/
  types.ts    — challenge/session/result types
  service.ts  — buildChallenge(), verifyChallenge(), verifyToken(), getSession()
  index.ts    — barrel exports

backend/src/api/controllers/wallet-auth.controller.ts
backend/src/api/routes/wallet-auth.router.ts
```

Mounted at: `GET|POST /api/wallet-auth/*`

## API endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/wallet-auth/challenge?account=G...` | Get SEP-10 challenge XDR |
| POST | `/api/wallet-auth/verify` | Submit signed XDR → get JWT |
| GET | `/api/wallet-auth/session?account=G...` | Check existing session |
| POST | `/api/wallet-auth/validate` | Validate a JWT token |

### POST /api/wallet-auth/verify body

```json
{
  "transaction": "<signed XDR base64>",
  "stellar_address": "GABCDE...",
  "wallet_type": "freighter"
}
```

Returns:

```json
{
  "authenticated": true,
  "stellar_address": "GABCDE...",
  "token": "<JWT>",
  "expires_at": "2026-06-21T..."
}
```

## Frontend test page

`/wallet-connect-test` — two-step flow:
1. Select wallet type (UI-only label for now)
2. Enter your Stellar address → **Get challenge** → copy XDR
3. Sign XDR in your wallet (or [Stellar Lab](https://laboratory.stellar.org/#txsigner))
4. Paste signed XDR → **Verify** → get JWT
5. **Validate token** button confirms the JWT works

## Migration

```bash
psql <database_url> -f backend/migrations/20260620_00_sep24_wallet_auth.sql
```

Creates:
- `wallet_auth_sessions` — JWT per stellar address (upserted on verify)

## Environment variables

| Variable | Required | Purpose |
|----------|----------|---------|
| `STELLAR_WALLET_SPONSOR_SECRET` | Yes | Server signing key for SEP-10 challenge |
| `JWT_SECRET` or `SUPABASE_JWT_SECRET` | Recommended | JWT signing key |
| `APP_DOMAIN` | Optional | Embedded in challenge as `web_auth_domain` |

## Testing

1. Run migration
2. Open `/wallet-connect-test`
3. Enter any Stellar testnet address → **Get challenge**
4. Copy XDR → open Stellar Lab link → sign with your testnet secret
5. Paste signed XDR → **Verify & get token**
6. Click **Validate token** — should show your address and wallet type

## Production integration (Freighter example)

```typescript
import { isConnected, getPublicKey, signTransaction } from '@stellar/freighter-api';

// 1. Get challenge
const { transaction, network_passphrase } = await fetch('/api/wallet-auth/challenge?account=' + publicKey).then(r => r.json());

// 2. Sign with Freighter
const { signedTransaction } = await signTransaction(transaction, { network: 'TESTNET', accountToSign: publicKey });

// 3. Verify
const { token } = await fetch('/api/wallet-auth/verify', {
  method: 'POST',
  body: JSON.stringify({ transaction: signedTransaction, stellar_address: publicKey, wallet_type: 'freighter' }),
}).then(r => r.json());

// 4. Use token in Authorization header
fetch('/api/sep24/deposit', { headers: { Authorization: 'Bearer ' + token }, ... });
```

## Notes

- Sessions are upserted per address — re-authenticating invalidates the old JWT in the DB
- JWT TTL: 24 hours
- The `@creit-tech/stellar-wallets-kit` npm package wraps all wallet adapters and can replace manual signing in production
