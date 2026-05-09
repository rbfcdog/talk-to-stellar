# Fluxo de Onboarding com PIN e Passkey - Documentação Técnica

## Visão Geral

Sistema completo de onboarding com segurança via PIN (4-8 dígitos) e Passkey (biometria/face ID) opcional. O usuário pode:

1. **Iniciar onboarding** através de uma ferramenta LLM no agent
2. **Definir um PIN** para segurança básica
3. **Configurar Passkey** (biometria) para autenticação forte (opcional)

---

## Componentes

### 1. Backend - Agent Tool

#### Tool: `restart_onboarding` (backend/src/agent/tools.ts)

**Descrição:**
```
Restart the onboarding process. Allows user to set/reset PIN and passkey. 
Use when user explicitly wants to register or needs to set up security credentials.
```

**Parâmetros:**
```json
{
  "session_id": "current-session-uuid",
  "user_id": "existing-user-id-or-empty",
  "email": "user@example.com (optional)",
  "phone_number": "+55 11 99999-9999 (optional)",
  "pin": "1234 (required, 4-8 digits)",
  "request_passkey": true/false
}
```

**Response (Sucesso):**
```json
{
  "success": true,
  "user_id": "550e8400-e29b-41d4-a716-446655440000",
  "session_id": "550e8400-e29b-41d4-a716-446655440001",
  "public_key": "GDRJSYKLLAJB57DCGYAAH4XMFPURAI5VP6FI3VXE5SC2SEKCDGGZUZUP",
  "vault_secret_id": "xyz123...",
  "passkey_url": "http://localhost:3000/passkey-register?challenge_id=xyz&user_id=xxx",
  "pin_set": true,
  "message": "✓ PIN definido com sucesso\n✓ Sua conta está segura com o PIN ****\n✓ Próximo passo: Configure sua Passkey (biometria/face) para maior segurança\nAbra este link: http://localhost:3000/passkey-register?..."
}
```

**Response (Erro):**
```json
{
  "success": false,
  "error": "PIN deve ter entre 4 e 8 dígitos"
}
```

---

### 2. Backend - Services

#### PinResetService (backend/src/services/pin-reset.service.ts)

Gerencia tokens de redefinição de PIN temporários:

**Métodos:**
- `generateResetToken(userId, sessionId)` — Gera token de 15 minutos
- `validateResetToken(resetToken, userId)` — Valida token
- `applyNewPin(resetToken, userId, newPinHash)` — Aplica novo PIN

**Segurança:**
- Token: 32 bytes aleatórios (256 bits)
- Armazenado: Hash SHA-256 (nunca token em claro)
- TTL: 15 minutos
- Marcação: Token marcado como "used" após aplicação

#### PasskeyService (backend/src/services/passkey.service.ts)

Gerencia credenciais WebAuthn/Passkey:

**Métodos:**
- `generateRegistration(userId)` — Inicia registro de Passkey
- `verifyRegistration(userId, challengeId, credential)` — Completa registro
- `generateLoginAuthentication(userId)` — Inicia autenticação
- `verifyLoginAuthentication(userId, challengeId, credential)` — Completa autenticação
- `generateTransactionAuthentication(token, publicKey)` — Para confirmação de pagamento

---

### 3. Backend - Controllers & Routes

#### PinResetController (backend/src/api/controllers/pin-reset.controller.ts)

```
POST /api/security/reset-pin-init
  Body: { user_id, session_id }
  Response: { success, reset_url, expires_in_minutes, token }

POST /api/security/reset-pin-verify
  Body: { token, user_id }
  Response: { success, valid }

POST /api/security/reset-pin-finalize
  Body: { token, user_id, new_pin }
  Response: { success, message }
```

#### PasskeyController (backend/src/api/controllers/passkey.controller.ts)

```
POST /api/passkeys/register-init
  Body: { user_id } ou { token }
  Response: { success, userId, options, challenge_id }

POST /api/passkeys/register-complete
  Body: { user_id, challenge_id, credential }
  Response: { success, message }

POST /api/passkeys/auth-init
  Body: { user_id }
  Response: { success, options, challenge_id }

POST /api/passkeys/auth-complete
  Body: { user_id, challenge_id, credential }
  Response: { success, sessionToken }
```

---

## Fluxos de Usuário

### Fluxo 1: Novo Usuário se Registra

