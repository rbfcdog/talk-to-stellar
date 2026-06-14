# TalkToStellar — Stack Técnica Detalhada (Registro Técnico)

**Versão**: 1.0  
**Data de Atualização**: Maio 2026  
**Status**: Produção (Testnet)  
**Responsável**: Equipe Técnica TalkToStellar

---

## 1. CAMADA DE INTERFACE (Client Layer)

### 1.1 Frontend Web — Next.js

**Framework**: Next.js 14+ (React 18+, TypeScript 5+)
- **Localização**: `frontend/stellar-chat/`
- **Tipos de Página**:
  - `/onboarding` — Fluxo de criação de conta com Passkey + opcional senha
  - `/confirm-payment?token=<jwt>` — Confirmação de pagamento com autenticação dupla (Passkey ou senha)
  - `/` — Interface principal de chat e dashboard
- **Dependências Críticas**:
  - `@simplewebauthn/browser` — WebAuthn client-side (Passkey registration & auth)
  - `stellar-sdk` — Carregamento offline de dados Stellar
  - `axios` / `fetch` — Comunicação com backend
  - `next/auth` — Gestão de sessão (opcional, pode ser melhorado)
  - `postcss`, `tailwindcss` — Styling
- **Build & Deploy**:
  - Build: `npm run build` → Next.js static export ou SSR
  - Target: Docker + Vercel/Container Registry
  - Vercel config: `vercel.json`
  - Dockerfile: Multi-stage, Node.js LTS
- **Segurança**:
  - HTTPS obrigatório em produção
  - Content Security Policy (CSP) headers
  - X-Frame-Options: SAMEORIGIN
  - Comunicação com backend via HTTPS apenas
- **Fluxos de Autenticação Suportados**:
  - Passkey (WebAuthn) — Recomendado (biometria + segurança de hardware)
  - Senha local (fallback para criação com senha)
  - Session token (JWT) para operações autenticadas

### 1.2 Telegram Bot

**Framework**: Telegraf 4.x (Node.js)
- **Localização**: `telegram/`
- **Modo de Operação**: Polling
  - Bot consulta Telegram API a cada N segundos para novas mensagens
  - Alternativa futura: Webhook (mais eficiente)
- **Integração com Backend**:
  - Endpoint: `/api/external/check-account` — Valida se usuário existe
  - Endpoint: `/api/external/link-account` — Cria mapeamento Telegram → Account
  - Endpoint: `/api/agent/query` — Encaminha mensagens para agent de IA
- **Session Store**: 
  - Atual: Em-memória (não escalável para produção)
  - Recomendado: Redis ou Supabase para estado distribuído
- **Fluxo**:
  1. Usuário envia mensagem no Telegram
  2. Bot extrai `provider_user_id` (Telegram UID)
  3. Backend verifica existência de account
  4. Se novo → Envia link dinâmico de onboarding
  5. Se existe → Processa comando via agent LLM
- **Autenticação com Backend**:
  - Bearer Token (JWT) enviado em Authorization header
  - Token renovável com refresh endpoint
- **Rate Limiting**: A implementar (proteção contra abuse)

### 1.3 WhatsApp/Twilio Integration

**Framework**: Twilio SDK + Express Webhook
- **Localização**: `twilio-webhook/`
- **Modo de Operação**: Webhook
  - Twilio envia POST quando mensagem é recebida
  - Backend responde com ações (enviar mensagem, link, etc.)
- **Endpoints**:
  - `/webhook/whatsapp/in` — Recebe mensagens (POST)
  - `/webhook/whatsapp/status` — Recebe status de entrega
- **Status Atual**: Estrutura básica pronta, não plenamente integrada
- **Segurança**:
  - Validação de Twilio signature (`X-Twilio-Signature` header)
  - IP whitelist de servidores Twilio
  - Autenticação com Twilio Account SID + Auth Token

### 1.4 SDK Blindpay (Helper)

**Localização**: `blindpay/`
- **Propósito**: Utilitários para operações de pagamento e liquidez
- **Tecnologia**: Node.js
- **Uso**: Referenciado pelo backend para cálculos e preparação de transações

---

## 2. CAMADA DE AGENTE IA (LLM & Orchestration)

### 2.1 Modelo de Linguagem (LLM)

