# Pitch deck inicial - 7 slides

Data: 2026-05-24

Este e um rascunho textual para montar o deck de apresentacao do TalkToStellar.

## Slide 1 - Problema

Converter BRL em USD e entregar esse valor em contas internacionais ainda e caro, fragmentado e pouco transparente.

Pontos:

- Pix resolveu pagamentos domesticos, mas nao resolveu conversao internacional.
- Bancos e provedores tradicionais escondem custo em spread.
- Usuarios precisam alternar entre apps, cotacoes, bancos, carteiras e comprovantes.
- Interfaces cripto ainda sao tecnicas demais.

Mensagem principal:

```text
O usuario quer mandar dinheiro, nao aprender infraestrutura financeira.
```

## Slide 2 - Solucao

TalkToStellar e uma interface conversacional para converter e mover valor usando Pix, Stellar e USD/USDC.

Fluxo:

```text
Pix em BRL
-> cotacao transparente
-> settlement em Stellar
-> comprovante com fee e economia
-> destino USD/conta internacional
```

Mensagem principal:

```text
Converta reais em dolares pelo chat e acompanhe tudo com taxa clara e evidencia Stellar.
```

## Slide 3 - Como funciona

O usuario conversa em WhatsApp, Telegram ou web chat.

Exemplos:

```text
"quanto custa enviar 5000 reais?"
"saldo"
"mandar 100 dolares para Ana"
"colocar 100 reais via Pix"
"quanto eu economizei esse ano?"
```

O backend executa:

- validacao de sessao;
- contato salvo real;
- quote real;
- fee breakdown;
- confirmacao por PIN;
- settlement Stellar;
- recibo e historico.

## Slide 4 - Mercado

Publicos iniciais:

- brasileiros que dolarizam patrimonio;
- viajantes e usuarios de contas globais;
- profissionais que pagam fornecedores internacionais;
- empresas que precisam abastecer contas USD;
- fintechs que querem infraestrutura Pix -> USD.

Tese:

```text
Nao competimos com contas globais. Somos o trilho barato e conversacional antes delas.
```

## Slide 5 - Modelo de negocio

Possiveis receitas:

- spread transparente por conversao;
- fee fixa/percentual por Pix on/off-ramp;
- fee por transferencia B2B;
- SaaS/API para empresas;
- planos para volume, reconciliacao e suporte operacional;
- futuras integracoes de payout regulado.

Principio:

```text
Ganhar pela economia entregue ao usuario, nao por taxa escondida.
```

## Slide 6 - Tracao e produto atual

Ja existe no projeto:

- landing page ao vivo;
- chat web;
- Telegram;
- WhatsApp via Evolution;
- Pix on/off-ramp em sandbox/Testnet;
- Stellar Testnet runtime;
- console Mainnet read-only;
- recibo com fee real e hash;
- agente tool-first com evals;
- docs de deploy, seguranca, UX, taxas e Mainnet.

URL:

```text
https://talk-to-stellar-owxg.vercel.app
```

## Slide 7 - Equipe e proximo passo

Equipe:

- TalkToStellar
- Rodrigo Banin Ferraz de Camargo

Proximo passo:

- validar 5 usuarios reais com chaves publicas Mainnet em modo read-only;
- consolidar parceiro Pix/FX/off-ramp;
- manter BRL como ledger/quote, nao stablecoin dinamica;
- expandir o produto para um piloto controlado BRL -> USD com compliance e limites.

Pedido:

```text
Apoio para transformar o prototipo testnet/mainnet-read-only em um piloto operacional com parceiros regulados.
```
