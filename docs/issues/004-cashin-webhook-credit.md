---
id: ISS-004
spec: SPEC-pagfinance-pix-cashin
status: completed
depends_on: [ISS-002, ISS-003]
created: 2026-07-27
---

# Webhook CASHIN_COMPLETED e crédito

## Overview

Receber e liquidar a confirmação de pagamento: hook de raw-body no
`app.ts:83` (`express.json({verify})`), receiver `/webhook/pagfinance` com
verificação de assinatura sobre os bytes brutos, claim atômico anti-duplicata
(`PENDING→CREDITING` condicional), crédito USDC async via ISS-002, atualização
da operation (`COMPLETED` + `stellar_transaction_hash`) e recibo/notificação
via `PaymentReceiptService.sendReceipt`. É o coração do fluxo — a issue fecha o
ciclo dinheiro-entrou → dinheiro-creditado → usuário-avisado.

## Surface

- [x] Application code
- [x] Data or infrastructure
- [x] Tests
- [ ] Documentation

## Spec coverage

Seções 2.5 (raw body, secret obrigatório), 3.2 (webhook, transições, recovery)
e gate 3 da seção 4. Fase 4 da implementação.

## Acceptance criteria

- [x] `app.ts:83` captura o raw body via `express.json({verify})` sem mudança de comportamento para as demais rotas.
- [x] Assinatura inválida ou ausente → 401; `PAGFINANCE_WEBHOOK_SECRET` não configurado → rejeição (nunca fail-open); verificação sobre `req.rawBody`, não sobre re-serialização.
- [x] Só `CASHIN_COMPLETED` é processado; outros eventos → ack 200 sem efeito.
- [x] Claim atômico: update condicional `PENDING→CREDITING` no supabase; entrega duplicada ou replay → ack 200 e **nenhum segundo crédito** (comprovado em teste).
- [x] Handler responde 200 imediatamente; o crédito roda async; `walletAddress`/`valueCents` divergentes da operation → `FAILED` com motivo, sem crédito.
- [x] Sucesso → `COMPLETED` + `stellar_transaction_hash` preenchido (deduplica contra a entrada Horizon no histórico) + `context.final_amount/receipt_url`; falha → `FAILED` + `context.credit_error`.
- [x] `sendReceipt({type:'payment_received', dedupeKey:'pix-onramp:<operationId>', sourceAssetCode:'BRL', destinationAssetCode:'USDC', ...})` dispara recibo + mensagem no chat + Telegram/WhatsApp no idioma do usuário (`language` do context).
- [x] `pagfinance-webhook.controller.test.ts` cobre 401, intent desconhecido (200 ignored), duplicata credita 1x, mismatch → FAILED e as transições de status.
- [x] Depois desta issue, uma operation COMPLETED aparece exatamente 1x no histórico e no activity feed sem mudanças nesses serviços.

## Notes

O caminho de crédito disparado pelo poll do `getIntent` (ISS-003) usa o mesmo
claim condicional — a exclusão mútua entre webhook e poll é por status no
banco, nunca por lock em memória. Retries da PagFinance: 3x/2-4-8s, sem ordem,
com duplicatas por design.

## Plan

### Comportamento atual e padrões reutilizáveis

- `app.ts:85` usa `express.json()` sem captura de raw body — adicionar
  `{verify}` hook (o `express.raw` por rota não funciona após o json global).
- Verify de assinatura: `PagfinanceService.verifyWebhookSignature(rawBody,
  header)` (ISS-001, sobre bytes brutos, secret ausente → false).
- Crédito: `creditUsdcToUser` + `resolveCreditDestination` (ISS-002).
- Operation: `findOperationByPagfinanceIntentId` global (sem sessão — o
  webhook não tem sessão) via `LIKE` no context; claim atômico com update
  condicional supabase `.update({status:'CREDITING'}).eq('id').in('status',
  [...]).select()` (0 linhas = duplicata). `OperationRepository.update`
  (`operation.repository.ts:68`) tolera hash Stellar duplicado.
