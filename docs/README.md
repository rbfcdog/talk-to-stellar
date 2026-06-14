# TalkToStellar

TalkToStellar is a conversational financial product to convert reais into digital dollars and move value using Pix, Stellar and a simple chat experience.

The user does not need to understand crypto wallet, issuer, trustline, XDR, pathfinding, anchor or blockchain. He chats via WhatsApp, Telegram or web chat, checks balance, simulates costs, adds money via Pix, sends to contacts, converts balance, tracks history and receives receipts.

Em uma frase:

```text
TalkToStellar transforma Pix em uma rota conversacional de conversão BRL -> USD, usando Stellar como trilho de liquidação, transparência de taxas e evidência verificável.
```

## Produto Ao Vivo

| Superfície | Link |
| --- | --- |
| Landing page | https://talk-to-stellar-owxg.vercel.app |
| Chat web | https://talk-to-stellar-owxg.vercel.app/chat |
| Fluxo Pix | https://talk-to-stellar-owxg.vercel.app/pix-on |
| Histórico | https://talk-to-stellar-owxg.vercel.app/transactions |
| Console Stellar Mainnet | https://talk-to-stellar-owxg.vercel.app/mainnet |

The product already demonstrates real user experience, payments and conversions in a secure Testnet/sandbox environment, conversational integration and a read-only Mainnet layer to view Stellar's public wallets without asking for a secret key.

Unrestricted real movement on Mainnet remains blocked by design until there are secure signers, limits, operational approval, compliance, and regulated partners.

## Resumo Executivo

Brazil has one of the best domestic payment infrastructures in the world with Pix. Even so, converting BRL into USD and delivering this value to international accounts is still expensive, fragmented and not transparent.

The user often already has a preferred destination for dollars: Wise, global account, international bank, brokerage, investment account, business account or other provider. TalkToStellar does not need to replace these destinations.

A tese é mais direta:

```text
Ser a rota mais barata, simples e transparente antes do dinheiro chegar ao destino escolhido pelo usuário.
```

TalkToStellar combina:

- Pix as a family entry in BRL;
- Stellar as a settlement and evidence layer;
- USDC/digital dollar as USD value infrastructure;
- WhatsApp, Telegram and web chat as interface;
- visible rates and savings as a conversion trigger.

O usuário pede:

```text
"quanto custa enviar 5000 reais?"
"quero mandar 100 dólares para Ana"
"saldo"
"quanto eu economizei esse ano?"
```

The system responds with a quote, rate, savings compared to traditional methods, confirmation link and proof with Stellar evidence when applicable.

## Problema

Moving money from Brazil to dollar value still requires too many steps.

The problem is not just the final bill. The problem is the path until the money gets there:

- banks hide costs in exchange rate spreads;
- users compare quotes manually;
- Pix, exchange, stablecoins, global account, receipt and support are separated;
- crypto products require technical knowledge;
- the user rarely knows the actual rate paid;
- Small businesses don't have a simple programmable layer for BRL -> USD.

At its core, user intent is simple:

```text
"Tenho reais e quero dólares utilizáveis em outro lugar."
```

## Solução

TalkToStellar is a conversational BRL -> USD conversion and movement layer.

The user does not operate a wallet manually. The product translates natural language into guided financial flow:

```text
Usuário envia uma mensagem
-> TalkToStellar entende a intenção
-> backend calcula cotação e taxas
-> usuário financia ou confirma com Pix/PIN
-> valor é liquidado ou evidenciado via Stellar
-> comprovante volta no mesmo canal de conversa
```

The focus of the product is to make the financial value obvious:

- how much the user sends;
- quanto chega;
- what fee was paid;
- quanto um método tradicional cobraria;
- how much the user saved;
- onde a transação pode ser verificada.

This positions TalkToStellar as a payment, conversion and trust product.

## Experiência Do Produto

### Entrada Por Conversa

The user starts via WhatsApp, Telegram or web chat.

