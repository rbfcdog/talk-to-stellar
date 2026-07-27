---
id: ISS-006
spec: SPEC-pagfinance-pix-cashin
status: completed
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

- [x] `/pix-on` renderiza o client PagFinance quando `available` e cai no `PixRampClient` atual caso contrário (demo testnet intacta); `pix-ramp-client.tsx` sem nenhuma alteração.
- [x] Proxy injeta os headers de sessão (padrão `frontend/app/api/ramp/[...path]/route.ts`); nenhuma chamada PagFinance passa pelo catch-all sem sessão.
- [x] Passo de nome+CPF aparece só quando `needs_customer_data`; CPF validado no client e no backend; após o primeiro uso não é pedido de novo.
- [x] QR renderizado + brCode copia-cola + link `payment_link_url` + countdown de `expires_in`; poll de status leva a "✅ Pagamento concluído" e fecha via protocolo do chat (`closeIntermediatePage`/`web-feedback.ts`); expirado → estado claro com recomeçar.
- [x] Honra os params do agente (`amount`, `autostart=1`, `from=chat`, `lang`, `session_scope`) e ignora graciosamente `fund_and_pay`/`fund_and_convert`.
- [x] UX conforme `docs/project-brain/product/`: multi-step com "Continuar", máx 4 elementos por passo, quote congelada (usdc_estimate fixo do intent), sem a palavra "Resumo", copy inline `L(pt, en)`, sem citar "PagFinance" em texto visível.
- [x] `npm run build` do frontend passa.

## Notes

Fluxo completo de browser (gate 6): chat "quero colocar 50 reais via Pix" →
/pix-on → QR → replay do webhook (ISS-005) → conclusão + uma entrada única no
histórico. Exact-receive e auto-pay pós-ramp ficam explicitamente fora (spec,
out of scope).

## Plan

### Comportamento atual e padrões reutilizáveis

- `/pix-on/page.tsx` é um shell de 35 linhas que serializa os search params e
  renderiza `PixRampClient` (`pix-ramp-client.tsx`, 4.4k linhas, intocável).
- Proxy com sessão: `app/api/ramp/[...path]/route.ts` — `readSessionCookies` +
  `buildSessionHeaders` de `@/lib/server-session`, Idempotency-Key,
  `passthroughResponseWithSession`. Copiar o shape para
  `app/api/pagfinance/[...path]/route.ts` (browser nunca chama o backend
  direto — regra do architecture skill).
- Protocolo de fechar-para-o-chat: `closeIntermediatePage`,
  `enqueueWebChatFeedback`, `INTERMEDIATE_PAGE_CLOSE_COPY` de
  `@/lib/web-feedback` (PixRampClient usa em `:1426`).
- i18n: `useLanguage()` de `@/lib/i18n` + helper inline
  `L(pt, en)` (padrão `pix-ramp-client.tsx:555`).
- Design system (architecture skill): tokens `tts-*` apenas, `<Button>` de
  `components/ui/button`, valores financeiros com `font-mono-financial`, sem
  `any`, testes Vitest em `frontend/__tests__/unit/` (test-first).
- Params do agente já chegam via query: `amount`, `autostart=1`, `from=chat`,
  `session_scope`, `provider`, `provider_user_id`, `lang` (o switch é na
  página; agente inalterado).
- Contrato do backend (ISS-003): `GET /cashin/config`
  (`{available, needs_customer_data, min/max}`), `POST /cashin/quote`,
  `POST /cashin/intent` (422 `needs_customer_data`, 409 `cpf_conflict`, 201
  com `br_code/qr_code_image/payment_link_url/expires_in/usdc_estimate`),
  `GET /cashin/intent/:id` (status `ACTIVE|PAID_PENDING_CREDIT|CREDITING|
  COMPLETED|EXPIRED|FAILED`).

### Testes a escrever primeiro

1. `frontend/__tests__/unit/cpf.test.ts` — `isValidCpf` de `lib/cpf.ts`
   (válido, dígitos repetidos, check digit errado, formatação com pontos).
2. `frontend/__tests__/unit/pix-on-switch.test.tsx` — com `fetch` mockado:
   config `available:true` → renderiza o client PagFinance; `available:false`
   ou fetch falhou → fallback `PixRampClient` (mockado); loading state.

### Passos de implementação

1. `frontend/lib/cpf.ts` (+ teste 1).
2. `frontend/app/api/pagfinance/[...path]/route.ts` — proxy GET/POST no shape
   do ramp proxy (sem os headers de sandbox/defindex).
3. `frontend/app/pix-on/pagfinance-onramp-client.tsx` — client slim:
   - steps: `amount` → `customer` (só se faltar dado) → `qr` → `done`/
     `expired`/`error`; máx 4 elementos por passo, botão "Continuar", sem
     auto-advance;
   - amount: input BRL (`font-mono-financial`), min/max do config;
   - customer: nome + CPF (validação local + erros do backend);
   - qr: imagem do QR + copia-e-cola do brCode + link de pagamento +
     countdown de `expires_in` + "Você recebe ~X USDC" congelado do intent;
     poll do status a cada 4s; `COMPLETED` → done;
   - done: "✅ Pagamento concluído" + `closeIntermediatePage()` quando
     `from=chat`; expired: refazer código; copy inline `L(pt, en)`, NUNCA
     citando o nome do provider;
   - honra `amount`/`autostart=1` (1x, ref) e repassa
     `provider`/`provider_user_id`/`session_scope` no body do intent.
