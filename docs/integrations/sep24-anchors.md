# SEP-24 Anchor Integration

## What it does

Connects to Stellar anchor services that offer **interactive deposit/withdrawal** (SEP-24). The primary anchor is **MoneyGram** — 350k+ cash locations worldwide. Users can:

- **Deposit**: Walk into a MoneyGram, pay cash → USDC lands in their Stellar wallet
- **Withdraw**: Send USDC from Stellar → get cash at any MoneyGram

Other supported anchors: Vibrant (ARS), Anclap (ARS/BRL).

## Protocol stack

| SEP | Purpose | Endpoint |
|-----|---------|----------|
| SEP-1 | Anchor metadata (TOML) | `https://<domain>/.well-known/stellar.toml` |
| SEP-10 | Auth challenge/verify | `WEB_AUTH_ENDPOINT` from TOML |
| SEP-24 | Interactive deposit/withdrawal | `TRANSFER_SERVER_SEP0024` from TOML |

## Backend architecture

```
backend/src/integrations/sep24/
  types.ts    — SEP-1/10/24 type definitions
  config.ts   — known anchors, env config
  client.ts   — HTTP client (TOML, SEP-10, SEP-24 calls)
  service.ts  — orchestration (auth flow, DB persistence)
  index.ts    — barrel exports

backend/src/api/controllers/sep24.controller.ts
backend/src/api/routes/sep24.router.ts
```

Mounted at: `GET|POST /api/sep24/*`

## API endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/sep24/anchors` | List known anchors |
| GET | `/api/sep24/anchors/:domain/toml` | Fetch anchor TOML |
| GET | `/api/sep24/anchors/:domain/info` | TOML + SEP-24 info (assets, fees) |
| POST | `/api/sep24/auth` | SEP-10 challenge/sign/verify → JWT |
| POST | `/api/sep24/deposit` | Start interactive deposit flow |
| POST | `/api/sep24/withdraw` | Start interactive withdrawal flow |
| GET | `/api/sep24/transactions` | List anchor transactions for user |
| GET | `/api/sep24/transactions/:id` | Get single transaction + sync to DB |

## Frontend test page

`/anchor-test` — four-step flow:
1. Select anchor (MoneyGram, Vibrant, Anclap, or custom domain)
2. Fetch TOML + supported assets
3. SEP-10 authenticate (provide Stellar keypair)
4. Start deposit or withdrawal → opens anchor's interactive UI in new tab
5. Monitor transaction status

## Migration

```bash
psql <database_url> -f backend/migrations/20260620_00_sep24_wallet_auth.sql
```

Creates:
- `anchor_sessions` — SEP-10 JWT per user per anchor (upserted on auth)
- `anchor_transactions` — SEP-24 tx state synced from anchor API

## Environment variables

No new env vars required beyond what's already set. Uses `STELLAR_WALLET_SPONSOR_SECRET` for the server signing key if needed.

## Known anchors

| Name | Domain | Assets | Notes |
|------|--------|--------|-------|
| MoneyGram | `stellar.moneygram.com` | USDC | 350k+ locations, requires KYC |
| Vibrant | `vibrant.io` | USDC | Argentine peso on/off-ramp |
| Anclap | `www.anclap.com` | USDC, ARS | ARS/BRL |

## Testing

1. Run migration
2. Open `/anchor-test`
3. Select MoneyGram → click **Fetch TOML + Info**
4. Enter a Stellar testnet keypair → **Authenticate**
5. Click **Deposit** or **Withdraw** → anchor interactive UI opens
6. Complete the anchor's KYC/form flow
7. Transaction appears in history with status updates

## Notes

- MoneyGram requires KYC on their side before allowing cash transactions
- `user_secret` is only sent in this test UI — production wallets (Freighter etc.) sign the SEP-10 challenge client-side
- The JWT from SEP-10 is anchor-specific — one per anchor domain per user
