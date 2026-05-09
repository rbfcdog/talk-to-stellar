# Twilio Webhook Tester

Real webhook server with a live event dashboard. No sandbox — works with your actual Twilio phone number.

## Quick Start

```bash
# 1. Run setup (installs deps, creates .env)
npm run setup

# 2. Fill in .env with your Twilio credentials

# 3. Start the server
npm start

# 4. In another terminal, expose it
ngrok http 3000
```

## Webhook Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/webhook/sms` | Incoming SMS — replies with TwiML |
| POST | `/webhook/voice` | Incoming calls — says a greeting |
| POST | `/webhook/voice/status` | Call status callbacks |

## Dashboard

Open **http://localhost:3000** to see:
- Live event feed (auto-polls every 1.5s)
- SMS/Voice/Outbound counters
- Send outbound SMS for testing
- One-click endpoint URL copy

## Twilio Console Setup

After starting ngrok, go to [console.twilio.com](https://console.twilio.com) → Phone Numbers → your number:

- **Messaging → A Message Comes In**: `https://xxxx.ngrok-free.app/webhook/sms`
- **Voice → A Call Comes In**: `https://xxxx.ngrok-free.app/webhook/voice`
- **Voice → Call Status Changes**: `https://xxxx.ngrok-free.app/webhook/voice/status`
