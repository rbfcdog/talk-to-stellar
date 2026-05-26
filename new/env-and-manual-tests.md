# Env left + manual tests

This is the short deploy guide for the new session work: yield, PIX on/off ramp, conversion, multi-asset UX, Telegram ingest, and passkey.

Do not commit real secrets. Put backend secrets only in the backend/hosting env, not in `NEXT_PUBLIC_*`.

## 1. What is still left to fill

If your old base env already has `SUPABASE_*`, `OPENAI_API_KEY`, `JWT_SECRET`, `PIN_PEPPER`, `STELLAR_*`, and `USDC_*`, the likely missing items are:

1. `DEFINDEX_API_KEY` in the backend.
2. `ETHERFUSE_API_KEY` in the backend for real PIX/ramp calls.
3. One shared `AGENT_INGEST_SECRET` copied exactly into backend and Telegram.
4. Real public URLs: frontend, backend, Telegram webhook, and CORS.
5. Passkey domain values matching the real HTTPS frontend domain.
6. Supabase migrations from this session applied.

## 2. Backend env to add or verify

```env
# Public URLs
FRONTEND_URL=https://your-frontend
PUBLIC_APP_URL=https://your-frontend
CREATE_ACCOUNT_BASE=https://your-frontend
PAYMENT_CONFIRM_BASE=https://your-frontend
PUBLIC_BACKEND_URL=https://your-backend
CORS_ORIGINS=https://your-frontend,http://localhost:3000,http://127.0.0.1:3000

# Agent/chat adapter auth
AGENT_INGEST_SECRET=generate-with-openssl-rand-hex-32
INTERNAL_API_SECRET=same-value-as-agent-ingest-secret
TELEGRAM_NOTIFY_SECRET=same-value-as-agent-ingest-secret
TELEGRAM_NOTIFY_URL=https://your-telegram-service/notify

# Assets visible in UX
ENABLE_TESOURO_ASSET=true
TESOURO_ISSUER=GC3CW7EDYRTWQ635VDIGY6S4ZUF5L6TQ7AA4MWS7LEQDBLUSZXV7UPS4
ENABLE_CETES_ASSET=true
ENABLE_EURC_ASSET=false
CETES_ISSUER_TESTNET=GC3CW7EDYRTWQ635VDIGY6S4ZUF5L6TQ7AA4MWS7LEQDBLUSZXV7UPS4
TTS_VISIBLE_ASSET_CODES=TESOURO,USDC,CETES,XLM

# PIX / ramp
ETHERFUSE_API_KEY=api_sand:replace:replace
ETHERFUSE_BASE_URL=https://api.sand.etherfuse.com
ETHERFUSE_BLOCKCHAIN=stellar
ETHERFUSE_WEBHOOK_SECRET=

# Yield
DEFINDEX_API_KEY=
DEFINDEX_BASE_URL=https://api.defindex.io
DEFINDEX_NETWORK=testnet
DEFINDEX_TIMEOUT_MS=30000
DEFINDEX_ENABLE_EXECUTION=true
DEFINDEX_ALLOW_MAINNET_EXECUTION=false
DEFINDEX_USDC_VAULT=CBMVK2JK6NTOT2O4HNQAIQFJY232BHKGLIMXDVQVHIIZKDACXDFZDWHN
DEFINDEX_CETES_VAULT=CBIS5TEMTNNOTBE3WXPQUAGUEDYZZVIWAKTXEQCOUJ34OJJ3FJ5NLF2P
DEFINDEX_XLM_VAULT=CCLV4H7WTLJQ7ATLHBBQV2WW3OINF3FOY5XZ7VPHZO7NH3D2ZS4GFSF6
CETES_ISSUER_TESTNET=GC3CW7EDYRTWQ635VDIGY6S4ZUF5L6TQ7AA4MWS7LEQDBLUSZXV7UPS4

# Passkey
PASSKEY_RP_ID=your-frontend-domain.com
PASSKEY_ORIGIN=https://your-frontend-domain.com
PASSKEY_RP_NAME=TalkToStellar
PASSKEY_OPERATION_TIMEOUT_MS=180000
PASSKEY_CHALLENGE_TTL_SECONDS=900
PASSKEY_USER_VERIFICATION=preferred
PASSKEY_SMART_ACCOUNT_ENABLED=false
PASSKEY_SMART_ACCOUNT_NETWORK=testnet
PASSKEY_SMART_ACCOUNT_P256_VERIFIER_ADDRESS=
PASSKEY_SMART_ACCOUNT_DEFAULT_CONTEXT_RULE_ID=
```

