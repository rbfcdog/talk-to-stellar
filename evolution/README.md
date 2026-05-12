# TalkToStellar Evolution API Local Server

Local WhatsApp automation stack for TalkToStellar:

- Evolution API on `http://localhost:8080`
- PostgreSQL on host port `5434`
- Redis on host port `6380`
- Persistent WhatsApp session volume mounted at `/evolution/instances`

## Start

```bash
cd evolution
docker compose up -d
```

Open:

```text
http://localhost:8080
```

## API Key

Local API key from `.env`:

```text
change-me-talktostellar-evolution-local
```

Change `AUTHENTICATION_API_KEY` before exposing the server.

## Create Instance

```bash
curl -X POST http://localhost:8080/instance/create \
  -H "Content-Type: application/json" \
  -H "apikey: change-me-talktostellar-evolution-local" \
  -d '{
    "instanceName": "main",
    "token": "main-local-token",
    "qrcode": true,
    "integration": "WHATSAPP-BAILEYS"
  }'
```

## Connect And Scan QR

```bash
curl -X GET http://localhost:8080/instance/connect/main \
  -H "apikey: change-me-talktostellar-evolution-local"
```

On the phone:

```text
WhatsApp Business -> Linked Devices -> Link Device
```

Scan the QR returned by Evolution.

## Send Text

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

The local webhook target is:

```text
http://host.docker.internal:3001/webhook/evolution
```

Update `WEBHOOK_GLOBAL_URL` in `.env` when the TalkToStellar backend exposes the final Evolution webhook route.

## Stop

```bash
cd evolution
docker compose down
```

To delete local state:

```bash
cd evolution
docker compose down -v
```