4. `frontend/app/pix-on/pix-on-switch.tsx` (client) — busca
   `/api/pagfinance/cashin/config`; `available` → client novo; senão →
   `PixRampClient` com a query original (demo testnet intacta). (+ teste 2)
5. `frontend/app/pix-on/page.tsx` — renderiza o switch (mantém a
   serialização de params).
6. `npm run test` (novos) + `npm run build` no frontend.

### Migrações e compatibilidade

Nenhuma. `PixRampClient` intocado; com `PAGFINANCE_ENABLED=false` no backend o
config responde `available:false` e o comportamento atual é preservado
byte a byte.

### Documentação

Nenhuma nesta issue (ISS-007).

### Validação

```bash
cd frontend && npm run test -- __tests__/unit/cpf.test.ts __tests__/unit/pix-on-switch.test.tsx
npm run build
```

### Riscos e não objetivos

- `qr_code_image` é uma URL externa (Woovi) — usar `<img>` simples com
  fallback para o copia-e-cola quando a imagem falhar.
- Poll de status para quando a aba está oculta? Não — manter poll simples
  (4s), o intent expira em 15min.
- Não objetivos: exact-receive, auto-pay/fund_and_convert (params ignorados
  graciosamente), /pix-off, alterações no agente.

## Implementation

Implementado em 2026-07-27 (testes primeiro):

- `frontend/lib/cpf.ts` (`isValidCpf`/`cpfDigits`/`formatCpf`) + 7 testes.
- `frontend/app/api/pagfinance/[...path]/route.ts` — proxy GET/POST com
  injeção de sessão (shape do ramp proxy, sem headers de sandbox).
- `frontend/app/pix-on/pagfinance-onramp-client.tsx` — client slim com steps
  `amount → customer (condicional) → qr → done/expired`; QR image com
  fallback para copia-e-cola, countdown, poll 4s, estimativa USDC congelada
  do intent (`font-mono-financial`), `closeIntermediatePage()` quando
  `from=chat`, copy inline `L(pt, en)` sem citar provider, autostart 1x sem
  auto-advance sobre passo de dados; tokens `tts-*` e `<Button>` apenas.
- `frontend/app/pix-on/pix-on-switch.tsx` — switch por
  `GET /api/pagfinance/cashin/config` com fallback para `PixRampClient`
  (+ 4 testes com os dois clients mockados).
- `frontend/app/pix-on/page.tsx` — passa a renderizar o switch (2 linhas).
- `pix-ramp-client.tsx`: **zero alterações**.

### Arquivos alterados

- `frontend/lib/cpf.ts`, `frontend/__tests__/unit/cpf.test.ts` (novos)
- `frontend/app/api/pagfinance/[...path]/route.ts` (novo)
- `frontend/app/pix-on/pagfinance-onramp-client.tsx` (novo)
- `frontend/app/pix-on/pix-on-switch.tsx` (novo)
- `frontend/__tests__/unit/pix-on-switch.test.tsx` (novo)
- `frontend/app/pix-on/page.tsx` (import + render, 2 linhas)
- `frontend/package.json`/`package-lock.json` (dep `@stellar/freighter-api`
  — ver Review)

### Validação executada

- Testes novos: 11/11 (`cpf.test.ts` 7, `pix-on-switch.test.tsx` 4).
- `npm run build`: passou (após corrigir quebra pré-existente, ver Review).
- Suíte unit completa: 139 passed / 13 failed — as MESMAS 13 falhas em 5
  arquivos existem no baseline sem nossas mudanças (verificado via stash);
  zero regressões introduzidas.

## Review

Revisado em 2026-07-27 contra a spec §3.3, o plano e o architecture skill do
frontend.

### Findings

1. **Alto (pré-existente) — resolvido com desvio registrado:** o build do
   frontend estava quebrado no main — `@stellar/freighter-api` usado por
   `app/key-integrations/key-integrations-client.tsx` (commit `c4538a85`) sem
   a dependência instalada. Corrigido com `npm install @stellar/freighter-api`
   (^6.0.1). Fora do escopo da issue, mas era impossível passar o gate de
   build sem isso; registrado aqui como desvio aprovado pelo contexto
   ("sem preguiça") e reportado no fechamento.
2. **Médio (pré-existente) — não tratado:** 13 testes unit já falham no main
   (browser-storage, session, secure-balance, ux-copy, web-feedback) —
  independentes desta issue; candidatos a PAIN-POINTS na ISS-007.
3. **Baixo — aceito:** o poll de 4s continua com a aba em background;
   simplicidade > otimização, o intent expira em 15min.
4. **Baixo — aceito:** `qr_code_image` é URL externa (Woovi) com fallback
   `onError` para o copia-e-cola.
5. Nenhum finding crítico introduzido por esta issue.

### Evidências e validações

- Switch coberto por teste nas três rotas (disponível/indisponível/falha) +
  loading; CPF coberto com check digits e formatação.
- Regras de UX verificadas manualmente contra o plano: máx 4 elementos por
  passo, "Continuar" explícito, quote congelada, sem "Resumo", sem nome de
  provider em copy, financeiro em `font-mono-financial`, tokens `tts-*`.
- Com `PAGFINANCE_ENABLED=false` o config responde `available:false` e o
  fluxo legado renderiza inalterado (fallback coberto por teste).

### Riscos residuais

- O fluxo completo de browser (gate 6 da spec) depende de backend rodando +
  replay do webhook — item do checklist da ISS-007.
- As 13 falhas de teste pré-existentes seguem no main.
