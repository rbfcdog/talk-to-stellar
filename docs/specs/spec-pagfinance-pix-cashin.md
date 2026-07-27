---
id: SPEC-pagfinance-pix-cashin
status: approved
created: 2026-07-27
approved: 2026-07-27
---

# Spec: Integração PagFinance: Pix cash-in com crédito USDC em Stellar

## Summary

Integrar a PagFinance (API Pix↔crypto, sandbox `https://sandbox.brlp.io`) como
provedor de cash-in Pix do TalkToStellar: o usuário paga um QR Code Pix, a
PagFinance confirma via webhook `CASHIN_COMPLETED` e **nosso backend credita
USDC** da nossa treasury na wallet Stellar do usuário. A PagFinance não
custodia nem credita crypto — ela é a perna fiat (cobrança Pix + confirmação);
toda a liquidação cripto é nossa, em Stellar.

O escopo é **cash-in apenas**. O cash-out da PagFinance devolve transações não
assinadas Solana v0/XRPL (Stellar não é suportada) e fica explicitamente fora
desta spec. A integração é um módulo standalone no padrão de
`backend/src/integrations/bridge/`, sem tocar no `AnchorService` (Etherfuse) —
que é testnet-only e continua intacto como fallback de demo. O crédito funciona
em testnet e mainnet com o mesmo código, decidido por `STELLAR_NETWORK`.

Decisões aprovadas pelo André em 2026-07-27 (escopo, arquitetura standalone,
crédito configurável por rede desde o dia 1, superfície completa incluindo
/pix-on e agente).

## 1. Objective and Context

**Objective:** Uma transação Pix funcional de ponta a ponta — do chat
("quero colocar 50 reais via Pix") ao QR Code, ao webhook de confirmação, ao
USDC na wallet Stellar do usuário, com recibo no chat/Telegram/WhatsApp —
pronta para sandbox (dry-run) e produção (dinheiro real) apenas trocando env.

**Current context (verificado no código):**
- O provider Pix atual (Etherfuse) está hard-coded no `AnchorService`
  (`backend/src/api/services/anchor.service.ts`, ~9k linhas) com guard
  testnet-only (`getRuntimeInfo` `:1529`); em mainnet o /pix-on mostra
  "indisponível". A PagFinance preenche um buraco, não substitui fluxo vivo.
- O agente conversacional só monta o link `/pix-on`
  (`api/agent/tools.ts:709-777`, `graph.ts:1650-1785`) — quem manda é a página.
- Histórico, activity feed e recibos são agnósticos de provider: leem
  `operations` por `type='PIX_ONRAMP'`; `PaymentReceiptService.sendReceipt`
  (`payment-receipt.service.ts:405-507`) entrega recibo + chat + notificação
  Telegram/WhatsApp numa chamada.
- `app.ts:83` usa `express.json()` sem captura de raw body — o HMAC do webhook
  da PagFinance exige os bytes brutos.
- Zero referências a pagfinance/brlp no código — integração greenfield.

**Out of scope:**
- Cash-out (crypto → Pix) — exige treasury Solana/XRPL; fase futura com spec
  própria.
- KYC real via webview (BigDataCorp/Celcoin) — usamos o override
  administrativo (`PATCH /users/:pubkey/kyc`).
- Withdraw BRLP (stub na PagFinance), payment links, receipts da PagFinance.
- Exact-receive ("quero que cheguem 100 USDC"), auto-pay/fund_and_convert
  pós-ramp (o client ignora esses params graciosamente).
- Refatorar `AnchorService`/interface `Anchor` ou o `/pix-off` (Etherfuse).

## 2. Foundation

### 2.1 Módulo `backend/src/integrations/pagfinance/`

Padrão de `integrations/bridge/` (config, client, service, types, index) com
duas adições: `hmac.ts` (assinatura de request + verify de webhook, funções
puras) e `credit.ts` (perna de crédito Stellar).

