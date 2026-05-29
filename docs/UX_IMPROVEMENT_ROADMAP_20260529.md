# Roadmap de UX - TalkToStellar

Data: 2026-05-29.

Objetivo: deixar o produto mais parecido com uma conta bancária simples: menos texto, menos estados repetidos, valor e taxa antes do PIN, e sempre um próximo passo quando algo não puder continuar.

## Princípios

1. Uma ação principal por tela.
2. Conta, valor e destino aparecem antes de qualquer detalhe técnico.
3. PIN é sempre a última etapa.
4. Erro recuperável precisa ter ação clara.
5. Chat, WhatsApp e Telegram usam os mesmos nomes de produto.
6. Testnet aparece como contexto curto, não como explicação longa.

## Termos

Usar na interface:

- contatos
- saldo
- PIX
- converter
- aplicar
- rendimentos
- posições
- histórico
- comprovante
- perfil

Evitar na interface principal:

- yield
- vault
- issuer
- trustline
- XDR
- smart contract
- DeFindex
- APY como promessa de retorno
- renda fixa, poupança ou garantia

Exceção: docs técnicos, logs, testes, rotas internas e código de integração.

## Prioridades

### P0 - Frases simples precisam funcionar

Estas mensagens não podem cair em fallback genérico:

- `quero ver meu perfil`
- `o que posso fazer por aqui?`
- `qual a melhor rota?`
- `quero investir`
- `ver histórico`
- `trazer dinheiro via pix`
- `sacar para meu pix`

Critério de aceite: cada frase abre a tela certa ou pergunta só o dado que falta.

### P1 - Telas de dinheiro

Cada tela deve mostrar:

1. conta conectada ou entrada necessária;
2. saldo ou valor de origem;
3. valor final ou estimativa;
4. taxa/cotação quando existir;
5. botão principal;
6. PIN somente no final.

Remover:

- bloco de status automático que só diz que dados foram atualizados;
- badges duplicados como `Execução aprovada`;
- botões de voltar ao chat em telas abertas por WhatsApp/Telegram;
- explicações técnicas antes da ação principal.

### P2 - Pós-confirmação

Depois de confirmar:

- mostrar sucesso curto;
- registrar feedback para o app/chat quando possível;
- oferecer comprovante;
- fechar webview/aba quando for tela intermediária;
- quando não puder fechar, deixar botão `Fechar` ou retorno para a origem.

### P3 - Histórico e perfil

Histórico deve parecer extrato:

- data;
- tipo;
- valor;
- contraparte;
- status;
- ações `Comprovante` e `Perfil`.

Perfil deve abrir `/u/<username>` quando houver perfil global e `/profile/<publicKey>` como fallback.

### P4 - Componentes compartilhados

Padronizar:

- `AccountStatusCard`: uma vez por tela, compacto quando estiver dentro de fluxo.
- `OperationProgressPanel`: usar só para etapas que ajudam o usuário.
- ações de recuperação: converter, adicionar via PIX, alterar valor.
- ações de sucesso: comprovante, perfil, fechar/voltar.

## Melhorias iniciadas nesta rodada

1. Links do chat agora têm rótulos por tela:
   - `/rendimentos` e `/review`: `Abrir rendimentos`;
   - `/transactions`: `Abrir histórico`;
   - `/profile/...` e `/u/...`: `Abrir perfil`;
   - `/send-external`: `Abrir envio externo`.
2. `AccountStatusCard` compacto agora usa texto curto:
   - `Conta pronta.`;
   - `Entre para continuar.`;
   - `Conferindo sessão.`;
   - `Entre novamente.`.
3. Guardrails de teste cobrem esses rótulos e o modo compacto.

## Próximos passos recomendados

1. Criar `RecoveryActions` compartilhado para PIX, conversão, aplicar e envio externo.
2. Criar `SuccessActions` compartilhado para comprovante, perfil e fechar/voltar.
3. Revisar todos os blocos `Status` e manter só quando houver estado acionável.
4. Trocar rotas legadas `/yield` e `/review` por entrada pública única `/rendimentos`, mantendo redirects.
5. Adicionar Playwright mobile para:
   - perfil pelo chat;
   - histórico com várias operações;
   - aplicar com saldo insuficiente;
   - PIX off-ramp com conversão;
   - envio externo concluído.

## Critério de pronto

A UX está boa quando uma pessoa consegue:

1. entrar pela conta vinculada usando só PIN;
2. ver perfil, contatos, saldo e histórico sem termos técnicos;
3. converter sem voltar para o chat;
4. aplicar apenas em opções ativas;
5. retirar para PIX com alternativa quando faltar saldo;
6. enviar para carteira externa e fechar a tela depois;
7. confirmar tudo só no final com PIN;
8. receber comprovante ou próximo passo claro.
