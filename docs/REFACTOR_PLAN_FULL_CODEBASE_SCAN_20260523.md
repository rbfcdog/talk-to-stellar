# Refactor plan from full codebase scan - 2026-05-23

Este documento consolida um scan amplo do repo TalkToStellar e transforma os achados em um plano de refactor pragmatico.

Objetivo: reduzir risco tecnico sem reescrever o produto do zero, mantendo funcionando os fluxos atuais de WhatsApp/Telegram, PIX/Etherfuse, Stellar, conta, pagamentos, mainnet/testnet, recibos e a rail institucional.

## Escopo do scan

Areas analisadas:

- `backend`
- `frontend`
- `telegram`
- `evolution`
- `scripts`
- `docs`
- `sow`
- `deprecated`

Arquivos e areas principais encontrados:

| Area | Contagem |
| --- | ---: |
| Arquivos em `backend` | 246 |
| Arquivos em `frontend` | 142 |
| Arquivos em `docs` | 58 |
| Arquivos em `deprecated` | 39 |
| Arquivos em `telegram` | 14 |
| Arquivos em `evolution` | 10 |
| Arquivos em `sow` | 4 |
| Arquivos analisaveis em superficies principais | 272 |
| Testes em `backend/tests` | 44 |
| Services em `backend/src/api/services` | 39 |
| Controllers em `backend/src/api/controllers` | 17 |
| Arquivos em `frontend/app` | 57 |
| Componentes em `frontend/components` | 33 |

Sinais brutos medidos com `rg`:

| Sinal | Matches |
| --- | ---: |
| Funcoes/classes exportadas, async handlers e blocos funcionais relevantes | 1229 |
| Ocorrencias de `session_token`, `session_id`, storage e tokens em superficies runtime | 973 |
| Ocorrencias de `mock`, `sandbox`, `testnet` e `mainnet` em runtime | 366 |
| Ocorrencias de `console.*` ou `logger.*` em runtime/scripts | 404 |
| Ocorrencias de `any` em runtime/scripts | 946 |

Arquivos mais concentrados por tamanho:

| Arquivo | Linhas aproximadas | Risco principal |
| --- | ---: | --- |
| `backend/src/agent/tools.ts` | 4989 | Tools demais em um unico modulo; alto acoplamento entre chat, wallet, PIX, conversao, contatos e notificacao. |
| `backend/src/api/services/anchor.service.ts` | 4142 | Etherfuse, PIX, KYC sandbox, quotes, on/off-ramp, fallback, saldo e pagamento misturados. |
| `backend/src/agent/graph.ts` | 4134 | Orquestracao LLM, prompt, parsing, contato, roteamento, links e fallback no mesmo arquivo. |
| `backend/src/api/controllers/external-finalize.controller.ts` | 3204 | Login, onboarding, confirmacao, pagamento, conversao, PIN/passkey e callback em um controller. |
| `frontend/app/pix-ramp/pix-ramp-client.tsx` | 2966 | Fluxo PIX inteiro em uma page client com estado, fee bridge, auth, quote, checkout, debug e auto-pay. |
| `frontend/app/international-transfer/international-transfer-client.tsx` | 1648 | Painel ops, API logs, fee bridge, quote, funding, settlement e payout em uma tela. |
| `frontend/app/create-account/create-account-client.tsx` | 1182 | Onboarding, PIN, passkey, login existente e feedback em uma tela grande. |
| `frontend/app/global-transfer/global-transfer-client.tsx` | 1130 | Simulador financeiro/lab misturado com narrativa de produto. |
| `frontend/app/confirm-payment/confirm-payment-client.tsx` | 1053 | Confirmacao, PIN/passkey, pagamento, conversao, receipt e recovery em uma tela. |

## Diagnostico executivo

O projeto evoluiu de MVP conversacional para uma plataforma com muitos trilhos: chat, wallet Stellar, PIX/Etherfuse, quotes, pagamentos, recibos, mainnet, rail institucional e adapters de payout. O problema principal agora nao e falta de feature; e falta de fronteiras estaveis.

Hoje os maiores riscos sao:

