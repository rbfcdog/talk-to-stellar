# Agent production prompt and evals

Data: 2026-05-23

Este documento descreve o estado atual da camada agentica do TalkToStellar depois do hardening de prompt e evals.

## Objetivo

Deixar o agente mais previsivel em producao:

- tool-first para saldo, contatos, PIX, pagamento, conversao, taxa, historico e recibo;
- sem confirmacao financeira em texto livre;
- sem vazamento de SQL, provider, issuer, trustline, XDR, Horizon ou erro tecnico;
- mensagens de taxa/economia sempre calculadas por tool;
- recibo financeiro com economia enviado por tool depois de pagamento/conversao;
- output pronto para WhatsApp quando vier dos tools aprovados.

## Contrato do prompt

O prompt principal fica em:

```text
backend/src/api/agent/routes.ts
```

A secao `PRODUCTION AGENT CONTRACT` define as regras duras:

- usar ferramentas para qualquer dado de conta ou dinheiro;
- perguntar no maximo uma clarificacao;
- validar contato real antes de pagamento para pessoa;
- usar `show_savings_calculator` para comparacao de custo;
- usar `send_receipt_with_savings` depois de pagamento/conversao;
- usar `show_annual_savings_summary` para resumo de economia;
- preservar Markdown nativo do WhatsApp apenas para mensagens ricas aprovadas;
- nao reutilizar quote expirada;
- mapear erro tecnico para proximo passo acionavel.

## Evals adicionados

Arquivo:

```text
backend/tests/agent-production-eval.test.ts
```

O que ele protege:

1. Perguntas como "quanto custa enviar 5000 reais" chamam `show_savings_calculator`.
2. Mensagens ricas aprovadas preservam emojis e `*negrito*` do WhatsApp.
3. Comparacao com banco/Wise nao cai no fluxo generico de memoria financeira.
4. "quanto eu economizei esse ano" chama `show_annual_savings_summary`.
5. Emoji/Markdown fora dos templates aprovados continua sendo sanitizado.
6. O prompt mantem as politicas de producao que nao podem regredir.

## Como rodar

```bash
cd backend
npm run eval:agent
```

Esse comando roda a suite nova e os testes agenticos mais importantes:

- `agent-production-eval.test.ts`
- `agent-conversion-ux.test.ts`
- `agent-pix-offramp.test.ts`
- `agent-payment-link.test.ts`
- `agent-tools.test.ts`

## Criterio de producao

Antes de mexer em prompt, tools ou mensagens financeiras, rode:

```bash
cd backend
npm run build
npm run eval:agent
```

Se algum eval falhar, trate como regressao de UX/seguranca do agente.
