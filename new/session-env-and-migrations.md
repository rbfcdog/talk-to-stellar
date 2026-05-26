# Env e migrations desta sessão

Este documento lista as variáveis e migrações relacionadas às mudanças feitas nesta sessão: URL `/yield`, rendimento multi-asset, PIX com chave dinâmica, passkey/smart account e Telegram.

## Requisitos mínimos para rodar

Para a experiência nova funcionar de ponta a ponta, o ambiente precisa ter:

1. Frontend público em HTTPS, com `/chat`, `/yield`, `/money-cycle`, `/convert`, `/pix-on` e `/pix-off` acessíveis.
2. Backend público com `/api/agent/query`, `/api/ramp/*`, `/api/external/*`, `/api/passkey/*` e CORS liberado para o domínio do frontend.
3. Supabase configurado com service role e todas as migrations listadas neste documento.
4. `AGENT_INGEST_SECRET` igual no backend, Telegram e qualquer adapter de chat.
5. `FRONTEND_URL`/`PUBLIC_APP_URL` apontando para o domínio real do frontend, porque as tool calls devolvem links públicos.
6. Assets visíveis configurados em `TTS_VISIBLE_ASSET_CODES`; BRL deve continuar sendo TESOURO internamente, sem asset BRL separado.
7. Issuers, liquidez/rotas e setup dos assets extras antes de marcar uma moeda como operacional.
8. PIX/Etherfuse com API key, organização/conta habilitada e webhook configurado.
9. Defindex com vaults e API key para rendimento; execução deve ficar desligada até validação completa.
10. Passkey/WebAuthn com `PASSKEY_RP_ID` e `PASSKEY_ORIGIN` exatamente iguais ao domínio HTTPS do frontend.
11. Telegram com token, webhook e profile setup, caso o canal Telegram esteja ativo.
12. OpenAI API key no backend para o agente usar tool calls.

## Backend env

```env
# Core backend
PORT=3001
NODE_ENV=production
JWT_SECRET=troque-por-um-segredo-longo
PIN_PEPPER=troque-por-um-segredo-longo
OPENAI_API_KEY=sk-...

# Supabase
SUPABASE_URL=https://seu-projeto.supabase.co
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_ANON_KEY=

# Frontend usado pelos links que a LLM devolve nas tool calls
FRONTEND_URL=https://seu-frontend
PUBLIC_APP_URL=https://seu-frontend
CREATE_ACCOUNT_BASE=https://seu-frontend
PAYMENT_CONFIRM_BASE=https://seu-frontend
PUBLIC_BACKEND_URL=https://seu-backend
CORS_ORIGINS=https://seu-frontend,http://localhost:3000,http://127.0.0.1:3000

# Ingestão de Telegram/WhatsApp para o agente
AGENT_INGEST_SECRET=mesmo-valor-no-backend-e-no-adapter
INTERNAL_API_SECRET=mesmo-valor-ou-fallback
TELEGRAM_NOTIFY_SECRET=mesmo-valor-ou-fallback
TELEGRAM_NOTIFY_URL=https://seu-telegram-service/notify
TELEGRAM_BOT_TOKEN=123456:replace-me

# Stellar/runtime do app
STELLAR_NETWORK=TESTNET
STELLAR_HORIZON_URL=https://horizon-testnet.stellar.org
STELLAR_SECRET_KEY=
STELLAR_PUBLIC_KEY=
USDC_ISSUER=
USDC_ASSET_CODE=USDC
USDC_ASSET_ISSUER=
STELLAR_ENFORCE_TRUSTED_PATH_ASSETS=false
ONBOARDING_AUTO_CONVERT_TO_USDC=true
QUOTE_TTL_SECONDS=30
TALKTOSTELLAR_SPREAD_BPS=30
TALKTOSTELLAR_FEE_TREASURY_PUBLIC_KEY=
BRL_USDC_QUOTE_SOURCE=binance
BRL_USDC_QUOTE_SYMBOL=USDCBRL
BRL_USDC_QUOTE_TIMEOUT_MS=8000

# Assets visíveis na UX. BRL continua sendo TESOURO internamente.
ENABLE_TESOURO_ASSET=true
TESOURO_ISSUER=GC3CW7EDYRTWQ635VDIGY6S4ZUF5L6TQ7AA4MWS7LEQDBLUSZXV7UPS4
TESOURO_DISTRIBUTOR_PUBLIC=
TESOURO_DISTRIBUTOR_SECRET=
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

# PIX / ramp
ETHERFUSE_API_KEY=api_sand:...
ETHERFUSE_BASE_URL=https://api.sand.etherfuse.com
ETHERFUSE_BLOCKCHAIN=stellar
ETHERFUSE_WEBHOOK_SECRET=

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

# Payout internacional opcional
PAYOUT_PROVIDER=mock
CIRCLE_API_KEY=
CIRCLE_PAYOUT_CREATE_URL=
BRIDGE_API_KEY=
BRIDGE_PAYOUT_CREATE_URL=
ENABLE_REAL_PAYOUT_EXECUTION=false
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
AGENT_API_URL=https://seu-backend/api/agent/query
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
TELEGRAM_BOT_USERNAME=talktostellar_bot
TELEGRAM_HEALTH_PORT=3005
TELEGRAM_SESSION_PREFIX=telegram
TELEGRAM_WEBHOOK_PATH=/webhook/telegram
TELEGRAM_PROFILE_SETUP=true
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

1. `/yield` é a URL pública de rendimento; `/money-cycle` é a URL pública do ciclo consolidado PIX entrada -> rendimento -> PIX saída; `/convert` é a URL pública de conversão multi-asset. `/rendimentos` e `/rendimento` só redirecionam.
2. A LLM usa tool calls para abrir interfaces:
   - `open_asset_interface` para trazer/manter/mandar para PIX.
   - `open_money_cycle` para o ciclo completo de injetar dinheiro, render e sair.
   - `get_yield_options`, `get_yield_balance`, `prepare_yield_action`, `confirm_yield_action` para rendimento.
3. PIX off-ramp aceita `destination_pix_key`/`pix_key` na URL e também permite a pessoa digitar a chave na tela.
4. `TTS_VISIBLE_ASSET_CODES` controla os assets mostrados em saldo e UX multi-asset.
5. Assets extras precisam de `CODE_ISSUER`, liquidez/path e vault em `DEFINDEX_VAULTS_JSON` antes de aparecerem como operacionais.
6. Antes do deploy, rodar:
   - `npm --prefix backend run eval:agent`
   - `npm --prefix backend run build`
   - `npm --prefix frontend test`
   - `npm --prefix frontend run build`
7. Smoke test manual depois do deploy:
   - Chat: “o que você pode fazer?”
   - Chat: “converter 500 reais para euros”
   - Chat: “deixar 200 dólares rendendo”
   - Chat: “injetar 500 reais, deixar render e sair para user@example.com”
   - Abrir `/yield?lang=pt-BR&asset=EUR&amount=200`
   - Abrir `/money-cycle?cycle=1&asset=BRL&amount=500&destination_pix_key=user%40example.com`
   - Abrir `/pix-off?asset=EUR&amount=80&destination_pix_key=user%40example.com`
