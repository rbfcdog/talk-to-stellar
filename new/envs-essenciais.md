# Envs essenciais das novidades

Versao curta para deploy. Isto nao repete envs basicos que o projeto ja usava, como `SUPABASE_*`, `OPENAI_API_KEY`, `STELLAR_*`, `JWT_SECRET` e `PIN_PEPPER`.

## 1. Obrigatorias agora

### Backend

```env
FRONTEND_URL=https://seu-frontend
PUBLIC_APP_URL=https://seu-frontend
PUBLIC_BACKEND_URL=https://seu-backend
CORS_ORIGINS=https://seu-frontend,http://localhost:3000,http://127.0.0.1:3000

AGENT_INGEST_SECRET=gere-com-openssl-rand-hex-32
INTERNAL_API_SECRET=mesmo-valor-do-agent-ingest-secret
TELEGRAM_NOTIFY_SECRET=mesmo-valor-do-agent-ingest-secret
TELEGRAM_NOTIFY_URL=https://seu-telegram-service/notify

ENABLE_TESOURO_ASSET=true
TESOURO_ISSUER=GC3CW7EDYRTWQ635VDIGY6S4ZUF5L6TQ7AA4MWS7LEQDBLUSZXV7UPS4
ENABLE_EURC_ASSET=true
TTS_VISIBLE_ASSET_CODES=BRL,USDC,EUR,GBP,MXN,ARS,CAD,AUD,CHF,JPY
```

Gerar segredo:

```bash
openssl rand -hex 32
```

### Frontend

```env
NEXT_PUBLIC_BACKEND_URL=https://seu-backend
NEXT_PUBLIC_AGENT_API_URL=https://seu-backend/api/agent/query
NEXT_PUBLIC_FRONTEND_URL=https://seu-frontend
NEXT_PUBLIC_TTS_VISIBLE_ASSET_CODES=BRL,USDC,EUR,GBP,MXN,ARS,CAD,AUD,CHF,JPY
```

### Telegram

```env
TELEGRAM_AGENT_URL=https://seu-backend/api/agent/query
TELEGRAM_WEBHOOK_URL=https://seu-telegram-service
AGENT_INGEST_SECRET=mesmo-valor-do-backend
TELEGRAM_NOTIFY_SECRET=mesmo-valor-do-backend
TELEGRAM_PROFILE_SETUP=true
```

O `AGENT_INGEST_SECRET` precisa ser identico no backend e no Telegram. Esse foi o erro que derrubou o bot.

## 2. Para rendimento real com Defindex

Configure no backend quando for ligar rendimento de verdade:

```env
DEFINDEX_API_KEY=
DEFINDEX_BASE_URL=https://api.defindex.io
DEFINDEX_NETWORK=testnet
DEFINDEX_TIMEOUT_MS=30000
DEFINDEX_ENABLE_EXECUTION=false
DEFINDEX_USDC_VAULT=
DEFINDEX_EURC_VAULT=
DEFINDEX_TESOURO_VAULT=
DEFINDEX_XLM_VAULT=
```

Mantenha `DEFINDEX_ENABLE_EXECUTION=false` ate validar API key, vaults, assinatura, liquidez e saque em testnet.

## 3. Para passkey

Configure no backend:

```env
PASSKEY_RP_ID=seu-dominio-frontend.com
PASSKEY_ORIGIN=https://seu-dominio-frontend.com
PASSKEY_RP_NAME=TalkToStellar
PASSKEY_OPERATION_TIMEOUT_MS=180000
PASSKEY_CHALLENGE_TTL_SECONDS=900
PASSKEY_USER_VERIFICATION=preferred
PASSKEY_SMART_ACCOUNT_ENABLED=false
```

Deixe `PASSKEY_SMART_ACCOUNT_ENABLED=false` ate existir verifier P-256/WebAuthn implantado e testado.

## 4. So preencher depois

```env
# So para liquidacao on-chain de TESOURO no sandbox/producao.
# A demo sandbox atual nao precisa disso para concluir PIX.
TESOURO_DISTRIBUTOR_PUBLIC=
TESOURO_DISTRIBUTOR_SECRET=

# So quando issuer, trustline, rota e liquidez estiverem validados.
EURC_ISSUER_PUBLIC=
EURC_ISSUER_TESTNET=
GBP_ISSUER=
MXN_ISSUER=
ARS_ISSUER=
CAD_ISSUER=
AUD_ISSUER=
CHF_ISSUER=
JPY_ISSUER=

# So quando houver vaults extras alem dos envs diretos acima.
DEFINDEX_VAULTS_JSON=

# So quando smart account on-chain estiver implantada.
PASSKEY_SMART_ACCOUNT_P256_VERIFIER_ADDRESS=
PASSKEY_SMART_ACCOUNT_DEFAULT_CONTEXT_RULE_ID=
```

## 5. Migrations novas

Aplicar nesta ordem:

```text
backend/migrations/20260510_wallet_pix_and_assets.sql
backend/migrations/20260514_01_external_bank_accounts.sql
backend/migrations/20260525_00_passkey_smart_accounts.sql
```

Se o banco for novo, aplique tambem as migrations base listadas em `new/session-env-and-migrations.md`.
