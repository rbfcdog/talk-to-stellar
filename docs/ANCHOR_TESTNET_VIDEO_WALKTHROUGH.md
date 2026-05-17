# VP com Ancora no Testnet - Roteiro Corrigido com Timestamps

Use este roteiro para regravar a submissao rejeitada.

Motivo da rejeicao:

> O video que voces subiram e a demo do produto (entregavel do desafio 4), so que o que queremos avaliar nesse momento e o video mostrando o fluxo da integracao (chamadas de contrato, ancoras, no backend mesmo).

Portanto, este video deve mostrar **backend, chamadas para a anchor, XDR/trustline, transacao na Stellar Testnet e hash no explorer**. A UI so pode aparecer no final, como evidencia complementar.

## Duracao Alvo

Grave um video de **7:45**. Se precisar cortar, nao corte as secoes 2, 3, 4, 5 e 6. Elas sao o que responde diretamente a rejeicao.

## Setup Antes de Gravar

Abra estas janelas antes de apertar Rec:

1. VS Code na raiz do repo.
2. Terminal 1 com backend:

```bash
cd backend
npm run dev
```

3. Terminal 2 para `curl`.
4. Browser com Stellar Expert Testnet pronto:

```text
https://stellar.expert/explorer/testnet
```

5. Tenha `SESSION_ID_AQUI` e `SESSION_TOKEN_AQUI` de uma sessao com wallet criada.

Nunca mostre:

