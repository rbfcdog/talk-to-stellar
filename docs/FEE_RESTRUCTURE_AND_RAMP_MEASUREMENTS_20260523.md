# Fee restructure and ramp measurements

Data: 2026-05-23.

## Modelo implementado

O total de taxas exibido agora considera somente:

```text
on-ramp/provider fee
+ TalkToStellar transaction fee
+ off-ramp/provider fee
= total charged fee
```

Fora do total principal:

- IOF/tax;
- benchmark tradicional 3,5%;
- taxa bancaria futura;
- provider fee generica;
- delta residual nao explicado.

## Medicoes reais no sandbox Etherfuse

Ambiente:

```text
backend local: http://localhost:3001
provider: Etherfuse sandbox
asset ponte: TESOURO on Stellar
mock local: desativado
```

### On-ramp PIX de R$ 10,00

Chamada executada:

```text
POST /api/ramp/etherfuse/quote
direction: onramp
from: BRL
to: TESOURO
amount: 10
```

Resposta medida:

```text
fromAmount: 10 BRL
toAmount: 8.65911293548266745795 TESOURO
exchangeRate: 0.865911293548266745795
Etherfuse feeAmount: 0.02 BRL
Etherfuse feeBps: 20 bps
```

Taxas cobradas no modelo atual:

```text
Etherfuse on-ramp fee: R$ 0,02
TalkToStellar transaction fee: R$ 0,05
Total charged fee: R$ 0,07
Net BRL after charged fees: R$ 9,93
```

Observacao: a taxa TalkToStellar usa o default atual de `30 bps` com minimo BRL de `R$ 0,05`.

### Off-ramp para receber R$ 10,00

Chamada executada:

```text
POST /api/ramp/etherfuse/offramp-preview
source_asset_code: BRL
target_currency: BRL
fiat_amount: 10
```

Resposta medida:

```text
amount_tesouro: 8.7023113 TESOURO
destination_amount: 9.99 BRL
exchangeRate: 1.1479708844706578124825297849
Etherfuse feeAmount: 0.0174046226 TESOURO
Etherfuse feeBps: 20 bps
```

Equivalente da taxa do provider:

```text
0.0174046226 TESOURO * 1.1479708844706578124825297849
= R$ 0,01998
```

Taxas cobradas no modelo atual:

```text
Etherfuse off-ramp fee: 0.0174046226 TESOURO, aproximadamente R$ 0,01998
TalkToStellar transaction fee: R$ 0,00 neste preview BRL -> BRL
Total charged fee: aproximadamente R$ 0,01998
```

### Off-ramp de 10 USDC para BRL

Chamada executada:

```text
POST /api/ramp/etherfuse/offramp-preview
source_asset_code: USDC
source_amount: 10
target_currency: BRL
```

Resposta medida:

```text
source_amount: 10 USDC
target_brl: 56.0000000 BRL
amount_tesouro: 48.6967108 TESOURO
destination_amount: 56.00 BRL
exchangeRate: 1.149974999954206352680394997
Etherfuse feeAmount: 0.0973934216 TESOURO
Etherfuse feeBps: 20 bps
TalkToStellar feeAmount: 0.03 USDC
```

Equivalente da taxa do provider:

```text
0.0973934216 TESOURO * 1.149974999954206352680394997
= R$ 0,11200
```

Taxas cobradas no modelo atual:

```text
Etherfuse off-ramp fee: 0.0973934216 TESOURO, aproximadamente R$ 0,11200
TalkToStellar transaction fee: 0.03 USDC
```

## O que ainda bloqueia transacao completa

As quotes reais funcionaram.

A criacao de ordem on-ramp/off-ramp retornou erro do provider:

```text
Proxy account not found
```

E a conta fiat do customer voltou vazia:

```text
items: []
totalItems: 0
```

Isso significa que ainda falta finalizar a configuracao de proxy/fiat account da Etherfuse sandbox para transformar quote em ordem executavel. O codigo nao deve cair para mock local para esconder esse problema.
