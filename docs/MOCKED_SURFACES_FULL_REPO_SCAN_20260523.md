# Mocked surfaces full repo scan - 2026-05-23

Este documento mapeia tudo que aparece como mock, sandbox, simulado, fallback, placeholder, demo, fixture, testnet ou devnet no repo TalkToStellar.

O objetivo e separar o que realmente afeta runtime do produto daquilo que e apenas teste, documentacao, exemplo ou codigo legado. Isso evita duas confusoes perigosas:

- achar que um mock de teste Jest esta ativo no produto;
- apresentar um fluxo sandbox/demo como se fosse producao.

## Como o scan foi feito

Comando base usado:

```bash
rg -n -i "\b(mock|mocked|mocking|sandbox|stub|fake|simulate|simulated|simulation|dummy|placeholder|fallback|demo|fixture|sample|testnet|devnet)\b" \
  -g '!node_modules' \
  -g '!.next' \
  -g '!dist' \
  -g '!build' \
  -g '!coverage' \
  -g '!*.png' \
  -g '!*.pdf'
```

Escopo:

- 495 arquivos analisaveis depois de excluir dependencias, builds, cobertura, PNG e PDF.
- 183 arquivos com pelo menos um termo de mock/sandbox/fallback/testnet/demo.

Distribuicao dos arquivos encontrados:

| Area | Arquivos com matches |
| --- | ---: |
| `backend` | 101 |
| `docs` | 34 |
| `frontend` | 33 |
| `deprecated` | 5 |
| `telegram` | 4 |
| `sow` | 4 |
| `evolution` | 1 |
| `docker-compose.yml` | 1 |

Importante: este documento trata "mockado" em sentido amplo. Inclui mocks reais, sandbox, simulacao, fallback calculado, fixture de teste, placeholder visual, dados de demo e ambientes testnet/devnet.

## Resumo executivo

O projeto tem cinco grupos principais de mock/sandbox em runtime:

1. **PIX/Etherfuse sandbox**: o PIX atual no produto usa Etherfuse sandbox/devnet e varios helpers locais para simular/confirmar eventos que em producao viriam do provider.
2. **Rail institucional BRL -> USDC -> USD**: a tela `/international-transfer` e o backend de transferencias usam intents PIX mockadas, confirmacao sandbox, evidencia Stellar mockada quando nao ha chave configurada e payout USD mock/sandbox.
3. **Payout USD**: `mock`, `circle`, `bridge` e `etherfuse` existem como adapters, mas Circle/Bridge ficam em modo compatibilidade/sandbox sem execucao real se `ENABLE_REAL_PAYOUT_EXECUTION` nao estiver ligado e configurado.
4. **Cotacao, taxas e recibos com fallback**: algumas partes calculam valores usando fallback quando pathfinding, cotacao ou dados persistidos nao existem. Isso e util para resiliencia, mas precisa ser marcado como estimativa, nao dado real de mercado.
5. **UX/demo/labs**: landing simulator, global transfer lab, painel institucional e elementos de chat tem simuladores, contatos/acoes demo ou informacao de teste.

Os mocks de teste (`backend/tests`, `telegram/test`, `jest.setup`) nao afetam runtime. Eles sao esperados e saudaveis.

## Severidade por tipo

| Nivel | Categoria | Por que importa |
| --- | --- | --- |
| P0 | Fluxos sandbox que parecem producao | Podem confundir usuario/reviewer se nao tiver badge claro de sandbox/testnet. |
| P0 | Payout USD mockado | Nao existe ACH/wire real; o adapter cria instrucao, nao liquida dinheiro em banco. |
| P0 | Stellar settlement mock evidence | Pode registrar hash `mock-stellar-*` quando nao executou transacao real. |
| P1 | Fallback de cotacao/taxa | Pode gerar numero plausivel sem ser quote real do provider ou DEX. |
| P1 | Recibo gerado por hash fallback | Pode mostrar comprovante reconstruido quando o registro persistido nao existe. |
| P2 | Demo UI, placeholders e exemplos | Nao movem dinheiro, mas podem poluir demo se aparecerem no fluxo de usuario. |
| P3 | Test fixtures/Jest mocks | Nao sao problema; ficam restritos aos testes. |

## Superficies mockadas de runtime

### 1. Etherfuse PIX sandbox/devnet

Arquivos principais:

- `backend/src/api/services/anchor.service.ts`
- `backend/src/api/controllers/ramp.controller.ts`
- `backend/src/api/routes/ramp.router.ts`
- `frontend/app/pix-ramp/pix-ramp-client.tsx`

O que existe:

- Runtime detecta sandbox por API key/base URL (`api_sand:*`, `.sand.`, `sandbox`).
- `AnchorService.assertEtherfuseTestnetRuntime()` bloqueia PIX/TESOURO fora de Stellar Testnet.
- `getRuntimeInfo()` retorna `sandbox`, `available`, `testnet_only`, `stellar_network_id`.
- `resolveWalletByEmail` so e permitido para sandbox/devnet.
- Helpers de sandbox exigem `RAMP_SANDBOX_INTERNAL_SECRET` ou `INTERNAL_API_SECRET`.

Endpoints envolvidos:

```text
GET  /api/ramp/etherfuse/config
POST /api/ramp/etherfuse/resolve-wallet
POST /api/ramp/etherfuse/sandbox/simulate-fiat
POST /api/ramp/etherfuse/sandbox/transfer-recipient
POST /api/ramp/etherfuse/sandbox/pix-funded-transfer
POST /api/ramp/etherfuse/sandbox/test-onramp
POST /api/ramp/etherfuse/sandbox/test-offramp
```

Impacto:

- Este e o maior bloco sandbox real do app.
- Serve para demonstrar PIX, KYC, on-ramp, off-ramp e entrega de saldo em Testnet.
- Nao deve ser narrado como PIX bancario real de producao.

Como tornar real:

- Usar credenciais/produtos Etherfuse ou parceiro PIX em producao.
- Remover fallback local de QR/BR Code mockado.
- Confirmar pagamento apenas por webhook real do provider.
- Manter endpoints `/sandbox/*` fora da UI publica ou protegidos por flag/admin.

