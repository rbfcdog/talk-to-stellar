# Evolution API Railway Deployment

This document is only for the Railway **Evolution API** service. Backend and frontend deployment settings are intentionally not covered here.

## Required Railway Services

Create these services in the same Railway project:

1. `Evolution API`: GitHub service using the `evolution/` root directory.
2. `Postgres`: Railway managed Postgres.
3. `Redis`: Railway managed Redis.
4. `Volume`: mounted on the Evolution API service.

## Evolution API Service Settings

Use these settings for the Evolution API service:

| Setting | Value |
|---|---|
| Source | GitHub repo |
| Root Directory | `evolution` |
| Builder | Dockerfile |
| Dockerfile | `evolution/Dockerfile` |
| Build Command | blank |
| Start Command | blank |
| Public Networking | enabled |
| Volume Mount Path | `/evolution/instances` |

The `evolution/Dockerfile` wraps the official image:

```text
evoapicloud/evolution-api:latest
```

The `evolution/railway.json` file tells Railway to use Dockerfile mode and a `/` healthcheck. Do not deploy the local `evolution/docker-compose.yml` directly on Railway. Use Railway services instead: one GitHub/Dockerfile service, one Postgres service, one Redis service, and one persistent volume.

Alternative manual setup: if you do not want to deploy from this repo, create a Railway service directly from Docker image `evoapicloud/evolution-api:latest` and use the same variables below.

## Values You Need Before Setting Env

Prepare these values:

```text
EVOLUTION_PUBLIC_URL=https://YOUR-EVOLUTION-SERVICE.up.railway.app
BACKEND_PUBLIC_URL=https://YOUR-BACKEND-SERVICE.up.railway.app
EVOLUTION_GLOBAL_API_KEY=make-a-long-random-api-key
EVOLUTION_WEBHOOK_SECRET=make-a-long-random-webhook-secret
```

Important:

- `EVOLUTION_GLOBAL_API_KEY` is the API key you will paste into Evolution Manager.
- The backend variable `EVOLUTION_API_KEY` must use the same value as `EVOLUTION_GLOBAL_API_KEY`.
- The backend variable `EVOLUTION_INSTANCE` must match the Evolution instance name, recommended: `main`.
- The backend variable `EVOLUTION_WEBHOOK_SECRET` must match `EVOLUTION_WEBHOOK_SECRET` below.

## Evolution API Environment Variables

Paste `evolution/railway.env.example` into the Railway Evolution API service variables, then replace the placeholder URLs/secrets. The same contents are reproduced below.

```env
SERVER_TYPE=http
SERVER_PORT=${{PORT}}
SERVER_URL=https://YOUR-EVOLUTION-SERVICE.up.railway.app

AUTHENTICATION_TYPE=apikey
AUTHENTICATION_API_KEY=make-a-long-random-api-key
AUTHENTICATION_EXPOSE_IN_FETCH_INSTANCES=true

DATABASE_ENABLED=true
DATABASE_PROVIDER=postgresql
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
WEBHOOK_GLOBAL_URL=https://YOUR-BACKEND-SERVICE.up.railway.app/api/evolution/webhook?secret=make-a-long-random-webhook-secret
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

If your Railway services are not named exactly `Postgres` and `Redis`, update these references:

```env
DATABASE_CONNECTION_URI=${{YourPostgresService.DATABASE_URL}}
CACHE_REDIS_URI=${{YourRedisService.REDIS_URL}}
```

## Backend Values That Must Match Evolution

These are not set on the Evolution service, but they must match it on the backend service:

```env
EVOLUTION_API_URL=https://YOUR-EVOLUTION-SERVICE.up.railway.app
EVOLUTION_API_KEY=make-a-long-random-api-key
EVOLUTION_INSTANCE=main
EVOLUTION_WEBHOOK_SECRET=make-a-long-random-webhook-secret
```

## Create the WhatsApp Instance

After the Evolution service deploys, open:

```text
https://YOUR-EVOLUTION-SERVICE.up.railway.app/manager
```

Use this API key:

```text
AUTHENTICATION_API_KEY
```

Create an instance with:

```text
Instance name: main
Integration: WHATSAPP-BAILEYS
Reject calls: true
Groups ignore: true
Always online: true
Read messages: true
Read status: true
```

Then connect the instance and scan the QR code from WhatsApp:

```text
WhatsApp Business -> Linked Devices -> Link Device
```

## Webhook Target

Evolution must send incoming messages to the backend:

```text
https://YOUR-BACKEND-SERVICE.up.railway.app/api/evolution/webhook?secret=make-a-long-random-webhook-secret
```

The webhook flow is:

```text
WhatsApp -> Evolution API -> Backend Evolution webhook -> /api/agent/query -> Evolution sendText
```

## Quick Production Test

1. Open Evolution root:

```text
https://YOUR-EVOLUTION-SERVICE.up.railway.app/
```

Expected: Evolution API welcome or health response.

2. Open Evolution Manager:

```text
https://YOUR-EVOLUTION-SERVICE.up.railway.app/manager
```

Expected: Manager UI asks for the API key.

3. Check backend webhook ping:

```text
https://YOUR-BACKEND-SERVICE.up.railway.app/api/evolution/webhook
```

Expected:

```json
{"success":true,"webhook":"evolution"}
```

4. Send a WhatsApp message to the connected number.

Expected:

- Evolution logs show `MESSAGES_UPSERT`.
- Backend logs show `evolution-webhook`.
- WhatsApp receives the AI response from `/api/agent/query`.

## Common Mistakes

- Do not put `localhost` or `127.0.0.1` in Railway URLs.
- Do not use different API keys between Evolution `AUTHENTICATION_API_KEY` and backend `EVOLUTION_API_KEY`.
- Do not forget the persistent volume at `/evolution/instances`; otherwise QR sessions can be lost on redeploy.
- Do not set the webhook to the Evolution URL. The webhook must point to the backend URL.
- Do not name the instance differently unless backend `EVOLUTION_INSTANCE` uses the same name.
