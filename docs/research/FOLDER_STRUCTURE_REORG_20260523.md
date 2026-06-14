# Backend API folder structure reorganization - 2026-05-23

Este documento registra a reorganizacao feita para deixar o backend mais consistente: codigo de aplicacao agora fica em `backend/src/api`, em vez de existir uma parte dentro de `api` e outra parte solta em `src/services`, `src/repositories` e `src/agent`.

## Regra do refactor

Nao remover comportamento nem cortar feature.

Foram preservados:

- suporte a Passkey/WebAuthn;
- suporte futuro/existente a moedas como EUR;
- suporte Stellar testnet/mainnet existente;
- integracoes Evolution/WhatsApp e Telegram existentes;
- interfaces atuais de controllers/routes.

## O que mudou

### 1. `agent` agora fica dentro de `api`

Antes:

```text
backend/src/agent/
```

Agora:

```text
backend/src/api/agent/
```

Arquivos movidos:

```text
graph.ts
routes.ts
tools.ts
types.ts
TODO.md
```

Motivo: o agente e exposto e orquestrado pela API (`/api/agent`), entao ele deve estar no namespace da API.

### 2. `repositories` agora ficam dentro de `api/repository/core`

Antes:

```text
backend/src/repositories/
```

Agora:

```text
backend/src/api/repository/core/
  agent.repository.ts
  external.repository.ts
  wallet.repository.ts
```

Motivo: esses repositories sao storage da aplicacao API, nao infraestrutura solta.

### 3. Services core agora ficam dentro de `api/services/core`

Antes:

```text
backend/src/services/
```

Agora:

```text
backend/src/api/services/core/
  external.service.ts
  idempotency.service.ts
  passkey.service.ts
  pin-reset.service.ts
  stellar.service.ts
  vault.service.ts
```

Motivo: eles sao services usados por controllers, agent e outros services da API. A pasta raiz `src/services` foi removida.

### 4. Services de dominio continuam organizados dentro de `api/services`

Antes da etapa anterior:


```text
backend/src/api/services/evolution.service.ts
backend/src/api/services/transfer-notification.service.ts
backend/src/api/services/payment-receipt.service.ts
backend/src/api/services/receipt-image.service.ts
backend/src/api/services/platform-fee.service.ts
backend/src/api/services/economy-engine.service.ts
```

Agora:

```text
backend/src/api/services/notifications/
  evolution.service.ts
  transfer-notification.service.ts
  index.ts

backend/src/api/services/receipts/
  payment-receipt.service.ts
  receipt-image.service.ts
  index.ts

backend/src/api/services/fees/
  platform-fee.service.ts
  economy-engine.service.ts
  index.ts
```

## Compatibilidade

Os arquivos antigos continuam existindo como facades:

```text
backend/src/api/services/evolution.service.ts
backend/src/api/services/transfer-notification.service.ts
backend/src/api/services/payment-receipt.service.ts
backend/src/api/services/receipt-image.service.ts
backend/src/api/services/platform-fee.service.ts
backend/src/api/services/economy-engine.service.ts
```

Eles apenas reexportam os services novos. Isso evita quebrar:

- imports existentes;
- mocks de Jest;
- controllers;
- agent tools;
- scripts;
- deploy atual.

## Estrutura atual esperada

```text
backend/src/
  app.ts
  server.ts
  api/
    agent/
    controllers/
    dtos/
    middlewares/
    repository/
      core/
    routes/
    services/
      core/
      fees/
      notifications/
      receipts/
  config/
  infrastructure/
  integrations/
  migrations/
  types/
  utils/
```

`config`, `utils`, `infrastructure`, `integrations`, `migrations` e `types` continuam fora de `api` porque sao cross-cutting, nao regras de API. O problema principal era ter services/repositories/agent duplicados dentro e fora de `api`; isso foi corrigido.

## Validacao feita

Build:

```bash
cd backend && npm run build
```

Resultado: OK.

Testes focados nos modulos movidos:

```bash
cd backend && npm test -- passkey.service.test.ts external-service.test.ts idempotency.service.test.ts agent-tools.test.ts agent-balance.test.ts agent-routes-telegram-identity.test.ts transfer-notification.service.test.ts evolution.service.test.ts payment-receipt.service.test.ts economy-engine.service.test.ts platform-fee.service.test.ts --runInBand
```

Resultado: 11 suites passaram, 62 testes passaram.

Suite completa:

```bash
cd backend && npm test -- --runInBand
```

Resultado: executou, mas ainda falha por dependencias e fixtures ja existentes fora deste refactor:

- testes E2E/API esperam servidor local em `127.0.0.1:3000`;
- testes de onboarding/wallet dependem de Friendbot/Stellar externo e mock Supabase sem `upsert`;
- testes de Stellar SDK usam fixtures antigas de destination/issuer;
- testes de SVG receipt esperam copy antiga que nao bate com o template atual.

Essas falhas nao vieram da reorganizacao de imports, porque o build e os testes focados dos caminhos movidos passaram.

## Proximo passo recomendado

Continuar a consolidacao:

1. Criar uma pasta `backend/src/api/services/ramp/` para separar Etherfuse/PIX de `anchor.service.ts`.
2. Criar `backend/src/api/agent/tools/` para dividir `api/agent/tools.ts`.
3. Criar `frontend/features/` para ir decompondo pages grandes sem mudar as rotas atuais.
4. Depois, migrar imports restantes para os novos `index.ts` de dominio quando fizer sentido.
