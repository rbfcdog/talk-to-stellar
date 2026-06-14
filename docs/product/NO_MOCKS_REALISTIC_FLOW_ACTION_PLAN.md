# Plano de remocao de mocks e experiencia realista

Data: 2026-05-23

Objetivo: reduzir ao maximo fluxos mockados no TalkToStellar e fazer a experiencia operar com providers reais ou sandboxes oficiais. Quando uma integracao real/sandbox oficial nao estiver configurada, o produto deve falhar de forma clara em vez de inventar sucesso, hash, PIX, payout ou comprovante.

## Regra de produto

Fluxo publico de usuario nao deve criar resultado fake.

Permitido:

- WhatsApp/Telegram reais.
- Etherfuse sandbox oficial.
- Stellar Testnet real.
- Mainnet apenas quando explicitamente habilitada e limitada.
- Provider adapters reais ou em modo de compatibilidade que preparem payload sem afirmar execucao bancária.
- Mocks em testes automatizados.

Nao permitido por padrao:

- PIX local fake.
- Hash `mock-stellar-*`.
- Funding `mock_pix_*`.
- Payout USD `mock`.
- Confirmacao manual que diz que o provider pagou quando o provider nao confirmou.

## Politica de runtime implementada

Arquivo:

```text
backend/src/config/mock-policy.ts
```

Flags:

```text
ALLOW_USER_FACING_MOCKS=false
ALLOW_OPS_MOCKS=false
ETHERFUSE_SANDBOX_PIX_FALLBACK=false
INTERNATIONAL_TRANSFER_ENABLE_MOCK_PIX=false
ALLOW_STELLAR_MOCK_SETTLEMENT=false
ALLOW_MOCK_USD_PAYOUTS=false
```

Default atual:

- mock de usuario: desligado;
- mock de operador: desligado fora de testes;
- fallback local PIX: desligado;
- settlement Stellar mock: desligado;
- payout USD mock: desligado.

Para liberar mock de operador conscientemente:

```text
ALLOW_OPS_MOCKS=true
INTERNATIONAL_TRANSFER_ENABLE_MOCK_PIX=true
ALLOW_STELLAR_MOCK_SETTLEMENT=true
ALLOW_MOCK_USD_PAYOUTS=true
```

Para liberar fallback local em tela de usuario, o que nao e recomendado:

```text
ALLOW_USER_FACING_MOCKS=true
ETHERFUSE_SANDBOX_PIX_FALLBACK=true
```

## Mudancas aplicadas nesta etapa

### 1. Fallback local de PIX desligado

Antes:

- se a Etherfuse sandbox falhasse por quote expirada, proxy/KYC ou conta PIX ausente, o backend podia criar um `sandbox-pix-*` local.

Agora:

- o fallback local so roda com `ALLOW_USER_FACING_MOCKS=true` e `ETHERFUSE_SANDBOX_PIX_FALLBACK=true`;
- se o provider nao criar a ordem, a tela recebe erro acionavel;
- a UI avisa quando um checkout antigo era `sandbox_mock`.

Arquivos:

```text
backend/src/api/services/anchor.service.ts
frontend/app/pix-ramp/pix-ramp-client.tsx
```

### 2. Mock PIX institucional bloqueado

Antes:

- a rail institucional podia criar `mock_pix_*` fora de producao por padrao.

Agora:

- `mock_pix_*` exige autorizacao interna no controller;
- exige `ALLOW_OPS_MOCKS=true`;
- exige `INTERNATIONAL_TRANSFER_ENABLE_MOCK_PIX=true`.

Arquivos:

```text
backend/src/api/controllers/international-transfers.controller.ts
backend/src/api/services/pix-funding.service.ts
frontend/app/international-transfer/international-transfer-client.tsx
```

### 3. Settlement Stellar mock bloqueado

Antes:

- se faltasse `STELLAR_SECRET_KEY` ou destino de off-ramp, o backend gerava `mock-stellar-*`;
- em mainnet sem `ENABLE_MAINNET_SETTLEMENT_VALIDATION`, tambem podia gerar evidencia mock.

Agora:

- sem segredo/destino configurado, falha fechado;
- mainnet exige `ENABLE_MAINNET_SETTLEMENT_VALIDATION=true`;
- mock settlement so existe com `ALLOW_OPS_MOCKS=true` e `ALLOW_STELLAR_MOCK_SETTLEMENT=true`.

Arquivo:

```text
backend/src/api/services/stellar-settlement.service.ts
```

### 4. Payout USD mock bloqueado

Antes:

- `PAYOUT_PROVIDER` default caia em `mock`.

