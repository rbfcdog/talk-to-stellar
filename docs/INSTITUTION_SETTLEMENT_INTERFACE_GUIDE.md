# Guia da interface - infraestrutura entre instituicoes

Este guia mostra como usar a tela `/institution-settlement` para demonstrar a infraestrutura de uma rota entre duas instituicoes:

```text
Instituicao origem em BRL
-> Etherfuse PIX/on-ramp
-> conversao BRL para USDC
-> settlement em Stellar
-> off-ramp/prova de destino
-> instrucao para instituicao destino
-> reconciliacao e metricas
```

A tela nao deve ser apresentada como uma remessa bancaria real em producao. Ela e uma bancada operacional para provar que o backend consegue criar quote, registrar funding, anexar evidencia blockchain, preparar/validar off-ramp e comparar valor inicial contra valor final.

## URL

Use:

```text
/institution-settlement
```

A rota antiga tambem funciona:

```text
/international-transfer
```

## Pre-requisitos

Backend minimo:

```bash
STELLAR_NETWORK=TESTNET
USDC_ASSET_CODE=USDC
USDC_ASSET_ISSUER=issuer_configurado
ETHERFUSE_API_KEY=api_sand:...
ETHERFUSE_WEBHOOK_SECRET=segredo_compartilhado
PAYOUT_PROVIDER=etherfuse
INTERNATIONAL_TRANSFER_ENABLE_MOCK_PIX=true
ETHERFUSE_SANDBOX_PIX_FALLBACK=true
ENABLE_REAL_PAYOUT_EXECUTION=false
```

Frontend minimo:

```bash
BACKEND_URL=https://seu-backend
NEXT_PUBLIC_BACKEND_URL=https://seu-backend
```

Banco:

Rode a migration:

```bash
backend/migrations/20260520_00_international_usd_transfers.sql
```

Se a tela mostrar erro de `international_transfer_quotes` no schema cache, a migration ainda nao foi aplicada no Supabase usado pelo backend.

## O que preencher

### Source amount

Valor em BRL que a instituicao origem quer enviar pela rota.

Exemplo:

```text
1000
```

### Origin institution

Nome da instituicao ou entidade pagadora.

Exemplo:

```text
Origin BR Institution Ltda
```

### Origin ops email

Email operacional usado para registrar contexto da origem.

### Destination institution

Nome da instituicao ou conta destino.

Exemplo:

```text
Destination USD Institution LLC
```

### Destination provider

Banco, parceiro ou provedor da conta destino.

Exemplo:

```text
Destination USD Banking Partner
```

### Routing / Account / Account type / Country

Dados genericos da conta internacional. A interface mascara dados sensiveis nos logs.

### Destination account profile

Use apenas como etiqueta operacional:

- `Other`: conta internacional generica.
- `USD account provider`: conta compativel com dados USD.
- `Mercury`: perfil Mercury.
- `Revolut`: perfil Revolut.

### Destination adapter

Escolha como a perna de destino sera representada:

- `Etherfuse off-ramp proof`: prepara prova de off-ramp usando o adapter Etherfuse.
- `Mock USD instruction`: cria instrucao mock, sem prova Etherfuse.
- `Circle compatibility`: monta payload compativel com Circle, sem execucao real por padrao.
- `Bridge compatibility`: monta payload compativel com Bridge, sem execucao real por padrao.

Para demonstrar infraestrutura entre instituicoes, use:

```text
Etherfuse off-ramp proof
```

### Mock source funding intent

Mantenha ligado para demo rapida.

Isso cria uma intencao PIX sandbox sem exigir pagamento real. O objetivo e testar a orquestracao, nao cobrar PIX real.

### Execute Etherfuse off-ramp sandbox proof

Use desligado para demo segura inicial.

Use ligado somente se voce tiver:

- sessao valida;
- session token;
- PIN da wallet;
- ambiente Etherfuse sandbox configurado.

Quando ligado, a interface tenta executar a prova sandbox de off-ramp da Etherfuse. O PIN e token sao redigidos nos logs da UI.

## Fluxo recomendado para demonstracao

### 1. Clique em `Run complete sandbox route`

Esse e o caminho mais simples para mostrar tudo.

A interface executa:

```text
quote
-> route record
-> source funding intent
-> funding webhook
-> blockchain settlement
-> destination/off-ramp instruction
-> reconciliation
```

Use este botao quando quiser mostrar o fluxo completo em uma demo.

### 2. Observe o `Guided path`

O painel mostra as etapas:

```text
Quote -> Route -> Funding -> Blockchain -> Destination
```

O que cada etapa prova:

- `Quote`: o backend calculou BRL para USD.
- `Route`: o backend criou o registro da operacao entre instituicoes.
- `Funding`: a origem foi financiada via evento PIX/Etherfuse ou mock sandbox.
- `Blockchain`: o settlement USDC foi registrado com hash/memo ou evidencia mockada.
- `Destination`: a instrucao de destino/off-ramp foi criada.

### 3. Veja `Before and after fees/taxes`

Esse painel e o principal para explicar transparencia de custos.

Ele separa:

- `Before fees`: USD teorico bruto antes da rota consumir qualquer custo.
- `Fees deducted`: soma empirica dos custos observados na rota.
- `After fees`: USD liquido estimado que chega na instrucao de destino.
- `Traditional benchmark`: economia estimada contra uma referencia tradicional de FX.

O bloco `Cost bridge` mostra a ponte numerica:

```text
Gross USD before route costs
- Source on-ramp fee, se retornada pelo provider
- TalkToStellar transaction fee
- Destination off-ramp/payout fee, se retornada pelo provider
- Tax/IOF, se retornado/configurado pelo provider
- Other route delta, se o gross-to-net mostrar custo nao explicado por uma linha explicita
= Net USD after fees
```

Importante para a demo:

```text
A taxa da rota nao e fixa. Ela e calculada a partir do quote/on-ramp Etherfuse, metadata/off-ramp do provider e delta bruto-liquido da reconciliacao. Se o sandbox nao retorna fee, IOF ou imposto, a UI mostra "pending provider quote" ou "not returned by provider" em vez de inventar valor.
```

### 4. Veja `Source value`, `Baseline USD`, `Destination value`, `Route delta`

Esses cards sao a parte mais importante para explicar economia da rota.

- `Source value`: valor inicial em BRL.
- `Baseline USD`: valor teorico antes de custos.
- `Destination value`: valor final estimado apos custos.
- `Route delta`: diferenca entre baseline e destino.

Exemplo de explicacao:

```text
Aqui a tela compara o valor inicial em BRL contra o USD teorico antes de custos e contra o USD final depois da rota. O delta mostra quanto a infraestrutura consumiu em fee/spread estimado.
```

### 5. Veja `On/off ramp proof`

Esse painel explica as duas pontas fora da blockchain:

- `On-ramp`: entrada via Etherfuse PIX funding.
- `Off-ramp`: prova ou payload para retirar da perna blockchain e preparar destino.

Se `Execute Etherfuse off-ramp sandbox proof` estiver desligado, a tela prepara a instrucao.

Se estiver ligado e houver credenciais, ela tenta executar a prova sandbox.

### 6. Veja `Metric validation`

Esse painel valida se os numeros fazem sentido.

Checks esperados:

- `Source amount is valid`
- `FX rate is valid`
- `Final value is non-negative`
- `Fees explain the route delta`
- `Retention is in expected range`

Se todos estiverem validos, o backend e a UI concordam que:

```text
valor inicial - fees estimadas = valor final esperado
```

### 7. Veja `Evidence checklist`

Esse painel mostra se as evidencias principais existem:

- Quote ID
- Settlement ID
- Funding reference
- Funding status
- Blockchain hash
- Blockchain memo
- Destination instruction
- Destination provider ID
- Reconciliation
- Same-name check

Para uma demo forte, tente chegar no maximo possivel de itens completos.

### 8. Veja `Institution value route`

Esse painel e a narrativa visual:

```text
Origin institution
-> Blockchain settlement
-> Destination institution
```

Use para explicar que a proposta nao e "substituir banco", mas conectar instituicoes por uma rota mais programavel e rastreavel.

### 9. Veja os JSONs tecnicos

Os cards `Quote`, `Settlement record` e `Reconciliation` mostram o que o backend persistiu.

Use `Reconciliation` para mostrar:

- `on_off_ramp`
- `metrics`
- `metric_validation`
- `stellar_settlement`
- `payout_instruction`

Os dados sensiveis como PIN, tokens e account number sao redigidos na UI.

### 10. Veja `Execution stream` e `API log`

Esses paineis mostram as chamadas ao backend.

Principais endpoints:

```text
POST /api/quotes/brl-usd
POST /api/transfers
POST /api/transfers/:id/pix-intent
POST /api/webhooks/etherfuse/pix
POST /api/transfers/:id/settle-stellar
POST /api/transfers/:id/payout-instruction
GET  /api/transfers/:id/reconciliation
```