- Signed links for onboarding and confirmation.
- Expiration and payload validation of tokens.
- PIN-protected payment confirmation.
- PIN reset with temporary token and invalidation of use.
- Logs de auditoria para eventos críticos.
- `POST /api/agent/query` requires `x-agent-ingest-secret` when `source` is `telegram` or `whatsapp`. Prefer `AGENT_INGEST_SECRET` with the same value in backend and adapters. For compatibility, the backend and Telegram also accept `INTERNAL_API_SECRET` or `TELEGRAM_NOTIFY_SECRET` as a resolved fallback; without a shared secret, the backend refuses the request.

```text
saldo
contatos
quanto custa enviar 5000 reais?
quero mandar 100 dólares para Ana
quero colocar 100 reais via Pix
quero retirar 50 reais para meu Pix
quanto eu economizei esse ano?
```

The language is financial and family friendly, not crypto. The product talks about balance, Pix, dollars, contacts, fees, history, receipt and savings.

### Pix as a gateway

Pix is ​​the natural entry point for Brazilian users.

The product prepares the Pix flow, shows the rate, guides confirmation, updates the status of the operation and delivers the receipt. In sandbox/Testnet, this demonstrates the operating model safely. In production, this layer must be connected to regulated Pix/FX partners.

### Payment for Saved Contacts

The product requires clarity from the recipient.

If the user asks to pay Ana, Ana needs to be a real saved contact on their account. This reduces operational error and creates a closer banking experience:

- validates saved contact;
- valida destino;
- valida valor;
- mostra taxa;
- pede confirmação;
- records proof.

### Fees and Savings as Part of the Product

TalkToStellar should not hide the fee in the final number.

The experience is built around a simple message:

```text
Você pagou esta taxa.
Um banco tradicional cobraria isso.
Você economizou isso.
```

Esse conceito aparece em:

- simulações de custo;
- telas Pix;
- conversion previews;
- comprovantes;
- resumos de economia;
- balance context.

The goal is to make savings appear every time the user interacts with money.

### Proof with Evidence

After payment or conversion, the user receives a receipt on the same channel.

Proof may include:

- horário da operação;
- destinatário;
- valor enviado;
- valor entregue;
- taxa paga;
- economia estimada;
- Stellar hash when available;
- link de histórico;
- proof link.

To the user, it looks like a simple financial receipt. For the technical evaluator, there is verifiable evidence behind it.

## Por Que Stellar

Stellar makes sense because the problem here is not speculation. It's settlement, interoperability, low cost and traceability.

TalkToStellar uses Stellar as infrastructure:

- liquidação rápida;
- custo de rede baixo;
- suporte a stablecoins;
- evidência pública de transação;
- Testnet para desenvolvimento seguro;
- preparation for Mainnet with public wallet reading and controlled future execution.

The product does not sell "crypto" to the user. He sells savings, clarity and convenience. Stellar sits behind the scenes as the rail that enables this experience.

## Mercado

Públicos iniciais:

- brasileiros que dolarizam patrimônio;
- travelers fueling global accounts;
- freelancers who pay for or receive international services;
- startups and small companies in need of USD;
- fintechs that need a Pix -> programmable USD layer;
- users who already have Wise, Revolut, Mercury, brokerage or international bank.

The strategy is not to compete head-on with global accounts.

The strategy is to become the conversion route that the user trusts before sending to these accounts.

## Modelo De Negócio

Possíveis receitas:

- transparent rate per conversion;
- Pix on-ramp/off-ramp fee;
- fee por transferência B2B;
- API/SaaS para empresas;
- reconciliação e relatórios premium;
- revenue from regulated off-ramp/payout partners;
- own financial products once there is trust and volume.

The product must benefit from the savings delivered to the user, not from margins hidden in confusing exchange rates.

## Estratégia De Entrada

A primeira promessa é simples:

```text
Converta mais barato e envie para o destino que você já usa.
```

Isso cria confiança e volume transacional.

Once the user recognizes TalkToStellar as the cheapest and most practical route to move from BRL to USD, the product can expand to:

- destinos internacionais salvos;
- fluxos B2B;
- liquidação entre instituições;
- tesouraria e reconciliação;
- native financial products within the TalkToStellar ecosystem.