1. **God modules no backend**: arquivos com milhares de linhas misturam caso de uso, provider, persistencia, UX text, fallback e notificacao.
2. **Pages monoliticas no frontend**: telas criticas concentram regra de negocio, estado, chamadas API, formatacao financeira e debug.
3. **Sandbox/mock/producao misturados**: ha uma politica de mocks (`backend/src/config/mock-policy.ts`), mas a separacao ainda aparece espalhada em UI, services e docs.
4. **Sessao e tokens em muitos caminhos**: cookies HttpOnly existem, mas ainda ha compatibilidade e referencias a `session_id`, `session_token`, query/body/sessionStorage/localStorage.
5. **Notificacao de callback sem outbox persistente**: WhatsApp/Telegram tentam entregar mensagens, mas a confiabilidade depende de chamadas diretas e mappings em runtime.
6. **Taxas e conversao em lugares demais**: parte da logica ja foi simplificada, mas fee bridge aparece no backend, frontend e docs com formatos diferentes.
7. **Logs e redacao de dados sensiveis ainda inconsistentes**: ha logger/redaction, mas tambem existem logs debug com tool calls, session IDs, payloads e detalhes de provider.
8. **Docs cresceram junto com o produto**: ha documentacao valiosa, mas muita coisa esta duplicada, antiga ou especifica de sprint.

Plano recomendado: refactor incremental por fronteiras de dominio. Nada de rewrite. Cada fase deve sair com teste, rollback simples e comportamento user-facing preservado.

## Principios do refactor

1. **Strangler pattern**: criar modulos novos ao lado dos antigos, mover uma funcao por vez e manter wrappers compat.
2. **Sem mudar comportamento sem teste**: primeiro extrair helpers puros e contratos; depois alterar fluxo.
3. **Separar user mode, ops mode e sandbox mode**: usuario final nao deve ver endpoint temporario, secret, token, mock hash ou JSON tecnico.
4. **Provider adapter primeiro, provider real depois**: Etherfuse, Evolution, Telegram, Stellar e payout devem ser adaptadores com contrato claro.
5. **Um lugar para taxa**: fee policy e fee bridge devem ter fonte unica no backend e DTO de exibicao para frontend.
6. **Um lugar para notificacao**: toda mensagem pos-operacao deve passar por outbox persistente, nao por chamadas espalhadas.
7. **Mainnet como perfil controlado**: mainnet e testnet devem ser profiles explicitos, nao flags dispersas.
8. **Compatibilidade de chat**: qualquer mudanca deve manter os prompts principais funcionando.

## Target architecture

Proposta de dominios para o backend:

```text
backend/src/domains/
  identity/
    session.service.ts
    onboarding.service.ts
    pin.service.ts
    passkey.service.ts
  wallet/
    wallet.service.ts
    balance.service.ts
    trustline.service.ts
  stellar/
    stellar-network-profile.ts
    stellar-settlement.service.ts
    stellar-pathfinding.service.ts
    stellar-evidence.service.ts
  ramp/
    ramp.types.ts
    ramp-fee.service.ts
    ramp-operation.repository.ts
    pix-funding.service.ts
    pix-withdrawal.service.ts
    etherfuse/
      etherfuse.client-adapter.ts
      etherfuse-customer.service.ts
      etherfuse-quote.service.ts
      etherfuse-onramp.service.ts
      etherfuse-offramp.service.ts
      etherfuse-webhook.service.ts
  payments/
    payment-intent.service.ts
    payment-confirmation.service.ts
    payment-receipt.service.ts
    payment-recipient.service.ts
  international-settlement/
    quote.service.ts
    transfer-state-machine.ts
    settlement-orchestrator.service.ts
    payout-adapters/
  notifications/
    notification-outbox.repository.ts
    notification-dispatcher.service.ts
    whatsapp.adapter.ts
    telegram.adapter.ts
  agent/
    tool-registry.ts
    context-builder.ts
    response-policy.ts
  shared/
    public-error.ts
    redaction.ts
    idempotency.ts
    money.ts
```

Proposta para frontend:

```text
frontend/components/operations/
  OperationShell.tsx
  StatusTimeline.tsx
  PublicErrorBanner.tsx
  FeeBridge.tsx
  DebugDisclosure.tsx
  MoneyInput.tsx
  PinPanel.tsx

frontend/features/
  auth/
  chat/
  pix-ramp/
  payment-confirmation/
  receipts/
  institution-settlement/
  mainnet/
  ops/
```

## Refactor plan by phase

### Phase 0 - Guardrails and maps

