# TalkToStellar - estado atual de features para revisao por IA

Data do snapshot: 2026-05-23

Objetivo deste documento: entregar para outra IA um inventario detalhado do estado atual do projeto TalkToStellar, para que ela consiga julgar o produto, encontrar lacunas, sugerir melhorias e priorizar proximas etapas sem precisar abrir a codebase inteira.

## Prompt sugerido para outra IA

Use este prompt junto com este documento:

```text
Voce e um reviewer senior de produto, engenharia, fintech, Stellar, seguranca e UX.

Analise o estado atual do projeto TalkToStellar abaixo. Quero:

1. Avaliacao tecnica da arquitetura.
2. Avaliacao de produto e posicionamento.
3. Avaliacao de seguranca e riscos operacionais.
4. Avaliacao de UX dos principais fluxos.
5. Separacao clara entre o que ja e real, o que e sandbox/testnet/mock e o que ainda e integracao futura.
6. Priorizacao das proximas 10 melhorias de maior impacto.
7. Sugestoes para deixar o projeto mais convincente para investidores, hackathon, Instawards/SCF ou parceiros.
8. Pontos que podem ser overclaim regulatorio ou promessa perigosa.
9. Perguntas criticas que um avaliador tecnico faria.
10. Um plano de 30 dias realista.

Nao assuma que o produto ja opera dinheiro real em producao. Considere que Stellar Testnet e Etherfuse sandbox sao usados para demonstracao.
```

## Escopo do scan

Scan realizado localmente no repo `talk-to-stellar`, ignorando `node_modules`, `.next`, `dist`, `build` e `coverage`.

Resumo de arquivos rastreados no momento deste snapshot, incluindo este proprio documento:

```text
512 arquivos rastreaveis fora de builds/dependencias.
244 em backend/
142 em frontend/
53 em docs/
39 em deprecated/
14 em telegram/
10 em evolution/
4 em sow/
```

Superficies revisadas:

- `backend/src`: API, agente, services, repositories, middleware, config e integrações.
- `backend/migrations`: schema Supabase/Postgres e RLS.
- `backend/tests`: cobertura de unidade/integracao.
- `frontend/app`: rotas Next.js, APIs proxy e telas.
- `frontend/components` e `frontend/lib`: chat, landing, UI, i18n, session, errors.
- `telegram/src`: adapter Telegram.
- `evolution/`: deploy Evolution API para WhatsApp.
- `docs/`: documentacao tecnica, seguranca, UX, deploy, videos e SOW.
- `sow/`: Statement of Work e propostas.
- `deprecated/`: artefatos historicos fora do runtime atual, revisados apenas para identificar legado e riscos de confusao.

Comandos base usados no scan:

```bash
rg --files -g '!node_modules' -g '!.next' -g '!dist' -g '!build' -g '!coverage'
find backend/src frontend/app frontend/components frontend/lib telegram/src evolution docs sow -maxdepth 2 -type f
find backend/migrations -maxdepth 1 -type f
find backend/tests -maxdepth 1 -type f
```

## Tese atual do produto

TalkToStellar evoluiu de uma carteira conversacional em Stellar para uma infraestrutura conversacional de conversao e roteamento entre BRL e USD usando Pix, Stellar, USDC e destinos financeiros externos.

Tese curta:

```text
Pix em BRL
-> quote/conversao
-> settlement via Stellar/USDC
-> instrucao ou prova de entrega em USD/conta internacional
-> historico, comprovante e reconciliacao
```

O produto nao deve ser posicionado como banco, remessa regulada pronta, substituto direto de Wise/Mercury/Revolut ou forma de evitar IOF/regulacao. O posicionamento correto e:

```text
TalkToStellar e um trilho conversacional e programavel para reduzir friccao, custo e opacidade na conversao BRL -> USD, usando Stellar como infraestrutura de liquidacao e mantendo destino financeiro flexivel.
```

## Estado geral em uma frase

O projeto ja tem um backend grande com conta, carteira Stellar, agente conversacional, canais Telegram/WhatsApp/web, PIX sandbox via Etherfuse, pagamentos, conversoes, recibos, contatos, mainnet readiness, painel institucional BRL -> USD e payout adapters; mas ainda mistura componentes reais de testnet com partes sandbox/mock e precisa de clareza operacional antes de qualquer producao financeira.

## Principais modulos do repo

| Area | Pasta | Estado |
| --- | --- | --- |
| Backend API | `backend/src` | Implementado e amplo. Express + TypeScript + Supabase + Stellar SDK + LangChain/OpenAI. |
| Frontend web | `frontend/app`, `frontend/components` | Implementado em Next.js. Tem chat, landing, onboarding, PIX, pagamentos, recibos, mainnet console e painel institucional. |
| Telegram | `telegram/src` | Adapter dedicado com Telegraf, encaminha mensagens para backend e mantem sessao por usuario. |
| WhatsApp | `evolution/` + backend Evolution service | Integracao via Evolution API, deploy Docker/Railway e callbacks transacionais. |
| Etherfuse/Pix | `backend/src/api/services/anchor.service.ts` e regional starter pack | Implementado para sandbox/devnet com fallback local; testnet-only por design atual. |
| Stellar | `backend/src/api/services/stellar.service.ts`, `backend/src/config/stellar.ts` | Runtime ativo testnet por default, path payments, trustlines, funding testnet, mainnet guards. |
| BRL -> USD rail | `international-transfer.*`, `brl-usd-quote.service.ts`, `usd-payout-adapters.ts` | Implementado como orchestration layer com mock/sandbox payout por default. |
| Mainnet infra | `backend/src/infrastructure/stellar/*`, `/mainnet` frontend | Preparacao/readiness e console de carteira mainnet; produto ativo ainda deve ficar testnet. |
| Docs/SOW | `docs/`, `sow/` | Muito completo, incluindo video guide, security, UX, fee system, deployment e SOW. |

## Stack atual

Backend:

- Node.js + TypeScript.
- Express.
- Supabase/Postgres.
- Stellar SDK `@stellar/stellar-sdk`.
- LangChain/OpenAI.
- SimpleWebAuthn server.
- JWT links.
- Jest/ts-jest.

