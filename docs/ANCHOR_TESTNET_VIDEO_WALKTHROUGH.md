# VP com Ancora no Testnet - Roteiro Detalhado com Timestamps

Este roteiro e para regravar a submissao rejeitada.

Motivo da rejeicao:

> O video que voces subiram e a demo do produto (entregavel do desafio 4), so que o que queremos avaliar nesse momento e o video mostrando o fluxo da integracao (chamadas de contrato, ancoras, no backend mesmo).

O avaliador quer ver **integracao tecnica**, nao a experiencia final do usuario. Mostre codigo, terminal, logs, chamadas para a anchor, XDR, trustline, submissao no Horizon Testnet e hash no explorer.

## Resumo do Que Voce Precisa Provar

Voce precisa provar cinco coisas:

1. O backend esta configurado para Stellar Testnet e Etherfuse sandbox.
2. O backend chama a anchor Etherfuse de verdade.
3. O backend cria customer, quote, ordem PIX e consulta status da ordem.
4. O backend executa a parte on-chain: trustline, XDR, assinatura e submissao no Horizon Testnet.
5. O resultado gera um hash verificavel no Stellar Expert Testnet.

Nao tente vender o produto. Explique o pipeline.

## Glossario Para Falar no Video

Use estas definicoes quando aparecerem os termos tecnicos.

**Anchor**

Uma anchor e uma empresa ou servico que conecta dinheiro tradicional com Stellar. Neste fluxo, a Etherfuse atua como anchor: ela recebe/simula o lado fiat/PIX e coordena a emissao ou liquidacao do ativo na Stellar.

**Etherfuse sandbox**

Sandbox e o ambiente de testes da Etherfuse. Ele permite testar onboarding, quote, ordem e simulacao de fiat recebido sem dinheiro real. E por isso que o video deve dizer "PIX sandbox/testnet", nao "PIX real".

**Testnet**

Testnet e a rede de testes da Stellar. As transacoes usam ledger real de teste, mas nao representam dinheiro real. A prova tecnica vem do hash na Testnet.

**Horizon**

Horizon e a API da Stellar usada pelo backend para ler contas, construir contexto de transacao e submeter transacoes assinadas. Neste projeto, o endpoint e `https://horizon-testnet.stellar.org`.

**Asset**

Asset e um token emitido na Stellar. Aqui aparecem `TESOURO`, `BRL` e `USDC`. Cada asset emitido tem um `code` e um `issuer`.

**Issuer**

Issuer e a conta Stellar que emite um asset. Um asset emitido na Stellar e identificado por `CODE:ISSUER`, por exemplo `TESOURO:GC3...`.

**TESOURO**

TESOURO e o asset usado pela Etherfuse como ativo de liquidacao no sandbox. O usuario pode ver BRL/USDC na experiencia final, mas internamente a anchor pode liquidar com TESOURO e o backend converter depois.

**Customer**

Customer e o registro do usuario na anchor. Antes de criar uma ordem de ramp, a Etherfuse precisa conhecer o usuario/customer, wallet e dados de onboarding/KYC.

**KYC**

KYC significa "Know Your Customer". E o processo de identificacao do usuario exigido por provedores financeiros. No sandbox, o backend usa dados programaticos/teste para destravar o fluxo.

**Quote**

Quote e uma cotacao. Ela define quanto entra e quanto sai no fluxo, por exemplo BRL para TESOURO. Quotes costumam expirar rapido, entao o backend pode renovar antes de criar a ordem.

**Order / Ordem**

Order e a ordem criada na anchor. No on-ramp, ela representa a intencao de colocar dinheiro via PIX e receber asset na Stellar.

**On-ramp**

On-ramp e entrada de dinheiro tradicional para cripto/asset na Stellar. Neste video: PIX/BRL sandbox entrando e asset chegando na wallet Stellar Testnet.

**Off-ramp**

Off-ramp e saida de cripto/asset para dinheiro tradicional. Exemplo: TESOURO saindo da wallet e BRL/PIX sendo pago fora da blockchain.

**Trustline**

Trustline e a autorizacao que uma conta Stellar precisa criar para receber um asset emitido. Sem trustline, a wallet nao consegue receber TESOURO/BRL/USDC emitido.

**XDR**

XDR e o formato serializado da transacao Stellar. O backend constroi o XDR, assina com a chave correta e submete ao Horizon.