Eles sao uteis para provar que a UI nao e apenas mock visual. Ela chama endpoints reais da aplicacao.

## Fluxo manual, etapa por etapa

Use quando quiser explicar cada chamada separadamente.

1. Clique `Quote`.
   - Cria a cotacao BRL para USD.
   - Endpoint: `POST /api/quotes/brl-usd`.

2. Clique `Route`.
   - Cria o registro da rota entre instituicoes.
   - Endpoint: `POST /api/transfers`.

3. Clique `Funding intent`.
   - Cria a intencao de funding via Etherfuse PIX ou mock sandbox.
   - Endpoint: `POST /api/transfers/:id/pix-intent`.

4. Clique `Funding confirmed`.
   - Simula o webhook de PIX recebido.
   - Endpoint: `POST /api/webhooks/etherfuse/pix`.

5. Clique `Blockchain`.
   - Anexa evidencia de settlement USDC em Stellar.
   - Endpoint: `POST /api/transfers/:id/settle-stellar`.

6. Clique `Destination`.
   - Cria instrucao de off-ramp/destino.
   - Endpoint: `POST /api/transfers/:id/payout-instruction`.

7. Clique `Reconciliation`.
   - Carrega a evidencia final da rota.
   - Endpoint: `GET /api/transfers/:id/reconciliation`.

## Como explicar em uma demo

Roteiro curto:

```text
Esta tela mostra a infraestrutura de uma rota entre duas instituicoes. A origem entra com BRL, o backend cria uma quote BRL/USD, o funding e representado por Etherfuse PIX, o valor passa pela perna Stellar como USDC, e depois o sistema cria uma instrucao de off-ramp/destino. A parte importante e que cada etapa gera evidencia: IDs da quote, referencia de funding, hash/memo de blockchain, provider payout ID e reconciliacao. No fim, a tela valida as metricas para comparar valor inicial, valor teorico em USD, valor final e delta de custos.
```

Roteiro tecnico:

```text
O backend usa BrlUsdQuoteService para cotacao, PixFundingService para encapsular Etherfuse, InternationalTransferService para estado da operacao, StellarSettlementService para evidencia blockchain, PayoutProviderAdapter para destino/off-ramp, e SettlementEvidenceService para reconciliacao e metricas. A UI apenas orquestra esses endpoints e mostra o estado operacional.
```

## O que dizer que e real

- Backend e endpoints reais do projeto.
- Registro persistido em Supabase.
- Quote service real com pathfinding/fallback.
- Adapter Etherfuse para on-ramp PIX.
- Adapter Etherfuse para preparar prova de off-ramp.
- Evidencia de settlement Stellar real ou mockada conforme env.
- Reconciliation real com metricas e validacao.

## O que dizer que e sandbox/mock

- `Mock source funding intent` nao cobra PIX real.
- Off-ramp Etherfuse sem PIN apenas prepara payload.
- Circle/Bridge nao executam payout real sem credenciais e `ENABLE_REAL_PAYOUT_EXECUTION=true`.
- A tela nao faz ACH/wire real.
- A tela nao afirma compliance, licenca ou money transmission em producao.

## Troubleshooting

### Erro: `international_transfer_quotes` no schema cache

Rode:

```bash
backend/migrations/20260520_00_international_usd_transfers.sql
```

no Supabase correto.

### `Funding intent` falha

Para demo rapida:

```text
Mock source funding intent = ligado
INTERNATIONAL_TRANSFER_ENABLE_MOCK_PIX=true
```

Para Etherfuse real:

- confira `ETHERFUSE_API_KEY`;
- confira session id/token;
- confira KYC/onboarding do usuario.

### Off-ramp Etherfuse nao executa

Verifique:

- `Execute Etherfuse off-ramp sandbox proof` ligado;
- `Session ID` preenchido;
- `Session token` preenchido;
- `Wallet PIN for off-ramp` preenchido;
- `ETHERFUSE_SANDBOX_PIX_FALLBACK=true`;
- ambiente Etherfuse sandbox.

### Metric validation mostra `check`

Olhe:

- `Quote.total_fee`;
- `Route delta`;
- `Reconciliation.evidence.metrics`;
- `Reconciliation.evidence.metric_validation`.

O objetivo e que o custo implicito do delta seja explicado pelas linhas empiricas: on-ramp, TalkToStellar, off-ramp/payout, tax/IOF quando houver, e delta residual quando o provider ainda nao separou tudo.
