# Ideias para melhorar a UX

Este documento lista melhorias possiveis para a experiencia nova do app: chat, rendimento, conversao, PIX, passkey e ciclo completo do dinheiro. A prioridade e reduzir confusao, diminuir cliques e deixar claro quando algo esta em teste, em revisao ou pronto para executar.

## Atualizacao: UX de rendimento mais parecida com banco

Arquivo principal implementado: `frontend/app/rendimentos/rendimentos-client.tsx`.

Objetivo: a tela `/yield` deve parecer uma tela bancaria de carteira + aplicacao + revisao, nao uma tela tecnica de protocolo.

Mudancas aplicadas:
- resumo superior com `Conta`, `Aplicacoes`, `Selecionado` e `Seguranca`;
- linguagem de banco: `Carteira`, `Aplicar`, `Resgatar`, `Revisao segura`, `PIN ativo`, `Modo revisao`;
- bloco de carteira separado do plano de rendimento;
- revisao em 3 etapas: saldo, revisao, registro;
- simulacao com aviso de que taxa pode variar e nao e promessa de retorno;
- estados vazios mais claros: `Saldo nao disponivel`, `Nada aplicado ainda`, `Taxa indisponivel`;
- ambiente sem execucao aparece como `Modo revisao`, nao como erro.

Proximas melhorias para deixar ainda mais bancario:
- extrato de rendimento com historico de aplicacoes/resgates;
- comprovante visual apos confirmacao;
- seletor de prazo simples: 1 mes, 6 meses, 12 meses;
- estado `Conta em analise` quando KYC/compliance impedir execucao;
- alerta de risco/regulacao em linguagem curta antes do PIN;
- componente unico de `Resumo da conta` usado tambem em `/convert` e `/money-cycle`;
- teste Playwright com screenshots desktop/mobile e varredura de termos tecnicos bloqueados.

## Prioridade 1: clareza imediata

### 1. Estado unico de conta em todas as telas

Problema: algumas telas mostram "sem conta", "carregando", "a consultar" ou "entre" de formas diferentes.

Melhoria:
- criar um componente unico de status da conta;
- estados: `Carregando conta`, `Conta conectada`, `Sessao expirada`, `Precisa entrar`;
- usar o mesmo bloco em `/yield`, `/convert`, `/pix-on`, `/pix-off`, `/money-cycle` e `/passkey-test`.

Validacao:
- usuario logado nunca deve ver "Sem conta" durante carregamento;
- usuario deslogado deve ver um unico CTA claro: `Entrar`.

### 2. Linguagem unica para moedas

Problema: o sistema tem nomes internos como `USDC`, `CETES`, `TESOURO`, `XLM`, mas o usuario deveria ver nomes simples.

Melhoria:
- Real/Reais para `TESOURO`;
- Dolares para `USDC`;
- Rendimento Mexico para `CETES`;
- ocultar `XLM` em fluxo normal, mostrar apenas se for necessario como saldo operacional;
- nunca mostrar issuer, vault, trustline, XDR, Defindex ou contrato na UX principal.

Validacao:
- varrer texto renderizado das telas e chat contra termos tecnicos bloqueados;
- screenshot mobile e desktop para garantir que labels cabem.

### 3. Explicar "teste" sem parecer erro

Problema: quando `DEFINDEX_ENABLE_EXECUTION=false`, a tela pode parecer quebrada.

Melhoria:
- trocar "confirmacao desligada" por um estado de produto: `Modo revisao`;
- mostrar: `Voce pode simular e revisar. Execucao real ainda esta bloqueada neste ambiente.`;
- se `DEFINDEX_ENABLE_EXECUTION=true`, mudar para `Pronto para confirmar`.

Validacao:
- em testnet/revisao, usuario entende que nada saiu da conta;
- em execucao, usuario entende que PIN movimenta saldo.

## Prioridade 2: fluxo de rendimento

### 4. Rendimento em 3 passos

Problema: a tela de rendimento ainda tem muitos detalhes ao mesmo tempo.

Melhoria:
1. Escolher saldo.
2. Ver rendimento disponivel.
3. Revisar e confirmar.

