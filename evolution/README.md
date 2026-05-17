# TalkToStellar Evolution API Local Server

Local WhatsApp automation stack for TalkToStellar:

- Evolution API: `http://localhost:8080`
- Evolution Manager UI: `http://localhost:8080/manager`
- PostgreSQL on host port `5434`
- Redis on host port `6380`
- Persistent WhatsApp session volume mounted at `/evolution/instances`

## Important URL Rule

Use this in your browser:

```text
http://localhost:8080
http://localhost:8080/manager
```

Do not open this in Firefox:

```text
http://127.0.0.1:3001/webhook/evolution
```

The local Evolution API container uses host networking so it can call the backend running on your host machine directly. In this project the webhook target is:

```text
http://127.0.0.1:3001/webhook/evolution
```

That means:

- Browser -> Evolution: `localhost:8080`
- Evolution container -> TalkToStellar backend on host: `127.0.0.1:3001`
- Incoming WhatsApp messages -> TalkToStellar backend webhook -> `/api/agent/query` -> Evolution `sendText`
- If the backend is not running, QR setup can still work. Only webhook delivery and AI replies will fail.

## Start

```bash
cd evolution
docker compose up -d
docker compose ps
```

Health check:

```bash
curl http://localhost:8080/
```

Expected response includes:

```text
Welcome to the Evolution API, it is working!
```

## API Key

Local API key from `.env`:

```text
change-me-talktostellar-evolution-local
```

Change `AUTHENTICATION_API_KEY` and `EVOLUTION_API_KEY` before exposing this server.

In the backend `.env`, set the Evolution values so the webhook can answer through the same instance:

```text
EVOLUTION_API_URL=http://localhost:8080
EVOLUTION_API_KEY=change-me-talktostellar-evolution-local
EVOLUTION_INSTANCE=main
PUBLIC_BACKEND_URL=http://127.0.0.1:3001
EVOLUTION_AGENT_URL=http://127.0.0.1:3001/api/agent/query
EVOLUTION_AGENT_TIMEOUT_MS=45000
```

## QR Setup

The Evolution v2 flow is:

1. Create an instance with `POST /instance/create`.
2. Generate/connect QR with `GET /instance/connect/{instance}`.
3. Scan using WhatsApp Business -> Linked Devices -> Link Device.

Evolution documents `instance/create` with `integration: "WHATSAPP-BAILEYS"` and `qrcode: true`, and `instance/connect/{instance}` returns connection data such as QR/pairing code. See the official docs if the response shape changes.

Do not open `http://localhost:8080/instance/connect` directly in the browser. That path is incomplete and returns `Cannot GET /instance/connect`. The local instance endpoint is `http://localhost:8080/instance/connect/main`, and it requires the API key header, so use the script or Manager UI instead.

### Option A: Scripts

Create instance:

```bash
cd evolution
./scripts/create-instance.sh
```

If the response says `"main" is already in use`, the instance already exists. Continue with the QR command.

Get QR/pairing data:

```bash
cd evolution
./scripts/connect-qr.sh
```

If a QR image/code is returned, the script writes:

```text
qr.html
```

Open it:

```bash
xdg-open qr.html
```

Then scan with:

```text
WhatsApp Business -> Linked Devices -> Link Device
```

### Option B: Manager UI

Open:

```text
http://localhost:8080/manager
```

Use API key:

```text
change-me-talktostellar-evolution-local
```

Create/connect instance `main` and request QR from the UI.

## Manual API Commands

Create instance:

```bash
curl -X POST http://localhost:8080/instance/create \
  -H "Content-Type: application/json" \
  -H "apikey: change-me-talktostellar-evolution-local" \
  -d '{
    "instanceName": "main",
    "token": "main-local-token",
    "qrcode": true,
    "integration": "WHATSAPP-BAILEYS",
    "rejectCall": true,
    "msgCall": "Não consigo atender chamadas por aqui. Envie uma mensagem.",
    "groupsIgnore": true,
    "alwaysOnline": true,
    "readMessages": true,
    "readStatus": true
  }'
```

Connect and get QR:

```bash
curl -X GET http://localhost:8080/instance/connect/main \
  -H "apikey: change-me-talktostellar-evolution-local"
```

If you set `OWNER_NUMBER=5511999999999` in `.env`, the script calls:

```text
GET /instance/connect/main?number=5511999999999
```

## Send Text

After the QR is connected:

```bash
cd evolution
./scripts/send-text.sh 5511999999999 "TalkToStellar conectado."
```

Manual curl:

```bash
curl -X POST http://localhost:8080/message/sendText/main \
  -H "Content-Type: application/json" \
  -H "apikey: change-me-talktostellar-evolution-local" \
  -d '{
    "number": "5511999999999",
    "text": "TalkToStellar conectado."
  }'
```

## Webhook

Current local webhook target:

```text
http://127.0.0.1:3001/webhook/evolution
```

This is correct for this local Linux setup because the Evolution API container runs with host networking.

When this webhook receives a `MESSAGES_UPSERT` event, the backend:

1. Ignores outgoing messages, duplicate events, groups, and non-text payloads.
2. Extracts the WhatsApp number from the remote JID.
3. Checks `/api/external/check-account` with provider `whatsapp`.
4. Sends the message text to `/api/agent/query` with `source: "whatsapp"` and WhatsApp metadata.
5. Sends the agent response back through Evolution `POST /message/sendText/{instance}`.

This is the same inference flow used by Telegram, but the channel metadata is WhatsApp/phone based.

If the TalkToStellar backend also runs inside the same Docker Compose network, change the webhook to the service name instead, for example:

```text
http://backend:3001/webhook/evolution
```

If you deploy to Railway/VPS, use the public HTTPS backend URL:

```text
https://your-backend.com/webhook/evolution
```

## Logs

```bash
cd evolution
docker compose logs -f evolution-api
```

## Restart

```bash
cd evolution
docker compose restart evolution-api
```

## Stop

```bash
cd evolution
docker compose down
```

To delete local state, including WhatsApp session and DB:

```bash
cd evolution
docker compose down -v
```

## Troubleshooting

If Firefox says it cannot connect to `127.0.0.1:3001`, you opened the webhook URL by mistake. Open `http://localhost:8080/manager` instead.

If QR does not appear:

```bash
cd evolution
docker compose logs --tail=200 evolution-api
./scripts/connect-qr.sh
```

If sending messages fails, confirm the instance is connected in the Manager UI and that the recipient number uses country code only digits, for example:

```text
5511999999999
```
