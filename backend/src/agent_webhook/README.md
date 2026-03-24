# Twilio WhatsApp Webhook Integration

This folder contains the integration code for receiving and processing WhatsApp messages via Twilio webhooks.

## 📋 Overview

The webhook endpoint receives messages from Twilio, forwards them to the TalkToStellar agent for processing, and sends responses back to the user via WhatsApp.

### Flow Diagram
```
WhatsApp User
    ↓
Twilio (receives message)
    ↓
Your Backend Webhook (POST /agent-webhook/message)
    ↓
TalkToStellar Agent (processes message)
    ↓
Twilio (sends response back)
    ↓
WhatsApp User (receives response)
```

## 🔧 Installation

1. **Install Twilio SDK**:
```bash
npm install twilio
```

2. **Create `.env` file** in the backend directory with:
```env
# Twilio Configuration
TWILIO_ACCOUNT_SID=your_account_sid_here
TWILIO_AUTH_TOKEN=your_auth_token_here

# Python Agent Configuration
PYTHON_API_URL=http://localhost:8000/api/actions/query
PYTHON_API_TIMEOUT=30000

# Server Configuration
NODE_ENV=development
```

3. **Get Twilio Credentials**:
   - Visit [Twilio Console](https://www.twilio.com/console)
   - Copy your `Account SID` and `Auth Token`
   - Store them in `.env` file

## 🚀 Setup Twilio Webhook

### 1. Expose Your Backend

You need a public URL for Twilio to send webhooks. Options:

**Option A: Using ngrok (Development)**
```bash
npm install -g ngrok
ngrok http 3000
# Copy the URL: https://xxxx-xx-xxx-xxx-xx.ngrok.io
```

**Option B: Deploy to Cloud**
- Deploy your backend to Render, Heroku, Railway, etc.
- Use the public URL from your deployment

### 2. Configure Twilio Webhook

1. Go to [Twilio Console](https://www.twilio.com/console)
2. Navigate to **Messaging** → **Services** → Create a Service (or use existing)
3. Select **WhatsApp** integration
4. In **Integration**, set the **Webhook URL**:
   ```
   https://your-public-url/agent-webhook/message
   ```
5. Keep **Request method** as `POST`
6. Save the configuration

## 📝 Endpoints

### POST `/agent-webhook/message`
Main webhook endpoint for receiving WhatsApp messages from Twilio.

**Request** (form-encoded from Twilio):
```
From: whatsapp:+1234567890
To: whatsapp:+0987654321
Body: User's message content
MessageSid: unique_message_id
NumMedia: 0
```

**Response**:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<Response></Response>
```

**Processing**: 
- Validates Twilio signature (if `TWILIO_AUTH_TOKEN` is configured)
- Sends message to TalkToStellar agent
- Automatically replies via Twilio to the user

### GET `/agent-webhook/health`
Health check endpoint.

**Response**:
```json
{
  "status": "OK",
  "service": "Twilio Webhook",
  "timestamp": "2024-03-24T10:30:00.000Z"
}
```

### GET `/agent-webhook/status`
Webhook status and configuration.

**Response**:
```json
{
  "status": "active",
  "service": "Twilio WhatsApp Webhook",
  "pythonApiUrl": "http://localhost:8000/api/actions/query",
  "timestamp": "2024-03-24T10:30:00.000Z",
  "version": "1.0.0"
}
```

## 🔐 Security

### Twilio Signature Validation
The webhook automatically validates Twilio signatures using:
- Request URL
- Request body parameters
- Twilio Auth Token

This prevents unauthorized requests to your webhook.

**Development**: Signature validation is skipped if `TWILIO_AUTH_TOKEN` is not set.
**Production**: Always set `TWILIO_AUTH_TOKEN` to enable validation.

## 🧪 Testing

### 1. Test Locally with ngrok

```bash
# Terminal 1: Start your backend
cd backend
npm run dev

# Terminal 2: Start ngrok
ngrok http 3000

# Terminal 3: Test the webhook
curl -X GET http://localhost:3000/agent-webhook/health
```

### 2. Test with Twilio Console

1. Go to Twilio WhatsApp dashboard
2. Test message button
3. Send a message and verify the webhook receives it

### 3. Test with Python Agent

Make sure the TalkToStellar agent is running:
```bash
cd talktostellar-agent
python main.py
```

## 📦 File Structure

```
backend/
└── src/
    └── agent_webhook/
        ├── controllers/
        │   └── twilio.controller.ts     # Webhook request handlers
        ├── middlewares/
        │   └── twilio-validation.middleware.ts  # Signature validation
        ├── services/
        │   └── twilio.service.ts        # Agent communication logic
        ├── routes/
        │   └── twilio.router.ts         # Route definitions
        └── types.ts                      # TypeScript types
```

## 🔗 Integration Points

### Backend ↔ Twilio Agent
- **File**: `backend/src/agent_webhook/services/twilio.service.ts`
- **Connection**: HTTP POST to Python API
- **Format**: `{ query, session_id, source }`

### Backend ↔ Python Agent
- **URL**: `http://localhost:8000/api/actions/query`
- **Method**: POST
- **Response**: `{ result: { message, task, params } }`

## 🐛 Debugging

### Enable Logs

```typescript
// Logs are printed to console by default
// Add more logging as needed in controllers/services
```

### Common Issues

| Issue | Solution |
|-------|----------|
| Invalid Twilio signature | Check `TWILIO_AUTH_TOKEN` is correct |
| Agent not responding | Verify Python API is running and accessible |
| Message not delivered | Check Twilio WhatsApp number is verified |
| Timeout errors | Increase `PYTHON_API_TIMEOUT` in `.env` |

## 📚 Additional Resources

- [Twilio WhatsApp Docs](https://www.twilio.com/docs/whatsapp)
- [Twilio Node.js SDK](https://www.twilio.com/docs/libraries/node)
- [Webhook Security](https://www.twilio.com/docs/usage/webhooks/webhooks-security)
- [ngrok Documentation](https://ngrok.com/docs)

## ✅ Checklist

- [ ] Twilio account created and credentials obtained
- [ ] `.env` file configured with Twilio credentials
- [ ] `twilio` npm package installed
- [ ] Backend running on port 3000
- [ ] ngrok or public URL configured
- [ ] Twilio webhook URL configured in console
- [ ] Python agent running on port 8000
- [ ] Webhook endpoint tested successfully
- [ ] WhatsApp message received and response sent
