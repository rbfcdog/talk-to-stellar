# Estrategia BRL na Stellar

Data: 2026-05-24

## Pergunta

O produto precisa representar "real" como uma stablecoin dinamica na Stellar?

Resposta curta:

```text
Nao para o produto atual.
```

Para TalkToStellar, a melhor arquitetura agora e tratar BRL como fiat/ledger fora da blockchain, usar Pix como entrada/saida, cotar BRL -> USDC no backend e liquidar/registrar evidencia em Stellar usando USDC.

## Por que nao usar stablecoin BRL dinamica

Uma stablecoin dinamica por usuario, por operacao ou por fluxo cria problemas reais:

- cada asset Stellar e identificado por `code + issuer`;
- se o issuer muda, o mercado enxerga outro asset;
- trustlines ficam confusas;
- pathfinding perde liquidez;
- recibos e UX ficam menos confiaveis;
- avaliador pode interpretar como emissao de moeda sem lastro;
- em Mainnet, isso aumenta risco regulatorio e operacional.

O usuario quer ver "R$ 100,00", nao escolher entre varios BRL emitidos por issuers diferentes.

## Opcoes coerentes

### Opcao 1 - BRL off-chain no ledger do produto

Recomendacao principal.

Fluxo:

```text
Pix recebido
-> ledger registra BRL recebido
-> quote engine calcula BRL -> USDC/USD
-> Stellar liquida em USDC
-> payment_logs guardam fee/hash/recibo
```

Vantagens:

- UX simples;
- sem trustline BRL para usuario;
- sem asset BRL falso em Mainnet;
- melhor para compliance;
- permite trocar provider Pix/FX sem mudar carteira;
- permite mostrar taxas reais sem depender de liquidez artificial de BRL na DEX.

Uso ideal:

- produto de usuario;
- demo de Pix;
- BRL -> USD;
- delivery para conta internacional;
- Mainnet readiness sem emitir BRL.

### Opcao 2 - Um asset BRL fixo em Testnet

Boa para demo tecnica.

Modelo:

```text
Asset code: TBRL ou BRL
Issuer: conta testnet controlada
Distribution: conta separada
Home domain: dominio do projeto
Liquidity: par TBRL/USDC controlado
```

Uso:

- demonstrar trustline;
- demonstrar pathfinding;
- demonstrar asset issuance;
- criar ambiente previsivel para avaliadores tecnicos;
- testar conversao sem dizer que e dinheiro real.

Regras:

- issuer unico;
- liquidez testnet mantida por script;
- asset marcado como testnet/demo;
- nunca usar como promessa de BRL real;
- nunca gerar issuer dinamico por usuario.

### Opcao 3 - Asset BRL de parceiro/anchor regulado

Opcao futura para producao.

Requisitos:

- emissor/anchor com capacidade regulatoria;
- lastro/contabilidade;
- KYC/KYB;
- politica de resgate;
- `stellar.toml`;
- limites e monitoramento;
- suporte a freeze/clawback quando aplicavel;
- clareza publica de issuer.

Uso:

- se o produto precisar manter BRL on-chain;
- se houver integracao anchor oficial;
- se houver necessidade real de DEX BRL/USDC em producao.

### Opcao 4 - TESOURO/Etherfuse como asset de sandbox

Estado atual mais pragmatico para Pix testnet.

TESOURO aparece como asset/settlement interno em alguns fluxos, mas a UI deve mapear isso para BRL ou "real" para o usuario. Ele nao deve ser vendido como stablecoin BRL publica.

Uso:

- integracao Etherfuse;
- sandbox Pix;
- teste de on/off-ramp;
- evidencia tecnica.

### Opcao 5 - Sem asset BRL nenhum, apenas USDC

Tambem viavel para o MVP.

Modelo:

```text
Pix BRL entra
-> backend converte/cota
-> Stellar so movimenta USDC
-> BRL aparece apenas como valor de funding e recibo
```

Essa e a forma mais limpa se o foco e BRL -> USD.

## Recomendacao final

| Contexto | Melhor escolha |
| --- | --- |
| Produto de usuario agora | BRL off-chain + USDC on-chain |
| Demo tecnica Stellar Testnet | asset fixo TBRL/BRL de issuer unico |
| Pix/Etherfuse sandbox | TESOURO/asset interno escondido da UX |
| Mainnet read-only | sem BRL asset proprio |
| Mainnet com BRL on-chain futuro | parceiro/anchor regulado |
| Stablecoin BRL dinamica | evitar |

## Como explicar para avaliador

Use esta frase:

```text
No produto, BRL e a moeda de entrada e saida via Pix. A blockchain nao precisa fingir que cada real e uma stablecoin propria. A Stellar entra onde ela e mais forte: liquidacao rapida, auditavel e barata em USDC. Para demonstracoes tecnicas de asset na Testnet, usamos um asset BRL fixo e controlado, nunca um issuer dinamico.
```

## Implicacoes tecnicas

### Backend

- `payment_logs` deve guardar `source_amount`, `source_asset_code`, `fee_brl`, `fee_usdc`, `payment_hash`.
- `get_conversion_preview` deve usar quote real derivado dos valores da rota/transacao.
- se a cotacao falhar, a resposta deve falhar sem inventar cambio.
- recibos devem omitir economia em BRL quando nao houver base real.

### Frontend

- usuario ve BRL, USD/USDC, taxa e comprovante;
- usuario nao ve TESOURO, issuer, trustline ou XDR em fluxo normal;
- rotas ops podem mostrar detalhes tecnicos com badge de operador.

### Mainnet

- manter Mainnet read-only ate signer/limites/compliance;
- nao emitir BRL Mainnet proprio sem parceiro;
- nunca pedir secret key;
- usar apenas chaves publicas para evidencia de usuario.

## Referencias oficiais

- Stellar Networks: https://developers.stellar.org/docs/learn/fundamentals/networks
- Issue an Asset on Stellar: https://developers.stellar.org/docs/tokens/how-to-issue-an-asset
- Asset Management: https://developers.stellar.org/docs/tools/cli/cookbook/asset-management
