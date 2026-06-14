# Explicacao tecnica do BRL no fluxo PIX

## Resumo

O BRL no TalkToStellar nao e uma stablecoin propria do projeto.

Hoje existem duas representacoes tecnicas diferentes que podem aparecer no codigo:

```text
1. TESOURO
   Asset ancorado usado no fluxo PIX/Etherfuse.
   O issuer e o issuer configurado da integracao, nao uma conta criada pelo TalkToStellar.

2. BRL
   Abstracao fiduciaria da aplicacao. Por padrao, nao exige issuer Stellar.
   O asset BRL de testnet criado pelo projeto fica como modo legado/experimental.
```

Nenhum dos dois deve ser apresentado ao usuario como "stablecoin BRL" do TalkToStellar.

No fluxo PIX, o valor em reais e representado tecnicamente pelo asset ancorado da integracao. Esse asset serve para conectar:

```text
PIX em BRL
-> preparacao da conta PIX
-> cotacao
-> representacao do valor na Stellar
-> conversao ou entrega para o destinatario
```

Para o usuario, a experiencia deve continuar aparecendo somente como reais:

```text
R$ 10,00
PIX
saldo em reais
envio para contato
```

O usuario nao precisa ver issuer, trustline, asset tecnico ou nome interno.

## Por que aparece "Conta PIX preparando"

Quando a tela mostra:

```text
Conta PIX
Preparando conta PIX.
```

isso significa que o backend esta preparando a ponte entre:

```text
conta do usuario
-> provedor PIX
-> asset ancorado usado na Stellar
-> checkout PIX/QR
```

O checkout PIX so pode ser gerado depois que essa preparacao termina. Se o provedor ainda nao propagou a conta, o backend pode falhar naquela tentativa e pedir para tentar novamente alguns segundos depois.

## Por que nao e uma stablecoin BRL

Uma stablecoin normalmente tem:

```text
- promessa publica de paridade
- lastro ou reserva
- emissor responsavel por resgate
- circulacao como produto financeiro proprio
- uso fora de um fluxo especifico
```

O asset usado aqui tem outro papel:

```text
- representa valor em reais dentro de um fluxo PIX
- depende do anchor/provedor
- serve para cotar, liquidar e reconciliar a operacao
- em testnet/sandbox nao tem valor real
- nao deve ser vendido como moeda estavel propria
```

## Quem e o issuer?

Depende de qual asset estamos falando.

### 1. Asset do fluxo PIX

No fluxo PIX atual, o backend usa o asset `TESOURO`.

Esse asset vem da configuracao:

```text
TESOURO_ISSUER
```

Se essa variavel nao estiver definida, o codigo usa o issuer padrao da integracao Etherfuse configurado em:

```text
ETHERFUSE_TESOURO_ISSUER
```

Ou seja: para o fluxo PIX, o issuer do asset ancorado nao e uma conta criada por nos para emitir uma stablecoin BRL. Ele representa o asset do trilho de integracao usado para on-ramp/off-ramp em testnet/sandbox.

### 2. Asset BRL criado pelo projeto

O projeto tambem tem scripts para criar um asset `BRL` em testnet, mas isso agora deve ser tratado como legado/experimental:

```text
backend/scripts/setup-testnet-brl-liquidity.ts
```

Esse script cria/configura:

```text
BRL_ISSUER_TESTNET
BRL_ISSUER_SECRET
BRL_DISTRIBUTOR_PUBLIC
BRL_DISTRIBUTOR_SECRET
BRL_MARKET_MAKER_PUBLIC
BRL_MARKET_MAKER_SECRET
```

Esse `BRL` e um asset sintetico de testnet usado para testes de liquidez e pathfinding. Ele pode ter sido criado por nos, mas isso nao transforma ele em real tokenizado, stablecoin regulada ou ativo com lastro.

Por padrao, o backend nao deve criar trustline automatica para esse asset nem usar esse issuer para representar saldo em reais. Para ligar esse modo explicitamente em laboratorio, use:

```text
ENABLE_STELLAR_BRL_ASSET=true
```

Ele serve para demonstrar rotas on-chain como:

```text
BRL -> XLM -> USDC
USDC -> XLM -> BRL
```

mas continua sendo um asset tecnico de testnet.

## Frase correta para explicar ao avaliador

```text
No fluxo PIX, o TalkToStellar usa o asset ancorado da integracao para representar o valor em reais dentro da rota. Separadamente, o projeto tambem tem um asset BRL de testnet criado por nos para testes de liquidez e pathfinding. Nenhum dos dois e uma stablecoin BRL propria ou um real tokenizado de producao.
```

## Decisao atual de arquitetura

```text
UX = reais
Core = ledger/abstracao fiduciaria
Settlement = asset tecnico temporario quando necessario
```

Ou seja:

```text
BRL != Stellar Asset
BRL == unidade de conta da aplicacao
```

O asset tecnico so entra quando a operacao precisa passar por uma infraestrutura de settlement.

## Como explicar em demo tecnica

Use esta frase:

```text
O TalkToStellar trata BRL como uma abstracao fiduciaria da aplicacao. Quando necessario, o backend usa assets tecnicos temporarios da infraestrutura Stellar apenas para settlement, liquidacao e roteamento, sem expor esses ativos ao usuario e sem caracteriza-los como stablecoins BRL proprias.
```

## Fluxo tecnico simplificado

```text
1. Usuario pede um PIX em reais.
2. Backend localiza a conta e prepara a conta PIX.
3. Backend gera a cotacao BRL -> asset ancorado.
4. Backend cria o checkout PIX.
5. Usuario paga ou confirma no ambiente de teste.
6. Backend registra a entrada.
7. Valor pode ser convertido para USDC ou enviado conforme a rota escolhida.
```

## Regra de UX

Na interface de usuario, nao mostrar:

```text
- TESOURO
- issuer
- trustline
- stablecoin BRL
- sandbox/testnet
- anchor asset
```

Mostrar apenas:

```text
- reais
- PIX
- saldo
- destinatario
- taxa
- comprovante
```
