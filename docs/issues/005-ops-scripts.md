---
id: ISS-005
spec: SPEC-pagfinance-pix-cashin
status: pending
depends_on: [ISS-003, ISS-004]
created: 2026-07-27
---

# Scripts operacionais e E2E

## Overview

Ferramentas de operação e validação: `backend/scripts/setup-pagfinance-webhook.ts`
(registra o webhook-config na PagFinance, 1x por ambiente) e
`backend/scripts/pagfinance-e2e.ts` (percorre health → ensureUser → KYC → JWT →
quote → intent → poll, e no modo `--replay-webhook <intentId>` assina um
`CASHIN_COMPLETED` sintético e posta no backend local para exercitar
verify→dedupe→crédito de ponta a ponta). O replay é também a ferramenta de
recovery em produção. Issue única porque entrega a superfície operacional que
valida as ISS-001..004 contra o sandbox real.

## Surface

- [x] Application code
- [ ] Data or infrastructure
- [x] Tests
- [x] Documentation

## Spec coverage

Seção 3.4 (scripts operacionais) e gates 4–5 da seção 4. Fase 5 da
implementação.

## Acceptance criteria

- [ ] `npm run pagfinance:setup-webhook` registra `${APP_PUBLIC_WEBHOOK_URL}/webhook/pagfinance` com filtro `events:['CASHIN_COMPLETED']` e imprime a config resultante sem vazar secrets.
- [ ] `npm run pagfinance:e2e -- --pubkey G...` contra o sandbox real termina com intent ACTIVE, brCode impresso e comparação estimate PagFinance vs nossa taxa.
- [ ] `npm run pagfinance:e2e -- --replay-webhook <intentId>` contra o backend local resulta em operation `COMPLETED`, delta de USDC verificado via Horizon e fee na treasury; executar o replay de novo → ack de duplicata, sem segundo crédito.
- [ ] Payload de replay com um byte alterado → 401 do receiver.
- [ ] Scripts documentam no `--help` a limitação do sandbox (Pix em dry-run, sem simulate-payment de cash-in) e falham com mensagem clara sem env.
- [ ] npm scripts adicionados ao `backend/package.json`.

## Notes

O sandbox não executa Pix de verdade — o caminho feliz "usuário pagou" só é
observável em produção ou via replay assinado; por isso o replay é parte do
produto, não gambiarra de teste. Tokens/JWTs impressos mascarados.
