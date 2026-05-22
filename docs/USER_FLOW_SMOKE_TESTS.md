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

Override backend target used by direct agent checks:

```bash
USER_FLOW_BACKEND_URL="https://your-backend.example" node scripts/user-flow-smoke.mjs
```

Run repeated prompt cycles:

```bash
USER_FLOW_REPEAT=2 node scripts/user-flow-smoke.mjs
```

Run optional prompts that may call the LLM:

```bash
USER_FLOW_INCLUDE_LLM=1 USER_FLOW_TIMEOUT_MS=45000 node scripts/user-flow-smoke.mjs
```

## What it checks

Page loads:

- `/`
- `/chat`
- `/login`
- `/login?expired=1`
- `/create-account`
- `/pix-on?amount=10&asset=BRL&from=chat&flow=fund_and_pay&recipient=Ana%20Silva&auto_pay_after_ramp=1`
- `/pix-off?amount=5&asset=BRL&from=chat`
- `/pix-ramp?mode=onramp&amount=10&asset=BRL&from=chat`
- `/pay-anyone?amount=10&asset=USDC`
- `/claim-payment`
- `/confirm-payment`
- `/receipt`
- `/mainnet`
- `/transactions`

Logged-out chat prompts through `POST /api/chat`:

- `ola`
- `login`
- `criar conta`
- `saldo`
- `contatos`
- `qual meu saldo tecnico em xlm?`
- `quero colocar 10 reais via pix`
- `quero mandar 10 brl em pix pra ana silva`
- `sacar 5 reais por pix`
- `mandar 12 reais para meu pix`
- `enviar 5 dolares para Ana`
- `criar link de pagamento de 25 reais`
- `converter 10 reais para dolares`
- `historico`
- `quero comprovante`

Expected logged-out behavior:

- HTTP 200 from the frontend proxy.
- A clear account access/onboarding response.
- A usable `/r/`, `/create-account`, or `/login` link.
- No raw technical error in the user-visible answer.

Direct agent prompts through `POST /api/agent/query`:

- `quero colocar 10 reais via pix`
- `quero colocar dinheiro via pix`
- `quero mandar 10 brl em pix pra ana silva`
- `quero fazer uma trasacao pra ana silva de 10 brl na qual eu pago via pix`
- `sacar 5 reais por pix`
- `mandar 12 reais para meu pix`
- `quero sacar via pix`
- `quero mandar 10 usdc pra fora da minha conta`
- `quero acessar minha conta`
- `quero criar conta`
- `English`

Expected direct-agent behavior:

- PIX add-money prompts return a `/pix-on` or short `/r/` route.
- PIX recipient prompts preserve amount and recipient.
- PIX own-destination/money-out prompts return a `/pix-off` or short `/r/` route.
- Missing amount prompts ask for the amount instead of timing out.
- Login/onboarding prompts return an access link.
- Language switch returns a simple language confirmation.

The script fails if the response leaks strings such as:

- `Agent API Error`
- `schema cache`
- `Could not find the table`
- `Check BACKEND_URL`
- `SUPABASE`
- stack traces
- `erro desconhecido` / `unknown error`
- private/seed/secret key language

For chat answers, it also fails if normal user-facing copy leaks technical terms such as:

- `XLM`
- `trustline`
- `Horizon`
- `issuer`
- `public key`
- `session_id`

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
