  # VP com Ancora no Testnet - Roteiro Tecnico

Use este roteiro para regravar o video. A avaliacao pediu o fluxo de integracao, entao o video deve mostrar backend, chamadas para a anchor, criacao de ordem, trustline/XDR e hashes na Stellar Testnet. A tela do produto pode aparecer no final, mas nao deve ser o foco.

## Mensagem central

TalkToStellar integra uma anchor Etherfuse sandbox para PIX/TESOURO na Stellar Testnet. O backend:

1. autentica a sessao TalkToStellar e resolve a wallet Stellar do usuario;
2. cria ou recupera o customer na Etherfuse;
3. prepara KYC/proxy PIX e registra a wallet na anchor;
4. pede uma quote `BRL -> TESOURO:<issuer>`;
5. garante a trustline `TESOURO` na wallet;
6. cria a ordem PIX na anchor;
7. simula recebimento fiat no sandbox;
8. liquida na Stellar Testnet com XDR assinado pelo backend e retorna hash.

Importante para a gravacao: neste repo nao existe chamada Soroban. As chamadas on-chain demonstraveis sao operacoes Stellar Testnet (`changeTrust`, `payment`, `pathPaymentStrictReceive`, `pathPaymentStrictSend`) serializadas em XDR, assinadas e submetidas ao Horizon. Se perguntarem por "contrato", explique como "camada on-chain/ledger calls" e mostre o XDR + hash no explorer.

## Ordem sugerida do video

### 1. Abrir ambiente e configuracao

Mostre rapidamente:

- `backend/.env.example`
- `backend/src/config/stellar.ts`
- `backend/src/config/assets.ts`

O que falar:

> A integracao esta configurada para Stellar Testnet. O Horizon aponta para `https://horizon-testnet.stellar.org`, a anchor e a Etherfuse sandbox, e o ativo da anchor e `TESOURO` com issuer configurado no backend. A API key fica somente no backend.

Linhas/trechos para mostrar:

- `STELLAR_NETWORK=TESTNET`
- `STELLAR_HORIZON_URL=https://horizon-testnet.stellar.org`
- `ETHERFUSE_BASE_URL=https://api.sand.etherfuse.com`
- `ETHERFUSE_BLOCKCHAIN=stellar`
- `TESOURO_ISSUER=GC3CW7EDYRTWQ635VDIGY6S4ZUF5L6TQ7AA4MWS7LEQDBLUSZXV7UPS4`
- `backend/src/config/stellar.ts`: `Networks.TESTNET`, `Horizon.Server(...)`
- `backend/src/config/assets.ts`: `ETHERFUSE_TESOURO_ISSUER`, `getAssetIssuer('TESOURO')`

### 2. Mostrar as rotas publicas do backend

Abra `backend/src/api/routes/ramp.router.ts`.

O que falar:

> Esta e a superficie da integracao. A UI chama `/api/ramp/etherfuse/...`, mas tudo passa pelo backend. Aqui ficam customer, KYC status, assets, quote, trustline, on-ramp, off-ramp, simulacao sandbox e teste temporario.

Mostre estas rotas:

- `POST /api/ramp/etherfuse/customer`
- `POST /api/ramp/etherfuse/quote`
- `POST /api/ramp/etherfuse/trustline`
- `POST /api/ramp/etherfuse/onramp`
- `GET /api/ramp/etherfuse/onramp/:orderId`
- `POST /api/ramp/etherfuse/sandbox/simulate-fiat`
- `POST /api/ramp/etherfuse/sandbox/test-onramp`

### 3. Mostrar o cliente da anchor Etherfuse

Abra `backend/src/integrations/regional-starter-pack/anchors/etherfuse/client.ts`.

O que falar:

> Este client e a camada que conversa diretamente com a anchor. Ele recebe a API key no servidor, monta requests autenticados e traduz respostas Etherfuse para tipos internos como `Customer`, `Quote`, `OnRampTransaction` e `OffRampTransaction`.

Trechos para mostrar:

- `request()` envia `Authorization: this.config.apiKey` para a Etherfuse.
- `createCustomer()` chama `POST /ramp/onboarding-url`.
- `getQuote()` chama `POST /ramp/quote`.
- `createOnRamp()` chama `POST /ramp/order`.
- `getOnRampTransaction()` chama `GET /ramp/order/{id}`.
- `getKycUrl()`, `getKycStatus()`, `getAssets()`.
- `registerCustomerWallet()` e `registerOrganizationWallet()` para registrar a wallet na anchor.
- `submitKycIdentity()` e `submitKycDocuments()` para KYC programatico sandbox.

### 4. Mostrar o orquestrador do backend

Abra `backend/src/api/services/anchor.service.ts`.

O que falar:

> O `AnchorService` e onde o backend junta TalkToStellar, Etherfuse, Vault/Supabase e Stellar. A anchor nunca recebe a chave privada do usuario; o backend busca a chave no Vault apenas para assinar XDR quando precisa criar trustline ou submeter uma transacao.

