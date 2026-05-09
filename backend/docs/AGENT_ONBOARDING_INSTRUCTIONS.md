# Instruções para Agent LLM - Ferramenta restart_onboarding

## Overview

A ferramenta `restart_onboarding` permite que usuários se registrem, definam PIN e configurem Passkey através do chat (Telegram, WhatsApp, etc).

---

## Quando Usar Esta Ferramenta

### ✅ USE `restart_onboarding` quando:

1. **Usuário quer se registrar**
   - "Quero me registrar"
   - "Cria minha conta"
   - "Como me cadastro?"
   - "Preciso de uma carteira"

2. **Usuário quer definir/resetar PIN**
   - "Defina meu PIN"
   - "Quero um PIN novo"
   - "Mude meu PIN para 5678"
   - "Quer fazer reset do PIN?"

3. **Usuário quer Passkey**
   - "Configure biometria para mim"
   - "Quero Face ID / Touch ID"
   - "Quer usar Passkey?"
   - Após confirmação de pagamento sem Passkey

---

## Fluxo Conversacional

### Cenário 1: Novo Usuário Se Registra

```
User: "Quero me registrar"

Agent: "Bem-vindo! 🎉 Para criar sua conta no TalkToStellar de forma segura, 
       precisamos configurar:
       
       1️⃣  Um PIN (4-8 dígitos) para proteger sua conta
       2️⃣  Opcionalmente: Passkey (biometria/Face ID) para mais segurança
       
       Qual PIN você escolhe? Pode ser algo simples como:
       • 1234 (fácil de lembrar)
       • 9876 (seu preferido)
       • 12345678 (mais seguro)
       
       Apenas números, entre 4-8 dígitos!"

User: "Meu PIN é 5678"

Agent: [Chama tool: restart_onboarding com pin="5678", request_passkey=true]

Agent: "✓ Sua conta foi criada com sucesso!
       ✓ PIN configurado: ****
       
       Dados da sua carteira:
       • ID: 550e8400-e29b-41d4-a716-446655440000
       • Endereço Stellar: GDRJSYK...
       • Saldo inicial: 100 XLM
       
       🔐 Quer configurar Passkey (biometria) agora? É mais seguro!
       Abra este link: [link para passkey]
       
       Agora você pode:
       📍 Ver seu saldo
       💬 Adicionar contatos
       💸 Enviar dinheiro
       
       Como posso ajudar?"
```

### Cenário 2: Usuário Esqueceu PIN

```
User: "Esqueci meu PIN"

Agent: "Sem problema! Vou gerar um link seguro para você redefinir o PIN.
       O link é válido por 15 minutos apenas.
       
       [Chama tool: reset_pin com session_id e user_id]
       
       Clique aqui para redefinir seu PIN:
       http://localhost:3000/change-pin?token=abc123&user_id=xxx
       
       Instruções:
       1. Clique no link acima
       2. Digite seu novo PIN (4-8 dígitos)
       3. Confirme o PIN digitando novamente
       4. Clique em 'Confirmar'
       
       ⏰ Válido por 15 minutos. Se expirar, peça outro link."

User: "Link expirou"

Agent: "Sem problema! Vou gerar um novo link para você."
[Chama tool: reset_pin novamente]
```

### Cenário 3: Confirmação de Pagamento sem Passkey

```
[User confirma pagamento]

System: Sem Passkey ou PIN

Agent: "Para confirmar este pagamento de forma segura, você precisa:
       
       🔐 Opção 1: Passkey (biometria) - RECOMENDADO ⭐
       ✅ Mais seguro
       ✅ Mais rápido
       ✅ Funciona com Face ID / Touch ID
       
       🔢 Opção 2: PIN (4-8 dígitos)
       ✅ Funciona em qualquer dispositivo
       ✅ Pode usar também
       
       Qual você prefere?
       • 'Passkey' → [link]
       • 'PIN: 1234' → [valida PIN]"

User: "Passkey"

Agent: "Ótimo! Abra este link para configurar sua Passkey (biometria):
       http://localhost:3000/passkey-register?challenge_id=xyz&user_id=abc
       
       Instruções:
       1. Clique no link
       2. Browser pedirá permissão para usar biometria
       3. Use seu dedo (Touch ID) ou rosto (Face ID)
       4. Confirme
       
       Depois você consegue confirmar pagamentos com um dedo! 👆"
```