The entry is savings. The long-term opportunity is control of the financial flow.

## Produto Construído Até Agora

O projeto já inclui:

- landing page ao vivo;
- chat web;
- integration with WhatsApp via Evolution API;
- integração com Telegram;
- onboarding por link;
- confirmação por PIN;
- saved contacts;
- links de confirmação de pagamento;
- Pix flow on-ramp/off-ramp;
- Fee- and economy-oriented UX;
- histórico de transações;
- generation of receipts;
- infraestrutura Stellar Testnet;
- console Stellar Mainnet read-only;
- protótipo de roteamento institucional BRL -> USD;
- arquitetura de payout adapters;
- reconciliation models and evidence of settlement;
- demo documentation, deployment, fees, security and Mainnet readiness.

This is not just a landing page. The repository contains full-stack product, conversational integration and evolving settlement infrastructure.

## Arquitetura Em Alto Nível

```text
WhatsApp / Telegram / Web
        |
        v
Agente conversacional
        |
        v
Ferramentas de cotação, taxa, contato, Pix e pagamento
        |
        v
Backend de orquestração e estado transacional
        |
        v
Stellar settlement / evidência / recibos
        |
        v
Histórico, reconciliação e notificações
```

Componentes principais:

- `frontend/`: interface Next.js;
- `backend/`: TypeScript API, agent, Stellar services, Pix adapters and fee services;
- `telegram/`: adaptador Telegram;
- `evolution/`: suporte a WhatsApp/Evolution;
- `docs/`: demo, deployment, security, UX, fees and Mainnet guides.

## Posição Atual De Mainnet

The product has a live Mainnet surface:

```text
https://talk-to-stellar-owxg.vercel.app/mainnet
```

Estado atual:

- the user can attach a Stellar Mainnet public key;
- the app consults balances and public operations;
- secret keys nunca são solicitadas;
- Mainnet payments are disabled until there is signer, limits, manual approval, compliance and operation with partners.

This is the correct stage to demonstrate Mainnet readiness without taking premature risk of moving real value.

## Realidade Regulatória E Operacional

TalkToStellar should not be presented as a bank, licensed payment institution, or scale-ready international remittance operation without suitable partners.

O caminho de produção exige:

- parceiro Pix/FX regulado;
- KYC/KYB;
- screening de sanções;
- monitoramento transacional;
- revisão de IOF e tratamento tributário;
- provedor de payout/off-ramp;
- limites e revisão manual;
- signer seguro e controles de tesouraria;
- revisão jurídica e compliance.

O framing correto hoje é:

```text
Produto vivo e infraestrutura em validação para conversão conversacional BRL -> USD usando Stellar.
```

## Roadmap

### Fase 1 - Validação De Produto

- melhorar UX WhatsApp-first;
- fortalecer fluxos Pix;
- make savings visible in every interaction;
- validate real users by reading Mainnet public wallets;
- collect feedback on conversion intent and trust in the receipt.

### Fase 2 - Piloto Com Parceiros

- integrate Pix/FX/regulated off-ramp partner;
- enable low-value controlled flows;
- adicionar checks de compliance;
- expand reconciliation and operational dashboard;
- support business users and saved international destinations.

### Fase 3 - Infraestrutura De Liquidação

- roteamento entre instituições;
- payout provider adapters;
- instruções de entrega USD;
- controles de tesouraria;
- API para empresas.

### Fase 4 - Ecossistema Financeiro Próprio

- retain more value within TalkToStellar;
- launch own account controls;
- ampliar produtos B2B;
- Explore native financial products on Stellar.

## Tese Para Investidor

TalkToStellar combines three strong behaviors:

1. Brazilians already use Pix every day.
2. Users and companies increasingly want more exposure and use of dollars.
3. Conversational interfaces reduce friction in financial actions.

The product thesis is practical: reduce conversion friction and clearly show savings.

The infrastructure thesis goes deeper: using Stellar as a settlement rail and evidence behind a familiar chat experience.