Objetivo: preparar o refactor sem mudar comportamento.

Actions:

- Criar mapa de ownership por dominio: agent, wallet, ramp, payment, notification, ops, docs.
- Criar `docs/REFACTOR_TRACKING.md` com checklist por fase quando a implementacao comecar.
- Definir contratos TypeScript para:
  - `PublicError`
  - `MoneyAmount`
  - `FeeLine`
  - `RampQuote`
  - `RampOperation`
  - `NotificationJob`
  - `AgentToolResult`
- Adicionar regra de CI/manual: nenhum novo arquivo de page client acima de 800 linhas sem justificativa.
- Rodar baseline:

```bash
cd backend && npm test
cd frontend && npm run build
node scripts/user-flow-smoke.mjs
```

Acceptance criteria:

- Nenhuma mudanca user-facing.
- Documento de tracking criado.
- Baseline de build/test documentado.

### Phase 1 - Split Etherfuse/PIX from `anchor.service.ts`

Arquivo atual principal:

- `backend/src/api/services/anchor.service.ts`

Problema:

`AnchorService` concentra Etherfuse client, KYC sandbox, quotes, customer, on-ramp, off-ramp, fallbacks, wallet resolution, fee bridge, auto-pay e test helpers.

Novo desenho:

```text
backend/src/domains/ramp/
  ramp.types.ts
  ramp-fee.service.ts
  ramp-operation.repository.ts
  pix-funding.service.ts
  pix-withdrawal.service.ts
  etherfuse/
    etherfuse-runtime.service.ts
    etherfuse-customer.service.ts
    etherfuse-quote.service.ts
    etherfuse-onramp.service.ts
    etherfuse-offramp.service.ts
    etherfuse-sandbox.service.ts
```

Ordem segura:

1. Extrair tipos e normalizadores puros.
2. Extrair runtime/config Etherfuse.
3. Extrair quote service.
4. Extrair customer/KYC sandbox.
5. Extrair on-ramp.
6. Extrair off-ramp.
7. Manter `AnchorService` como facade temporaria chamando os novos services.
8. So depois remover funcoes antigas.

Acceptance criteria:

- `anchor.service.ts` cai de ~4142 linhas para menos de 1200.
- Endpoints existentes continuam respondendo.
- Helpers sandbox continuam protegidos por secret.
- Taxa retornada ao frontend segue o modelo simplificado:
  - provider on-ramp;
  - TalkToStellar transaction fee;
  - provider off-ramp.

### Phase 2 - Create a single fee engine

Arquivos envolvidos:

- `backend/src/api/services/platform-fee.service.ts`
- `backend/src/api/services/economy-engine.service.ts`
- `backend/src/utils/fee-display.ts`
- `frontend/app/pix-ramp/pix-ramp-client.tsx`
- `frontend/app/international-transfer/international-transfer-client.tsx`
- `docs/SISTEMA_DE_TAXAS_ATUAL.md`
- `docs/SISTEMA_DE_TAXAS_RESUMO.md`

Problema:

O usuario/reviewer precisa ver taxa real do fluxo, mas hoje a exibicao de taxa ainda aparece espalhada em backend, frontend e docs. Isso aumenta risco de diferenca entre valor executado e valor mostrado.

Novo contrato:

```ts
type FeeBridge = {
  source_amount: MoneyAmount;
  gross_destination_amount: MoneyAmount;
  lines: FeeLine[];
  net_destination_amount: MoneyAmount;
  retained_pct: string;
  source: "provider_quote" | "provider_order" | "computed_from_execution";
};

type FeeLine = {
  code: "provider_onramp" | "talktostellar_transaction" | "provider_offramp";
  label: string;
  amount: MoneyAmount;
  bps?: number;
  source: "provider" | "config" | "execution";
};
```

Actions:

- Criar backend `RampFeeService.buildFeeBridge(...)`.
- Frontend apenas renderiza `FeeBridge`; nao recalcula taxa.
- Remover estimativas opcionais de UI principal.
- Benchmark tradicional 3,5% fica apenas em painel comparativo, nunca como taxa cobrada.

Acceptance criteria:

- Uma fonte de verdade para taxas.
- UI de on-ramp e off-ramp mostra somente taxas cobradas.
- `/international-transfer` usa o mesmo DTO de fee bridge.

