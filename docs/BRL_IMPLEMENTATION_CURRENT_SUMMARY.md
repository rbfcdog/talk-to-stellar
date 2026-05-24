# BRL no TalkToStellar - estado atual

O BRL aparece para o usuario como reais: PIX, saldo em R$, conversao e pagamento. A UI evita mostrar nomes internos de ativos e trata tudo como dinheiro da conta.

No backend, a entrada e saida em reais passam pelo fluxo PIX integrado. Em testnet/sandbox, o trilho de BRL usa o ativo ancorado da integracao para representar o valor em reais antes de converter ou entregar saldo.

Fluxo atual:

```text
Usuario pede PIX em reais
-> backend localiza a conta
-> prepara a conta PIX
-> gera cotacao
-> cria checkout PIX
-> confirma pagamento
-> entrega saldo ou envia para o destinatario
```

As taxas mostradas ao usuario hoje sao somente as taxas da operacao: taxa do PIX/on-off-ramp e taxa de transacao TalkToStellar. Comparacoes com bancos ficam fora do total pago.

Mainnet Stellar pode ser ligada para saldos e interacoes Stellar, mas o PIX/Etherfuse continua tratado como testnet/sandbox ate existir operacao regulada de producao.
