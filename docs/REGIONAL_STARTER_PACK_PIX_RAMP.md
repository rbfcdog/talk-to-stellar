# TalkToStellar PIX/TESOURO Ramp

Este guia descreve a integracao do TalkToStellar com o Etherfuse sandbox usando o codigo portavel do `sandbox/regional-starter-pack`.

## Objetivo

Conectar wallets TalkToStellar ao fluxo regional de on-ramp e off-ramp:

- On-ramp: `BRL` via `PIX` para `TESOURO` na Stellar testnet/devnet.
- Off-ramp: `TESOURO` na Stellar para `BRL` via `PIX`.
- Customer, wallet e KYC sandbox sao enviados programaticamente para a Etherfuse.
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

## Estado Atual do Sandbox

Investigacao feita contra `https://api.sand.etherfuse.com` e a especificacao oficial `https://docs.etherfuse.com/openapi.yaml`:

- `POST /ramp/onboarding-url` funciona e recupera o customer existente quando a public key ja foi registrada.
- `POST /ramp/customer/{customerId}/wallet` funciona e retorna `walletId`.
- `POST /ramp/wallet` e usado no sandbox com `claimOwnership=true` para registrar a wallet na organizacao Etherfuse aprovada.
- `POST /ramp/customer/{customerId}/kyc` funciona e auto-aprova no sandbox.
- `POST /ramp/quote` funciona para `BRL -> TESOURO` e `TESOURO -> BRL`.
- `POST /ramp/customer/{customerId}/bank-account` rejeita o payload PIX do regional starter pack com `AccountRegistration`.
- Sem uma conta PIX/proxy criada pela Etherfuse, `POST /ramp/order` retorna `Proxy account not found`.

Por isso o backend faz:

1. Tenta o fluxo real Etherfuse primeiro.
2. Se a Etherfuse negar a ordem com `Proxy account not found` em sandbox/devnet, usa fallback local explicito `sandbox_mock=true`.
3. On-ramp sandbox: gera checkout PIX sandbox e, ao simular pagamento, entrega `TESOURO` on-chain na Stellar Testnet usando a liquidez BRL local.
4. Off-ramp sandbox: cria uma ordem mockada e assina uma transferencia real de `TESOURO` da wallet TalkToStellar para o coletor sandbox.

Esse fallback e controlado por:

```bash
ETHERFUSE_SANDBOX_PIX_FALLBACK=true
```

Para desativar e exigir somente ordem Etherfuse real:

```bash
ETHERFUSE_SANDBOX_PIX_FALLBACK=false
```

## Tela Web

A tela de teste foi adicionada em:

```text
/pix-ramp
```

Ela usa a sessao global salva no navegador, quando existir:

- `talk-to-stellar.sessionId`
- `talk-to-stellar.sessionToken`

Se esses valores nao existirem, a tela permite digitar o email da conta TalkToStellar para localizar a wallet existente pela propria infra TalkToStellar. Nao usa Freighter.

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

Se a Etherfuse nao conseguir criar a proxy PIX real no sandbox, o backend retorna um checkout PIX sandbox explicito e liquida a simulacao on-chain na Testnet.

A versao atual da tela tambem tem:

- Quote screen com seletor `TESOURO` ou `USDC`.
- Checkout PIX com QR code gerado a partir do `pixCode`.
- Botao `Copy PIX code`.
- Timeline: PIX generated, Waiting for payment, Payment detected, Stellar asset delivered.
- Botao `Simulate PIX payment` somente quando o backend informa ambiente sandbox/devnet.
- Polling automatico do status da ordem.
- Recibo final com wallet, order id, timestamp, network e status.
- Paineis `On-ramp wallet assets` e `Off-ramp wallet assets` com balances before/after/delta.
- Os deltas so aparecem depois do snapshot final; antes disso a UI mostra `waiting` para nao transformar saldo ausente em zero.

## Como o PIX Funciona

Em producao, o fluxo seria:

1. O usuario escolhe quanto quer colocar em BRL.
2. A Etherfuse gera uma ordem com `pixCode`/`pixKey`.
3. O usuario paga esse PIX pelo banco real.
4. A Etherfuse confirma o recebimento do BRL.
5. A Etherfuse envia o ativo tokenizado para a wallet Stellar.

No sandbox/testnet usado aqui:

- Nao envie dinheiro real.
- Quando a ordem Etherfuse real funciona, o `pixCode` vem da Etherfuse.
- Quando o sandbox cai no fallback local, o `pixCode` e um BR-Code PIX EMV valido para QR/copia-e-cola de teste, com `br.gov.bcb.pix`, valor, txid e CRC16. Ele nao deve ser pago com dinheiro real.
- O pagamento e simulado via `POST /api/ramp/etherfuse/sandbox/simulate-fiat`.
- O mock `sandbox-pix-*` e recuperado pelo `operation_id` salvo no banco. Assim, polling e simulacao continuam funcionando depois de reload/restart/deploy.
- O ativo recebido e `TESOURO` em rede Stellar testnet/devnet. Quando a ordem Etherfuse real falha por proxy PIX, o fallback sandbox faz a entrega on-chain local.
- Para ordem Etherfuse real, a API exige wallet aprovada e bank account ativa da organizacao. O backend registra a wallet em `/ramp/wallet` e tenta usar automaticamente uma conta ativa retornada por `/ramp/bank-accounts` antes de cair no fallback.
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

Em sandbox, se a Etherfuse retornar `Proxy account not found`, cria `sandbox-pix-*`, simula PIX e entrega `TESOURO` on-chain. Ele retorna `403` fora de sandbox/devnet.

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
5. Cria ordem off-ramp real quando existe conta PIX real.
6. Se nao existe conta PIX no sandbox, cria `sandbox-offramp-*`.
7. Assina/submete uma transferencia real de `TESOURO` com a wallet TalkToStellar se `ready_to_sign=true`.
8. Snapshot final dos balances.
9. `balance_delta` explicito por asset.

Fora de sandbox, se nao existir conta PIX registrada, retorna `409` pedindo para abrir o KYC/PIX hospedado e registrar a conta.

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
3. Digitar o email da conta se a sessao nao estiver no navegador.
4. Para on-ramp, cotar BRL, criar ordem PIX, copiar `pixCode` e simular PIX no sandbox.
5. Para off-ramp, usar o endpoint temporario ou fluxo de off-ramp para cotar TESOURO, criar ordem, assinar e enviar.

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
- KYC sandbox e wallet registration sao programaticos; conta PIX programatica ainda e rejeitada pela API sandbox atual da Etherfuse para o payload PIX do regional starter pack.
- O fallback on-ramp gera BR-Code EMV de sandbox em vez de uma string interna `PIX-SANDBOX|...`, para que o QR exibido tenha o formato PIX correto.
- Se o fallback nao tiver TESOURO suficiente no coletor sandbox, a simulacao retorna erro com saldo do treasury e valor necessario. Para R$ 100, o treasury precisa ter cerca de 86.65 TESOURO ou a ordem real Etherfuse precisa estar ativa.
- O fallback sandbox nao roda em producao e nao deve ser tratado como liquidacao financeira real.
- A API key nao deve ser exposta no frontend nem em variaveis `NEXT_PUBLIC_*`.
