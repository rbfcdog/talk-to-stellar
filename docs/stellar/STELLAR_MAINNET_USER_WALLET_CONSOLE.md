# Stellar Mainnet user wallet console

This adds a guarded Mainnet layer without changing the default TalkToStellar testnet product runtime.

## What was added

- Backend storage for user-attached Mainnet public wallets.
- Authenticated API endpoints under `/api/financial/mainnet/*`.
- Frontend network console at `/mainnet` with a Testnet/Mainnet toggle.
- Agent tools for explicit Mainnet requests:
  - `get_mainnet_status`
  - `attach_mainnet_wallet`
  - `get_mainnet_balance`
  - `preview_mainnet_payment`

## Safety model

Mainnet uses real assets. The new layer is read-only by default.

TalkToStellar does not store Mainnet secret keys, seed phrases, or signing credentials in this flow. Users attach only a Stellar public key beginning with `G`.

Existing app flows remain on the configured product network. Keep:

```bash
STELLAR_NETWORK=TESTNET
```

Do not set `STELLAR_NETWORK=PUBLIC` unless you are doing an approved cutover and have reviewed all existing payment, PIX, wallet and conversion flows.

Etherfuse is intentionally Testnet-only in this project. PIX/TESOURO routes must use the Testnet rail. If the backend runtime is `STELLAR_NETWORK=PUBLIC`, Etherfuse endpoints refuse PIX/TESOURO operations instead of silently running against a real-value network.

## Migration required

Apply this migration in Supabase:

```text
backend/migrations/20260613_00_full_schema.sql
```

If you have not applied the previous Mainnet infrastructure prep, also apply:

```text
backend/migrations/20260613_00_full_schema.sql
```

The new table is:

```text
public.stellar_mainnet_wallets
```

It stores:

- `session_id`
- `user_id`
- Mainnet `public_key`
- label
- cached last balance
- sync timestamps

It does not store private keys.

## Environment

Minimal safe config:

```bash
STELLAR_NETWORK=TESTNET
STELLAR_MAINNET_ENABLED=false
STELLAR_MAINNET_HORIZON_URL=https://horizon.stellar.org
STELLAR_MAINNET_ALLOW_RUNTIME_ACTIVATION=false
STELLAR_MAINNET_SIGNER_MODE=disabled
STELLAR_MAINNET_REQUIRE_MANUAL_APPROVAL=true
```

Optional readiness config:

```bash
STELLAR_MAINNET_USDC_ISSUER=GA5ZSEJYB37HLHJZJYJHFH2I4UHM3V7XNQX2X4Z2F6EBKZ3PQ4N7MYAI
STELLAR_MAINNET_FEE_TREASURY_PUBLIC_KEY=G...
STELLAR_MAINNET_MAX_PAYMENT_USDC=25
```

Keep mutation disabled until the team has signer, compliance, limits and manual approval controls reviewed.

## Frontend usage

Open:

```text
/mainnet
```

Flow:

1. Open `/mainnet`.
2. Use the `Testnet` tab for PIX, Etherfuse sandbox, chat payments and current product flows.
3. Use the `Mainnet` tab only for real-value public wallet visibility.
4. Login in the browser or enter through a chat access link.
5. Paste a Stellar Mainnet public key beginning with `G`.
6. Click `Attach read-only wallet`.
7. The page reads balances from Mainnet Horizon.
8. The page shows recent public operations.
9. The interaction panel can validate a payment preview without submitting a transaction.

## Agent usage

Examples:

```text
status mainnet
configurar carteira mainnet G...
saldo mainnet
preview mainnet payment 1 USDC para G...
alternar mainnet
```

The agent should always say that Mainnet is real-value and read-only by default, and it must never ask for secret keys. If the user asks to toggle networks, send them to `/mainnet`. If they ask for Etherfuse or PIX on Mainnet, explain that Etherfuse is Testnet-only.

## API examples

Status:

```bash
curl http://localhost:3000/api/financial/mainnet/status
```

Attach wallet after browser login:

```bash
curl -X POST http://localhost:3000/api/financial/mainnet/wallet \
  -H "Content-Type: application/json" \
  -d '{"public_key":"G...","label":"My Mainnet wallet"}'
```

Read balance:

```bash
curl http://localhost:3000/api/financial/mainnet/balance
```

Read operations:

```bash
curl http://localhost:3000/api/financial/mainnet/operations?limit=10
```

Payment preview:

```bash
curl -X POST http://localhost:3000/api/financial/mainnet/payment-preview \
  -H "Content-Type: application/json" \
  -d '{"destination":"G...","amount":"1","asset_code":"USDC"}'
```

## What is left before real Mainnet transactions

- External signer, KMS or vault signer implementation.
- Manual approval workflow.
- Amount limits and velocity limits.
- Compliance review for real user funds.
- Production audit logs for every Mainnet approval and submission.
- Mainnet-specific monitoring and incident rollback process.
