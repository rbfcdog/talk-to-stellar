# TalkToStellar (HackMeridian)

TalkToStellar is a conversational payments product built on Stellar.
It combines a web chat interface, an AI agent, and a Stellar backend to let users do things like login, manage contacts, check balances, and send payments using natural language.

## Business overview

### Vision

Make blockchain payments feel as simple as messaging, so users in emerging markets can move value globally without needing deep crypto knowledge.

### Problem we solve

- Most users do not understand wallets, keys, assets, and network fees.
- Existing crypto UX is too technical for daily financial use.
- Cross-border and digital-dollar transfers are still fragmented and expensive for many users and small businesses.
- Teams that want to build on Stellar still need to implement complex payment flows and user onboarding.

### Our solution

TalkToStellar turns payment operations into conversation.

Instead of navigating multiple screens and technical terms, users can type what they want (for example, “send 20 USDC to Ana”), and the platform handles intent detection, validation, transaction building, and submission.

### Target users

Primary segments:

1. **Retail users in LatAm**
	- Need simpler dollarized digital payments.
	- Benefit from a chat-first experience and local context (including PIX-related flows).

2. **Freelancers and micro-businesses**
	- Need faster global settlement and simpler contact-based transfers.
	- Benefit from lower friction for repeat payments.

3. **Developers and fintech builders**
	- Need reusable AI + payment infrastructure on Stellar.
	- Benefit from modular backend endpoints and agent orchestration.

### Value proposition

- **For end users:** simpler UX, less confusion, faster task completion.
- **For businesses:** lower support overhead and better conversion from onboarding to first transaction.
- **For ecosystem partners:** more transaction volume enabled by better usability.

### Why now

- Stablecoin usage is growing fast in emerging markets.
- AI assistants are changing how users interact with financial apps.
- Stellar already provides fast and efficient settlement rails; the missing layer is mainstream UX.

### Business model (current hypothesis)

- Transaction-based fee on premium payment actions.
- B2B/API plans for fintechs that want embedded conversational payments.
- Premium features for businesses (analytics, workflow automation, multi-user controls).

### Go-to-market strategy

- Start with focused LatAm payment use cases and Telegram/Discord/web channels.
- Partner with local communities, fintech operators, and Stellar ecosystem programs.
- Use developer-friendly APIs to attract integrators and ecosystem builders.

### Success metrics

- Onboarding completion rate
- First transaction rate
- Time-to-first-payment
- Monthly active transacting users
- Transaction success rate
- Retention (week 4 / month 3)

### Why this team

We combine product execution speed, technical depth across AI + blockchain, and local market understanding.
The project is already delivered as an end-to-end working stack (frontend, AI agent, and Stellar backend), which lets us iterate quickly from prototype to production.

## What this repository contains

This monorepo has three main applications:

1. **Frontend (Next.js)**
	- Path: [frontend/stellar-chat](frontend/stellar-chat)
	- Purpose: chat UI for users
	- Runtime: Node.js

2. **AI Agent (Python + FastAPI + LangChain)**
	- Path: [talktostellar-agent](talktostellar-agent)
	- Purpose: detect intent and orchestrate actions
	- Runtime: Python 3.9+

3. **Core Backend (Node.js + Express + Stellar SDK)**
	- Path: [backend](backend)
	- Purpose: business logic, Stellar operations, data access
	- Runtime: Node.js + TypeScript

## Current architecture

High-level request flow:

1. User sends message in frontend chat.
2. Frontend API route proxies the message to the Python agent.
3. Agent interprets the intent and calls the required backend endpoint(s).
4. Node backend executes Stellar/payment logic and returns results.
5. Agent formats response and frontend renders it.

Key integration points:

- Frontend chat proxy: [frontend/stellar-chat/app/api/chat/route.ts](frontend/stellar-chat/app/api/chat/route.ts)
- Agent API routes: [talktostellar-agent/api/routes.py](talktostellar-agent/api/routes.py)
- Agent tools calling backend: [talktostellar-agent/src/talktostellar_agent/tools.py](talktostellar-agent/src/talktostellar_agent/tools.py)
- Backend action routes: [backend/src/api/routes/actions.router.ts](backend/src/api/routes/actions.router.ts)

## Tech stack

- **Frontend:** Next.js 14, React 19, TypeScript
- **Agent:** FastAPI, LangChain, OpenAI API, uv package manager
- **Backend:** Express, TypeScript, Stellar SDK, Supabase client

## Local development setup

### Prerequisites

- Node.js 18+
- npm
- Python 3.9+
- uv (recommended for the agent)

### 1) Start backend (Node)

From [backend](backend):

```bash
npm install
npm run dev
```

Default URL: `http://localhost:3001`

### 2) Start AI agent (Python)

From [talktostellar-agent](talktostellar-agent):

```bash
uv sync
uv run main.py
```

Default URL: `http://localhost:8000`

### 3) Start frontend chat (Next.js)

From [frontend/stellar-chat](frontend/stellar-chat):

```bash
npm install
npm run dev
```

Default URL: `http://localhost:3000`

## Environment variables

### Frontend ([frontend/stellar-chat](frontend/stellar-chat))

Use:

- `PYTHON_API_URL` (preferred) → server-side API URL used by the Next.js route
- `NEXT_PUBLIC_PYTHON_API_URL` (optional fallback)

Local example:

- `PYTHON_API_URL=http://localhost:8000/api/actions/query`

### Agent ([talktostellar-agent](talktostellar-agent))

Main variables:

- `OPENAI_API_KEY`
- `OPENAI_MODEL`
- `TEMPERATURE`
- `NODE_API_BASE_URL` (usually `http://localhost:3001` locally)
- `INTERNAL_API_SECRET`

### Backend ([backend](backend))

Main variables depend on your deployment/data providers, typically:

- `PORT`
- `STELLAR_NETWORK`
- `DATABASE_URL`
- `INTERNAL_API_SECRET`
- `JWT_SECRET`
- `SUPABASE_URL`
- `SUPABASE_KEY`

## Deployment model (recommended)

- **Frontend** on Vercel
- **Agent** on Render
- **Backend** on Render

Guides already available:

- [DEPLOYMENT_GUIDE.md](DEPLOYMENT_GUIDE.md)
- [QUICK_DEPLOYMENT.md](QUICK_DEPLOYMENT.md)

## Repository structure

```text
hackmeridian/
├── backend/                 # Node.js/Express/Stellar backend
├── talktostellar-agent/     # Python FastAPI + LangChain agent
├── frontend/
│   └── stellar-chat/        # Unified frontend (landing + chat)
├── stellarBots/             # Discord/Telegram bot adapters
├── BUSINESS_OVERVIEW.md
├── TECHNICAL_OVERVIEW.md
└── README.md
```

## Deprecated/legacy note

The active agent implementation is [talktostellar-agent](talktostellar-agent).

## Useful endpoints

### Backend (Node)

- Health: `/health`
- Actions base: `/api/actions/*`

### Agent (Python)

- Health: `/api/actions/health`
- Query: `POST /api/actions/query`
- Docs: `/docs`

## Project status

- ✅ Modular architecture in place
- ✅ Frontend-agent-backend connection implemented
- ✅ Cloud deployment configs prepared (Vercel + Render)
- ✅ Agent migrated to LangChain tool-based orchestration


