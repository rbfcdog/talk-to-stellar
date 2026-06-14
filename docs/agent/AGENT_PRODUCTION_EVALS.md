# Agent production prompt and evals

Data: 2026-05-23

This document describes the current state of the TalkToStellar agentic layer after prompt hardening and evals.

## Objetivo

Make the agent more predictable in production:

- tool-first for balance, contacts, PIX, payment, conversion, fees, history and receipt;
- no financial confirmation in free text;
- exchange rate and net value always at `get_conversion_preview`/real quote, with no fixed rate at the prompt;
- no SQL, provider, issuer, trustline, XDR, Horizon or technical error leaks;
- rate/savings messages always calculated by tool;
- financial receipt with savings sent by tool after payment/conversion;
- output ready for WhatsApp when coming from approved tools.

## Contrato do prompt

O prompt principal fica em:

```text
backend/src/api/agent/routes.ts
```

The `PRODUCTION AGENT CONTRACT` section defines the hard rules:

- use tools for any account or money data;
- perguntar no maximo uma clarificacao;
- validate real contact before payment to person;
- use `get_conversion_preview` before responding exchange rate, net value or fee BRL -> US$;
- use `show_savings_calculator` for cost comparison;
- use `send_receipt_with_savings` after payment/conversion;
- use `show_annual_savings_summary` for savings summary;
- preserve native WhatsApp Markdown for approved rich messages only;
- nao reutilizar quote expirada;
- mapear erro tecnico para proximo passo acionavel.

## Evals adicionados

Arquivo:

```text
backend/tests/agent-production-eval.test.ts
```

O que ele protege:

1. Questions like "how much does it cost to send 5000 reais" call `show_savings_calculator`.
2. Approved rich messages preserve emojis and WhatsApp `*negrito*`.
3. Comparison with bank/Wise does not fall into the generic flow of financial memory.
4. "how much I saved this year" is called `show_annual_savings_summary`.
5. Emoji/Markdown outside of approved templates continues to be sanitized.
6. The prompt maintains production policies that cannot be regressed.

## Como rodar

```bash
cd backend
npm run eval:agent
```

This command runs the new suite and the most important agentic tests:

- `agent-production-eval.test.ts`
- `agent-conversion-ux.test.ts`
- `agent-pix-offramp.test.ts`
- `agent-payment-link.test.ts`
- `agent-tools.test.ts`

## Criterio de producao

Before touching the prompt, tools or financial messages, run:

```bash
cd backend
npm run build
npm run eval:agent
```

If any eval fails, treat it as UX/agent security regression.
