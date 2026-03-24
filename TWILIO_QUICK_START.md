# 🎯 Quick Reference Guide - Twilio Webhook

## In 30 Seconds

Your backend now has **3 new webhook endpoints**:

```
GET  http://your-backend/agent-webhook/health  → Health check
GET  http://your-backend/agent-webhook/status  → Service status
POST http://your-backend/agent-webhook/message → Receives WhatsApp messages
```

## How It Works

```
WhatsApp User sends: "Hello"
        ↓
Twilio sends: POST /agent-webhook/message
        ↓
Backend receives message
        ↓
Backend calls: POST http://localhost:8000/api/actions/query
        ↓
Agent processes: "Hello"
        ↓
Agent returns: "Hi! How can I help?"
        ↓
Backend sends to Twilio: "Hi! How can I help?"
        ↓
WhatsApp User receives: "Hi! How can I help?"
```

## 3-Minute Setup

### Step 1: Install Twilio SDK
```bash
npm install  # Or npm install twilio
```

### Step 2: Copy & Configure .env
```bash
cp .env.example .env
```

Then add to `.env`:
```
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token_here
```

**Get these from:** https://www.twilio.com/console

### Step 3: Start Your Services

Terminal 1 - Backend:
```bash
npm run dev
```

Terminal 2 - Python Agent:
```bash
cd ../talktostellar-agent
python main.py
```

Terminal 3 - Test (after both are running):
```bash
curl http://localhost:3000/agent-webhook/health
```

Should return:
```json
{
  "status": "OK",
  "service": "Twilio Webhook",
  "timestamp": "2024-03-24T10:30:00Z"
}
```

### Step 4: Configure in Twilio Console

1. Go to https://www.twilio.com/console
2. Go to **Messaging** → **Services**
3. Find your WhatsApp service
4. Set **Webhook URL**: `https://your-domain.com/agent-webhook/message`
5. Click **Save**

That's it! Now WhatsApp messages will flow to your agent! ✨

## File Locations

```
backend/src/agent_webhook/
├── README.md           ← Full setup guide
├── API.md             ← Complete API docs
├── ARCHITECTURE.md    ← System design
├── types.ts           ← TypeScript types
├── controllers/twilio.controller.ts
├── services/twilio.service.ts
├── middlewares/twilio-validation.middleware.ts
└── routes/twilio.router.ts
```

Or check the summary:
```
backend/TWILIO_SETUP.md ← This file has all the details!
```

## Testing

### Quick Health Check
```bash
curl http://localhost:3000/agent-webhook/health
```

### Full Test Suite
```bash
cd backend
chmod +x test-webhook.sh
./test-webhook.sh
```

### Manual Message Test
```bash
curl -X POST http://localhost:3000/agent-webhook/message \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "From=whatsapp:%2B1234567890" \
  -d "To=whatsapp:%2B0987654321" \
  -d "Body=Hello%20Agent" \
  -d "MessageSid=test123" \
  -d "NumMedia=0"
```

## Key Components

| File | Purpose |
|------|---------|
| `twilio.controller.ts` | Receives HTTP requests, calls agent, sends replies |
| `twilio.service.ts` | Communicates with Python agent API |
| `twilio-validation.middleware.ts` | Validates Twilio signatures (security) |
| `twilio.router.ts` | Defines the 3 webhook endpoints |
| `types.ts` | TypeScript interfaces |

## Environment Variables

| Variable | Required | Example |
|----------|----------|---------|
| `TWILIO_ACCOUNT_SID` | ✅ | `ACxxxxxx...` |
| `TWILIO_AUTH_TOKEN` | ✅ | `your_token_here` |
| `PYTHON_API_URL` | ❌ | `http://localhost:8000/api/actions/query` |
| `PYTHON_API_TIMEOUT` | ❌ | `30000` |

## Session Management

Each WhatsApp user gets a unique session ID:

```
Phone: whatsapp:+14155552671
Session: whatsapp-14155552671-development
```

