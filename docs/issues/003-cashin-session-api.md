---
id: ISS-003
spec: SPEC-pagfinance-pix-cashin
status: pending
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

- [ ] Rotas autenticadas por sessão no padrão `requestInput()` de `ramp.controller.ts:71-85`; `resolveSessionWallet` local espelha `anchor.service.ts:1632` sem o assert de runtime do Etherfuse; 401 em sessão inválida.
- [ ] `POST /cashin/intent` valida min/max e `customer {name, taxID}` (CPF por dígitos), provisiona o usuário lazy na PagFinance e cria o intent com `Idempotency-Key`; resposta contém `{operation_id, intent_id, br_code, qr_code_image, payment_link_url, expires_in, usdc_estimate}`.
- [ ] A taxa BRL→USDC é a nossa (`BrlReferenceRateService.quoteBrlToUsdc`) com fee via `PlatformFeeService.calculateSpread`, travada e persistida no context (`usdc_net/fee/gross`, `brl_per_usdc`, `rate_locked_at`); `cryptoEstimate` da PagFinance é gravado apenas para reconciliação; em mainnet sem path e sem `PAGFINANCE_FALLBACK_BRL_PER_USDC`, o intent é recusado.
- [ ] Operation criada com `type:'PIX_ONRAMP'`, `asset_code:'USDC'` e context com os nomes que feed/histórico consomem (`intent_id`, `anchor_order_id`, `pagfinance_intent_id`, `source_amount_brl`, `final_asset_code`, `external_provider`, `language`), sem migration.
- [ ] CPF persistido em `external_accounts.data.cpf` (padrão `external-finalize.controller.ts:572-662`), nunca em `agent_messages`; nome prefill via `wallets.name`; `needs_customer_data` refletido em `GET /cashin/config` e no intent.
- [ ] `GET /cashin/intent/:intentId` faz merge local+remoto, marca `FAILED/expired` após `expires_at` (PagFinance não emite webhook de expiração) e, quando o remoto está COMPLETED com local PENDING, dispara o crédito idempotente (caminho de recovery compartilhado com ISS-004).
- [ ] 429 da PagFinance exposto com `retry_after_ms` sem auto-retry de POST.

## Notes

O shape de resposta é o contrato do client novo do /pix-on (ISS-006) — mudanças
posteriores exigem atualizar as duas pontas. O disparo de crédito no poll
depende da função de crédito (ISS-002) e do claim idempotente definido na
ISS-004; se a ISS-004 ainda não tiver aterrissado, o poll apenas reporta o
status remoto sem creditar.