### 2. Fallback local de PIX on-ramp

Arquivo:

- `backend/src/api/services/anchor.service.ts`

O que e mockado:

- `createSandboxOnRampFallback()`
- IDs como `sandbox-pix-${uuid}`.
- PIX key `sandbox-...@etherfuse.dev`.
- Merchant/beneficiary `Etherfuse Sandbox`.
- QR/BR Code demonstrativo.
- In-memory maps `sandboxMockOnRampOrders`.
- Contexto persistido como sandbox.

Gatilhos:

- Runtime Etherfuse sandbox/devnet.
- `ETHERFUSE_SANDBOX_PIX_FALLBACK` habilitado ou nao definido.
- Falha/ausencia de proxy/conta/quote de sandbox.

Impacto:

- A tela pode continuar demonstrando o fluxo mesmo sem ordem real do provider.
- O usuario deve ver isso como "simular pagamento PIX neste ambiente de teste".

Env relevante:

```text
ETHERFUSE_SANDBOX_PIX_FALLBACK=true|false
ETHERFUSE_API_KEY=api_sand:...
ETHERFUSE_BASE_URL=https://api.sand.etherfuse.com
STELLAR_NETWORK=TESTNET
```

### 3. Simulacao de recebimento PIX

Arquivos:

- `backend/src/api/controllers/ramp.controller.ts`
- `backend/src/api/services/anchor.service.ts`
- `frontend/app/pix-ramp/pix-ramp-client.tsx`

O que e simulado:

- `simulateEtherfuseFiatReceived`
- `simulateFiatReceivedForSession`
- `completeSandboxOnRamp`
- `settleSandboxOnRampFinalAsset`

Gatilho:

- POST em `/api/ramp/etherfuse/sandbox/simulate-fiat`.
- So permitido em sandbox/devnet e com secret interno.

Impacto:

- Nao representa confirmacao bancaria real.
- Representa o evento que, em producao, teria que vir do provider PIX.

Como tornar real:

- Receber webhook assinado do provider.
- Validar valor, order ID, customer ID, destino e idempotencia.
- Remover o botao de simulacao do user mode.

### 4. KYC e documentos falsos para Etherfuse sandbox

Arquivo:

- `backend/src/api/services/anchor.service.ts`

O que e fake:

- `buildSandboxKycPayload()`
- `buildSandboxDocumentPayload()`
- Imagem 1x1 PNG fake para documentos/selfie.
- `buildSandboxPixAccount()`
- `runSandboxProgrammaticOnboarding()`

Impacto:

- Necessario para destravar fluxos devnet/sandbox de KYC e conta PIX.
- Nao e KYC real, nao verifica identidade e nao serve para producao.

Como tornar real:

- Integrar KYC real.
- Usar dados reais autorizados do usuario/instituicao.
- Persistir status KYC/KYB verificavel.
- Substituir documentos fake por upload/document-check real.

### 5. Sandbox off-ramp PIX

Arquivos:

- `backend/src/api/services/anchor.service.ts`
- `frontend/app/pix-ramp/pix-ramp-client.tsx`

O que e mockado/sandbox:

- `createSandboxOffRampFallback()`
- IDs como `sandbox-offramp-${uuid}`.
- `signableTransaction: sandbox-mock-xdr:${orderId}`.
- `submitSandboxOffRamp()`.
- Pagamento para collector/conta sandbox em Testnet.
- Memo `PIX OFFRAMP SANDBOX`.

Gatilhos:

- Runtime Etherfuse sandbox/devnet.
- Falta de fiat account/proxy.
- `force_sandbox_mock` ou endpoint temporario de teste.

Impacto:

- Demonstra a mecanica de off-ramp, mas nao manda PIX real para uma chave bancaria.

Como tornar real:

- Criar off-ramp provider real.
- Remover `sandbox-mock-xdr`.
- Assinar e submeter XDR real do provider.
- Confirmar saida por webhook/status real.

### 6. PIX-funded transfer automation sandbox

Arquivo:

- `backend/src/api/services/anchor.service.ts`

O que e sandbox:

- `runPixFundedTransfer()`.
- Disponivel apenas em Etherfuse sandbox/devnet.
- Retorna contexto de automacao, quote, on-ramp/off-ramp e entrega testnet.

Impacto:

- Bom para demo ponta a ponta de "PIX entrou, saldo saiu".
- Nao e automacao de dinheiro real.

### 7. Rail institucional com PIX mockado

Arquivos:

- `backend/src/api/services/pix-funding.service.ts`
- `backend/src/api/controllers/international-transfers.controller.ts`
- `backend/src/api/services/international-transfer.service.ts`
- `frontend/app/international-transfer/international-transfer-client.tsx`

O que e mockado:

- `mock_pix_intent`, `mockPixIntent`, `mock`.
- IDs como `mock_pix_${transfer_id}`.
- `operation_id: mock_operation_${transfer_id}`.
- Pix copia-e-cola com `TTS MOCK`.
- Metadata `mode: mock`.
- `confirmSandboxFunding()` marca funding como recebido com `simulated: true`.

Gatilho:

- Body de `/api/transfers/:id/pix-intent` com `mock_pix_intent=true`.
- Env `INTERNATIONAL_TRANSFER_ENABLE_MOCK_PIX=true` ou ambiente nao producao.
- UI `/international-transfer` com "Use sandbox PIX funding intent".

Impacto:

- A origem BRL institucional pode parecer financiada, mas foi confirmada por evento sandbox.

Como tornar real:

- `mock_pix_intent=false`.
- Criar payment intent real no provider.
- Atualizar status somente por webhook real assinado.
- Registrar reconciliation com id real do provider.

### 8. Confirmacao sandbox de funding institucional

Arquivos:

- `backend/src/api/services/international-transfer.service.ts`
- `backend/src/api/controllers/international-transfers.controller.ts`

Endpoint:

```text
POST /api/transfers/:id/funding-confirmation
```

O que e simulado:

- Confirma funding sem webhook real.
- Permitido apenas se o intent original for mock/sandbox.
- Metadata inclui `simulated_by: institution_settlement_tester`.

