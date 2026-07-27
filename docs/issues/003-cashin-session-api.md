---
id: ISS-003
spec: SPEC-pagfinance-pix-cashin
status: completed
depends_on: [ISS-001]
created: 2026-07-27
---

# API de sessão para cash-in Pix

## Overview

Expor o cash-in aos clientes autenticados por sessão:
`api/routes/pagfinance.router.ts` + `api/controllers/pagfinance.controller.ts`
montados em `/api/pagfinance`, com `GET /cashin/config`, `POST /cashin/quote`,
`POST /cashin/intent`, `GET /cashin/intent/:intentId` e `GET /cashin/intents`.
Inclui a trava da nossa taxa BRL→USDC no intent, a coleta/persistência de
nome+CPF e a criação da linha em `operations`. É uma issue única porque fecha o
contrato consumido pelo frontend (ISS-006) e a persistência consumida pelo
webhook (ISS-004).

## Surface

- [x] Application code
- [x] Data or infrastructure
- [x] Tests
- [ ] Documentation

## Spec coverage

Seções 2.3 (modelo de dados), 2.5 (auth de sessão), 3.1 (criação de intent e
política de taxa). Fase 3 da implementação.

## Acceptance criteria

- [x] Rotas autenticadas por sessão no padrão `requestInput()` de `ramp.controller.ts:71-85`; `resolveSessionWallet` local espelha `anchor.service.ts:1632` sem o assert de runtime do Etherfuse; 401 em sessão inválida.
- [x] `POST /cashin/intent` valida min/max e `customer {name, taxID}` (CPF por dígitos), provisiona o usuário lazy na PagFinance e cria o intent com `Idempotency-Key`; resposta contém `{operation_id, intent_id, br_code, qr_code_image, payment_link_url, expires_in, usdc_estimate}`.
- [x] A taxa BRL→USDC é a nossa (`BrlReferenceRateService.quoteBrlToUsdc`) com fee via `PlatformFeeService.calculateSpread`, travada e persistida no context (`usdc_net/fee/gross`, `brl_per_usdc`, `rate_locked_at`); `cryptoEstimate` da PagFinance é gravado apenas para reconciliação; em mainnet sem path e sem `PAGFINANCE_FALLBACK_BRL_PER_USDC`, o intent é recusado.
- [x] Operation criada com `type:'PIX_ONRAMP'`, `asset_code:'USDC'` e context com os nomes que feed/histórico consomem (`intent_id`, `anchor_order_id`, `pagfinance_intent_id`, `source_amount_brl`, `final_asset_code`, `external_provider`, `language`), sem migration.
- [x] CPF persistido em `external_accounts.data.cpf` (padrão `external-finalize.controller.ts:572-662`), nunca em `agent_messages`; nome prefill via `wallets.name`; `needs_customer_data` refletido em `GET /cashin/config` e no intent.
- [x] `GET /cashin/intent/:intentId` faz merge local+remoto, marca `FAILED/expired` após `expires_at` (PagFinance não emite webhook de expiração) e, quando o remoto está COMPLETED com local PENDING, dispara o crédito idempotente (caminho de recovery compartilhado com ISS-004).
- [x] 429 da PagFinance exposto com `retry_after_ms` sem auto-retry de POST.

## Notes

O shape de resposta é o contrato do client novo do /pix-on (ISS-006) — mudanças
posteriores exigem atualizar as duas pontas. O disparo de crédito no poll
depende da função de crédito (ISS-002) e do claim idempotente definido na
ISS-004; se a ISS-004 ainda não tiver aterrissado, o poll apenas reporta o
status remoto sem creditar.

## Plan

### Comportamento atual e padrões reutilizáveis

- Auth de sessão: `requestInput()` (`ramp.controller.ts:71-85`) mescla
  query/body/params + headers `x-session-id`/`x-session-token` (e aliases
  `x-talktostellar-*`). Resolução: `AgentRepository.getSession`
  (`repository/core/agent.repository.ts:139`) → compara `session_token` →
  `isSessionExpired` (`utils/session-expiry.ts:20`) →
  `WalletRepository.getWalletBySession` (`core/wallet.repository.ts:103`);
  public key = `session.public_key ?? wallet.public_key`. Versão local SEM o
  assert Etherfuse e sem os fallbacks de email/auto-create do
  `anchor.service.ts:1632` (não são necessários para criar intent).
