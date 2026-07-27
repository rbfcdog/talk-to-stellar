---
id: ISS-006
spec: SPEC-pagfinance-pix-cashin
status: pending
depends_on: [ISS-003, ISS-004]
created: 2026-07-27
---

# Frontend /pix-on com provider PagFinance

## Overview

Ligar a superfície do usuário: proxy com injeção de sessão
`frontend/app/api/pagfinance/[...path]/route.ts` (modelado no proxy de ramp),
switch de provider no `/pix-on/page.tsx` via `GET /api/pagfinance/cashin/config`
e um client novo slim (valor → nome+CPF quando faltar → QR/copia-cola +
countdown → poll → "✅ Pagamento concluído" → fecha para o chat). O agente
conversacional não muda — os links já apontam para `/pix-on`. Issue única
porque entrega a experiência completa sem tocar no `pix-ramp-client.tsx`.

## Surface

- [x] Application code
- [ ] Data or infrastructure
- [ ] Tests
- [ ] Documentation

## Spec coverage

Seção 3.3 (frontend e agente), regras de UX/copy referenciadas na spec e gate 6
da seção 4. Fase 6 da implementação.

## Acceptance criteria

- [ ] `/pix-on` renderiza o client PagFinance quando `available` e cai no `PixRampClient` atual caso contrário (demo testnet intacta); `pix-ramp-client.tsx` sem nenhuma alteração.
- [ ] Proxy injeta os headers de sessão (padrão `frontend/app/api/ramp/[...path]/route.ts`); nenhuma chamada PagFinance passa pelo catch-all sem sessão.
- [ ] Passo de nome+CPF aparece só quando `needs_customer_data`; CPF validado no client e no backend; após o primeiro uso não é pedido de novo.
- [ ] QR renderizado + brCode copia-cola + link `payment_link_url` + countdown de `expires_in`; poll de status leva a "✅ Pagamento concluído" e fecha via protocolo do chat (`closeIntermediatePage`/`web-feedback.ts`); expirado → estado claro com recomeçar.
- [ ] Honra os params do agente (`amount`, `autostart=1`, `from=chat`, `lang`, `session_scope`) e ignora graciosamente `fund_and_pay`/`fund_and_convert`.
- [ ] UX conforme `docs/project-brain/product/`: multi-step com "Continuar", máx 4 elementos por passo, quote congelada (usdc_estimate fixo do intent), sem a palavra "Resumo", copy inline `L(pt, en)`, sem citar "PagFinance" em texto visível.
- [ ] `npm run build` do frontend passa.

## Notes

Fluxo completo de browser (gate 6): chat "quero colocar 50 reais via Pix" →
/pix-on → QR → replay do webhook (ISS-005) → conclusão + uma entrada única no
histórico. Exact-receive e auto-pay pós-ramp ficam explicitamente fora (spec,
out of scope).
