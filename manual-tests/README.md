# Guia de testes manuais da aplicação web

Use este guia para validar a aplicação web antes de demo, deploy ou envio para revisão. O foco é testar fluxos reais de produto, consistência de sessão, cotações, PIX, pagamentos, rendimentos, histórico e recibos.

## Preparação

### Ambiente local

1. Suba backend e frontend.

```bash
npm --prefix backend run dev
npm --prefix frontend run dev
```

2. Abra:

```text
http://localhost:3000
```

3. Use uma conta testnet. Se criar uma nova conta, confirme que a tela explica que testnet é um ambiente de teste e não representa dinheiro real.

### Ambiente publicado

Use a URL publicada:

```text
https://talktostellar.com
```

Para links vindos de WhatsApp/Telegram, preserve os parâmetros quando existirem:

```text
?source=whatsapp&session_scope=whatsapp
?source=telegram&session_scope=telegram
```

## Registro do teste

Preencha esta tabela enquanto testa.

| Data | Ambiente | Navegador | Conta | Fluxo | Resultado | Evidência | Observações |
| --- | --- | --- | --- | --- | --- | --- | --- |
|  | testnet/mainnet | Chrome/Safari/mobile | email/chave |  | passou/falhou | print/link/hash |  |

## 1. Login, criação de conta e sessão

### 1.1 Criar conta

Passos:

1. Abra `/create-account`.
2. Informe email e PIN.
3. Conclua o fluxo de criação.
4. Verifique se aparece explicação simples de testnet.

Resultado esperado:

- Conta criada sem erro.
- A explicação de testnet aparece em linguagem acessível.
- Não aparece a palavra "demo" em mensagens de ativação/passkey.
- A sessão fica ativa ao navegar para `/chat`, `/transactions`, `/rendimentos` e `/profile`.

### 1.2 Login com PIN

Passos:

1. Abra `/login`.
2. Entre com email e PIN correto.
3. Navegue para `/transactions`.

Resultado esperado:

- Login conclui sem pedir código de email para contas legadas já migradas.
- `/transactions` não mostra "Sessão inválida".
- A sessão permanece ativa ao recarregar a página.

### 1.3 Sessão web separada de WhatsApp

Passos:

1. Entre normalmente no browser web.
2. Em outra aba, abra um link com `?source=whatsapp&session_scope=whatsapp`.
3. Faça login nesse link com PIN.
4. Volte para a aba web original e abra `/transactions`.
5. Volte para a aba WhatsApp e abra `/rendimentos?source=whatsapp&session_scope=whatsapp`.

Resultado esperado:

- Login no WhatsApp web não desloga a sessão web.
- Sessão web não sobrescreve sessão WhatsApp.
- Histórico e rendimentos não mostram "Sessão inválida".

## 2. Chat web e interpretação LLM

Abra `/chat` e envie as mensagens abaixo.

| Mensagem | Resultado esperado |
| --- | --- |
| `quero ver meu saldo` | Mostra saldo, incluindo XLM. |
| `quero ver meus contatos` | Mostra contatos, não cai no menu genérico. |
| `quero ver aplicações` | Abre/retorna rendimentos. |
| `quero mudar meu pin` | Inicia troca de PIN e envia email/link seguro quando aplicável. |
| `qual a minha chave pública?` | Retorna a chave pública Stellar, não só email/chave de recebimento. |
| `quais são os assets? explique cada um` | Explica BRL/TESOURO, USDC, CETES e XLM. |
| `quero converter 10 usdc pra brl` | Vai para conversão/confirmacão, não menu genérico. |
| `me ajude com colocar 100 reais via pix` | Trata como PIX para a própria conta, não como pagamento para contato. |
| `quero fazer pix pra ana silva de 100 xlm` | Trata como PIX para contato com alvo de 100 XLM, não R$100 para a própria conta. |
| `quero ver todas as cotações aqui` | Mostra os 6 pares únicos e menciona checagem de arbitragem direta e multi-hop. |

Critérios gerais:

- Não deve aparecer fallback genérico quando a intenção é clara.
- Não deve misturar ativo pedido pelo usuário com outro ativo.
- Não deve inventar contato quando o pedido é para a própria conta.
- Linguagem deve ser de produto, não técnica demais.

## 3. PIX para adicionar saldo

### 3.1 Receber R$100 na conta

Passos:

1. Abra `/pix-on`.
2. Escolha receber `R$100,00` em BRL.
3. Gere o PIX.
4. Confirme o pagamento no fluxo sandbox/testnet.

Resultado esperado:

- Valor recebido na conta é exatamente `R$100,00`.
- Valor pago no PIX inclui taxa por fora, por exemplo `R$100,50` se a taxa for `R$0,50`.
- Tela mostra economia em relação a métodos tradicionais, quando aplicável.
- Não mostra bloco redundante "Taxa total" verde no on-ramp se já houver resumo claro.
- Após confirmar, o chat/callback inclui link de comprovante.

### 3.2 Receber USDC, CETES ou XLM via PIX

Passos:

1. Abra `/pix-on`.
2. Em "Receber como", escolha USDC, CETES ou XLM.
3. Informe o valor alvo no ativo escolhido.
4. Gere o PIX.
5. Confirme.

Resultado esperado:

- A tela mostra o ativo alvo correto.
- O valor em reais cobrado vem da cotação transacional atual.
- O resumo não diz que entrou BRL se o alvo era USDC/CETES/XLM.
- O recibo mostra "Pago via PIX" em BRL e "Recebido" no ativo correto.

## 4. PIX para retirada ou envio para contato

### 4.1 Retirar para meu PIX

Passos:

1. Abra `/pix-off`.
2. Escolha ativo de origem, por exemplo `100 XLM`.
3. Informe chave PIX própria.
4. Veja resumo antes do PIN.
5. Confirme com PIN.

Resultado esperado:

- Resumo mostra quanto sai da conta e quanto chega no PIX.
- Mostra economia em relação a métodos tradicionais.
- Não exibe linguagem interna como "maximizar recebimento".
- Recibo fica disponível.

### 4.2 Enviar PIX para contato salvo

Passos:

1. Pelo chat, envie: `quero fazer pix pra ana silva de 100 xlm`.
2. Abra o link gerado.
3. Confira destinatário e valor.
4. Gere o PIX e confirme.

Resultado esperado:

- Destino é Ana Silva, não "Minha conta".
- Ativo final é `100 XLM`, não `R$100`.
- A área de contato mostra nome e chave PIX só uma vez.
- Após confirmação, a transferência final é enviada automaticamente.
- O chat recebe mensagem final com comprovante.

## 5. Conversões

### 5.1 Conversão geral

Passos:

1. Abra `/convert`.
2. Escolha ativo de origem e destino.
3. Informe valor.
4. Revise a cotação.
5. Confirme com PIN.

Resultado esperado:

- A tela usa uma única fonte de cotação: valores transacionais do backend.
- Não usa fallback externo incoerente.
- Valor de origem/destino respeita exatamente o que o usuário escolheu.
- Nada executa antes do PIN.

### 5.2 Cotações e arbitragem

Passos:

1. Pelo chat, envie: `quero ver todas as cotações aqui`.
2. Confira os 6 pares:
   - BRL/USDC
   - BRL/CETES
   - BRL/XLM
   - USDC/CETES
   - USDC/XLM
   - CETES/XLM
3. Confira a mensagem de arbitragem.

Resultado esperado:

- Mostra só 6 linhas de pares únicos, não 16 linhas.
- Informa que conferiu arbitragem direta e multi-hop.
- Não há ciclo lucrativo aparente nos pares exibidos.
- Nada é executado sem confirmação e PIN.

## 6. Pagamentos

### 6.1 Enviar para contato

Passos:

1. Pelo chat, envie: `quero mandar 10 xlm pra ana silva`.
2. Abra o link.
3. Confira valor, ativo e destinatário.
4. Confirme com PIN.

Resultado esperado:

- Valor exibido é `10 XLM`, não "saldo da conta".
- Destinatário é Ana Silva.
- Tela de andamento não fica amarela e não mostra contador em segundos.
- Mensagem final não fala de taxa/economia para transferência simples.
- Recibo fica disponível.

### 6.2 Enviar para carteira externa

Passos:

1. Abra `/send-external`.
2. Informe public key Stellar, valor, moeda e PIN.
3. Confirme.

Resultado esperado:

- Tela fecha ou conclui após confirmação.
- Mostra erro claro se chave pública estiver inválida.
- Não envia nada antes do PIN.

## 7. Link de recebimento e perfil público

### 7.1 Perfil

Passos:

1. Abra `/profile/<publicKey>` ou acesse perfil pelo menu.
2. Confira a página.

Resultado esperado:

- A página mostra a chave pública.
- Não mostra blocos antigos como "Visão rápida", "Resumo", "Ação principal" ou "Acesso rápido" se a decisão atual for deixar só a chave pública.
- Textos aparecem no idioma correto.

### 7.2 Link de recebimento

Passos:

1. Crie link de recebimento.
2. Abra o link em aba anônima.
3. Entre/crie conta para receber.

Resultado esperado:

- Página aparece em português quando `lang=pt-BR`.
- Página aparece em inglês quando `lang=en`.
- Se o browser estiver logado na conta que criou o link, o texto explica que precisa entrar na conta destinatária.
- Link usado/expirado mostra mensagem clara.

## 8. Rendimentos

Passos:

1. Abra `/rendimentos`.
2. Confira posições de USD/USDC, CETES e XLM.
3. Clique em "Aplicar".
4. Informe valor e PIN.
5. Use o botão de ajuda `?` na tela de confirmação.

Resultado esperado:

- Não aparece "Simulação"; usar "Rentabilidade" quando aplicável.
- Se posição for zero, exibe `0` com símbolo/código da moeda, não "Nada aplicado agora".
- Botão "Sair" não aparece ao lado de "Aplicar"; logout fica apenas no controle global.
- Texto de ajuda explica vaults/rendimentos em geral, não só o ativo específico.
- Não menciona nomes internos de provedores.
- A aplicação só confirma depois do PIN.

## 9. Histórico

Passos:

1. Abra `/transactions`.
2. Teste "Todo histórico".
3. Teste filtro por mês.
4. Use busca por contato, ativo, PIX ou hash.
5. Navegue pela paginação.

Resultado esperado:

- Não mostra "Sessão inválida" se a conta estiver logada.
- Mostra transações de web, WhatsApp e links da mesma conta.
- Contadores de entradas, saídas e conversões batem com a lista visível.
- Recibos abrem corretamente.
- Paginação funciona e não perde filtros.

## 10. Troca de PIN

Passos:

1. Pelo chat, envie: `quero redefinir o pin`.
2. Abra email/link recebido.
3. Troque o PIN.
4. Faça login novamente.

Resultado esperado:

- Intenção de PIN é detectada.
- Email enviado para a conta correta.
- Código/link tem validade curta.
- Mensagens de código não aparecem em vermelho agressivo e têm fonte legível.

## 11. Passkey

Passos:

1. Abra `/passkey-test`.
2. Cadastre passkey no celular.
3. Use o fluxo de login no PC com QR/código, se disponível.

Resultado esperado:

- Celular gera/autentica o código.
- PC usa o código para concluir login.
- PIN continua disponível como alternativa.
- Nenhuma mensagem fala "demo".

## 12. Checklist final antes de demo

Antes de considerar a build pronta:

- [ ] Login web funciona.
- [ ] Login por link WhatsApp funciona sem deslogar web.
- [ ] Chat entende saldo, contatos, aplicações, PIX, conversão, PIN e cotações.
- [ ] PIX de R$100 entra como R$100 líquido.
- [ ] PIX para receber USDC/CETES/XLM mantém o ativo correto.
- [ ] PIX para contato envia para contato, não para a própria conta.
- [ ] Conversões usam cotação transacional única.
- [ ] Cotações mostram 6 pares e checam arbitragem direta e multi-hop.
- [ ] Histórico mostra todas as transações da conta.
- [ ] Comprovante aparece após PIX, pagamento e conversão.
- [ ] Rendimentos não mostram termos internos.
- [ ] Textos PT/EN estão coerentes com `lang`.
- [ ] Nenhum fluxo executa dinheiro antes do PIN.

## Bugs comuns para procurar

- "Sessão inválida" ao abrir histórico ou rendimentos por link WhatsApp.
- Valor pedido em XLM/CETES/USDC virando BRL.
- Destino "Minha conta" quando o pedido era para contato.
- Taxa descontada do valor recebido quando deveria ser cobrada por fora.
- Recibo ausente na mensagem final.
- Página em inglês quando `lang=pt-BR`.
- Menu genérico do bot em intenção clara.
- "Link já usado" em tela nova.
- "Nada aplicado agora" no lugar de `0 <moeda>`.
- Menção a nomes internos de integrações/provedores.
