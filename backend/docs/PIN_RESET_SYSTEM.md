# PIN Reset System - Documentação Técnica

## Visão Geral

Sistema completo de redefinição de PIN temporário para usuários que esqueceram sua senha. O usuário pode solicitar um reset de PIN via agent de IA, receber um link temporário, e mudar o PIN em uma página dedicada.

## Componentes Implementados

### 1. Backend

#### Serviço: `PinResetService` (backend/src/services/pin-reset.service.ts)
Responsável por toda a lógica de gerenciamento de token de reset:

**Métodos principais:**
- `generateResetToken(userId, sessionId)` — Gera token temporário (válido por 15 min)
- `validateResetToken(resetToken, userId)` — Valida se token é válido
- `applyNewPin(resetToken, userId, newPinHash)` — Aplica novo PIN após validação
- `generatePinChangeJWT(userId, resetToken)` — Gera JWT para a página de mudança
- `verifyPinChangeJWT(token)` — Verifica JWT
- `cleanupExpiredTokens()` — Limpa tokens antigos (pode ser cron job)

**Segurança:**
- Tokens de 32 bytes (256 bits) gerados com `crypto.randomBytes()`
- Hash SHA-256 armazenado no banco (token real não salvo em claro)
- TTL de 15 minutos
- Tokens marcados como "used" após aplicação

#### Controlador: `PinResetController` (backend/src/api/controllers/pin-reset.controller.ts)
Implementa os endpoints HTTP:

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

**Validações:**
- PIN entre 4-8 caracteres
- PIN deve conter apenas números
- PIN novo deve coincidir com confirmação
- Token deve estar válido e não expirado

#### Tool do Agent: `reset_pin` (backend/src/agent/tools.ts)
Permite ao usuário solicitar reset via chat:

```typescript
{
  name: "reset_pin",
  description: "Request a PIN reset. Generates a temporary link to change your PIN if you forgot it.",
  parameters: {
    session_id: "string",
    user_id: "string"
  }
}
```

**Fluxo:**
1. Usuário digita no Telegram/WhatsApp: "esqueci meu PIN"
2. Agent detecta intenção e chama `reset_pin` tool
3. Backend gera link temporário
4. Agent responde com link clicável
5. Usuário abre link no navegador → página `/change-pin`

#### Router: `security.router.ts` (backend/src/api/routes/security.router.ts)
Registra as 3 rotas de segurança no Express app.

#### Migração: `backend/migrations/20260613_00_full_schema.sql`
Cria tabela `pin_reset_tokens` com:
- `id` (UUID PK)
- `user_id` (FK para auth.users)
- `session_id` (FK para sessions)
- `reset_token` (token em texto, único)
- `token_hash` (SHA-256, indexed)
- `created_at` (timestamp)
- `expires_at` (timestamp)
- `used_at` (timestamp, NULL até uso)
- `new_pin_hash` (PIN hash aplicado)

RLS habilitado para segurança.

### 2. Frontend

#### Página: `/change-pin` (frontend/stellar-chat/app/change-pin/page.tsx)

**Stages de Fluxo:**

1. **Verify** (Verificação)
   - Extrai `token` e `user_id` dos query params
   - Valida token com `/api/security/reset-pin-verify`
   - Spinner enquanto verifica

2. **Change** (Mudança)
   - Formulário com 2 campos:
     - "Novo PIN" (password input, apenas números)
     - "Confirmar PIN" (password input)
   - Validações client-side:
     - 4-8 caracteres
     - Apenas números
     - Campos coincidem
   - Submit para `/api/security/reset-pin-finalize`

3. **Success** (Sucesso)
   - Mostra checkmark verde
   - Mensagem: "PIN Alterado com Sucesso!"
   - Auto-redireciona para `/` após 3 segundos

4. **Error** (Erro)
   - Mensagem de erro clara
   - Botão "Voltar para Home"

#### Estilo: `page.module.css`
- Design responsivo
- Gradiente purple/blue
- Animações smooth
- Dark/light text contrast
- Mobile-friendly

### 3. URL Flow

**Exemplo completo de URL:**
```
https://app.talktosteller.com/change-pin?token=a1b2c3d4e5f6g7h8i9j0&user_id=550e8400-e29b-41d4-a716-446655440000
```

- `token` — Token de reset (32 bytes hex)
- `user_id` — UUID do usuário

## Como Usar

### Via Agent (Telegram/WhatsApp)