Impacto:

- A rota avanca para `PIX_RECEIVED` sem prova bancaria real.

Como tornar real:

- Remover esse endpoint do fluxo normal.
- Criar webhook `pix.received` real do provider.
- Validar idempotencia e assinatura.

### 9. Stellar settlement evidence mockada

Arquivo:

- `backend/src/api/services/stellar-settlement.service.ts`

O que e mockado:

- `mockEvidence()`.
- Hash `mock-stellar-${sha256(...).slice(0, 32)}`.
- `status: mocked`.
- `execution_mode: mock`.
- `network` pode ser `testnet` ou `mainnet` no metadata, mas sem transacao real.

Gatilhos:

- Falta `STELLAR_SECRET_KEY`.
- Falta destination account configurada.
- Mainnet validation desabilitado.
- Valor acima do limite de validacao mainnet.
- Situacoes em que o servico decide nao executar transacao real.

Impacto:

- O painel mostra evidencia blockchain, mas a evidencia pode ser apenas mock.
- Para reviewer tecnico, isso precisa estar visivel.

Como tornar real:

- Configurar chave de origem e destino.
- Usar `STELLAR_NETWORK=TESTNET` para testnet real ou mainnet controlado.
- Habilitar `ENABLE_MAINNET_SETTLEMENT_VALIDATION=true` somente com limite baixo.
- Persistir tx hash real do Horizon.

Env relevante:

```text
STELLAR_NETWORK=TESTNET|PUBLIC|MAINNET
STELLAR_SECRET_KEY=
STELLAR_PUBLIC_KEY=
USDC_ASSET_CODE=USDC
USDC_ASSET_ISSUER=
ENABLE_MAINNET_SETTLEMENT_VALIDATION=false
MAX_MAINNET_VALIDATION_AMOUNT_USD=25
```

### 10. Mock USD payout adapter

Arquivo:

- `backend/src/api/services/usd-payout-adapters.ts`

O que e mockado:

- `MockUsdPayoutAdapter`.
- `providerName: mock`.
- `mode: mock`.
- Nota explicita: nenhum ACH/wire foi executado.
- Status pode ficar `pending` ou `completed` conforme `MOCK_USD_PAYOUT_AUTO_COMPLETE`.

Gatilhos:

- `PAYOUT_PROVIDER=mock`.
- Provider invalido cai para mock.
- Chamada de `/api/transfers/:id/payout-instruction` com provider `mock`.

Impacto:

- Cria instrucao de payout para reconciliacao, nao payout bancario real.

Como tornar real:

- Implementar adapter real com API de Circle/Bridge/banco.
- Exigir `ENABLE_REAL_PAYOUT_EXECUTION=true`.
- Armazenar provider payout ID real.
- Poll/webhook para status real.

Env relevante:

```text
PAYOUT_PROVIDER=mock|etherfuse|circle|bridge
MOCK_USD_PAYOUT_AUTO_COMPLETE=false
ENABLE_REAL_PAYOUT_EXECUTION=false
```

### 11. Circle e Bridge compatibility adapters

Arquivo:

- `backend/src/api/services/usd-payout-adapters.ts`

O que e sandbox/compatibilidade:

- Adapters existem, mas sem credenciais/execution flag eles preparam payload de compatibilidade.
- `mode: sandbox` aparece para compatibilidade.
- Nao executam payout real por padrao.

Gatilhos:

- `PAYOUT_PROVIDER=circle` ou `bridge`.
- Falta de API key ou `ENABLE_REAL_PAYOUT_EXECUTION=false`.

Impacto:

- Bom para mostrar como a arquitetura pluga provider real.
- Nao deve ser descrito como Circle/Bridge live payout.

Como tornar real:

- Obter credenciais sandbox/prod oficiais.
- Implementar chamada de criacao de payout.
- Implementar status polling/webhook.
- Guardar erros e reconciliation real.

### 12. Etherfuse payout adapter de prova

Arquivo:

- `backend/src/api/services/usd-payout-adapters.ts`

O que e sandbox:

- `EtherfusePayoutAdapter`.
- Pode preparar payload de off-ramp sem assinar.
- Pode executar teste de off-ramp sandbox se receber `session_id`, `session_token`, `wallet_pin` e `run_etherfuse_offramp_test=true`.
- Nota: prova de off-ramp sandbox, sem claim de payout USD bancario.

Impacto:

- Demonstra o proof leg de off-ramp.
- Nao e deposito USD real em conta internacional.

### 13. Quote BRL -> USD com fallback configurado

Arquivo:

- `backend/src/api/services/brl-usd-quote.service.ts`

O que e fallback:

- Primeiro tenta `BrlReferenceRateService.quoteBrlToUsdc()`.
- Se falhar, a quote fica indisponivel.
- Nao usa default/env fallback para inventar cambio.
- Provider fee ainda aparece como `pending_provider_quote`.
- Tax/IOF aparece como `not_configured_for_sandbox_quote`.

Impacto:

- Quote pode parecer real, mas estar vindo de taxa configurada.
- O campo `quote_source` precisa ser mostrado em paines tecnicos.

Como tornar real:

- Garantir liquidez BRL/USDC ou provider quote real.
- Falhar de forma clara quando nao houver quote confiavel em vez de gerar fallback para operacao sensivel.
- Separar fallback apenas para demo/calculadora.

### 14. Referencia BRL/USDC via Testnet e sanity range

Arquivos:

- `backend/src/api/services/brl-reference-rate.service.ts`
- `backend/src/api/services/quote-rate-sanity.service.ts`

O que e testnet/fallback:

- Quotes usam pathfinding na Stellar configurada.
- Em testnet, liquidez pode ficar distorcida.
- `assertSaneBrlUsdcQuote()` rejeita quotes fora de faixa.
- Faixa default: 1 USDC entre R$ 3 e R$ 10.

Impacto:

- Testnet nao e mercado real.
- Precisa de rebalance/liquidez de demo para nao gerar numeros errados.

Env relevante:

```text
USD_BRL_SANITY_MIN=3
USD_BRL_SANITY_MAX=10
```

