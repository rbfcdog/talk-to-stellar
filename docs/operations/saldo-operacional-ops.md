# XLM e reserva tecnica da conta

Este documento substitui a nomenclatura antiga usada para XLM. A UX principal deve mostrar `XLM` como `XLM`, sem criar um nome paralelo para o usuario.

## Regra atual

`XLM` e o ativo usado pela conta para pequenas tarifas de rede e reserva minima. Ele nao e uma moeda nova, nao e real, nao e dolar e nao deve ser apresentado como aplicacao.

Quando aparecer para usuario final, use:

```text
XLM
```

Se precisar explicar:

```text
Parte do XLM pode ficar reservada para manter a conta funcionando e pagar pequenas tarifas de rede.
```

## O que evitar

Evite na interface principal:

- nomes paralelos para XLM;
- jargoes como gas, reserve tecnica, issuer, trustline ou XDR;
- sugerir zerar todo o XLM;
- tratar XLM como opcao automaticamente aplicavel se nao houver vault configurado.

## Comportamento esperado

1. Se houver vault XLM configurado, XLM pode aparecer como opcao de aplicacao.
2. Se nao houver vault XLM configurado, XLM aparece apenas como saldo convertivel, respeitando a reserva minima.
3. Ao converter XLM, o backend deve preservar a reserva minima necessaria para a conta continuar operando.
4. Se a pessoa tentar usar todo o XLM e isso afetar a reserva, a UX deve explicar que uma parte precisa ficar na conta.

## Flags internas

Algumas flags de teste podem conter `ops` no nome por razoes historicas:

```text
ALLOW_OPS_MOCKS
TTS_ALLOW_OPS_MOCKS
ops_mocks_allowed
```

Essas flags sao internas e nao devem virar texto visivel para usuario.
