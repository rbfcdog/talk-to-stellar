# TalkToStellar - Diagrama de Arquitetura

## 1. Visão Geral

TalkToStellar é uma plataforma de transferência de valores em tempo real via Stellar, integrada a aplicativos de mensagem (WhatsApp, Telegram). Os usuários conversam com agentes de IA que interpretam comandos e executam operações financeiras de forma segura.

### Componentes Principais

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENT LAYER                               │
├─────────────────────────────────────────────────────────────────┤
│  Frontend (Next.js)   │   Telegram Bot   │   WhatsApp Webhook    │
│  /confirm-payment     │   (Telegraf)     │   (Twilio)            │
│  /onboarding          │   Polling        │   Webhook             │
│  Stellar Chat UI      │                  │                       │
└─────────────────────────────────────────────────────────────────┘
                                  ↓
┌─────────────────────────────────────────────────────────────────┐
│                      BACKEND API LAYER                            │
├─────────────────────────────────────────────────────────────────┤
│  Express.js (Port 3001)                                          │
│  ├── /api/onboarding/*        → User Registration                │
│  ├── /api/external/*          → Account Mapping (Telegram/WA)    │
│  ├── /api/agent/query         → AI Agent Processing              │
│  ├── /api/payments/*          → Payment Operations               │
│  ├── /api/actions/*           → Stellar Transactions             │
│  ├── /api/passkeys/*          → WebAuthn Authentication          │
│  └── /api/contacts/*          → Contact Management               │
│                                                                   │
│  LangChain Agent (LLM Integration)                               │
│  ├── Tools: send_payment, get_balance, create_contact, etc.     │
│  ├── LLM Model: GPT-4o (OpenAI)                                  │
│  └── Graph-based execution (langgraph)                           │
└─────────────────────────────────────────────────────────────────┘
                          ↓          ↓          ↓
        ┌─────────────────┴──────────┴──────────┴──────────┐
        │                                                   │
┌───────▼────────────┐  ┌──────────────────┐  ┌──────────▼─────┐
│  Supabase (DB)     │  │ Stellar Network  │  │  External APIs │
│  PostgreSQL        │  │  (Testnet)       │  │                │
│  Row Level Sec.    │  │  ├── Horizon     │  ├── OpenAI       │
│  Vault (secrets)   │  │  ├── Friendbot   │  ├── CoinGecko    │
│                    │  │  └── Testnet     │  └── Twilio       │
│ Tables:            │  │                  │                    │
│ ├── sessions       │  └──────────────────┘  └─────────────────┘
│ ├── wallets        │
│ ├── contacts       │
│ ├── operations     │
│ ├── external_accts │
│ └── passkeys       │
└────────────────────┘
```

---

## 2. Camadas da Arquitetura

### 2.1 Client Layer

#### **Frontend (Next.js)**
- **Localização**: `frontend/stellar-chat/`
- **Tecnologia**: Next.js 14, React, TypeScript
- **Páginas principais**:
  - `/onboarding`: Registro de usuário (Passkey + Senha)
  - `/confirm-payment?token=<jwt>`: Confirmação segura de pagamentos
  - `/`: Dashboard principal do chat
- **Comunicação**: 
  - Fetch HTTP para `/api/*` (backend)
  - WebAuthn API (passkeys)
  - Stellar SDK (carregamento de dados offline)

#### **Telegram Bot**
- **Localização**: `telegram/`
- **Tecnologia**: Telegraf (biblioteca Node.js)
- **Modo**: Polling (bot constantemente consulta Telegram)
- **Fluxo**:
  1. Usuário escreve no Telegram
  2. Bot extrai `provider_user_id` (Telegram user ID)
  3. Bot chama `/api/external/check-account` para validar
  4. Se não existe, envia link de onboarding via `creationUrl`
  5. Se existe, encaminha mensagem para `/api/agent/query`
- **Session Store**: Em-memória (localStorage do bot)

#### **WhatsApp/Twilio Webhook**
- **Localização**: `twilio-webhook/`
- **Tecnologia**: Node.js, Twilio
- **Modo**: Webhook (Twilio envia POST quando recebe mensagem)
- **Status**: Não implementado completamente

---

### 2.2 Backend API Layer

**Base URL**: `http://localhost:3001`

#### **Autenticação & Sessões**

| Endpoint | Método | Descrição |
|----------|--------|-----------|
| `/api/onboarding/register` | POST | Cria nova conta (email, senha, passkey) |
| `/api/passkeys/register-init` | POST | Inicia registro de passkey |
| `/api/passkeys/register-verify` | POST | Completa registro de passkey |
| `/api/passkeys/auth-init` | POST | Inicia autenticação com passkey |
| `/api/external/check-account` | POST | Verifica se Telegram/WA user existe e retorna onboarding URL |

#### **Agent & Query Processing**

| Endpoint | Método | Descrição |
|----------|--------|-----------|
| `/api/agent/query` | POST | Processa comando natural em linguagem (Telegram, WA, Frontend) |

**Input**:
```json
{
  "query": "enviar 10 USDC para Ana",
  "session_id": "uuid",
  "source": "telegram|whatsapp|frontend",
  "metadata": { "from": "@username", "from_id": "123" }
}
```

**Output**:
```json
{
  "message": "Pagamento autorizado. 10 USDC enviados para Ana.",
  "result": { /* operation details */ }
}
```

**Agent Flow**:
1. LLM recebe query em linguagem natural
2. LLM escolhe tool (send_payment, get_balance, etc.)
3. Tool executa operação Stellar
4. LLM retorna resposta em linguagem natural

#### **Pagamentos & Transações**

| Endpoint | Método | Descrição |
|----------|--------|-----------|
| `/api/external-payment/initiate` | POST | Inicia pagamento externo (cria JWT) |
| `/api/external-payment/finalize` | POST | Finaliza pagamento (com passkey/senha) |
| `/api/actions/build-path-payment-xdr` | POST | Constrói transação XDR para path payment |

#### **Contatos & Operações**

| Endpoint | Método | Descrição |
|----------|--------|-----------|
| `/api/contacts` | GET/POST | Listar/criar contatos |
| `/api/operations` | GET | Histórico de operações |
| `/api/wallet/balance` | GET | Saldo da carteira |

---

### 2.3 Data Layer (Supabase)

**URL**: `https://nvidjphdzkujrjncjcbz.supabase.co`

