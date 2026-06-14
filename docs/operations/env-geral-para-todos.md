# Env geral para todos os servicos

Use o gerador da raiz para criar envs consistentes para backend, frontend e Telegram.
Ele gera segredos internos reais e deixa API keys externas em branco para preencher no painel de cada provider.

## Gerar local

```bash
npm run env:generate -- \
  --frontend-url http://localhost:3000 \
  --backend-url http://localhost:3001 \
  --write-dir .env.generated \
  --force
```

Arquivos criados:

```text
.env.generated/backend.env
.env.generated/frontend.env
.env.generated/telegram.env
.env.generated/README.md
```

## Gerar para producao

```bash
npm run env:generate -- \
  --frontend-url https://seu-frontend.com \
  --backend-url https://seu-backend.com \
  --telegram-url https://seu-telegram-service.com \
  --write-dir .env.generated \
  --force
```

Depois coloque:

- `backend.env` no servico backend.
- `frontend.env` no servico frontend.
- `telegram.env` no servico Telegram.

## O que o script ja gera

- `JWT_SECRET`
- `PIN_PEPPER`
- `INTERNAL_API_SECRET`
- `RAMP_SANDBOX_INTERNAL_SECRET`
- `AGENT_INGEST_SECRET`
- `TELEGRAM_NOTIFY_SECRET`
- `ETHERFUSE_WEBHOOK_SECRET`
- `EVOLUTION_WEBHOOK_SECRET`
- `PASSKEY_RP_ID`
- `PASSKEY_ORIGIN`
- envs publicas do frontend apontando para o backend
- envs do Telegram apontando para o backend

`AGENT_INGEST_SECRET` ja sai igual no backend e Telegram. Esse e o segredo que precisa bater para o bot chamar o agente.

## O que voce ainda precisa preencher manualmente

No backend:

```env
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
SUPABASE_ANON_KEY=
OPENAI_API_KEY=
ETHERFUSE_API_KEY=
TELEGRAM_BOT_TOKEN=
DEFINDEX_API_KEY=
DEFINDEX_USDC_VAULT=
DEFINDEX_CETES_VAULT=
DEFINDEX_XLM_VAULT=
STELLAR_SECRET_KEY=
STELLAR_PUBLIC_KEY=
```

No Telegram:

```env
TELEGRAM_BOT_TOKEN=
TELEGRAM_BOT_USERNAME=
```

## Descobrir vaults Defindex depois

Depois de preencher `DEFINDEX_API_KEY`, rode:

```bash
npm --prefix backend run defindex:env -- --network testnet
```

Copie os valores retornados para o backend:

```env
DEFINDEX_USDC_VAULT=
DEFINDEX_CETES_VAULT=
DEFINDEX_XLM_VAULT=
CETES_ISSUER_TESTNET=
```

Para permitir execucao em testnet, gere com:

```bash
npm run env:generate -- \
  --frontend-url https://seu-frontend.com \
  --backend-url https://seu-backend.com \
  --telegram-url https://seu-telegram-service.com \
  --enable-apy-execution \
  --write-dir .env.generated \
  --force
```

Isso coloca:

```env
DEFINDEX_ENABLE_EXECUTION=true
DEFINDEX_COMPLIANCE_APPROVED=true
```

Ainda assim, a execucao so funciona se tambem existirem `DEFINDEX_API_KEY`, vaults, conta com chave no Vault, PIN correto e saldo suficiente.

## Passkey e OpenZeppelin

Passkey simples ja fica configurada pelo dominio do frontend:

```env
PASSKEY_RP_ID=seu-frontend.com
PASSKEY_ORIGIN=https://seu-frontend.com
NEXT_PUBLIC_PASSKEY_ENABLED=true
```

Se voce ja tiver smart account OpenZeppelin implantada, gere assim:

```bash
npm run env:generate -- \
  --frontend-url https://seu-frontend.com \
  --backend-url https://seu-backend.com \
  --passkey-verifier C... \
  --passkey-context-rule-id 1 \
  --write-dir .env.generated \
  --force
```

Sem `--passkey-verifier` e `--passkey-context-rule-id`, o script deixa:

```env
PASSKEY_SMART_ACCOUNT_ENABLED=false
```

Isso e correto para testar passkey no navegador sem execucao on-chain.

## Telegram 401

Se o Telegram der `401 Unauthorized`, o problema e quase sempre `TELEGRAM_BOT_TOKEN` invalido, token de outro bot ou token copiado incompleto.

Teste antes do deploy:

```bash
curl "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/getMe"
```

Se `getMe` nao retornar `"ok": true`, o servico Telegram tambem nao vai conseguir subir.
