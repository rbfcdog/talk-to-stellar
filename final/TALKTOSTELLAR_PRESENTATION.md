# TalkToStellar

### Sua conta global no WhatsApp. Fale, mova dinheiro, invista.

---

## O Problema

Brasileiros querem uma conta global simples — guardar reais e dólares, converter, investir, pagar contatos. Mas o que existe é fragmentado:

- Bancos cobram spreads escondidos de 2% a 5%
- Cada função exige um app diferente: banco, corretora, conta internacional
- Não há evidência verificável de taxas e câmbio aplicado
- Abrir conta lá fora é burocrático e excludente

---

## A Solução

**TalkToStellar é a conta global que você opera pelo chat.**

Você fala com o assistente por **WhatsApp, Telegram ou chat web** e ele resolve:

- **Saldo em reais e dólares** — veja quanto tem em cada moeda
- **PIX para entrar e sair** — coloque reais via PIX, saque para sua chave quando quiser
- **Conversão BRL ↔ USD** — cotação transparente, taxa de 0.30%, economia vs. bancos
- **Pagamentos** — envie para qualquer contato salvo, email, CPF, telefone ou chave
- **Rendimentos** — seu saldo aplicado rende, com posição visível e resgate a qualquer momento
- **Comprovante com evidência** — toda operação gera comprovante com hash Stellar verificável

> **"Fale com seu dinheiro. Sua conta global no chat."**

---

## Canais

| Canal | Status |
|---|---|
| **WhatsApp** | Produção (Evolution API + Baileys) |
| **Telegram** | Produção (Bot Telegraf) |
| **Web Chat** | Produção (Next.js) |

O usuário escolhe o canal. A experiência é consistente.

---

## O Que Dá Pra Fazer

### 💰 Saldo e Conta
- Ver saldo em R$, USDC, CETES, XLM
- Criar conta com PIN ou passkey (WebAuthn)
- Entrar por link seguro enviado no chat

### 📲 PIX — Entrada e Saída
- **PIX on-ramp**: colocar reais na conta via PIX com QR code
- **PIX off-ramp**: sacar para sua chave PIX com taxa estimada antes do PIN
- **PIX fund-and-pay**: receber PIX e pagar um contato automaticamente

### 💱 Conversão
- BRL → USDC / USDC → BRL com cotação em tempo real
- Comparativo de economia vs. métodos tradicionais (3.5% benchmark)

### 💸 Pagamentos
- Enviar para contato salvo, email, CPF, telefone ou chave Stellar
- Criar link de pagamento (Pay Anyone)
- Receber pagamento com link de cobrança
- Confirmação por PIN ou passkey

### 📈 Rendimentos
- Aplicar em posições DeFindex (USDC, XLM, BRL)
- Ver posição atual e rentabilidade
- Resgatar a qualquer momento

### 📊 Histórico e Comprovantes
- Histórico completo de operações
- Comprovante com hash Stellar, taxas e economia
- Download de comprovante em imagem

### 🔐 Segurança
- PIN de 6 dígitos para confirmar operações
- Passkeys (WebAuthn) para dispositivos compatíveis
- Sessão com token criptografado
- Logout com link de confirmação

---

## Como Funciona (Fluxo Técnico)

```
Usuário envia mensagem (WhatsApp/Telegram/Web)
        │
        ▼
┌───────────────────────┐
│  Agente LangGraph     │  Classifica intenção (saldo, PIX, pagamento, conversão...)
│  (GPT-4o + tools)     │  Executa ferramentas específicas
└───────┬───────────────┘
        │
        ▼
┌───────────────────────┐
│  Serviços Backend     │  Stellar, Etherfuse, DeFindex, Supabase
│  (30+ módulos)        │  Queries, transações, liquidação, comprovantes
└───────┬───────────────┘
        │
        ▼
┌───────────────────────┐
│  Resposta ao usuário  │  Texto + link de confirmação + comprovante
└───────────────────────┘
```

---

## Arquitetura

```
  WhatsApp       Telegram       Web Chat
  (Evolution)    (Telegraf)     (Next.js)
       │              │              │
       └──────────────┼──────────────┘
                      │
              ┌───────▼────────┐
              │  Backend API   │  Express + TypeScript
              │                │
              │  LangGraph     │  Agente conversacional
              │  GPT-4o        │  Roteamento de intenção
              │                │
              │  Tool System   │  20+ ferramentas
              │  Services      │  Stellar, PIX, Quote, Fee
              └───┬───┬───┬───┘
                  │   │   │
    ┌─────────────┘   │   └──────────────┐
    ▼                 │                  ▼
┌────────┐    ┌───────▼──────┐    ┌──────────────┐
│Stellar │    │   Supabase   │    │  Etherfuse   │
│Testnet │    │ (PostgreSQL) │    │ (PIX sandbox)│
└────────┘    └──────────────┘    └──────────────┘
```