- Recibo + notificação: `PaymentReceiptService.sendReceipt`
  (`payment-receipt.service.ts:405`, `type:'payment_received'`,
  `PaymentReceiptInput` em `:15-49`) — entrega chat + Telegram/WhatsApp +
  savings numa chamada; `dedupeKey:'pix-onramp:<operationId>'`.
- Email para destino mainnet: `agent_sessions.email` por `session_id`.
- Padrão de controller de webhook: `bridge-webhook.controller.ts` (ack rápido,
  `void` no processamento) — sem copiar o skip de verificação.

### Testes a escrever primeiro

`backend/tests/pagfinance-webhook.controller.test.ts` (supabase/repos/credit/
receipt mockados; assinatura REAL via `hmac.ts` com secret de teste):
1. 401 em assinatura inválida/ausente; 401 quando `webhookSecret` não está
   configurado (nunca fail-open).
2. Evento ≠ `CASHIN_COMPLETED` → 200 `{ignored:true}` sem efeito.
3. Intent desconhecido → 200 `{ignored:true}`.
4. Duplicata (claim retorna 0 linhas) → 200 `{duplicate:true}`, crédito NÃO
   chamado.
5. Happy path: claim → crédito 1x → `COMPLETED` + `stellar_transaction_hash`
   + `context.final_amount/credit_hash/transaction_id` + `sendReceipt` com
   `dedupeKey` correto.
6. `walletAddress` divergente → `FAILED` com motivo, crédito NÃO chamado.
7. Falha do crédito → `FAILED` + `context.credit_error`.

### Passos de implementação

1. `app.ts:85` → `express.json({verify: (req,_res,buf) => {(req as any).rawBody
   = buf}})`.
2. `backend/src/integrations/pagfinance/settlement.ts`:
   - `findOperationByPagfinanceIntentId(intentId)` (global, sanitizado).
   - `claimOperationForCredit(operationId, fromStatuses=['PENDING'])`.
   - `settleCashinOperation(operation, {transactionId?, completedAt?,
     expectedWallet?, expectedValueCents?, trigger})`: valida mismatch →
     FAILED; resolve destino (email de `agent_sessions` quando PUBLIC) →
     `creditUsdcToUser` → COMPLETED + hash + recibo fire-and-forget; falha →
     FAILED + `credit_error`.
3. `backend/src/api/controllers/pagfinance-webhook.controller.ts` +
   `backend/src/api/routes/pagfinance-webhook.router.ts`; mount
   `/webhook/pagfinance` no `app.ts` (ao lado do `/webhook/bridge`).
4. Wire do poll (ISS-003): em `getCashinIntent`, remoto COMPLETED + local
   `PENDING` (ou `FAILED` de crédito, nunca `expired`) → claim + settle
   async; resposta segue `PAID_PENDING_CREDIT` até o crédito aterrissar.
5. Testes + `tsc` + suíte completa.

### Migrações e compatibilidade

Nenhuma migration. O verify hook do `express.json` é global mas inerte (só
anexa `req.rawBody`). Status novo `CREDITING` em `operations.status` (coluna
TEXT livre) — o mapeamento de histórico trata status desconhecido como
pendente.

### Documentação

Nenhuma nesta issue (ISS-007).

### Validação

```bash
cd backend && npx tsc --noEmit
npx jest tests/pagfinance-webhook.controller.test.ts
npx jest tests/pagfinance-hmac.test.ts tests/pagfinance-client.test.ts tests/pagfinance-service.test.ts tests/pagfinance-credit.test.ts tests/pagfinance-controller.test.ts
npx jest tests/bridge-webhook.controller.test.ts   # regressão do vizinho
```

### Riscos e não objetivos

- O ack 200 imediato significa que falhas de crédito não geram retry da
  PagFinance — recovery é o poll do `getIntent` e o replay da ISS-005 (por
  design; os retries deles são 2/4/8s, inúteis para submit Stellar).
- `sendReceipt` é fire-and-forget com dedupe próprio — falha de notificação
  nunca desfaz um crédito.
- Não objetivos: registro do webhook-config (ISS-005), UI (ISS-006).

