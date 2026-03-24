#  Twilio WhatsApp Webhook - Standalone Service

## Overview

This is a **completely separate service** from your backend that handles incoming WhatsApp messages from Twilio. It:

- Receives webhook requests from Twilio
- Validates Twilio signatures (HMAC-SHA1)
- Forwards messages to your TalkToStellar agent API
- Sends responses back to users via Twilio
- Maintains conversation sessions

## Architecture

```
WhatsApp User
     ↓
Twilio API
     ↓ (HTTP POST)
This Service (twilio-webhook)
     ├─ Validate signature
     ├─ Extract message
     └─ Call AGENT API → http://localhost:8000/api/actions/query
           ↓
     TalkToStellar Agent
           ↓
     Response back to Twilio
     ↓
WhatsApp User receives message
```

## Key Features

- ✅ Type-safe TypeScript
- ✅ Twilio signature validation
- ✅ Separate from backend (microservices)
- ✅ Calls external APIs (agent, backend)
- ✅ Session management per phone number
- ✅ Async message processing
- ✅ Error handling & recovery
- ✅ Health check endpoints
- ✅ Comprehensive logging

## Installation

### 1. Install Dependencies
```bash
npm install
```

### 2. Create .env File
```bash
cp .env.example .env
```

### 3. Configure Environment Variables
Edit `.env` and add your Twilio credentials:

```env
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token_here
AGENT_API_URL=http://localhost:8000/api/actions/query
BACKEND_API_URL=http://localhost:3000
PORT=3001
```

**Note**: All API URLs should be **external** (not localhost if deployed to cloud)

## Running Locally

### Start the Service
```bash
npm run dev
```

Service runs on: `http://localhost:3001`

### Expected Output
```
╔════════════════════════════════════════════════════════════╗
║        🚀 Twilio WhatsApp Webhook Service Started          ║
╚════════════════════════════════════════════════════════════╝

📍 Server:        http://localhost:3001
🔗 Webhook:       POST http://localhost:3001/message
📊 Health:        GET  http://localhost:3001/health
...
```

## Endpoints

### POST /message
Receives incoming WhatsApp messages from Twilio.

**Request** (form-encoded from Twilio):
```
From: whatsapp:+1234567890
To: whatsapp:+0987654321
Body: User message
MessageSid: SM1234567890abcdef
```

**Response**:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<Response></Response>
```

### GET /health
Health check.

**Response**:
```json
{
  "status": "OK",
  "service": "Twilio Webhook",
  "timestamp": "2024-03-24T10:30:00Z"
}
```

### GET /status
Service status and configuration.

**Response**:
```json
{
  "status": "active",
  "service": "Twilio WhatsApp Webhook Service",
  "agentApiUrl": "http://localhost:8000/api/actions/query",
  "backendApiUrl": "http://localhost:3000",
  "twilioConfigured": true
}
```

## Configuration in Twilio Console

1. Go to https://www.twilio.com/console
2. Navigate to **Messaging** → **Services** → **WhatsApp**
3. Set **Webhook URL** to:
   ```
   https://your-domain.com/message
   ```
4. Keep **HTTP Method** as `POST`
5. Save configuration

For local testing, use ngrok:
```bash
npm install -g ngrok
ngrok http 3001
# URL: https://xxxx-xx-xxxxx-xxx.ngrok.io/message
```

## Testing

### Test Health Endpoint
```bash
curl http://localhost:3001/health
```

### Test Webhook with cURL
```bash
curl -X POST http://localhost:3001/message \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "From=whatsapp:%2B1234567890" \
  -d "To=whatsapp:%2B0987654321" \
  -d "Body=Hello%20Agent" \
  -d "MessageSid=test123" \
  -d "NumMedia=0"
```

## Build for Production

### Build
```bash
npm run build
```

Creates `dist/` folder with compiled JavaScript.

### Start Production
```bash
npm start
```

## Environment Variables Reference

| Variable | Required | Default | Example |
|----------|----------|---------|---------|
| `TWILIO_ACCOUNT_SID` | ✅ | - | `ACxxxx...` |
| `TWILIO_AUTH_TOKEN` | ✅ | - | `your_token` |
| `AGENT_API_URL` | ❌ | `http://localhost:8000/api/actions/query` | `http://agent.example.com/query` |
| `BACKEND_API_URL` | ❌ | `http://localhost:3000` | `http://backend.example.com` |
| `AGENT_API_TIMEOUT` | ❌ | `30000` | `30000` |
| `PORT` | ❌ | `3001` | `3001` |
| `NODE_ENV` | ❌ | `development` | `production` |