If TalkToStellar gains trust as the simplest and cheapest way to move from BRL to USD, it could evolve from "conversion route" to "financial operational layer" for people and businesses.

## How to Run Locally

Subida local:

```bash
chmod +x start-local.sh
./start-local.sh
```

URLs locais:

```text
Frontend: http://localhost:3000
Backend:  http://localhost:3001
```

Build backend:

```bash
cd backend
npm run build
```

Build frontend:

```bash
cd frontend
npm run build
```

Evals do agente:

```bash
cd backend
npm run eval:agent
```

## Apêndice De Negócio E Tecnologia

This section summarizes the project from a more operational point of view: what business the product wants to be, what flows already exist, how the system is assembled and what decisions need to be clear before production.

### Proposta Comercial

TalkToStellar is a conversion, payment and evidence layer for users who start in BRL and need to get to USD, Pix, contacts or an external public key without operating crypto infrastructure directly.

The product captures value in three moments:

- before the operation, showing quotation, rate, destination and estimated savings;
- during operation, reducing friction with chat, short links, PIN and review screens;
- after the operation, providing history, proof and traceability.

The difference is not just “using Stellar”. The difference is to hide the right complexity and reveal the financial information that matters: how much goes out, how much comes in, what fee was paid and where the operation can be audited.

### Personas Prioritárias

| Persona | Dor principal | Valor entregue |
| --- | --- | --- |
| Usuário pessoa física | Converter BRL para USD sem comparar várias plataformas | Cotação clara, Pix, saldo, histórico e comprovante |
| Freelancer ou creator | Receber/pagar em dólar com menos fricção | Fluxo conversacional, contatos e confirmação segura |
| Pequena empresa | Reconciliar pagamentos e conversões recorrentes | Histórico, evidência e relatório operacional |
| Produto fintech/API | Adicionar rota Pix -> USD sem construir tudo do zero | Backend modular, adapters e endpoints reaproveitáveis |

### Fluxos Centrais Do Produto

1. **Conta e sessão**
   The user enters via chat, link or web. The backend creates or retrieves session, wallet and conversation state. The session is protected by token, HttpOnly cookies on the frontend and validations on the backend.

2. **Saldo e histórico**
   The experience shows balances in simple language and consults consolidated history from operations, payment logs and receipts.

3. **Pix on-ramp**
   The user places reais per Pix. The system creates intent, tracks status, updates balance, and keeps the experience separate from the provider's technical details.

4. **Conversão**
   The user chooses origin, destination and value. The conversion screen asks the backend for the actual route, shows an estimate and only then releases confirmation.

5. **Payment for contact**
   The user chooses a saved contact, reviews the value and destination, confirms with a PIN and receives proof. This prevents sending to ambiguous recipients.

6. **Envio externo**
   The user sends an external public key on a dedicated screen. The interface validates key, balance, destination and PIN before submitting.

7. **Pix off-ramp**
   The user enters a Pix key and reviews how much comes out of the balance and how much arrives in reais. If there is a lack of balance, the screen must offer conversion or supplement via Pix.

### Arquitetura Técnica

The system is divided into experience surfaces, financial orchestration, and integration infrastructure.

| Camada | Responsabilidade | Diretórios principais |
| --- | --- | --- |
| Frontend | Telas web, confirmação, Pix, conversão, histórico, conta e UX de chat | `frontend/app`, `frontend/components`, `frontend/lib` |
| Agente | Interpretação de intenção, escolha de tools e resposta conversacional | `backend/src/api/agent` |
| Backend API | Sessão, carteira, pagamentos, conversão, Pix, recibos e auditoria | `backend/src/api` |
| Stellar | XDR, assinatura, submit, path payment, saldos e evidência | `backend/src/api/services/stellar.service.ts` |
| Provedores | Pix, WhatsApp, Telegram, e-mail, payout e integrações externas | `backend/src/integrations`, `telegram`, `evolution` |
| Dados | Estado de sessão, carteiras, operações, contatos, links e comprovantes | Supabase/Postgres via repositories |

Fluxo simplificado de uma operação:

```text
Mensagem ou tela web
-> normalização de intenção e parâmetros
-> criação de preview/cotação
-> revisão em página dedicada
-> PIN/passkey quando aplicável
-> execução backend
-> submit Stellar/provedor externo
-> log transacional
-> comprovante e resposta ao usuário
```

### Modelo De Dados Operacional

As principais entidades do produto são:

- `agent_sessions`: session state, user, channel and token;
- `wallets`: Stellar wallet linked to the session/user;
- `contacts`: saved recipients and delivery keys;
- `operations`: internal financial operations and status;
- `payment_logs`: payments, conversions, hashes and execution metadata;
- `payment_confirmations`: single-use confirmation links;
- `short_links`: short public links with expiration;
- `activity_feed`: interface-friendly history;
- `user_passkeys` and `passkey_challenges`: WebAuthn credentials and challenges when enabled.

In practice, `operations` is the operational control layer and `payment_logs` is the payments/conversions evidence layer. Screens should prefer consolidated data and never expose the bank's gross errors.

### Security and Controls

Controls already addressed or foreseen in the design:

- signed and expiring links for onboarding, login and confirmation;
- Mandatory PIN for sensitive confirmation;
- passkey/WebAuthn as strong authentication path;
- cookies HttpOnly para sessão web;
- `x-agent-ingest-secret` to protect ingestion from WhatsApp/Telegram;
- idempotency key em operações mutáveis;
- logs de auditoria para eventos críticos;
- public messages sanitized so as not to expose schema, constraints or stack traces;
- Mainnet in read-only mode until there is a signer and an approved operation.

### Integrações Externas

| Integração | Uso atual | Observação |
| --- | --- | --- |
| Stellar SDK/Horizon | Conta, saldo, XDR, submit e histórico público | Testnet para execução; Mainnet read-only |
| Supabase | Banco operacional, sessão, carteiras e logs | Precisa migrations aplicadas fora do startup |
| Evolution API | WhatsApp | Requer instância e secrets alinhados |
| Telegram/Telegraf | Bot Telegram | Token inválido gera `401 Unauthorized` no startup |
| Etherfuse sandbox | Pix/on-ramp/off-ramp e assets sandbox | Produção exige parceiro e enquadramento regulatório |
| SendGrid/e-mail | Confirmações e recuperação | Opcional conforme fluxo habilitado |

### Critérios De Produção

Before treating the product as a financial operation in production, these points need to be closed:

- regulated Pix/FX/off-ramp partner and operational contract;
- KYC/KYB and screening appropriate to the user's country;
- limits per user, operation, day and destination;
- routine monitoring, alerting and manual review;
- reconciliation between bank, provider, Stellar and database;
- política de chargeback/refund/erro operacional;
- secure signer, key segregation and recovery plan;
- terms, privacy policy and risk disclosure;
- observability with correlation between `request_id`, session, operation and hash.

### Métricas Que Importam

Métricas de negócio:

- volume convertido;
- number of active users per channel;
- Pix completion rate, conversion and payment;
- estimated savings delivered to the user;
- receita por operação;
- recurrence per user.

Métricas técnicas:

- erro por fluxo e por provedor;
- tempo de cotação;
- tempo até confirmação;
- tempo até submit/settlement;
- falhas de idempotência;
- balance divergence;
- rate of expired or twice-used links.

### What This Repo Should Not Promise Yet

This repository should not be presented as:

- banco;
- ready regulated global account;
- remessa internacional irrestrita;
- custodiante Mainnet sem controles adicionais;
- compliance substitute, KYC, Pix/FX partner or legal opinion.

The correct positioning is: live full-stack product, with real UX and conversion/payment infrastructure under validation, ready to evolve into a regulated pilot with partners.

## Resumo

TalkToStellar is building a BRL -> USD conversational route to Brazil.

The product does not ask the user to become an expert in crypto. It uses familiar channels, Pix, contacts, transparent fees and vouchers, while Stellar provides settlement, low cost and verifiable evidence behind the scenes.

The short-term opportunity is cheaper conversion. The long-term opportunity is to become the financial flow layer for people and companies that move between reais and dollars.
