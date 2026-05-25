# Env e migrations desta sessão

Este documento lista as variáveis e migrações relacionadas às mudanças feitas nesta sessão: URL `/yield`, rendimento multi-asset, PIX com chave dinâmica, passkey/smart account e Telegram.

## Backend env

```env
# Frontend usado pelos links que a LLM devolve nas tool calls
FRONTEND_URL=https://seu-frontend
PUBLIC_APP_URL=https://seu-frontend

# Ingestão de Telegram/WhatsApp para o agente
AGENT_INGEST_SECRET=mesmo-valor-no-backend-e-no-adapter
INTERNAL_API_SECRET=mesmo-valor-ou-fallback
TELEGRAM_NOTIFY_SECRET=mesmo-valor-ou-fallback
TELEGRAM_NOTIFY_URL=https://seu-telegram-service/notify
TELEGRAM_BOT_TOKEN=123456:replace-me

# Assets visíveis na UX. BRL continua sendo TESOURO internamente.
ENABLE_TESOURO_ASSET=true
TESOURO_ISSUER=GC3CW7EDYRTWQ635VDIGY6S4ZUF5L6TQ7AA4MWS7LEQDBLUSZXV7UPS4
ENABLE_EURC_ASSET=true
EURC_ISSUER=
EURC_ISSUER_PUBLIC=
EURC_ISSUER_TESTNET=
TTS_VISIBLE_ASSET_CODES=BRL,USDC,EUR,GBP,MXN,ARS,CAD,AUD,CHF,JPY

# Assets extras opcionais, só quando houver issuer/liquidez/configuração real
GBP_ISSUER=
MXN_ISSUER=
ARS_ISSUER=
CAD_ISSUER=
AUD_ISSUER=
CHF_ISSUER=
JPY_ISSUER=

# Defindex / rendimento
DEFINDEX_API_KEY=
DEFINDEX_BASE_URL=https://api.defindex.io
DEFINDEX_NETWORK=testnet
DEFINDEX_TIMEOUT_MS=30000
DEFINDEX_ENABLE_EXECUTION=false
DEFINDEX_USDC_VAULT=
DEFINDEX_EURC_VAULT=
DEFINDEX_TESOURO_VAULT=
DEFINDEX_VAULTS_JSON=

# Passkey / smart account
PASSKEY_RP_ID=seu-dominio-frontend.com
PASSKEY_ORIGIN=https://seu-dominio-frontend.com
PASSKEY_RP_NAME=TalkToStellar
PASSKEY_OPERATION_TIMEOUT_MS=180000
PASSKEY_USER_VERIFICATION=preferred
PASSKEY_SMART_ACCOUNT_ENABLED=false
PASSKEY_SMART_ACCOUNT_NETWORK=testnet
PASSKEY_SMART_ACCOUNT_P256_VERIFIER_ADDRESS=
PASSKEY_SMART_ACCOUNT_DEFAULT_CONTEXT_RULE_ID=
```

`DEFINDEX_VAULTS_JSON` aceita assets extras além de USDC/EUR/BRL:

```json
[
  {
    "asset_code": "GBP",
    "vault_address": "C...",
    "label": "Pounds Yield",
    "network": "testnet"
  }
]
```

Mantenha `DEFINDEX_ENABLE_EXECUTION=false` até validar API key, vaults, issuers, liquidez e assinatura em testnet.

## Frontend env

```env
NEXT_PUBLIC_BACKEND_URL=https://seu-backend
NEXT_PUBLIC_AGENT_API_URL=https://seu-backend/api/agent/query
NEXT_PUBLIC_FRONTEND_URL=https://seu-frontend
NEXT_PUBLIC_TTS_VISIBLE_ASSET_CODES=BRL,USDC,EUR,GBP,MXN,ARS,CAD,AUD,CHF,JPY
```

O domínio público do frontend precisa bater com `PASSKEY_RP_ID` e `PASSKEY_ORIGIN`.

## Telegram env

```env
TELEGRAM_BOT_TOKEN=123456:replace-me
TELEGRAM_AGENT_URL=https://seu-backend/api/agent/query
TELEGRAM_BOT_MODE=webhook
TELEGRAM_WEBHOOK_URL=https://seu-telegram-service
AGENT_INGEST_SECRET=mesmo-valor-do-backend
TELEGRAM_NOTIFY_SECRET=mesmo-valor-ou-fallback
```

O erro `AGENT_INGEST_SECRET is required` significa que o adapter Telegram subiu sem esse segredo ou com valor diferente do backend.

## Migrations para aplicar

Aplicar pelo runner do projeto ou diretamente no Supabase, na ordem:

```text
backend/migrations/20260510_wallet_pix_and_assets.sql
backend/migrations/20260514_01_external_bank_accounts.sql
backend/migrations/20260525_00_passkey_smart_accounts.sql
```

Também confirme que as migrations base do assistente financeiro já existem no ambiente:

```text
backend/migrations/20260512_00_payment_infra_prereqs.sql
backend/migrations/20260512_01_smart_contacts_and_treasury.sql
backend/migrations/20260512_02_activity_feed_insights_economy.sql
backend/migrations/20260512_03_financial_assistant_modules.sql
backend/migrations/20260513_00_payment_confirmation_single_use.sql
backend/migrations/20260513_02_receipt_images.sql
backend/migrations/20260513_03_payment_link_expiry_and_transaction_nickname.sql
backend/migrations/20260523_01_agent_messages_intro_dedupe.sql
```

## Checklist de deploy

1. `/yield` é a URL pública de rendimento; `/money-cycle` é a URL pública do ciclo consolidado PIX entrada -> rendimento -> PIX saída. `/rendimentos` e `/rendimento` só redirecionam.
2. A LLM usa tool calls para abrir interfaces:
   - `open_asset_interface` para trazer/manter/mandar para PIX.
   - `open_money_cycle` para o ciclo completo de injetar dinheiro, render e sair.
   - `get_yield_options`, `get_yield_balance`, `prepare_yield_action`, `confirm_yield_action` para rendimento.
3. PIX off-ramp aceita `destination_pix_key`/`pix_key` na URL e também permite a pessoa digitar a chave na tela.
4. `TTS_VISIBLE_ASSET_CODES` controla os assets mostrados em saldo e UX multi-asset.
5. Assets extras precisam de `CODE_ISSUER`, liquidez/path e vault em `DEFINDEX_VAULTS_JSON` antes de aparecerem como operacionais.