This allows the agent to remember conversation context across messages.

## Security

✅ **Signature Validation** - Verifies messages are really from Twilio
✅ **Environment Variables** - Credentials not in code
✅ **Error Handling** - No sensitive data in error messages
✅ **HTTPS** - Always use in production

## Troubleshooting

| Problem | Solution |
|---------|----------|
| "Agent not responding" | Check Python agent is running on port 8000 |
| "Invalid signature" | Verify `TWILIO_AUTH_TOKEN` in .env is correct |
| "Webhook not receiving messages" | Check public URL and Twilio webhook configuration |
| "Message not delivered" | Check WhatsApp number is verified in Twilio |

## Common Commands

```bash
# Install dependencies
npm install

# Start backend (dev mode)
npm run dev

# Build backend (production)
npm run build

# Check webhook health
curl http://localhost:3000/agent-webhook/health

# Check webhook status
curl http://localhost:3000/agent-webhook/status

# Run tests
./test-webhook.sh

# Using ngrok (for local testing)
ngrok http 3000
```

## Architecture Snapshot

```
┌─────────────────┐
│  WhatsApp User  │
└────────┬────────┘
         │ Message
         ▼
┌─────────────────┐
│  Twilio API     │
└────────┬────────┘
         │ HTTP POST
         ▼
┌──────────────────────────────────────┐
│  Your Backend (Express Node.js)      │
│  :3000                               │
│                                      │
│  POST /agent-webhook/message  ──┐   │
│  GET  /agent-webhook/health   │   │
│  GET  /agent-webhook/status   │   │
└──────────────┬──────────────────────┘
               │ HTTP POST
               ▼
         ┌─────────────────┐
         │ Python Agent    │
         │ FastAPI :8000   │
         │                 │
         │ /api/actions/*  │
         └─────────────────┘
```

## What Changed in Your Project

### ✅ NEW FILES
- `backend/src/agent_webhook/` - Complete webhook system
- `backend/setup-twilio.sh` - Setup automation
- `backend/test-webhook.sh` - Testing script
- `backend/TWILIO_SETUP.md` - This summary

### ✅ MODIFIED FILES
- `backend/src/app.ts` - Added Twilio routes
- `backend/package.json` - Added twilio SDK
- `backend/.env.example` - Added Twilio config

### ❌ NOT CHANGED
- `talktostellar-agent/` - No changes needed
- `frontend/` - No changes needed

## Production Deployment

1. Deploy backend to cloud (Render, Railway, Heroku, etc.)
2. Set environment variables on cloud platform:
   - `TWILIO_ACCOUNT_SID`
   - `TWILIO_AUTH_TOKEN`
3. Update webhook URL in Twilio console to your cloud domain
4. Test with real WhatsApp message

## Example Response Flow

**Client sends:**
```
From: whatsapp:+14155552671
Body: What is my balance?
```

**Agent returns:**
```json
{
  "result": {
    "message": "Your stellar balance is 100 XLM",
    "task": "check_balance",
    "params": { "balance": "100", "currency": "XLM" }
  }
}
```

**User receives:**
```
Your stellar balance is 100 XLM
```

## Next Steps

1. ✅ Install dependencies: `npm install`
2. ✅ Configure .env with Twilio credentials
3. ✅ Start backend: `npm run dev`
4. ✅ Start agent: `python main.py`
5. ✅ Test endpoints: `./test-webhook.sh`
6. ✅ Configure Twilio webhook URL
7. ✅ Send real WhatsApp message to test

## Support Resources

- **Setup Guide**: `backend/src/agent_webhook/README.md`
- **API Docs**: `backend/src/agent_webhook/API.md`
- **Architecture**: `backend/src/agent_webhook/ARCHITECTURE.md`
- **Summary**: `backend/TWILIO_SETUP.md`

---

**You're ready to go!** 🚀 Your Twilio WhatsApp bot is live.
