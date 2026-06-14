# Matriz dinamica de conversao

## Objetivo

O sistema agora expoe uma matriz dinamica de conversao entre os quatro ativos principais:

- BRL, liquidado na Stellar como `TESOURO`
- USDC
- CETES
- XLM

Isso gera 16 celulas: origem x destino, incluindo os pares iguais. A tela `/convert` usa essa matriz para mostrar uma estimativa antes do PIN, mas a confirmacao final continua recalculando a rota real no backend.

## Endpoint

Backend:

```http
GET /api/financial/conversion-matrix?assets=BRL,USDC,CETES,XLM
```

Frontend proxy:

```http
GET /api/financial/conversion-matrix?assets=BRL,USDC,CETES,XLM
```

Exemplo reduzido de resposta:

```json
{
  "success": true,
  "network": "TESTNET",
  "assets": ["BRL", "USDC", "CETES", "XLM"],
  "summary": {
    "total_pairs": 16,
    "available_pairs": 16,
    "synthetic_pairs": 6,
    "unavailable_pairs": 0
  },
  "matrix": {
    "BRL": {
      "USDC": {
        "rate": 0.1904761905,
        "status": "available",
        "source": "transaction_values"
      }
    }
  }
}
```

## Como cada taxa e calculada

1. Mesmo ativo

`BRL -> BRL`, `USDC -> USDC`, `CETES -> CETES`, `XLM -> XLM`.

Status: `same_asset`.

Taxa: `1`.

2. BRL/USDC

Usa a rota Stellar configurada:

- `BRL` vira `TESOURO`
- usa `BrlReferenceRateService.quoteBrlToUsdc`
- ou `BrlReferenceRateService.quoteUsdcToBrl`
- valida apenas a faixa de sanidade configurada sobre o valor retornado pela propria rota

Se a liquidez da testnet estiver distorcida ou a rota falhar, o par fica `unavailable`.

Status: `available` quando ha rota; `unavailable` quando nao ha rota confiavel.

Nao existe fallback externo. O backend nao usa Binance, AwesomeAPI, Coinbase, Frankfurter, env fallback ou outra fonte de mercado para decidir conversao.

3. Outros pares diretos

Para pares como:

- `XLM -> USDC`
- `USDC -> XLM`
- `CETES -> USDC`
- `USDC -> CETES`
- `BRL -> XLM`

o backend chama:

```ts
StellarService.quoteStrictSendConversion()
```

Essa funcao usa Horizon `strictSendPaths`, escolhe a rota confiavel com maior valor de destino e aplica as regras de taxa configuradas.

Status: `available`.

4. Pares sinteticos

Se uma rota direta nao existir, o sistema tenta compor por um ativo ponte ja cotado dinamicamente.

Exemplo:

```text
XLM -> CETES
```

Se nao houver rota direta, mas houver:

```text
XLM -> USDC
USDC -> CETES
```

a taxa fica:

```text
rate(XLM -> CETES) = rate(XLM -> USDC) * rate(USDC -> CETES)
```

Status: `synthetic`.

O campo `bridge_asset_code` mostra o ativo ponte usado.

5. Sem liquidez

Se nao existir rota direta nem rota por ponte confiavel, a celula continua na resposta, mas com:

```json
{
  "status": "unavailable",
  "rate": null
}
```

O sistema nao inventa taxa quando nao ha dado confiavel.

## Por que sao 16 taxas

Com 4 ativos, a matriz e:

| De / Para | BRL | USDC | CETES | XLM |
|---|---:|---:|---:|---:|
| BRL | 1 | BRL->USDC | BRL->CETES | BRL->XLM |
| USDC | USDC->BRL | 1 | USDC->CETES | USDC->XLM |
| CETES | CETES->BRL | CETES->USDC | 1 | CETES->XLM |
| XLM | XLM->BRL | XLM->USDC | XLM->CETES | 1 |

Total: 4 x 4 = 16.