Detalhes avancados devem ficar colapsados:
- margem de seguranca;
- vault/status tecnico;
- JSON de resposta;
- metadados de teste.

Validacao:
- usuario consegue chegar em "Revisar" com no maximo 2 cliques depois de abrir `/yield`;
- sem conta, o unico caminho principal e entrar.

### 5. Melhor copia para rendimento

Evitar:
- "melhor investimento";
- "garantido";
- "sem risco";
- "rende X% garantido";
- "APY real" em testnet.

Usar:
- `taxa informada pelo ambiente de teste`;
- `estimativa`;
- `revise antes de confirmar`;
- `a taxa pode variar`;
- `nada sai sem PIN`.

Validacao:
- copiar esse padrao para chat e frontend;
- manter consistencia com `new/yield-apy-regulation.md`.

### 6. Projecao mais honesta

Problema: grafico de rendimento pode parecer promessa.

Melhoria:
- titulo: `Simulacao com a taxa atual`;
- incluir seletor simples: `1 mes`, `6 meses`, `12 meses`;
- mostrar o valor inicial e rendimento estimado separadamente;
- texto curto: `Nao e promessa de retorno`.

Validacao:
- em testnet, grafico nunca usa linguagem de investimento garantido.

## Prioridade 3: chat integrado

### 7. Tool calls abrirem interfaces com contexto preservado

Problema: o chat abre telas, mas a pessoa pode perder moeda/valor/chave.

Melhoria:
- toda tool que abre UI deve enviar `amount`, `asset`, `intent`, `destination_pix_key` quando existir;
- `/yield`, `/convert`, `/pix-on`, `/pix-off` e `/money-cycle` devem preservar esses parametros;
- cada tela deve ter um botao discreto `Voltar ao chat` com o pedido original.

Validacao:
- pedir no chat: `converter 100 dolares para rendimento`;
- a tela abre com 100 e moeda correta.

### 8. Chat responder com resumo acionavel

Problema: respostas podem ser longas ou pouco operacionais.

Melhoria:
- formato curto:
  - o que entendi;
  - proximo passo;
  - botao/link principal;
- evitar menus grandes depois que a intencao ja esta clara.

Exemplo:
`Entendi: voce quer deixar 100 dolares rendendo. Abri a revisao com sua conta. Nada sera confirmado sem PIN.`

Validacao:
- testes de LLM para rendimento, conversao, PIX e passkey.

## Prioridade 4: conversao e ciclo interno

### 9. Conversao ligada ao rendimento

Problema: usuario pode nao entender quando precisa converter antes de render.

Melhoria:
- se a moeda escolhida nao tem rendimento, mostrar uma recomendacao operacional:
  `Esse saldo ainda nao tem rendimento aqui. Voce pode converter para Dolares ou Rendimento Mexico e revisar.`
- CTA unico: `Converter e revisar`.

Validacao:
- selecionar Real sem vault em testnet mostra caminho claro, nao erro.

### 10. Ciclo do dinheiro em uma tela

Problema: PIX entrada, rendimento e PIX saida podem parecer tres produtos diferentes.

Melhoria:
- `/money-cycle` deve mostrar um fluxo linear:
  1. adicionar dinheiro;
  2. manter rendendo;
  3. retirar;
- manter valor, moeda e chave PIX no mesmo contexto;
- mostrar apenas uma acao principal por etapa.

Validacao:
- usuario nao precisa voltar ao chat para completar o ciclo.

## Prioridade 5: PIX

### 11. Mostrar taxa e conversao antes do PIN

Problema: diferencas como 50 -> 43 confundem muito.

Melhoria:
- nunca mostrar conversao TESOURO/Real que nao seja 1:1 na UX;
- mostrar taxa separada:
  - `Voce paga`;
  - `Taxa`;
  - `Recebe/envia`;
- se houver rota indireta, explicar em linguagem simples antes do PIN.

Validacao:
- Real/TESOURO sempre aparece 1:1 para usuario;
- nenhuma tela mostra asset `BRL` separado.

### 12. Chave PIX dinamica com memoria local

