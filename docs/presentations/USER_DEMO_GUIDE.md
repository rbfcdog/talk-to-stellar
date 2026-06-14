# Guia de demo de usuarios - TalkToStellar

Este documento e o roteiro para uma demonstracao de produto focada na experiencia do usuario final.

Use este guia quando o objetivo for mostrar como uma pessoa usa o TalkToStellar para criar/acessar conta, conversar com o assistente, consultar saldo, colocar dinheiro via PIX, enviar valor, converter saldo, sacar e ver comprovantes.

Para a demo tecnica de anchor/backend, use `docs/ANCHOR_TESTNET_VIDEO_WALKTHROUGH.md`.
Para a demo da infraestrutura entre instituicoes, use `docs/INSTITUTION_SETTLEMENT_INTERFACE_GUIDE.md`.

## Objetivo da demo

Ao final da demo, o avaliador deve entender que o TalkToStellar entrega uma experiencia financeira simples por chat e web:

```text
Usuario conversa no WhatsApp/Telegram/web
-> cria ou acessa a conta
-> consulta saldo
-> coloca dinheiro via PIX
-> envia ou converte valor
-> confirma com PIN/passkey quando necessario
-> recebe comprovante e historico
```

Nao apresente esta demo como uma operacao bancaria real em producao, remessa internacional regulada ou promessa de compliance. A mensagem correta e:

```text
Esta e uma demo de produto em ambiente sandbox/testnet. Ela mostra a experiencia do usuario e como os fluxos de conta, PIX, Stellar, saldo e comprovante se conectam.
```

## Preparacao antes de gravar

Confirme estes pontos antes de iniciar a gravacao:

- Frontend aberto e funcionando.
- Backend respondendo.
- Bot de WhatsApp/Evolution ou Telegram respondendo, se a demo usar chat real.
- Conta de teste ja criada ou link de onboarding pronto.
- PIN de teste conhecido.
- Passkey opcional. Se o celular/browser estiver instavel, use PIN para a demo.
- Etherfuse em sandbox, se for mostrar PIX.
- Stellar em testnet, se for mostrar hash/transacao.
- Nenhuma chave, token, `session_token`, API key, seed ou secret visivel na tela.

URLs uteis:

```text
/chat
/create-account
/login
/pix-on
/pix-off
/pix-ramp
/pay-anyone
/transactions
/receipt
/institution-settlement
```

Use `/institution-settlement` apenas como preview avancado. A demo de usuario deve ficar principalmente em chat, PIX, pagamento, conversao e historico.

## Dados de teste recomendados

Use valores pequenos para evitar confusao:

```text
Usuario remetente: Rodrigo Demo
Contato destino: Ana Demo
Email destino: ana.demo@example.com
Valor para PIX/on-ramp: R$ 10,00
Valor para envio: US$ 1,00 ou R$ 5,00
Valor para conversao: R$ 10,00 para dolares
Valor para saque/off-ramp: R$ 5,00 ou US$ 1,00
```

Mensagens de chat para usar:

```text
ola
saldo
contatos
converter 10 reais para dolares
enviar 1 dolar para Ana
criar link de pagamento de 25 reais
historico
quero colocar 10 reais via pix
quero sacar 5 reais via pix
```

## Roteiro curto - 6 a 8 minutos

### 00:00 - 00:25 - Abertura

Mostre a tela inicial ou o chat.

Fale:

```text
Esta demo mostra o fluxo de usuario do TalkToStellar. A ideia e que uma pessoa consiga usar uma conta conectada a Stellar sem precisar entender blockchain, carteira, trustline ou XDR. Ela conversa em linguagem natural, confirma operacoes sensiveis e recebe comprovantes.
```

Mostre:

- Chat ou landing page.
- Botao/caminho para WhatsApp, Telegram ou chat web.
- Se usar a landing page, mostre rapidamente que o WhatsApp leva para o numero correto configurado no produto.

### 00:25 - 01:20 - Onboarding ou login

Se a conta ainda nao existe, abra o link de onboarding em `/create-account`.

Mostre:

- Criacao/acesso de conta.
- PIN como alternativa simples.
- Passkey como opcional, se estiver funcionando bem no dispositivo.

Fale:

```text
Aqui o usuario cria ou acessa a conta. O produto nao comeca mostrando termos tecnicos de crypto. Ele pede apenas os dados necessarios para a conta de teste e um metodo de aprovacao. Para demo, eu vou usar PIN, porque e mais previsivel na gravacao.
```

Nao fale:

```text
Esta conta esta pronta para operar dinheiro real.
```

Fale em vez disso:

```text
Esta conta esta pronta para demonstrar os fluxos em sandbox/testnet.
```

### 01:20 - 02:10 - Consulta de saldo pelo chat

