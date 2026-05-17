# Railway Full Stack Deployment

Este guia cria tudo que a instancia WhatsApp precisa para funcionar no Railway:

```text
Frontend -> Backend -> Evolution API -> WhatsApp
                    -> Supabase
Evolution API -> Postgres
Evolution API -> Redis
Evolution API -> Volume /evolution/instances
```

Use o mesmo projeto Railway para todos os servicos.

## Ordem Correta

Crie nesta ordem:

1. Supabase externo, se ainda nao existir.
2. Railway Postgres para Evolution.
3. Railway Redis para Evolution.
4. Backend TalkToStellar.
5. Evolution API.
6. Volume da Evolution.
7. Frontend TalkToStellar.
8. Instancia WhatsApp `main` dentro da Evolution Manager.

## 1. Supabase

O backend usa Supabase para dados do produto, wallet/session e tabelas da aplicacao. Ele nao usa o Postgres da Evolution para isso.

No Supabase, pegue:

```env
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
SUPABASE_ANON_KEY=...
SUPABASE_JWT_SECRET=...
```

Use a service role key no backend. Nao coloque service role key no frontend.

## 2. Criar Postgres da Evolution

No Railway:

1. Abra o projeto.
2. Clique em `New`.
3. Escolha `Database`.
4. Escolha `PostgreSQL`.
5. Renomeie o servico para:

```text
Postgres
```

O nome importa porque os templates usam:

```env
${{Postgres.DATABASE_URL}}
```

Se voce usar outro nome, ajuste as variaveis depois.

## 3. Criar Redis da Evolution

No Railway:

1. Clique em `New`.
2. Escolha `Database`.
3. Escolha `Redis`.
4. Renomeie para:

```text
Redis
```

O template usa:

```env
${{Redis.REDIS_URL}}
```

## 4. Criar Backend

Crie um novo servico a partir do GitHub repo.

Settings:

| Setting | Valor |
|---|---|
| Source | GitHub repo |
| Root Directory | `backend` |
| Builder | Dockerfile |
| Dockerfile Path | `Dockerfile` |
| Build Command | vazio |
| Start Command | vazio |
| Healthcheck Path | `/health` |
| Public Networking | enabled |

O arquivo `backend/railway.json` ja configura Dockerfile, healthcheck e restart policy.

Gere dominio publico no backend:

```text
https://YOUR-BACKEND-SERVICE.up.railway.app
```

Variaveis minimas do backend:

```env
NODE_ENV=production
JWT_SECRET=change-me-long-random-jwt-secret
INTERNAL_API_SECRET=change-me-long-random-internal-secret

SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
SUPABASE_ANON_KEY=...
SUPABASE_JWT_SECRET=...

OPENAI_API_KEY=...
OPENAI_MODEL=gpt-4o-mini
TEMPERATURE=0.5

STELLAR_NETWORK=TESTNET
STELLAR_HORIZON_URL=https://horizon-testnet.stellar.org
STELLAR_FRIENDBOT_URL=https://friendbot.stellar.org
STELLAR_FRIENDBOT_TIMEOUT_MS=5000

USDC_ISSUER=GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5
BRL_ISSUER_PUBLIC=GDVKY2GU2DRXWTBEYJJWSFXIGBZV6AZNBVVSUHEPZI54LIS6BA7DVVSP
BRL_ISSUER_TESTNET=
BRL_ISSUER_SECRET=
BRL_DISTRIBUTOR_PUBLIC=
BRL_DISTRIBUTOR_SECRET=
BRL_MARKET_MAKER_PUBLIC=
BRL_MARKET_MAKER_SECRET=

ETHERFUSE_API_KEY=api_sand:your-api-key:your-organization-id
ETHERFUSE_BASE_URL=https://api.sand.etherfuse.com
ETHERFUSE_BLOCKCHAIN=stellar
ENABLE_TESOURO_ASSET=true
TESOURO_ISSUER=GC3CW7EDYRTWQ635VDIGY6S4ZUF5L6TQ7AA4MWS7LEQDBLUSZXV7UPS4

PUBLIC_BACKEND_URL=https://YOUR-BACKEND-SERVICE.up.railway.app

FRONTEND_URL=https://YOUR-FRONTEND-SERVICE.up.railway.app
PUBLIC_APP_URL=https://YOUR-FRONTEND-SERVICE.up.railway.app
CREATE_ACCOUNT_BASE=https://YOUR-FRONTEND-SERVICE.up.railway.app
PAYMENT_CONFIRM_BASE=https://YOUR-FRONTEND-SERVICE.up.railway.app

PASSKEY_RP_ID=YOUR-FRONTEND-SERVICE.up.railway.app
PASSKEY_ORIGIN=https://YOUR-FRONTEND-SERVICE.up.railway.app
PASSKEY_RP_NAME=TalkToStellar

EVOLUTION_API_URL=https://YOUR-EVOLUTION-SERVICE.up.railway.app
EVOLUTION_API_KEY=change-me-long-random-evolution-global-api-key
EVOLUTION_INSTANCE=main
EVOLUTION_WEBHOOK_SECRET=change-me-long-random-evolution-webhook-secret
EVOLUTION_AGENT_URL=https://YOUR-BACKEND-SERVICE.up.railway.app/api/agent/query
EVOLUTION_AGENT_TIMEOUT_MS=45000

QUOTE_TTL_SECONDS=30
ENABLE_BRL_ASSET=true
ENABLE_DAILY_SUMMARY=true
DAILY_SUMMARY_TIMEZONE=America/Sao_Paulo
```

