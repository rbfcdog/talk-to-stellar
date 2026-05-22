# User flow smoke tests

Use this check before a demo when you want to catch obvious UX and chat regressions from the same surface the browser uses.

Command:

```bash
node scripts/user-flow-smoke.mjs
```

Default target:

```text
http://localhost:3000
```

Override target:

```bash
USER_FLOW_FRONTEND_URL="https://your-frontend.example" node scripts/user-flow-smoke.mjs
```

## What it checks

Page loads:

- `/`
- `/chat`
- `/login`
- `/create-account`
- `/pix-on?amount=10&asset=BRL&from=chat&flow=fund_and_pay&recipient=Ana%20Silva&auto_pay_after_ramp=1`
- `/pay-anyone?amount=10&asset=USDC`
- `/transactions`

Logged-out chat prompts through `POST /api/chat`:

- `ola`
- `saldo`
- `contatos`
- `quero colocar 10 reais via pix`
- `quero mandar 10 brl em pix pra ana silva`
- `converter 10 reais para dolares`
- `historico`

Expected logged-out behavior:

- HTTP 200 from the frontend proxy.
- A clear account access/onboarding response.
- A usable `/r/`, `/create-account`, or `/login` link.
- No raw technical error in the user-visible answer.

The script fails if the response leaks strings such as:

- `Agent API Error`
- `schema cache`
- `Could not find the table`
- `Check BACKEND_URL`
- `SUPABASE`
- stack traces
- private/seed/secret key language

## Authenticated prompt mode

To test the usual logged-in prompts through the frontend proxy, pass a real browser session pair:

```bash
USER_FLOW_SESSION_ID="SESSION_ID" \
USER_FLOW_SESSION_TOKEN="SESSION_TOKEN" \
node scripts/user-flow-smoke.mjs
```

Authenticated prompts asserted:

- `saldo`
- `contatos`
- `quero colocar 10 reais via pix`
- `quero mandar 10 brl em pix pra ana silva`
- `criar link de pagamento de 25 reais`

Expected authenticated behavior:

- The response should not ask the user to create an account again.
- PIX prompts should return a PIX route/link and preserve amount/recipient.
- Payment-link prompt should return the Pay Anyone flow.
- No raw provider/database/backend error should appear.
