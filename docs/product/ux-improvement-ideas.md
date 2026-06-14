# Backlog de UX - TalkToStellar

Objetivo: deixar o app parecido com um banco simples: poucas escolhas por tela, linguagem curta, valor claro antes do PIN e sempre um proximo passo quando algo nao puder continuar.

Este documento substitui a lista longa anterior por um backlog mais facil de executar. Use como criterio de produto antes de abrir novas telas ou mudar copy.

## Principios

1. Uma acao principal por tela.
2. Dinheiro primeiro, tecnologia depois.
3. PIN e sempre a ultima etapa.
4. Se algo falhar, mostrar recuperacao, nao beco sem saida.
5. Testnet deve ser mencionada de forma curta, sem parecer produto quebrado.

## Termos na interface

Usar:
- dinheiro rendendo
- aplicar
- retirar
- converter
- comprovante
- conta conectada
- estimado em testnet

Evitar na UX principal:
- yield
- vault
- issuer
- trustline
- XDR
- smart contract
- DeFindex
- OpenZeppelin
- melhor investimento
- renda fixa
- poupanca
- garantia

Excecao: documentos tecnicos, logs, ferramentas internas e telas de diagnostico.

## Prioridade visual

Ordem que o usuario deve perceber em qualquer tela:

1. Quanto tenho.
2. O que quero fazer.
3. Quanto vai sair ou entrar.
4. Qual taxa/cotacao estimada.
5. Confirmar com PIN.
6. Ver comprovante ou proximo passo.

Se uma informacao nao ajuda nessas etapas, esconder em detalhes, comprovante ou area tecnica.

## P0 - Corrigir primeiro

| Item | Problema | UX esperada | Criterio de aceite |
| --- | --- | --- | --- |
| Historico completo | A pagina pode mostrar menos operacoes que o chat. | Mostrar entradas, saidas, conversoes, PIX e ajustes na mesma linha do tempo. | O total da pagina bate com as ultimas operacoes retornadas pelo backend. |
| Perfil no historico | Botao Perfil pode abrir comprovante. | Comprovante abre recibo; Perfil abre perfil global. | Nenhum link de Perfil contem `/receipt/`. |
| WhatsApp lento | Mensagem chega, mas resposta demora ou cai em erro generico. | Resposta curta rapida para intencoes simples; erro com acao clara. | "saldo", "historico", "investir", "melhor rota" respondem sem erro generico. |
| Melhor rota | Frase sem valor pode quebrar fluxo. | LLM deve perguntar origem, destino e valor quando faltar dado. | "qual a melhor rota?" retorna pergunta objetiva, nao erro. |
| Aplicacao sem saldo | Tela mostra erro, mas nao ajuda a resolver. | Mostrar converter, adicionar via PIX ou escolher outro saldo. | Saldo insuficiente sempre tem CTA principal de recuperacao. |

## P1 - Fluxos principais

### 1. Conta e saldo

Estado unico em todas as paginas:
- carregando
- conectada
- precisa entrar
- sessao expirada

Copy recomendada:
- `Conta conectada`
- `Entre para continuar`
- `Sessao expirada. Entre novamente.`

Nao repetir badges como `Execucao aprovada` em varios pontos da mesma tela. Um unico status no topo basta.

### 2. PIX

Entrada por PIX:
- valor
- taxa estimada
- total a pagar
- QR/copia e cola
- status

Retirada por PIX:
- chave PIX
- saldo usado
- valor que chega
- taxa
- PIN

Quando faltar saldo:
- CTA principal: `Converter saldo e retirar`
- CTA secundario: `Adicionar via PIX`
- CTA terciario: `Alterar valor`

### 3. Conversao

Tela deve fazer tudo nela mesma:
- informar valor, origem e destino
- calcular revisao na pagina
- pedir PIN na mesma jornada
- mostrar comprovante e botao de retorno para a origem

Nao voltar para chat quando a pessoa clicar em revisar conversao.

Copy minima:
- `Converter`
- `Voce envia`
- `Voce recebe`
- `Cotacao estimada em testnet`
- `Confirmar com PIN`

### 4. Aplicar dinheiro

Separar duas telas:

1. Nova aplicacao
   - escolher saldo
   - informar valor
   - revisar
   - confirmar com PIN

2. Posicoes atuais
   - mostrar quanto ha aplicado agora
   - mostrar variacao/estimativa separada
   - botao para nova aplicacao

Nao misturar grafico de simulacao dentro da tela de confirmar aplicacao. O grafico pertence a posicoes atuais ou simulacao separada.

### 5. Historico

Pagina deve parecer extrato bancario:
- lista por data
- icone simples por tipo
- valor destacado
- contraparte abaixo
- status pequeno
- acoes: `Comprovante`, `Perfil`

