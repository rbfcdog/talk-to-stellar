# Sistema de taxas atual - TalkToStellar

Este documento explica como o sistema de taxas funciona hoje no TalkToStellar e lista todos os pontos do produto em que uma taxa pode aparecer.

Estado do documento: implementacao atual da codebase em 2026-05-23.

## Resumo executivo

Hoje existem quatro categorias principais de custo:

1. Taxa da rede Stellar: custo tecnico de submeter transacoes na Stellar, pago em XLM para a rede.
2. Taxa de transacao TalkToStellar: spread/fee configuravel do produto, aplicado principalmente em rotas BRL <-> USDC.
3. Taxas de provider/ramp: taxas retornadas por Etherfuse ou outro provider de on-ramp/off-ramp/payout.
4. Imposto/IOF/tax: somente exibido quando um provider/quote regulado retornar esse componente. No sandbox, o sistema nao inventa IOF.

Tambem existe um benchmark de 3,5% para comparar com metodos tradicionais. Esse benchmark nao e cobrado do usuario; ele serve apenas para mostrar economia estimada.

## Regra mais importante

A fonte de verdade deve ser sempre o backend/provider.

A UI pode estimar ou exibir uma ponte visual para demo, mas a ordem de prioridade correta e:

1. Valor/taxa retornado pelo provider.
2. Valor/taxa calculado pelo backend.
3. Valor inferido por diferenca entre antes/depois.
4. Estimativa visual apenas quando o backend ainda nao retornou a linha.

Se uma taxa nao vier do provider, a UI deve mostrar "nao retornado", "pendente" ou calcular empiricamente pelo delta. Ela nao deve inventar IOF, tarifa bancaria ou provider fee.

## Variaveis de ambiente relevantes

| Variavel | Uso | Default atual |
| --- | --- | --- |
| `TALKTOSTELLAR_SPREAD_BPS` / `TTS_SPREAD_BPS` | Define a taxa TalkToStellar em basis points. | `30` bps = `0,30%` |
| `TALKTOSTELLAR_SPREAD_MIN_BRL` / `TTS_SPREAD_MIN_BRL` | Taxa minima quando a fonte e BRL. | `0.05` BRL |
| `TALKTOSTELLAR_SPREAD_MIN_USDC` / `TTS_SPREAD_MIN_USDC` | Taxa minima quando a fonte e USDC. | `0.01` USDC |
| `TALKTOSTELLAR_FEE_TREASURY_PUBLIC_KEY` / `TTS_FEE_TREASURY_PUBLIC_KEY` | Conta Stellar que recebe a taxa TalkToStellar quando a cobranca on-chain esta ativa. | vazio |
| `NEXT_PUBLIC_TALKTOSTELLAR_TRANSACTION_FEE_BPS` / `NEXT_PUBLIC_TTS_SPREAD_BPS` | Estimativa visual usada no frontend de PIX quando o backend ainda nao trouxe a ponte completa. | `30` bps |
| `TRADITIONAL_FEE_PCT` | Benchmark de comparacao com metodo tradicional. | `0.035` = `3,5%` |
| `BRL_USDC_QUOTE_SYMBOL` | Simbolo usado para buscar BRL/USDC em algumas conversoes de taxa. | `USDCBRL` |
| `BRL_USDC_QUOTE_TIMEOUT_MS` | Timeout para buscar preco externo. | `8000` ms |
| `XLM_USDC_FALLBACK_RATE` | Fallback para converter taxa XLM em USDC. | `0.1` |
| `USD_BRL_FALLBACK_RATE` / `DEFAULT_USD_BRL_RATE` | Fallback para converter USD/USDC em BRL. | `5` |
| `PAYOUT_PROVIDER` | Adapter usado na rail institucional. | `mock` |

Observacao: se `TALKTOSTELLAR_FEE_TREASURY_PUBLIC_KEY` nao estiver configurada, a taxa TalkToStellar pode aparecer como estimativa/preview, mas a cobranca on-chain dessa taxa nao fica ativa no fluxo Stellar.

## Todas as instancias que podem ter taxa