Generate shared secrets with:

```bash
openssl rand -hex 32
```

## 3. Frontend env to add or verify

```env
AGENT_API_URL=https://your-backend/api/agent/query
NEXT_PUBLIC_BACKEND_URL=https://your-backend
NEXT_PUBLIC_AGENT_API_URL=https://your-backend/api/agent/query
NEXT_PUBLIC_FRONTEND_URL=https://your-frontend
NEXT_PUBLIC_TTS_VISIBLE_ASSET_CODES=TESOURO,USDC,CETES,XLM
```

## 4. Telegram env to add or verify

```env
TELEGRAM_BOT_TOKEN=123456:replace-me
TELEGRAM_AGENT_URL=https://your-backend/api/agent/query
TELEGRAM_BOT_MODE=webhook
TELEGRAM_WEBHOOK_URL=https://your-telegram-service
TELEGRAM_WEBHOOK_PATH=/webhook/telegram
TELEGRAM_PROFILE_SETUP=true
AGENT_INGEST_SECRET=same-value-as-backend
TELEGRAM_NOTIFY_SECRET=same-value-as-backend
```

The bot crash `AGENT_INGEST_SECRET is required` means this value is missing in Telegram or does not match the backend.

## 5. Keep mainnet and unknown vaults disabled

For testnet execution, keep `DEFINDEX_ENABLE_EXECUTION=true`. Keep mainnet and unvalidated vaults off/empty:

```env
DEFINDEX_ENABLE_EXECUTION=true
DEFINDEX_ALLOW_MAINNET_EXECUTION=false

# Do not invent these. Fill only when a real validated vault exists.
DEFINDEX_EURC_VAULT=
DEFINDEX_TESOURO_VAULT=
DEFINDEX_VAULTS_JSON=

# Testnet EURC issuer is not validated here. Keep EURC disabled on testnet.
EURC_ISSUER_TESTNET=

# TESOURO distributor is only needed for on-chain TESOURO settlement.
TESOURO_DISTRIBUTOR_PUBLIC=
TESOURO_DISTRIBUTOR_SECRET=

# Smart account on-chain verifier is not deployed/validated here.
PASSKEY_SMART_ACCOUNT_ENABLED=false
PASSKEY_SMART_ACCOUNT_P256_VERIFIER_ADDRESS=
PASSKEY_SMART_ACCOUNT_DEFAULT_CONTEXT_RULE_ID=
```

EURC is not used on testnet here. CETES replaces EUR/EURC in testnet UX and transactions. Do not use `EURC_ISSUER_PUBLIC` to submit testnet transactions.

TESOURO is the real product asset for reais. Do not recreate or expose a separate `BRL` asset.

## 6. Migrations

Apply these migrations if they are not already applied:

```text
backend/migrations/20260510_wallet_pix_and_assets.sql
backend/migrations/20260514_01_external_bank_accounts.sql
backend/migrations/20260525_00_passkey_smart_accounts.sql
```

For a fresh database, also apply the base financial assistant migrations listed in `new/session-env-and-migrations.md`.

## 7. Automated checks before manual testing

Run these before deploy:

```bash
npm --prefix backend run build
npm --prefix backend run test:yield
npm --prefix backend run eval:agent
npm --prefix frontend run build
npm --prefix frontend test
```

Optional yield env discovery:

```bash
npm --prefix backend run defindex:env -- --network testnet --enable-execution
```

## 8. Manual tests

Use a real browser and test both desktop and mobile widths.

### A. Yield screen

Open:

```text
/yield?lang=pt-BR&asset=USDC&amount=100
```

Expected:

1. First screen says `Rendimento da sua conta`.
2. Left side shows `Sua conta`, account status, and balances.
3. Right side shows `Rendimento selecionado`.
4. No old dashboard blocks like `Moedas na conta`, `O que fazer agora`, or `Próximo passo`.
5. User-facing text does not show provider internals like `Defindex`, `vault`, `XDR`, `issuer`, `trustline`, `blockchain`, or `secret`.