Frontend:

- Next.js 16.
- React 18.
- Tailwind v4.
- Radix UI primitives.
- lucide-react icons.
- SimpleWebAuthn browser.
- QRCode.

Channels:

- Telegram bot com Telegraf.
- WhatsApp via Evolution API.
- Web chat via Next.js.

Infra:

- Docker compose.
- Railway guides.
- Evolution Docker wrapper.
- Supabase migrations.

Arquivos de deploy/runners detectados:

```text
docker-compose.yml
docker-compose.dev.yml
start-local.sh
backend/Dockerfile
backend/railway.json
backend/render.yaml
frontend/Dockerfile
frontend/railway.json
telegram/Dockerfile
evolution/Dockerfile
evolution/railway.json
```

## Frontend - rotas e estado de feature

### Produto usuario final

| Rota | Feature | Estado |
| --- | --- | --- |
| `/` | Landing page moderna com narrativa Pix/Stellar/conversacional. | Implementado. Precisa manter disclaimers sandbox/testnet quando aplicavel. |
| `/chat` | Chat web com assistente. | Implementado. Usa `/api/chat` proxy para backend agent. |
| `/create-account` | Criacao/onboarding por link. | Implementado. PIN-first; email/passkey desativados na UX atual. |
| `/login` | Login por link/canal externo e PIN. | Implementado. Passkey visual desativada por enquanto. |
| `/logout` | Logout via link/canal. | Implementado. |
| `/change-pin` | Redefinicao de PIN. | Implementado via token seguro. |
| `/confirm-payment` | Confirmacao de pagamento com PIN. | Implementado; envia feedback para web chat e callback para canal externo quando mapeado. |
| `/confirm-conversion` | Confirmacao de conversao. | Implementado. |
| `/claim-payment` | Claim de pagamento/link recebido. | Implementado. |
| `/pay-anyone` | Gerar link de pagamento/recebimento. | Implementado. |
| `/send-external` | Envio para chave Stellar externa. | Implementado, mas e fluxo tecnico/avancado. |
| `/transactions` | Historico de transacoes. | Implementado. |
| `/receipt` e `/receipt/[code]` | Comprovantes/recibos. | Implementado. |
| `/profile/[publicKey]` | Perfil de wallet. | Implementado. |
| `/u/[username]` | Perfil publico/global profile para receber pagamento. | Implementado. |

### Pix e ramp

| Rota | Feature | Estado |
| --- | --- | --- |
| `/pix-on` | Entrada via Pix/on-ramp. | Implementado; chama `pix-ramp` em modo on-ramp. |
| `/pix-off` | Saida via Pix/off-ramp. | Implementado; chama `pix-ramp` em modo off-ramp. |
| `/pix-ramp` | UI unificada de on/off ramp, QR, status, fees, fluxo fund-and-pay. | Implementado. Integra com Etherfuse sandbox/testnet e fallback. |

### Infra/operador/demo tecnica

| Rota | Feature | Estado |
| --- | --- | --- |
| `/international-transfer` | Painel BRL -> USD institutional settlement. | Implementado; mostra quote, funding, Stellar evidence, payout instruction, logs, fees, reconciliation. |
| `/institution-settlement` | Alias/entrada para painel institucional. | Implementado. |
| `/global-transfer` | Lab de custo/assumptions globais. | Implementado, mais mock/lab. |
| `/mainnet` | Console Mainnet/Testnet toggle, attach mainnet wallet, balances, operations, preview. | Implementado como console/infra. Nao torna produto ativo mainnet. |
| `/r/[code]` | Redirect de short link. | Implementado. |

### APIs proxy do frontend

| Rota | Uso |
| --- | --- |
| `/api/chat` | Proxy web chat -> backend agent. |
| `/api/agent/[...path]` | Proxy agent. |
| `/api/external/[...path]` | Proxy external links/finalize/receipts. |
| `/api/financial/[...path]` | Proxy financial/mainnet/transactions. |
| `/api/ramp/[...path]` | Proxy Etherfuse ramp. |
| `/api/quotes/[...path]` | Proxy BRL/USD quotes. |
| `/api/transfers` e `/api/transfers/[...path]` | Proxy transfer orchestration. |
| `/api/passkeys/[...path]` | Proxy passkey backend. |
| `/api/webhooks/[...path]` | Proxy webhooks quando necessario. |
| `/api/session` | Sessao browser/cookie. |
| `/api/logout` | Logout browser. |

## Backend - rotas HTTP atuais

Base backend: Express app em `backend/src/app.ts`.

Mounts principais:

```text
/health
/api/agent
/api/actions
/api/external
/api/passkeys
/api/security
/api/financial
/api/ramp
/api/quotes
/api/transfers
/api/webhooks
/api/evolution
/webhook/evolution
/webhooks
```

### Agent

| Endpoint | Uso |
| --- | --- |
| `POST /api/agent/query` | Entrada principal do assistente conversacional. |
| `GET /api/agent/session/:session_id` | Consulta sessao. |
| `GET /api/agent/messages/:session_id` | Historico de mensagens. |
| `POST /api/agent/logout` | Logout conversacional. |
| `POST /api/agent/login` | Login/sessao agent. |
| `GET /api/agent/balance/:session_id` | Saldo por sessao. |

### Actions legadas

| Endpoint | Uso |
| --- | --- |
| `POST /api/actions/login` | Login legado. |
| `POST /api/actions/onboard-user` | Onboarding legado. |
| `POST /api/actions/add-contact` | Adicionar contato. |
| `POST /api/actions/lookup-contact-by-name` | Resolver contato. |
| `POST /api/actions/list-contacts` | Listar contatos. |
| `POST /api/actions/build-payment-xdr` | Montar payment XDR. |
| `POST /api/actions/build-path-payment-xdr` | Montar path payment XDR. |
| `POST /api/actions/get-operation-history` | Historico. |
| `POST /api/actions/get-account-balance` | Saldo. |
| `POST /api/actions/initiate-pix-deposit` | Inicio de deposito Pix legado. |
| `POST /api/actions/check-deposit-status` | Status deposito. |
| `POST /api/actions/sign-and-submit-xdr` | Assinar/submeter XDR. |

