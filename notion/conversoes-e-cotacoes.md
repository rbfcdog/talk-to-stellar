# Conversões e cotações

## Problema corrigido

O sistema estava mostrando uma cotação de venda como se fosse preço de compra.

Exemplo do erro:

- Chat: `1 XLM -> R$ 2,87`
- Tela PIX para entregar XLM: `100 XLM ~= R$ 69`

Esses números não são a mesma operação.

## Dois sentidos diferentes

### 1. Cotação de envio (`send_exact`)

Responde:

> Se eu enviar X do ativo A, quanto recebo do ativo B?

Exemplo:

> Converter 100 XLM para BRL

Nesse modo, o backend usa a melhor rota de envio:

```text
A enviado -> B recebido
```

Tecnicamente, a rota vem da matriz dinâmica de conversão usando pathfinding `strictSendPaths` quando o par é on-chain, ou referência BRL/USDC segura quando o par envolve BRL e USDC.

### 2. Preço de mercado por alvo exato (`market_price`)

Responde:

> Quanto do ativo B preciso pagar para receber X do ativo A?

Exemplo:

> Quanto custa 100 XLM em reais?

Nesse modo, o backend usa alvo exato:

```text
BRL necessário -> XLM recebido exatamente
```

Tecnicamente, ele usa `strictReceivePaths`, o mesmo sentido usado na tela de PIX quando o usuário escolhe receber um valor final em outro ativo.

## Como o PIX calcula

Quando o usuário escolhe receber `100 XLM` via PIX, a operação real é:

```text
PIX em BRL -> TESOURO/BRL na Stellar -> XLM final
```

O valor em BRL é calculado em duas camadas:

1. Rota de conversão para descobrir quanto BRL líquido é necessário para entregar o alvo final.
2. Taxas por fora do PIX/on-ramp para que o valor final chegue inteiro.

Por isso o PIX não deve usar a cotação de venda `XLM -> BRL`. Ele precisa usar a cotação de alvo exato `BRL -> XLM`.

## Por que a testnet pode parecer arbitrada

Na testnet, a liquidez pode estar distorcida. Então comprar e vender o mesmo par podem não ser inversos perfeitos.

Exemplo possível:

```text
Vender 1 XLM -> R$ 2,87
Comprar/receber 1 XLM -> R$ 0,69
```

Isso não significa que existe uma oportunidade real de arbitragem em produção. Significa que os pools e ofertas da testnet estão desequilibrados. Por isso a UI e o bot precisam mostrar o modo correto da operação, não uma "taxa universal".

## Regra do agente

O roteador LLM agora deve escolher:

- `quote_mode=market_price` para:
  - `cotação XLM/BRL`
  - `preço de XLM em reais`
  - `quanto custa 100 XLM em BRL`

- `quote_mode=send_exact` para:
  - `melhor rota de USDC pra BRL`
  - `converter 100 XLM para BRL`
  - `vender 100 XLM por reais`
  - `quanto recebo se mandar 100 XLM para BRL`

## Tool

Tool atual:

```text
get_pair_quote
```

Entradas principais:

- `source_asset_code`: ativo base da pergunta.
- `dest_asset_code`: ativo de preço ou destino.
- `source_amount`: valor informado. Se não houver, usa `1`.
- `quote_mode`: `market_price` ou `send_exact`.
- `amount_was_provided`: indica se o valor veio do usuário ou foi preenchido como unidade.

## Pares cobertos

A matriz dinâmica cobre os 4 ativos principais:

```text
BRL, USDC, CETES, XLM
```

Isso gera 16 pares:

```text
BRL/BRL, BRL/USDC, BRL/CETES, BRL/XLM
USDC/BRL, USDC/USDC, USDC/CETES, USDC/XLM
CETES/BRL, CETES/USDC, CETES/CETES, CETES/XLM
XLM/BRL, XLM/USDC, XLM/CETES, XLM/XLM
```

Quando não existe rota direta segura, a matriz tenta rota sintética por moeda ponte configurada, por exemplo via `USDC`.

## Copy correta para o usuário

Evitar:

```text
Taxa: 1 XLM = R$ 2,87
```

Porque "taxa" parece tarifa.

Usar:

```text
Câmbio: 1 XLM custa cerca de R$ 0,69.
```

ou:

```text
Cotação de envio: 1 XLM -> aproximadamente R$ 2,87.
```

dependendo do modo da operação.