Then:

1. Select each visible balance.
2. Confirm the selected balance updates the right panel.
3. Enter `100`.
4. Click `Revisar`.
5. With `DEFINDEX_ENABLE_EXECUTION=true` on testnet, final confirmation should show the PIN path for a signed-in wallet. Keep `DEFINDEX_ALLOW_MAINNET_EXECUTION=false` unless you are deliberately testing mainnet.

### B. PIX add money

Open:

```text
/pix-on?asset=TESOURO&amount=50&lang=pt-BR
```

Expected:

1. User sees reais/BRL language, not raw `TESOURO` as a confusing product name.
2. Amount remains `R$50.00` or localized equivalent.
3. QR/payment step has visible button labels.
4. Dark mode styling is consistent.
5. If sandbox fallback is enabled, a paid test PIX can complete without `TESOURO_DISTRIBUTOR_SECRET`.

### C. PIX withdraw with dynamic key

Open:

```text
/pix-off?asset=TESOURO&source_amount=25&destination_pix_key=user%40example.com&lang=pt-BR
```

Expected:

1. PIX key field is prefilled with `user@example.com`.
2. User can edit the key before PIN.
3. The screen shows fees and final amount before confirmation.
4. Buttons have visible text.
5. No user-facing raw provider internals.

### D. Conversion

Open:

```text
/convert?source_asset=TESOURO&dest_asset=USDC&amount=50&lang=pt-BR
```

Expected:

1. Source appears as reais/BRL.
2. Destination appears as dollars/USD.
3. Quote, fee, and final value are visible before PIN.
4. No separate `BRL` asset is shown as a new issued asset.

Also test:

```text
/convert?source_asset=USDC&dest_asset=CETES&amount=20&lang=en
```

Expected: English UI, CETES destination, no technical terms.

### E. Money cycle

Open:

```text
/money-cycle?cycle=1&asset=TESOURO&amount=100&destination_pix_key=user%40example.com&lang=pt-BR
```

Expected:

1. User understands the cycle as add money -> keep earning -> withdraw.
2. PIX key is dynamic and editable.
3. Yield step points to `/yield`.
4. Off-ramp step points to `/pix-off` with the key.

### F. Chat tool calls

Open `/chat` and test:

```text
o que voce pode fazer?
converter 50 reais para dolares
deixar 100 dolares rendendo
retirar 20 reais para user@example.com
injetar 100 reais, deixar render e sair para user@example.com
```

Expected:

1. The answer includes PIX, conversion, yield, and multi-asset support.
2. The assistant opens or links to the right frontend interface.
3. It does not ask for a PIN until final confirmation.
4. It does not expose raw provider internals.

### G. Telegram

After deploy:

```bash
curl "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/getMe"
```

Then in Telegram:

```text
/start
o que voce pode fazer?
deixar 100 dolares rendendo
retirar 20 reais para user@example.com
```

Expected:

1. Bot starts without `AGENT_INGEST_SECRET` error.
2. Responses match chat behavior.
3. Links point to the public frontend domain.
4. Payment notifications arrive after browser confirmations when `TELEGRAM_NOTIFY_URL` is configured.

### H. Passkey

Open:

```text
/create-account
```

Expected:

1. Account creation works with PIN only.
2. Passkey enrollment is optional and uses the real browser prompt.
3. `PASSKEY_RP_ID` equals the frontend domain without protocol.
4. `PASSKEY_ORIGIN` equals the full HTTPS origin.
5. Smart account remains metadata-only while `PASSKEY_SMART_ACCOUNT_ENABLED=false`.

## 9. UX acceptance checklist

Before shipping, inspect the visible UI:

1. The first screen is the actual usable app, not a landing page.
2. Buttons have visible text and clear actions.
3. Yield starts from the user's account balances.
4. PIX key can be typed or changed by the user on withdraw.
5. TESOURO is treated as reais in UX; no separate BRL issued asset.
6. CETES is visible in testnet instead of EURC; EURC stays hidden until issuer/liquidity/vault are valid for the active network.
7. No visible technical terms: `Defindex`, `vault`, `XDR`, `issuer`, `trustline`, `blockchain`, `secret`.
8. Mobile layout has no overlapping text.
9. Confirmation/PIN appears only at the final step.