### Phase 3 - Split agent tools and prompt orchestration

Arquivos atuais:

- `backend/src/agent/tools.ts`
- `backend/src/agent/graph.ts`
- `backend/src/agent/routes.ts`

Problema:

O agente tem muitas responsabilidades: interpretar linguagem, buscar contatos, criar links, consultar saldo, preparar PIX, conversao, payment, mainnet, notificacao e formatar resposta final. Isso explica bugs recorrentes em mensagens, duplicidade, conversao e erros tecnicos vazando para o WhatsApp.

Novo desenho:

```text
backend/src/domains/agent/
  tool-registry.ts
  context-builder.ts
  response-policy.ts
  tools/
    balance.tools.ts
    contacts.tools.ts
    payment.tools.ts
    conversion.tools.ts
    pix.tools.ts
    mainnet.tools.ts
    onboarding.tools.ts
    support.tools.ts
```

Actions:

1. Criar registry que exporta `ALL_TOOLS` igual ao contrato atual.
2. Mover uma familia de tools por commit.
3. Criar `AgentPublicResponsePolicy` para proibir termos como `XDR`, `trustline`, `source_issuer`, `schema cache`, `session_token` em respostas user-facing.
4. Usar `scripts/user-flow-smoke.mjs` como teste de regressao por prompt.

Acceptance criteria:

- `tools.ts` vira facade de ate 300 linhas ou e removido.
- `graph.ts` nao faz lookup profundo de contato/pagamento diretamente.
- Prompts principais passam:
  - `saldo`
  - `contatos`
  - `quero mandar 10 reais para Ana`
  - `quero colocar 10 reais via PIX`
  - `quero retirar 10 reais para meu PIX`
  - `quero converter 10 reais para dolares`

### Phase 4 - Split `external-finalize.controller.ts`

Arquivo atual:

- `backend/src/api/controllers/external-finalize.controller.ts`

Problema:

O controller concentra:

- onboarding;
- link existing;
- login;
- PIN/passkey;
- confirmacao de pagamento;
- conversao;
- callback externo;
- notificacao;
- receipt;
- idempotencia local;
- resolucao de contato.

Novo desenho:

```text
backend/src/api/controllers/
  external-auth.controller.ts
  external-onboarding.controller.ts
  payment-confirmation.controller.ts
  conversion-confirmation.controller.ts
  external-callback.controller.ts

backend/src/domains/payments/
  payment-confirmation.service.ts
  payment-link.service.ts
  recipient-resolution.service.ts
```

Actions:

1. Extrair handlers sem mudar rotas.
2. Criar service de confirmacao com input/output tipado.
3. Deixar o controller atual apenas roteando para handlers.
4. Remover `any` nos payloads principais.

Acceptance criteria:

- Nenhum handler acima de 400 linhas.
- Confirmacao de pagamento gera notificacao via outbox.
- Erros publicos mapeados por codigo.

### Phase 5 - Decompose frontend pages

Arquivos atuais:

- `frontend/app/pix-ramp/pix-ramp-client.tsx`
- `frontend/app/confirm-payment/confirm-payment-client.tsx`
- `frontend/app/create-account/create-account-client.tsx`
- `frontend/app/international-transfer/international-transfer-client.tsx`
- `frontend/app/global-transfer/global-transfer-client.tsx`
- `frontend/components/chat-window.tsx`

Problema:

As pages concentram estado, copy, chamadas API, regras de taxa, debug, session, loading, auth e render. Isso torna cada ajuste de UX arriscado.

Plano de componentes:

```text
frontend/features/pix-ramp/
  usePixRampFlow.ts
  PixRampSummary.tsx
  PixRampFeeBridge.tsx
  PixRampTimeline.tsx
  PixRampCheckout.tsx
  PixRampDebugPanel.tsx

frontend/features/payment-confirmation/
  usePaymentConfirmation.ts
  PaymentSummary.tsx
  RecipientCard.tsx
  PinConfirmation.tsx
  ReceiptResult.tsx

frontend/features/institution-settlement/
  useInstitutionSettlementFlow.ts
  InstitutionRouteForm.tsx
  InstitutionFeeBridge.tsx
  EvidenceTimeline.tsx
  ReconciliationPanel.tsx
  OpsApiLog.tsx
```

Actions:

- Primeiro extrair componentes visuais puros.
- Depois extrair hooks de estado.
- Por ultimo trocar pages para montagem de componentes.

Acceptance criteria:

- `pix-ramp-client.tsx` abaixo de 800 linhas.
- `confirm-payment-client.tsx` abaixo de 700 linhas.
- `international-transfer-client.tsx` abaixo de 900 linhas.
- Debug aparece apenas em `DebugDisclosure` ou rota ops.
- User-facing text vem de blocos consistentes, nao espalhado em centenas de `setStatus`.

### Phase 6 - Unify session/auth contract

Arquivos relevantes:

- `frontend/lib/session.ts`
- `frontend/lib/server-session.ts`
- `frontend/app/api/chat/route.ts`
- `frontend/components/chat-window.tsx`
- `frontend/components/chat-sidebar.tsx`
- `backend/src/repositories/agent.repository.ts`
- `backend/src/repositories/wallet.repository.ts`
- `backend/src/api/middlewares/audit.middleware.ts`
- `backend/src/services/idempotency.service.ts`

Problema:

O app ja caminha para cookie HttpOnly, mas ainda existem referencias e compatibilidade por `session_id`, `session_token`, query string, body, `sessionStorage` e `localStorage`.

Target:

- Browser usa cookie HttpOnly para sessao ativa.
- Chat externo usa mapping de provider para session.
- Ops/debug pode aceitar `session_id`, mas isolado em `/ops` e protegido.
- Frontend nao persiste token sensivel em storage.

Actions:

1. Criar `SessionContextService` no backend.
2. Criar `getAuthenticatedSession(req)` para API.
3. Marcar endpoints que ainda aceitam `session_id` como legacy.
4. Remover session fields manuais de UI publica.
5. Manter compat temporaria para Telegram/Evolution ate callback estar estavel.

Acceptance criteria:

- User-facing frontend nao exibe nem pede `session_token`.
- Chat web nao redireciona automaticamente para login; instrui o usuario a pedir novo link quando sessao expira.
- Logs redigem session/token por padrao.

### Phase 7 - Notification outbox for WhatsApp/Telegram callbacks

Arquivos atuais:

- `backend/src/api/services/transfer-notification.service.ts`
- `backend/src/api/services/evolution.service.ts`
- `telegram/src/index.js`
- `backend/src/api/controllers/external-finalize.controller.ts`

Problema:

O fluxo esperado e: operacao concluiu -> usuario recebe WhatsApp/Telegram. Hoje a entrega depende de chamadas diretas e mappings. Se Evolution falhar, estiver lenta, usar instancia errada ou o request web terminar antes, o callback pode sumir.

Novo desenho:

```text
notification_outbox
  id
  provider
  provider_user_id
  session_id
  user_id
  template
  payload
  status: pending | sending | delivered | failed | dead
  attempts
  last_error
  next_attempt_at
  created_at
  updated_at
```

Actions:

1. Criar migration `notification_outbox`.
2. `PaymentReceiptService` e `TransferNotificationService` passam a enfileirar jobs.
3. Worker/poller processa jobs pendentes.
4. Evolution adapter faz envio e grava tentativa.
5. Endpoint ops: `GET /api/notifications/outbox?session_id=...`.
6. Botao admin/debug para reenviar callback.

Acceptance criteria:

- Confirmacao web retorna sucesso mesmo se WhatsApp estiver temporariamente fora.
- Mensagem final fica em fila ate entregar ou falhar com diagnostico.
- Usuario nao recebe duplicata se endpoint for chamado duas vezes.
- Debug fica verificavel por job ID.

### Phase 8 - Mainnet/testnet profile hardening

Arquivos relevantes:

- `backend/src/config/stellar.ts`
- `backend/src/api/services/mainnet-wallet.service.ts`
- `frontend/app/mainnet/mainnet-client.tsx`
- `backend/src/api/services/stellar.service.ts`
- `backend/src/services/stellar.service.ts`

Problema:

Testnet, mainnet e Etherfuse precisam de fronteiras fortes. Etherfuse deve permanecer testnet/sandbox enquanto nao houver provider real; mainnet deve permitir leitura/interacao apenas quando explicitamente habilitada e limitada.

Target:

```text
NetworkProfile:
  id: TESTNET | PUBLIC
  horizon_url
  network_passphrase
  friendbot_enabled
  allowed_operations
  max_validation_amount_usd
```