#### **Tabelas Principais**

```sql
-- Sessões de usuário
CREATE TABLE agent_sessions (
  id BIGSERIAL PRIMARY KEY,
  session_id UUID UNIQUE NOT NULL,
  user_id TEXT NOT NULL,
  email TEXT NOT NULL,
  public_key TEXT,               -- Stellar public key
  password_hash TEXT,             -- Bcrypt
  session_token UUID,
  created_at TIMESTAMP DEFAULT NOW(),
  last_activity TIMESTAMP
);

-- Carteiras Stellar
CREATE TABLE wallets (
  id BIGSERIAL PRIMARY KEY,
  session_id UUID UNIQUE NOT NULL,
  public_key TEXT UNIQUE NOT NULL,  -- Stellar public key
  vault_secret_id UUID,             -- Secret stored in Vault
  balance JSONB DEFAULT '[]',       -- [{ asset_code, balance }]
  FOREIGN KEY (session_id) REFERENCES agent_sessions(session_id) ON DELETE CASCADE
);

-- Contas externas (Telegram, WhatsApp)
CREATE TABLE external_accounts (
  id BIGSERIAL PRIMARY KEY,
  provider TEXT NOT NULL,           -- 'telegram', 'whatsapp', 'phone'
  provider_user_id TEXT NOT NULL,   -- Telegram ID, WhatsApp number
  session_id UUID,                  -- Linked to agent_sessions
  user_id TEXT,                     -- Linked user
  UNIQUE(provider, provider_user_id)
);

-- Contatos do usuário
CREATE TABLE contacts (
  id BIGSERIAL PRIMARY KEY,
  owner_id TEXT NOT NULL,           -- Email do owner
  contact_name TEXT NOT NULL,       -- "Ana", "Bob"
  stellar_public_key TEXT,          -- Stellar address
  pix_key TEXT,                     -- Pix identifier
  phone_number TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Histórico de operações
CREATE TABLE operations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  type TEXT NOT NULL,               -- 'payment', 'trustline', 'auto_conversion'
  status TEXT,                      -- 'pending', 'completed', 'failed'
  amount NUMERIC,
  asset_code TEXT,
  destination_key TEXT,             -- Recipient Stellar address
  stellar_transaction_hash TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Passkeys (WebAuthn credentials)
CREATE TABLE user_passkeys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL,
  credential_id TEXT UNIQUE NOT NULL,
  public_key TEXT NOT NULL,
  counter BIGINT NOT NULL DEFAULT 0,
  transports TEXT[] DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW()
);
```