- **Autenticação parceiro (HMAC-SHA256):** `signingKey =
  SHA256(rawSecret+":"+partnerId)`; canonical
  `METHOD\nPATH\nTIMESTAMP\nNONCE\nSHA256(body)`; header
  `Authorization: HMAC-SHA256 partnerId=X,timestamp=Y,nonce=Z,signature=W`
  (formato estrito, sem espaços). Timestamp ±300s, nonce único (UUID) por
  tentativa. Body serializado UMA vez — a mesma string é hasheada e enviada.
- **JWT por usuário:** mintado via `POST /api/v1/auth/token` com a `pubkey`
  Stellar `G...` do usuário; cache em memória com TTL; re-mint em
  `USER_NOT_FOUND`/`INSUFFICIENT_KYC` após `ensureUser()`.
- **Provisioning lazy:** `POST /api/v1/users {pubkey}` (idempotente; CONFLICT =
  ok) + `PATCH /api/v1/users/:pubkey/kyc {kycLevel:1, kycStatus:'APPROVED'}`.
- **Client:** retry/backoff real (3 tentativas, 500ms→1.5s→4s+jitter; retry em
  rede/502/503/504; 429 respeita `retryAfter`; POST só com `Idempotency-Key`;
  nonce+timestamp novos por tentativa), timeout via AbortController, erros →
  `PagfinanceApiError {status, code, retryAfter?}` roteados por status+`code`
  estável (mensagens da API são em PT e não são contrato).
- **Verify de webhook:** HMAC-SHA256 sobre o **body bruto** (Buffer), prefixo
  `sha256=` obrigatório, length-check antes de `timingSafeEqual`. Não copiar os
  defeitos de `bridge/service.ts:466-478` (throw em length mismatch, hash de
  `JSON.stringify(req.body)`).

### 2.2 Configuração (env)

`PAGFINANCE_ENABLED`, `PAGFINANCE_BASE_URL`, `PAGFINANCE_PARTNER_ID`,
`PAGFINANCE_RAW_SECRET`, `PAGFINANCE_WEBHOOK_SECRET`,
`PAGFINANCE_JWT_TTL_SECONDS` (86400), `PAGFINANCE_TIMEOUT_MS`,
`PAGFINANCE_MIN_BRL_AMOUNT`/`MAX_BRL_AMOUNT`, `PAGFINANCE_INTENT_EXPIRES_IN`
(900), `PAGFINANCE_USDC_TREASURY_SECRET`, `PAGFINANCE_FALLBACK_BRL_PER_USDC`
(só mainnet, emergência). Reusa `APP_PUBLIC_WEBHOOK_URL`, `STELLAR_NETWORK`,
`USDC_ISSUER`, `TALKTOSTELLAR_SPREAD_BPS`. Sandbox↔produção = trocar 4 valores.
Singleton com auto-disable quando env falta (padrão `bridge/service.ts:60-72`).
Somente placeholders vazios em `.env.example`; secrets nunca commitados.

### 2.3 Modelo de dados

Sem migration para intents: linha em `operations`
(`type:'PIX_ONRAMP'`, `status`, `asset_code:'USDC'`, context JSON TEXT) via
`OperationRepository.create`. Context com os nomes que feed/histórico já
consomem: `{provider:'pagfinance', intent_id, anchor_order_id,
pagfinance_intent_id, source_amount_brl, final_asset_code:'USDC', value_cents,
usdc_net/fee/gross, brl_per_usdc, rate_locked_at, external_provider,
external_provider_user_id, language}`. Na conclusão:
`stellar_transaction_hash` (obrigatório — deduplica contra a entrada Horizon no
histórico, `transaction-history.service.ts:853-862`), `context.final_amount`,
`context.receipt_url`. CPF: persistido em `external_accounts.data.cpf` (índice
único global existente; padrão `external-finalize.controller.ts:572-662`) —
nunca em `agent_messages`.

### 2.4 Perna de crédito (Stellar, duas redes)