## Arquivos principais

- `backend/src/api/services/conversion-rate-matrix.service.ts`
- `backend/src/api/controllers/financial.controller.ts`
- `backend/src/api/routes/financial.router.ts`
- `frontend/app/convert/convert-client.tsx`
- `backend/tests/conversion-rate-matrix.service.test.ts`

## Variaveis relevantes

```env
CONVERSION_MATRIX_ASSETS=BRL,USDC,CETES,XLM
CONVERSION_MATRIX_SAMPLE_AMOUNT=100
CONVERSION_MATRIX_SAMPLE_BRL=100
CONVERSION_MATRIX_SAMPLE_USDC=100
CONVERSION_MATRIX_SAMPLE_CETES=100
CONVERSION_MATRIX_SAMPLE_XLM=100
```

Assets e issuers:

```env
STELLAR_NETWORK=TESTNET
USDC_ISSUER=...
TESOURO_ISSUER=...
CETES_ISSUER_TESTNET=...
TTS_VISIBLE_ASSET_CODES=TESOURO,USDC,CETES,XLM
```

Referencia dinamica USD/BRL:

```env
USD_BRL_SANITY_MIN=3
USD_BRL_SANITY_MAX=10
USD_BRL_SANITY_MIN=3
USD_BRL_SANITY_MAX=10
```

## Garantias

- A API sempre retorna 16 celulas para os quatro ativos padrao.
- Cada celula informa a fonte da taxa.
- A UI mostra se a taxa veio da rota direta, de uma ponte sintetica ou se esta indisponivel.
- A confirmacao final nao confia cegamente na matriz; ela recalcula a rota antes do PIN.
- Em testnet, uma cotacao BRL/USDC absurda e rejeitada. O sistema nao substitui por referencia externa.

## PIX com entrega exata em ativo final

Quando o usuario pede algo como:

```text
fazer PIX para Ana Silva de 100 XLM
```

o valor `100 XLM` e tratado como valor final do destinatario, nao como `R$ 100`.

O fluxo correto e:

1. O agente gera `/pix-on` com:
   - `flow=fund_and_pay`
   - `receive_amount=100`
   - `receive_asset=XLM`
   - `pay_amount=100`
   - `pay_asset=XLM`
   - `recipient=Ana Silva`

2. A tela nao copia `amount=100` para o campo BRL se `currency=XLM`, `CETES` ou `USDC`.

3. O backend calcula a cotacao inversa:
   - origem real do PIX: `BRL`
   - ativo ponte do anchor: `TESOURO`
   - destino final: `XLM`, `CETES`, `USDC` ou `BRL`
   - valor final exato: `desired_final_amount`

4. Para ativo final nao-BRL, o backend chama `StellarService.quotePathPayment()` com strict receive:

```text
TESOURO -> ativo_final
destAmount = desired_final_amount
```

5. A quantidade de `TESOURO` necessaria para entregar o ativo final vira o valor liquido desejado do on-ramp.

6. O backend aplica as taxas de entrada por fora:

```text
PIX bruto = TESOURO necessario + taxa Etherfuse + taxa TalkToStellar
```

7. A ordem PIX e criada com esse valor bruto. Depois da confirmacao do PIX, a conversao final usa strict receive para entregar exatamente o ativo/valor pedido ao destinatario.

Arquivos principais desse fluxo:

- `backend/src/api/services/anchor.service.ts`
- `backend/src/api/agent/graph.ts`
- `frontend/app/pix-ramp/pix-ramp-client.tsx`
- `backend/tests/anchor-simulate-fiat.test.ts`
- `backend/tests/agent-pix-offramp.test.ts`
- `frontend/__tests__/unit/pix-ramp-asset-default.test.ts`

## Como testar

```bash
npm --prefix backend test -- --runInBand tests/conversion-rate-matrix.service.test.ts
```

Build completo:

```bash
npm --prefix backend run build
npm --prefix frontend run build
```
