# TalkToStellar

TalkToStellar é uma carteira conversacional construída sobre Stellar.
O usuário conversa em linguagem natural (Web ou Telegram) para consultar saldo, gerenciar contatos e confirmar pagamentos.

## Descrição completa do projeto (business + técnico)

TalkToStellar resolve um problema central de produtos cripto: a fricção de uso.
Em vez de exigir que o usuário entenda detalhes de blockchain, o produto traduz intenção em ação com um fluxo conversacional.

Exemplo prático: em vez de navegar por múltiplas telas para enviar valor, o usuário pode confirmar uma operação por mensagem e PIN.
Isso reduz abandono, acelera onboarding e melhora conversão em primeira transação.

No nível de negócio, o projeto posiciona Stellar como infraestrutura de liquidação e a camada de conversa como diferencial de experiência.
No nível técnico, ele organiza frontend, backend e canais externos (Telegram) em uma arquitetura orientada a fluxos seguros de identidade e autorização.

## Visão de negócio

### Problema que atacamos

- UX de carteiras e pagamentos digitais ainda é complexa para público geral.
- Onboarding tradicional tende a ter queda antes do primeiro pagamento.
- Recuperação de acesso (PIN/credenciais) costuma ser frágil e gerar suporte alto.
- Canais de relacionamento (mensageria) e motor transacional normalmente ficam separados.

### Proposta de valor

- Conversa como interface principal para operações financeiras.
- Menos passos para completar tarefas críticas (criar conta, resetar PIN, confirmar pagamento).
- Segurança por PIN e sessões controladas, sem exigir conhecimento técnico do usuário.
- Operação omnicanal (web + Telegram) com continuidade de contexto.

### Público-alvo

- Usuários finais que querem enviar/receber com simplicidade.
- PMEs e profissionais que precisam de fluxo rápido de pagamentos recorrentes.
- Times que desejam integrar uma camada conversacional sobre trilhos de pagamento.

### Métricas de produto sugeridas

- Taxa de onboarding concluído.
- Tempo até primeira transação.
- Taxa de sucesso de confirmação de pagamento.
- Taxa de recuperação de conta/PIN.
- Retenção por canal (web vs Telegram).

## Escopo funcional atual

- Chat com assistente para operações de carteira.
- Onboarding por link seguro (`/create-account`).
- Redefinição de PIN (`/change-pin`).
- Confirmação de pagamento por link (`/confirm-payment`) com validação de PIN.
- Integração com Telegram para atendimento e notificações transacionais.
- Geração de links seguros no backend para onboarding e confirmação.

## Arquitetura (visão prática)

### 1) Frontend (`frontend/`)

Aplicação Next.js com:

- Landing page
- Chat web
- Fluxos de onboarding, reset de PIN e confirmação de pagamento
- Rota proxy para chat em `app/api/chat/route.ts`

### 2) Backend (`backend/`)

API Node.js/TypeScript responsável por:

- Sessão e identidade (`agent_sessions`, `external_accounts`)
- Lógica de pagamentos Stellar
- Geração/validação de links de onboarding e confirmação
- PIN reset e segurança
- Execução do agente e ferramentas

### 3) Bot Telegram (`telegram/`)

Adaptador do Telegram que:

- Valida conta externa
- Encaminha mensagens para o backend
- Mantém sessão por usuário Telegram

## Arquitetura técnica detalhada

### Camadas e responsabilidades

1. Canal/UI:
- Frontend web renderiza jornadas de onboarding, confirmação de pagamento e reset de PIN.
- Telegram atua como canal de entrada conversacional.

2. Orquestração:
- Backend centraliza sessão, identidade externa, validações e regras de autorização.
- Ferramentas do agente executam operações de negócio com contexto de sessão.

3. Liquidação:
- Serviços Stellar constroem e submetem operações na rede.
- Operações e auditoria ficam registradas para rastreabilidade.

### Modelo de identidade e sessão

- `agent_sessions`: estado de sessão do usuário.
- `external_accounts`: vínculo entre identidade externa (ex: Telegram `provider_user_id`) e sessão interna.
- PIN armazenado como hash (`session_password_hash` e compatibilidade com `password_hash`).

### Segurança aplicada nos fluxos

- Links assinados para onboarding e confirmação.
- Validação de expiração e payload dos tokens.
- Confirmação de pagamento protegida por PIN.
- Reset de PIN com token temporário e invalidação de uso.
- Logs de auditoria para eventos críticos.

### Fluxo de pagamento confirmado (resumo técnico)

1. Backend cria token de confirmação com payload de pagamento.
2. Frontend abre `/confirm-payment` via link assinado.
3. Usuário informa PIN.
4. Backend valida PIN contra sessão.
5. Backend constrói/submete transação Stellar.
6. Backend responde hash da transação e pode notificar Telegram.

### Fluxo de reset de PIN (resumo técnico)

1. Usuário solicita reset.
2. Backend gera token curto e URL de mudança.
3. Frontend valida token e coleta novo PIN.
4. Backend aplica hash novo na sessão e marca token como usado.

## Fluxos principais do produto

### Onboarding

1. Usuário recebe link de criação de conta.
2. Finaliza dados em `/create-account`.
3. Sessão/carteira ficam ativas para uso no chat.

### Reset de PIN

1. Usuário pede redefinição.
2. Backend gera link temporário.
3. Usuário define novo PIN em `/change-pin`.

### Confirmação de pagamento

1. Backend gera link de confirmação.
2. Usuário revisa dados em `/confirm-payment`.
3. Confirma com PIN.
4. Pagamento é submetido e pode disparar mensagem no Telegram.

## Operação e deploy

### Ambientes

- Local: execução com `start-local.sh`.
- Containerizado: `docker-compose`.
- Produção: recomendado separar frontend, backend e bot por serviço.

### Dependências externas

- Stellar (rede e Horizon).
- Supabase/Postgres para persistência.
- OpenAI para inteligência conversacional.
- Telegram Bot API para canal e notificações.

### Observabilidade mínima recomendada

- Log estruturado por `session_id`.
- Monitoramento de falha em `check-account` e confirmação de pagamento.
- Alertas para erros em finalização de PIN e assinatura/submissão na Stellar.

## Como rodar localmente

Pré-requisitos:

- Node.js 18+
- npm

### Subida completa (recomendado)

```bash
chmod +x start-local.sh
./start-local.sh
```

Serviços:

- Frontend: `http://localhost:3000`
- Backend: `http://localhost:3001`

### Docker Compose

```bash
docker-compose up --build
```

## Estrutura do repositório

```text
talk-to-stellar/
├── backend/          # API e lógica de negócio
├── frontend/         # Next.js app (chat + fluxos)
├── telegram/         # Bot Telegram
├── docker-compose.yml
└── start-local.sh
```

## Notas de operação

- O backend precisa das variáveis de ambiente de Stellar, Supabase e OpenAI.
- O bot Telegram precisa de `TELEGRAM_BOT_TOKEN`.
- Para confirmação de pagamento com PIN, garanta que o schema tenha `session_password_hash` em `agent_sessions`.
- Se houver migração de schema, rode as migrations antes de testar fluxos de segurança.