#### **Vault (Secrets Storage)**

- Armazena chaves privadas Stellar de forma segriptada
- URL: `vault.secrets` do Supabase
- Acesso via `VaultService.getSecret(secret_id)`

---

### 2.4 Stellar Network Integration

**Network**: Testnet
**Horizon API**: `https://horizon-testnet.stellar.org`

#### **Operações Stellar**

| Operação | Descrição |
|----------|-----------|
| `payment` | Transferência de XLM ou assets |
| `path_payment_strict_receive` | Conversão XLM → USDC via DEX |
| `changeTrust` | Cria trustline para novo asset |
| `manageSellOffer` | Cria oferta de venda (liquidez) |

#### **Assets Configurados**

| Asset | Issuer (Testnet) | Ambiente |
|-------|------------------|----------|
| XLM | Native | Testnet |
| USDC | `GBZ46...` (ou novo) | Testnet |
| BRL | `GCKG7...` | Testnet |

#### **Scripts de Setup**

```bash
# 1. Criar issuers (USDC, BRL)
npx ts-node scripts/create-issuers.ts

# 2. Setup liquidity XLM/USDC (market maker)
npx ts-node scripts/setup-xlm-usdc-liquidity.ts

# 3. Criar contatos de teste com trustlines
npx ts-node scripts/create-contacts-for-user.ts rod@gmail.com 5
```

---

## 3. Fluxos de Dados Principais

### 3.1 Fluxo de Autenticação (Onboarding)

```
Frontend                 Backend               Supabase            Vault
   │                       │                      │                 │
   ├─ POST /onboarding ──> │                      │                 │
   │  { email, pwd }       │ Validate email       │                 │
   │                       ├─ Hash password       │                 │
   │                       ├─ Generate keypair    │                 │
   │                       │ Stellar keys         │                 │
   │                       ├─ Store secret ─────────────────────> │
   │                       │  (encrypted)         │                 │
   │                       ├─ INSERT session ──> │                 │
   │                       │ INSERT wallet        │                 │
   │                       │ INSERT passkey       │                 │
   │ <─── JWT token ────── │                      │                 │
   │                       │                      │                 │
   ├─ GET /confirm-payment?token=<jwt>           │                 │
   │ (JWT auto-loaded)     │                      │                 │
   │                       │ Validate JWT         │                 │
   │                       │ Load session data    │                 │
   │                       │                      │                 │
   ├─ Passkey auth ─────> │ Challenge           │                 │
   │  (WebAuthn)           │ Verify credential    │                 │
   │                       │ ✓ Authorized        │                 │
   │ <─ Success ────────── │                      │                 │
```

### 3.2 Fluxo de Pagamento (Path Payment XLM → USDC)

```
Telegram/Frontend        Backend                 Stellar             Supabase
     │                      │                      │                   │
     ├─ "enviar 10 USDC ──> │ LLM: detect intent  │                   │
     │   para Ana"          │ Tool: send_payment  │                   │
     │                      ├─ Load sender wallet │                   │
     │                      │ ├─ Get XLM balance  │                   │
     │                      │ ├─ Load Ana contact │                   │
     │                      │ ├─ Get Ana address  │                   │
     │                      │                     │                   │
     │                      ├─ Quote path payment │                   │
     │                      │ (XLM input)         ├─ strictReceivePaths
     │                      │ <─ Path found ──── │                   │
     │                      │ ├─ Build XDR        │                   │
     │                      │ ├─ Create JWT       ├─ INSERT operation │
     │                      │ ├─ Build link       │  (status: pending)│
     │                      │                     │                   │
     │ <─ "Click to confirm"──                   │                   │
     │                      │                     │                   │
     ├─ /confirm-payment?token=<jwt>             │                   │
     │ [Enter passkey/password]                  │                   │
     │                      │ Verify auth ──────────────────────────> │
     │                      │ Get secret from vault                   │
     │                      │ Sign XDR transaction                    │
     │                      │ Submit transaction ─────> submitTx()    │
     │                      │ <─ Hash: abc123... ─                   │
     │                      ├─ UPDATE operation ───> status: completed│
     │                      │  hash: abc123...        hash: abc123... │
     │ <─ "Enviado!" ──────────                   │                   │
     │                      │ LLM response        │                   │
```