Depois de criar frontend/evolution e gerar os dominios, volte no backend e substitua os placeholders.

## 5. Criar Evolution API

Crie outro servico a partir do mesmo GitHub repo.

Settings:

| Setting | Valor |
|---|---|
| Source | GitHub repo |
| Root Directory | `evolution` |
| Builder | Dockerfile |
| Dockerfile Path | `Dockerfile` |
| Build Command | vazio |
| Start Command | vazio |
| Healthcheck Path | `/` |
| Public Networking | enabled |

O arquivo `evolution/railway.json` ja configura Dockerfile, healthcheck e restart policy.

Gere dominio publico:

```text
https://YOUR-EVOLUTION-SERVICE.up.railway.app
```

Variaveis:

Cole o arquivo:

```text
evolution/railway.env.example
```

Substitua:

```text
YOUR-EVOLUTION-SERVICE.up.railway.app
YOUR-BACKEND-SERVICE.up.railway.app
change-me-long-random-evolution-global-api-key
change-me-long-random-evolution-webhook-secret
```

Obrigatorio manter:

```env
SERVER_PORT=${{PORT}}
DATABASE_URL=${{Postgres.DATABASE_URL}}
DATABASE_CONNECTION_URI=${{Postgres.DATABASE_URL}}
CACHE_REDIS_URI=${{Redis.REDIS_URL}}
```

Se Postgres/Redis tiverem outros nomes, ajuste as referencias.

## 6. Criar Volume da Evolution

O volume preserva a sessao WhatsApp.

UI:

1. Volte para o canvas do projeto Railway.
2. Clique com botao direito em area vazia.
3. Escolha `Create Volume` ou `New Volume`.
4. Conecte ao servico `Evolution API`.
5. Mount path:

```text
/evolution/instances
```

Command Palette:

1. `Cmd+K` ou `Ctrl+K`.
2. Procure `Create Volume`.
3. Escolha o servico `Evolution API`.
4. Mount path `/evolution/instances`.

CLI:

```bash
railway login
railway link
railway volume add --service "Evolution API" --mount-path /evolution/instances
```

## 7. Criar Frontend

Crie outro servico a partir do GitHub repo.

Settings:

| Setting | Valor |
|---|---|
| Source | GitHub repo |
| Root Directory | `frontend` |
| Builder | Dockerfile |
| Dockerfile Path | `Dockerfile` |
| Build Command | vazio |
| Start Command | vazio |
| Healthcheck Path | `/` |
| Public Networking | enabled |

O arquivo `frontend/railway.json` ja configura Dockerfile, healthcheck e restart policy.

Gere dominio:

```text
https://YOUR-FRONTEND-SERVICE.up.railway.app
```

Variaveis do frontend:

```env
NODE_ENV=production
BACKEND_URL=https://YOUR-BACKEND-SERVICE.up.railway.app
AGENT_API_URL=https://YOUR-BACKEND-SERVICE.up.railway.app/api/agent/query
NEXT_PUBLIC_BACKEND_URL=https://YOUR-BACKEND-SERVICE.up.railway.app
NEXT_PUBLIC_AGENT_API_URL=https://YOUR-BACKEND-SERVICE.up.railway.app/api/agent/query
NEXT_PUBLIC_FRONTEND_URL=https://YOUR-FRONTEND-SERVICE.up.railway.app
```

Depois que o frontend tiver dominio, volte no backend e atualize:

```env
FRONTEND_URL=https://YOUR-FRONTEND-SERVICE.up.railway.app
PUBLIC_APP_URL=https://YOUR-FRONTEND-SERVICE.up.railway.app
CREATE_ACCOUNT_BASE=https://YOUR-FRONTEND-SERVICE.up.railway.app
PAYMENT_CONFIRM_BASE=https://YOUR-FRONTEND-SERVICE.up.railway.app
PASSKEY_RP_ID=YOUR-FRONTEND-SERVICE.up.railway.app
PASSKEY_ORIGIN=https://YOUR-FRONTEND-SERVICE.up.railway.app
```

## 8. Criar Instancia WhatsApp na Evolution

Abra:

```text
https://YOUR-EVOLUTION-SERVICE.up.railway.app/manager
```

Use a API key:

```text
AUTHENTICATION_API_KEY
```

Crie:

```text
Instance name: main
Integration: WHATSAPP-BAILEYS
Reject calls: true
Groups ignore: true
Always online: true
Read messages: true
Read status: true
```

Escaneie:

```text
WhatsApp Business -> Linked Devices -> Link Device
```

## 9. Conferir Webhook

Webhook esperado na Evolution:

```text
https://YOUR-BACKEND-SERVICE.up.railway.app/api/evolution/webhook?secret=change-me-long-random-evolution-webhook-secret
```

Se precisar forcar pelo backend:

```bash
npm run evolution:configure-webhook
```

## 10. Testes

Backend:

```text
https://YOUR-BACKEND-SERVICE.up.railway.app/health
```

Esperado:

```json
{"status":"OK"}
```

Evolution:

```text
https://YOUR-EVOLUTION-SERVICE.up.railway.app/
```

Manager:

```text
https://YOUR-EVOLUTION-SERVICE.up.railway.app/manager
```

Frontend:

```text
https://YOUR-FRONTEND-SERVICE.up.railway.app/
```

Webhook ping:

```text
https://YOUR-BACKEND-SERVICE.up.railway.app/api/evolution/webhook
```

Esperado:

```json
{"success":true,"webhook":"evolution"}
```

Teste final:

1. Envie mensagem no WhatsApp para o numero conectado.
2. Evolution logs devem mostrar `MESSAGES_UPSERT`.
3. Backend logs devem mostrar `evolution-webhook`.
4. WhatsApp deve receber resposta do agente.

## Checklist

- [ ] Postgres criado e chamado `Postgres`.
- [ ] Redis criado e chamado `Redis`.
- [ ] Backend criado com root `backend`.
- [ ] Backend tem dominio publico.
- [ ] Evolution criada com root `evolution`.
- [ ] Evolution tem dominio publico.
- [ ] Evolution tem volume em `/evolution/instances`.
- [ ] Frontend criado com root `frontend`.
- [ ] Frontend tem dominio publico.
- [ ] Backend aponta para frontend e Evolution.
- [ ] Evolution aponta para backend no `WEBHOOK_GLOBAL_URL`.
- [ ] `EVOLUTION_API_KEY` no backend e igual a `AUTHENTICATION_API_KEY` na Evolution.
- [ ] Instancia Evolution se chama `main`.
- [ ] QR do WhatsApp foi escaneado.
- [ ] Mensagem WhatsApp gera resposta do agente.

## Referencias Railway

- Volumes: https://docs.railway.com/volumes
- Public networking e `PORT`: https://docs.railway.com/public-networking
- Variaveis e referencias `${{Service.VAR}}`: https://docs.railway.com/variables
- Dockerfiles: https://docs.railway.com/reference/dockerfiles
- Config as Code: https://docs.railway.com/config-as-code/reference
