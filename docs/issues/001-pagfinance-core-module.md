---
id: ISS-001
spec: SPEC-pagfinance-pix-cashin
status: pending
depends_on: []
created: 2026-07-27
---

# Core do módulo PagFinance

## Overview

Criar `backend/src/integrations/pagfinance/` no padrão de
`integrations/bridge/`: `hmac.ts` (assinatura de request e verify de webhook,
funções puras), `types.ts`, `config.ts`, `client.ts` (HTTP com retry/backoff e
Idempotency-Key), `service.ts` (singleton com auto-disable, provisioning lazy
de usuário, cache de JWT, métodos de cash-in e webhook-config) e `index.ts`,
com `initPagfinanceService()` chamado no `app.ts`. É uma issue única porque
fecha o contrato de comunicação com a PagFinance — tudo que vem depois (crédito,
rotas, webhook) só consome este módulo.

## Surface

- [x] Application code
- [ ] Data or infrastructure
- [x] Tests
- [ ] Documentation

## Spec coverage

Seções 2.1 (módulo e autenticação), 2.2 (configuração/env) e gates 1–2 da
seção 4. Fase 1 da implementação.

## Acceptance criteria

- [ ] `hmac.ts` produz o header `Authorization: HMAC-SHA256 partnerId=X,timestamp=Y,nonce=Z,signature=W` exato (sem espaços), com canonical `METHOD\nPATH\nTS\nNONCE\nSHA256(body)` e signingKey `SHA256(rawSecret+":"+partnerId)`.
- [ ] `verifyWebhookSignature` opera sobre o body bruto (Buffer), exige prefixo `sha256=`, faz length-check antes de `timingSafeEqual` e retorna false (nunca throw) em qualquer entrada malformada.
- [ ] O body enviado é serializado uma única vez; a mesma string é hasheada e transmitida.
- [ ] Client faz retry com backoff+jitter em rede/502/503/504, respeita `retryAfter` em 429, nunca faz retry de 4xx determinístico e só repete POST quando `Idempotency-Key` foi enviado; nonce e timestamp são regenerados a cada tentativa.
- [ ] `ensureUser` trata CONFLICT como sucesso e aplica o override de KYC (`kycLevel:1, APPROVED`); `getUserJwt` cacheia por pubkey com TTL e se recupera de `USER_NOT_FOUND`/`INSUFFICIENT_KYC` provisionando e tentando 1x.
- [ ] `validatePagfinanceConfig` reporta chaves faltantes; o service auto-desabilita sem env e nada quebra no boot com config vazia.
- [ ] Testes `pagfinance-hmac.test.ts`, `pagfinance-client.test.ts` e `pagfinance-service.test.ts` passam cobrindo os critérios acima.
- [ ] Nenhum secret em código, log ou `.env.example` (placeholders vazios).

## Notes

Não copiar os defeitos do módulo Bridge: ausência de retry
(`bridge/client.ts`), verify sobre `JSON.stringify(req.body)` e
`timingSafeEqual` sem length-check (`bridge/service.ts:466-478`). Mensagens de
erro da API são em PT e não são contrato — rotear por HTTP status + `code`.
