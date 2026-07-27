---
id: ISS-001
spec: SPEC-pagfinance-pix-cashin
status: completed
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

- [x] `hmac.ts` produz o header `Authorization: HMAC-SHA256 partnerId=X,timestamp=Y,nonce=Z,signature=W` exato (sem espaços), com canonical `METHOD\nPATH\nTS\nNONCE\nSHA256(body)` e signingKey `SHA256(rawSecret+":"+partnerId)`.
- [x] `verifyWebhookSignature` opera sobre o body bruto (Buffer), exige prefixo `sha256=`, faz length-check antes de `timingSafeEqual` e retorna false (nunca throw) em qualquer entrada malformada.
- [x] O body enviado é serializado uma única vez; a mesma string é hasheada e transmitida.
- [x] Client faz retry com backoff+jitter em rede/502/503/504, respeita `retryAfter` em 429, nunca faz retry de 4xx determinístico e só repete POST quando `Idempotency-Key` foi enviado; nonce e timestamp são regenerados a cada tentativa.
- [x] `ensureUser` trata CONFLICT como sucesso e aplica o override de KYC (`kycLevel:1, APPROVED`); `getUserJwt` cacheia por pubkey com TTL e se recupera de `USER_NOT_FOUND`/`INSUFFICIENT_KYC` provisionando e tentando 1x.
- [x] `validatePagfinanceConfig` reporta chaves faltantes; o service auto-desabilita sem env e nada quebra no boot com config vazia.
- [x] Testes `pagfinance-hmac.test.ts`, `pagfinance-client.test.ts` e `pagfinance-service.test.ts` passam cobrindo os critérios acima.
- [x] Nenhum secret em código, log ou `.env.example` (placeholders vazios).

## Notes

Não copiar os defeitos do módulo Bridge: ausência de retry
(`bridge/client.ts`), verify sobre `JSON.stringify(req.body)` e
`timingSafeEqual` sem length-check (`bridge/service.ts:466-478`). Mensagens de
erro da API são em PT e não são contrato — rotear por HTTP status + `code`.

## Plan

### Comportamento atual e padrões reutilizáveis

- Não existe nenhum código PagFinance no repo (verificado: zero hits para
  `pagfinance`/`brlp`). O módulo é greenfield.
- Template de layout: `backend/src/integrations/bridge/` —
  `config.ts` com `env()`/`boolEnv()` + `loadBridgeConfig()` +
  `validateBridgeConfig()` retornando chaves faltantes (`config.ts:44-91`);
  `client.ts` com verbos finos sobre `request()` + AbortController/timeout +
  `buildError()` estruturado + `static idempotencyKey(prefix)`
  (`client.ts:58-119`); `service.ts` com singleton
  `getBridgeService()`/`initBridgeService()` (`service.ts:870-878`) e
  auto-disable quando env falta.
- Init no boot: `app.ts:52` importa `initBridgeService` e chama no startup —
  `initPagfinanceService()` entra ao lado.
- Testes: jest (`backend/package.json` `"test": "jest"`), arquivos em
  `backend/tests/*.test.ts`; `bridge.service.test.ts` e
  `bridge-webhook.controller.test.ts` são as referências de estilo (mock de
  `fetch` global, sem rede).
- Contrato PagFinance (guia do parceiro, verificado na sessão de spec):
  signingKey `SHA256(rawSecret+":"+partnerId)` hex; canonical
  `METHOD\nPATH\nTIMESTAMP\nNONCE\nSHA256(body)` (PATH sem query string);
  header `Authorization: HMAC-SHA256 partnerId=<id>,timestamp=<unix-s>,nonce=<uuid>,signature=<hex64>`
  sem espaços; timestamp ±300s; nonce 16-64 chars de uso único (10 min);
  webhook assinado `X-App-Signature: sha256=<hex>` sobre o body bruto com o
  `webhookSecret`; envelope de erro `{success:false, error(pt), code}`;
  `Idempotency-Key` 8-200 chars nos POSTs de dinheiro.

### Testes a escrever primeiro

1. `backend/tests/pagfinance-hmac.test.ts` — derivação da signingKey (vetor
   fixo), canonical com `\n` e PATH sem query, header no formato exato (regex
   estrita, sem espaços, hex de 64), hash do body igual ao hash da string
   exata enviada, hash de string vazia para GET; verify de webhook: happy
   path, body adulterado, assinatura com length errado (**false, sem throw**),
   sem prefixo `sha256=`, secret vazio (false).