- `ETHERFUSE_API_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- private keys
- secrets do Vault
- `BRL_DISTRIBUTOR_SECRET`
- `INTERNAL_API_SECRET`

Se abrir `.env`, use `.env.example` ou borre os secrets.

## Mensagem Central

Fale esta ideia no comeco e no fim:

> Este video nao e a demo do produto. Aqui eu estou mostrando a integracao de backend com a anchor Etherfuse sandbox e a liquidacao on-chain na Stellar Testnet. O fluxo passa por customer, KYC/proxy, quote, ordem PIX, trustline, XDR assinado, submissao no Horizon e hash verificavel no explorer.

Importante:

- Este repo nao tem chamada Soroban.
- Quando falar "contrato" ou "chamada on-chain", explique como operacoes Stellar Testnet via XDR/Horizon.
- As operacoes demonstraveis sao `changeTrust`, `payment`, `pathPaymentStrictReceive` e `pathPaymentStrictSend`.

## Timeline Exata do Video

### 00:00 - 00:20 | Abertura: corrigindo a submissao

**Mostrar na tela**

- Este arquivo: `docs/ANCHOR_TESTNET_VIDEO_WALKTHROUGH.md`
- A frase da rejeicao no topo.

**Falar**

> Este video substitui a submissao rejeitada. Eu nao vou fazer uma demo de produto. Vou mostrar o fluxo tecnico da integracao: backend, chamadas para a anchor Etherfuse, criacao de ordem, trustline, XDR, submissao na Stellar Testnet e hash no explorer.

**O que esta secao prova**

Deixa claro para o avaliador que voce entendeu o problema: eles nao querem ver so a tela final, querem ver a integracao no backend.

### 00:20 - 00:55 | Configuracao: Testnet, anchor e asset

**Mostrar na tela**

Abra:

- `backend/.env.example`
- `backend/src/config/stellar.ts`
- `backend/src/config/assets.ts`

Procure e mostre:

```text
STELLAR_NETWORK=TESTNET
STELLAR_HORIZON_URL=https://horizon-testnet.stellar.org
ETHERFUSE_BASE_URL=https://api.sand.etherfuse.com
ETHERFUSE_BLOCKCHAIN=stellar
TESOURO_ISSUER=GC3CW7EDYRTWQ635VDIGY6S4ZUF5L6TQ7AA4MWS7LEQDBLUSZXV7UPS4
```

**Falar**

> Primeiro, esta e a configuracao da integracao. O projeto roda contra Stellar Testnet, usando Horizon Testnet. A anchor usada no desafio e a Etherfuse sandbox. O ativo interno de liquidacao da anchor e TESOURO, com issuer configurado no backend. A API key da Etherfuse fica somente no servidor, nao no frontend.

**O que esta secao faz**

- Prova que o ambiente e Testnet.
- Prova que a anchor e Etherfuse sandbox.
- Prova que a integracao nao depende de segredo no browser.
- Prova qual asset/issuer sera usado no fluxo.

### 00:55 - 01:35 | Superficie do backend: rotas da integracao

**Mostrar na tela**

Abra:

```text
backend/src/api/routes/ramp.router.ts
```

Mostre estas rotas:

```ts
router.post('/etherfuse/customer', ...)
router.post('/etherfuse/quote', ...)
router.post('/etherfuse/trustline', ...)
router.post('/etherfuse/onramp', ...)
router.get('/etherfuse/onramp/:orderId', ...)
router.post('/etherfuse/offramp', ...)
router.post('/etherfuse/offramp/:orderId/submit', ...)
router.post('/etherfuse/sandbox/simulate-fiat', ...)
router.post('/etherfuse/sandbox/test-onramp', ...)
```

**Falar**

> Esta e a superficie publica do backend para a integracao da anchor. O frontend chama `/api/ramp/etherfuse/...`, mas a logica fica no servidor. Aqui temos customer, quote, trustline, on-ramp, status da ordem, off-ramp, submissao de XDR e simulacao de fiat recebido no sandbox.

**O que esta secao faz**

- Mostra que existe uma API dedicada para a anchor.
- Mostra que o fluxo nao e uma tela mockada.
- Mostra os pontos onde o avaliador deve enxergar customer, quote, ordem, status e simulacao sandbox.

### 01:35 - 02:30 | Client Etherfuse: chamadas reais para a anchor

**Mostrar na tela**

Abra:

```text
backend/src/integrations/regional-starter-pack/anchors/etherfuse/client.ts
```

Mostre estes trechos:

```ts
private async request<T>(...)
Authorization: this.config.apiKey
```

Depois mostre os metodos:

```ts
createCustomer(...)
getQuote(...)
createOnRamp(...)
getOnRampTransaction(...)
getKycUrl(...)
getKycStatus(...)
getAssets(...)
registerCustomerWallet(...)
registerOrganizationWallet(...)
submitKycIdentity(...)
submitKycDocuments(...)
simulateFiatReceived(...)
```

E mostre os endpoints Etherfuse:

```text
POST /ramp/onboarding-url
POST /ramp/quote
POST /ramp/order
GET /ramp/order/{id}
GET /ramp/assets
POST /ramp/customer/{customerId}/wallet
POST /ramp/wallet
POST /ramp/order/fiat_received
```

**Falar**

> Este arquivo e o client da anchor. Ele e a camada que fala diretamente com a Etherfuse. O metodo `request` injeta `Authorization` com a API key no backend. Depois, os metodos traduzem o fluxo da anchor para tipos internos: customer, KYC, assets, quote, ordem on-ramp, ordem off-ramp e simulacao de fiat recebido.

**O que esta secao faz**

- Prova que o backend chama a anchor de verdade.
- Prova que a API key nao fica no frontend.
- Mostra quais endpoints externos da Etherfuse sao usados.
- Mostra onde customer, KYC, wallet registration, quote e ordem sao criados.

### 02:30 - 03:45 | Orquestrador: sessao, wallet, KYC, quote, trustline e ordem

**Mostrar na tela**

Abra:

```text
backend/src/api/services/anchor.service.ts
```

Use a busca do VS Code e mostre nesta ordem:

```ts
createCustomerForSession(...)
getQuoteForSession(...)
ensureTesouroTrustlineForSession(...)
ensureIssuedAssetTrustline(...)
createOnRampForSession(...)
simulateFiatReceivedForSession(...)
runTemporarySandboxOnRampTest(...)
maybeAutoConvertCompletedOnRamp(...)
```

**Falar**

> Este e o orquestrador da integracao. Ele junta a sessao TalkToStellar, a wallet Stellar do usuario, a anchor Etherfuse e as chamadas on-chain. Primeiro ele resolve a sessao e a wallet. Depois cria ou recupera o customer na Etherfuse, registra wallet, prepara KYC/proxy PIX, pede uma quote BRL para TESOURO, garante trustline do asset e cria a ordem de on-ramp.

Continue:

> A anchor nunca recebe a private key do usuario. Quando precisa assinar transacao, o backend busca o segredo pelo fluxo de servidor e assina o XDR no backend. No sandbox, `simulateFiatReceivedForSession` simula o PIX recebido e depois acompanha a liquidacao/entrega do asset na wallet Testnet.

**O que cada metodo faz**

- `createCustomerForSession`: recebe `session_id` e `session_token`, valida a sessao, resolve a wallet Stellar, cria/recupera customer Etherfuse e prepara dados de onboarding.
- `getQuoteForSession`: cria uma quote da anchor, normalmente `BRL -> TESOURO:<issuer>` para on-ramp.
- `ensureTesouroTrustlineForSession`: garante que a wallet aceite o asset TESOURO antes da liquidacao.
- `ensureIssuedAssetTrustline`: cria trustline para qualquer asset emitido que precise ser recebido.
- `createOnRampForSession`: combina quote, KYC/proxy, trustline e cria a ordem PIX na Etherfuse.
- `simulateFiatReceivedForSession`: chama o endpoint sandbox da Etherfuse para marcar o fiat como recebido.
- `runTemporarySandboxOnRampTest`: executa o fluxo inteiro em uma chamada de demonstracao.
- `maybeAutoConvertCompletedOnRamp`: se a anchor entrega TESOURO e o usuario pediu BRL/USDC, o backend converte automaticamente para o asset final.

**O que esta secao faz**

- Prova que existe orquestracao real no backend.
- Mostra que a wallet do usuario entra no fluxo.
- Mostra que a ordem PIX nao e criada isoladamente: ela depende de customer, KYC/proxy, quote e trustline.
- Mostra onde a liquidacao sandbox e acompanhada.

### 03:45 - 04:45 | On-chain: XDR, assinatura e Horizon Testnet

**Mostrar na tela**

Abra:

```text
backend/src/api/services/stellar.service.ts
```

Mostre nesta ordem:

```ts
buildTrustlineXdr(...)
Operation.changeTrust(...)
signAndSubmitXdr(...)
TransactionBuilder.fromXDR(...)
transaction.sign(...)
server.submitTransaction(...)
buildPathPaymentXdr(...)
Operation.pathPaymentStrictReceive(...)
buildStrictSendConversionXdr(...)
Operation.pathPaymentStrictSend(...)
submitAssetPaymentFromSecret(...)
Operation.payment(...)
```

**Falar**

> Agora esta e a parte on-chain. O backend constroi transacoes Stellar em XDR. Para aceitar TESOURO, ele usa `Operation.changeTrust`. Para entrega ou conversao de asset, usa `payment`, `pathPaymentStrictReceive` ou `pathPaymentStrictSend`. O XDR e assinado no backend e submetido ao Horizon Testnet. A resposta retorna um hash verificavel.

Se quiser ser bem claro sobre "contrato":

> Neste repo nao existe Soroban contract call. A evidencia on-chain aqui e Stellar classic operation via XDR e Horizon Testnet. Entao, quando falo em chamada on-chain, estou mostrando a construcao, assinatura e submissao da transacao de ledger.

**O que esta secao faz**

- Prova que ha acao on-chain, nao apenas API off-chain.
- Mostra onde o XDR nasce.
- Mostra onde a assinatura acontece.
- Mostra onde a transacao e submetida no Horizon Testnet.
- Prepara o avaliador para reconhecer o hash no final.

### 04:45 - 06:10 | Executar o fluxo no terminal

**Mostrar na tela**

No terminal do backend, deixe logs visiveis.

No terminal de `curl`, rode:

```bash
curl -s -X POST http://localhost:3001/api/ramp/etherfuse/sandbox/test-onramp \
  -H "Content-Type: application/json" \
  -d '{
    "session_id": "SESSION_ID_AQUI",
    "session_token": "SESSION_TOKEN_AQUI",
    "amount": "10",
    "final_asset": "BRL"
  }' | jq