`credit.ts` — `creditUsdcToUser({network, destinationPublicKey, usdcNet,
usdcFee, userId, memoText})`, mesmo caminho nas duas redes (`StellarService`
segue `STELLAR_NETWORK`):
1. Treasury: `PAGFINANCE_USDC_TREASURY_SECRET` → fallback `STELLAR_SECRET_KEY`
   → (mainnet) cadeia de sponsor de `bridge.controller.ts:386-395`; ausência →
   falha explícita.
2. USDC: `resolveConfiguredAsset('USDC')` (`config/assets.ts:101`).
3. Trustline: testnet → `TrustlineService.ensureTrustline`; mainnet →
   sponsored-trustline (padrão de `bridge.controller.ts:414-490`,
   reimplementado local).
4. Pagamento: `StellarService.submitAssetPaymentsFromSecret`
   (`stellar.service.ts:1191`) — crédito ao usuário + fee para a treasury numa
   tx só, memo `PIX PAGFINANCE`.
5. Destino: `resolveCreditDestination` — testnet: `wallets` da sessão; mainnet:
   `wallets.public_key` se existir na Horizon → `stellar_mainnet_wallets` →
   `bridge_stellar_wallets` por email; nenhum → falha explícita.

### 2.5 Segurança

- Webhook sem secret configurado → rejeitar (não abrir como
  `bridge-webhook.controller.ts:22-30`).
- Raw body: `app.ts:83` → `express.json({verify: (req,_res,buf) =>
  {req.rawBody = buf}})` (route-level `express.raw` não funciona após o json
  global).
- Rotas de sessão seguem `requestInput()` de `ramp.controller.ts:71-85`
  (`x-session-id`/`x-session-token`); `resolveSessionWallet` local espelhando
  `anchor.service.ts:1632`, sem o assert de runtime do Etherfuse.
- Frontend: proxy com injeção de sessão copiado de
  `frontend/app/api/ramp/[...path]/route.ts` (o catch-all não injeta sessão).
- Nunca citar "PagFinance" em copy visível ao usuário (regra de providers,
  `graph.ts:3515`).

## 3. Features and Behaviors

### 3.1 Criação de intent (API de sessão)

`POST /api/pagfinance/cashin/intent` — valida amount (min/max) e
`customer {name, taxID}` (CPF validado por dígitos; prefill de nome via
`wallets.name`; `needs_customer_data` informa o frontend) → `ensureUser` + JWT
→ **trava a NOSSA taxa BRL→USDC** → cria intent na PagFinance
(`Idempotency-Key` `pgf_...`) → persiste operation `PENDING` → responde
`{operation_id, intent_id, br_code, qr_code_image, payment_link_url,
expires_in, usdc_estimate}`.

**Política de taxa:** creditamos pela nossa taxa
(`BrlReferenceRateService.quoteBrlToUsdc`, `brl-reference-rate.service.ts:161`)
travada no intent; fee via `PlatformFeeService.calculateSpread` (mesmo
`TALKTOSTELLAR_SPREAD_BPS` do Etherfuse), calculada no intent, paga no crédito.
O `cryptoEstimate` da PagFinance é advisory (guardado para reconciliação; quem
paga USDC é nossa treasury). Mainnet sem liquidez no path on-chain → fallback
`PAGFINANCE_FALLBACK_BRL_PER_USDC` com log alto; sem nenhum dos dois → recusar
o intent (nunca inventar taxa).

Demais rotas: `GET /cashin/config` (`{provider, available, network,
needs_customer_data, min/max}` — o switch de provider do frontend),
`POST /cashin/quote` (advisory), `GET /cashin/intent/:intentId`,
`GET /cashin/intents`.

### 3.2 Webhook e crédito

`POST /webhook/pagfinance` (registrado como
`${APP_PUBLIC_WEBHOOK_URL}/webhook/pagfinance` via
`POST /partners/me/webhook-config {events:['CASHIN_COMPLETED']}`):

1. Verifica `X-App-Signature` sobre `req.rawBody`; falha → 401.
2. Só `CASHIN_COMPLETED`; outros eventos → ack 200.
3. **Claim atômico**: operation por
   `LIKE '%"pagfinance_intent_id":"<id>"%'` + update condicional
   `PENDING→CREDITING` direto no supabase (0 linhas = duplicata/replay → ack
   200 sem segundo crédito). Retries da PagFinance são 3x/2-4-8s, sem ordem,
   com duplicatas.