**Assinatura**

Assinatura e a prova criptografica de que a conta autorizou a transacao. Neste projeto, a private key nao vai para a anchor nem para o frontend; a assinatura acontece no backend.

**Hash**

Hash e o identificador da transacao depois que ela e aceita no ledger. O hash e a prova externa: voce abre no Stellar Expert Testnet e verifica a transacao.

**Soroban**

Soroban e a plataforma de smart contracts da Stellar. Este repo nao demonstra chamada Soroban neste fluxo. Nao diga que ha Soroban se voce nao mostrar uma chamada Soroban. Diga "operacoes Stellar via XDR/Horizon".

## Duracao Alvo

Grave entre **8 e 10 minutos**. Se precisar ficar mais curto, preserve as secoes de codigo e terminal.

## Setup Antes de Gravar

Abra antes de apertar Rec:

1. VS Code na raiz do repo.
2. Terminal 1 com backend:

```bash
cd backend
npm run dev
```

3. Terminal 2 para os comandos `curl`.
4. Browser no Stellar Expert Testnet:

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

## Timeline Detalhada

### 00:00 - 00:35 | Abertura: deixar claro que nao e demo de produto

**Mostrar na tela**

- Este arquivo: `docs/ANCHOR_TESTNET_VIDEO_WALKTHROUGH.md`
- A frase da rejeicao no topo.

**Falar exatamente**

> Este video substitui a submissao rejeitada. A rejeicao dizia que o video anterior era uma demo do produto, mas o que precisa ser avaliado agora e o fluxo de integracao. Entao eu vou mostrar o backend: configuracao de Testnet, client da anchor Etherfuse, rotas de ramp, criacao de customer, quote e ordem, trustline, XDR assinado, submissao no Horizon Testnet e hash no Stellar Expert.

**Explicacao detalhada**

Aqui voce esta alinhando expectativa. A banca quer saber se existe integracao real por tras da interface. Por isso, comece dizendo que a UI nao e o foco e que o video vai mostrar o caminho tecnico ponta a ponta.

**Termos para explicar**

- "Backend" e o servidor que guarda secrets e executa integracoes.
- "Anchor" e o provedor financeiro que conecta fiat/PIX com Stellar.
- "Hash" e a prova final no explorer.

**Evite dizer**

- "Vou mostrar o app funcionando."
- "Vou fazer uma demo rapida."

Prefira:

- "Vou mostrar o fluxo tecnico de integracao."

### 00:35 - 01:25 | Configuracao: Testnet, Etherfuse sandbox e asset TESOURO

**Mostrar na tela**

Abra:

- `backend/.env.example`
- `backend/src/config/stellar.ts`
- `backend/src/config/assets.ts`

Mostre:

```text
STELLAR_NETWORK=TESTNET
STELLAR_HORIZON_URL=https://horizon-testnet.stellar.org
ETHERFUSE_BASE_URL=https://api.sand.etherfuse.com
ETHERFUSE_BLOCKCHAIN=stellar
TESOURO_ISSUER=GC3CW7EDYRTWQ635VDIGY6S4ZUF5L6TQ7AA4MWS7LEQDBLUSZXV7UPS4
```

**Falar exatamente**

> Aqui esta a configuracao da integracao. `STELLAR_NETWORK=TESTNET` garante que as transacoes vao para a rede de testes da Stellar. `STELLAR_HORIZON_URL` aponta para o Horizon da Testnet, que e a API usada para submeter e consultar transacoes. A anchor e a Etherfuse sandbox, configurada em `ETHERFUSE_BASE_URL`. O blockchain configurado para a anchor e `stellar`. O asset de liquidacao da Etherfuse neste fluxo e `TESOURO`, identificado pelo issuer configurado no backend.

Continue:

> A API key da Etherfuse nao aparece no frontend. Ela fica no backend porque e uma credencial sensivel. Isso e importante: a integracao com a anchor e server-side.

**Explicacao detalhada**

Esta secao prova o ambiente. Sem ela, o avaliador pode achar que a tela esta mockada ou que o fluxo nao e Testnet. Mostre que o backend sabe qual rede usar, qual Horizon chamar, qual anchor chamar e qual asset receber.

**Significado dos termos**