### 15. Economy engine e comparativo tradicional

Arquivo:

- `backend/src/api/services/economy-engine.service.ts`

O que e estimado:

- `TRADITIONAL_FEE_PCT` default para benchmark.
- Metodo `traditional_providers_average_3_5pct`.
- `estimateAmountInBrl()` usa somente BRL/TESOURO direto ou valores de quote/transacao.

Impacto:

- Isso nao e taxa cobrada real.
- E benchmark de economia e deve aparecer como comparativo, nao como valor garantido.

Como tornar real:

- Guardar benchmark versionado.
- Mostrar fonte/metodologia.
- Nao misturar benchmark com fee real.

### 16. Conversao de taxa/fee display com fallback

Arquivo:

- `backend/src/utils/fee-display.ts`

O que e fallback:

- Usa `DEFAULT_NETWORK_FEE_XLM`.
- Usa fallback de simbolos/cotacoes quando algum ticker nao retorna.

Impacto:

- Ajuda a explicar fee em BRL/USD, mas pode virar estimativa.

Como tornar real:

- Persistir fee real do ledger.
- Usar quote efetiva do momento da transacao.

### 17. Platform fee defaults

Arquivo:

- `backend/src/api/services/platform-fee.service.ts`

O que e configurado por default:

- Spread default `30 bps`.
- Min fee default `0.01 USDC` ou `0.05 BRL`.
- Fee so fica enabled se treasury publica estiver configurada e o par for USDC/BRL.

Impacto:

- Nao e mock, mas e uma taxa default/configurada.
- Se treasury nao estiver configurada, o metadata pode nao aplicar fee real mesmo exibindo estimativa em outros lugares.

Env relevante:

```text
TALKTOSTELLAR_SPREAD_BPS=30
TALKTOSTELLAR_SPREAD_MIN_USDC=0.01
TALKTOSTELLAR_SPREAD_MIN_BRL=0.05
TALKTOSTELLAR_FEE_TREASURY_PUBLIC_KEY=
```

### 18. Receipt fallback por hash

Arquivos:

- `backend/src/api/controllers/receipt-image.controller.ts`
- `backend/src/api/services/payment-receipt.service.ts`

O que e fallback:

- Se o recibo persistido nao existe, gera `paymentDataFromHash(txHash)`.
- Gera imagem base64 e persiste a partir do hash.
- Conversao em recibo usa valores da propria transacao/quote; sem fallback externo.
- `PaymentReceiptService` tambem remove termos como testnet/sandbox/devnet do contexto user-facing.

Impacto:

- Pode produzir comprovante reconstruido, nao comprovante originalmente salvo.
- Bom para resiliencia, mas precisa ficar claro para auditoria interna.

Como tornar real:

- Receipt por codigo persistido deve ser fonte primaria.
- Fallback por hash deve ser marcado internamente como generated fallback.
- Evitar usar fallback em disputa/suporte financeiro real.

### 19. Friendbot/testnet account repair

Arquivo:

- `backend/src/agent/tools.ts`

O que e testnet:

- `getAccountWithTestnetRepair()` tenta fundar conta usando Friendbot se a conta nao existe.
- Isso e exclusivo de testnet.

Impacto:

- Bom para demo/testnet.
- Nao existe em mainnet.

Como tornar real:

- Mainnet precisa funding/creation real.
- Nunca chamar Friendbot em Public/Mainnet.

### 20. Agent fallbacks

Arquivos:

- `backend/src/agent/graph.ts`
- `backend/src/agent/routes.ts`
- `backend/src/agent/tools.ts`

O que e fallback/placeholder:

- `generic-route-estimate` pode usar fallback se route quote falhar.
- LLM final fallback se as rodadas de tool chamarem o limite.
- Logout URL fallback.
- Alguns textos de sistema orientam nao mencionar sandbox/testnet/devnet no chat.
- Comentario em `routes.ts`: "For now, this is a placeholder. In production, call the user service."

Impacto:

- A experiencia de chat tenta ser resiliente.
- O risco e esconder demais o estado sandbox em fluxos onde reviewer precisa ver a verdade.

Como tornar real:

- Separar modo usuario e modo reviewer/ops.
- Logar fallback usado.
- Expor `support_code`/debug apenas em painel tecnico.

## Superficies mockadas no frontend

### 21. PIX ramp UI

Arquivo:

- `frontend/app/pix-ramp/pix-ramp-client.tsx`

O que aparece:

- Detecta `config.sandbox`, `testnet_only`, `stellar_network_id`.
- Usa fallback de conta/PIX e labels quando provider nao retorna dados.
- Pode chamar endpoints `/api/ramp/etherfuse/sandbox/*`.
- Mostra copy de "simular pagamento PIX neste ambiente de teste".
- Mostra cards de debug/endpoints de sandbox.
- Marca Etherfuse PIX como Testnet-only.

Impacto:

- E a principal UI onde usuario pode confundir real com sandbox.

Recomendacao:

- Manter user mode simples.
- Deixar debug/endpoint visivel apenas com flag.
- Nao mostrar termo Etherfuse para usuario final, so para demo tecnica.

### 22. Institution settlement tester

Arquivo:

- `frontend/app/international-transfer/international-transfer-client.tsx`

O que aparece:

- Provider options: `mock`, `etherfuse`, `circle`, `bridge`.
- `mockPix` default/checkbox.
- "Use sandbox PIX funding intent".
- "Run complete sandbox route".
- "Execute Etherfuse off-ramp sandbox proof".
- Session ID/token/PIN em advanced credentials.
- Simula funding webhook.
- Pode mockar Stellar evidence e payout.

Impacto:

- Excelente para reviewer tecnico.
- Nao e tela de usuario final.

Recomendacao:

- Manter como `/ops` ou demo tecnica.
- Badge claro "sandbox/infrastructure tester".
- Mostrar `mock-stellar-*` e provider mock explicitamente.

### 23. Global transfer lab

Arquivos:

- `frontend/app/global-transfer/page.tsx`
- `frontend/app/global-transfer/global-transfer-client.tsx`

O que e mock:

- Pagina descrita como "Mock sandbox".
- `quoteId = q_mock_*`.
- IDs demo como `br_company_demo`, `recipient_us_demo`.
- `account_number_token: tok_bank_account_mock`.
- QR/BR code com `TTS MOCK`.
- "Run full mock flow".
- "Mock copia e cola".
- Status "mocked complete".

Impacto:

- Laboratorio de narrativa/fees, nao produto live.

Recomendacao:

- Manter separado de user flow.
- Nao linkar como acao principal da landing.

### 24. Mainnet/Testnet console

Arquivo:

- `frontend/app/mainnet/mainnet-client.tsx`

O que e testnet:

- Network mode default `testnet`.
- Painel explica que Etherfuse PIX e Testnet-only.
- Mainnet fica separado para leitura/interacao guardada.

Impacto:

- Nao e mock em si, mas e uma fronteira importante.
- Ajuda a evitar que o usuario ache que PIX/Etherfuse roda em mainnet.

### 25. Landing simulator

Arquivo:

- `frontend/components/landing-v2/SimulatorSection.tsx`

O que e simulacao:

- "Simulate your savings".
- Estimativas de economia no frontend.
- Nao e cotacao real do backend.

Impacto:

- Marketing/calculadora, nao quote executable.

Recomendacao:

- Manter copy como simulador.
- Nao usar para prometer taxa real.

### 26. Chat UI demo controls

Arquivos:

- `frontend/components/chat-window.tsx`
- `frontend/components/chat-sidebar.tsx`

O que e demo/placeholder:

- Botoes de video/call/search/more indisponiveis nesta demo.
- Sidebar contem contatos/elementos estaticos de UI.
- Alguns contatos podem ser demonstrativos e nao garantem backend financeiro real.

Impacto:

- Pode confundir se o usuario clicar esperando feature real.

Recomendacao:

- Marcar contatos demo.
- Conectar contatos reais ou ocultar mock contacts em demo publica.

## Env vars e guards relacionados a mock/sandbox/fallback

| Env | Uso |
| --- | --- |
| `STELLAR_NETWORK` | Define Testnet/Public; default tende a Testnet. |
| `ETHERFUSE_API_KEY` | Sandbox se `api_sand:*`. |
| `ETHERFUSE_BASE_URL` | Sandbox se contem `.sand.` ou `sandbox`. |
| `ETHERFUSE_SANDBOX_PIX_FALLBACK` | Habilita fallback local de PIX sandbox. |
| `ETHERFUSE_WEBHOOK_SECRET` | Necessario para webhook real/seguro. |
| `RAMP_SANDBOX_INTERNAL_SECRET` | Autoriza helpers internos de sandbox PIX. |
| `INTERNAL_API_SECRET` | Fallback para helpers internos. |
| `INTERNATIONAL_TRANSFER_ENABLE_MOCK_PIX` | Permite mock Pix no rail institucional. |
| `PAYOUT_PROVIDER` | `mock`, `etherfuse`, `circle`, `bridge`. Default atual no exemplo: `mock`. |
| `MOCK_USD_PAYOUT_AUTO_COMPLETE` | Faz mock payout voltar como completed. |
| `ENABLE_REAL_PAYOUT_EXECUTION` | Necessario para adapters de payout executarem real. |
| `ENABLE_MAINNET_SETTLEMENT_VALIDATION` | Permite validacao mainnet de pequeno valor. |
| `MAX_MAINNET_VALIDATION_AMOUNT_USD` | Limite de valor para mainnet validation. |
| `BRL_USDC_REFERENCE_SAMPLE_USDC` | Amostra para derivar referencia TESOURO/USDC pela rota. |
| `USD_BRL_SANITY_MIN` / `USD_BRL_SANITY_MAX` | Faixa segura para rejeitar liquidez testnet absurda. |
| `TRADITIONAL_FEE_PCT` | Benchmark de taxa tradicional, nao taxa cobrada real. |
| `TALKTOSTELLAR_SPREAD_BPS` | Spread configurado da TalkToStellar. |
| `TALKTOSTELLAR_FEE_TREASURY_PUBLIC_KEY` | Sem treasury, fee de plataforma pode nao ser aplicada on-chain. |
| `EVOLUTION_SEND_FAILURE_FALLBACK` | Pode enviar fallback de erro no WhatsApp se ligado. |

## Endpoints que podem gerar ou confirmar estado mockado

| Endpoint | Mock/sandbox possivel |
| --- | --- |
| `GET /api/ramp/etherfuse/config` | Expõe se runtime e sandbox/testnet. |
| `POST /api/ramp/etherfuse/resolve-wallet` | Lookup por email somente sandbox/devnet. |
| `POST /api/ramp/etherfuse/sandbox/simulate-fiat` | Simula confirmacao PIX. |
| `POST /api/ramp/etherfuse/sandbox/transfer-recipient` | Resolve destinatario para fluxo PIX-funded sandbox. |
| `POST /api/ramp/etherfuse/sandbox/pix-funded-transfer` | Automacao sandbox PIX -> transferencia. |
| `POST /api/ramp/etherfuse/sandbox/test-onramp` | Helper temporario de on-ramp sandbox. |
| `POST /api/ramp/etherfuse/sandbox/test-offramp` | Helper temporario de off-ramp sandbox. |
| `POST /api/quotes/brl-usd` | Usa rota TESOURO/USDC; sem fallback externo. |
| `POST /api/transfers/:id/pix-intent` | Pode criar `mock_pix_intent`. |
| `POST /api/transfers/:id/funding-confirmation` | Confirma funding sandbox. |
| `POST /api/transfers/:id/settle-stellar` | Pode anexar `mock-stellar-*`. |
| `POST /api/transfers/:id/payout-instruction` | Pode criar payout mock ou adapter sandbox. |
| `GET /api/transfers/:id/reconciliation` | Pode mostrar evidencia mockada. |
| `GET /api/receipt/:hash` ou rotas de recibo | Pode reconstruir recibo por fallback se nao existir registro. |

## Mocks restritos a testes

Estes nao afetam runtime do produto. Sao mocks/fixtures normais de teste.