### 3.3 Fluxo de Verificação de Conta Telegram

```
Telegram Bot           Backend              Supabase
     │                    │                    │
User escreve mensagem     │                    │
     │                    │                    │
Bot extrai user_id ──┐    │                    │
     └────────────> │ POST /external/check-account
                    │ { provider: 'telegram', provider_user_id: '123...' }
                    │
                    ├─ Query external_accounts ──>
                    │ (provider='telegram', provider_user_id='123')
                    │
                    IF EXISTS & linked:
                    ├─ Return { exists: true, sessionId: 'uuid' }
                    │
                    ELSE:
                    ├─ Generate JWT token
                    ├─ Create onboarding URL
                    └─ Return { exists: false, creationUrl: 'http://...' }
```

---

## 4. Stack Tecnológico

### Frontend

| Componente | Tecnologia | Justificativa |
|-----------|-----------|--------------|
| UI Framework | Next.js 14 (React) | SSR, API routes integradas, deploy simples |
| Autenticação | WebAuthn (Passkeys) | Moderno, sem senhas, FIDO2 |
| Criptografia | TweetNaCl.js | Stellar SDK incluso |
| Blockchain | Stellar SDK | Native support para Stellar |

### Backend

| Componente | Tecnologia | Justificativa |
|-----------|-----------|--------------|
| Framework | Express.js + TypeScript | Leve, type-safe, rápido |
| LLM Agent | LangChain + langgraph | Tool calling, multi-turn conversations |
| LLM Model | GPT-4o (OpenAI) | SOTA para reasoning, tool use |
| BD | Supabase (PostgreSQL) | Realtime, Row Level Security, Vault |
| Secrets | Supabase Vault | Criptografia de chaves privadas |
| Autenticação | Passkeys + JWT | Segurança moderna, tokens stateless |

### Integrações Externas

| Serviço | URL | Uso |
|---------|-----|-----|
| Stellar Horizon | horizon-testnet.stellar.org | Consultas, submissão de txs |
| Friendbot | friendbot.stellar.org | Faucet testnet (funding accounts) |
| OpenAI | api.openai.com | LLM (GPT-4o) |
| CoinGecko | api.coingecko.com | Cotações XLM/USD, XLM/BRL |
| Supabase | nvidjphdzkujrjncjcbz.supabase.co | Database + Auth + Vault |
| Telegraf | Bot API | Telegram bot |
| Twilio | twilio.com | WhatsApp webhook |

---

## 5. Fluxos de Segurança

### 5.1 Autenticação

1. **Passkey** (Preferido)
   - WebAuthn challenge-response
   - Biometria / PIN do dispositivo
   - Zero senhas armazenadas

2. **Senha** (Alternativa)
   - Bcrypt (cost 12)
   - Hash stored em DB
   - Usada em confirmação de pagamento

### 5.2 Autorização de Pagamento

```
User submits passkey/password
     ↓
Backend verifies credential against DB
     ↓
IF valid:
  ├─ Load secret from Vault (encrypted)
  ├─ Sign XDR transaction
  ├─ Submit to Stellar
  └─ Mark operation as completed
ELSE:
  └─ Reject with 401 Unauthorized
```

### 5.3 JWT Token (Payment Link)

- **Criado por**: Backend ao iniciar pagamento
- **Conteúdo**: sender, recipient, amount, asset, deadline
- **Assinado com**: `JWT_SECRET` (env var)
- **Expiration**: 5 minutos
- **Usado em**: URL `/confirm-payment?token=<jwt>`

---

## 6. Ciclo de Vida de uma Transação