4. Responde 200 imediatamente; crédito roda async.
5. Confere `walletAddress`/`valueCents` contra a operation; mismatch → `FAILED`.
6. Sucesso → `COMPLETED` + `stellar_transaction_hash` + `sendReceipt(
   {type:'payment_received', dedupeKey:'pix-onramp:<operationId>',
   sourceAssetCode:'BRL', destinationAssetCode:'USDC', ...})`; falha →
   `FAILED` + `context.credit_error`.

**Transições:** `PENDING → CREDITING → COMPLETED | FAILED`; `PENDING → FAILED`
(expirado — a PagFinance **não** emite webhook de expiração; detectado no poll
do `getIntent`). Recovery de `FAILED`/webhook perdido: poll do `getIntent`
(remoto COMPLETED + local PENDING → dispara o mesmo crédito idempotente) e
replay assinado do script E2E.

### 3.3 Frontend /pix-on e agente

- `/pix-on/page.tsx` consulta `GET /api/pagfinance/cashin/config`:
  `available` → renderiza o client PagFinance novo; senão → `PixRampClient`
  atual (demo testnet intacta). **Zero mudança no agente** — os links já
  apontam para `/pix-on`.
- Client novo slim (**não tocar** no `pix-ramp-client.tsx` de 4.4k linhas):
  valor → (nome+CPF quando faltar) → QR/brCode/copia-cola + countdown → poll →
  "✅ Pagamento concluído" → fecha via protocolo do chat
  (`closeIntermediatePage`/`web-feedback.ts`). Honra params do agente
  (`amount`, `autostart`, `from=chat`, `lang`, ...).
- UX/copy (`docs/project-brain/product/`): multi-step com "Continuar", máx 4
  elementos/passo, quote congelada, sem a palavra "Resumo", i18n inline
  `L(pt, en)`, `language` no context da operation para notificação no idioma
  certo.

### 3.4 Scripts operacionais

- `backend/scripts/setup-pagfinance-webhook.ts` — registra o webhook-config
  (1x por ambiente).
- `backend/scripts/pagfinance-e2e.ts` — health → ensureUser → KYC → JWT →
  quote (estimate deles vs nossa taxa) → intent (imprime brCode) → poll. O
  sandbox não tem simulate-payment de cash-in → modo
  `--replay-webhook <intentId>`: assina `CASHIN_COMPLETED` sintético com o
  `WEBHOOK_SECRET` e posta no backend local — exercita
  verify→dedupe→crédito e é a ferramenta de replay/recovery em produção.

## 4. Validation Gates

Projeto: `cd backend && npm run build && npx jest tests/pagfinance-*.test.ts`;
frontend `npm run build`. Por fase:

1. Testes de HMAC: vetores de assinatura, formato estrito do header, verify
   (tampered, length errado **retorna false sem throw**, sem prefixo
   `sha256=`, secret vazio).
2. Client: retry em 503, 429 respeita `retryAfter`, sem retry em 400, POST só
   com Idempotency-Key, nonce novo por tentativa.
3. Webhook: 401 em assinatura inválida; intent desconhecido → 200 ignored;
   **duplicata credita exatamente 1x**; mismatch → FAILED; transições de
   status.
4. Sandbox real: `npm run pagfinance:e2e -- --pubkey G...` → intent ACTIVE +
   brCode impresso.
5. Crédito E2E: `--replay-webhook <intentId>` → operation COMPLETED, delta de
   USDC no Horizon, fee na treasury, recibo no chat/Telegram; replay repetido →
   ack de duplicata sem segundo crédito; curl com byte alterado → 401.
6. Browser: chat "quero colocar 50 reais via Pix" → /pix-on → QR → replay →
   "✅ Pagamento concluído" + **uma** entrada no histórico.

## 5. Implementation Phases