Arquivos relevantes:

- `backend/jest.setup.js`
- `backend/tests/setup.ts`
- `backend/tests/test-utils.ts`
- `backend/tests/*.test.ts`
- `telegram/test/*.test.js`

Padroes encontrados:

- `jest.mock(...)` para Supabase, services, repositories e SDKs.
- Mock de dados de usuario, wallet, transacao, agent log.
- Mock de fetch/Evolution.
- Testnet configs para testes Stellar.
- Fixtures para validar agentes, webhooks, passkey, short link, transfer notification e rail institucional.

Conclusao:

- Manter.
- Nao precisa remover.
- So tomar cuidado para nao copiar payload de teste para runtime.

## Mocks/documentacao apenas

Muitos arquivos `docs/` e `sow/` mencionam mock/sandbox porque explicam o estado atual, demo e planos.

Principais documentos com referencias:

- `docs/BRL_USD_RAIL_OPERATOR_RUNBOOK.md`
- `docs/BRL_USD_INTERNATIONAL_ACCOUNT_DELIVERY.md`
- `docs/BRL_USD_STELLAR_WISE_BUILD_LOG.md`
- `docs/BRL_USD_STELLAR_WISE_FEES_AND_ANCHOR_FLOW.md`
- `docs/ETHERFUSE_PIX_KYC_FLOW.md`
- `docs/INSTITUTION_SETTLEMENT_INTERFACE_GUIDE.md`
- `docs/PROJECT_FEATURE_STATE_FOR_AI_REVIEW_20260523.md`
- `docs/SISTEMA_DE_TAXAS_ATUAL.md`
- `docs/STELLAR_MAINNET_INFRASTRUCTURE.md`
- `docs/STELLAR_MAINNET_USER_WALLET_CONSOLE.md`
- `docs/UX_FULL_CODEBASE_SCAN_20260521.md`
- `docs/USER_DEMO_GUIDE.md`
- `docs/WHATSAPP_EVOLUTION_CALLBACK_TROUBLESHOOTING.md`
- `sow/SOW_brl_stellar_usd_bank_payout_20260519.md`
- `sow/SOW_instawards_submission_brl_usd_rail_20260520.md`
- `sow/SOW_current_project_state_20260519.md`

Conclusao:

- Estes documentos nao executam nada.
- Sao uteis para deixar claro o que e sandbox e o que e real.
- Devem continuar alinhados com a UI para nao prometer producao.

## Codigo legado/deprecated

Arquivos encontrados em `deprecated/`:

- `deprecated/talktostellar-landing-page/src/components/SimulatorSection.tsx`
- `deprecated/twilio-webhook/public/index.html`
- `deprecated/twilio-webhook/public-wa/index.html`
- `deprecated/twilio-webhook/whatsapp.js`
- `deprecated/twilio-webhook/README.md`

Conclusao:

- Nao considerar como runtime ativo.
- Se o deploy nao usa essas pastas, podem ficar como historico.
- Se quiser reduzir ruido do repo, mover para arquivo externo ou remover em cleanup separado.

## O que nao deve ser tratado como mock por si so

Nem todo match de `testnet`, `fallback` ou `demo` significa "fake perigoso".

Nao sao necessariamente mocks:

- Stellar Testnet real: transacoes testnet podem ser reais dentro da rede de teste.
- Mainnet console: alternancia de rede e leitura mainnet sao features reais se configuradas.
- Public error fallback: mensagens seguras para usuario sao fallback de UX, nao dados falsos.
- Jest mocks: sao isolados em teste.
- Placeholders de input: `placeholder="100"` nao significa logica mockada.
- Benchmark de 3,5%: e simulador/comparativo, nao cobrança real.

## Riscos mais importantes

### Risco 1 - Payout USD parecer real

Estado atual:

- O payout pode ser `mock`, `sandbox` ou compatibilidade Circle/Bridge.
- Nao ha garantia de ACH/wire real.

Mitigacao:

- UI deve dizer "payout instruction" e "sandbox/provider-compatible".
- So dizer "depositado em banco" quando provider real confirmar.

### Risco 2 - `mock-stellar-*` parecer hash real

Estado atual:

- Settlement evidence pode ser mock se nao houver config real.

Mitigacao:

- Painel tecnico deve mostrar `execution_mode`.
- User-facing receipt nao deve usar hash mock como comprovante blockchain.

### Risco 3 - PIX sandbox parecer PIX real

Estado atual:

- O app tem QR/BR Code demonstrativo e simulacao de fiat received.

Mitigacao:

- User mode: "simular pagamento PIX neste ambiente de teste".
- Prod mode: somente webhook real do provider.

### Risco 4 - Quote fallback parecer cotacao executavel

Estado atual:

- Se pathfinding falhar, BRL/USD quote fica indisponivel.

Mitigacao:

- Mostrar `quote_source`.
- Em operacao sensivel, bloquear confirmacao se fonte for fallback nao executavel.

### Risco 5 - Contatos/demo UI parecerem dados reais

Estado atual:

- Chat/sidebar tem elementos demonstrativos e icones indisponiveis.

Mitigacao:

- Contatos de envio devem ser resolvidos pelo backend.
- UI deve ter botao para ver info real do destinatario, como ja foi pedido.

## Caminho para tornar o produto menos mockado

Prioridade recomendada:

1. Desligar `ETHERFUSE_SANDBOX_PIX_FALLBACK` em qualquer ambiente que queira testar provider real.
2. Desligar `INTERNATIONAL_TRANSFER_ENABLE_MOCK_PIX` fora de demo.
3. Usar `PAYOUT_PROVIDER=etherfuse|circle|bridge` apenas quando o adapter tiver credencial e execucao real/sandbox oficial.
4. Bloquear `/sandbox/*` no frontend publico; manter so para ops/debug.
5. Exigir tx hash real em rotas que se apresentam como settlement blockchain.
6. Persistir `quote_source` e impedir confirmacao se a fonte for fallback nao executavel.
7. Separar `/ops` de `/chat`, `/pix-on`, `/pix-off` e telas de usuario final.
8. Adicionar badge de ambiente em todo painel tecnico: `mock`, `sandbox`, `testnet`, `mainnet validation`, `real provider`.