```

Se `jq` nao estiver instalado:

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

**Falar enquanto roda**

> Agora eu vou executar pelo terminal, sem passar pela UI. Este endpoint temporario existe para demonstrar o fluxo inteiro: criar ou recuperar customer, pedir quote, garantir trustline, criar ordem, simular fiat recebido no sandbox, consultar status e comparar saldo antes/depois.

**Mostrar no JSON**

Procure e destaque:

```text
customer.id
quote.id
transaction.id
transaction.paymentInstructions.type = "pix"
simulation.success = true
final_transaction.status = "completed"
simulation.delivery_hash
final_transaction.stellarTxHash
balances_before
balances_after
balance_delta
```

**Mostrar nos logs do backend**

Procure linhas parecidas com:

```text
[Etherfuse] POST https://api.sand.etherfuse.com/ramp/onboarding-url
[Etherfuse] POST https://api.sand.etherfuse.com/ramp/quote
[Etherfuse] POST https://api.sand.etherfuse.com/ramp/order
[Etherfuse] POST https://api.sand.etherfuse.com/ramp/order/fiat_received
```

**Falar depois da resposta**

> Aqui esta a prova do fluxo de integracao: customer da anchor, quote, ordem PIX, simulacao do fiat recebido, status final e hash de transacao Stellar. O campo de saldo antes/depois mostra que a wallet foi alterada depois da liquidacao.

**O que esta secao faz**

- Prova que a integracao executa end-to-end sem depender da UI.
- Mostra chamadas reais de backend.
- Mostra resposta da anchor.
- Mostra hash de transacao para validacao externa.

### 06:10 - 06:55 | Abrir hash no Stellar Expert Testnet

**Mostrar na tela**

Copie o hash do JSON:

```text
simulation.delivery_hash
```

ou:

```text
final_transaction.stellarTxHash
```

Abra:

```text
https://stellar.expert/explorer/testnet/tx/HASH_AQUI
```

Mostre:

- Network: Testnet.
- Transaction hash.
- Operations.
- Asset envolvido (`TESOURO`, `BRL` ou `USDC`, dependendo do fluxo).
- Source/destination accounts.

**Falar**

> Este e o hash retornado pelo backend depois da submissao no Horizon Testnet. Aqui no Stellar Expert da Testnet da para verificar a transacao no ledger. Isso fecha a evidencia: a anchor gerou o fluxo off-chain e o backend executou a parte on-chain com XDR assinado.

**O que esta secao faz**

- Prova externa, fora do seu app.
- Mostra que o hash e real e verificavel.
- Mostra que a movimentacao foi na Stellar Testnet.

### 06:55 - 07:25 | Mostrar fluxo passo a passo opcional

Se o avaliador quiser ver chamadas separadas, mostre rapidamente estes comandos no terminal ou em um arquivo scratch:

```bash
curl -s http://localhost:3001/api/ramp/etherfuse/config | jq
```

```bash
curl -s -X POST http://localhost:3001/api/ramp/etherfuse/customer \
  -H "Content-Type: application/json" \
  -d '{"session_id":"SESSION_ID_AQUI","session_token":"SESSION_TOKEN_AQUI","country":"BR"}' | jq