## Development vs Production

| Feature | Development | Production |
|---------|-------------|-----------|
| Signature Validation | Optional | Required |
| CORS | Enabled | Enabled |
| Logging | Console (verbose) | Console + File |
| Port | 3001 | Custom |
| HTTPS | No | Yes |

## Deploying to Cloud

### Using Render

1. Push code to GitHub
2. Create new Render service
3. Set environment variables in Render dashboard
4. Deploy (Render will auto-detect Node.js)
5. Get public URL: `https://your-service.onrender.com`
6. Configure in Twilio console: `https://your-service.onrender.com/message`

### Using Railway

1. Connect GitHub repo
2. Set environment variables
3. Deploy
4. Get public URL: `https://your-service.railway.app`
5. Configure in Twilio console

### Using Heroku

```bash
heroku login
heroku create your-app-name
git push heroku main
# Get URL and configure in Twilio
```

## Monitoring & Logs

All requests and responses are logged:

```
2024-03-24T10:30:00Z POST /message
2024-03-24T10:30:00Z 📱 Received message from Twilio: {...}
2024-03-24T10:30:00Z 📨 Sending to agent: {...}
2024-03-24T10:30:01Z ✓ Agent response received: {...}
2024-03-24T10:30:01Z ✓ Reply sent via Twilio: {...}
```

## Troubleshooting

| Problem | Solution |
|---------|----------|
| "Agent not responding" | Check `AGENT_API_URL` is correct and agent is running |
| "Invalid signature" | Verify `TWILIO_AUTH_TOKEN` is correct |
| "Webhook not receiving" | Check Twilio webhook URL configuration |
| "Timeout errors" | Increase `AGENT_API_TIMEOUT` or check agent is running |

## Project Structure

```
twilio-webhook/
├── src/
│   ├── controllers/
│   │   └── webhook.controller.ts
│   ├── services/
│   │   ├── agent-api.service.ts
│   │   └── twilio-api.service.ts
│   ├── middlewares/
│   │   └── twilio-validation.middleware.ts
│   ├── routes/
│   │   └── webhook.router.ts
│   ├── types.ts
│   ├── config.ts
│   ├── app.ts
│   └── server.ts
├── dist/          (after build)
├── package.json
├── tsconfig.json
├── .env.example
└── README.md
```

## File Descriptions

| File | Purpose |
|------|---------|
| `webhook.controller.ts` | Receives HTTP requests from Twilio, processes, sends replies |
| `agent-api.service.ts` | Calls TalkToStellar agent API |
| `twilio-api.service.ts` | Sends messages via Twilio API |
| `twilio-validation.middleware.ts` | Validates Twilio signatures |
| `webhook.router.ts` | Defines webhook routes |
| `types.ts` | TypeScript interfaces |
| `config.ts` | Environment configuration |
| `app.ts` | Express app setup |
| `server.ts` | Server startup |

## Security

✅ **Signature Validation** - Every request verified with HMAC-SHA1
✅ **Type Safety** - Full TypeScript
✅ **Error Handling** - No sensitive data exposed
✅ **Environment Config** - Secrets in .env, not in code
✅ **CORS** - Configured for security
✅ **Rate Limiting** - Can be added for production

## Next Steps

1. ✅ Copy `.env.example` to `.env`
2. ✅ Add Twilio credentials
3. ✅ Run `npm install`
4. ✅ Run `npm run dev`
5. ✅ Test with `curl` commands above
6. ✅ Configure Twilio webhook URL in console
7. ✅ Send test WhatsApp message

## Support

For issues, check:
1. Logs in terminal (verbose output)
2. Status endpoint: `GET http://localhost:3001/status`
3. Health endpoint: `GET http://localhost:3001/health`
4. Twilio console webhook logs

## License

MIT