### External/link/payment

| Endpoint | Uso |
| --- | --- |
| `POST /api/external/check-account` | Verifica conta externa por provider/user id. |
| `POST /api/external/link-existing` | Vincula canal externo a conta existente. |
| `POST /api/external/link-session` | Vincula sessao a conta externa. |
| `POST /api/external/finalize` | Finaliza onboarding, pagamento ou conversao com token/PIN/passkey. |
| `GET /api/external/validate-token` | Valida token de link. |
| `GET /api/external/short-links/:code` | Resolve short link. |
| `POST /api/external/short-links` | Cria short link. |
| `POST /api/external/pay-links` | Cria link de pagamento. |
| `POST /api/external/pay-links/claim` | Claim de link de pagamento. |
| `POST /api/external/send-to-wallet` | Envio para wallet externa. |
| `POST /api/external/recovery-init` | Inicio recuperacao externa. |
| `POST /api/external/recovery-complete` | Completa recuperacao externa. |
| `GET /api/external/receipts/viewer/:code` | Viewer de receipt. |
| `GET /api/external/receipts/:tx_hash` | Receipt por tx hash. |
| `GET /api/external/receipts/:tx_hash/download` | Download receipt. |
| `POST /api/external/receipts/render` | Render receipt. |

### Security/passkey/PIN

| Endpoint | Uso | Estado |
| --- | --- | --- |
| `POST /api/passkeys/register-init` | Inicia cadastro passkey. | Backend existe. UI desativada por enquanto. |
| `POST /api/passkeys/register-complete` | Completa cadastro passkey. | Backend existe. |
| `POST /api/passkeys/auth-init` | Inicia auth passkey. | Backend existe. |
| `POST /api/passkeys/auth-complete` | Completa auth passkey. | Backend existe. |
| `POST /api/security/reset-pin-init` | Inicia reset PIN. | Implementado. |
| `POST /api/security/reset-pin-verify` | Verifica token reset. | Implementado. |
| `POST /api/security/reset-pin-finalize` | Finaliza reset. | Implementado. |

### Financial

| Endpoint | Uso |
| --- | --- |
| `GET /api/financial/conversion-preview` | Preview BRL -> USDC. |
| `GET /api/financial/conversion-fees-preview` | Preview de fees. |
| `GET /api/financial/usdc-to-brl-preview` | Preview USDC -> BRL. |
| `GET /api/financial/activity-feed/:session_id` | Feed financeiro. |
| `GET /api/financial/insights/:session_id` | Insights. |
| `GET /api/financial/smart-contacts/:session_id` | Smart contacts. |
| `GET /api/financial/replay/:session_id` | Sugestao de replay. |
| `GET /api/financial/savings/:session_id` | Economia estimada. |
| `POST /api/financial/invoices` | Cria invoice. |
| `GET /api/financial/invoices/:session_id` | Lista invoices. |
| `POST /api/financial/global-profile` | Cria/recupera global profile. |
| `GET /api/financial/global-profile/:session_id` | Recupera global profile. |
| `POST /api/financial/u/:username/pay` | Pagamento via perfil publico. |
| `GET /api/financial/u/:username` | Perfil publico. |
| `GET /api/financial/transactions/:session_id` | Historico. |
| `GET /api/financial/wallet-profile/:public_key` | Perfil por public key. |
| `GET /api/financial/mainnet/status` | Status/readiness mainnet. |
| `GET /api/financial/mainnet/wallet` | Carteira mainnet vinculada. |
| `POST /api/financial/mainnet/wallet` | Vincula public key mainnet. |
| `GET /api/financial/mainnet/balance` | Balance mainnet. |
| `GET /api/financial/mainnet/operations` | Operacoes mainnet. |
| `POST /api/financial/mainnet/payment-preview` | Preview pagamento mainnet. |

### Etherfuse/Pix/ramp

| Endpoint | Uso |
| --- | --- |
| `GET /api/ramp/etherfuse/config` | Runtime config: sandbox/testnet/asset. |
| `POST /api/ramp/etherfuse/resolve-wallet` | Resolve wallet por email, sandbox/devnet. |
| `POST /api/ramp/etherfuse/customer` | Cria/recupera customer e KYC sandbox. |
| `GET /api/ramp/etherfuse/kyc-status` | Status KYC. |
| `GET /api/ramp/etherfuse/assets` | Assets Etherfuse. |
| `GET /api/ramp/etherfuse/wallet-balances` | Balances wallet. |
| `GET /api/ramp/etherfuse/fiat-accounts` | Contas fiat cadastradas. |
| `POST /api/ramp/etherfuse/external-bank-account` | Conta bancaria externa/Pix. |
| `POST /api/ramp/etherfuse/quote` | Quote Etherfuse on/off ramp. |
| `POST /api/ramp/etherfuse/trustline` | Trustline TESOURO. |
| `POST /api/ramp/etherfuse/onramp` | Cria ordem on-ramp. |
| `GET /api/ramp/etherfuse/onramp/:orderId` | Status on-ramp. |
| `POST /api/ramp/etherfuse/offramp-preview` | Preview off-ramp. |
| `POST /api/ramp/etherfuse/offramp` | Cria off-ramp. |
| `GET /api/ramp/etherfuse/offramp/:orderId` | Status off-ramp. |
| `POST /api/ramp/etherfuse/offramp/:orderId/submit` | Submete off-ramp. |
| `POST /api/ramp/etherfuse/sandbox/simulate-fiat` | Simula fiat recebido no sandbox. |
| `POST /api/ramp/etherfuse/sandbox/transfer-recipient` | Resolve destinatario real para fund-and-pay. |
| `POST /api/ramp/etherfuse/sandbox/pix-funded-transfer` | PIX funding + pagamento automatico. |
| `POST /api/ramp/etherfuse/sandbox/test-onramp` | Teste completo on-ramp sandbox. |
| `POST /api/ramp/etherfuse/sandbox/test-offramp` | Teste completo off-ramp sandbox. |