```
Usuário: "Esqueci meu PIN"
         ou
         "Resetar PIN"
         ou
         "Mudar PIN"

Agent: "Vou gerar um link para você redefinir seu PIN.
       O link é válido por 15 minutos.
       Clique aqui: [link]"

[Usuário clica no link]
→ Abre página /change-pin
→ Insere novo PIN
→ Clica "Confirmar"
→ PIN alterado com sucesso
```

### Via API Direta

```bash
# 1. Gerar token
curl -X POST http://localhost:3001/api/security/reset-pin-init \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "550e8400-e29b-41d4-a716-446655440000",
    "session_id": "550e8400-e29b-41d4-a716-446655440001"
  }'

Response:
{
  "success": true,
  "reset_url": "http://localhost:3000/change-pin?token=abc123&user_id=xxx",
  "expires_in_minutes": 15
}

# 2. Verificar token (opcional)
curl -X POST http://localhost:3001/api/security/reset-pin-verify \
  -H "Content-Type: application/json" \
  -d '{
    "token": "abc123",
    "user_id": "550e8400-e29b-41d4-a716-446655440000"
  }'

# 3. Finalizar com novo PIN
curl -X POST http://localhost:3001/api/security/reset-pin-finalize \
  -H "Content-Type: application/json" \
  -d '{
    "token": "abc123",
    "user_id": "550e8400-e29b-41d4-a716-446655440000",
    "new_pin": "5678"
  }'
```

## Limitações Atuais

✅ **Implementado:**
- Reset de PIN a qualquer momento (sem restrições)
- Link único por token
- Token válido por 15 minutos
- Interface limpa e responsiva
- Integração com agent LLM
- Segurança básica (hashing, expiry)

❌ **Não Implementado (Futuro):**
- Rate limiting (máximo de 3 resets por hora)
- Email de confirmação antes de mudar PIN
- Two-factor verification (enviar SMS/email code)
- Histórico de alterações de PIN
- Notificação ao usuário de mudança bem-sucedida
- Backup codes para recuperação de emergência

## Segurança

### Pontos Fortes
✅ Token único e criptograficamente seguro
✅ Hash SHA-256 do token armazenado
✅ TTL de 15 minutos apenas
✅ Tokens marcados como usados
✅ HTTPS obrigatório em produção
✅ CORS protegido
✅ RLS no banco de dados

### Considerações de Melhoria
⚠️ Rate limiting não implementado
⚠️ Sem notificação de suspeita (ex: múltiplos resets)
⚠️ Sem 2FA ou email de confirmação
⚠️ Sem logs detalhados de auditoria

## Variáveis de Ambiente

```env
# Necessárias:
FRONTEND_URL=https://app.talktosteller.com
JWT_SECRET=your-jwt-secret-key

# Opcionais:
PIN_SALT=your-pin-salt  # Default: 'salt'
PASSKEY_RP_ID=talktosteller.com
```

## Testes

### Manual
1. Abra Telegram e escreva "Esqueci meu PIN"
2. Copie o link recebido
3. Abra o link em navegador
4. Insira novo PIN (ex: 1234)
5. Confirme o mesmo PIN
6. Clique em "Confirmar Novo PIN"
7. Deve redirecionar para home

### Casos de Erro
- **Token expirado** → Erro: "Token expirado"
- **PIN muito curto** → Erro: "PIN deve ter entre 4 e 8 caracteres"
- **PIN não numérico** → Erro: "PIN deve conter apenas números"
- **PINs não coincidem** → Erro: "Os PINs não coincidem"
- **Token inválido** → Erro: "Token não encontrado ou já usado"

## Próximas Iterações

1. **Rate Limiting** — Máximo 3 resets por hora por usuário
2. **Email Confirmation** — Enviar email com link + código para mudar
3. **SMS Verification** — Enviar SMS com código (para WhatsApp users)
4. **Audit Log** — Registrar todas as mudanças de PIN
5. **Recovery Codes** — Gerar backup codes na criação de account
6. **Biometric Recovery** — Usar Passkey para confirmar identidade antes de reset

## Deployment

### Backend
1. Executar migration: `npm run migrate`
2. Redeploy backend (Docker)
3. Environment variables atualizadas

### Frontend
1. Build: `npm run build`
2. Deploy Next.js
3. `NEXT_PUBLIC_API_URL` apontado para novo backend

Não há breaking changes - sistema é 100% retrocompatível.
