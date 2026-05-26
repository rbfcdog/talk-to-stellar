# Guia reduzido: envs novas que ainda faltam

Este guia foi gerado comparando `new/session-env-and-migrations.md` com os envs reais locais:

- `backend/.env`
- `backend/.env.production`
- `frontend/.env`
- `frontend/.env.production`
- `telegram/.env`
- `telegram/.env.production`

Nao foram lidos nem exibidos valores sensiveis; a checagem olhou apenas nomes de variaveis. A lista abaixo foca nas variaveis novas desta sessao que nao aparecem nesses envs reais.

## Prioridade 1: colocar para o app subir certo

### Backend

Adicionar em `backend/.env` e no provider de producao do backend:

```env
# URL publica real do backend, usada em webhooks/callbacks
PUBLIC_BACKEND_URL=https://seu-backend

# Origins permitidas a chamar o backend pelo browser
CORS_ORIGINS=https://seu-frontend,http://localhost:3000,http://127.0.0.1:3000

# Segredo compartilhado entre backend e adapters externos.
# Use o mesmo valor no Telegram.
AGENT_INGEST_SECRET=gere-com-openssl-rand-hex-32

# Fallback interno. Pode ser igual ao AGENT_INGEST_SECRET para simplificar deploy inicial.
INTERNAL_API_SECRET=mesmo-valor-do-agent-ingest-secret

# Euro real na Stellar public network: Circle EURC.
EURC_ISSUER_PUBLIC=GDHU6WRG4IEQXM5NZ4BMPKOXHW76MZM4Y2IEMFDVXBSDP6SJY4ITNPP2

# Lista canonica de assets expostos. Use TESOURO no env, nao BRL.
# TESOURO e o asset real do produto para reais.
TTS_VISIBLE_ASSET_CODES=TESOURO,USDC,EURC,XLM
```

Use `EURC_ISSUER_PUBLIC` com `STELLAR_NETWORK=PUBLIC`. Para testnet, nao use o issuer publico da Circle para submeter transacoes; deixe `EURC_ISSUER_TESTNET` vazio ate validar um issuer de teste confiavel.

Gerar segredo:

```bash
openssl rand -hex 32
```

### Frontend

Adicionar em `frontend/.env` e no provider de producao do frontend:

```env
NEXT_PUBLIC_BACKEND_URL=https://seu-backend
NEXT_PUBLIC_AGENT_API_URL=https://seu-backend/api/agent/query
NEXT_PUBLIC_FRONTEND_URL=https://seu-frontend
NEXT_PUBLIC_TTS_VISIBLE_ASSET_CODES=TESOURO,USDC,EURC,XLM
```

### Telegram

Adicionar em `telegram/.env` e no provider de producao do Telegram:

```env
# Tem que ser exatamente igual ao backend.
AGENT_INGEST_SECRET=mesmo-valor-do-backend

# Liga setup automatico de perfil do bot no boot.
TELEGRAM_PROFILE_SETUP=true

TELEGRAM_SHORT_DESCRIPTION=TalkToStellar account assistant for balance, PIX, conversion, yield, and withdrawals.
TELEGRAM_DESCRIPTION=TalkToStellar helps you check your balance, add or withdraw with PIX, convert currencies, keep money earning, manage contacts, and send payments from Telegram.
```

`TELEGRAM_PROFILE_PHOTO_PATH` e opcional. So configure se quiser sobrescrever a imagem padrao do repo:

```env
TELEGRAM_PROFILE_PHOTO_PATH=
```

## Prioridade 2: rendimento com Defindex

Adicionar em `backend/.env` e producao do backend:

```env
DEFINDEX_API_KEY=
DEFINDEX_BASE_URL=https://api.defindex.io
# Alias aceito pelo SDK/docs. Prefira DEFINDEX_BASE_URL no deploy.
# DEFINDEX_API_URL=https://api.defindex.io
DEFINDEX_NETWORK=testnet
DEFINDEX_TIMEOUT_MS=30000
DEFINDEX_ENABLE_EXECUTION=false

# Preencha apenas os vaults C... que existem e foram validados na rede ativa.
DEFINDEX_USDC_VAULT=
DEFINDEX_EURC_VAULT=
DEFINDEX_TESOURO_VAULT=
DEFINDEX_XLM_VAULT=
DEFINDEX_VAULTS_JSON=
```

Como preencher:

1. Obtenha a API key na documentacao/dashboard da Defindex ou solicitando acesso ao time Defindex/PaltaLabs.
2. O valor de cada `DEFINDEX_*_VAULT` e o contrato Soroban do vault (`C...`), nao o issuer do asset e nao o factory address.
3. Para obter um vault, selecione/crie no app da Defindex, crie via `@defindex/sdk` com factory operations, ou peca ao time Defindex/PaltaLabs o vault curado para asset/rede.
4. Para gerar um bloco automaticamente, rode `npm --prefix backend run defindex:env -- --network testnet`. Para arquivo separado, adicione `--write .env.defindex.testnet`.
5. O script usa `@defindex/sdk`, registry publico e `/vault/discover`. Se EURC testnet sair vazio, crie/solicite um vault EURC testnet validado antes de preencher `DEFINDEX_EURC_VAULT`.
6. Valide com `healthCheck()`, `getVaultInfo()`, `getVaultAPY()` e `getVaultBalance()` antes de expor ao usuario.
7. Mantenha `DEFINDEX_ENABLE_EXECUTION=false` ate deposit/withdraw, assinatura e liquidez estarem testados em testnet.
8. Use `DEFINDEX_VAULTS_JSON` so depois de validar outros assets. Por enquanto, priorize `DEFINDEX_USDC_VAULT`, `DEFINDEX_EURC_VAULT` e `DEFINDEX_TESOURO_VAULT`.

## Prioridade 3: passkey/smart account

Adicionar em `backend/.env` e producao do backend:

```env
PASSKEY_RP_NAME=TalkToStellar
PASSKEY_OPERATION_TIMEOUT_MS=180000
PASSKEY_USER_VERIFICATION=preferred

# Deixe desligado ate haver verifier/rules on-chain implantados e auditados.
PASSKEY_SMART_ACCOUNT_ENABLED=false
PASSKEY_SMART_ACCOUNT_NETWORK=testnet
PASSKEY_SMART_ACCOUNT_P256_VERIFIER_ADDRESS=
PASSKEY_SMART_ACCOUNT_DEFAULT_CONTEXT_RULE_ID=
```

Os envs `PASSKEY_RP_ID`, `PASSKEY_ORIGIN` e `PASSKEY_CHALLENGE_TTL_SECONDS` ja existem nos envs reais locais, mas confira em producao:

```env
PASSKEY_RP_ID=seu-dominio-frontend.com
PASSKEY_ORIGIN=https://seu-dominio-frontend.com
PASSKEY_CHALLENGE_TTL_SECONDS=900
```

## Prioridade 4: assets extras e distribuicao

Esses envs estavam faltando, mas sao opcionais. Nao preencha como operacional ate existir issuer, trustline, liquidez/path e vault quando aplicavel.

```env
# TESOURO distributor, apenas se o backend for emitir/distribuir TESOURO.
TESOURO_DISTRIBUTOR_PUBLIC=
TESOURO_DISTRIBUTOR_SECRET=

# EURC public network ja validado via Circle.
EURC_ISSUER_PUBLIC=GDHU6WRG4IEQXM5NZ4BMPKOXHW76MZM4Y2IEMFDVXBSDP6SJY4ITNPP2

# So preencha se houver issuer testnet confiavel.
EURC_ISSUER_TESTNET=

# Moedas extras ficam fora por enquanto; so depois de confirmar codigo real,
# issuer, trustline, liquidez/path e vault.
GBP_ISSUER=
MXN_ISSUER=
ARS_ISSUER=
CAD_ISSUER=
AUD_ISSUER=
CHF_ISSUER=
JPY_ISSUER=
```

## Checklist curto de deploy

1. Backend, frontend e Telegram usam o mesmo `AGENT_INGEST_SECRET`.
2. `NEXT_PUBLIC_BACKEND_URL`, `NEXT_PUBLIC_AGENT_API_URL`, `FRONTEND_URL` e `PUBLIC_APP_URL` apontam para dominios publicos reais.
3. `CORS_ORIGINS` contem exatamente o dominio do frontend.
4. `/yield`, `/convert`, `/money-cycle`, `/pix-on` e `/pix-off` abrem no frontend publico.
5. Defindex fica com `DEFINDEX_ENABLE_EXECUTION=false` ate validar API key e vaults.
6. Smart account fica com `PASSKEY_SMART_ACCOUNT_ENABLED=false` ate haver verifier P-256 implantado.
7. Por enquanto exponha so `TESOURO,USDC,EURC,XLM`; extras como `GBP_ISSUER` e `MXN_ISSUER` so entram depois de confirmar codigo real e liquidez/path.