**Provedor**: OpenAI
- **Modelo**: GPT-4o (função calling + reasoning)
- **Acesso**: via OpenAI API v1
- **Configuração**:
  - Chave armazenada em variável de ambiente (`OPENAI_API_KEY`)
  - Temperatura: 0.3–0.7 (balanceado entre consistência e criatividade)
  - Max tokens por request: 2048
- **Function Calling**:
  - O modelo recebe lista de funções disponíveis (tools)
  - Interpreta comando do usuário
  - Seleciona tool apropriada com argumentos estruturados
  - Backend executa e retorna resultado para reflexão do modelo

### 2.2 Framework de Orchestration — LangChain / LangGraph

**Biblioteca**: `langchain` + `@langchain/langgraph`
- **Propósito**: Orquestração de fluxos de agente (graph-based)
- **Arquitetura**:
  - **Graph State**: Estrutura imutável que passa entre nós
    - `messages` — Histórico de conversa
    - `user_id` — Contexto de usuário
    - `wallet_id` — Wallet ativo
    - `session_state` — Metadados da sessão
  - **Nós do Grafo**:
    - `parse_input` — Normaliza entrada do usuário
    - `llm_decision` — LLM decide qual ação tomar
    - `execute_tool` — Executa a ferramenta selecionada
    - `format_response` — Formata resposta para usuário
  - **Edges**: Transições condicionais baseadas em state
- **Localização do código**: `backend/src/agent/graph.ts`

### 2.3 Tools (Function Set)

Conjunto de funções que o LLM pode invocar (definidas em `backend/src/agent/tools.ts`):

| Tool | Descrição | Permissões |
|------|-----------|-----------|
| `send_payment` | Inicia pagamento Stellar para contato | Requer autenticação |
| `get_balance` | Retorna saldo de XLM ou USDC | Leitura pública |
| `list_contacts` | Lista contatos salvos do usuário | Próprio usuário |
| `create_contact` | Cria novo contato na agenda | Próprio usuário |
| `get_exchange_rate` | Cotação BRL/USD via CoinGecko | Pública |
| `get_transaction_status` | Status de uma transação anterior | Próprio usuário |
| `check_account_recovery` | Inicia fluxo de recuperação de conta | Sem auth necessária |

**Implementação**:
- Cada tool é uma função TypeScript async
- Recebe argumentos estruturados do LLM
- Retorna resultado em formato JSON
- Exceções são capturadas e retornadas como erro do tool

### 2.4 Fluxo de Chat

1. Usuário envia mensagem via Telegram/WhatsApp/Web
2. Backend recebe em `/api/agent/query`
3. **LangGraph** carrega state da sessão (histórico, wallet)
4. **GPT-4o** analisa mensagem e tools disponíveis
5. Se necessário ação → invoca tool com argumentos
6. **Tool** executa operação (ex: preparar transação Stellar)
7. Resultado retorna para LLM (reflexão)
8. LLM formata resposta em linguagem natural
9. Backend retorna `{ reply: string, action?: object }`
10. Frontend/Bot exibe resposta e links de ação se necessário

---

## 3. CAMADA DE BACKEND API

### 3.1 Stack Principal

**Runtime**: Node.js 18+ (LTS)
- **Framework**: Express 4.x
- **Linguagem**: TypeScript 5.x (strict mode)
- **Port**: 3001 (configurável via `PORT`)
- **Entry Points**:
  - `backend/src/server.ts` — Bootstrap HTTP server
  - `backend/src/app.ts` — Wiring de middlewares e rotas

### 3.2 Middlewares & Segurança

```typescript
// Ordem típica em app.ts:
1. CORS (configurable origins)
2. JSON/URL-encoded parsers
3. Request logging (morgan ou custom)
4. JWT authentication (exceto public endpoints)
5. Rate limiting (express-rate-limit)
6. Error handler (global)
```

**Variáveis de Ambiente**:
- `JWT_SECRET` — Chave para assinar/verificar tokens
- `JWT_EXPIRY` — Duração do token (ex: "24h")
- `SUPABASE_URL` — URL do projeto Supabase
- `SUPABASE_KEY` — Chave anônima ou service role
- `STELLAR_HORIZON_URL` — URL do Horizon (testnet ou mainnet)
- `OPENAI_API_KEY` — Chave OpenAI
- `FRONTEND_URL` — URL do frontend para CORS e redirecionamentos
- `DATABASE_URL` — (Opcional, se usando driver Postgres direto)