```

```bash
curl -s -X POST http://localhost:3001/api/ramp/etherfuse/quote \
  -H "Content-Type: application/json" \
  -d '{"session_id":"SESSION_ID_AQUI","session_token":"SESSION_TOKEN_AQUI","customer_id":"CUSTOMER_ID","direction":"onramp","amount":"10","final_asset":"BRL"}' | jq
```

```bash
curl -s -X POST http://localhost:3001/api/ramp/etherfuse/trustline \
  -H "Content-Type: application/json" \
  -d '{"session_id":"SESSION_ID_AQUI","session_token":"SESSION_TOKEN_AQUI"}' | jq
```

```bash
curl -s -X POST http://localhost:3001/api/ramp/etherfuse/onramp \
  -H "Content-Type: application/json" \
  -d '{"session_id":"SESSION_ID_AQUI","session_token":"SESSION_TOKEN_AQUI","customer_id":"CUSTOMER_ID","quote_id":"QUOTE_ID","amount":"10","final_asset":"BRL"}' | jq
```

```bash
curl -s -X POST http://localhost:3001/api/ramp/etherfuse/sandbox/simulate-fiat \
  -H "Content-Type: application/json" \
  -d '{"session_id":"SESSION_ID_AQUI","session_token":"SESSION_TOKEN_AQUI","order_id":"ORDER_ID","operation_id":"OPERATION_ID"}' | jq