No WhatsApp/Telegram/web chat, envie:

```text
saldo
```

Mostre:

- Resposta do bot.
- Saldo em linguagem amigavel.
- Se aparecer saldo em USDC, explique como "saldo em dolar" para usuario final.

Fale:

```text
O primeiro caso de uso e consultar saldo por conversa. O backend consulta a conta e devolve uma resposta em linguagem de banco, sem obrigar o usuario a entender Stellar ou detalhes da rede.
```

### 02:10 - 03:20 - Colocar dinheiro via PIX

No chat, envie:

```text
quero colocar 10 reais via pix
```

Ou abra diretamente:

```text
/pix-on
```

Mostre:

- Tela de PIX/on-ramp.
- Valor em BRL.
- QR/codigo PIX ou intent sandbox.
- Botao de confirmacao/simulacao, se estiver em sandbox.
- Mudanca de status.

Fale:

```text
Agora o usuario quer colocar reais na conta. A interface cria uma intencao PIX pela integracao configurada. Em demo, isto pode estar em sandbox: o objetivo e mostrar o estado da operacao, a confirmacao e a atualizacao do saldo ou do registro interno.
```

Se for sandbox, deixe explicito:

```text
Neste ambiente, o PIX e simulado/sandboxado. Em producao, este ponto dependeria do parceiro PIX e das regras reguladas aplicaveis.
```

### 03:20 - 04:35 - Envio para contato ou link de pagamento

Mostre uma das duas opcoes.

Opcao A, pelo chat:

```text
enviar 1 dolar para Ana
```

Opcao B, pela tela:

```text
/pay-anyone
```

Mostre:

- Resolucao do contato.
- Tela de confirmacao.
- Valor.
- PIN/passkey.
- Resultado final.

Fale:

```text
Aqui o usuario esta enviando valor sem montar uma transacao manualmente. O produto resolve contato, prepara a operacao, pede confirmacao explicita e so depois executa o envio.
```

Se nao houver saldo suficiente e o produto sugerir PIX:

```text
Esse e um ponto importante da experiencia: quando nao existe saldo suficiente, o produto pode redirecionar para completar saldo via PIX e depois continuar o pagamento.
```

### 04:35 - 05:35 - Conversao de moeda

No chat, envie:

```text
converter 10 reais para dolares
```

Mostre:

- Cotacao.
- Rota sugerida.
- Confirmacao.
- Resultado.

Fale:

```text
O usuario tambem consegue pedir conversao em linguagem natural. O sistema calcula uma cotacao, mostra a estimativa e mantem a operacao confirmavel. O objetivo e esconder a complexidade de pathfinding e assets atras de uma experiencia simples.
```

### 05:35 - 06:35 - Saque/off-ramp via PIX

Abra:

```text
/pix-off
```

Ou envie:

```text
quero sacar 5 reais via pix
```

Mostre:

- Valor.
- Dados de destino de teste.
- Status da operacao.
- Comprovante ou resultado sandbox.

Fale:

```text
Aqui e a saida do saldo para PIX. Em demo, a execucao pode ser mockada ou sandboxada. O que importa para o produto e o usuario enxergar valor, destino, status e comprovante de forma clara.
```

### 06:35 - 07:20 - Historico e comprovantes

Abra:

```text
/transactions
```

Se houver link de recibo, abra:

```text
/receipt
```

Mostre:

- Lista de transacoes.
- Status.
- Comprovante.
- Hash ou referencia apenas se for util.

Fale:

```text
Depois da operacao, o usuario nao fica perdido. Ele consegue ver historico, status e comprovante. Para o usuario final, isto aparece como registro financeiro; para o time tecnico, por tras existe referencia de transacao, logs e evidencias.
```

### 07:20 - 08:00 - Fechamento

Fale:

```text
O ponto principal da demo e que o usuario nao precisa operar uma carteira manualmente. Ele conversa, confirma e acompanha a operacao. A infraestrutura Stellar, PIX, quotes, conversao e comprovantes fica por tras da experiencia.
```

Finalize mostrando:

- Chat com respostas.
- Tela de historico.
- Comprovante.

## Roteiro completo - 10 a 12 minutos

Use este roteiro quando o avaliador quiser ver mais detalhes.

### 1. Contexto do produto

Fale:

```text
TalkToStellar e uma camada conversacional para pagamentos e conta digital em cima de Stellar. O usuario pode usar chat, links e telas curtas, sem precisar entender ferramentas cripto.
```

Mostre:

- Landing page ou `/chat`.
- Entrada por WhatsApp/Telegram/web.

### 2. Criacao/acesso de conta

Mostre `/create-account` ou `/login`.

Explique:

- Onboarding cria ou vincula conta.
- PIN e metodo de confirmacao previsivel para demo.
- Passkey e opcional para login rapido/seguro, mas pode ser pulado na gravacao se o celular/browser travar.