### 3.3 Rotas Principais

#### Authentication & External Accounts

| Rota | Método | Descrição |
|------|--------|-----------|
| `/api/external/check-account` | POST | Valida se conta Telegram/WA existe |
| `/api/external/create-account-link` | POST | Gera link dinâmico de onboarding |
| `/api/external/finalize` | POST | Finaliza onboarding (cria wallet) |
| `/api/external/auth-status` | GET | Retorna status de autenticação |

#### Passkeys (WebAuthn)

| Rota | Método | Descrição |
|------|--------|-----------|
| `/api/passkeys/register-init` | POST | Inicia registro de Passkey |
| `/api/passkeys/register-finalize` | POST | Completa registro após biometria |
| `/api/passkeys/auth-init` | POST | Inicia autenticação (challenge) |
| `/api/passkeys/auth-finalize` | POST | Valida resposta e retorna token |

#### Wallet & Assets

| Rota | Método | Descrição |
|------|--------|-----------|
| `/api/actions/balance` | GET | Saldo XLM e USDC |
| `/api/actions/operations` | GET | Histórico de transações |
| `/api/actions/prepare-payment` | POST | Prepara XDR sem assinar |
| `/api/actions/submit-payment` | POST | Submete XDR já assinado |
| `/api/actions/trustline` | POST | Cria trustline para USDC |

#### Contact Management

| Rota | Método | Descrição |
|------|--------|-----------|
| `/api/contacts` | GET | Lista contatos |
| `/api/contacts` | POST | Cria contato |
| `/api/contacts/:id` | DELETE | Remove contato |
| `/api/contacts/lookup` | POST | Busca por nome ou Stellar ID |

#### Agent Chat

| Rota | Método | Descrição |
|------|--------|-----------|
| `/api/agent/query` | POST | Envia mensagem para agente |
| `/api/agent/session` | GET | Retorna histórico da sessão |
| `/api/agent/session` | DELETE | Encerra sessão |

### 3.4 Services (Lógica de Negócio)

#### `vault.service.ts`
- Gerencia segredos criptografados no Supabase Vault
- Operações: store, retrieve, rotate
- Usado para armazenar chaves privadas Stellar (encriptadas)
- Nunca expõe chaves em texto claro no backend

#### `passkey.service.ts`
- Gerencia ciclo de vida de Passkey (WebAuthn)
- Operações: `generateRegistrationOptions()`, `verifyRegistrationResponse()`, `generateAuthenticationOptions()`, `verifyAuthenticationResponse()`
- Dependência: `@simplewebauthn/server`
- Armazena challenges em `passkey_challenges` table (com TTL)

#### `stellar.service.ts`
- Wrapper do Stellar SDK
- Operações: construir transações, assinar (servidor), submeter, carregar account
- Métodos:
  - `getBalance(publicKey)` — Saldos XLM/USDC
  - `getOperations(publicKey)` — Histórico
  - `buildPaymentXDR(from, to, asset, amount)` — Cria XDR não-assinado
  - `submitTransaction(xdr)` — Submete para rede
  - `createTrustline(account, asset)` — Cria trustline

#### `user.service.ts`
- Onboarding e gerência de usuários
- Operações: criação de account, inicialização de wallet, seed contacts
- Fluxo: `/api/external/create-account-link` → token JWT → frontend abre `/onboarding?token=X` → `/api/external/finalize`

#### `agent.service.ts`
- Orquestração do LangGraph
- Método: `processQuery(userId, message, context)` → string
- Mantém histórico em `agent_messages` table
- Gerencia estado em `agent_states` table

### 3.5 Repositories (Data Access)

Padrão repository para abstração de Supabase:

```
backend/src/api/repository/
├── wallet.repository.ts
├── user.repository.ts
├── contact.repository.ts
├── operation.repository.ts
├── session.repository.ts
├── external-account.repository.ts
└── passkey.repository.ts
```

Cada repository expõe métodos:
- `create(data)` — INSERT
- `findById(id)` — SELECT by PK
- `findAll(filters)` — SELECT com filtros
- `update(id, data)` — UPDATE
- `delete(id)` — DELETE

### 3.6 Testing

