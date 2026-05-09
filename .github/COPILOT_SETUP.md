# GitHub Copilot Instructions - TalkToStellar

Este arquivo permite que o GitHub Copilot carregue contexto e guidelines automaticamente quando trabalhar neste repositório.

## Opções de Localização

### Opção 1: Copilot Instructions Global (Recomendado)
**Arquivo:** `.github/copilot-instructions.md`

- Carrega automaticamente para TODA conversa neste repo
- GitHub Copilot lê este arquivo antes de responder
- Aplica às conversas de Chat e Inline Chat
- Best practice para guidelines gerais do projeto

### Opção 2: Instruções por Tipo de Arquivo
**Arquivos:** `.github/instructions/*.instructions.md`

Exemplo:
- `.github/instructions/backend.instructions.md` → Para `backend/**` files
- `.github/instructions/frontend.instructions.md` → Para `frontend/**` files
- `.github/instructions/agent.instructions.md` → Para `backend/src/agent/**` files

## Como Usar

### Setup Rápido
```bash
# Crie a pasta
mkdir -p .github/instructions

# Copie as guidelines
cp backend/src/agent/TODO.md .github/copilot-instructions.md
```

Ou manualmente:
```bash
# Arquivo global (simples)
cat > .github/copilot-instructions.md << 'EOF'
# TalkToStellar Guidelines

## Writing Guidelines
- Always respond in Portuguese (Brazilian Portuguese preferred).
- Do not use emojis in responses.
- Be direct, clear, and concise when possible.
...
EOF
```

### Conteúdo Recomendado para `.github/copilot-instructions.md`

```markdown
# TalkToStellar - Copilot Guidelines

## Project Overview
- Backend: Node.js + TypeScript, Express, Supabase, LangChain
- Frontend: Next.js 14 (app router), React
- External Adapters: Telegram, Whatsapp (via Twilio)
- Core Service: Stellar Blockchain Payments

## Writing Standards

### Portuguese Communication
- Always respond in Brazilian Portuguese (pt-BR).
- No emojis in technical responses.
- Be concise and action-oriented.

### Code Style
- Use TypeScript with strict mode.
- Follow existing directory structure.
- Document complex functions with JSDoc.

### Security
- Never commit .env or secrets.
- Use Supabase Vault for private key storage.
- Validate JWT tokens server-side.

## Common Tasks

### Adding a New Agent Tool
1. Define tool schema in `backend/src/agent/tools.ts`
2. Add executor function using `executeTool()`
3. Register in `ALL_TOOLS` array
4. Add to system prompt documentation

### Backend API Endpoints
- Agent queries: `POST /api/agent/query`
- External onboarding: `POST /api/external/finalize`
- Session info: `GET /api/agent/session/:session_id`

### Troubleshooting
- Telegram ETIMEDOUT: Force IPv4 with `https.Agent({ family: 4 })`
- Vault errors: Run migration setup in Supabase SQL Editor
- CSS 404: Restart Next.js dev server

---
*Auto-loaded by GitHub Copilot for this repository*
```

## Verificação

Depois de criar o arquivo:
1. Feche e abra o VS Code
2. Chat do Copilot verá o arquivo automaticamente
3. Copilot incluirá contexto nas respostas

## Alternativa: SKILL.md para This Agent

Se quiser criar um SKILL.md customizado para este projeto (para **este agent** especificamente):

```bash
mkdir -p .vscode/instructions
cat > .vscode/instructions/stellar-backend.md << 'EOF'
---
description: "Guidelines for TalkToStellar backend development"
---

# Backend Development Guidelines
...
EOF
```

---

**Resumo**:
- ✅ **Rápido**: Crie `.github/copilot-instructions.md`
- ✅ **Auto-loaded**: Sem config, Copilot lê automaticamente
- ✅ **Versioned**: Fica no Git, toda equipe usa
- 🔧 **Avançado**: Use `.vscode/instructions/*.md` para mais granularidade