| Instancia | Quando aparece | Quem recebe | Fonte atual |
| --- | --- | --- | --- |
| Taxa de rede Stellar | Ao assinar/enviar uma transacao Stellar, conversao ou path payment. | Rede Stellar. | `STELLAR_BASE_FEE_STROOPS = 100` em `backend/src/api/services/stellar.service.ts`; display em `backend/src/utils/fee-display.ts`. |
| Taxa TalkToStellar | Em rotas BRL <-> USDC, pagamentos/conversoes otimizadas e previews. | Treasury TalkToStellar, se configurada. | `backend/src/api/services/platform-fee.service.ts`. |
| Taxa Etherfuse on-ramp | Ao colocar BRL via PIX ou usar PIX para financiar pagamento. | Etherfuse/provider de ramp. | Campos `feeAmount`, `fee`, `anchorProviderFeeAmount` ou `feeBps` da quote Etherfuse. |
| Taxa Etherfuse off-ramp | Ao retirar para PIX ou executar prova de off-ramp. | Etherfuse/provider de ramp. | Campos `feeAmount`, `feeAmountInFiat`, `feeBps` ou diferenca entre valor bruto e liquido. |
| Taxa de payout provider | Na rail institucional BRL -> USDC -> USD -> conta internacional. | Provider de payout/off-ramp, ex: mock, Circle, Bridge, Etherfuse proof. | `estimated_provider_fee` na quote e metadata do adapter/payout. |
| Taxa bancaria/ACH/Wire | Futuro payout real para conta USD. | Banco/rail de payout. | Hoje nao e cobrada automaticamente; pode entrar via metadata do provider. |
| IOF/imposto/tax | Quando provider/quote regulado retornar componente fiscal. | Autoridade fiscal/regulador via parceiro. | Hoje `tax_estimate_source` fica `not_configured_for_sandbox_quote` se nao houver provider. |
| Spread de liquidez/FX | Quando a taxa de cambio efetiva difere da referencia. | Market maker/provider/DEX/tesouraria. | Pode aparecer como delta empirico ou `unallocated_route_delta_usd`. |
| Benchmark tradicional 3,5% | Em UI, comprovantes, economia estimada e painel institucional. | Ninguem. Nao e cobrado. | `TRADITIONAL_FEE_PCT`, default `3,5%`. |

## 1. Taxa de rede Stellar

A taxa de rede e o custo tecnico da Stellar. Ela nao e receita do TalkToStellar.

Implementacao atual:

- `backend/src/api/services/stellar.service.ts` usa `STELLAR_BASE_FEE_STROOPS = '100'`.
- `backend/src/utils/fee-display.ts` usa `DEFAULT_NETWORK_FEE_XLM = '0.0000100'`.
- `formatNetworkFeeForCustomer()` converte essa taxa para USDC e BRL usando Binance quando disponivel ou fallback quando nao ha preco externo.

Onde aparece:

- confirmacao de pagamento;
- conversao USDC/BRL;
- recibos;
- economia estimada;
- preview financeiro.

Como e exibida:

```text
R$ <valor pequeno> / US$ <valor pequeno>
```

## 2. Taxa de transacao TalkToStellar

Esta e a taxa propria do produto. No codigo ela aparece como `PlatformFeeService`, `platformFee`, `platform_spread_fee`, `talktostellar_transaction_fee_amount` ou `TalkToStellar transaction fee`.

Configuracao atual:

- default: `30` bps;
- 30 bps = `0,30%`;
- minimo BRL: `R$ 0,05`;
- minimo USDC: `US$ 0,01`;
- limite maximo defensivo no parser: `1000` bps = `10%`.

Quando aplica:

- somente em par BRL <-> USDC;
- exemplo: BRL -> USDC, USDC -> BRL;
- nao aplica para qualquer asset aleatorio;
- no backend, a cobranca on-chain so fica realmente ativa se `TALKTOSTELLAR_FEE_TREASURY_PUBLIC_KEY` ou `TTS_FEE_TREASURY_PUBLIC_KEY` estiver configurada.

Modos:

| Modo | Uso | Efeito |
| --- | --- | --- |
| `deduct_from_source` | Strict-send, on-ramp, quote BRL -> USDC. | Deduz a taxa do valor fonte e usa o restante na rota. |
| `add_on_top` | Strict-receive. | Calcula quanto precisa enviar a mais para o destinatario receber valor exato. |

Exemplo simples:

```text
Entrada: R$ 100,00
Taxa TalkToStellar: 0,30% = R$ 0,30
Valor liquido para rota: R$ 99,70
```

## 3. Taxa de provider no PIX on-ramp

On-ramp significa entrada: o usuario paga PIX em BRL e o sistema entrega saldo/valor digital.

No fluxo Etherfuse, o backend procura taxa nestes campos da quote:

```text
feeAmount
fee
anchorProviderFeeAmount
feeBps
```

Se o provider retornar valor absoluto, esse valor e usado. Se retornar apenas `feeBps`, o backend calcula:

```text
provider_fee = source_amount * (feeBps / 10000)
```

Depois o backend soma:

```text
total_fee = provider_on_ramp_fee + talktostellar_transaction_fee
net_amount = gross_amount - total_fee
```

Campos persistidos no contexto da operacao PIX:

```text
provider_onramp_fee_amount
talktostellar_transaction_fee_amount
total_fee_amount
fee_currency = BRL
```

Esse e o bloco que deve aparecer na demo de PIX:

```text
Entrada: valor que sai no PIX
Taxa on-ramp: taxa real/retornada pelo provider
Taxa TalkToStellar: taxa de transacao do produto
Depois da taxa: valor liquido usado para saldo/pagamento
Benchmark normal: 3,5% apenas comparativo
```

## 4. Taxa de provider no PIX off-ramp

Off-ramp significa saida: o usuario queima/envia o ativo digital e recebe BRL via PIX.

No Etherfuse, a taxa pode aparecer como:

```text
feeAmount
feeAmountInFiat
feeBps
```

Ou pode ser inferida por:

```text
valor_antes_da_taxa - valor_depois_da_taxa
```

No sandbox, se o provider nao retornar taxa, a UI deve deixar claro que a taxa nao foi retornada ou que a linha esta pendente. Ela nao deve inventar uma tarifa.

Importante:

- A prova de off-ramp Etherfuse pode ser sandbox/mock.
- A taxa bancaria real de um PIX/off-ramp de producao depende do contrato com o provider.
- A taxa TalkToStellar exibida no painel PIX off-ramp pode ser preview/estimativa se o backend ainda nao retornou a ponte completa.

## 5. Taxas em pagamentos e conversoes pelo chat

Quando o usuario pede algo como:

```text
enviar 10 dolares para Ana
converter 50 reais para dolares
```

O fluxo usa:

1. quote/pathfinding Stellar;
2. taxa TalkToStellar se a rota for BRL <-> USDC;
3. taxa de rede Stellar;
4. recibo com taxa total unificada.

O backend usa `buildUnifiedFeeDisplay()` para somar:

```text
taxa_total = taxa_rede_stellar + taxa_talktostellar
```

Essa soma so inclui a taxa TalkToStellar quando o par e BRL <-> USDC e a taxa esta presente.

## 6. Taxas no fluxo institucional BRL -> USD

No painel `/international-transfer`, a taxa e mostrada como ponte antes/depois:

```text
BRL fonte
-> USD bruto antes dos custos
-> taxa on-ramp
-> taxa TalkToStellar
-> taxa off-ramp/payout
-> tax/IOF se retornado
-> USD liquido no destino
```

Na criacao da quote BRL -> USD:

- o backend calcula a taxa TalkToStellar;
- `estimated_provider_fee` atualmente comeca como `0` e `pending_provider_quote`;
- `tax_estimate_usd` fica `0` e `not_configured_for_sandbox_quote`;
- a quote salva `platform_fee`, `estimated_provider_fee` e `total_fee`.

Depois, a camada de reconciliacao calcula empiricamente:

```text
baseline_usd = brl_amount / fx_rate
known_component_fee = platform_fee + on_ramp_fee + off_ramp_fee + tax_fee
implied_cost = baseline_usd - quoted_destination_usd
unallocated_route_delta = max(0, implied_cost - known_component_fee)
total_empirical_fee = known_component_fee + unallocated_route_delta
destination_usd_after_route_costs = baseline_usd - total_empirical_fee
```

Isso existe para evitar numero fixo falso. A taxa efetiva deve ser medida pela propria rota e pelos providers.

## 7. Imposto, IOF e tax

O sistema atual nao calcula IOF sozinho.

Regra atual:

- se o provider retornar imposto, o sistema pode exibir;
- se o provider nao retornar, a UI mostra "nao configurado" ou "nao retornado";
- no sandbox, `tax_estimate_source` fica `not_configured_for_sandbox_quote`;
- o produto nao deve prometer fugir de imposto/regulacao.

## 8. Benchmark tradicional de 3,5%

O valor de 3,5% e uma comparacao, nao uma taxa cobrada.

Uso:

- mostrar economia estimada;
- explicar o diferencial contra spread/tarifas tradicionais;
- preencher paineis de "normal/tradicional";
- calcular `estimatedTraditionalFee` no `EconomyEngineService`.

Default:

```text
TRADITIONAL_FEE_PCT = 0.035
```

Exemplo:

```text
Valor: R$ 1.000,00
Benchmark tradicional: 3,5% = R$ 35,00
Rota TalkToStellar: R$ 5,50
Economia estimada: R$ 29,50
```

Isso nao significa que o TalkToStellar cobrou R$ 35,00. Significa que a referencia tradicional usada para comparacao seria R$ 35,00.

## Fluxo por produto

### A. Colocar dinheiro com PIX

Taxas possiveis:

1. Etherfuse/on-ramp provider fee.
2. Taxa TalkToStellar.
3. Conversao/rota se o saldo final precisar virar USDC/BRL.

Nao deve aparecer:

- taxa de off-ramp;
- tarifa bancaria de saque;
- IOF inventado.

### B. Retirar dinheiro para PIX

Taxas possiveis:

1. Etherfuse/off-ramp provider fee.
2. Taxa TalkToStellar se houver conversao BRL <-> USDC ou se o backend retornar essa ponte.
3. Taxa de rede Stellar para assinar/submeter a transacao de burn/envio.

Nao deve aparecer:

- taxa on-ramp;
- IOF inventado;
- 3,5% como taxa real.

### C. Enviar para contato

Taxas possiveis:

1. Taxa de rede Stellar.
2. Taxa TalkToStellar se houver conversao BRL <-> USDC.
3. Spread/rota se houver pathfinding com cambio.

Nao deve aparecer:

- taxa Etherfuse, a menos que o pagamento seja financiado por PIX;
- taxa de provider bancario.

### D. Converter saldo

Taxas possiveis:

1. Taxa de rede Stellar.
2. Taxa TalkToStellar se for BRL <-> USDC.
3. Delta de rota/pathfinding.

### E. Rail institucional BRL -> USD

Taxas possiveis:

1. Provider on-ramp.
2. TalkToStellar transaction fee.
3. Stellar network fee.
4. Provider off-ramp/payout fee.
5. Tax/IOF se retornado pelo provider.
6. Custo nao alocado de rota/liquidez quando o delta bruto-liquido nao for explicado por linhas explicitas.

## Onde as taxas aparecem na UI

| Tela | O que mostra |
| --- | --- |
| `/pix-on` / `/pix-ramp?mode=onramp` | Taxa on-ramp, taxa TalkToStellar, antes/depois, benchmark 3,5%. |
| `/pix-off` / `/pix-ramp?mode=offramp` | Taxa off-ramp, taxa TalkToStellar, antes/depois, benchmark 3,5%. |
| `/confirm-payment` | Valor, destino, taxa estimada/total e comprovante apos sucesso. |
| `/confirm-conversion` | Conversao, taxa estimada e comprovante. |
| `/international-transfer` | Ponte completa: fonte BRL, USD bruto, on-ramp, TalkToStellar, off-ramp/payout, tax e USD liquido. |
| `/transactions` e `/receipt` | Taxa final usada no comprovante/historico quando disponivel. |