```
Telegram/WhatsApp:
User: "Quero me registrar"

Agent: "Ótimo! Vou criar sua conta de forma segura.
       Primeiro, escolha um PIN (4-8 dígitos) para proteger sua conta.
       Pode ser: 1234, 9876, 12345678, etc."

User: "Meu PIN é 5678"

Agent: [Chama tool restart_onboarding com pin=5678, request_passkey=false]

Response (sucesso):
✓ PIN definido com sucesso
✓ Sua conta está segura com o PIN ****
Você pode configurar uma Passkey depois se quiser.

Agent: "Sua conta foi criada com sucesso! 
       Seu ID é: 550e8400...
       Seu endereço Stellar (carteira): GDRJSYK...
       
       Agora você pode:
       • Receber dinheiro (envie seu endereço para alguém)
       • Adicionar contatos
       • Ver seu saldo
       • Enviar dinheiro para contatos"

[Fluxo de confirmação de pagamento:
 → Usuário tenta confirmar um pagamento
 → Sistema pede Passkey (se existe) ou PIN
 → Se nem Passkey nem PIN: oferece criar]
```

### Fluxo 2: Usuário Redefine PIN (Esqueceu)

```
Telegram/WhatsApp:
User: "Esqueci meu PIN"

Agent: [Chama tool reset_pin com session_id e user_id]

Response:
{
  "reset_url": "http://localhost:3000/change-pin?token=abc123&user_id=xxx",
  "expires_in_minutes": 15
}

Agent: "Clique no link para redefinir seu PIN (válido por 15 minutos):
       http://localhost:3000/change-pin?token=abc123&user_id=xxx"

[Usuário clica no link]
→ Frontend abre página /change-pin
→ Valida token
→ Formulário: Novo PIN + Confirmar PIN
→ Submit para /api/security/reset-pin-finalize
→ PIN atualizado com sucesso
→ Redireciona para home
```

### Fluxo 3: Usuário Configura Passkey Após Onboarding

```
Agent: "Quer configurar uma Passkey (biometria)? É mais seguro.
       Acesse: http://localhost:3000/passkey-register?challenge_id=xyz&user_id=abc"

[Usuário clica no link]
→ Frontend abre página /passkey-register
→ Solicita permissão do navegador para biometria/face
→ Usuário confirma com dedo ou face
→ Credencial salva no backend
→ Redireciona para home

[Próxima confirmação de pagamento]
→ Sistema pede autenticação
→ Oferece: Passkey (prioridade) ou PIN
→ Usuário escolhe Passkey
→ Biometria solicitada
→ Pagamento confirmado
```

---

## Validações Implementadas

### PIN
- ✅ Entre 4-8 caracteres
- ✅ Apenas números (0-9)
- ✅ Hash PBKDF2-SHA256 (100.000 iterações)
- ✅ Nunca armazenado em claro

### Reset Token
- ✅ 32 bytes aleatórios (criptograficamente seguro)
- ✅ Hash SHA-256 armazenado
- ✅ Expira em 15 minutos
- ✅ Marcado como "used" após aplicação
- ✅ Uso único (não pode ser reutilizado)

### Passkey
- ✅ Baseado em WebAuthn (W3C standard)
- ✅ Suporta Biometria (Face ID, Touch ID)
- ✅ Suporta PIN do dispositivo
- ✅ Suporta Security Keys (Yubikey, etc)
- ✅ Resistente a phishing (origin/RP ID vinculado)

---

## Segurança

### Pontos Fortes
✅ PIN criptografado com PBKDF2-SHA256 (100k iterações)
✅ Tokens únicos e de curta vida (15 min)
✅ Passkey/WebAuthn resistente a phishing
✅ HTTPS obrigatório em produção
✅ RLS (Row-Level Security) no banco de dados
✅ CORS protegido
✅ Audit log de operações

### Limitações Atuais
⚠️ Sem rate limiting (próxima versão)
⚠️ Sem email de confirmação (futuro)
⚠️ Sem 2FA (considerar para pagamentos altos)

---

## Instruções para o LLM Agent

### Prompts Recomendados

**1. Novo Usuário Quer se Registrar:**
```
User: "Quero me registrar"

Agent Response:
"Bem-vindo ao TalkToStellar! 🎉

Para criar sua conta de forma segura, precisamos configurar:
1. Um PIN (4-8 dígitos) para proteger sua conta
2. Opcionalmente: Uma Passkey (biometria) para mais segurança

Qual PIN você escolhe? (ex: 1234, 5678, 12345678)"

[Quando usuário responde com PIN]

"Ótimo! Vou criar sua conta com segurança..."

[Chama tool: restart_onboarding]

"✓ Sua conta foi criada!
✓ PIN configurado com sucesso
✓ Seu endereço Stellar: GDRJSYK...

Agora você pode:
• Ver seu saldo: 'saldo' ou 'quanto tenho?'
• Adicionar contatos: 'adicionar contato João'
• Enviar dinheiro: 'enviar 50 XLM para João'

Quer configurar uma Passkey (biometria) agora? [link]"
```