```
1. USER INPUT
   └─ Telegram: "enviar 10 USDC para Ana"
   └─ Frontend: Form submission

2. AGENT PROCESSING
   ├─ LLM parse natural language
   ├─ Tool: lookup_contact("Ana")
   ├─ Tool: get_balance(sender)
   ├─ Tool: quote_path_payment(10 USDC → XLM)

3. TRANSACTION BUILDING
   ├─ Build XDR (path payment operation)
   ├─ Create JWT token
   ├─ Generate confirmation URL

4. USER CONFIRMATION
   ├─ Click confirmation link
   ├─ Authenticate with passkey/password
   ├─ Review: amount, recipient, gas fee

5. TRANSACTION SUBMISSION
   ├─ Load secret from Vault
   ├─ Sign XDR with sender's keypair
   ├─ Submit to Stellar Horizon

6. CONFIRMATION & LOGGING
   ├─ Get tx hash from Horizon
   ├─ Update DB (operations table)
   ├─ Send response to Telegram/Frontend
   └─ Log to agent message history

7. SETTLEMENT
   ├─ Stellar processes tx
   ├─ Recipient gets USDC in wallet
   ├─ Can view in `/balance` endpoint
```

---

## 7. Dependências & Deployment

### Variáveis de Ambiente (.env)

```env
# OpenAI
OPENAI_API_KEY=sk-proj-...
OPENAI_MODEL=gpt-4o

# Supabase
SUPABASE_URL=https://...supabase.co
SUPABASE_ANON_KEY=eyJ...

# JWT & Security
JWT_SECRET=<long-random-string>

# Stellar
STELLAR_NETWORK=TESTNET
STELLAR_HORIZON_URL=https://horizon-testnet.stellar.org
STELLAR_FRIENDBOT_URL=https://friendbot.stellar.org

# Assets (Issuers)
USDC_ISSUER=GBZ46...
BRL_ISSUER=GCKG7...

# Telegram
TELEGRAM_BOT_TOKEN=123456:ABC...
TELEGRAM_AGENT_URL=http://localhost:3001/api/agent/query
TELEGRAM_BOT_MODE=polling

# Twilio (WhatsApp)
TWILIO_ACCOUNT_SID=...
TWILIO_AUTH_TOKEN=...
TWILIO_WHATSAPP_NUMBER=...
```

### Port Mapping

| Serviço | Port | URL |
|---------|------|-----|
| Backend | 3001 | http://localhost:3001 |
| Frontend | 3000 | http://localhost:3000 |
| Telegram Bot | (async) | N/A |
| Health Check | 3005 | http://localhost:3005/health |

---

## 8. Exemplo: Request Completo

### Telegram → Payment

```bash
# 1. User sends message
Telegram API → Bot (polling)
Provider: "telegram"
Provider User ID: "123456789"
Message: "enviar 10 USDC para Ana"

# 2. Bot calls check-account
POST http://localhost:3001/api/external/check-account
{
  "provider": "telegram",
  "provider_user_id": "123456789"
}

# Response:
{
  "exists": true,
  "sessionId": "550e8400-e29b-41d4-a716-446655440000"
}

# 3. Bot forwards to agent
POST http://localhost:3001/api/agent/query
{
  "query": "enviar 10 USDC para Ana",
  "session_id": "550e8400-e29b-41d4-a716-446655440000",
  "source": "telegram",
  "metadata": { "from": "username", "from_id": "123456789" }
}

# 4. Agent returns
{
  "message": "Pagamento de 10 USDC para Ana está pronto. Confirme em: http://localhost:3000/confirm-payment?token=eyJ...",
  "result": { "confirmationUrl": "..." }
}

# 5. User clicks link → confirm-payment page
# 6. User authenticates with passkey
# 7. Backend signs & submits to Stellar
# 8. Stellar processes → transaction hash returned
# 9. Frontend shows success
# 10. Telegram bot gets notification (via agent callback)
```

---

## 9. Próximos Passos & Melhorias

- [ ] **Webhook mode para Telegram** (substituir polling)
- [ ] **WhatsApp completo** (Twilio integration)
- [ ] **Rate limiting & DDoS protection**
- [ ] **Monitoring & logging centralizado** (Sentry, LogRocket)
- [ ] **CI/CD pipeline** (GitHub Actions)
- [ ] **Production deployment** (Railway, Render, Heroku)
- [ ] **Mainnet support** (Stellar Live)
- [ ] **Suporte a mais assets** (bridging protocols)