Agora:

- default e `etherfuse`;
- `provider=mock` so executa com `ALLOW_OPS_MOCKS=true` e `ALLOW_MOCK_USD_PAYOUTS=true`;
- frontend nao mostra adapter mock sem `NEXT_PUBLIC_ALLOW_OPS_MOCKS=true`.

Arquivos:

```text
backend/src/api/services/international-transfer.service.ts
backend/src/api/services/usd-payout-adapters.ts
frontend/app/international-transfer/international-transfer-client.tsx
```

## Proximo plano de execucao

### Fase 1 - PIX on-ramp realista

Meta:

```text
chat -> link PIX -> Etherfuse quote/order oficial -> webhook/sandbox oficial -> Stellar Testnet real -> callback WhatsApp
```

Tarefas:

- remover dependencias restantes de `sandbox_mock` do fluxo publico;
- garantir que `simulate-fiat` so seja descrito como sandbox oficial;
- mostrar erro claro quando Etherfuse nao retorna QR/copia-e-cola;
- persistir provider IDs reais;
- garantir callback WhatsApp ao finalizar.

### Fase 2 - PIX off-ramp realista

Meta:

```text
saldo -> quote de retirada -> Etherfuse off-ramp oficial -> XDR/provider transaction -> submit real testnet -> comprovante
```

Tarefas:

- substituir `test-offramp` por fluxo normal `offramp` + `submit`;
- so usar endpoint temporario em `/ops`;
- exigir conta PIX real/sandbox oficial registrada no provider;
- exibir taxa do provider a partir da quote.

### Fase 3 - Stellar sem hash fake

Meta:

```text
qualquer operacao com blockchain mostra hash real ou fica pendente/falha
```

Tarefas:

- exigir `STELLAR_SECRET_KEY`;
- exigir destino configurado;
- validar issuer/asset antes de criar transferencia;
- remover `mock-stellar-*` de telas de usuario;
- adicionar teste para impedir hash mock em fluxo publico.

### Fase 4 - Payout internacional sem promessa falsa

Meta:

```text
USDC settled -> provider adapter payload -> pending provider status
```

Tarefas:

- manter `etherfuse`, `circle` e `bridge` como adapters;
- nao afirmar ACH/wire real sem `ENABLE_REAL_PAYOUT_EXECUTION=true`;
- se provider nao configurado, mostrar `provider payload prepared` ou erro, nao `completed`;
- esconder mock adapter do frontend publico.

### Fase 5 - Scan continuo

Comando para auditoria:

```bash
rg -n "mock|Mock|MOCK|fake|Fake|mock_pix|mock-stellar|sandbox_mock|no_real_money_moved" backend frontend telegram evolution docs sow \
  --glob '!**/node_modules/**' \
  --glob '!**/.next/**' \
  --glob '!**/dist/**'
```

Classificacao esperada:

- permitido: testes;
- permitido: docs;
- permitido com flag: `/ops`;
- proibido: rotas/telas de usuario.

## Configuracao recomendada agora

Backend:

```text
STELLAR_NETWORK=TESTNET
ETHERFUSE_BASE_URL=https://api.sand.etherfuse.com
ETHERFUSE_API_KEY=api_sand:...
ALLOW_USER_FACING_MOCKS=false
ALLOW_OPS_MOCKS=false
ETHERFUSE_SANDBOX_PIX_FALLBACK=false
INTERNATIONAL_TRANSFER_ENABLE_MOCK_PIX=false
ALLOW_STELLAR_MOCK_SETTLEMENT=false
ALLOW_MOCK_USD_PAYOUTS=false
PAYOUT_PROVIDER=etherfuse
```

Para settlement Stellar real testnet:

```text
STELLAR_SECRET_KEY=...
STELLAR_PUBLIC_KEY=...
USD_OFFRAMP_STELLAR_DESTINATION=...
USDC_ASSET_CODE=USDC
USDC_ASSET_ISSUER=...
```

Frontend:

```text
NEXT_PUBLIC_ALLOW_OPS_MOCKS=false
```

## Como avaliar se melhorou

O fluxo esta mais realista quando:

- nenhum usuario ve `mock_pix_*`;
- nenhum usuario ve `mock-stellar-*`;
- nenhum usuario recebe comprovante de uma operacao que nao teve provider/sandbox oficial ou Stellar real;
- falhas de provider aparecem como pendencia/erro claro;
- callbacks de WhatsApp continuam funcionando apos confirmacao real/sandbox oficial;
- docs e `/ops` continuam capazes de explicar o que ainda nao e producao.
