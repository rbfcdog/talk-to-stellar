# Deploy da Evolution API no Railway

Este guia e somente para o servico **Evolution API** no Railway. Ele assume que o backend TalkToStellar ja existe em outro servico Railway e que voce quer conectar o WhatsApp real ao webhook do backend.

## Resultado Esperado

No final, o fluxo fica assim:

```text
WhatsApp -> Evolution API Railway -> Backend /api/evolution/webhook -> Backend /api/agent/query -> Evolution sendText -> WhatsApp
```

O servico Evolution sera deployado a partir desta pasta do repo:

```text
evolution/
```

Arquivos usados no deploy:

```text
evolution/Dockerfile
evolution/railway.json
evolution/railway-entrypoint.sh
evolution/railway.env.example
evolution/.dockerignore
```

O `Dockerfile` usa a imagem oficial:

```text
evoapicloud/evolution-api:latest
```

O wrapper `railway-entrypoint.sh` faz dois ajustes para Railway:

1. Se `SERVER_PORT` nao estiver definido, usa o `PORT` injetado pela Railway.
2. Preenche `DATABASE_URL` e `DATABASE_CONNECTION_URI` com o mesmo Postgres URL, porque a Evolution usa `DATABASE_CONNECTION_URI`, mas o script de migracao Prisma da imagem oficial espera `DATABASE_URL`.

## 1. Criar Servicos Necessarios no Railway

No mesmo projeto Railway, crie:

1. `Evolution API`: servico a partir do GitHub repo.
2. `Postgres`: plugin/servico managed do Railway.
3. `Redis`: plugin/servico managed do Railway.
4. `Volume`: anexado ao servico `Evolution API`.

Nao use `evolution/docker-compose.yml` no Railway. O Compose e so para local. No Railway, Postgres e Redis devem ser servicos separados.

## 2. Configurar o Servico Evolution API

Crie um novo servico a partir do GitHub repo `talk-to-stellar`.

Use exatamente:

| Setting | Valor |
|---|---|
| Source | GitHub repo |
| Root Directory | `evolution` |
| Builder | Dockerfile |
| Dockerfile Path | `Dockerfile` |
| Build Command | vazio |
| Start Command | vazio |
| Public Networking | enabled |
| Healthcheck Path | `/` |
| Volume Mount Path | `/evolution/instances` |

Observacoes:

- O `railway.json` dentro de `evolution/` ja configura Dockerfile mode, healthcheck e restart policy.
- Se a UI do Railway pedir Start Command, deixe vazio. A imagem oficial ja tem entrypoint.
- O volume em `/evolution/instances` e obrigatorio para preservar a sessao do WhatsApp depois de redeploy.

## 3. Criar Volume

Se o campo de volume nao aparecer dentro do servico, isso e normal na UI atual do Railway. O volume costuma ser criado pelo **canvas do projeto**, nao necessariamente dentro de `Settings` do servico.

Opcao A, pela UI:

1. Volte para o canvas principal do projeto Railway.
2. Clique com botao direito em uma area vazia do canvas.
3. Escolha `New` / `Create` / `Volume`.
4. Selecione o servico `Evolution API` quando o Railway pedir o servico conectado.
5. Configure o mount path:

```text
/evolution/instances
```

Opcao B, pela Command Palette:

1. No projeto Railway, pressione `Cmd+K` ou `Ctrl+K`.
2. Procure por `Create Volume` ou `Add Volume`.
3. Selecione o servico `Evolution API`.
4. Use mount path:

```text
/evolution/instances
```

Opcao C, pela Railway CLI:

```bash
railway login
railway link
railway volume add --service "Evolution API" --mount-path /evolution/instances
```

Se seu servico tiver outro nome, troque `"Evolution API"` pelo nome real do servico.

Sem esse volume, a sessao escaneada por QR pode ser perdida em restart/redeploy.

Depois de criar o volume, o Railway injeta automaticamente variaveis como `RAILWAY_VOLUME_MOUNT_PATH` em runtime. Voce nao precisa configurar essa variavel manualmente.

## 4. Gerar Dominios Publicos

Voce precisa de dois dominios:

```text
EVOLUTION_PUBLIC_URL=https://YOUR-EVOLUTION-SERVICE.up.railway.app
BACKEND_PUBLIC_URL=https://YOUR-BACKEND-SERVICE.up.railway.app
```

No Railway:

1. Abra o servico `Evolution API`.
2. Va em `Settings` -> `Networking`.
3. Clique em `Generate Domain`.
4. Copie a URL gerada.

Faca o mesmo no servico do backend, se ainda nao tiver dominio publico.

Nao use `localhost` ou `127.0.0.1` em producao.

