# TalkToStellar Frontend

## Onboarding flow example

The account creation example lives at `/create-account`.

It expects a dynamic URL like:

```text
http://localhost:3000/create-account?token=<jwt>
```

The page reads the `token` query param and POSTs it to:

```text
POST ${NEXT_PUBLIC_BACKEND_URL}/api/external/finalize
```

Set these variables in `.env.local`:

```bash
NEXT_PUBLIC_BACKEND_URL=http://localhost:3001
NEXT_PUBLIC_AGENT_API_URL=http://localhost:3001/api/agent/query
NEXT_PUBLIC_FRONTEND_URL=http://localhost:3000
```

Set this in the backend so it generates the same onboarding URL:

```bash
CREATE_ACCOUNT_BASE=http://localhost:3000
```

The Telegram bot uses `/api/external/check-account` to decide whether it should send the user this URL or forward the message directly to the agent.

## Payment confirmation flow

The payment confirmation example lives at `/confirm-payment`.

It expects a dynamic URL like:

```text
http://localhost:3000/confirm-payment?token=<jwt>
```

The page reads the `token` query param and POSTs it to:

```text
POST ${NEXT_PUBLIC_BACKEND_URL}/api/external/finalize
```

The backend uses the token payload to load the stored wallet secret and submit the payment.