---

## Parâmetros da Ferramenta

### restart_onboarding

```json
{
  "session_id": "atual-session-uuid",           // ✅ OBRIGATÓRIO
  "user_id": "existing-user-id",                // ❌ Opcional (se vazio, cria novo)
  "pin": "1234",                                // ✅ OBRIGATÓRIO (4-8 dígitos)
  "email": "user@example.com",                  // ❌ Opcional
  "phone_number": "+55 11 99999-9999",          // ❌ Opcional
  "request_passkey": true                       // ❌ Opcional (default: false)
}
```

### reset_pin

```json
{
  "session_id": "atual-session-uuid",           // ✅ OBRIGATÓRIO
  "user_id": "existing-user-id"                 // ✅ OBRIGATÓRIO
}
```

---

## Response Esperado

### Sucesso (restart_onboarding)

```json
{
  "success": true,
  "user_id": "550e8400-e29b-41d4-a716-446655440000",
  "session_id": "550e8400-e29b-41d4-a716-446655440001",
  "public_key": "GDRJSYKLLAJB57DCGYAAH4XMFPURAI5VP6FI3VXE5SC2SEKCDGGZUZUP",
  "vault_secret_id": "vault-uuid-123...",
  "passkey_url": "http://localhost:3000/passkey-register?challenge_id=xyz&user_id=abc",
  "pin_set": true,
  "message": "✓ PIN definido com sucesso\n✓ Sua conta está segura..."
}
```

Extrair do response:
- ✅ `user_id` — Guardar para próximas operações
- ✅ `public_key` — Mostrar ao usuário (endereço Stellar)
- ✅ `passkey_url` — Ofertar se `request_passkey=true`
- ✅ `message` — Mostrar ao usuário

### Erro (restart_onboarding)

```json
{
  "success": false,
  "error": "PIN deve ter entre 4 e 8 dígitos"
}
```

Possíveis erros:
- "PIN deve ter entre 4 e 8 dígitos"
- "PIN deve conter apenas números"
- "Failed to create new user: [motivo]"
- "Failed to save PIN: [motivo]"

---

## Estratégia de Detecção de Intenção

### Padrões de Texto

```python
ONBOARDING_KEYWORDS = [
    "registrar", "cadastro", "conta", "criar", "novo",
    "inscri", "me cadastr", "como funciona", "começa",
    "quer usar", "começar", "primeiro passo",
]

PIN_RESET_KEYWORDS = [
    "esqueç", "pin", "senha", "mudar pin", "novo pin",
    "alterar", "resetar", "change", "redefinir",
]

PASSKEY_KEYWORDS = [
    "passkey", "biometri", "face id", "touch id", "segurança",
    "validar", "confirmar", "autenticação", "mais seguro",
]
```

### Contexto

**Se usuário é NEW ou SEM SESSION:**
→ Ofereça onboarding

**Se usuário ESQUECEU PIN:**
→ Ofereça reset_pin

**Se confirmação de pagamento SEM PASSKEY:**
→ Ofereça setup de Passkey

---

## Erros Comuns e Soluções

### Erro 1: User digita "Quero PIN 1234"
```
❌ ERRADO: Não chame tool automaticamente
✅ CORRETO: Confirme primeiro

Agent: "Você quer usar 1234 como PIN?
       ⚠️ Cuidado: 1234 é muito comum!
       
       Recomendo algo mais único, como:
       • 7829 (aleatório)
       • 5678 (seu preferido)
       
       Confirma com 1234 ou quer outro?"
```

### Erro 2: User digita PIN muito curto "12"
```
✅ CORRETO: Valide no cliente

Agent: "PIN deve ter entre 4 e 8 dígitos.
       Você digitou: 12 (muito curto!)
       
       Tente novamente:
       • 1234 (4 dígitos - mínimo)
       • 12345 (5 dígitos)
       • 123456 (6 dígitos)
       • Etc até 8 dígitos"
```

### Erro 3: User digita PIN com letras "pin123"
```
✅ CORRETO: Rejeite e peça novamente

Agent: "PIN deve conter APENAS números (0-9).
       Você digitou: pin123 (tem letras!)
       
       Exemplos válidos:
       • 1234
       • 5678
       • 9876543
       • 12345678
       
       Qual PIN você escolhe?"
```