**Framework**: Jest 29+
- **Configuração**: `backend/jest.config.js`, `backend/jest.setup.js`
- **Test Suites**:
  - `tests/agent-ai.test.ts` — Testes de fluxo do agent
  - `tests/agent-tools.test.ts` — Testes de tools individuais
  - `tests/wallet.test.ts` — Testes de criação e operações de wallet
  - `tests/passkey.service.test.ts` — Testes de WebAuthn
  - `tests/vault.service.test.ts` — Testes de armazenamento seguro
  - `tests/stellar-sdk.test.ts` — Testes de interação com Stellar
  - `tests/api-integration.test.ts` — Testes de integração end-to-end
  - `tests/e2e.test.ts` — Cenários completos
- **Mocks**:
  - Supabase: `jest-mock-extended` ou custom mocks
  - Stellar Horizon: Respostas hardcoded para testnet
  - OpenAI: Responses fixtures

### 3.7 Monitoramento & Logging

- **Logger**: Bunyan ou Winston
- **Logs Armazenados**: Supabase table `logs` ou stdout (para container)
- **Métricas**: Prometheus-ready endpoints em `/metrics` (opcional)

---

## 4. BLOCKCHAIN & REDE

### 4.1 Stellar Network

**Rede Alvo**: Stellar Testnet (desenvolvimento), Mainnet (produção)
- **Horizon API URL** (Testnet): `https://horizon-testnet.stellar.org`
- **Horizon API URL** (Mainnet): `https://horizon.stellar.org`
- **Network Passphrase**:
  - Testnet: `Test SDF Network ; September 2015`
  - Mainnet: `Public Global Stellar Network ; September 2015`
- **Friendbot** (Testnet): Faucet para testar em testnet → `https://friendbot.stellar.org/`

### 4.2 Ativos Suportados

#### XLM (Stellar Native Asset)
- **Código**: `native`
- **Issuer**: N/A (asset nativo)
- **Saldo Mínimo**: 0.5 XLM (requisito de account na rede)
- **Uso**: Moeda base para fees, liquidez

#### USDC (USD Coin — Stellar)
- **Código**: `USDC`
- **Issuer** (Mainnet/Public): `GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN`
- **Issuer** (Testnet): `GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5`
- **Tipo**: Stablecoin
- **Use Case**: Transferências em USD / operações comerciais

### 4.3 Operações Suportadas

| Operação | Descrição | Implementação |
|-----------|-----------|---|
| `Payment` | Transferência de XLM/USDC | `src/agent/tools.ts: send_payment` |
| `SetOptions` | Atualiza flags de account | N/A (futuro) |
| `CreateTrustline` | Autoriza novo asset | `stellar.service.ts: createTrustline` |
| `ManageOffer` | Cria ordem no DEX | Futuro |

### 4.4 Assinatura de Transações

**Modelo**: Não-custodial por design
- **Chave Privada**: Nunca no servidor
- **Assinatura Local**: No dispositivo do usuário (frontend)
- **Servidor Submete**: Apenas XDR assinado
- **Fallback**: Se assinatura local falhar, backend pode assinar com chave do Vault (apenas para transações não-sensíveis, ex: fundos do sistema)

**Fluxo Seguro**:
```
1. Backend prepara XDR (não-assinado): backend/src/agent/tools.ts
2. Backend envia XDR para frontend
3. Frontend (dispositivo do usuário) autentica com Passkey/PIN
4. Frontend carrega chave privada local (criptografada)
5. Frontend assina XDR com `Keypair.fromSecret().sign()`
6. Frontend envia XDR assinado de volta para `/api/actions/submit-payment`
7. Backend verifica assinatura (opcional) e submete com `server.submitTransaction()`
```

---

## 5. BANCO DE DADOS

### 5.1 Provedor: Supabase + PostgreSQL

**Configuração**:
- **Versão PostgreSQL**: 14+
- **URL**: Variável de ambiente `SUPABASE_URL`
- **Autenticação**:
  - Chave anônima (public) → Para operações de app
  - Service Role Key → Para operações administrativas backend
- **Row-Level Security (RLS)**: Ativado em tabelas críticas
- **Extensões Ativadas**: pgcrypto, uuid-ossp, pgtrgm

### 5.2 Schema Principal

Todas as tabelas estão consolidadas em `backend/migrations/20260613_00_full_schema.sql`:

#### `users`
```sql
CREATE TABLE users (
  id UUID PRIMARY KEY,
  email TEXT UNIQUE,
  phone TEXT UNIQUE,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);
```
- Usuários únicos do sistema
- Um usuário pode ter múltiplas wallets

#### `wallets`
```sql
CREATE TABLE wallets (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  stellar_public_key TEXT UNIQUE NOT NULL,
  vault_key_id TEXT, -- referência para chave no Vault
  balance_xlm DECIMAL,
  balance_usdc DECIMAL,
  created_at TIMESTAMP,
  updated_at TIMESTAMP
);
```
- Referência para conta Stellar do usuário
- Saldos cached (atualizado a cada sync)
- `vault_key_id` aponta para chave privada encriptada no Vault

#### `agent_sessions`
```sql
CREATE TABLE agent_sessions (
  id UUID PRIMARY KEY,
  user_id UUID,
  wallet_id UUID REFERENCES wallets(id),
  session_token JWT,
  session_password_hash TEXT, -- fallback (apenas se criado com senha)
  external_provider TEXT, -- 'telegram', 'whatsapp', 'web'
  external_provider_user_id TEXT, -- Telegram UID, WA number, etc
  created_at TIMESTAMP,
  expires_at TIMESTAMP,
  UNIQUE(external_provider, external_provider_user_id)
);
```
- Mapeia usuário externo (Telegram UID) para wallet interno
- TTL automático (sessão expira)

#### `agent_messages`
```sql
CREATE TABLE agent_messages (
  id UUID PRIMARY KEY,
  session_id UUID REFERENCES agent_sessions(id),
  role TEXT, -- 'user' | 'assistant'
  content TEXT,
  metadata JSONB, -- LLM tokens, tool calls, etc
  created_at TIMESTAMP
);
```
- Histórico de conversas para contexto do agent

#### `contacts`
```sql
CREATE TABLE contacts (
  id UUID PRIMARY KEY,
  wallet_id UUID REFERENCES wallets(id),
  name TEXT NOT NULL,
  stellar_public_key TEXT NOT NULL,
  notes TEXT,
  created_at TIMESTAMP,
  UNIQUE(wallet_id, stellar_public_key)
);
```
- Agenda de contatos do usuário
- Facilita envio de pagamentos

#### `operations`
```sql
CREATE TABLE operations (
  id UUID PRIMARY KEY,
  wallet_id UUID REFERENCES wallets(id),
  transaction_hash TEXT,
  operation_type TEXT, -- 'payment', 'trustline', etc
  status TEXT, -- 'pending', 'completed', 'failed'
  amount DECIMAL,
  asset TEXT, -- 'XLM', 'USDC'
  recipient_address TEXT,
  xdr TEXT, -- Transação assinada (opcional, para auditoria)
  created_at TIMESTAMP,
  completed_at TIMESTAMP
);
```
- Registro de todas as operações Stellar
- Auditoria e reconciliação

#### `passkey_challenges`
```sql
CREATE TABLE passkey_challenges (
  id UUID PRIMARY KEY,
  session_id UUID REFERENCES agent_sessions(id),
  challenge TEXT NOT NULL,
  allowed_credentials JSONB,
  created_at TIMESTAMP,
  expires_at TIMESTAMP, -- TTL 10 minutos
  used BOOLEAN DEFAULT false
);
```
- Armazena challenges para WebAuthn
- Validação de passkey registration e authentication

#### `user_passkeys`
```sql
CREATE TABLE user_passkeys (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  credential_id TEXT UNIQUE NOT NULL,
  public_key TEXT NOT NULL,
  sign_count BIGINT DEFAULT 0,
  transports JSONB, -- ['usb', 'internal', 'ble', 'nfc']
  backup_eligible BOOLEAN,
  backup_state BOOLEAN,
  created_at TIMESTAMP,
  last_used_at TIMESTAMP
);
```
- Registro de Passkeys do usuário
- Um usuário pode ter múltiplas passkeys

#### `external_accounts`
```sql
CREATE TABLE external_accounts (
  id UUID PRIMARY KEY,
  wallet_id UUID REFERENCES wallets(id),
  provider TEXT, -- 'telegram', 'whatsapp'
  provider_user_id TEXT,
  created_at TIMESTAMP,
  UNIQUE(provider, provider_user_id)
);
```
- Mapeia IDs externos (ex: Telegram UID) para wallet