### BRL -> USD institutional rail

| Endpoint | Uso |
| --- | --- |
| `POST /api/quotes/brl-usd` | Cria quote BRL -> USD. |
| `POST /api/transfers` | Cria transferencia institucional a partir de quote. |
| `POST /api/transfers/:id/pix-intent` | Cria funding Pix. |
| `POST /api/transfers/:id/funding-confirmation` | Confirma funding sandbox. |
| `POST /api/transfers/:id/settle-stellar` | Anexa/gera settlement USDC Stellar. |
| `POST /api/transfers/:id/payout-instruction` | Cria instrucao USD payout/off-ramp. |
| `GET /api/transfers/:id/reconciliation` | Reconciliacao. |
| `GET /api/transfers/:id` | Estado completo. |
| `POST /api/webhooks/etherfuse/pix` | Webhook Pix/Etherfuse. |

### Evolution/WhatsApp

| Endpoint | Uso |
| --- | --- |
| `GET /api/evolution` | Ping. |
| `POST /api/evolution` | Webhook Evolution. |
| `POST /api/evolution/:event` | Webhook por evento. |
| `GET /api/evolution/webhook` | Ping webhook. |
| `POST /api/evolution/webhook` | Webhook. |
| `POST /api/evolution/webhook/:event` | Webhook por evento. |
| `POST /api/evolution/test-send` | Diagnostico envio direto. |
| `POST /api/evolution/test-notify` | Diagnostico notification service. |

## Agente conversacional

Arquivos principais:

- `backend/src/agent/routes.ts`
- `backend/src/agent/graph.ts`
- `backend/src/agent/tools.ts`
- `backend/src/agent/types.ts`

Capacidades mapeadas no prompt e tools:

- saldo;
- contatos;
- adicionar/listar contato;
- enviar dinheiro para contato;
- gerar link de confirmacao de pagamento;
- converter BRL/USDC;
- criar link de pagamento;
- historico;
- recibo;
- reset PIN;
- logout/login;
- PIX on-ramp;
- PIX off-ramp;
- PIX fund-and-pay para contato real;
- cotacao BRL -> USD institucional;
- instrucao de transferencia USD/international account;
- mainnet status/wallet/balance/preview;
- ajuda contextual;
- troca de idioma PT/EN.

Regras importantes do agente:

- Nao deve expor termos tecnicos como XDR, trustline, ledger, hash, testnet/sandbox no chat normal.
- Deve usar ferramentas para acoes reais, sem inventar sucesso.
- Deve gerar link de confirmacao para pagamentos.
- Quotes expiram rapido e devem ser regeneradas.
- Para PIX fund-and-pay, deve exigir contato real salvo.
- Para mainnet, deve usar ferramentas mainnet especificas.

## Canais externos

### Web chat

Estado:

- Funciona via frontend `/chat`.
- Usa `/api/chat` e backend `/api/agent/query`.
- Mantem sessao via browser/cookie/local storage helper.
- Possui feedback local apos confirmacoes.

Riscos/lacunas:

- UX ainda pode misturar mock contacts com assistente real.
- Precisa manter mensagens de erro publicas e acionaveis.

### Telegram

Estado:

- Adapter separado em `telegram/`.
- Usa Telegraf.
- Encaminha mensagens para agent backend.
- Tem testes em `telegram/test`.
- Usa Telegram Bot API para notificacoes e links.

Variaveis principais:

```text
TELEGRAM_BOT_TOKEN
TELEGRAM_AGENT_URL
TELEGRAM_WEBHOOK_URL
TELEGRAM_NOTIFY_URL
TELEGRAM_NOTIFY_SECRET / INTERNAL_API_SECRET
```

### WhatsApp/Evolution

Estado:

- Evolution API deployavel via `evolution/`.
- Backend recebe webhook em `/webhook/evolution`.
- Backend envia resposta usando `EvolutionService.sendText`.
- Tem diagnosticos `test-send` e `test-notify`.
- Callbacks de pagamento/PIX usam `TransferNotificationService`.
- Corrigido recentemente para buscar mapping WhatsApp por `user_id` mesmo quando confirmacao foi feita em sessao browser.

Variaveis principais:

```text
EVOLUTION_API_URL
EVOLUTION_API_KEY / AUTHENTICATION_API_KEY / EVOLUTION_GLOBAL_API_KEY
EVOLUTION_INSTANCE / EVOLUTION_NOTIFY_INSTANCE / EVOLUTION_DEFAULT_INSTANCE
EVOLUTION_AGENT_URL
EVOLUTION_WEBHOOK_SECRET
EVOLUTION_AGENT_TIMEOUT_MS
```

Lacunas provaveis:

- Necessita deploy correto da Evolution no Railway com instancia conectada.
- Se Evolution falhar envio, backend pode logar warning e usuario nao receber callback.
- Precisa testar novo link gerado depois do deploy; links antigos podem carregar contexto antigo.

## Stellar e assets

Runtime atual:

- Default `STELLAR_NETWORK=TESTNET`.
- Mainnet tem infra preparatoria e guards.
- Etherfuse/Pix atual deve ficar Testnet/sandbox.

Assets relevantes:

- XLM nativo.
- USDC testnet issuer default.
- BRL issuer configuravel.
- TESOURO issuer Etherfuse.

Capacidades Stellar:

- Criacao/funding de conta testnet via Friendbot.
- Trustlines default.
- Pagamentos diretos.
- Path payments strict-send e strict-receive.
- BRL/USDC pathfinding com sanity checks.
- Fee treasury opcional.
- Receipt com hash/evidencia.
- Mainnet readiness/audit.

Lacunas:

- Liquidez BRL/USDC testnet pode faltar ou ser instavel.
- Mainnet runtime nao deve ser ativado sem cutover.
- Treasury fee collection depende de public key configurada.
- Custodia ainda e sensivel: wallet secrets precisam de Vault/segregacao operacional forte.

## Pix / Etherfuse / Anchor

Estado:

- Integracao Etherfuse baseada no regional starter pack.
- KYC/customer/wallet registration programatico em sandbox.
- On-ramp Pix sandbox/devnet.
- Off-ramp Pix sandbox/devnet.
- Fallback local sandbox quando Etherfuse nao entrega proxy/conta pronta.
- Simulacao de fiat recebido.
- Fund-and-pay: usuario pede PIX para pagar contato e backend entrega pagamento apos confirmacao.
- UI mostra antes/depois de taxas, on-ramp/off-ramp e benchmark.

O que e real:

- Chamadas backend reais.
- Estrutura de customer/quote/order/status.
- Possibilidade de transacao Stellar Testnet para liquidar entrega.
- QR/copia-e-cola sandbox quando fallback local gera BR-Code de teste.

O que e sandbox/mock:

- Pix nao deve ser tratado como dinheiro real.
- Fallback local `sandbox-pix-*` e explicitamente demo/testnet.
- Off-ramp pode usar `sandbox-offramp-*`.
- Etherfuse atual e marcado como testnet-only no runtime.

Riscos:

- Se env Etherfuse esta incompleta, UI pode cair em helper/fallback.
- Sandbox provider pode nao retornar todas as fee lines.
- Conta Pix real do usuario nao deve ser assumida sem provider real.
- Precisa garantir que nenhum endpoint sandbox fique aberto sem secret interno em ambiente publico.

## Sistema de taxas

Documento dedicado:

```text
docs/SISTEMA_DE_TAXAS_ATUAL.md
```

Resumo:

- Taxa de rede Stellar: pequena taxa em XLM, nao e receita.
- Taxa TalkToStellar: default 30 bps, BRL <-> USDC, configuravel por env.
- Taxa Etherfuse on-ramp: vem da quote/provider ou fee bps.
- Taxa Etherfuse off-ramp: vem do provider, metadata ou delta bruto-liquido.
- Payout/provider fee: na rail institucional via adapter.
- IOF/tax: so exibir se provider retornar.
- Benchmark 3,5%: comparacao, nao cobranca.

## BRL -> USD institutional settlement rail

Arquivos principais:

- `backend/src/api/services/brl-usd-quote.service.ts`
- `backend/src/api/services/international-transfer.service.ts`
- `backend/src/api/services/international-transfer-state.service.ts`
- `backend/src/api/services/pix-funding.service.ts`
- `backend/src/api/services/stellar-settlement.service.ts`
- `backend/src/api/services/settlement-evidence.service.ts`
- `backend/src/api/services/usd-payout-adapters.ts`
- `backend/src/api/controllers/international-transfers.controller.ts`
- `frontend/app/international-transfer/international-transfer-client.tsx`

Estados:

```text
QUOTE_CREATED
PIX_PENDING
PIX_RECEIVED
BRL_TO_USDC_PENDING
USDC_SETTLEMENT_PENDING
USDC_SETTLED
PAYOUT_INSTRUCTION_CREATED
PAYOUT_PENDING
PAYOUT_COMPLETED
FAILED
REFUNDED
```

Campos do transfer:

- transfer id;
- quote id;
- user/institution id;
- sender identity;
- recipient identity;
- BRL amount;
- quoted USD amount;
- FX rate;
- fees;
- Stellar asset;
- Stellar tx hash;
- Stellar memo/reference;
- payout provider;
- payout destination;
- payout status;
- reconciliation metadata;
- timestamps;
- error logs.

Payout adapters:

- `mock`;
- `etherfuse`;
- `circle` compatibility;
- `bridge` compatibility.

O que e real:

- API e state machine.
- Quote BRL -> USD.
- Persistencia em tabelas internacionais.
- Reconciliation record.
- Payout adapter interface.
- Etherfuse proof mode.

O que e sandbox/mock:

- USD bank payout real nao executa por default.
- Circle/Bridge sao compatibility adapters ate ter URL/API key e `ENABLE_REAL_PAYOUT_EXECUTION=true`.
- Stellar settlement vira mock evidence se secrets/destino nao configurados.
- Mainnet validation tem guard por env e limite.

## Mainnet

Estado:

- Infra mainnet foi criada, mas produto ativo ainda deve ficar Testnet.
- Existe console frontend `/mainnet`.
- Backend tem readiness/audit scripts.
- Migration preparatoria adiciona rede em tabelas e config de rede.
- `STELLAR_MAINNET_ALLOW_RUNTIME_ACTIVATION` bloqueia ativacao acidental.

Capacidades:

- Ler status/readiness.
- Anexar public key mainnet ao usuario.
- Ler balance e operations mainnet.
- Fazer preview de pagamento mainnet.
- Separar Testnet/Pix sandbox de Mainnet.

Nao feito por design:

- Nenhum fluxo normal de pagamento/Pix foi plugado em Mainnet.
- Nao ha live payout ou money transmission.
- Nao ha signer mainnet operacional por default.

## Banco de dados e migrations

Tabelas detectadas nas migrations:

```text
agent_messages
agent_sessions
agent_states
audit_events
contacts
conversion_rules
currency_rate_history
email_confirmations
external_accounts
external_bank_accounts
financial_events
financial_insights
global_profiles
idempotency_keys
international_transfer_quotes
international_transfer_reconciliations
international_transfers
invoices
logout_confirmations
onboarding_finalizations
operations
passkey_challenges
payment_confirmations
payment_logs
pin_reset_tokens
receipt_images
recovery_otps
scheduled_payments
short_links
stellar_mainnet_wallets
stellar_network_configs
telegram_update_dedupes
treasury_profiles
treasury_recommendations
user_passkeys
wallets
whitelisted_assets
```

Migrations importantes:

- `20260513_99_full_setup_from_zero.sql`: setup grande consolidado.
- `20260518_00_prepare_stellar_mainnet_infrastructure.sql`: preparacao mainnet.
- `20260518_01_security_hardening_public_surface.sql`: hardening.
- `20260520_00_international_usd_transfers.sql`: rail internacional.
- `20260521_00_user_mainnet_wallets.sql`: carteiras mainnet de usuario.
- `20260523_01_agent_messages_intro_dedupe.sql`: dedupe de mensagens iniciais.

Observacao:

- Startup migrations legadas estao opt-in via `RUN_LEGACY_STARTUP_MIGRATIONS`.
- O projeto espera migrations aplicadas manualmente em Supabase/DB.
- RLS e policies existem em migrations, mas devem ser verificadas no banco real.

## Seguranca atual

Implementado ou parcialmente implementado:

- JWT secret obrigatorio via `getRequiredJwtSecret`.
- Public error mapper para nao vazar erro cru em muitos pontos.
- Security headers.
- CORS configuravel.
- Rate limit global e sensivel.
- Idempotency middleware.
- Payment confirmation single-use/fingerprint.
- Onboarding finalization idempotency.
- Short links.
- PIN reset tokens.
- PIN hashing migrado/compatibilidade.
- Passkey backend com challenge.
- Passkey UI desativada atualmente por estabilidade.
- RLS migrations.
- Sandbox helper endpoints com secret interno.
- Redaction util.
- Evolution diagnostic endpoints com auth secret.
- Dedupe de mensagens iniciais.
- Dedupe de callbacks/mappings.

Riscos ainda relevantes:

- Verificar banco real: RLS precisa estar realmente aplicado no Supabase ativo.
- Custodia de wallet secret precisa maturidade operacional.
- Passkey backend existe, mas UX desativada; se reativar, precisa fluxo confiavel.
- Email confirmation foi desacoplado/desativado na UX; backend ainda tem service/tabela.
- Evolution/WhatsApp depende de provider externo e logs para delivery.
- Sandbox endpoints precisam ficar protegidos em qualquer deploy publico.
- Fluxos com `session_id/session_token` em payload precisam cuidado em logs.

Docs de seguranca existentes:

- `docs/SECURITY_FULL_CODEBASE_SCAN_20260519.md`
- `docs/SECURITY_FIX_BATCH_20260519.md`
- `docs/SECURITY_HARDENING_IMPLEMENTATION_20260519.md`
- `docs/PASSKEY_ENROLLMENT_SECURITY_FIX.md`
- `docs/SECURITY_AUDIT_CHALLENGE_1.md`

## Testes

Suite backend detectada:

- Agent AI/balance/conversion/payment/PIX.
- Amount utils.
- Anchor/offramp/simulate fiat.
- API integration.
- Asset config.
- BRL reference rate.
- Economy engine.
- Evolution service.
- External controller/finalize/onboarding/service.
- Financial conversion reference.
- Idempotency.
- International transfer service.
- Onboarding.
- Passkey.
- Payment receipt.
- PIN reset.
- Platform fee.
- Public errors.
- Quote expiry/rate sanity.
- Receipt image.
- Secrets.
- Short links.
- Stellar mainnet infra/runtime.
- Stellar SDK.
- Transfer notification.
- Vault/wallet.

Scripts relevantes:

```text
npm run build
npm test
npm run stellar:mainnet:readiness
npm run stellar:mainnet:audit
npm run migrate:required
npm run evolution:configure-webhook
```

Telegram tambem possui `node --test`.

## Documentacao existente relevante

Produto/estrategia:

- `docs/STRATEGIC_POSITIONING_TALKTOSTELLAR.md`
- `docs/PROJECT_BUSINESS_DESCRIPTION.md`
- `docs/PROJECT_TECHNICAL_DESCRIPTION.md`
- `sow/SOW_instawards_submission_brl_usd_rail_20260520.md`

UX:

- `docs/USER_DEMO_GUIDE.md`
- `docs/UX_FULL_CODEBASE_SCAN_20260521.md`
- `docs/UX_FEE_REDUCTION_UPGRADE_MAP.md`
- `docs/INVISIBLE_WALLET_PRODUCT_REDESIGN.md`

Anchor/Etherfuse:

- `docs/ANCHOR_TESTNET_VIDEO_WALKTHROUGH.md`
- `docs/REGIONAL_STARTER_PACK_PIX_RAMP.md`
- `docs/ETHERFUSE_PIX_KYC_FLOW.md`

BRL -> USD rail:

- `docs/BRL_USD_INTERNATIONAL_ACCOUNT_DELIVERY.md`
- `docs/INSTITUTION_SETTLEMENT_INTERFACE_GUIDE.md`
- `docs/BRL_USD_RAIL_OPERATOR_RUNBOOK.md`
- `docs/BRL_USD_STELLAR_WISE_TECHNICAL_DESIGN.md`
- `docs/BRL_USD_STELLAR_WISE_FEES_AND_ANCHOR_FLOW.md`
- `docs/SISTEMA_DE_TAXAS_ATUAL.md`

Mainnet:

- `docs/STELLAR_MAINNET_INFRASTRUCTURE.md`
- `docs/STELLAR_MAINNET_USER_WALLET_CONSOLE.md`
- `docs/STELLAR_MAINNET_HARDENING_SCAN.md`

Deploy:

- `docs/RAILWAY_FULL_STACK_DEPLOYMENT.md`
- `docs/EVOLUTION_RAILWAY_DEPLOYMENT.md`

## Deprecated e artefatos legados

O repo ainda contem `deprecated/` com codigos antigos que nao devem ser confundidos com o produto atual:

```text
deprecated/blindpay
deprecated/sandbox/regional-starter-pack
deprecated/talktostellar-landing-page
deprecated/twilio-webhook
```

Leitura para outra IA:

- `deprecated/sandbox/regional-starter-pack` parece ser origem/referencia da integracao Etherfuse, mas o runtime atual esta em `backend/src/api/services/anchor.service.ts` e `frontend/app/pix-ramp`.
- `deprecated/twilio-webhook` nao representa o canal WhatsApp atual; o canal atual usa Evolution API.
- `deprecated/talktostellar-landing-page` nao representa a landing atual; a landing atual esta em `frontend/components/landing-v2`.
- Existem arquivos `.env` em `deprecated/`; antes de publicar o repo ou entregar para terceiros, revisar/remover qualquer segredo historico.
- Reviewer deve avaliar o produto atual olhando `backend/`, `frontend/`, `telegram/`, `evolution/`, `docs/` e `sow/`, nao o legado.

## Variaveis de ambiente mais importantes por dominio

Core:

```text
PORT
NODE_ENV
PUBLIC_APP_URL
FRONTEND_URL
BACKEND_URL
CORS_ORIGINS
INTERNAL_API_SECRET
JWT_SECRET
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
OPENAI_API_KEY
OPENAI_MODEL
```

Stellar:

```text
STELLAR_NETWORK
STELLAR_HORIZON_URL
STELLAR_FRIENDBOT_URL
STELLAR_SECRET_KEY
STELLAR_PUBLIC_KEY
USDC_ASSET_CODE
USDC_ASSET_ISSUER
BRL_ISSUER_TESTNET
BRL_ISSUER_PUBLIC
TESOURO_ISSUER
STELLAR_ENFORCE_TRUSTED_PATH_ASSETS
```

Mainnet:

```text
STELLAR_MAINNET_ENABLED
STELLAR_MAINNET_ALLOW_RUNTIME_ACTIVATION
STELLAR_MAINNET_HORIZON_URL
STELLAR_MAINNET_USDC_ISSUER
STELLAR_MAINNET_BRL_ISSUER
STELLAR_MAINNET_TESOURO_ISSUER
STELLAR_MAINNET_SIGNER_MODE
STELLAR_MAINNET_EXTERNAL_SIGNER_URL
STELLAR_MAINNET_KMS_KEY_ID
STELLAR_MAINNET_VAULT_SECRET_ID
STELLAR_MAINNET_REQUIRE_MANUAL_APPROVAL
STELLAR_MAINNET_MAX_PAYMENT_USDC
```

Etherfuse/Pix:

```text
ETHERFUSE_API_KEY
ETHERFUSE_SANDBOX_API_KEY
ETHERFUSE_BASE_URL
ETHERFUSE_BLOCKCHAIN
ETHERFUSE_WEBHOOK_SECRET
ETHERFUSE_SANDBOX_PIX_FALLBACK
RAMP_SANDBOX_INTERNAL_SECRET
```

WhatsApp/Evolution:

```text
EVOLUTION_API_URL
EVOLUTION_API_KEY
AUTHENTICATION_API_KEY
EVOLUTION_INSTANCE
EVOLUTION_NOTIFY_INSTANCE
EVOLUTION_AGENT_URL
EVOLUTION_WEBHOOK_SECRET
EVOLUTION_AGENT_TIMEOUT_MS
```

Telegram:

```text
TELEGRAM_BOT_TOKEN
TELEGRAM_AGENT_URL
TELEGRAM_NOTIFY_URL
TELEGRAM_WEBHOOK_URL
TELEGRAM_BOT_MODE
```

Fees/quotes:

```text
TALKTOSTELLAR_SPREAD_BPS
TTS_SPREAD_BPS
TALKTOSTELLAR_FEE_TREASURY_PUBLIC_KEY
TRADITIONAL_FEE_PCT
QUOTE_TTL_SECONDS
BRL_USDC_REFERENCE_SAMPLE_USDC
USD_BRL_SANITY_MIN
USD_BRL_SANITY_MAX
```

Institution rail:

```text
PAYOUT_PROVIDER
ENABLE_REAL_PAYOUT_EXECUTION
INTERNATIONAL_TRANSFER_ENABLE_MOCK_PIX
ENABLE_MAINNET_SETTLEMENT_VALIDATION
MAX_MAINNET_VALIDATION_AMOUNT_USD
USD_OFFRAMP_STELLAR_DESTINATION
```

## Estado real vs sandbox/mock

### Real/testnet-operacional

- Chat web chama backend real.
- Telegram/WhatsApp chamam backend real.
- Backend agent e tools existem.
- Contas/carteiras sao criadas em Supabase/Stellar Testnet.
- Pagamentos Stellar Testnet podem ser submetidos.
- Trustlines e pathfinding existem.
- Receipts e logs sao persistidos.
- Pix/Etherfuse endpoints chamam provider sandbox quando configurado.
- BRL -> USD transfer orchestration persiste dados reais no banco.
- Mainnet console pode ler carteira publica mainnet.

### Sandbox/mock

- Pix real bancario nao deve ser prometido.
- Etherfuse atual e sandbox/devnet/testnet-only.
- Fallback local Pix gera sandbox/mock order.
- USD bank payout e mock/sandbox por default.
- Circle/Bridge sao skeleton/compatibility adapters.
- Mainnet settlement so roda com guard explicito e limite.
- Global transfer lab e interface de assumptions, nao operacao real.

### Futuro/pendente

- Partner regulado para Pix/FX/producao.
- Payout USD real via Bridge/Circle/banco/ACH/wire.
- Compliance/KYC/AML real.
- IOF/tax engine oficial via partner/regulator/counsel.
- Signer Mainnet production-grade.
- Treasury/liquidity provider real.
- Observabilidade production-grade.
- Admin/operator console com RBAC.

## Pontos fortes do projeto

1. Escopo tecnico amplo e coerente: chat, wallet, Stellar, Pix, receipts, rail institucional.
2. Diferencial UX: conversa como interface principal.
3. Boa narrativa estrategica: nao competir com Wise, operar antes dela.
4. Backend com state machines e services bem separados em varios dominios.
5. Documentacao extensa para demos, deploy, security e SOW.
6. Testes cobrindo pontos sensiveis.
7. Mainnet infra criada com guards, sem plugar indevidamente no runtime.
8. Fee transparency melhorou: antes/depois, on/off ramp, benchmark.
9. WhatsApp/Evolution tem deploy guide e callbacks transacionais.
10. Rail BRL -> USD ja possui API e UI tecnica para reviewer.

## Principais fragilidades

1. O produto ainda mistura user UX, demo UX e ops UX em algumas telas.
2. Muitas features dependem de sandbox/mock; isso precisa estar sempre explicito para avaliador.
3. Pix/Etherfuse e testnet-only no estado atual.
4. Payout USD real ainda nao esta integrado.
5. Mainnet existe como infra/console, nao como produto financeiro ativo.
6. Passkey esta desativada na UI por estabilidade.
7. Email confirmation foi desacoplado; se backend retornar esse fluxo, pode confundir.
8. Liquidez BRL/USDC testnet pode gerar cotacoes ruins se nao alimentada.
9. Grande superficie de env/migrations aumenta risco operacional.
10. Backend monolitico com muitos controllers/services pode ficar dificil de manter sem boundaries mais claros.

