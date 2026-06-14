# BRL no TalkToStellar - estado atual

O BRL aparece para o usuario como reais: PIX, saldo em R$, conversao e pagamento. A UI evita mostrar nomes internos de ativos e trata tudo como dinheiro da conta.

No backend, BRL agora deve ser lido como uma abstracao fiduciaria da aplicacao. Ele nao precisa de issuer Stellar para existir como valor em reais no produto.

Quando o fluxo precisa passar por settlement Stellar ou integracao PIX, o backend pode usar um asset tecnico temporario da infraestrutura, mas isso fica abaixo da camada de dominio.

Fluxo atual:

```text
Usuario pede PIX em reais
-> backend localiza a conta
-> prepara a conta PIX
-> gera cotacao
-> cria checkout PIX
-> confirma pagamento
-> registra BRL como valor fiduciario da aplicacao
-> usa settlement tecnico somente se a rota exigir
-> entrega saldo ou envia para o destinatario
```

As taxas mostradas ao usuario hoje sao somente as taxas da operacao: taxa do PIX/on-off-ramp e taxa de transacao TalkToStellar. Comparacoes com bancos ficam fora do total pago.

O asset BRL de testnet criado pelo projeto fica como modo legado/experimental para liquidez e pathfinding. Ele so deve ser ligado explicitamente com `ENABLE_STELLAR_BRL_ASSET=true`.

Mainnet Stellar pode ser ligada para saldos e interacoes Stellar, mas o PIX/Etherfuse continua tratado como testnet/sandbox ate existir operacao regulada de producao.