## 5. Variaveis do Servico Evolution API

No servico `Evolution API`, abra `Variables` e cole o conteudo de:

```text
evolution/railway.env.example
```

Depois substitua:

```text
YOUR-EVOLUTION-SERVICE.up.railway.app
YOUR-BACKEND-SERVICE.up.railway.app
change-me-long-random-evolution-global-api-key
change-me-long-random-evolution-webhook-secret
```

Template completo:

```env
SERVER_TYPE=http
SERVER_PORT=${{PORT}}
SERVER_URL=https://YOUR-EVOLUTION-SERVICE.up.railway.app

AUTHENTICATION_TYPE=apikey
AUTHENTICATION_API_KEY=change-me-long-random-evolution-global-api-key
AUTHENTICATION_EXPOSE_IN_FETCH_INSTANCES=true

DATABASE_ENABLED=true
DATABASE_PROVIDER=postgresql
DATABASE_URL=${{Postgres.DATABASE_URL}}
DATABASE_CONNECTION_URI=${{Postgres.DATABASE_URL}}
DATABASE_CONNECTION_CLIENT_NAME=evolution
DATABASE_SAVE_DATA_INSTANCE=true
DATABASE_SAVE_DATA_NEW_MESSAGE=true
DATABASE_SAVE_MESSAGE_UPDATE=true
DATABASE_SAVE_DATA_CONTACTS=true
DATABASE_SAVE_DATA_CHATS=true
DATABASE_SAVE_DATA_LABELS=true
DATABASE_SAVE_DATA_HISTORIC=true

CACHE_REDIS_ENABLED=true
CACHE_REDIS_URI=${{Redis.REDIS_URL}}
CACHE_REDIS_PREFIX_KEY=evolution
CACHE_REDIS_TTL=604800
CACHE_REDIS_SAVE_INSTANCES=true
CACHE_LOCAL_ENABLED=false

STORE_MESSAGES=true
STORE_MESSAGE_UP=true
STORE_CONTACTS=true
STORE_CHATS=true

WEBHOOK_GLOBAL_ENABLED=true
WEBHOOK_GLOBAL_URL=https://YOUR-BACKEND-SERVICE.up.railway.app/api/evolution/webhook?secret=change-me-long-random-evolution-webhook-secret
WEBHOOK_GLOBAL_WEBHOOK_BY_EVENTS=false
WEBHOOK_GLOBAL_WEBHOOK_BASE64=false
WEBHOOK_EVENTS_APPLICATION_STARTUP=false
WEBHOOK_EVENTS_QRCODE_UPDATED=true
WEBHOOK_EVENTS_MESSAGES_SET=false
WEBHOOK_EVENTS_MESSAGES_UPSERT=true
WEBHOOK_EVENTS_MESSAGES_EDITED=false
WEBHOOK_EVENTS_MESSAGES_UPDATE=false
WEBHOOK_EVENTS_MESSAGES_DELETE=false
WEBHOOK_EVENTS_SEND_MESSAGE=false
WEBHOOK_EVENTS_CONTACTS_SET=false
WEBHOOK_EVENTS_CONTACTS_UPSERT=false
WEBHOOK_EVENTS_CONTACTS_UPDATE=false
WEBHOOK_EVENTS_PRESENCE_UPDATE=false
WEBHOOK_EVENTS_CHATS_SET=false
WEBHOOK_EVENTS_CHATS_UPSERT=false
WEBHOOK_EVENTS_CHATS_UPDATE=false
WEBHOOK_EVENTS_CHATS_DELETE=false
WEBHOOK_EVENTS_GROUPS_UPSERT=false
WEBHOOK_EVENTS_GROUPS_UPDATE=false
WEBHOOK_EVENTS_GROUP_PARTICIPANTS_UPDATE=false
WEBHOOK_EVENTS_CONNECTION_UPDATE=true
WEBHOOK_EVENTS_LABELS_EDIT=false
WEBHOOK_EVENTS_LABELS_ASSOCIATION=false
WEBHOOK_EVENTS_CALL=false
WEBHOOK_EVENTS_TYPEBOT_START=false
WEBHOOK_EVENTS_TYPEBOT_CHANGE_STATUS=false
WEBHOOK_EVENTS_ERRORS=true
WEBHOOK_EVENTS_ERRORS_WEBHOOK=true

CONFIG_SESSION_PHONE_CLIENT=TalkToStellar
CONFIG_SESSION_PHONE_NAME=Chrome
QRCODE_LIMIT=30
DEL_INSTANCE=false

CORS_ORIGIN=*
CORS_METHODS=GET,POST,PUT,DELETE
CORS_CREDENTIALS=true

LOG_LEVEL=INFO
LOG_COLOR=true
LOG_BAILEYS=error
TELEMETRY=false
```