## Areas que outra IA deveria avaliar com mais cuidado

### Produto

- O posicionamento "conversational FX + Stellar settlement rail" esta claro?
- O foco deve ser usuario final, B2B, ou infraestrutura B2B2C?
- A estrategia wedge para enviar USD para contas existentes e forte o suficiente?
- O app promete demais na landing?

### Engenharia

- A separacao de services esta suficiente?
- Quais modulos deveriam virar pacotes/domains separados?
- Onde o backend precisa de queue/job worker em vez de fluxo request/response?
- O state machine de transfer deveria ser event-sourced?
- O webhook/retry/reconciliation esta robusto?

### Seguranca

- RLS atual cobre todas as tabelas sensiveis no banco real?
- O modelo de custodia e PIN e aceitavel para demo? E para producao?
- Links JWT/short links estao todos single-use/expiraveis onde precisa?
- O que ainda pode vazar em logs?
- Sandbox helper endpoints estao seguros em deploy publico?

### Compliance

- O produto evita overclaim de remessa/cambio?
- Como separar demo/testnet de operacao real em termos legais?
- Quais parceiros regulados seriam obrigatorios antes de producao?
- Como tratar IOF, AML, KYC, sanctions e Travel Rule?

### UX

- O usuario entende o que fazer no primeiro acesso?
- O chat esta mais claro que a UI web?
- As telas de Pix explicam fee, status e proximo passo?
- Historico/receipt fecham a confianca?
- Ops UI deveria ser separada em `/ops` ou protegida por flag?

## Top 20 proximas melhorias sugeridas para avaliar

1. Criar `Ops/Admin` namespace separado para telas tecnicas (`/ops/international-transfer`, `/ops/global-transfer`).
2. Criar demo mode controlado por flag, com presets e reset seguro.
3. Melhorar observabilidade de WhatsApp callbacks: delivery log persistido, retry e status visivel.
4. Criar worker/queue para fluxos longos: Pix polling, settlement, payout, receipts.
5. Finalizar uma camada unica de public error + CTA em todas as telas.
6. Fazer smoke tests Playwright para onboarding, chat, PIX, payment, conversion e receipt.
7. Criar dashboard de reconciliacao por operacao com timeline unica.
8. Remover/ocultar mock contacts em UX publica ou conectar somente contatos reais.
9. Criar RBAC simples para rotas de operador/demo tecnica.
10. Fazer auditoria de RLS no Supabase real e anexar resultado.
11. Harden de secret handling e logs para session_token/PIN/provider tokens.
12. Criar adapter real de payout sandbox com Bridge ou Circle se acesso estiver disponivel.
13. Criar provider tax/IOF placeholder oficial, sem inventar valor.
14. Padronizar i18n PT/EN em todas as telas criticas.
15. Melhorar receipt textual e compartilhavel por WhatsApp/Telegram.
16. Criar "contact picker" real nas telas de pagamento/PIX fund-and-pay.
17. Separar mainnet console como read-only ate cutover aprovado.
18. Criar readiness report automatico para Railway env.
19. Criar documento "What is real vs sandbox" curto dentro da UI.
20. Reduzir acoplamento do agent com tools gigantes em `tools.ts` e `graph.ts`.

## Perguntas criticas para reviewer

1. O produto deve priorizar B2C ou B2B?
2. Qual feature unica mais convence avaliadores Stellar: Pix anchor, conversational wallet ou institutional BRL -> USD rail?
3. O fluxo Pix -> Stellar -> USD account esta claro sem prometer payout real?
4. O que precisa estar real para uma demo forte: Pix sandbox, Stellar hash, orquestracao, ou WhatsApp UX?
5. O sistema de taxas esta simples demais, complexo demais, ou correto?
6. Que parte da arquitetura deveria ser reescrita antes de escalar?
7. Qual vulnerabilidade residual mais critica?
8. Qual risco regulatorio de linguagem/marketing precisa ser removido?
9. O uso de WhatsApp/Telegram e diferencial real ou canal de demo?
10. Qual milestone de 30 dias teria melhor ROI?

## Recomendacao de posicionamento atual

Para avaliadores e outra IA, descreva assim:

```text
TalkToStellar e um produto sandbox/testnet que demonstra uma conta global conversacional em cima de Stellar. Ele permite que o usuario interaja por WhatsApp, Telegram ou web para consultar saldo, salvar contatos, colocar dinheiro via Pix sandbox, converter entre BRL e USDC, enviar para contatos e receber comprovantes. Em paralelo, o projeto implementa uma camada institucional BRL -> USD que cria quotes, tracking de funding Pix, evidencia Stellar/USDC e instrucoes de payout por adapters. O estado atual e demo/integration-ready, nao producao regulada.
```

## Resumo final para colar em uma IA

```text
TalkToStellar hoje e um monorepo com backend TypeScript/Express, frontend Next.js, Telegram bot e Evolution WhatsApp. O produto combina chat financeiro, wallet Stellar testnet, contatos, pagamentos, conversoes BRL/USDC, PIX sandbox via Etherfuse, receipts, short links, PIN/reset, passkey backend, historico, global profile, fee transparency, mainnet readiness e uma rail institucional BRL -> USD com state machine, quote, Pix funding, Stellar settlement evidence e payout adapters mock/Etherfuse/Circle/Bridge.

O runtime financeiro ativo deve ser entendido como Testnet/sandbox. Etherfuse Pix e testnet-only. USD payout real nao executa por default. Mainnet esta preparada como infraestrutura/readiness e console read-only/preview, nao como produto ativo. O maior valor atual e provar a arquitetura e UX: conversa -> quote -> Pix -> Stellar evidence -> payout instruction -> reconciliation.

Preciso que voce avalie arquitetura, produto, UX, seguranca, compliance e proximas prioridades, separando claramente o que e real, sandbox/mock e futuro.
```