2. `backend/tests/pagfinance-client.test.ts` — com `fetch` mockado: retry em
   503 e sucesso na 2ª tentativa; 429 usa `retryAfter` do body; 400
   (`VALIDATION_ERROR`) não faz retry; POST sem Idempotency-Key não faz retry,
   com key faz; nonce/timestamp diferentes entre tentativas (capturados dos
   headers); mapeamento para `PagfinanceApiError {status, code, retryAfter}`.
3. `backend/tests/pagfinance-service.test.ts` — `ensureUser` trata 409/CONFLICT
   como sucesso e chama o PATCH de KYC; cache de JWT reutiliza token válido e
   re-minta expirado; `USER_NOT_FOUND` no mint → `ensureUser` → retry 1x;
   config vazia → service `enabled === false` e métodos lançam erro claro.

### Passos de implementação

1. `backend/src/integrations/pagfinance/hmac.ts` — funções puras:
   `deriveSigningKey`, `hashBody`, `canonicalString`,
   `buildAuthorizationHeader`, `verifyWebhookSignature(rawBody: Buffer,
   header: string, secret: string): boolean`.
2. `backend/src/integrations/pagfinance/types.ts` — `PagfinanceConfig` (via
   config.ts), DTOs: `PagfinanceUser`, `PagfinanceTokenData`, `CashinQuote`,
   `CashinIntent`, `CashinWebhookEnvelope`, `PagfinanceErrorCode` (union),
   `PagfinanceApiError` (classe Error com `status`, `code`, `retryAfter?`,
   `response?`).
3. `backend/src/integrations/pagfinance/config.ts` — interface + `env()`/
   `boolEnv()` locais (padrão Bridge), `loadPagfinanceConfig()`,
   `validatePagfinanceConfig()` (exige `partnerId`, `rawSecret`; warn-only
   `webhookSecret`/treasury). Chaves conforme spec §2.2.
4. `backend/tests/pagfinance-hmac.test.ts` (rodar: deve passar).
5. `backend/src/integrations/pagfinance/client.ts` — `PagfinanceClient` com
   `request(method, path, {body?, auth, idempotencyKey?, query?})`; body
   serializado uma vez; HMAC re-assinado por tentativa; retry 3x com backoff
   500ms→1.5s→4s+jitter (rede/502/503/504; 429 com `retryAfter` cap 15s; POST
   só com key); AbortController/timeout; erros → `PagfinanceApiError`.
6. `backend/tests/pagfinance-client.test.ts` (rodar: deve passar).
7. `backend/src/integrations/pagfinance/service.ts` — `PagfinanceService`:
   `enabled`, `ensureUser(pubkey, profile?)` com `Set` de provisionados,
   `getUserJwt(pubkey)` com `Map` TTL (margem 60s), `createQuote`,
   `createIntent`, `getIntent`, `listIntents`, `registerWebhookConfig`,
   `getWebhookConfig`, `verifyWebhookSignature(rawBody, header)`; singleton
   `initPagfinanceService()`/`getPagfinanceService()`.
8. `backend/tests/pagfinance-service.test.ts` (rodar: deve passar).
9. `backend/src/integrations/pagfinance/index.ts` — barrel com comentário de
   uso (padrão `bridge/index.ts`).
10. `backend/src/app.ts` — import + `initPagfinanceService()` ao lado do
    `initBridgeService()` (linha ~52 do import; init no bloco de startup).

### Migrações e compatibilidade

Nenhuma migration. Nenhuma rota nova nesta issue — o `app.ts` só ganha o init
(inerte com env vazio graças ao auto-disable).

### Documentação

Nenhuma nesta issue (registro no project-brain fica na ISS-007).

### Validação

```bash
cd backend && npx tsc --noEmit
npx jest tests/pagfinance-hmac.test.ts tests/pagfinance-client.test.ts tests/pagfinance-service.test.ts
npx jest tests/bridge.service.test.ts   # regressão do padrão vizinho
```

### Riscos e não objetivos

- O corpo normalizado do servidor é `JSON.stringify(JSON.parse(rawBody))` —
  enviar sempre JSON compacto de `JSON.stringify` puro garante igualdade.
- Rate limit 10/min por pubkey: o client não tenta contornar; 429 é exposto
  com `retryAfter` para o chamador decidir.
- Não objetivos: crédito Stellar (ISS-002), rotas HTTP (ISS-003), webhook
  receiver (ISS-004), scripts (ISS-005). O `verifyWebhookSignature` nasce aqui
  (é contrato de assinatura), mas nenhum endpoint o usa ainda.

