# Benchmark manual difícil

Estes 5 testes são propositalmente difíceis. Use para stressar o produto antes de demo ou deploy. Eles combinam intenção por LLM, sessões concorrentes, conversão multi-ativo, PIX, recibos, histórico e consistência de cotações.

Registre evidência para cada teste:

| Teste | Ambiente | Conta | Canal | Passou? | Prints/links/hash | Observações |
| --- | --- | --- | --- | --- | --- | --- |
|  | testnet/mainnet |  | Web/WhatsApp |  |  |  |

## 1. Sessão web vs WhatsApp com histórico consolidado

Objetivo: provar que WhatsApp web e chat web são sessões separadas, mas o histórico mostra a conta inteira.

Passos:

1. No navegador normal, faça login pela web.
2. Abra `/transactions` e anote a quantidade atual de movimentações.
3. Em outra aba ou janela, abra um link vindo de WhatsApp com:

```text
?source=whatsapp&session_scope=whatsapp
```

4. Faça login nesse link WhatsApp com PIN.
5. Pelo fluxo WhatsApp, execute uma transação pequena, por exemplo receber PIX para entrar `10 XLM`.
6. Confirme a operação até gerar comprovante.
7. Volte para a aba web original.
8. Recarregue `/transactions`.
9. Abra também `/rendimentos` na aba WhatsApp.

Critérios de aprovação:

- A aba web não é deslogada.
- A aba WhatsApp não mostra "Sessão inválida".
- O histórico web mostra a transação feita via WhatsApp.
- O histórico mostra recibo/comprovante.
- Contadores de entrada/saída/conversão mudam de forma coerente.
- Nenhuma sessão sobrescreve a outra.

Falhas graves:

- Histórico mostra 0 ou "Sessão inválida".
- Login no WhatsApp desloga a web.
- Transação aparece no chat, mas não aparece em `/transactions`.

## 2. PIX para contato com ativo alvo não-BRL

Objetivo: garantir que o sistema não confunde "PIX" com BRL quando o usuário quer entregar XLM/CETES/USDC a um contato.

Mensagem inicial no chat:

```text
uero fazer pix pra ana silva de 100 xlm
```

Passos:

1. Envie a mensagem com erro de digitação.
2. Abra o link gerado.
3. Confira a tela antes de gerar QR.
4. Gere o PIX.
5. Confirme o PIX.
6. Aguarde a transferência automática para Ana Silva.
7. Abra o comprovante e o histórico.

Critérios de aprovação:

- LLM entende que é PIX para contato, não PIX para a própria conta.
- Destino é Ana Silva.
- Ativo final é `100 XLM`.
- A tela não transforma o pedido em `R$100`.
- O PIX em BRL é calculado pela cotação transacional atual.
- Taxa é cobrada por fora quando necessário.
- Depois do PIX, o sistema envia automaticamente `100 XLM` para Ana Silva.
- Chat recebe callback final com link de comprovante.
- Histórico mostra tanto o PIX quanto a transferência/conversão relacionada.

Falhas graves:

- Destino vira "Minha conta".
- A tela mostra "receber R$100".
- O recibo diz que entrou XLM, mas saldo não muda.
- O chat não manda callback de conclusão.

## 3. Cotações sem arbitragem direta nem multi-hop

Objetivo: validar que a matriz exibida ao usuário não permite ciclos lucrativos óbvios.

Passos:

1. No chat, envie:

```text
uero ver todas as cotacoes aqui
```

2. Copie as 6 linhas de pares.
3. Calcule manualmente os ciclos principais:
   - BRL -> USDC -> BRL
   - BRL -> CETES -> BRL
   - BRL -> XLM -> BRL
   - USDC -> CETES -> USDC
   - USDC -> XLM -> USDC
   - CETES -> XLM -> CETES
   - USDC -> CETES -> XLM -> USDC
   - BRL -> USDC -> CETES -> BRL
   - BRL -> XLM -> USDC -> BRL
