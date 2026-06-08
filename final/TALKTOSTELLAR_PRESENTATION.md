# TalkToStellar

### Converta reais em dólares pelo chat. Taxa clara. Evidência Stellar.

---

## O Problema

Converter reais para dólares no Brasil é caro, fragmentado e opaco.

- Spreads escondidos de 2% a 5% em bancos tradicionais
- Múltiplas plataformas: banco → corretora → conta internacional
- Nenhuma evidência verificável de taxas e câmbio aplicado
- Experiência complexa, cheia de fricção

---

## A Solução

**TalkToStellar** transforma PIX em uma rota conversacional de conversão BRL → USD.

O usuário fala com o assistente por **WhatsApp, Telegram ou chat web**, descreve o que quer fazer, e o sistema estrutura a operação com:

- **Cotação transparente** antes de confirmar
- **Taxas discriminadas** (on-ramp, spread TalkToStellar 0.30%, off-ramp)
- **Liquidação em Stellar** com hash de transação verificável
- **Comprovante com evidência** — valor enviado, taxa aplicada, valor entregue, economia vs. métodos tradicionais

> **"PIX é a interface. Stellar é o trilho de liquidação."**

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
- Logout com link de confirmação por email

### 🌐 Internacional (em desenvolvimento)
- Transferência BRL → USD para conta internacional
- Wise, Mercury, Revolut como destinos (metadados)
- Cotação, taxa, status e reconciliação

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

### 1. PIX como interface
Ninguém precisa aprender blockchain. A experiência é PIX → conversão → conta destino. O Stellar resolve liquidação e evidência sem aparecer.

### 2. Taxa transparente
Spread fixo de 0.30% + taxas de provedor visíveis antes de confirmar. Comparativo automático com custo tradicional (~3.5%).

### 3. Comprovante verificável
Toda operação gera comprovante com hash Stellar. Imutável. Auditável.

### 4. Multi-canal
Mesmo backend, mesma experiência. WhatsApp, Telegram, web. Troca de canal mantém sessão e histórico.

### 5. Modular e extensível
O backend expõe endpoints REST. O agente usa tools com interface padronizada. Adaptadores para provedores (payout, PIX, yield) são plugáveis.

---

## Modelo de Negócio

| Fonte de Receita | Descrição |
|---|---|
| **Spread por conversão** | 0.30% (30 bps) sobre cada conversão BRL ↔ USD |
| **Taxa de PIX on-ramp** | Taxa de provedor + margem |
| **Taxa de PIX off-ramp** | Taxa estimada antes da confirmação |
| **Transferências B2B** | Taxa por operação para empresas |
| **SaaS/API** | Acesso à infraestrutura como serviço |
| **Produtos financeiros** | Futuro: rendimento proprietário, seguros |

---

## Públicos-Alvo

| Persona | Dor | Valor |
|---|---|---|
| **Pessoa física** | Spread escondido, comparação manual | Cotação clara, PIX, comprovante |
| **Freelancer/Criador** | Receber em dólar é complicado | Fluxo conversacional, contatos salvos |
| **Pequena empresa** | Conciliação, custo FX | Histórico, evidência, reconciliação |
| **Fintech/Plataforma** | Precisa de rota BRL→USD | Backend modular, adaptadores |

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
| **Médio prazo** | Integração com contas internacionais (Wise, Mercury) |
| **Médio prazo** | SaaS/API para fintechs e plataformas |
| **Longo prazo** | Produtos financeiros proprietários |

---

## Contato

**TalkToStellar** · `talktostellar.com` · `github.com/rbfcdog/talk-to-stellar`

---

*"A rota mais simples e barata para converter reais em dólares, com taxa clara e evidência Stellar."*
