# Sistema de taxas - resumo curto

Este e o resumo rapido do sistema de taxas atual do TalkToStellar.

Documento completo: `docs/SISTEMA_DE_TAXAS_ATUAL.md`.

## Regra principal

A UI nao deve inventar taxa.

A ordem correta e:

1. usar taxa retornada pelo provider;
2. usar taxa calculada pelo backend;
3. inferir pelo delta entre valor antes e depois;
4. se nao existir dado, mostrar "nao retornado" ou "pendente".

## Taxas que podem aparecer

| Taxa | Quando aparece | Quem recebe | Observacao |
| --- | --- | --- | --- |
| Rede Stellar | Pagamento/conversao on-chain. | Rede Stellar. | Normalmente muito pequena, paga em XLM. |
| TalkToStellar | Rotas BRL <-> USDC. | Treasury TalkToStellar, se configurada. | Default atual: `30 bps` = `0,30%`. |
| On-ramp | PIX entrando para virar saldo/valor digital. | Etherfuse/provider. | Deve vir da quote real do provider. |
| Off-ramp | Saque/retirada para PIX ou payout. | Etherfuse/provider. | Pode vir do provider ou ser inferida pelo delta. |
| Payout/banco | Futuro envio USD para conta internacional. | Provider/banco. | Hoje fica sandbox/mock se provider real nao estiver ativo. |
| IOF/tax | Apenas se provider regulado retornar. | Autoridade fiscal/parceiro. | No sandbox nao e inventado. |
| Benchmark 3,5% | Comparacao com metodo tradicional. | Ninguem. | Nao e cobrado; serve para mostrar economia. |

## Defaults importantes

```text
TALKTOSTELLAR_SPREAD_BPS=30          # 0,30%
TALKTOSTELLAR_SPREAD_MIN_BRL=0.05
TALKTOSTELLAR_SPREAD_MIN_USDC=0.01
TRADITIONAL_FEE_PCT=0.035            # benchmark 3,5%
```

Para a taxa TalkToStellar ser cobrada on-chain, precisa configurar:

```text
TALKTOSTELLAR_FEE_TREASURY_PUBLIC_KEY=...
```

## Como explicar na demo

Use esta narrativa:

```text
Mostramos o valor antes das taxas, separamos taxa do ramp/provider, taxa TalkToStellar e taxa de rede, e depois mostramos quanto chega no destino. O benchmark de 3,5% aparece so como comparacao com metodos tradicionais, nao como cobranca.
```

## O que nao dizer

Nao diga:

```text
Nao tem taxa.
```

Diga:

```text
As taxas sao separadas e exibidas quando o backend ou provider retorna os dados. Quando um componente nao vem do sandbox/provider, a UI mostra que ele nao foi retornado em vez de inventar valor.
```
