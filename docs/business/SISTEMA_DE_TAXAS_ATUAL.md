# Sistema de taxas atual - TalkToStellar

Estado: 2026-05-23.

Este documento descreve o modelo atual depois da simplificacao das taxas.

## Principio

O TalkToStellar deve mostrar apenas taxas cobradas no fluxo atual. A UI e os relatorios nao devem somar IOF estimado, benchmark tradicional, taxa bancaria futura, provider fee generica ou delta residual nao explicado como se fossem cobrancas.

## Taxas que entram na conta principal

| Taxa | Quando aparece | Fonte |
| --- | --- | --- |
| On-ramp/provider | Quando BRL entra por PIX ou funding provider. | Quote/order do provider, hoje Etherfuse quando disponivel. |
| TalkToStellar transaction fee | Quando a rota cobra a taxa propria do produto. | `PlatformFeeService` / env de spread. |
| Off-ramp/provider | Quando saldo sai por PIX ou destino externo. | Quote/status/metadata do provider de saida. |

Essas tres linhas formam o total:

```text
total_charged_fee = on_ramp_fee + talktostellar_transaction_fee + off_ramp_fee
net_destination = gross_value - total_charged_fee
```

## Taxas removidas da conta principal

| Item | Regra atual |
| --- | --- |
| IOF/tax | Nao aparece no total enquanto nao vier como cobranca real do provider/regulado. |
| Benchmark tradicional 3,5% | Pode existir como material comparativo, mas nao entra como taxa cobrada. |
| Taxa bancaria/ACH/Wire futura | Nao entra ate existir provider real retornando essa linha. |
| Provider fee generica | Nao entra sem estar mapeada como on-ramp ou off-ramp. |
| Delta residual | Nao entra como cobranca. Se existir diferenca, deve virar investigacao/reconciliacao. |
| Taxa de rede Stellar | Custo tecnico da rede. Pode aparecer em comprovante on-chain, mas nao e taxa de on/off-ramp nem receita TalkToStellar. |

## Configuracao da taxa TalkToStellar

```text
TALKTOSTELLAR_SPREAD_BPS=30
TTS_SPREAD_BPS=30
TALKTOSTELLAR_SPREAD_MIN_BRL=0.05
TTS_SPREAD_MIN_BRL=0.05
TALKTOSTELLAR_SPREAD_MIN_USDC=0.01
TTS_SPREAD_MIN_USDC=0.01
```

Default atual:

```text
30 bps = 0,30%
```

Para cobranca on-chain da taxa TalkToStellar, configurar:

```text
TALKTOSTELLAR_FEE_TREASURY_PUBLIC_KEY=...
TTS_FEE_TREASURY_PUBLIC_KEY=...
```

## PIX on-ramp

Fluxo:

```text
usuario paga PIX
-> provider retorna quote/order
-> backend extrai taxa on-ramp
-> backend adiciona taxa TalkToStellar
-> tela mostra valor antes/depois
```

Campos aceitos do provider:

```text
feeAmount
fee
anchorProviderFeeAmount
feeBps
```

Se o provider retornar somente `feeBps`:

```text
on_ramp_fee = source_amount * feeBps / 10000
```

## PIX off-ramp

Fluxo:

```text
usuario informa retirada
-> backend pede quote/status do provider
-> backend extrai taxa off-ramp
-> backend adiciona taxa TalkToStellar quando aplicavel
-> tela mostra valor antes/depois
```

Campos aceitos:

```text
feeAmount
feeAmountInFiat
feeBps
```

Se o provider retornar valor bruto e liquido, a taxa pode ser medida por:

```text
off_ramp_fee = amount_before_fee - amount_after_fee
```

## Rail institucional BRL -> USD

O painel de infraestrutura calcula:

```text
gross_usd = brl_amount / fx_rate
total_charged_fee_usd =
  on_ramp_fee_usd +
  talktostellar_transaction_fee_usd +
  off_ramp_fee_usd
net_usd = gross_usd - total_charged_fee_usd
```

O painel mostra somente:

```text
Source on-ramp fee
TalkToStellar transaction fee
Destination off-ramp fee
```

## Como explicar

Use:

```text
O sistema separa as taxas cobradas: provider de entrada, taxa TalkToStellar e provider de saida. Outros custos nao entram no total ate serem retornados por um provider real e mapeados para uma dessas linhas.
```

Evite:

```text
O sistema calcula IOF.
O benchmark de 3,5% e uma taxa.
A UI inventa taxa quando o provider nao retorna.
```