- Persistência: `OperationRepository.create` (`operation.repository.ts:37`,
  com retry tolerante a colunas ausentes). Tipo `Operation`
  (`types/index.ts:38`): `user_id` obrigatório, `context` TEXT.
- Taxa: `BrlReferenceRateService.quoteBrlToUsdc(amountBrl)`
  (`brl-reference-rate.service.ts:161`) → `{destinationAmount (USDC),
  brlPerUsdc}`; lança em falta de path/sanity. Fee:
  `PlatformFeeService.calculateSpread({sourceAmount: usdcGross,
  sourceAssetCode:'USDC', destinationAssetCode:'BRL'})` →
  `{enabled, feeAmount, netSourceAmount}`.
- CPF: `external_accounts.data` JSONB com índice único global em
  `data->>'cpf'` (dígitos) (`20260613_00_full_schema.sql:549-551`); lookup por
  `session_id` + varredura de `data.cpf` (padrão
  `external-finalize.controller.ts:646-662`). Nome: `wallets.name`.
- Router de referência: `ramp.router.ts` + mount no `app.ts:116`.

### Testes a escrever primeiro

`backend/tests/pagfinance-controller.test.ts` (módulos mockados:
`getPagfinanceService`, repos, `BrlReferenceRateService`, supabase):
1. 401 sem sessão válida; 503 com integração desabilitada.
2. 400 para amount fora de min/max.
3. 422 `needs_customer_data` quando não há CPF/nome salvo nem no request.
4. Happy path: cria operation com context correto (`provider`, `intent_id`,
   `anchor_order_id`, `pagfinance_intent_id`, `source_amount_brl`,
   `final_asset_code`, `value_cents`, `usdc_net/fee/gross`, `brl_per_usdc`,
   `rate_locked_at`, `external_provider`, `language`) e responde
   `{operation_id, intent_id, br_code, qr_code_image, payment_link_url,
   expires_in, usdc_estimate}`.
5. Fallback de taxa: quote lança + PUBLIC + `PAGFINANCE_FALLBACK_BRL_PER_USDC`
   → usa fallback; quote lança sem fallback → 503 `rate_unavailable`.
6. 429 da PagFinance → 429 com `retry_after_ms`.
7. CPF novo é persistido em `external_accounts.data`; CPF já salvo não é
   re-pedido (`needs_customer_data:false` no config com sessão).

### Passos de implementação

1. `backend/tests/pagfinance-controller.test.ts` (vermelho).
2. `backend/src/api/controllers/pagfinance.controller.ts`:
   - `requestInput` local (cópia do padrão ramp), `resolveSession()` (401/409),
     `readCustomerData(sessionId, userId)` / `saveCustomerData(...)` sobre
     `external_accounts` (unique violation → 409 com mensagem clara),
     `resolveRate(amountBrl)` (quote → fallback mainnet → erro),
     handlers `getCashinConfig`, `createCashinQuote`, `createCashinIntent`,
     `getCashinIntent`, `listCashinIntents`.
   - Mapeamento de erro PagFinance: 429 → `{retry_after_ms}`; demais →
     status + `code` propagados.
   - `getCashinIntent`: acha a operation da sessão via `LIKE` no context,
     poll remoto, marca `FAILED/expired` quando vencido; remoto COMPLETED com
     local PENDING → responde `remote_completed:true` (gancho para o crédito
     da ISS-004), sem creditar aqui.
3. `backend/src/api/routes/pagfinance.router.ts` + mount `/api/pagfinance` no
   `app.ts` (ao lado da linha 116).
4. Rodar testes + `tsc`.

### Migrações e compatibilidade

Nenhuma migration (context JSON TEXT; `external_accounts.data` já existe).
Rotas novas — nenhum consumidor existente muda.

### Documentação