Trechos para mostrar:

- `createCustomerForSession()`: resolve sessao, cria customer, prepara proxy PIX e retorna provider/rail/asset.
- `getQuoteForSession()`: monta quote `BRL -> TESOURO:<issuer>`.
- `ensureTesouroTrustlineForSession()` e `ensureIssuedAssetTrustline()`: verifica saldo/trustline, cria XDR `CHANGE_TRUST`, assina e submete.
- `createOnRampForSession()`: garante trustline, prepara proxy/KYC, refresca quote, cria ordem, persiste `PIX_ONRAMP`.
- `maybeAutoConvertCompletedOnRamp()`: quando a anchor liquida em TESOURO, converte para asset final se o usuario pediu `BRL` ou `USDC`.
- `simulateFiatReceivedForSession()`: no sandbox, simula recebimento fiat e retorna `delivery_hash`.
- `runTemporarySandboxOnRampTest()`: endpoint de demonstracao que executa customer -> quote -> ordem -> simulacao -> polling -> balances before/after.

Fala curta para o fallback:

> No sandbox, a Etherfuse pode retornar `Proxy account not found`. O backend tenta o fluxo real primeiro; se o sandbox nao fornece a proxy PIX, cai em fallback controlado por `ETHERFUSE_SANDBOX_PIX_FALLBACK=true`, gera um PIX sandbox e ainda liquida on-chain na Testnet para provar a integracao.

### 5. Mostrar as chamadas on-chain / XDR

Abra `backend/src/api/services/stellar.service.ts`.

O que falar:

> Esta e a parte on-chain. O backend constroi transacoes Stellar, transforma em XDR, assina com a chave da wallet no Vault e submete no Horizon Testnet. O resultado e um hash verificavel.

Trechos para mostrar:

- `buildTrustlineXdr()`: `Operation.changeTrust({ asset })`.
- `signAndSubmitXdr()`: `TransactionBuilder.fromXDR(...)`, `transaction.sign(...)`, `server.submitTransaction(...)`.
- `buildPathPaymentXdr()`: `Operation.pathPaymentStrictReceive(...)`.
- `buildStrictSendConversionXdr()`: `Operation.pathPaymentStrictSend(...)`.
- `submitAssetPaymentFromSecret()`: `Operation.payment(...)` para entrega direta de asset no sandbox.
- `submitStrictReceivePaymentFromSecret()` e `submitStrictSendPaymentFromSecret()` para liquidar/converter no fallback.

Fala recomendada:

> Aqui esta a evidencia que nao e apenas uma tela. A ordem da anchor vira uma movimentacao em ledger: primeiro `changeTrust` para aceitar TESOURO, depois `payment` ou `pathPayment` para entregar o ativo. Cada submissao retorna um hash.

### 6. Rodar um fluxo no terminal

Suba backend e frontend:

```bash
./start-local.sh
```

Ou, em terminais separados:

```bash
cd backend
npm run dev
```

```bash
cd frontend
npm run dev
```

Se voce ja tem uma sessao com wallet criada, rode o endpoint de demonstracao:

```bash
curl -s -X POST http://localhost:3001/api/ramp/etherfuse/sandbox/test-onramp \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "SESSION_ID_AQUI",
    "session_token": "SESSION_TOKEN_AQUI",
    "amount": "10",
    "final_asset": "BRL"
  }'
```

Mostre no JSON de resposta:

- `customer.id`
- `quote.id`
- `transaction.id`
- `transaction.paymentInstructions.type = "pix"`
- `simulation.success = true`
- `final_transaction.status = "completed"`
- `simulation.delivery_hash` ou `final_transaction.stellarTxHash`
- `balances_before`
- `balances_after`
- `balance_delta`

Depois abra o hash na Testnet:

```text
https://stellar.expert/explorer/testnet/tx/HASH_AQUI
```

Se quiser mostrar o fluxo passo a passo em vez do endpoint completo:

```bash
curl -s http://localhost:3001/api/ramp/etherfuse/config
```

```bash
curl -s -X POST http://localhost:3001/api/ramp/etherfuse/customer \
  -H "Content-Type: application/json" \
  -d '{"session_id":"SESSION_ID_AQUI","session_token":"SESSION_TOKEN_AQUI","country":"BR"}'
```

```bash
curl -s -X POST http://localhost:3001/api/ramp/etherfuse/quote \
  -H "Content-Type: application/json" \
  -d '{"session_id":"SESSION_ID_AQUI","session_token":"SESSION_TOKEN_AQUI","customer_id":"CUSTOMER_ID","direction":"onramp","amount":"10","final_asset":"BRL"}'
```