Se seus servicos Railway nao se chamarem exatamente `Postgres` e `Redis`, altere:

```env
DATABASE_URL=${{NomeDoSeuPostgres.DATABASE_URL}}
DATABASE_CONNECTION_URI=${{NomeDoSeuPostgres.DATABASE_URL}}
CACHE_REDIS_URI=${{NomeDoSeuRedis.REDIS_URL}}
```

## 6. Variaveis Correspondentes no Backend

No servico backend, estas variaveis precisam apontar para a Evolution:

```env
EVOLUTION_API_URL=https://YOUR-EVOLUTION-SERVICE.up.railway.app
EVOLUTION_API_KEY=change-me-long-random-evolution-global-api-key
EVOLUTION_INSTANCE=TalkToStellar
EVOLUTION_NOTIFY_INSTANCE=TalkToStellar
EVOLUTION_DEFAULT_INSTANCE=TalkToStellar
EVOLUTION_WEBHOOK_SECRET=change-me-long-random-evolution-webhook-secret
EVOLUTION_AGENT_URL=https://YOUR-BACKEND-SERVICE.up.railway.app/api/agent/query
EVOLUTION_AGENT_TIMEOUT_MS=120000
EVOLUTION_CONTENT_DEDUPE_TTL_MS=90000
EVOLUTION_SEND_FAILURE_FALLBACK=false
PUBLIC_BACKEND_URL=https://YOUR-BACKEND-SERVICE.up.railway.app
```

Regras importantes:

- `EVOLUTION_API_KEY` no backend deve ser igual a `AUTHENTICATION_API_KEY` na Evolution.
- `EVOLUTION_WEBHOOK_SECRET` no backend deve ser igual ao `secret` usado em `WEBHOOK_GLOBAL_URL`.
- `EVOLUTION_INSTANCE` deve ser igual ao nome da instancia criada na Evolution. Pelos logs atuais do projeto, use `TalkToStellar`.
- Nao use `main` se a Evolution mostra a instancia conectada como `TalkToStellar`. O erro `The "main" instance does not exist` significa que o backend esta apontando para a instancia errada.
- `EVOLUTION_CONTENT_DEDUPE_TTL_MS=90000` evita respostas duplicadas quando a Evolution reenvia o mesmo webhook em ate 90 segundos. A deduplicacao tambem usa a tabela `idempotency_keys` do Supabase, entao ela funciona mesmo com restart ou mais de uma instancia do backend.

## 7. Deploy

Depois de configurar variaveis, faca deploy do servico `Evolution API`.

Sinais de sucesso nos logs:

```text
Database connected
Redis connected
Evolution API
```

Abra:

```text
https://YOUR-EVOLUTION-SERVICE.up.railway.app/
```

Esperado: pagina/resposta de boas-vindas da Evolution API.

## 8. Abrir Manager e Criar Instancia

Abra:

```text
https://YOUR-EVOLUTION-SERVICE.up.railway.app/manager
```

Use como API key:

```text
AUTHENTICATION_API_KEY
```

Crie a instancia:

```text
Instance name: TalkToStellar
Integration: WHATSAPP-BAILEYS
Reject calls: true
Groups ignore: true
Always online: true
Read messages: true
Read status: true
```

Depois clique para conectar e escaneie o QR:

```text
WhatsApp Business -> Linked Devices -> Link Device
```

## 9. Webhook

O webhook precisa apontar para o backend:

```text
https://YOUR-BACKEND-SERVICE.up.railway.app/api/evolution/webhook?secret=change-me-long-random-evolution-webhook-secret
```

Como `WEBHOOK_GLOBAL_URL` ja esta nas variaveis, normalmente a Evolution usa esse webhook automaticamente.

Se quiser configurar pelo backend, rode no servico backend:

```bash
npm run evolution:configure-webhook
```

Esse script usa:

```env
EVOLUTION_API_URL
EVOLUTION_API_KEY
EVOLUTION_INSTANCE
PUBLIC_BACKEND_URL
EVOLUTION_WEBHOOK_SECRET
```

Use apenas um caminho de webhook ativo. Se `WEBHOOK_GLOBAL_URL` estiver ligado nas variaveis da Evolution, nao mantenha tambem um webhook configurado manualmente na instancia para a mesma URL. Dois caminhos ativos podem fazer a Evolution entregar o mesmo `MESSAGES_UPSERT` duas vezes.

## 10. Testes de Producao

### Teste 1: Evolution online

Abra:

```text
https://YOUR-EVOLUTION-SERVICE.up.railway.app/
```

Esperado: Evolution responde.

