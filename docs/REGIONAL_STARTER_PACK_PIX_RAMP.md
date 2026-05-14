# TalkToStellar PIX/TESOURO Ramp

Este guia descreve a integracao do TalkToStellar com o Etherfuse sandbox usando o codigo portavel do `sandbox/regional-starter-pack`.

## Objetivo

Conectar wallets TalkToStellar ao fluxo regional de on-ramp e off-ramp:

- On-ramp: `BRL` via `PIX` para `TESOURO` na Stellar testnet/devnet.
- Off-ramp: `TESOURO` na Stellar para `BRL` via `PIX`.
- Customer, KYC e registro de conta PIX acontecem no fluxo hospedado da Etherfuse.
- A API key fica somente no backend.

## Codigo Reutilizado

O codigo portado veio destes arquivos do regional starter pack:

- `sandbox/regional-starter-pack/src/lib/anchors/types.ts`
- `sandbox/regional-starter-pack/src/lib/anchors/etherfuse/client.ts`
- `sandbox/regional-starter-pack/src/lib/anchors/etherfuse/types.ts`
- `sandbox/regional-starter-pack/src/lib/anchors/etherfuse/index.ts`

No TalkToStellar, eles ficam em:

- `backend/src/integrations/regional-starter-pack/anchors/types.ts`
- `backend/src/integrations/regional-starter-pack/anchors/etherfuse/client.ts`
- `backend/src/integrations/regional-starter-pack/anchors/etherfuse/types.ts`
- `backend/src/integrations/regional-starter-pack/anchors/etherfuse/index.ts`

## Ambiente

Configure no backend:

```bash
STELLAR_NETWORK=TESTNET
STELLAR_HORIZON_URL=https://horizon-testnet.stellar.org
ETHERFUSE_API_KEY=api_sand:your-api-key:your-organization-id
ETHERFUSE_BASE_URL=https://api.sand.etherfuse.com
ETHERFUSE_BLOCKCHAIN=stellar
ENABLE_TESOURO_ASSET=true
TESOURO_ISSUER=GC3CW7EDYRTWQ635VDIGY6S4ZUF5L6TQ7AA4MWS7LEQDBLUSZXV7UPS4
```

Tambem configure a mesma `ETHERFUSE_API_KEY` no `sandbox/regional-starter-pack/.env` quando for rodar o app de referencia.

Importante: a chave deve ser usada sem `Bearer`.

## Tela Web

A tela de teste foi adicionada em:

```text
/pix-ramp
```

Ela usa a sessao global salva no navegador:

- `talk-to-stellar.sessionId`
- `talk-to-stellar.sessionToken`

Se esses valores nao existirem, entre em uma conta TalkToStellar antes de usar a tela.

### Teste Rapido

Na parte superior da tela existe o bloco:

```text
Teste rapido: PIX sandbox para minha wallet
```

Use o botao:

```text
Simular PIX para a wallet logada
```

Ele executa automaticamente:

1. Cria ou recupera customer na Etherfuse.
2. Gera quote `BRL -> TESOURO`.
3. Cria ordem PIX sandbox.
4. Chama `fiat_received` no sandbox.
5. Faz polling do status da ordem.

Se a Etherfuse exigir KYC ou registro da conta PIX, abra o link `KYC/PIX`, conclua o fluxo hospedado e rode o teste rapido novamente.

A versao atual da tela tambem tem:

- Quote screen com seletor `TESOURO` ou `USDC`.
- Checkout PIX com QR code gerado a partir do `pixCode`.
- Botao `Copy PIX code`.
- Timeline: PIX generated, Waiting for payment, Payment detected, Stellar asset delivered.
- Botao `Simulate PIX payment` somente quando o backend informa ambiente sandbox/devnet.
- Polling automatico do status da ordem.
- Recibo final com wallet, order id, timestamp, network e status.
- Paineis `On-ramp wallet assets` e `Off-ramp wallet assets` com balances before/after/delta.

## Como o PIX Funciona

Em producao, o fluxo seria:

1. O usuario escolhe quanto quer colocar em BRL.
2. A Etherfuse gera uma ordem com `pixCode`/`pixKey`.
3. O usuario paga esse PIX pelo banco real.
4. A Etherfuse confirma o recebimento do BRL.
5. A Etherfuse envia o ativo tokenizado para a wallet Stellar.

No sandbox/testnet usado aqui:

- Nao envie dinheiro real.
- O `pixCode` e instrucao de teste/sandbox.
- O pagamento e simulado via `POST /api/ramp/etherfuse/sandbox/simulate-fiat`.
- O ativo recebido e `TESOURO` em rede Stellar testnet/devnet.
- Esses tokens nao representam saldo financeiro real.

Resumo: no ambiente atual, PIX e fake/simulado; a blockchain tambem esta em testnet/devnet. Dinheiro real so deve entrar quando trocar para ambiente de producao da anchor, com API key de producao, compliance/KYC aprovados e rails reais ativados.

## Endpoints

Todos os endpoints tambem estao disponiveis via proxy da web:

- Frontend: `/api/ramp/...`
- Backend: `/api/ramp/...`

### Config Sandbox/Production

```http
GET /api/ramp/etherfuse/config
```

Retorna `sandbox=true` quando a API key/base URL sao de sandbox. A UI usa isso para esconder o botao de simulacao em producao.

### Wallet Balances

```http
GET /api/ramp/etherfuse/wallet-balances?session_id=...&session_token=...
```

Retorna a wallet logada e seus assets atuais. A tela usa antes/depois para mostrar explicitamente a mudanca de saldo.

### Customer e KYC

```http
POST /api/ramp/etherfuse/customer
```

Body:

```json
{
  "session_id": "talktostellar-session-id",
  "session_token": "talktostellar-session-token",
  "country": "BR"
}
```

Retorna:

- `customer.id`
- `customer.bankAccountId`
- `kyc_url`
- asset `TESOURO`
- issuer `GC3CW7...UPS4`

Abra `kyc_url` para fazer KYC e registrar a conta PIX no fluxo hospedado da Etherfuse.

### Assets

```http
GET /api/ramp/etherfuse/assets?session_id=...&session_token=...&currency=brl
```

Retorna os ativos disponiveis para a wallet, incluindo `TESOURO`.

### Contas PIX Registradas

```http
GET /api/ramp/etherfuse/fiat-accounts?session_id=...&session_token=...&customer_id=...
```

Use depois do KYC/registro hospedado para confirmar se existe conta PIX salva.

### Quote On-Ramp

```http
POST /api/ramp/etherfuse/quote
```

Body:

```json
{
  "session_id": "...",
  "session_token": "...",
  "customer_id": "...",
  "direction": "onramp",
  "amount": "100"
}
```

Padrao:

- `fromCurrency`: `BRL`
- `toCurrency`: `TESOURO:<issuer>`

### Criar On-Ramp PIX

```http
POST /api/ramp/etherfuse/onramp
```

Body:

```json
{
  "session_id": "...",
  "session_token": "...",
  "customer_id": "...",
  "quote_id": "...",
  "amount": "100",
  "bank_account_id": "optional-bank-account-id"
}
```

O backend tenta criar automaticamente a trustline `TESOURO` antes de criar a ordem. Para isso, a wallet precisa ter `vault_secret_id`.

Retorna:

- `transaction.id`
- `transaction.paymentInstructions.pixCode`
- `transaction.paymentInstructions.pixKey`
- `operation_id`

### Simular PIX Recebido

Sandbox only:

```http
POST /api/ramp/etherfuse/sandbox/simulate-fiat
```

Body:

```json
{
  "session_id": "...",
  "session_token": "...",
  "order_id": "etherfuse-order-id"
}
```

Depois, consulte o status:

```http
GET /api/ramp/etherfuse/onramp/:orderId?operation_id=...
```

### Endpoint Temporario Full-Flow

Sandbox/devnet only:

```http
POST /api/ramp/etherfuse/sandbox/test-onramp
```

Body:

```json
{
  "session_id": "...",
  "session_token": "...",
  "amount": "100",
  "to_currency": "TESOURO"
}
```

Esse endpoint temporario executa:

1. Snapshot dos balances da wallet.
2. Customer/KYC URL.
3. Quote `BRL -> TESOURO` ou `BRL -> USDC`.
4. Ordem PIX.
5. `simulateFiatReceived(orderId)`.
6. Polling curto do status.
7. Snapshot final dos balances.
8. `balance_delta` explicito por asset.

Ele retorna `403` fora de sandbox/devnet.

### Endpoint Temporario Off-Ramp

Sandbox/devnet only:

```http
POST /api/ramp/etherfuse/sandbox/test-offramp
```

Body:

```json
{
  "session_id": "...",
  "session_token": "...",
  "amount": "1"
}
```

Esse endpoint temporario executa:

1. Snapshot dos balances da wallet.
2. Customer ou customer informado.
3. Busca uma conta PIX registrada na Etherfuse.
4. Quote `TESOURO -> BRL`.
5. Cria ordem off-ramp.
6. Faz polling ate a Etherfuse disponibilizar o XDR de burn.
7. Assina/submete o XDR com a wallet TalkToStellar se `ready_to_sign=true`.
8. Snapshot final dos balances.
9. `balance_delta` explicito por asset.

Se nao existir conta PIX registrada, retorna `409` pedindo para abrir o KYC/PIX hospedado e registrar a conta.

### Quote Off-Ramp

```http
POST /api/ramp/etherfuse/quote
```

Body:

```json
{
  "session_id": "...",
  "session_token": "...",
  "customer_id": "...",
  "direction": "offramp",
  "amount": "10"
}
```

Padrao:

- `fromCurrency`: `TESOURO:<issuer>`
- `toCurrency`: `BRL`

### Criar Off-Ramp PIX

```http
POST /api/ramp/etherfuse/offramp
```

Body:

```json
{
  "session_id": "...",
  "session_token": "...",
  "customer_id": "...",
  "quote_id": "...",
  "amount": "10",
  "fiat_account_id": "registered-pix-account-id"
}
```

Se `fiat_account_id` nao for enviado, o backend tenta usar a primeira conta PIX retornada pela Etherfuse.

### Polling Off-Ramp

```http
GET /api/ramp/etherfuse/offramp/:orderId?operation_id=...
```

Quando a resposta tiver `ready_to_sign=true`, a Etherfuse ja disponibilizou o XDR de burn.

### Assinar e Enviar Off-Ramp

```http
POST /api/ramp/etherfuse/offramp/:orderId/submit
```

Body:

```json
{
  "session_id": "...",
  "session_token": "...",
  "operation_id": "optional-operation-id"
}
```

O backend busca o XDR, le a chave privada da wallet no Vault, assina e submete na Stellar testnet/devnet.

## Fluxo Completo

1. Entrar em uma conta TalkToStellar.
2. Abrir `/pix-ramp`.
3. Clicar em `Criar customer/KYC`.
4. Abrir `KYC/PIX` e concluir KYC + registro da conta PIX.
5. Para on-ramp, cotar BRL, criar ordem PIX, copiar `pixCode` e simular `fiat_received` no sandbox.
6. Para off-ramp, listar contas PIX, cotar TESOURO, criar off-ramp, pollar ate `ready_to_sign=true`, assinar e enviar.

## Validacao Local

Com backend e frontend configurados:

```bash
cd backend
npm run build

cd ../frontend
npm run build
```

Teste rapido da chave Etherfuse sem criar pedido:

```bash
cd backend
node -e "require('dotenv').config(); console.log(/^api_[a-z]+:[^\\s:]+:[^\\s:]+$/.test(process.env.ETHERFUSE_API_KEY || ''))"
```

O resultado esperado e `true`.

## Notas Tecnicas

- Nao foi reimplementado protocolo SEP nem API Etherfuse: o client veio do regional starter pack.
- `TESOURO` foi adicionado aos assets confiaveis do TalkToStellar.
- O issuer default de `TESOURO` e o mesmo usado pelo regional starter pack.
- Off-ramp Etherfuse usa assinatura diferida: a ordem e criada primeiro, e o XDR aparece depois via polling.
- Registro de conta PIX e KYC sao hospedados pela Etherfuse, nao inline no TalkToStellar.
- A API key nao deve ser exposta no frontend nem em variaveis `NEXT_PUBLIC_*`.