### 3. Chat como interface principal

Envie:

```text
ola
saldo
contatos
```

Explique:

- O chat identifica intencao.
- O backend chama ferramentas internas.
- A resposta e escrita para usuario comum.

### 4. PIX on-ramp

Envie:

```text
quero colocar 10 reais via pix
```

Ou use `/pix-on`.

Explique:

- O PIX e a entrada em BRL.
- A demo pode simular confirmacao.
- O estado da operacao muda depois do evento de pagamento.

### 5. Pagamento

Use `/pay-anyone` ou o chat.

Explique:

- O contato e resolvido.
- O usuario ve valor e destino.
- O PIN/passkey confirma a intencao.
- O sistema envia e gera comprovante.

### 6. Conversao

Envie:

```text
converter 10 reais para dolares
```

Explique:

- A cotacao calcula estimativa.
- O usuario aprova antes da execucao.
- A experiencia nao exige que ele escolha asset, issuer ou caminho manualmente.

### 7. PIX off-ramp

Use `/pix-off`.

Explique:

- O off-ramp e a saida para PIX.
- Na demo, use sandbox/mock quando nao houver execucao real configurada.
- O objetivo e provar UX, status e rastreabilidade.

### 8. Historico

Use `/transactions` e `/receipt`.

Explique:

- O usuario acompanha operacoes.
- Comprovantes ajudam suporte e auditoria.
- Referencias tecnicas ficam disponiveis quando necessario.

## Como narrar os termos tecnicos

Use linguagem simples durante a demo de usuario:

| Termo tecnico | Como falar para usuario |
| --- | --- |
| Wallet | Conta |
| USDC | Saldo em dolar |
| Stellar | Infraestrutura de liquidacao |
| Testnet | Ambiente de teste |
| Transaction hash | Codigo de comprovacao da transacao |
| Trustline | Ativacao para receber aquele saldo |
| Pathfinding | Busca da melhor rota de conversao |
| XDR | Transacao preparada |
| On-ramp | Colocar dinheiro na conta |
| Off-ramp | Sacar dinheiro da conta |

Evite abrir codigo nesta demo. Codigo e backend pertencem a demo tecnica.

## O que mostrar na tela

Mostre:

- Mensagens reais no chat.
- Link de onboarding/login abrindo.
- Tela de PIX.
- Tela de confirmacao.
- Historico.
- Comprovante.
- Status de operacao mudando.

Nao mostre:

- `.env`.
- API keys.
- Session tokens.
- Stellar secret key.
- Supabase service role.
- PIN real de usuario.
- Logs com dados pessoais reais.

Se precisar mostrar logs, use apenas logs redigidos ou valores mockados.

## O que dizer se algo falhar na demo

### Bot nao respondeu

Fale:

```text
O canal de chat depende do webhook e do backend. Vou abrir a tela web equivalente para mostrar o mesmo fluxo de usuario.
```

Cheque depois:

- Railway logs do backend.
- Evolution/Telegram webhook.
- `BACKEND_URL`.
- `/health` do backend.

### Link expirado ou invalido

Fale:

```text
Links de login e onboarding sao temporarios por seguranca. Vou gerar um novo link pelo canal de origem.
```

### Passkey deu timeout

Fale:

```text
Passkey depende do dispositivo e do browser. Para demo, vou usar PIN, que e o fluxo alternativo suportado.
```

### Quote expirou

Fale:

```text
Cotas expiram para evitar executar cambio com preco velho. Vou gerar uma cotacao nova.
```

### PIX sandbox nao aparece no banco real

Fale:

```text
Este ambiente esta em sandbox. O objetivo e demonstrar intent, status e fluxo de confirmacao, nao cobrar um PIX real.
```

### Tabela/migration faltando

Fale:

```text
Este erro indica que o banco de demo nao recebeu a migration necessaria. Depois de aplicar a migration no Supabase correto, a mesma tela volta a funcionar.
```

## Checklist de evidencia para salvar

Ao final da demo, tenha pelo menos:

- Screenshot do chat com `saldo`.
- Screenshot da tela de PIX/on-ramp.
- Screenshot da confirmacao de pagamento.
- Screenshot de conversao ou quote.
- Screenshot de historico.
- Link ou imagem de comprovante.
- Se disponivel, hash de transacao testnet.
- Se disponivel, log redigido do backend mostrando o fluxo.

## Frase final recomendada

```text
Essa demo mostra a parte que o usuario sente: conversar, colocar saldo, enviar, converter, sacar e ver comprovante. A infraestrutura por tras pode ser demonstrada separadamente, mas o valor do produto e transformar esses fluxos em uma experiencia simples e familiar.
```

