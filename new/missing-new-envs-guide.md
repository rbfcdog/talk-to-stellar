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

# CETES e o substituto de EUR/EURC no ambiente testnet atual.
ENABLE_CETES_ASSET=true
ENABLE_EURC_ASSET=false
CETES_ISSUER_TESTNET=GC3CW7EDYRTWQ635VDIGY6S4ZUF5L6TQ7AA4MWS7LEQDBLUSZXV7UPS4

# Lista canonica de assets expostos. Use TESOURO no env, nao BRL.
# TESOURO e o asset real do produto para reais.
TTS_VISIBLE_ASSET_CODES=TESOURO,USDC,CETES,XLM
```

Use CETES em testnet porque nao ha issuer/vault EURC validado aqui. `EURC_ISSUER_PUBLIC` e apenas para `STELLAR_NETWORK=PUBLIC` no futuro/mainnet.

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
NEXT_PUBLIC_TTS_VISIBLE_ASSET_CODES=TESOURO,USDC,CETES,XLM
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
DEFINDEX_ENABLE_EXECUTION=true
DEFINDEX_ALLOW_MAINNET_EXECUTION=false

# Preencha apenas os vaults C... que existem e foram validados na rede ativa.
DEFINDEX_USDC_VAULT=CBMVK2JK6NTOT2O4HNQAIQFJY232BHKGLIMXDVQVHIIZKDACXDFZDWHN
DEFINDEX_CETES_VAULT=CBIS5TEMTNNOTBE3WXPQUAGUEDYZZVIWAKTXEQCOUJ34OJJ3FJ5NLF2P
DEFINDEX_XLM_VAULT=CCLV4H7WTLJQ7ATLHBBQV2WW3OINF3FOY5XZ7VPHZO7NH3D2ZS4GFSF6
CETES_ISSUER_TESTNET=GC3CW7EDYRTWQ635VDIGY6S4ZUF5L6TQ7AA4MWS7LEQDBLUSZXV7UPS4
DEFINDEX_VAULTS_JSON=
```

Em testnet, use yield apenas para assets com vault encontrado. Hoje o script encontra USDC, XLM e CETES; deixe EURC/TESOURO fora do yield testnet ate haver vault validado.

Como preencher:

1. Obtenha a API key na documentacao/dashboard da Defindex ou solicitando acesso ao time Defindex/PaltaLabs.
2. O valor de cada `DEFINDEX_*_VAULT` e o contrato Soroban do vault (`C...`), nao o issuer do asset e nao o factory address.
3. Para obter um vault, selecione/crie no app da Defindex, crie via `@defindex/sdk` com factory operations, ou peca ao time Defindex/PaltaLabs o vault curado para asset/rede.
4. Para gerar um bloco automaticamente com execucao testnet, rode `npm --prefix backend run defindex:env -- --network testnet --enable-execution`. Para arquivo separado, adicione `--write .env.defindex.testnet`.
5. O script usa `@defindex/sdk`, registry publico e `/vault/discover`. Ele so imprime `DEFINDEX_<ASSET>_VAULT` quando existe vault. Se EURC/TESOURO nao aparecerem, nao configure yield desses assets.
6. Valide com `healthCheck()`, `getVaultInfo()`, `getVaultAPY()` e `getVaultBalance()` antes de expor ao usuario.
7. Use `DEFINDEX_ENABLE_EXECUTION=true` para executar deposit/withdraw em testnet depois de testar assinatura e liquidez. Mainnet exige tambem `DEFINDEX_ALLOW_MAINNET_EXECUTION=true`.
8. Use `DEFINDEX_VAULTS_JSON` so depois de validar outros assets. Por enquanto, priorize `DEFINDEX_USDC_VAULT`, `DEFINDEX_CETES_VAULT` e `DEFINDEX_XLM_VAULT` em testnet.

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

# EURC public network, apenas quando ligar producao/mainnet.
EURC_ISSUER_PUBLIC=GDHU6WRG4IEQXM5NZ4BMPKOXHW76MZM4Y2IEMFDVXBSDP6SJY4ITNPP2

# So preencha se houver issuer testnet confiavel. Por enquanto, testnet usa CETES.
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
5. Defindex usa `DEFINDEX_ENABLE_EXECUTION=true` para execucao em testnet depois de API key e vaults validados. Mainnet exige tambem `DEFINDEX_ALLOW_MAINNET_EXECUTION=true`.
6. Smart account fica com `PASSKEY_SMART_ACCOUNT_ENABLED=false` ate haver verifier P-256 implantado.
7. Por enquanto exponha so `TESOURO,USDC,CETES,XLM`; EURC fica para public/mainnet e extras como `GBP_ISSUER` e `MXN_ISSUER` so entram depois de confirmar codigo real e liquidez/path.