## Implementation

Implementado em 2026-07-27:

- `app.ts`: `express.json({verify})` captura `req.rawBody` (inerte para as
  demais rotas); mount `/webhook/pagfinance`.
- `integrations/pagfinance/settlement.ts`:
  `findOperationByPagfinanceIntentId` (global, id sanitizado),
  `claimOperationForCredit` (update condicional `.eq('id').in('status')` —
  0 linhas = duplicata), `settleCashinOperation` (mismatch de
  wallet/valueCents → FAILED; destino via `resolveCreditDestination` com email
  de `agent_sessions` em PUBLIC; `creditUsdcToUser`; sucesso → COMPLETED +
  `stellar_transaction_hash` + context final + `sendReceipt` fire-and-forget
  com `dedupeKey:'pix-onramp:<id>'`; falha → FAILED + `credit_error`).
- `pagfinance-webhook.controller.ts` + router: secret ausente → 401
  (fail-closed), verify sobre `req.rawBody`, só `CASHIN_COMPLETED`, ack 200
  imediato pós-claim, settle async.
- Poll recovery no `pagfinance.controller.getCashinIntent`: remoto COMPLETED +
  local PENDING/FAILED (nunca `expired`) → claim `['PENDING','FAILED']` +
  settle async com `trigger:'poll'`.

### Arquivos alterados

- `backend/src/integrations/pagfinance/settlement.ts` (novo)
- `backend/src/api/controllers/pagfinance-webhook.controller.ts` (novo)
- `backend/src/api/routes/pagfinance-webhook.router.ts` (novo)
- `backend/src/api/controllers/pagfinance.controller.ts` (poll recovery)
- `backend/src/app.ts` (raw-body verify hook + mount)
- `backend/tests/pagfinance-webhook.controller.test.ts` (novo, 8 testes)
- `backend/tests/pagfinance-controller.test.ts` (+2 testes de poll recovery)

### Validação executada

- `npx tsc --noEmit`: passou.
- 7 suítes (6 pagfinance + regressão `bridge-webhook.controller.test.ts`):
  81/81 testes.

## Review

Revisado em 2026-07-27 contra a spec §2.5/§3.2 e o plano.

### Findings

1. **Alto — verificado ok:** exclusão mútua webhook×poll é o claim condicional
   no banco; teste comprova que entrega duplicada (status já CREDITING) não
   credita e não atualiza nada. O teste do happy path confirma o flip
   PENDING→CREDITING antes do settle.
2. **Médio — aceito por design:** o ack 200 imediato faz falha de crédito não
   gerar retry da PagFinance; recovery documentado (poll + replay ISS-005) e
   estado FAILED com `credit_error` fica visível para operação.
3. **Baixo — aceito:** `settleCashinOperation` valida `valueCents` só quando
   ambos os lados existem — operações antigas sem `value_cents` no context não
   quebram.
4. **Baixo — aceito:** o recibo usa import dinâmico do
   `PaymentReceiptService` para não carregar deps de chat no hot path; falha
   de notificação nunca desfaz crédito (teste cobre a ordem crédito→recibo).
5. Nenhum finding crítico aberto.

### Evidências e validações

- Assinatura verificada com HMAC REAL (não mock) nos testes — inclusive o
  caso secret-ausente → 401 fail-closed.
- Happy path valida crédito exato (net/fee/memo), COMPLETED com hash, context
  final (`credit_hash`, `settled_by:'webhook'`, `transaction_id`) e recibo com
  dedupeKey.
- Mismatch de wallet → FAILED sem crédito; falha de submissão → FAILED com
  `credit_error` e sem recibo.
- Poll recovery coberto: claim `['PENDING','FAILED']` + settle `'poll'`;
  operação expirada nunca é re-claimada.

### Riscos residuais

- Uma queda do processo entre o claim (CREDITING) e o submit deixa a operação
  em CREDITING sem crédito — destravável pelo replay assinado (ISS-005) ou
  manualmente; não há auto-recovery de CREDITING por design (evita crédito
  duplo sem saber se a tx foi ao ar).
