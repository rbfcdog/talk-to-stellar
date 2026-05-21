# UX fee reduction upgrade map - TalkToStellar

Este mapa lista melhorias de UX/UI focadas em provar a tese principal do produto:

```text
PIX em BRL -> rota Stellar/USDC -> instrucao USD
com menos custo visivel do que o caminho tradicional de cambio/remessa.
```

## Problema corrigido agora

Na tela `/international-transfer`, o botao de confirmacao de funding estava chamando diretamente:

```text
/api/webhooks/etherfuse/pix
```

Esse endpoint e um webhook de provedor e valida `ETHERFUSE_WEBHOOK_SECRET`. Por isso a UI mostrava:

```text
Invalid Etherfuse webhook secret.
```

Esse erro era de arquitetura de UX: uma acao de demo no browser estava usando uma rota de webhook externo. A correcao foi separar os fluxos:

- Webhook real da Etherfuse continua protegido por secret.
- Tester interno agora usa `/api/transfers/:id/funding-confirmation`.
- A confirmacao interna so aceita funding mockado/sandbox, para nao simular recebimento de Pix real.

## Norte de UX

A primeira coisa que o usuario/reviewer deve entender nao e "tem hash", mas:

```text
Quanto entrou?
Quanto chegaria por uma rota tradicional?
Quanto chega pela rota TalkToStellar?
Qual foi o custo total?
Qual foi a economia estimada?
Qual evidencia prova cada etapa?
```

## Melhorias implementadas nesta passada

- Adicionado painel "Fee compression view" acima do fluxo tecnico.
- Comparacao contra benchmark tradicional de 3,5%.
- Destaque de:
  - taxa da rota;
  - taxa tradicional estimada;
  - economia estimada;
  - valor final entregue.
- Troca de copy de "USD rail control room" para "Cost-efficient USD route room".
- Campos de `Session ID`, `Session token` e PIN movidos para "Advanced execution credentials".
- Botao de funding mudou de "Funding confirmed" para "Confirm funding".
- Fluxo completo agora fala "sandbox funding confirmation", nao "funding webhook".

## Upgrades recomendados para a proxima rodada

### 1. Fee-first route summary

Antes de mostrar logs ou JSON, mostrar um resumo fixo:

```text
Origem: R$ 1.000,00
Benchmark tradicional: 3,5%
Taxa TalkToStellar: 0,x%
Economia estimada: R$ xx,xx
Valor final USD: US$ xxx.xx
```

Impacto: o reviewer entende a tese de menor custo antes de olhar infra.

### 2. "Why cheaper?" breakdown

Adicionar uma lista curta de fatores:

- menos spread escondido;
- menos intermediarios correspondentes;
- liquidez/rota USDC transparente;
- settlement Stellar com custo baixo;
- instrucao de destino separada do cambio.

Impacto: transforma o numero de economia em argumento tecnico.

### 3. Route comparison toggle

Adicionar controle:

```text
Traditional bank estimate | TalkToStellar route | Provider adapter cost
```

Impacto: deixa claro que a economia vem da rota, nao de ignorar impostos/regulacao.

### 4. Fee confidence state

Cada cotacao deve mostrar:

- validade da cotacao;
- fonte da taxa;
- se a taxa e mock, fallback ou pathfinding;
- se provider fee e estimada ou real;
- timestamp.

Impacto: evita overclaim em demo.

### 5. Hide technical payloads by default

JSON, logs, session, token, provider payload e API trace devem ficar atras de accordions:

```text
Show technical evidence
Show raw API log
Show provider payload
```

Impacto: a tela fica entendivel para produto, mas continua boa para auditoria tecnica.

### 6. Savings receipt

No final da rota, gerar um "route receipt":

```text
Rota: BRL source -> Stellar USDC -> USD destination instruction
Entrada: R$ x
Destino estimado: US$ y
Taxa total: US$ z
Economia estimada vs 3,5%: R$ w
Evidencias: Pix ref, Stellar hash, memo, payout instruction id
```

Impacto: fecha a demo com uma prova compartilhavel.

### 7. Fee guardrails

Se a rota nao economizar, a UI deve dizer:

```text
Esta rota nao bate o benchmark agora. Gere nova cotacao ou use outro provider.
```

Impacto: aumenta confianca porque o produto nao promete economia sempre.

### 8. Copy padrao

Usar sempre:

- "taxa da rota" em vez de "fee" no modo produto;
- "economia estimada" em vez de "saving guaranteed";
- "benchmark tradicional" em vez de "banco ruim";
- "instrucao USD" em vez de "payout real" quando estiver sandbox.

## Ordem sugerida

1. Consolidar o painel fee-first.
2. Gerar receipt da rota.
3. Adicionar comparador visual de taxas.
4. Esconder JSON/logs por padrao.
5. Adicionar guardrail quando rota nao for melhor.
6. Criar demo script focado em "menos taxa" com timestamps.