## Implementation

Implementado em 2026-07-27, seguindo a ordem do plano (testes de HMAC antes do
client, client antes do service):

- `hmac.ts`: funções puras de assinatura (`deriveSigningKey`, `hashBody`,
  `canonicalString`, `signCanonical`, `buildAuthorizationHeader`) e
  `verifyWebhookSignature` sobre Buffer com prefixo `sha256=` obrigatório,
  regex hex-64 e length-check antes do `timingSafeEqual`.
- `types.ts`: envelope, DTOs de user/token/quote/intent/webhook e
  `PagfinanceApiError` (classe Error com `status`, `code`, `retryAfter?`).
- `config.ts`: `loadPagfinanceConfig()`/`validatePagfinanceConfig()` no padrão
  Bridge; requeridos `PARTNER_ID` + `RAW_SECRET`; default OFF
  (`PAGFINANCE_ENABLED=false`).
- `client.ts`: `PagfinanceClient` com body serializado uma única vez,
  re-assinatura HMAC por tentativa (timestamp+nonce novos), retry 3x com
  backoff 500/1500/4000ms+jitter (rede/502/503/504; 429 honra `retryAfter`
  cap 15s; POST/PATCH só com Idempotency-Key), AbortController/timeout,
  hooks injetáveis (`fetchFn`/`sleepFn`) para teste.
- `service.ts`: `PagfinanceService` com auto-disable, `ensureUser` (CONFLICT =
  sucesso + PATCH KYC nível 1), `getUserJwt` com cache TTL (margem 60s) e
  recovery 1x de `USER_NOT_FOUND`/`INSUFFICIENT_KYC`, métodos de
  quote/intent/list, webhook-config e `verifyWebhookSignature`; singleton
  `initPagfinanceService()`/`getPagfinanceService()`.
- `index.ts`: barrel; `app.ts`: import + `initPagfinanceService()` ao lado do
  `initBridgeService()` (inerte sem env).

### Arquivos alterados

- `backend/src/integrations/pagfinance/hmac.ts` (novo)
- `backend/src/integrations/pagfinance/types.ts` (novo)
- `backend/src/integrations/pagfinance/config.ts` (novo)
- `backend/src/integrations/pagfinance/client.ts` (novo)
- `backend/src/integrations/pagfinance/service.ts` (novo)
- `backend/src/integrations/pagfinance/index.ts` (novo)
- `backend/src/app.ts` (import + init, 2 linhas)
- `backend/tests/pagfinance-hmac.test.ts` (novo, 12 testes)
- `backend/tests/pagfinance-client.test.ts` (novo, 9 testes)
- `backend/tests/pagfinance-service.test.ts` (novo, 12 testes)

### Validação executada

- `npx tsc --noEmit`: passou (exit 0).
- `npx jest tests/pagfinance-*.test.ts tests/bridge.service.test.ts`:
  4 suítes, 35/35 testes passaram (33 novos + regressão Bridge).

## Review

Revisado em 2026-07-27 contra a spec (§2.1–2.2), o plano e o diff completo.

### Findings

1. **Baixo — aceito:** o PATCH de KYC no `ensureUser` não envia
   `Idempotency-Key`, então não é re-tentado em falha transitória. O PATCH é
   idempotente no destino e o `getUserJwt` re-provisiona no próximo uso;
   comportamento aceitável para o fluxo.
2. **Baixo — resolvido por design:** `retryAfter` de 429 é lido do body (o
   contrato da API envia `retryAfter` no JSON, não no header) e limitado a
   15s, evitando sleep arbitrário controlado pelo servidor.
3. Nenhum finding crítico, alto ou médio aberto.

### Evidências e validações

- Formato do header validado por regex estrita no teste (2 tokens, hex-64,
  sem espaços em torno de `=`/`,`).
- Verify de webhook comprovadamente não lança em assinatura malformada
  (testes de length errado, não-hex, sem prefixo, secret vazio).
- Duplicidade de nonce entre tentativas negada por teste (nonces distintos).
- Boot sem env: `PagfinanceService.enabled === false`, init loga
  "disabled" — nenhum crash (coberto por teste de config vazia).

### Riscos residuais

- Cache de JWT em memória: reinício do processo re-minta (aceito no plano).
- O contrato real do sandbox só será exercitado na ISS-005 (E2E) — qualquer
  divergência do guia aparecerá lá, não aqui.
