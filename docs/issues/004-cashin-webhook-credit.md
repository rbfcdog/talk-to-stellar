---
id: ISS-004
spec: SPEC-pagfinance-pix-cashin
status: pending
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

- [ ] `app.ts:83` captura o raw body via `express.json({verify})` sem mudança de comportamento para as demais rotas.
- [ ] Assinatura inválida ou ausente → 401; `PAGFINANCE_WEBHOOK_SECRET` não configurado → rejeição (nunca fail-open); verificação sobre `req.rawBody`, não sobre re-serialização.
- [ ] Só `CASHIN_COMPLETED` é processado; outros eventos → ack 200 sem efeito.
- [ ] Claim atômico: update condicional `PENDING→CREDITING` no supabase; entrega duplicada ou replay → ack 200 e **nenhum segundo crédito** (comprovado em teste).
- [ ] Handler responde 200 imediatamente; o crédito roda async; `walletAddress`/`valueCents` divergentes da operation → `FAILED` com motivo, sem crédito.
- [ ] Sucesso → `COMPLETED` + `stellar_transaction_hash` preenchido (deduplica contra a entrada Horizon no histórico) + `context.final_amount/receipt_url`; falha → `FAILED` + `context.credit_error`.
- [ ] `sendReceipt({type:'payment_received', dedupeKey:'pix-onramp:<operationId>', sourceAssetCode:'BRL', destinationAssetCode:'USDC', ...})` dispara recibo + mensagem no chat + Telegram/WhatsApp no idioma do usuário (`language` do context).
- [ ] `pagfinance-webhook.controller.test.ts` cobre 401, intent desconhecido (200 ignored), duplicata credita 1x, mismatch → FAILED e as transições de status.
- [ ] Depois desta issue, uma operation COMPLETED aparece exatamente 1x no histórico e no activity feed sem mudanças nesses serviços.

## Notes

O caminho de crédito disparado pelo poll do `getIntent` (ISS-003) usa o mesmo
claim condicional — a exclusão mútua entre webhook e poll é por status no
banco, nunca por lock em memória. Retries da PagFinance: 3x/2-4-8s, sem ordem,
com duplicatas por design.