```

```bash
curl -s "http://localhost:3001/api/ramp/etherfuse/onramp/ORDER_ID?operation_id=OPERATION_ID" | jq
```

**Falar**

> O endpoint temporario compacta o fluxo para a gravacao, mas estas sao as chamadas separadas. Elas correspondem exatamente ao pipeline: config, customer, quote, trustline, ordem, simulacao de fiat e polling de status.

**O que esta secao faz**

- Mostra granularidade.
- Ajuda o avaliador a ver que o endpoint de demo nao esconde a integracao.
- Mapeia cada etapa para uma rota backend.

### 07:25 - 07:45 | UI apenas como evidencia complementar

**Mostrar na tela**

Abra rapidamente:

```text
frontend/app/api/ramp/[...path]/route.ts
frontend/app/pix-ramp/pix-ramp-client.tsx
```

Opcionalmente abra a pagina:

```text
/pix-ramp
```

**Falar**

> A UI so consome as rotas que eu mostrei. Ela exibe QR PIX, status e saldo, mas a integracao avaliada esta no backend: Etherfuse client, AnchorService, StellarService, XDR, Horizon e hash no explorer.

**O que esta secao faz**

- Mostra que a tela nao e o centro da entrega.
- Conecta a experiencia visual com as rotas backend ja demonstradas.
- Evita repetir o erro da submissao anterior.

## Versao Curta da Narracao Completa

Use este texto se quiser ler durante o video:

```text
Este video substitui a submissao rejeitada. Nao e demo de produto; e a demonstracao do fluxo tecnico da integracao.

Primeiro, a configuracao: o backend esta em Stellar Testnet, usando Horizon Testnet, Etherfuse sandbox e asset TESOURO com issuer configurado no servidor. A API key da anchor fica apenas no backend.

Agora as rotas: a integracao esta exposta em /api/ramp/etherfuse. Temos customer, quote, trustline, on-ramp, status, off-ramp, submissao e simulacao sandbox.

Este client fala diretamente com a Etherfuse. Ele injeta Authorization com a API key e chama endpoints como /ramp/onboarding-url, /ramp/quote, /ramp/order, /ramp/assets, wallet registration, KYC e fiat_received.

O AnchorService orquestra o fluxo. Ele valida a sessao, resolve a wallet, cria customer, prepara KYC/proxy PIX, pede quote, garante trustline e cria a ordem de on-ramp. No sandbox, ele simula fiat recebido e acompanha a liquidacao.

Na parte on-chain, o StellarService constroi XDRs. Para aceitar TESOURO usa changeTrust. Para entrega e conversao usa payment ou pathPayment. O backend assina o XDR e submete no Horizon Testnet, retornando um hash.

Agora vou rodar pelo terminal o fluxo end-to-end, sem UI: customer, quote, trustline, order, simulate fiat, status e saldo antes/depois.

Aqui esta o JSON com customer, quote, order, instrucoes PIX, status completed, delta de saldo e hash. Agora abrindo o hash no Stellar Expert Testnet, da para verificar a transacao no ledger.

A UI so consome essas rotas. A integracao avaliada esta no backend e nas chamadas para anchor e Stellar Testnet.
```

## Checklist Final Antes de Enviar

Marque todos:

- [ ] Mostrei a frase da rejeicao e expliquei que este video e tecnico.
- [ ] Mostrei `STELLAR_NETWORK=TESTNET`.
- [ ] Mostrei `STELLAR_HORIZON_URL=https://horizon-testnet.stellar.org`.
- [ ] Mostrei `ETHERFUSE_BASE_URL=https://api.sand.etherfuse.com`.
- [ ] Mostrei que a API key Etherfuse fica no backend.
- [ ] Mostrei `ramp.router.ts` com `/api/ramp/etherfuse/...`.
- [ ] Mostrei `client.ts` chamando `/ramp/onboarding-url`, `/ramp/quote`, `/ramp/order` e `/ramp/order/fiat_received`.
- [ ] Mostrei `AnchorService` criando customer, quote, trustline e ordem.
- [ ] Mostrei `StellarService` com `changeTrust`, `payment` ou `pathPayment`.
- [ ] Mostrei `signAndSubmitXdr`.
- [ ] Rodei um `curl` no terminal.
- [ ] Mostrei logs do backend.
- [ ] Mostrei `order_id` ou `transaction.id`.
- [ ] Mostrei hash de transacao.
- [ ] Abri o hash no Stellar Expert Testnet.
- [ ] Mostrei a UI apenas no final, se mostrar.

## Erros Que Devem Ser Evitados

- Nao grave so a tela do produto.
- Nao esconda o terminal e os logs.
- Nao diga que e dinheiro real; e sandbox/testnet.
- Nao diga que ha Soroban se voce nao mostrar uma chamada Soroban.
- Nao mostre `ETHERFUSE_API_KEY` real.
- Nao mostre private keys, secrets do Vault, Supabase service role key ou `BRL_DISTRIBUTOR_SECRET`.
- Nao chame o PIX sandbox de PIX bancario real.
- Nao deixe o avaliador procurando o hash: copie o hash e abra no explorer durante o video.
