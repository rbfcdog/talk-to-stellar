# Explicacao tecnica do BRL no fluxo PIX

## Resumo

O BRL no TalkToStellar nao e uma stablecoin propria do projeto.

No fluxo PIX, o valor em reais e representado tecnicamente por um asset ancorado usado pela integracao em ambiente de testnet/sandbox. Esse asset serve para conectar:

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

## Como explicar em demo tecnica

Use esta frase:

```text
O TalkToStellar nao criou uma stablecoin BRL. O sistema usa um asset ancorado como representacao tecnica do real dentro do fluxo PIX-Stellar. O usuario ve apenas R$, mas internamente o backend usa esse asset para registrar, cotar, converter e liquidar o valor antes de entregar saldo ou enviar para outro destinatario.
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