Problema: saida precisa pedir chave PIX no momento certo.

Melhoria:
- campo de chave PIX sempre perto do botao de retirada;
- detectar tipo: email, CPF/CNPJ, telefone, aleatoria;
- permitir salvar apelido do destino depois da primeira retirada.

Validacao:
- `/pix-off?destination_pix_key=user%40example.com` preenche automaticamente;
- sem chave, tela pede antes do PIN.

## Prioridade 6: passkey

### 13. Passkey como alternativa simples ao PIN

Problema: passkey pode parecer recurso tecnico.

Melhoria:
- texto principal: `Entrar com biometria`;
- "Passkey" aparece so como detalhe secundario;
- fluxo deve mostrar:
  - aparelho suporta;
  - conta conectada;
  - biometria ativa;
  - ultimo teste validado.

Validacao:
- `/passkey-test` mostra se WebAuthn e biometria estao disponiveis;
- erro de dominio explica `PASSKEY_RP_ID` e `PASSKEY_ORIGIN`.

### 14. Smart account OpenZeppelin como diagnostico, nao UX principal

Problema: smart account e linguagem tecnica.

Melhoria:
- na UX principal, chamar de `seguranca avancada`;
- manter `/passkey-test` para diagnostico tecnico;
- mostrar verifier, P-256 e metadata so em tela de teste/admin.

Validacao:
- chat e telas de usuario normal nao mencionam OpenZeppelin, P-256 ou smart account.

## Prioridade 7: confiabilidade percebida

### 15. Timeouts com recuperacao

Problema: carregamento infinito quebra confianca.

Melhoria:
- toda chamada critica deve ter timeout;
- apos timeout, mostrar:
  - `Tentar novamente`;
  - `Voltar ao chat`;
  - suporte/codigo de erro se houver.

Validacao:
- simular backend lento e confirmar que a tela sai do loading.

### 16. Estados vazios uteis

Problema: "A consultar" e pouco claro.

Melhoria:
- trocar por estados especificos:
  - `Carregando saldo`;
  - `Saldo ainda nao disponivel`;
  - `Conta sem essa moeda`;
  - `Rendimento nao configurado neste ambiente`.

Validacao:
- nenhuma tela principal deve ficar com mais de um "A consultar" sem explicacao.

## Prioridade 8: testes de UX

### 17. Suite Playwright por fluxo

Adicionar testes para:
- login -> `/yield` mostra conta conectada;
- chat -> tool call de rendimento abre `/yield` com valor;
- converter -> rendimento preserva valor/moeda;
- PIX off-ramp pede chave PIX se estiver ausente;
- passkey-test mostra status WebAuthn e botao de registro;
- desktop e mobile.

### 18. Teste automatico de termos bloqueados

Bloquear na UX principal:
- Defindex;
- vault;
- issuer;
- trustline;
- XDR;
- Stellar;
- blockchain;
- OpenZeppelin;
- P-256;
- smart account.

Excecao:
- `/passkey-test` pode mostrar OpenZeppelin/P-256/smart account;
- documentos tecnicos em `new/` podem mostrar os termos.

## Ordem sugerida de implementacao

1. Unificar estado de conta e loading.
2. Reduzir `/yield` para 3 passos.
3. Melhorar conversao quando moeda nao tem rendimento.
4. Padronizar copia de rendimento e simulacao.
5. Adicionar Playwright para `/yield`, `/convert`, `/money-cycle` e `/passkey-test`.
6. Criar teste de termos bloqueados para telas principais.
7. Mover detalhes tecnicos para telas de diagnostico/admin.

## Criterio de pronto

A UX nova esta boa quando uma pessoa consegue:

1. Entrar na conta sem entender termos tecnicos.
2. Ver saldos com nomes simples.
3. Escolher um saldo para rendimento.
4. Revisar simulacao, taxa e valor antes do PIN.
5. Converter se a moeda escolhida nao tiver rendimento.
6. Retirar por PIX informando a chave na hora.
7. Usar biometria/passkey sem precisar entender OpenZeppelin.
8. Voltar ao chat sem perder o contexto.
