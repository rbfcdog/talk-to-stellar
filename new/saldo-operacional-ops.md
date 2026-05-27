# OPS / saldo operacional

## Resumo

`OPS` e `saldo operacional` significam o mesmo item na UX atual: uma pequena reserva em `XLM` usada para manter a conta funcionando.

Nao e uma nova moeda, nao e rendimento, nao e real, nao e dolar e nao deve ser apresentado como investimento. E o saldo tecnico que a conta precisa para pagar pequenas tarifas de rede e manter margem operacional.

Em termos de produto, pense nele como o minimo que uma conta precisa para continuar ativa e conseguir executar operacoes.

## Como aparece hoje no codigo

Na tela de rendimento/carteira, `XLM` e mostrado para a pessoa como:

```text
Nome: Saldo operacional
Atalho: OPS
Descricao: Usado pelo sistema para pequenas tarifas.
```

Referencia: `frontend/app/rendimentos/rendimentos-client.tsx`.

No agente, quando a pessoa fala `saldo operacional`, `XLM`, `lumen` ou `lumens`, o pedido e normalizado para `XLM`.

Referencia: `backend/src/api/agent/graph.ts`.

## Por que isso existe

A conta precisa de uma reserva pequena para:

1. Pagar tarifas pequenas de operacao.
2. Evitar que a pessoa converta todo o saldo tecnico e deixe a conta sem capacidade de operar.
3. Manter margem para transacoes, trustlines e manutencao operacional.

Hoje, quando o usuario pede para converter todo o saldo operacional, o backend preserva uma reserva de `1.6 XLM`. Se depois da reserva nao sobra valor disponivel, a resposta correta e: `Esse saldo fica reservado para manter sua conta operacional.`

## Como explicar para usuario

Use linguagem simples:

```text
Esse saldo mantem sua conta funcionando. Ele cobre pequenas tarifas e uma reserva de seguranca para que transferencias, conversoes e aplicacoes possam ser processadas.
```

Versao curta:

```text
Reservado para manter sua conta funcionando.
```

Se a pessoa perguntar se pode sacar ou converter:

```text
Uma parte pode ser usada se houver saldo acima da reserva minima. Mantemos uma pequena reserva para a conta continuar funcionando.
```

## O que evitar na UX

Evite mostrar para usuario comum:

```text
gas
crypto fee
Stellar reserve
minimum balance
network reserve
```

Esses termos podem aparecer em tela avancada, suporte tecnico, logs ou documentacao interna, mas nao deveriam ser a explicacao principal.

Tambem evite tratar `OPS` como:

1. Uma moeda nova.
2. Um asset de investimento.
3. Uma opcao de rendimento.
4. Um saldo em reais.
5. Um saldo livre para zerar completamente.

## Recomendacao de UX

O rótulo `OPS` e curto, mas pode confundir. Para telas voltadas ao usuario final, preferir:

```text
Saldo operacional
```

ou, em espacos compactos:

```text
Operacional
```

Mostrar `OPS` apenas como detalhe tecnico ou em telas internas. Em telas bancarias simples, o ideal e deixar esse saldo separado dos saldos principais e explicar que ele fica reservado para funcionamento da conta.

Comportamento recomendado:

1. Nao incluir saldo operacional nas recomendacoes de rendimento.
2. Nao sugerir aplicar esse saldo.
3. Ao converter XLM/OPS, manter reserva minima.
4. Se houver excesso acima da reserva, permitir converter apenas o excesso.
5. Se nao houver excesso, explicar que o saldo esta reservado.

## Diferenca entre OPS e ops de mocks

Existe outro uso de `ops` no codigo:

```text
ALLOW_OPS_MOCKS
TTS_ALLOW_OPS_MOCKS
ops_mocks_allowed
```

Esse `ops` significa `operacoes internas` ou `modo operador/teste`. Nao tem relacao com saldo operacional do usuario.

Resumo da diferenca:

| Termo | Significado |
| --- | --- |
| `OPS` na carteira | XLM mostrado como saldo operacional do usuario |
| `saldo operacional` | Reserva da conta para funcionar |
| `ALLOW_OPS_MOCKS` | Flag interna para permitir mocks de operacao/teste |
| `ops_mocks_allowed` | Estado interno dizendo se mocks operacionais estao liberados |

## Decisao de produto

Para usuario final, o conceito correto e:

```text
Saldo operacional = reserva tecnica para manter a conta funcionando.
```

Ele deve existir, mas nao deve competir visualmente com reais, dolares, CETES ou saldo rendendo. A UX ideal e mostrar esse saldo apenas quando for relevante para explicar por que nem todo valor pode ser convertido, sacado ou aplicado.