**2. Usuário Esqueceu PIN:**
```
User: "Esqueci meu PIN"

Agent Response:
"Sem problema! Vou gerar um link para você redefinir o PIN.
O link é válido por 15 minutos."

[Chama tool: reset_pin]

"Clique aqui para mudar seu PIN:
[link com token]

Ou digite o novo PIN aqui e eu gero o link especial para você."
```

**3. Passkey Durante Confirmação de Pagamento:**
```
[Sistema detecta que usuário não tem Passkey ou PIN]

Agent Response:
"Para confirmar este pagamento de forma segura, você precisa:
• Uma Passkey (biometria) - RECOMENDADO
• OU um PIN (4-8 dígitos)

Qual você prefere? Digite seu PIN ou abra o link de Passkey:
[passkey link]"
```

---

## Variáveis de Ambiente

```env
# Obrigatórias
FRONTEND_URL=https://app.talktosteller.com
JWT_SECRET=your-jwt-secret-key
PASSKEY_RP_ID=talktosteller.com

# Opcionais
PIN_SALT=your-salt-key
DATABASE_URL=postgresql://...
```

---

## Testando Localmente

### 1. Via Telegram/WhatsApp
```
1. Envie: "Quero me registrar"
2. Responda com PIN: "5678"
3. Receba: Conta criada, endereço Stellar
4. Receba: Link para Passkey (se disponível)
```

### 2. Via API Direta

#### Criar conta com PIN:
```bash
curl -X POST http://localhost:3001/api/agent/call-tool \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer eyJhbGc..." \
  -d '{
    "tool_name": "restart_onboarding",
    "parameters": {
      "session_id": "550e8400-e29b-41d4-a716-446655440001",
      "pin": "5678",
      "request_passkey": false
    }
  }'
```

#### Redefinir PIN:
```bash
curl -X POST http://localhost:3001/api/security/reset-pin-init \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "550e8400-e29b-41d4-a716-446655440000",
    "session_id": "550e8400-e29b-41d4-a716-446655440001"
  }'
```

#### Finalizar redefinição de PIN:
```bash
curl -X POST http://localhost:3001/api/security/reset-pin-finalize \
  -H "Content-Type: application/json" \
  -d '{
    "token": "abc123def456...",
    "user_id": "550e8400-e29b-41d4-a716-446655440000",
    "new_pin": "9876"
  }'
```

---

## Schema do Banco de Dados

### Tabela: agent_sessions
```sql
- session_id (UUID, PK)
- user_id (UUID, FK)
- session_password_hash (VARCHAR) -- PIN hash
- email (VARCHAR)
- phone_number (VARCHAR)
- public_key (VARCHAR)
- session_token (UUID)
- created_at (TIMESTAMP)
- updated_at (TIMESTAMP)
```

### Tabela: pin_reset_tokens
```sql
- id (UUID, PK)
- user_id (UUID, FK)
- session_id (UUID, FK)
- reset_token (VARCHAR) -- Token único
- token_hash (VARCHAR) -- Hash SHA-256
- created_at (TIMESTAMP)
- expires_at (TIMESTAMP)
- used_at (TIMESTAMP, nullable)
- new_pin_hash (VARCHAR, nullable)
```

### Tabela: passkeys
```sql
- id (UUID, PK)
- user_id (UUID, FK)
- credential_id (BYTEA)
- public_key (BYTEA)
- sign_count (INTEGER)
- transports (VARCHAR[])
- created_at (TIMESTAMP)
- updated_at (TIMESTAMP)
```

---

## Próximas Iterações

1. **Rate Limiting** — Máximo 3 tentativas de PIN por hora
2. **Backup Codes** — Códigos de recuperação de emergência
3. **2FA** — Two-factor authentication para pagamentos altos
4. **Email Verification** — Confirmação por email antes de reset
5. **SMS Verification** — Código via SMS para WhatsApp users
6. **Audit Log Completo** — Histórico detalhado de mudanças

---

## Suporte e Troubleshooting

### Problema: PIN inválido após criar conta
**Solução:** PIN deve ter 4-8 dígitos numéricos. Verifique se foi digitado corretamente.

### Problema: Link de reset de PIN expirado
**Solução:** Links expiram após 15 minutos. Solicite um novo link digitando novamente.

### Problema: Passkey não funciona no dispositivo
**Solução:** Passkey requer navegador moderno (Chrome 90+, Safari 14+, Edge 90+). Algumas máquinas virtuais podem não suportar.

### Problema: Token de Passkey inválido
**Solução:** Desabilite bloqueadores de script ou extensões de navegador e tente novamente.

---

## Contato e Issues

Para bugs ou dúvidas, abra uma issue no repositório ou contacte o time de desenvolvimento.