4. Se estiver local, compare com:

```bash
cd backend
npx ts-node -e 'import { ConversionRateMatrixService } from "./src/api/services/conversion-rate-matrix.service"; (async()=>{ const m=await ConversionRateMatrixService.buildMatrix({assets:["BRL","USDC","CETES","XLM"], sampleAmount:100}); console.log(JSON.stringify(m.summary,null,2)); })();'
```

Critérios de aprovação:

- A resposta mostra 6 pares únicos, não 16 linhas.
- A resposta menciona arbitragem direta e multi-hop.
- Nenhum ciclo calculado fica acima de `1.000001`.
- Se a testnet estiver desequilibrada, a resposta informa que rotas foram ajustadas.
- Nada usa "Fonte: saldo em reais da sua conta".

Falhas graves:

- Ciclo `USDC -> CETES -> XLM -> USDC` acima de 1.
- Mostrar só BRL/USDC quando o usuário pediu todas.
- Mostrar 16 linhas poluídas.
- Não mencionar checagem de arbitragem.

## 4. Fluxo completo: saldo insuficiente, carregar via PIX, investir e histórico

Objetivo: testar o caminho difícil de rendimentos quando falta saldo, com retorno correto ao contexto.

Passos:

1. Entre em `/rendimentos`.
2. Escolha um ativo com saldo insuficiente.
3. Clique em "Aplicar".
4. Quando a tela sugerir carregar saldo via PIX, abra o fluxo.
5. Gere PIX para entrar exatamente o valor necessário no ativo escolhido.
6. Confirme o PIX.
7. No recibo, clique em "Voltar aos investimentos".
8. Aplique o valor.
9. Abra `/transactions`.

Critérios de aprovação:

- A tela de PIX mantém o ativo escolhido em rendimentos.
- Não aparece "link expirou" em link recém-gerado.
- O botão de gerar QR fica desabilitado depois de gerar, até mudar valor/ativo.
- O recibo mostra botão "Voltar aos investimentos" no topo.
- A tela de rendimentos não mostra "Somente consulta".
- Não menciona nomes internos de provedores.
- Histórico mostra PIX, conversão se existir, e aplicação/rendimento.

Falhas graves:

- PIX entra em BRL quando o ativo escolhido era USDC/CETES/XLM.
- Voltar aos investimentos aparece só no rodapé.
- Aplicar fica impossível de clicar.
- Histórico não mostra a aplicação.

## 5. Recuperação de PIN com sessão concorrente e ação protegida

Objetivo: stressar segurança, sessão e callback com uma ação que exige autenticação.

Passos:

1. No navegador web, faça login.
2. Em aba separada com escopo WhatsApp, faça login na mesma conta.
3. Pelo chat/WhatsApp, envie:

```text
uero redefinir o pin
```

4. Confirme que email/link foi enviado para a conta correta.
5. Troque o PIN.
6. Sem fechar a aba web, tente abrir `/rendimentos`.
7. Na aba WhatsApp, tente abrir rendimentos e informe o novo PIN.
8. Faça uma operação pequena protegida por PIN, como conversão pequena ou pagamento pequeno para contato.

Critérios de aprovação:

- LLM detecta intenção de redefinir PIN apesar do erro de digitação.
- Email mascarado corresponde à conta correta.
- Contas legadas migradas não pedem código de email indevidamente no login normal.
- PIN antigo deixa de funcionar onde deveria.
- PIN novo funciona.
- Web e WhatsApp continuam desacoplados.
- A ação protegida só executa depois do PIN.
- Histórico registra a operação feita após trocar PIN.

Falhas graves:

- Cair no menu genérico.
- Enviar email para conta errada.
- Trocar PIN derrubar sessão web e WhatsApp ao mesmo tempo sem necessidade.
- Rendimentos mostrar "Sessão inválida".
- Operação executar sem PIN.