Nenhuma nesta issue (ISS-007).

### Validação

```bash
cd backend && npx tsc --noEmit
npx jest tests/pagfinance-controller.test.ts
npx jest tests/pagfinance-hmac.test.ts tests/pagfinance-client.test.ts tests/pagfinance-service.test.ts tests/pagfinance-credit.test.ts
```

### Riscos e não objetivos

- O índice único global de CPF significa que um CPF usado em outra conta gera
  409 — mensagem clara sem vazar a outra conta.
- Nosso `POST /cashin/intent` não é idempotente por chamada (cada request cria
  um intent novo); o frontend não deve auto-retry — igual ao fluxo atual.
- Não objetivos: crédito/claim (ISS-004), UI (ISS-006), webhook-config
  (ISS-005).

## Implementation

Implementado em 2026-07-27:

- `pagfinance.controller.ts` com `requestInput` (padrão ramp), `resolveSession`
  local (getSession → token → `isSessionExpired` → wallet; sem assert
  Etherfuse), `readCustomerData`/`saveCustomerData` sobre
  `external_accounts.data` (unique violation → 409 `cpf_conflict`; outros erros
  de persistência são não-fatais), `isValidCpf` (dígitos verificadores),
  `resolveRate` (path on-chain → fallback env só em PUBLIC → recusa),
  `handleError` (429 → `retry_after_ms`; 5xx upstream → 502).
- Handlers: `getCashinConfig` (switch de provider, `needs_customer_data` com
  sessão opcional), `createCashinQuote` (preview advisory),
  `createCashinIntent` (validação → customer → taxa travada → fee →
  `ensureUser` → intent com Idempotency-Key → operation `PIX_ONRAMP` com
  context completo → resposta com QR), `getCashinIntent` (merge local+remoto,
  expiração → `FAILED/expired`, `PAID_PENDING_CREDIT` como gancho da ISS-004),
  `listCashinIntents`.
- `pagfinance.router.ts` montado em `/api/pagfinance` no `app.ts`.

### Arquivos alterados

- `backend/src/api/controllers/pagfinance.controller.ts` (novo)
- `backend/src/api/routes/pagfinance.router.ts` (novo)
- `backend/src/app.ts` (import + mount, 2 linhas)
- `backend/tests/pagfinance-controller.test.ts` (novo, 14 testes)

### Validação executada

- `npx tsc --noEmit`: passou.
- Suíte pagfinance completa: 5 suítes, 65/65 testes.

## Review

Revisado em 2026-07-27 contra a spec §2.3/§2.5/§3.1 e o plano.

### Findings

1. **Médio — resolvido:** a fixture de teste sem `updated_at` revelou que
   `resolveSession` depende de `isSessionExpired` (TTL 24h sobre
   last_activity/updated_at/created_at) — comportamento correto do controller;
   teste corrigido, sem mudança de produto.
2. **Baixo — aceito:** o `LIKE` no context usa o `intentId` sanitizado por
   regex `INTENT_ID_SAFE` antes da interpolação — sem injeção possível no
   padrão.
3. **Baixo — aceito:** falha não-unique ao persistir CPF é não-fatal (o
   intent prossegue; o usuário será perguntado de novo) — preferível a
   bloquear dinheiro por erro de storage acessório.
4. Nenhum finding crítico/alto aberto.

### Evidências e validações

- 401/503/400/422/409/429 todos cobertos por teste; happy path valida o
  context persistido campo a campo (incluindo `rate_locked_at`,
  `value_cents`, `br_code`) e a chamada a `createIntent` com Idempotency-Key.
- Fallback de taxa coberto nas duas direções (usa em PUBLIC, recusa sem
  fallback) com `createIntent` comprovadamente não chamado na recusa.
- Persistência de CPF nova coberta (insert em `external_accounts` com
  provider `pagfinance`).

### Riscos residuais

- `getCashinIntent` reporta `PAID_PENDING_CREDIT` sem creditar — por design;
  a ISS-004 pluga o claim+crédito neste caminho.
- O shape de resposta é contrato do client da ISS-006.