- `STELLAR_NETWORK=TESTNET`: seleciona a rede de testes.
- `Horizon`: API oficial para interagir com Stellar classic operations.
- `ETHERFUSE_BASE_URL`: endpoint HTTP da anchor.
- `TESOURO_ISSUER`: conta emissora do asset TESOURO.
- `Issuer`: conta que define a identidade do asset junto com o code.

**O que esta secao prova**

- A integracao esta em ambiente de teste correto.
- A anchor e Etherfuse sandbox, nao mock local.
- O ativo e issuer estao configurados no servidor.
- Secrets ficam no backend.

### 01:25 - 02:15 | Rotas do backend: superficie da integracao

**Mostrar na tela**

Abra:

```text
backend/src/api/routes/ramp.router.ts
```

Mostre:

```ts
router.get('/etherfuse/config', ...)
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

**Falar exatamente**

> Esta e a superficie HTTP da integracao no backend. Cada rota representa uma etapa do fluxo. `customer` cria ou recupera o usuario na anchor. `quote` pede uma cotacao. `trustline` prepara a wallet para receber o asset. `onramp` cria a ordem PIX na Etherfuse. `onramp/:orderId` consulta o status. `sandbox/simulate-fiat` simula que o PIX foi recebido no ambiente sandbox. E `sandbox/test-onramp` executa o fluxo inteiro em uma chamada para demonstracao tecnica.

**Explicacao detalhada**

Esta secao mostra que existe uma API propria para a integracao. O frontend nao conversa direto com a Etherfuse; ele chama o backend. Isso protege API keys e centraliza regras de negocio.

**Significado dos termos**

- `router`: mapeia URLs HTTP para controllers.
- `POST`: usado quando a chamada cria ou executa algo.
- `GET`: usado para consultar status/configuracao.
- `onramp/:orderId`: `:orderId` e um parametro dinamico na URL.

**O que esta secao prova**

- A integracao e acionada por endpoints reais.
- O backend tem etapas separadas para customer, quote, trustline e ordem.
- Existe endpoint de demonstracao para provar o fluxo end-to-end sem UI.

**Evite dizer**

- "Essas rotas sao da tela."

Prefira:

- "A tela apenas consome essas rotas; a integracao esta aqui."

### 02:15 - 03:25 | Client Etherfuse: chamadas externas para a anchor

**Mostrar na tela**

Abra:

```text
backend/src/integrations/regional-starter-pack/anchors/etherfuse/client.ts
```

Mostre:

```ts
private async request<T>(...)
Authorization: this.config.apiKey
```

Depois mostre:

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

E os endpoints:

```text
POST /ramp/onboarding-url
POST /ramp/quote
POST /ramp/order
GET /ramp/order/{id}
GET /ramp/assets
POST /ramp/customer/{customerId}/wallet
POST /ramp/wallet
POST /ramp/customer/{customerId}/kyc
POST /ramp/customer/{customerId}/kyc/documents
POST /ramp/order/fiat_received
```

**Falar exatamente**

> Este arquivo e o client da Etherfuse. Ele encapsula as chamadas HTTP para a anchor. O metodo `request` monta a URL da Etherfuse, envia JSON e injeta o header `Authorization` com a API key que fica no backend. Aqui aparecem os endpoints reais da anchor: onboarding, quote, order, consulta de order, assets, registro de wallet, KYC e simulacao de fiat recebido.

Continue:

> `createCustomer` cria o relacionamento do usuario com a anchor. `getQuote` pede a cotacao. `createOnRamp` cria a ordem de entrada. `getOnRampTransaction` consulta o status. `registerCustomerWallet` registra a wallet Stellar do usuario na anchor. `simulateFiatReceived` chama o endpoint sandbox que representa o PIX recebido.

**Explicacao detalhada**

Esta e uma das partes mais importantes do video. Ela prova que o backend nao esta inventando uma resposta. Existe um client que chama endpoints da Etherfuse e transforma as respostas em objetos internos do produto.

**Significado dos termos**

- `Authorization`: header HTTP usado para autenticar a API key.
- `client`: classe que concentra chamadas para um servico externo.
- `onboarding-url`: URL/fluxo de cadastro/KYC na anchor.
- `wallet registration`: registro da conta Stellar que vai receber ou enviar assets.
- `fiat_received`: endpoint sandbox para simular que o dinheiro fiat chegou.

**O que esta secao prova**

- Ha chamadas externas reais para a anchor.
- A API key fica protegida no backend.
- O fluxo inclui KYC, assets, wallet, quote e order.
- O sandbox simula o evento financeiro sem dinheiro real.

**Evite dizer**

- "A gente gera PIX aqui."

Prefira:

- "O backend cria uma ordem na anchor e, no sandbox, simula o fiat recebido."

### 03:25 - 04:50 | AnchorService: orquestracao do fluxo

**Mostrar na tela**

Abra:

```text
backend/src/api/services/anchor.service.ts
```

Mostre nesta ordem:

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

**Falar exatamente**

> O `AnchorService` e o orquestrador. Ele junta tres mundos: a sessao TalkToStellar, a anchor Etherfuse e a Stellar Testnet. Primeiro ele valida `session_id` e `session_token`, porque o backend precisa ter certeza de qual usuario esta operando. Depois ele resolve a wallet Stellar desse usuario. Com a wallet resolvida, ele cria ou recupera o customer na Etherfuse, registra a wallet, prepara onboarding/KYC, pede uma quote, garante a trustline e cria a ordem de on-ramp.

Continue:

> A anchor nunca recebe a private key do usuario. A private key tambem nao vai para o frontend. Quando o fluxo precisa de uma transacao on-chain, o backend constroi e assina o XDR no servidor. Isso separa a parte off-chain da anchor da parte on-chain da Stellar.

**Explicacao detalhada**

O client Etherfuse sabe chamar a anchor, mas ele nao sabe toda a regra do produto. O `AnchorService` e onde o fluxo vira uma sequencia coerente: validar sessao, preparar usuario, garantir que a wallet consegue receber asset, criar ordem e acompanhar liquidacao.

**Significado dos metodos**

- `createCustomerForSession`: valida a sessao e cria/recupera customer na anchor.
- `getQuoteForSession`: cria quote de ramp. No on-ramp, normalmente BRL entra e TESOURO sai.
- `ensureTesouroTrustlineForSession`: garante que a wallet aceita TESOURO.
- `ensureIssuedAssetTrustline`: funcao generica para trustline de assets emitidos.
- `createOnRampForSession`: cria a ordem PIX depois de preparar customer, quote e trustline.
- `simulateFiatReceivedForSession`: dispara a simulacao sandbox de fiat recebido.
- `runTemporarySandboxOnRampTest`: executa customer -> quote -> trustline -> order -> simulate -> status -> balances.
- `maybeAutoConvertCompletedOnRamp`: converte TESOURO para BRL/USDC se o usuario pediu outro asset final.

**Significado dos termos**

- `session_id`: identificador da sessao do usuario no TalkToStellar.
- `session_token`: prova de posse da sessao.
- `orquestrador`: camada que coordena varias dependencias em uma ordem correta.
- `off-chain`: chamadas HTTP/API fora da blockchain, como Etherfuse.
- `on-chain`: transacao gravada na rede Stellar.

**O que esta secao prova**

- O backend controla o fluxo inteiro.
- A wallet real do usuario entra na integracao.
- A ordem da anchor depende de preparacao on-chain.
- Private key nao e exposta para anchor ou frontend.

### 04:50 - 06:10 | StellarService: XDR, trustline, assinatura e Horizon

**Mostrar na tela**

Abra:

```text
backend/src/api/services/stellar.service.ts
```

Mostre:

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

**Falar exatamente**

> Agora estou mostrando a parte on-chain. O `StellarService` constroi transacoes Stellar. Para receber um asset emitido, a wallet primeiro precisa de uma trustline. Isso aparece em `buildTrustlineXdr`, que usa `Operation.changeTrust`. Depois, para entregar ou converter asset, o backend usa `payment`, `pathPaymentStrictReceive` ou `pathPaymentStrictSend`.

Continue:

> O formato da transacao e XDR. O backend transforma o XDR em transacao, assina com a chave correta e chama `server.submitTransaction`, que envia para o Horizon Testnet. Quando o Horizon aceita a transacao, ele retorna um hash. Esse hash e o que eu vou abrir no explorer.

**Explicacao detalhada**

Esta secao responde diretamente a parte "chamadas de contrato" da rejeicao. Como este fluxo nao usa Soroban, voce precisa ser preciso: diga que a evidencia on-chain aqui sao operacoes Stellar classic via XDR e Horizon. Isso ainda e uma chamada real ao ledger, so nao e smart contract Soroban.

**Significado dos termos**

- `Operation.changeTrust`: operacao Stellar que cria permissao para receber asset emitido.
- `Operation.payment`: pagamento direto de um asset.
- `pathPaymentStrictReceive`: envia o necessario para o destino receber um valor exato.
- `pathPaymentStrictSend`: envia um valor exato e calcula quanto o destino recebe.
- `TransactionBuilder`: construtor de transacoes Stellar.
- `fromXDR`: transforma XDR serializado em objeto de transacao.
- `transaction.sign`: assina a transacao.
- `submitTransaction`: envia a transacao assinada ao Horizon.

**Falar sobre Soroban**

> Neste repo nao existe chamada Soroban neste fluxo. Entao eu nao vou chamar isso de smart contract Soroban. A prova on-chain aqui e Stellar classic operation: trustline, payment e path payment, serializadas como XDR e submetidas ao Horizon Testnet.

**O que esta secao prova**

- Existe transacao on-chain real.
- O backend cria XDR.
- O backend assina transacao.
- O backend submete para Horizon Testnet.
- O hash retornado pode ser auditado fora do app.

### 06:10 - 07:40 | Executar o fluxo end-to-end no terminal

**Mostrar na tela**

Terminal do backend com logs visiveis.

Terminal de `curl`:

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

Sem `jq`:

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

**Falar exatamente antes de rodar**

> Agora vou executar o fluxo pelo terminal, sem usar a UI. Este endpoint temporario e para demonstracao tecnica: ele roda customer, quote, trustline, ordem, simulacao de fiat recebido, polling de status e comparacao de saldo antes/depois.

**Mostrar no JSON**

Destaque:

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

**Explicar cada campo**

- `customer.id`: identificador do usuario na anchor Etherfuse.
- `quote.id`: identificador da cotacao usada para criar a ordem.
- `transaction.id`: identificador da ordem de ramp na Etherfuse.
- `paymentInstructions.type = "pix"`: mostra que a ordem e de trilho PIX no sandbox.
- `simulation.success`: mostra que o evento de fiat recebido foi simulado com sucesso.
- `final_transaction.status = "completed"`: mostra que a ordem chegou ao estado final.
- `delivery_hash` ou `stellarTxHash`: hash da transacao Stellar resultante.
- `balances_before`: saldo antes da liquidacao.
- `balances_after`: saldo depois da liquidacao.
- `balance_delta`: diferenca que prova alteracao no saldo.

**Mostrar nos logs**

Procure:

```text
[Etherfuse] POST https://api.sand.etherfuse.com/ramp/onboarding-url
[Etherfuse] POST https://api.sand.etherfuse.com/ramp/quote
[Etherfuse] POST https://api.sand.etherfuse.com/ramp/order
[Etherfuse] POST https://api.sand.etherfuse.com/ramp/order/fiat_received
```

**Falar depois da resposta**

> Esta resposta junta a prova off-chain e on-chain. Off-chain: customer, quote, order e fiat_received vieram da integracao com a Etherfuse. On-chain: o backend garantiu trustline, assinou/submeteu transacao e retornou hash na Stellar Testnet. O saldo antes/depois mostra o efeito final na wallet.

**O que esta secao prova**

- A integracao executa sem UI.
- A anchor foi chamada.
- A ordem foi criada.
- A simulacao sandbox foi acionada.
- A transacao gerou hash verificavel.

### 07:40 - 08:30 | Abrir o hash no Stellar Expert Testnet

**Mostrar na tela**

Copie:

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
- Asset (`TESOURO`, `BRL` ou `USDC`).
- Source account.
- Destination account.

**Falar exatamente**

> Este e o hash retornado pelo backend. Eu abri no Stellar Expert Testnet, fora da aplicacao. Aqui da para ver que a transacao existe na rede de testes da Stellar. Esta e a evidencia externa de que o fluxo nao parou na API da anchor: ele chegou no ledger Testnet.

**Explicacao detalhada**

Essa e a prova mais objetiva do video. Se o avaliador so viu tela, pode desconfiar. Se ele ve hash no explorer, source/destination e operations, consegue auditar a parte on-chain.

**O que esta secao prova**

- O hash e verificavel fora do app.
- A transacao foi submetida na Testnet.
- A integracao backend/anchor resultou em efeito on-chain.

### 08:30 - 09:10 | Mostrar as chamadas separadas

**Mostrar na tela**

Mostre estes comandos em um arquivo ou terminal. Nao precisa rodar todos se o tempo estiver curto; explique que o endpoint anterior compacta este pipeline.

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

**Falar exatamente**

> O endpoint `sandbox/test-onramp` compacta o fluxo para facilitar a gravacao. Estas sao as chamadas separadas: config, customer, quote, trustline, onramp, simulate-fiat e polling de status. Isso mostra que o fluxo nao e uma caixa preta.

**Explicacao detalhada**

Essa secao ajuda se o avaliador quiser ver granularidade. O endpoint temporario nao substitui o fluxo real; ele encadeia as mesmas operacoes para demonstracao.

### 09:10 - 09:35 | UI apenas como evidencia complementar

**Mostrar na tela**

Abra rapidamente:

```text
frontend/app/api/ramp/[...path]/route.ts
frontend/app/pix-ramp/pix-ramp-client.tsx
```

Opcional:

```text
/pix-ramp
```

**Falar exatamente**

> A UI e apenas a camada visual. Ela chama as rotas que eu mostrei no backend para exibir QR PIX, status e saldo. A integracao avaliada esta no backend: Etherfuse client, AnchorService, StellarService, XDR, Horizon e hash no explorer.

**Evite**

- Passar mais de 20 segundos na UI.
- Clicar como se fosse uma demo de produto.

## Narracao Completa Para Ler

Se quiser usar como teleprompter, leia este texto:

```text
Este video substitui a submissao rejeitada. O video anterior parecia uma demo do produto, mas agora eu vou mostrar o fluxo tecnico de integracao no backend.