Actions:

- Consolidar perfis de rede.
- Garantir que Etherfuse/TESOURO nao execute em PUBLIC.
- Mainnet UI mostra saldo e operacoes habilitadas por feature flag.
- Toda operacao mainnet deve exigir confirmacao forte e limite.

Acceptance criteria:

- `STELLAR_NETWORK=PUBLIC` nunca ativa sandbox PIX.
- Mainnet nao usa Friendbot nem fallback testnet.
- Testes cobrem bloqueios principais.

### Phase 9 - Logging, redaction and public errors

Arquivos relevantes:

- `backend/src/utils/logger.ts`
- `backend/src/utils/redaction.ts`
- `backend/src/utils/public-error.ts`
- `frontend/lib/public-errors.ts`
- `backend/src/agent/graph.ts`
- `telegram/src/index.js`
- `backend/src/api/services/evolution.service.ts`

Problema:

Ha boas bases de redacao e public errors, mas tambem ha logs diretos e debug com payloads grandes. Isso aumenta risco de vazar PIN, token, session, phone, provider payload ou erro SQL.

Actions:

- Proibir `console.*` em runtime backend, exceto bootstrap controlado.
- Criar `safeLogger` que redige recursivamente:
  - `pin`
  - `token`
  - `secret`
  - `session_token`
  - `authorization`
  - `account_number`
  - `stellar_secret`
  - `cpf`
  - telefone completo
- Reduzir debug de tool calls no agente.
- Unificar frontend/backend error mapper.

Acceptance criteria:

- Erro tecnico nunca chega cru ao usuario.
- Logs mantem `support_code`.
- Scripts de smoke verificam ausencia de termos proibidos em respostas.

### Phase 10 - Docs and deprecated cleanup

Arquivos relevantes:

- `docs/*`
- `deprecated/*`
- `sandbox/*`
- `sow/*`

Problema:

Existe documentacao util, mas parte dela representa estado antigo. O repo tambem mantem `deprecated/` e sandbox historico, o que dificulta passar contexto para outra IA ou reviewer.

Actions:

- Criar indice em `docs/README.md`.
- Classificar docs:
  - current;
  - historical;
  - demo;
  - ops;
  - security;
  - funding/SOW.
- Mover docs obsoletos para `docs/archive/`.
- Manter `deprecated/` fora do runtime e documentar que nao entra em deploy.

Acceptance criteria:

- Reviewer sabe qual doc ler para cada objetivo.
- SOW, demo de usuario, demo de anchor, fees e mocks nao se contradizem.

## Highest impact first refactors

Se for escolher apenas cinco refactors para comecar:

1. **Notification outbox**: resolve de forma estrutural o callback WhatsApp/Telegram pos-transacao.
2. **Split `AnchorService`**: reduz risco nos fluxos PIX/Etherfuse/on-off-ramp.
3. **Single fee engine**: evita divergencia entre valor executado e valor exibido.
4. **Split agent tools**: diminui bugs de prompt, conversao, contato inexistente e resposta tecnica ao usuario.
5. **Decompose `pix-ramp-client.tsx`**: melhora UX sem mexer primeiro no core financeiro.

## Suggested commit sequence

Sequencia recomendada para implementar sem travar o projeto:

1. `refactor: add ramp domain types and fee bridge contract`
2. `refactor: extract etherfuse runtime and quote services`
3. `refactor: extract etherfuse onramp service`
4. `refactor: extract etherfuse offramp service`
5. `refactor: add notification outbox repository`
6. `refactor: route transfer notifications through outbox`
7. `refactor: split agent tools by domain`
8. `refactor: extract pix ramp frontend components`
9. `refactor: extract payment confirmation service`
10. `docs: add docs index and archive stale docs`

Cada commit deve ser pequeno o suficiente para rollback isolado.

## Tests to add or strengthen

Backend:

- Ramp quote fee bridge:
  - provider fee returned;
  - provider fee missing;
  - TalkToStellar fee only;
  - on-ramp + off-ramp combined.
- Etherfuse adapter:
  - sandbox blocked without secret;
  - testnet-only enforcement;
  - provider error mapping.
- Payment confirmation:
  - valid PIN;
  - invalid PIN;
  - expired quote;
  - missing contact;
  - notification job enqueued.