## Inventario completo dos arquivos com matches

### Backend runtime/config/scripts

- `backend/.env.example`
- `backend/package.json`
- `backend/package-lock.json`
- `backend/render.yaml`
- `backend/src/agent/graph.ts`
- `backend/src/agent/routes.ts`
- `backend/src/agent/tools.ts`
- `backend/src/api/controllers/external-finalize.controller.ts`
- `backend/src/api/controllers/external-recovery.controller.ts`
- `backend/src/api/controllers/external-validate.controller.ts`
- `backend/src/api/controllers/external.controller.ts`
- `backend/src/api/controllers/financial.controller.ts`
- `backend/src/api/controllers/international-transfers.controller.ts`
- `backend/src/api/controllers/ramp.controller.ts`
- `backend/src/api/controllers/receipt-image.controller.ts`
- `backend/src/api/middlewares/security.middleware.ts`
- `backend/src/api/routes/ramp.router.ts`
- `backend/src/api/services/activity-feed.service.ts`
- `backend/src/api/services/anchor.service.ts`
- `backend/src/api/services/balance-alert.service.ts`
- `backend/src/api/services/brl-reference-rate.service.ts`
- `backend/src/api/services/brl-usd-quote.service.ts`
- `backend/src/api/services/contact-seed.service.ts`
- `backend/src/api/services/daily-summary.service.ts`
- `backend/src/api/services/economy-engine.service.ts`
- `backend/src/api/services/email-confirmation.service.ts`
- `backend/src/api/services/evolution.service.ts`
- `backend/src/api/services/financial-context.service.ts`
- `backend/src/api/services/international-transfer.service.ts`
- `backend/src/api/services/international-transfer.types.ts`
- `backend/src/api/services/mainnet-wallet.service.ts`
- `backend/src/api/services/payment-receipt.service.ts`
- `backend/src/api/services/pix-funding.service.ts`
- `backend/src/api/services/quote-rate-sanity.service.ts`
- `backend/src/api/services/settlement-evidence.service.ts`
- `backend/src/api/services/stellar-settlement.service.ts`
- `backend/src/api/services/stellar.service.ts`
- `backend/src/api/services/transfer-notification.service.ts`
- `backend/src/api/services/user.service.ts`
- `backend/src/api/services/usd-payout-adapters.ts`
- `backend/src/config/assets.ts`
- `backend/src/config/secrets.ts`
- `backend/src/config/stellar.ts`
- `backend/src/infrastructure/stellar/mainnet-infrastructure.ts`
- `backend/src/infrastructure/stellar/network-profiles.ts`
- `backend/src/integrations/regional-starter-pack/anchors/etherfuse/client.ts`
- `backend/src/integrations/regional-starter-pack/anchors/etherfuse/types.ts`
- `backend/src/integrations/regional-starter-pack/anchors/types.ts`
- `backend/src/services/external.service.ts`
- `backend/src/services/pin-reset.service.ts`
- `backend/src/utils/fee-display.ts`
- `backend/src/utils/public-error.ts`
- `backend/migrations/20260518_00_prepare_stellar_mainnet_infrastructure.sql`
- `backend/migrations/20260521_00_user_mainnet_wallets.sql`
- `backend/scripts/create-contacts-for-user.ts`
- `backend/scripts/create-issuers.ts`
- `backend/scripts/debug-path-quotes.ts`
- `backend/scripts/debug-telegram.sh`
- `backend/scripts/first-testnet-transaction.ts`
- `backend/scripts/rebalance-testnet-brl-market.ts`
- `backend/scripts/RT_TalkToStellar_v1.js`
- `backend/scripts/seed-users.ts`
- `backend/scripts/setup-testnet-brl-liquidity.ts`
- `backend/scripts/setup-xlm-usdc-liquidity.ts`
- `backend/scripts/stellar-mainnet-audit.ts`
- `backend/scripts/stellar-mainnet-readiness.ts`
- `backend/scripts/stellar-script-safety.ts`
- `backend/scripts/test-usdc-issuer.ts`

### Backend tests

- `backend/jest.setup.js`
- `backend/tests/README.md`
- `backend/tests/agent-ai.test.ts`
- `backend/tests/agent-balance.test.ts`
- `backend/tests/agent-conversion-ux.test.ts`
- `backend/tests/agent-payment-link.test.ts`
- `backend/tests/agent-routes-telegram-identity.test.ts`
- `backend/tests/agent-tools.test.ts`
- `backend/tests/anchor-offramp-balance.test.ts`
- `backend/tests/anchor-simulate-fiat.test.ts`
- `backend/tests/asset-config.test.ts`
- `backend/tests/brl-reference-rate.service.test.ts`
- `backend/tests/evolution.service.test.ts`
- `backend/tests/external-controller.test.ts`
- `backend/tests/external-finalize.controller.test.ts`
- `backend/tests/external-service.test.ts`
- `backend/tests/financial-conversion-reference.test.ts`
- `backend/tests/international-transfer.service.test.ts`
- `backend/tests/onboarding.test.ts`
- `backend/tests/passkey.service.test.ts`
- `backend/tests/pin-reset.controller.test.ts`
- `backend/tests/public-error.test.ts`
- `backend/tests/quote-rate-sanity.service.test.ts`
- `backend/tests/secrets.test.ts`
- `backend/tests/setup.ts`
- `backend/tests/short-link.controller.test.ts`
- `backend/tests/stellar-mainnet-infrastructure.test.ts`
- `backend/tests/stellar-runtime-config.test.ts`
- `backend/tests/stellar-sdk.test.ts`
- `backend/tests/test-utils.ts`
- `backend/tests/transfer-notification.service.test.ts`
- `backend/tests/wallet.test.ts`

### Backend docs

- `backend/docs/PATH-PAYMENT.md`
- `backend/docs/PIN_RESET_ANALYSIS.md`
- `backend/docs/TEST_QUICK_REFERENCE.md`

### Frontend