## Fontes de codigo principais

| Arquivo | Responsabilidade |
| --- | --- |
| `backend/src/api/services/platform-fee.service.ts` | Calcula a taxa TalkToStellar/spread. |
| `backend/src/utils/fee-display.ts` | Converte taxa de rede e soma taxa de rede + taxa TalkToStellar para exibicao. |
| `backend/src/api/services/stellar.service.ts` | Aplica taxa de rede Stellar e, quando ativa, adiciona operacao de pagamento da taxa TalkToStellar para a treasury. |
| `backend/src/api/services/anchor.service.ts` | Calcula ponte de taxa PIX on-ramp/off-ramp e persiste contexto de operacao Etherfuse. |
| `backend/src/api/services/brl-usd-quote.service.ts` | Quote BRL -> USD institucional; cria platform fee e marca provider/tax como pendente no sandbox. |
| `backend/src/api/services/settlement-evidence.service.ts` | Reconciliacao empirica das taxas no fluxo institucional. |
| `backend/src/api/services/payment-receipt.service.ts` | Resolve taxa final para recibo e economia estimada. |
| `backend/src/api/services/economy-engine.service.ts` | Calcula economia vs benchmark tradicional. |
| `frontend/app/pix-ramp/pix-ramp-client.tsx` | Exibe antes/depois, taxa ramp, taxa TalkToStellar e benchmark normal. |
| `frontend/app/international-transfer/international-transfer-client.tsx` | Exibe ponte institucional empirica e fee delta. |

## Lacunas atuais e cuidados

1. Backend e provider devem ser autoridade.
   O frontend tem estimativas para melhorar demo, mas nao deve ser a fonte final de cobranca.

2. Treasury precisa estar configurada.
   Sem `TALKTOSTELLAR_FEE_TREASURY_PUBLIC_KEY`, a taxa TalkToStellar pode ser calculada, mas a cobranca on-chain nao fica ativa.

3. Provider fee depende do provider.
   Etherfuse sandbox pode nao retornar todas as linhas de taxa. Quando nao retornar, o sistema deve mostrar pendente/nao retornado ou inferir pelo delta.

4. IOF nao esta implementado como regra fiscal propria.
   Deve vir de provider/parceiro regulado ou de uma camada fiscal futura.

5. O benchmark de 3,5% nunca deve ser chamado de taxa cobrada.
   Ele e apenas comparacao com metodo tradicional.

6. Taxa bancaria real ainda depende de adapter real.
   ACH, wire, SWIFT, banco recebedor e conta internacional ainda entram como metadata/provider adapter no fluxo institucional.

## Narrativa recomendada para demo

Use esta explicacao:

```text
O TalkToStellar separa as taxas em linhas claras. No PIX, mostramos a taxa do provider de entrada ou saida e a taxa de transacao do TalkToStellar. Em pagamentos e conversoes, mostramos a taxa da rede Stellar e a taxa TalkToStellar quando existe conversao BRL/USDC. Na rail institucional, medimos empiricamente o caminho completo: valor bruto, on-ramp, TalkToStellar, off-ramp/payout, impostos se o provider retornar, e valor liquido final. O numero de 3,5% e apenas benchmark de mercado tradicional para comparar economia, nao uma taxa cobrada.
```

## Checklist para validar taxa em demo

Antes de gravar:

- Verifique se o valor de origem aparece.
- Verifique se a taxa on-ramp aparece apenas em entrada PIX.
- Verifique se a taxa off-ramp aparece apenas em saida PIX/payout.
- Verifique se a taxa TalkToStellar aparece como linha separada.
- Verifique se o benchmark de 3,5% esta escrito como comparacao.
- Verifique se IOF/tax aparece somente quando retornado/configurado.
- Verifique se o valor depois da taxa bate com o delta exibido.
- Verifique se o comprovante/historico nao mostra taxa tecnica crua sem explicacao.