- Notification outbox:
  - enqueue idempotency;
  - retry;
  - delivered;
  - failed/dead.
- Agent prompts:
  - balance;
  - contacts;
  - send money to existing contact;
  - reject non-existing contact;
  - PIX on;
  - PIX off;
  - conversion quote.

Frontend:

- Pix ramp page:
  - session detected;
  - no session;
  - quote required;
  - fee bridge rendered;
  - sandbox badge only in demo/sandbox.
- Confirm payment:
  - PIN path only;
  - passkey hidden;
  - completed receipt;
  - retryable public error.
- Institution settlement:
  - expired quote regenerates;
  - evidence timeline;
  - fee bridge from backend DTO.

Smoke:

```bash
node scripts/user-flow-smoke.mjs
```

Use esse script como gate minimo sempre que mexer no agente.

## Metrics of success

O refactor esta dando certo quando:

- Nenhum arquivo runtime principal passa de 1500 linhas.
- Pages criticas ficam abaixo de 800 linhas.
- Nenhum fluxo user-facing mostra `session_token`, `source_issuer`, `dest_issuer`, `XDR`, `trustline`, `schema cache` ou erro SQL.
- Mocks ficam atras de `ALLOW_*_MOCKS` e rotas ops/debug.
- Taxas vem do backend em um DTO unico.
- WhatsApp/Telegram callback tem outbox e tentativas persistidas.
- Testnet/mainnet sao profiles explicitos.
- O reviewer consegue entender o produto por docs atuais sem abrir docs historicos.

## Commands used in this scan

```bash
git status --short
rg --files
find . -maxdepth 3 -type f
find . -maxdepth 2 -type d
rg --files | awk -F/ '{print $1}' | sort | uniq -c | sort -nr
rg --files backend/src frontend/app frontend/components frontend/lib telegram/src evolution docs sow scripts | xargs wc -l | sort -nr | head -60
rg -n "TODO|FIXME|HACK|temporary|legacy|deprecated|mock|sandbox|testnet|mainnet|localStorage|session_token|session_id|console\\.|process\\.env|any\\b" backend/src frontend/app frontend/components frontend/lib telegram/src evolution scripts --stats
rg -n "export class|class .*Service|class .*Controller|static async|async function|function " backend/src/api/services backend/src/api/controllers backend/src/agent frontend/app frontend/components frontend/lib | wc -l
rg -n "session_token|sessionToken|localStorage|sessionStorage|token=|session_id" frontend/app frontend/components frontend/lib backend/src | wc -l
rg -n "mock|sandbox|testnet|mainnet" backend/src frontend/app frontend/components frontend/lib telegram/src evolution scripts | wc -l
rg -n "console\\.(log|warn|error|debug)|logger\\.debug|logger\\.info|logger\\.warn|logger\\.error" backend/src frontend/app frontend/components frontend/lib telegram/src evolution scripts | wc -l
rg -n "any\\b" backend/src frontend/app frontend/components frontend/lib telegram/src evolution scripts | wc -l
```

## Current companion docs

Use estes documentos como contexto, mas este arquivo deve guiar a ordem do refactor:

- `docs/MOCKED_SURFACES_FULL_REPO_SCAN_20260523.md`
- `docs/NO_MOCKS_REALISTIC_FLOW_ACTION_PLAN.md`
- `docs/SISTEMA_DE_TAXAS_ATUAL.md`
- `docs/SISTEMA_DE_TAXAS_RESUMO.md`
- `docs/WHATSAPP_EVOLUTION_CALLBACK_TROUBLESHOOTING.md`
- `docs/UX_FULL_CODEBASE_SCAN_20260521.md`
- `docs/PROJECT_FEATURE_STATE_FOR_AI_REVIEW_20260523.md`

## Recommended next implementation step

Comecar pela notification outbox ou pelo split de `AnchorService`.

Minha recomendacao pratica:

1. Implementar notification outbox primeiro, porque o problema de WhatsApp callback afeta demo e confianca.
2. Em seguida extrair fee bridge backend, porque taxas e valores precisam ficar consistentes antes de qualquer novo fluxo real.
3. Depois dividir `AnchorService`, mantendo facade temporaria.

Essa ordem reduz bugs visiveis ao usuario antes de atacar a divida tecnica mais profunda.