- `frontend/app/api/chat/route.ts`
- `frontend/app/change-pin/change-pin-client.tsx`
- `frontend/app/change-pin/page.tsx`
- `frontend/app/claim-payment/claim-payment-client.tsx`
- `frontend/app/confirm-conversion/confirm-conversion-client.tsx`
- `frontend/app/confirm-payment/confirm-payment-client.tsx`
- `frontend/app/create-account/create-account-client.tsx`
- `frontend/app/global-transfer/global-transfer-client.tsx`
- `frontend/app/global-transfer/page.tsx`
- `frontend/app/international-transfer/international-transfer-client.tsx`
- `frontend/app/layout.tsx`
- `frontend/app/link-used/page.tsx`
- `frontend/app/login/login-client.tsx`
- `frontend/app/logout/page.tsx`
- `frontend/app/mainnet/mainnet-client.tsx`
- `frontend/app/mainnet/page.tsx`
- `frontend/app/pay-anyone/page.tsx`
- `frontend/app/pay-anyone/pay-anyone-client.tsx`
- `frontend/app/pix-ramp/pix-ramp-client.tsx`
- `frontend/app/r/[code]/route.ts`
- `frontend/app/send-external/page.tsx`
- `frontend/app/send-external/send-external-client.tsx`
- `frontend/app/transactions/transactions-client.tsx`
- `frontend/app/u/[username]/page.tsx`
- `frontend/components/chat-sidebar.tsx`
- `frontend/components/chat-window.tsx`
- `frontend/components/landing-v2/CTA.tsx`
- `frontend/components/landing-v2/Hero.tsx`
- `frontend/components/landing-v2/SimulatorSection.tsx`
- `frontend/components/ui/avatar.tsx`
- `frontend/components/ui/input.tsx`
- `frontend/lib/i18n.tsx`
- `frontend/lib/public-errors.ts`

### Telegram/Evolution

- `telegram/src/index.js`
- `telegram/src/session-store.js`
- `telegram/test/bot.test.js`
- `telegram/test/profile.test.js`
- `evolution/README.md`

### Docs

- `docs/ANCHOR_TESTNET_VIDEO_WALKTHROUGH.md`
- `docs/ARCHITECTURE.md`
- `docs/BRL_USD_INTERNATIONAL_ACCOUNT_DELIVERY.md`
- `docs/BRL_USD_RAIL_OPERATOR_RUNBOOK.md`
- `docs/BRL_USD_STELLAR_WISE_BUILD_LOG.md`
- `docs/BRL_USD_STELLAR_WISE_FEES_AND_ANCHOR_FLOW.md`
- `docs/BRL_USD_STELLAR_WISE_IMPLEMENTATION_PLAN.md`
- `docs/CUSTODIAL.md`
- `docs/ENV_AND_MIGRATIONS_GUIDE_20260519.md`
- `docs/ETHERFUSE_PIX_KYC_FLOW.md`
- `docs/INSTAWARDS_SOW.md`
- `docs/INSTITUTION_SETTLEMENT_INTERFACE_GUIDE.md`
- `docs/INVISIBLE_WALLET_PRODUCT_REDESIGN.md`
- `docs/PROJECT_FEATURE_STATE_FOR_AI_REVIEW_20260523.md`
- `docs/PROJECT_TECHNICAL_DESCRIPTION.md`
- `docs/RAILWAY_FULL_STACK_DEPLOYMENT.md`
- `docs/REGIONAL_STARTER_PACK_PIX_RAMP.md`
- `docs/SECURITY_AUDIT_CHALLENGE_1.md`
- `docs/SECURITY_AUDIT_DEEP_DIVE.md`
- `docs/SECURITY_FIX_BATCH_20260519.md`
- `docs/SECURITY_FULL_CODEBASE_SCAN_20260519.md`
- `docs/SECURITY_HARDENING_ROUND_20260518.md`
- `docs/SISTEMA_DE_TAXAS_ATUAL.md`
- `docs/STELLAR_MAINNET_HARDENING_SCAN.md`
- `docs/STELLAR_MAINNET_INFRASTRUCTURE.md`
- `docs/STELLAR_MAINNET_USER_WALLET_CONSOLE.md`
- `docs/STRATEGIC_POSITIONING_TALKTOSTELLAR.md`
- `docs/TECH_STACK_DETAILED.md`
- `docs/TECHNICAL_STATE_20260512.md`
- `docs/USER_DEMO_GUIDE.md`
- `docs/USER_FLOW_SMOKE_TESTS.md`
- `docs/UX_FEE_REDUCTION_UPGRADE_MAP.md`
- `docs/UX_FULL_CODEBASE_SCAN_20260521.md`
- `docs/WHATSAPP_EVOLUTION_CALLBACK_TROUBLESHOOTING.md`

### SOW

- `sow/SOW_brl_stellar_usd_bank_payout_20260519.md`
- `sow/SOW_current_project_state_20260519.md`
- `sow/SOW_inital.md`
- `sow/SOW_instawards_submission_brl_usd_rail_20260520.md`

### Deprecated

- `deprecated/talktostellar-landing-page/src/components/SimulatorSection.tsx`
- `deprecated/twilio-webhook/README.md`
- `deprecated/twilio-webhook/public/index.html`
- `deprecated/twilio-webhook/public-wa/index.html`
- `deprecated/twilio-webhook/whatsapp.js`

### Root/deploy

- `docker-compose.yml`

## Conclusao

O projeto esta em um estado honesto de infraestrutura sandbox/testnet: grande parte da experiencia ja esta conectada, mas PIX, rail institucional e payout USD ainda dependem de simulacao, fallback ou provider sandbox em pontos criticos.

Para demos, isso e aceitavel se for apresentado como sandbox/testnet e se os paines tecnicos mostrarem claramente `mock`, `sandbox`, `testnet`, `fallback` ou `real`.

Para producao, os tres bloqueios principais sao:

1. substituir confirmacoes PIX simuladas por webhook real assinado;
2. substituir `mock-stellar-*` por tx hash real sempre que a tela disser que ha evidencia blockchain;
3. substituir payout mock/sandbox por provider real, status real e reconciliation real.