### Teste 2: Manager abre

Abra:

```text
https://YOUR-EVOLUTION-SERVICE.up.railway.app/manager
```

Esperado: Manager pede API key.

### Teste 3: Backend webhook responde

Abra:

```text
https://YOUR-BACKEND-SERVICE.up.railway.app/api/evolution/webhook
```

Esperado:

```json
{"success":true,"webhook":"evolution"}
```

### Teste 4: WhatsApp responde com IA

Envie uma mensagem para o numero conectado no WhatsApp.

Esperado:

1. Logs da Evolution mostram `MESSAGES_UPSERT`.
2. Logs do backend mostram `evolution-webhook`.
3. Backend chama `/api/agent/query` com `source: "whatsapp"`.
4. WhatsApp recebe a resposta do agente.

## 11. Troubleshooting

### Manager nao abre

Verifique:

- Public Networking habilitado.
- `SERVER_PORT=${{PORT}}`.
- `DATABASE_URL=${{Postgres.DATABASE_URL}}`.
- `DATABASE_CONNECTION_URI=${{Postgres.DATABASE_URL}}`.
- Deploy sem crash nos logs.
- Healthcheck `/`.

### API key nao funciona no Manager

Use exatamente:

```text
AUTHENTICATION_API_KEY
```

Nao use `EVOLUTION_API_KEY` aqui, a menos que voce tenha criado essa variavel manualmente com o mesmo valor.

### WhatsApp desconecta apos redeploy

Verifique se o volume esta montado em:

```text
/evolution/instances
```

### Backend nao recebe webhook

Verifique:

- `WEBHOOK_GLOBAL_ENABLED=true`
- `WEBHOOK_EVENTS_MESSAGES_UPSERT=true`
- `WEBHOOK_GLOBAL_URL` aponta para o backend, nao para a Evolution.
- O `secret` da URL bate com `EVOLUTION_WEBHOOK_SECRET` no backend.
- Nao existe webhook duplicado na instancia apontando para a mesma URL se voce ja usa `WEBHOOK_GLOBAL_URL`.

### Backend recebe webhook mas nao responde no WhatsApp

Verifique no backend:

```env
EVOLUTION_API_URL=https://YOUR-EVOLUTION-SERVICE.up.railway.app
EVOLUTION_API_KEY=mesmo-valor-do-AUTHENTICATION_API_KEY
EVOLUTION_INSTANCE=TalkToStellar
EVOLUTION_AGENT_URL=https://YOUR-BACKEND-SERVICE.up.railway.app/api/agent/query
EVOLUTION_CONTENT_DEDUPE_TTL_MS=90000
```

### WhatsApp recebe duas respostas iguais

Verifique:

- O backend esta com a versao atual, que grava dedupe persistente em `idempotency_keys`.
- `EVOLUTION_CONTENT_DEDUPE_TTL_MS=90000` esta no backend. Pode subir para `120000` se a Evolution estiver reentregando com atraso.
- A Evolution nao esta com webhook global e webhook da instancia ativos ao mesmo tempo para a mesma URL.
- O backend no Railway nao esta rodando dois servicos diferentes apontados pelo mesmo webhook.

### Erro de Postgres ou Redis

Verifique se as referencias batem com os nomes reais dos servicos:

```env
DATABASE_URL=${{Postgres.DATABASE_URL}}
DATABASE_CONNECTION_URI=${{Postgres.DATABASE_URL}}
CACHE_REDIS_URI=${{Redis.REDIS_URL}}
```

Se os servicos tiverem outro nome, troque `Postgres` e `Redis`.

## 12. Checklist Final

- [ ] Servico Railway criado a partir do GitHub repo.
- [ ] Root Directory = `evolution`.
- [ ] Builder = Dockerfile.
- [ ] Start Command vazio.
- [ ] Public domain gerado para Evolution.
- [ ] Postgres criado.
- [ ] Redis criado.
- [ ] Volume montado em `/evolution/instances`.
- [ ] Variaveis coladas de `evolution/railway.env.example`.
- [ ] `SERVER_URL` aponta para a Evolution.
- [ ] `DATABASE_URL` e `DATABASE_CONNECTION_URI` apontam para o Postgres.
- [ ] `WEBHOOK_GLOBAL_URL` aponta para o backend.
- [ ] Backend tem `EVOLUTION_API_URL`, `EVOLUTION_API_KEY`, `EVOLUTION_INSTANCE` e `EVOLUTION_WEBHOOK_SECRET`.
- [ ] Manager abriu.
- [ ] Instancia `TalkToStellar` criada.
- [ ] QR escaneado.
- [ ] WhatsApp recebeu resposta do agente.