#### `vault` (Supabase Vault)
```
Encryption engine built-in ao Supabase
- Key: Gerada por Supabase
- Values: Chaves privadas Stellar, encriptadas
- API: vault.aes_encrypt() / vault.aes_decrypt_string()
```

### 5.3 Migrations

- **Driver**: `node-postgres` (pg) ou Knex.js
- **Diretório**: `backend/migrations/`
- **Execução**: Via npm script `npm run migrate` (usa driver configurado)
- **Ferramentas**: Flyway (em consideração) ou custom SQL scripts

### 5.4 Row-Level Security (RLS) Policies

Exemplo para tabela `contacts`:
```sql
-- Usuário só vê seus próprios contatos
CREATE POLICY "Users can view own contacts"
ON contacts FOR SELECT
USING (wallet_id IN (
  SELECT id FROM wallets WHERE user_id = auth.uid()
));
```

---

## 6. CUSTÓDIA & SEGURANÇA

### 6.1 Modelo Não-Custodial

**Princípio Fundamental**: Usuário é o único dono da chave Stellar.

**Onde fica cada coisa**:

| Item | Localização | Controle |
|------|-------------|----------|
| Chave Privada Stellar | Dispositivo do usuário, criptografada | Usuário |
| Chave Pública Stellar | Supabase + Rede Stellar | Público |
| Passkey Privada | Secure Enclave / TPM do SO | Usuário |
| Passkey Pública | Supabase | Backend |
| PIN | Apenas dispositivo (nunca em claro) | Usuário |
| Blob Chave Stellar (encriptado) | Supabase + Dispositivo | Inútil sem Passkey/PIN |
| Metadados Account | Supabase (RLS) | Backend |

### 6.2 Autenticação Primária — Passkey (WebAuthn)