Primeiro, a configuracao. O backend esta em Stellar Testnet, usando Horizon Testnet. Horizon e a API usada para consultar e submeter transacoes Stellar. A anchor configurada e a Etherfuse sandbox, e sandbox significa ambiente de teste sem dinheiro real. O asset de liquidacao da anchor e TESOURO, identificado por code e issuer. A API key da Etherfuse fica somente no backend.

Agora as rotas. A integracao esta em /api/ramp/etherfuse. Customer cria ou recupera o usuario na anchor. Quote pede cotacao. Trustline prepara a wallet para receber o asset. Onramp cria a ordem PIX na anchor. O status consulta a ordem. Simulate-fiat representa o PIX recebido no sandbox.

Este e o client Etherfuse. Ele faz chamadas HTTP para a anchor e injeta Authorization com a API key no servidor. Aqui aparecem os endpoints reais: onboarding-url, quote, order, assets, wallet registration, KYC e fiat_received.

Agora o AnchorService. Ele e o orquestrador: valida a sessao, resolve a wallet Stellar, cria customer, registra wallet, prepara KYC/proxy PIX, pede quote, garante trustline e cria a ordem. A anchor nao recebe private key. A assinatura de transacao fica no backend.

Agora a parte on-chain. O StellarService constroi XDRs. XDR e o formato serializado da transacao Stellar. Para receber TESOURO, a wallet precisa de trustline, criada por changeTrust. Para entrega ou conversao, o backend usa payment ou pathPayment. O backend assina e submete ao Horizon Testnet. Este fluxo nao usa Soroban; a evidencia on-chain e Stellar classic operation via XDR/Horizon.

Agora vou rodar o fluxo no terminal, sem UI. O endpoint temporario executa customer, quote, trustline, order, simulate fiat, polling de status e saldo antes/depois.

Aqui no JSON aparecem customer id, quote id, transaction id, instrucoes PIX, simulation success, status completed, saldo antes/depois e hash. Nos logs aparecem as chamadas POST para a Etherfuse sandbox.

Agora abro o hash no Stellar Expert Testnet. Esta e a prova externa de que a transacao chegou ao ledger de testes da Stellar.

Por fim, a UI apenas consome essas rotas. O que foi avaliado aqui e a integracao backend-anchor-on-chain.
```

## Checklist Final Antes de Enviar

- [ ] Mostrei a frase da rejeicao e expliquei que este video e tecnico.
- [ ] Expliquei o que e anchor.
- [ ] Expliquei o que e sandbox.
- [ ] Expliquei o que e Testnet.
- [ ] Expliquei o que e Horizon.
- [ ] Expliquei o que e asset e issuer.
- [ ] Expliquei o que e trustline.
- [ ] Expliquei o que e XDR.
- [ ] Expliquei que nao e Soroban neste fluxo.
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