| # | Phase | Description | Status | Depends on |
|---|---|---|---|---|
| 1 | Core do módulo | `hmac.ts`, `types.ts`, `config.ts`, `client.ts`, `service.ts`, `index.ts` + testes de HMAC/client/service | pending | — |
| 2 | Perna de crédito | `credit.ts`: treasury, trustline, pagamento, `resolveCreditDestination`, duas redes | pending | 1 |
| 3 | API de sessão | Rotas `/api/pagfinance/cashin/*`, trava de taxa, CPF/nome, operation row | pending | 1 |
| 4 | Webhook + crédito | Raw-body hook, receiver, claim atômico, crédito async, `sendReceipt`, recovery via poll | pending | 2, 3 |
| 5 | Scripts operacionais | `setup-pagfinance-webhook.ts`, `pagfinance-e2e.ts` (+ replay), npm scripts | pending | 3, 4 |
| 6 | Frontend /pix-on | Proxy de sessão, client slim, switch de provider, passo CPF/nome | pending | 3, 4 |
| 7 | Docs, env e rollout | `.env.example`, project-brain (INTEGRATIONS, MONEY-FLOWS, README), AGENTS.md, checklist produção + rotação de secrets | pending | 5, 6 |

## 6. Decisions

| Decision | Choice | Alternative rejected | Reason |
|---|---|---|---|
| Escopo | Só cash-in | Cash-in + cash-out | Cash-out exige assinar tx Solana v0/XRPL (Stellar não suportada) → treasury em outra chain; meta é 1 transação Pix funcional. |
| Arquitetura | Módulo standalone padrão Bridge | Implementar interface `Anchor` + switch no `AnchorService` | AnchorService tem ~9k linhas, hard-coda Etherfuse e guard testnet-only; refatorar arrisca regressão no fluxo de demo. |
| Crédito | Configurável por `STELLAR_NETWORK` desde o dia 1 | Só testnet, mainnet depois | Credenciais de produção já em mãos; com a arquitetura certa, testnet e mainnet custam o mesmo. |
| Superfície | Completa (backend + E2E + /pix-on + agente) | Só backend + script | Levantamento mostrou custo baixo: agente = 0 linhas, superfícies de histórico/recibo são provider-agnósticas. |
| Taxa de crédito | Nossa taxa (`BrlReferenceRateService`) travada no intent | `cryptoEstimate` da PagFinance | Eles não liquidam crypto; quem paga USDC é nossa treasury — a taxa tem que ser nossa. Estimate guardado para reconciliação. |
| KYC | Override administrativo (`PATCH /users/:pubkey/kyc`) | Onboarding real via webview | Suficiente para sandbox e primeira produção; KYC real é módulo à parte com flags próprias. |
| Webhook | Ack 200 imediato + crédito async | Crédito síncrono no handler | Timeout de entrega deles é 10s com retries 2/4/8s — inútil para um submit Stellar; claim atômico garante exatamente-uma-vez. |
| Frontend | Client novo slim + switch por config | Retrofit do `pix-ramp-client.tsx` / emular shape Etherfuse no backend | O client atual tem 4.4k linhas acopladas ao shape Etherfuse; emular o shape é M-L com alto risco de compat e não resolve coleta de CPF. |

## Riscos conhecidos

- **Treasury USDC mainnet não existe hoje** (sponsors só têm XLM) —
  provisionar/fundar `PAGFINANCE_USDC_TREASURY_SECRET`; validar no startup
  quando `ENABLED` em `PUBLIC`.
- Taxa mainnet depende do fallback env até haver liquidez no path on-chain.
- Destino mainnet ambíguo (session wallet vs `stellar_mainnet_wallets` vs
  `bridge_stellar_wallets`) — `resolveCreditDestination` falha explícito.
- Rate limit PagFinance: 10/min por pubkey nos POSTs de cashin — expor
  `retry_after_ms`; sem auto-retry de POST sem Idempotency-Key.
- Credenciais do sandbox circularam em texto plano (guia via WhatsApp) — após
  tudo em env, rotacionar via `POST /partners/me/rotate-secret`.
