# Sistema de taxas - resumo curto

Estado atual: 2026-05-23.

## Regra atual

O produto mostra somente taxas cobradas no fluxo:

1. Taxa do on-ramp/provider, quando o dinheiro entra por PIX.
2. Taxa de transacao TalkToStellar.
3. Taxa do off-ramp/provider, quando o dinheiro sai para PIX ou destino externo.

Taxas opcionais foram removidas da conta principal. Isso inclui IOF/tax, tarifa bancaria futura, benchmark de 3,5%, provider fee generica e delta residual nao explicado.

## Como a UI deve mostrar

```text
Valor antes das taxas
-> taxa on-ramp, se for entrada
-> taxa TalkToStellar
-> taxa off-ramp, se for saida
-> valor depois das taxas
```

Se o provider nao retornar uma taxa real, a UI mostra zero/pendente/nao retornado. Ela nao inventa taxa.

## Defaults

```text
TALKTOSTELLAR_SPREAD_BPS=30
TALKTOSTELLAR_SPREAD_MIN_BRL=0.05
TALKTOSTELLAR_SPREAD_MIN_USDC=0.01
```

`30 bps` significa `0,30%`.

## Importante para demo

Nao apresente o benchmark tradicional como taxa cobrada.

Fale assim:

```text
Aqui aparecem apenas as taxas que este fluxo cobra: provider de entrada/saida e taxa TalkToStellar.
```

Nao fale:

```text
Tem IOF estimado, taxa bancaria ou benchmark embutido.
```
