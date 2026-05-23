# Folder structure reorganization - 2026-05-23

Esta e a primeira etapa de organizacao de pastas do TalkToStellar.

## Regra desta etapa

Nao remover comportamento.

Foram preservados:

- suporte a Passkey/WebAuthn;
- suporte futuro/existente a moedas como EUR;
- imports antigos usados por controllers, tests e agent tools.

## O que mudou

Alguns services foram movidos para pastas de dominio dentro de `backend/src/api/services`.

Antes:

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

## Proximo passo recomendado

Continuar com a mesma abordagem incremental:

1. Criar uma pasta `backend/src/api/services/ramp/` para separar Etherfuse/PIX de `anchor.service.ts`.
2. Criar uma pasta `backend/src/api/services/agent-tools/` ou `backend/src/agent/tools/` para dividir `agent/tools.ts`.
3. Criar `frontend/features/` para ir decompondo pages grandes sem mudar as rotas atuais.

Cada passo deve manter facade nos caminhos antigos ate todos os imports serem migrados com teste.
