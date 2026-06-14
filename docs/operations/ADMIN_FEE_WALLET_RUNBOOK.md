# Admin Fee Wallet Runbook

TalkToStellar app fees are settled to a dedicated Stellar admin wallet when the backend has a treasury public key configured.

## Environment

Required in the backend runtime:

```bash
TALKTOSTELLAR_FEE_TREASURY_PUBLIC_KEY=G...
TALKTOSTELLAR_SPREAD_BPS=30
TALKTOSTELLAR_SPREAD_MIN_USDC=0.01
TALKTOSTELLAR_SPREAD_MIN_BRL=0.05
```

Optional, server-side only, for preparing trustlines:

```bash
TALKTOSTELLAR_FEE_TREASURY_SECRET_KEY=S...
```

Do not expose the treasury secret to the frontend. Use it only in a secret manager or one-off operational shell.

## Create Or Prepare The Wallet

From `backend/`:

```bash
npm run stellar:setup-admin-fee-wallet
```

Behavior:

- If `TALKTOSTELLAR_FEE_TREASURY_SECRET_KEY` is present, the script prepares that wallet.
- If no secret is present, the script generates a new Stellar keypair and prints the public key and setup secret.
- On testnet, the script funds the account with Friendbot.
- It creates trustlines for the configured issued assets used by fees: `TESOURO`, `USDC`, and `CETES`.

## Settlement Behavior

- Stellar payments and conversions already include a platform-fee payment to the treasury when the fee is enabled.
- PIX on-ramp sandbox settlement sends the user delivery and the app fee in the same distributor transaction.
- PIX off-ramp sandbox settlement debits the user's gross amount, sends the app fee to the treasury, and sends the remaining settlement amount to the internal PIX collector.

If `TALKTOSTELLAR_FEE_TREASURY_PUBLIC_KEY` is empty, app-fee settlement is skipped instead of sending fees to a fallback wallet.