Filtros essenciais:
- todos
- entradas
- saidas
- conversoes
- pendentes

Nao mostrar JSON, hash inteiro ou tipo tecnico como informacao principal.

## P2 - Chat e assistente

### Resposta curta padrao

Formato:

```text
Entendi: [acao].
Proximo passo: [link ou pergunta curta].
Nada sai sem PIN.
```

Quando faltar informacao:

```text
Para calcular a melhor rota, me diga:
valor, moeda de origem e moeda de destino.
Ex.: converter 100 dolares para reais.
```

### Menu inicial

Contatos devem aparecer cedo porque sao parte central do app.

Texto sugerido:

```text
Posso ajudar com:
1. Contatos e envio para pessoas salvas
2. Saldo e conta
3. PIX para entrar ou retirar dinheiro
4. Converter moedas
5. Aplicar dinheiro ou ver posicoes
6. Historico e comprovantes
7. Link de pagamento
8. Melhor rota e taxas
9. PIN e entrada por biometria

Ex.: "enviar 10 dolares para Ana", "converter 100 reais", "ver historico".
```

### Intencoes que nao podem falhar

Essas frases devem cair em LLM/roteamento flexivel, nao regex fragil:
- `quero investir`
- `quero ver dinheiro rendendo`
- `qual a melhor rota`
- `trazer dinheiro via pix`
- `sacar para meu pix`
- `ver historico`
- `mandar dinheiro para Ana`

## P3 - Polimento visual

Direcao visual:
- fundo limpo
- cards so para informacao repetida ou bloco de acao real
- botoes primarios escuros e claros conforme tema
- bordas discretas
- textos curtos
- numeros com bastante respiro
- mobile primeiro

Evitar:
- muitos badges na mesma dobra
- cards dentro de cards
- titulos longos
- explicacoes repetidas
- blocos tecnicos antes da acao

## Componentes a padronizar

| Componente | Usado em | Regra |
| --- | --- | --- |
| `AccountStatusCard` | Todas as paginas autenticadas | Mostrar uma vez por tela. |
| `MoneySummary` | PIX, conversao, aplicar | Valor enviado, taxa, valor recebido. |
| `PinConfirmBox` | Pagamento, conversao, PIX, aplicar | Sempre depois da revisao. |
| `RecoveryActions` | Erros recuperaveis | Converter, adicionar via PIX, alterar valor. |
| `ReceiptActions` | Sucesso | Comprovante, perfil, voltar para origem. |
| `Timeline` | Historico e status | Etapas com labels curtos. |

## Quick wins

1. Remover repeticao de `Execucao aprovada`.
2. Trocar "revisao" por "confirmar" quando for acao do usuario.
3. Trocar "yield" por "dinheiro rendendo" ou "aplicar".
4. Colocar `Contatos` no topo do menu do chat.
5. Em conversao concluida, mostrar `Voltar para [origem]`.
6. Em PIX sem saldo, mostrar `Converter saldo e retirar`.
7. Ocultar "outros saldos" quando nao ha acao clara.
8. No historico, truncar hash e deixar no detalhe/comprovante.
9. Nao mostrar BRL/TESOURO como aplicacao sem vault configurado.
10. Mostrar XLM como XLM, sem apelido tecnico ou paralelo.

## Testes de UX

Automatizar com Playwright:

1. `/transactions` mostra mais de uma operacao quando backend retorna varias.
2. Botao `Perfil` nunca aponta para `/receipt/`.
3. `/convert` revisa e confirma sem voltar para `/chat`.
4. `/pix-off` com saldo insuficiente mostra CTA de conversao.
5. `/review` nao repete `Execucao aprovada`.
6. `/review` mostra somente moedas com opcao ativa.
7. Chat entende `qual a melhor rota` e pede dados faltantes.
8. Chat entende `quero investir` e abre a tela correta.
9. Mobile nao tem texto cortado nos botoes principais.
10. Tema claro e escuro preservam contraste em PIX e conversao.

## Metricas

Medir:
- tempo ate o botao principal aparecer
- cliques ate confirmar com PIN
- taxa de erro por tela
- abandono em saldo insuficiente
- uso de `Converter saldo e retirar`
- mensagens que caem em erro generico
- comprovantes abertos apos sucesso

## Criterio de pronto

A UX esta boa quando uma pessoa consegue:

1. Entrar sem preencher e-mail se o canal ja esta vinculado.
2. Ver saldo e historico sem termos tecnicos.
3. Enviar para contato salvo.
4. Trazer dinheiro por PIX.
5. Converter moedas na propria pagina.
6. Aplicar dinheiro apenas em opcoes ativas.
7. Ver posicoes atuais separadas de simulacao.
8. Retirar para PIX com alternativa quando faltar saldo.
9. Confirmar tudo so no final com PIN.
10. Receber comprovante e voltar para a origem.