---

## Stack Tecnológica

| Camada | Tecnologia |
|---|---|
| **Backend** | Node.js, TypeScript 5, Express 4 |
| **AI Agent** | LangChain, LangGraph, OpenAI GPT-4o |
| **Blockchain** | Stellar SDK v14 |
| **Frontend** | Next.js 16, React 18, Tailwind 4, Radix UI |
| **Database** | Supabase (PostgreSQL + Vault) |
| **WhatsApp** | Evolution API v2 + Baileys |
| **Telegram** | Telegraf 4 |
| **PIX** | Etherfuse sandbox |
| **Yield** | DeFindex SDK |
| **Auth** | WebAuthn (passkeys), PIN (bcrypt), JWT |
| **Deploy** | Railway + Vercel |
| **Container** | Docker + Docker Compose |
| **Testes** | Jest, Vitest, Playwright |

---

## Diferenciais

### 1. Conta global no chat
O usuário não precisa de outro app. WhatsApp, Telegram ou web — fala com o assistente como se falasse com um gerente. Saldo, conversão, pagamento, extrato: tudo por mensagem.

### 2. O produto é a conta
TalkToStellar não é um intermediário que manda dinheiro pra fora. É a conta onde o dinheiro mora. Reais entram por PIX, dólares são convertidos e mantidos, investimentos rendem, pagamentos saem. Tudo dentro do mesmo ambiente.

### 3. Taxa transparente — sem surpresa
Spread fixo de 0.30% + taxas de provedor visíveis antes de confirmar. Comparativo automático com custo tradicional (~3.5%). O usuário vê exatamente o que paga.

### 4. Comprovante com evidência Stellar
Toda operação gera comprovante com hash na blockchain. Imutável. Auditável. Não depende de fé no extrato do banco.

### 5. Mesma experiência em qualquer canal
WhatsApp, Telegram, web chat — mesmo backend, mesma conta, mesmo histórico. Troca de canal sem perder nada.

---

## Modelo de Negócio

| Fonte de Receita | Descrição |
|---|---|
| **Spread por conversão** | 0.30% (30 bps) sobre cada conversão BRL ↔ USD |
| **Taxa de PIX on-ramp** | Taxa de provedor ao entrar com reais |
| **Taxa de PIX off-ramp** | Taxa ao sacar para conta bancária via PIX |
| **Rendimentos** | Spread sobre produtos de investimento |
| **Produtos financeiros** | Futuro: cartão, crédito, seguros |

---

## Públicos-Alvo

| Persona | Dor | Valor |
|---|---|---|
| **Pessoa física** | Quer uma conta com dólar sem abrir conta lá fora | Conta global no WhatsApp, PIX, conversão, extrato |
| **Freelancer/Criador** | Recebe em dólar e gasta em real | Conta multimoeda, conversão quando precisar, contatos salvos |
| **Pequena empresa** | Precisa guardar e movimentar em dólar | Histórico, evidência Stellar, reconciliação |
| **Investidor** | Quer exposição ao dólar com rendimento | Saldo em dólar aplicado, resgate rápido, taxas visíveis |

---

## Tração e Estado Atual

- ✅ **Landing page** em produção (`talktostellar.com`)
- ✅ **WhatsApp bot** com Evolution API, webhook, resposta conversacional
- ✅ **Telegram bot** com Telegraf, sessão persistente
- ✅ **Web chat** com Next.js, agente LangGraph
- ✅ **Stellar Testnet** com operações reais (PIX simulado)
- ✅ **Comprovantes** com imagem SVG/PNG, hash Stellar
- ✅ **PIX on/off-ramp** via sandbox Etherfuse
- ✅ **Rendimentos** via DeFindex vaults
- ✅ **Passkeys** (WebAuthn) e PIN
- ✅ **Dashboard Mainnet** (leitura)
- ✅ **200+ testes** automatizados
- 🔄 **Mainnet** — leitura habilitada, escrita bloqueada até validação regulatória
- 🔄 **PIX real** — depende de parceiro regulado (Etherfuse production)

---

## Próximos Passos

| Prioridade | Iniciativa |
|---|---|
| **Agora** | Validação com usuários reais, coleta de feedback |
| **Curto prazo** | Parceria com provedor de PIX regulado |
| **Curto prazo** | Ativação controlada em Stellar Mainnet |
| **Médio prazo** | Cartão de débito internacional atrelado à conta |
| **Médio prazo** | Múltiplas moedas além de BRL e USD |
| **Longo prazo** | Crédito, seguros e produtos proprietários |

---

## Contato

**TalkToStellar** · `talktostellar.com` · `github.com/rbfcdog/talk-to-stellar`

---

*"A rota mais simples e barata para converter reais em dólares, com taxa clara e evidência Stellar."*