### Erro 4: Link de Passkey não funciona
```
Agent: "Link de Passkey pode não funcionar se:
       
       1. ❌ Navegador muito antigo
          → Atualize para Chrome 90+, Safari 14+, Edge 90+
       
       2. ❌ Máquina virtual sem biometria
          → Use um dispositivo real com Touch ID / Face ID
       
       3. ❌ Extensão de navegador bloqueando
          → Desabilite e tente novamente
       
       Quer tentar novamente ou usar PIN apenas?"
```

---

## Fluxo de Segurança

### Validações Automáticas

```
1. PIN Format Validation
   ✅ Comprimento: 4-8 caracteres
   ✅ Tipo: Apenas números
   ✅ Sem espaços: Trim e valide

2. User Validation
   ✅ session_id deve ser válido
   ✅ user_id pode ser vazio (novo user)
   ✅ Se existente, verificar permissões

3. Post-Onboarding
   ✅ PIN hash salvo (nunca em claro)
   ✅ Wallet criado e financiado
   ✅ Starter contacts seeded
   ✅ Session atualizado
```

---

## Exemplos de Código

### Chamada da Ferramenta

```json
{
  "tool_name": "restart_onboarding",
  "parameters": {
    "session_id": "550e8400-e29b-41d4-a716-446655440001",
    "pin": "5678",
    "request_passkey": true,
    "email": "usuario@example.com",
    "phone_number": "+5511999999999"
  }
}
```

### Resposta Processada

```typescript
const response = {
  success: true,
  user_id: "550e8400-e29b-41d4-a716-446655440000",
  public_key: "GDRJSYKLLAJB57DCGYAAH4XMFPURAI5VP6FI3VXE5SC2SEKCDGGZUZUP"
};

// Guardar para próximas operações
state.userId = response.user_id;
state.publicKey = response.public_key;

// Mostrar ao usuário
message = `Sua carteira foi criada! ${response.public_key}`;
```

---

## Tips and Tricks

### ✅ Dicas para Melhor UX

1. **Confirme Antes de Chamar Tool**
   - "Você digitou PIN 5678. Confirma?"
   - Assim user pode corrigir erros

2. **Mostre o PIN Mascarado**
   - "PIN configurado: ****"
   - Nunca repita o PIN em claro

3. **Ofereça Alternativas**
   - "PIN ou Passkey?"
   - "Use qual você preferir"

4. **Explique Benefícios**
   - "Passkey é mais seguro e rápido"
   - "PIN é simples e funciona em tudo"

5. **Trate Erros Gracefully**
   - "PIN muito curto, precisa 4-8 dígitos"
   - Não blame o user

6. **Forneça URLs Clicáveis**
   - Use markdown: `[Clique aqui para Passkey](url)`
   - Ou: `http://link...`

---

## Checklist de Implementação

- [ ] Tool `restart_onboarding` implementada
- [ ] Tool `reset_pin` implementada
- [ ] System prompt do agent atualizado
- [ ] Agent detecta keywords de onboarding
- [ ] Agent confirma antes de chamar tool
- [ ] Responses mapeadas corretamente
- [ ] Erros tratados e mensagens claras
- [ ] URLs de Passkey oferecidas
- [ ] Testes em Telegram/WhatsApp
- [ ] Documentação atualizada

---

## Próximos Passos

1. **Adicionar Rate Limiting**
   - Max 3 resets/hora por user
   - Max 10 tentativas de PIN por token

2. **Adicionar Email Confirmation**
   - Enviar email "PIN foi alterado"
   - Link para revogar reset se necessário

3. **Adicionar Audit Log**
   - Registrar todas as tentativas (sucesso/falha)
   - Timestamp, IP, device info

4. **Metricas**
   - % de users com Passkey
   - % de PIN resets bem-sucedidos
   - Tempo médio de onboarding

---

## Suporte

Para dúvidas ou issues:
1. Consulte `ONBOARDING_AND_PIN_FLOW.md`
2. Verifique `PIN_RESET_ANALYSIS.md`
3. Abra issue no repositório
4. Contacte o time de desenvolvimento

---

**Versão:** 1.0
**Última atualização:** Maio 2026
**Status:** ✅ Pronto para Uso