**Stack**:
- `@simplewebauthn/server` (backend validation)
- `@simplewebauthn/browser` (frontend ceremony)
- Padrão: [W3C WebAuthn Level 2](https://w3c.github.io/webauthn/)

**Fluxo de Registro**:
```
1. Backend: generateRegistrationOptions({ rpId, userId, ... })
   → Retorna challenge + metadados
2. Frontend: startRegistration(options)
   → Sistema operacional pede biometria/PIN do device
   → Gera par de chaves (privada no Secure Enclave, pública retorna)
3. Frontend: Envia credentialResponse ao backend
4. Backend: verifyRegistrationResponse(credentialResponse)
   → Valida signature e armazena em user_passkeys
```

**Fluxo de Autenticação**:
```
1. Backend: generateAuthenticationOptions({ allowCredentials: [...] })
2. Frontend: startAuthentication(options)
   → Sistema operacional pede biometria
   → Assina challenge com chave privada (nunca expõe chave)
3. Frontend: Envia assertionResponse ao backend
4. Backend: verifyAuthenticationResponse(assertionResponse)
   → Valida signature + incrementa sign_count (proteção contra clonagem)
   → Retorna JWT de sessão
```

**Segurança**:
- Chave privada nunca sai do dispositivo
- Hardware-backed quando disponível (iPhone Secure Enclave, Android Keystore)
- Proteção contra phishing (RP ID + origin binding)
- Proteção contra clonagem (sign_count)

### 6.3 Autenticação Secundária — PIN (Fallback)

**Modelo**:
- PIN nunca armazenado em claro
- PIN deriva chave de criptografia local via KDF (Argon2id ou PBKDF2)
- Chave Stellar criptografada localmente com essa derivação

**Fluxo**:
```
1. Onboarding: Usuário define PIN (ex: 1234)
2. Frontend: Deriva chave com Argon2id(PIN, salt, params altos)
3. Frontend: Criptografa chave Stellar com chave derivada
4. Frontend: Blob criptografado armazenado localmente e/ou Supabase
5. Autenticação: Usuário entra PIN
6. Frontend: Rederiva chave com mesmo Argon2id
7. Frontend: Descriptografa blob para recuperar chave Stellar
8. Frontend: Autentica/assina transação
```

**Segurança**:
- Argon2id com parâmetros altos (memory: 64MB, iterations: 4, parallelism: 4)
- Salt único por usuário (armazenado em claro)
- PIN nunca deixa o dispositivo
- Taxa de tentativas limitada localmente (3 falhas = lock por 5 min)

### 6.4 Recuperação de Conta (SEP-30)

**Padrão**: Stellar Ecosystem Proposal 30 (SEP-30)
- Permite recuperação de chaves perdidas sem central authority
- Usa Passkey de recuperação + servidor de recuperação
- Ainda em discussão/implementação

**Alternativa Atual**:
- Backup da chave privada criptografada (salvo localmente)
- Sincronização de iCloud/Google Drive se disposto pelo usuário
- Suporte manual (contato support com prova de identidade)

### 6.5 Criptografia em Trânsito

- **HTTPS/TLS 1.3**: Obrigatório para todas as comunicações
- **Certificate Pinning** (opcional): Para apps mobile futuros
- **End-to-End**: Chaves Stellar nunca enviadas em claro

### 6.6 Criptografia em Repouso

- **Vault (Supabase)**: Chaves privadas criptografadas com chave do Supabase
- **Database (Supabase)**: Criptografia padrão ao nível de storage
- **PII**: Email/Phone masked ou hashed onde possível

---

## 7. INFRAESTRUTURA & DEPLOYMENT

### 7.1 Containerização

**Docker**:
- `backend/Dockerfile` — Node.js + dependências + build TypeScript
- `frontend/stellar-chat/Dockerfile` — Node.js + build Next.js
- `telegram/Dockerfile` — Node.js bot
- `twilio-webhook/Dockerfile` — Node.js webhook

**Docker Compose** (desenvolvimento):
- `docker-compose.dev.yml` — Services: backend, frontend, Postgres, Redis
- `docker-compose.yml` — Produção simplificada

**Multi-stage Builds**:
```dockerfile
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
RUN npm prune --production

FROM node:18-alpine AS runtime
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY package*.json ./
EXPOSE 3001
CMD ["node", "dist/server.js"]
```

### 7.2 Orquestração

**Opção 1: Kubernetes (Escalabilidade)**
- Manifests: Requerido criar
- Services: Backend, Frontend, Telegram Bot (3 deployments)
- Ingress: NGINX + TLS
- PersistentVolumes: Para dados críticos (se necessário)

**Opção 2: Container Apps (Azure)**
- Mais simples que K8s
- Auto-scaling built-in
- Networking simplificado

**Opção 3: Render.com / Heroku**
- Mais rápido para MVP
- Render config: `backend/render.yaml`

### 7.3 Variáveis de Ambiente

**Backend**:
```env
NODE_ENV=production
PORT=3001

# Database
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_KEY=xxxx
DATABASE_URL=postgresql://user:pass@db:5432/talktostell

# Stellar
STELLAR_HORIZON_URL=https://horizon.stellar.org
STELLAR_TESTNET_HORIZON=https://horizon-testnet.stellar.org

# IA
OPENAI_API_KEY=sk-xxxx
OPENAI_MODEL=gpt-4o

# Security
JWT_SECRET=very_long_random_string
JWT_EXPIRY=24h
BACKEND_SECRET_KEY=xxxx

# CORS & URLs
FRONTEND_URL=https://app.talktosteller.com
TELEGRAM_BOT_TOKEN=xxxxx:xxxxx
TWILIO_ACCOUNT_SID=xxxxx
TWILIO_AUTH_TOKEN=xxxxx
TWILIO_PHONE=+xxxx

# Passkeys
RP_ID=talktosteller.com
RP_NAME=TalkToStellar
ORIGIN=https://app.talktosteller.com
```

**Frontend** (`.env.local`):
```env
NEXT_PUBLIC_API_URL=https://api.talktosteller.com
NEXT_PUBLIC_APP_URL=https://app.talktosteller.com
```

### 7.4 CI/CD

**GitHub Actions** (recomendado):
- Trigger: Push para `main` / `develop`
- Steps:
  1. Checkout código
  2. Setup Node.js 18
  3. `npm ci` (instalar dependencies)
  4. `npm run lint` (ESLint)
  5. `npm run test` (Jest)
  6. `npm run build` (TypeScript + Next.js build)
  7. Build Docker image
  8. Push para Docker Registry (GitHub/DockerHub/Azure)
  9. Deploy para staging/produção

**Render YAML** (`backend/render.yaml`):
```yaml
services:
  - type: web
    name: talktosteller-backend
    repo: github.com/user/talk-to-stellar
    rootDir: backend
    buildCommand: npm run build
    startCommand: node dist/server.js
    envVars:
      - key: NODE_ENV
        value: production
    # ... mais config
```

---

## 8. DECISÕES DE ARQUITETURA & TRADE-OFFS

### 8.1 Por que Stellar?

✅ **Vantagens**:
- Rede aberta, sem custódia centralizada
- Transações rápidas (4-5 segundos finality)
- Taxas baixas (~0.00001 XLM)
- Suporte nativo a stablecoins (USDC)
- DEX integrada (sem intermediários)
- Strong compliance layer (SEP standards)

❌ **Desvantagens**:
- Menor liquidez que Ethereum/Bitcoin
- Pool menor de desenvolvedores
- Menos integrations de terceiros

### 8.2 Por que não Ethereum?

- Taxas altas (gas prices variáveis)
- Complexidade de smart contracts
- Menos adequado para pagamentos P2P simples

### 8.3 Por que Passkey (WebAuthn)?

✅ **Vantagens**:
- Sem gerência de senhas (menos phishing)
- Hardware-backed (Secure Enclave, TPM)
- Escalável (um dispositivo = múltiplas apps)
- Padrão W3C (não proprietário)
- UX simples (biometria)

❌ **Desvantagens**:
- Não funciona em browsers antigos (Edge < 113, Firefox < 119)
- Fallback para PIN necessário em alguns casos

### 8.4 Por que Node.js + TypeScript?

✅ **Vantagens**:
- Time familiar (JavaScript)
- Ecosistema rich (npm)
- Bom para I/O-bound (APIs, DBs)
- TypeScript = segurança de tipos

❌ **Desvantagens**:
- Não ideal para CPU-bound operations (criptografia pesada)
- Single-threaded (Worker threads possível para compute)

### 8.5 Por que Supabase?

✅ **Vantagens**:
- PostgreSQL gerenciado (confiável)
- Autenticação built-in (opcional)
- Row-Level Security nativo
- Vault para secrets
- Alternativa open-source possível (self-hosted Postgres)

❌ **Desvantagens**:
- Vendor lock-in (Supabase)
- Alternativa: Migrate para Postgres self-hosted ou Planetscale (MySQL)

### 8.6 Roadmap de Melhorias

| Prioridade | Melhoria | Impacto |
|-----------|---------|---------|
| 🔴 Alta | Webhook Telegram (substituir polling) | 📉 Latência -50%, ⬆️ Escalabilidade |
| 🔴 Alta | Multi-asset (mais stablecoins além USDC) | 💰 Maior liquidez |
| 🟠 Média | Integração Pix (liquidez BRL real) | 🇧🇷 Market fit Brasil |
| 🟠 Média | Mainnet (produção Stellar) | 🎯 Go-to-market |
| 🟠 Média | Mobile app nativa (iOS/Android) | 📱 Distribution |
| 🟡 Baixa | DEX integration (troca dentro do app) | 💱 Mais funcionalidades |
| 🟡 Baixa | Kubernetes deployment | 🚀 Enterprise-ready |

---

## 9. DEPENDÊNCIAS CRÍTICAS & VERSÕES

| Pacote | Versão | Propósito | Risk |
|--------|--------|----------|------|
| `express` | ^4.18 | HTTP server | Baixo |
| `stellar-sdk` | ^11.3 | Blockchain | Médio (atualizações raras) |
| `@simplewebauthn/server` | ^10.0 | WebAuthn | Baixo |
| `@simplewebauthn/browser` | ^10.0 | WebAuthn client | Baixo |
| `langchain` | ^0.1.x | Orchestration IA | Alto (evolução rápida) |
| `openai` | ^4.3 | GPT-4o API | Médio (mudanças de API) |
| `@supabase/supabase-js` | ^2.38 | Database client | Baixo |
| `next` | ^14.0 | Frontend | Baixo |
| `typescript` | ^5.x | Linguagem | Baixo |
| `jest` | ^29.x | Testing | Baixo |

---

## 10. Contato & Governance

**Tech Lead**: [Nome/Slack]  
**Last Updated**: Maio 2026  
**Review Cycle**: Trimestral  
**Approval**: CTO / Product Lead

---

**Este documento é uma fonte de verdade técnica viva. Atualize conforme novas decisões, aprendizados ou mudanças arquiteturais ocorram.**