```bash
curl -s -X POST http://localhost:3001/api/ramp/etherfuse/onramp \
  -H "Content-Type: application/json" \
  -d '{"session_id":"SESSION_ID_AQUI","session_token":"SESSION_TOKEN_AQUI","customer_id":"CUSTOMER_ID","quote_id":"QUOTE_ID","amount":"10","final_asset":"BRL"}'
```

```bash
curl -s -X POST http://localhost:3001/api/ramp/etherfuse/sandbox/simulate-fiat \
  -H "Content-Type: application/json" \
  -d '{"session_id":"SESSION_ID_AQUI","session_token":"SESSION_TOKEN_AQUI","order_id":"ORDER_ID","operation_id":"OPERATION_ID"}'
```

```bash
curl -s "http://localhost:3001/api/ramp/etherfuse/onramp/ORDER_ID?operation_id=OPERATION_ID"
```

### 7. Mostrar logs do backend

Durante o curl, mostre o terminal do backend. Procure logs como:

- `[Etherfuse] POST https://api.sand.etherfuse.com/ramp/onboarding-url`
- `[Etherfuse] POST https://api.sand.etherfuse.com/ramp/quote`
- `[Etherfuse] POST https://api.sand.etherfuse.com/ramp/order`
- logs de fallback sandbox, se aparecerem;
- hash de transacao Stellar retornado no JSON.

O que falar:

> Estes logs mostram as chamadas reais para a anchor. Quando aparece fallback, ele e limitado ao sandbox e a liquidacao on-chain continua acontecendo na Stellar Testnet.

### 8. Mostrar UI somente como evidencia complementar

Abra `/pix-ramp`.

O que falar:

> A tela so dispara as rotas que ja mostrei no backend. Ela exibe QR PIX, status, polling, recibo e delta de saldo, mas a integracao acontece no backend.

Arquivos opcionais:

- `frontend/app/api/ramp/[...path]/route.ts`: proxy Next.js para o backend.
- `frontend/app/pix-ramp/pix-ramp-client.tsx`: tela que chama customer/quote/onramp/simulate/status.

## Checklist de gravacao

- Mostrei `STELLAR_NETWORK=TESTNET` e Horizon Testnet.
- Mostrei `ETHERFUSE_BASE_URL=https://api.sand.etherfuse.com`.
- Mostrei que a API key Etherfuse fica no backend.
- Mostrei as rotas `/api/ramp/etherfuse/...`.
- Mostrei o client Etherfuse com `POST /ramp/onboarding-url`, `POST /ramp/quote`, `POST /ramp/order`.
- Mostrei o `AnchorService` orquestrando customer, KYC/proxy, quote, trustline e ordem.
- Mostrei `Operation.changeTrust`, `Operation.payment` ou `Operation.pathPayment...`.
- Mostrei `signAndSubmitXdr()` assinando e submetendo ao Horizon.
- Rodei um endpoint no terminal e mostrei JSON com `order_id`, status e hash.
- Abri o hash no Stellar Expert Testnet.
- Expliquei que PIX e sandbox, mas a movimentacao Stellar e na Testnet.

## Roteiro falado de 4 a 6 minutos

1. "Este video nao e uma demo de produto. Vou mostrar a integracao da anchor no backend e a liquidacao na Stellar Testnet."
2. "A config usa Stellar Testnet, Horizon Testnet, Etherfuse sandbox e o asset TESOURO com issuer configurado no backend."
3. "A superficie da API esta em `ramp.router.ts`: customer, quote, trustline, onramp, status e simulacao sandbox."
4. "O client Etherfuse encapsula as chamadas autenticadas para a anchor: onboarding/KYC, assets, quote e order."
5. "O `AnchorService` resolve a sessao, pega a wallet, cria customer, prepara proxy PIX, pede quote, cria trustline e cria ordem."
6. "Na parte on-chain, `stellar.service.ts` cria XDRs de `changeTrust`, `payment` e `pathPayment`, assina com a chave no Vault e submete ao Horizon Testnet."
7. "Agora vou rodar o fluxo pelo terminal: customer -> quote -> order -> simulate fiat -> poll status."
8. "Aqui esta o JSON com order id, PIX sandbox, status completed, balance delta e hash."
9. "Abrindo o hash no explorer Testnet, vemos a transacao Stellar que prova a liquidacao."
10. "A UI `/pix-ramp` apenas consome essas rotas; a integracao avaliada esta no backend e nas chamadas para a anchor/on-chain."

## Erros que devem ser evitados

- Nao grave so a tela do produto.
- Nao esconda o terminal e os logs.
- Nao diga que e dinheiro real; e sandbox/testnet.
- Nao diga que ha Soroban se voce nao mostrar uma chamada Soroban.
- Nao mostre `ETHERFUSE_API_KEY` real no video. Use blur ou `.env.example`.
- Nao mostre private keys, secrets do Vault, Supabase service role key ou `BRL_DISTRIBUTOR_SECRET`.
