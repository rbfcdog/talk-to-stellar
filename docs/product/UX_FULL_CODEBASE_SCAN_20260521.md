# UX full codebase scan - 2026-05-21

Este documento lista pontos de melhoria de UX encontrados em um scan amplo do repo TalkToStellar, usando como referencia o fluxo descrito em `docs/USER_DEMO_GUIDE.md`.

Pedido atendido neste documento: mapear primeiro tudo que pode melhorar na experiencia, sem implementar ainda.

## Escopo do scan

Arquivos rastreados no repo, excluindo `node_modules`, `.next`, `dist` e builds gerados:

- 507 arquivos rastreados totais.
- 456 arquivos rastreados nas superficies principais: `frontend`, `backend`, `telegram`, `evolution`, `docs`, `sow`.
- 95 arquivos de frontend em `frontend/app`, `frontend/components` e `frontend/lib`.
- Backend revisado com foco em controllers, agent/chat, Evolution/WhatsApp, ramp/PIX, proxies e mensagens de erro que chegam ao usuario.
- Documentacao revisada para alinhar demo de usuario, demo de anchor e demo de infraestrutura.

Superficies mais relevantes para UX:

- Chat web: `frontend/components/chat-window.tsx`, `frontend/components/chat-sidebar.tsx`.
- Landing: `frontend/components/landing-v2/*`.
- Onboarding/login: `frontend/app/create-account`, `frontend/app/login`.
- Pagamento: `frontend/app/pay-anyone`, `frontend/app/confirm-payment`, `frontend/app/claim-payment`.
- PIX: `frontend/app/pix-ramp`, `frontend/app/pix-on`, `frontend/app/pix-off`.
- Historico/receipt: `frontend/app/transactions`, `frontend/app/receipt`.
- Fluxos avancados: `frontend/app/send-external`, `frontend/app/global-transfer`, `frontend/app/institution-settlement`.
- Chat backend: `backend/src/agent/routes.ts`, `backend/src/agent/graph.ts`, `telegram/src`, `backend/src/api/services/evolution.service.ts`.
- Erros/proxies: `frontend/app/api/*`, `frontend/lib/backend-proxy.ts`, `backend/src/api/controllers/*`.

## Diagnostico executivo

O produto ja tem muita infraestrutura funcional, mas a experiencia ainda mistura tres modos em varias telas:

1. UX de usuario final: conta, saldo, PIX, pagamento, conversao, comprovante.
2. UX de demo tecnica: sandbox, endpoint, testnet, hash, logs, session_id, migration.
3. UX de operador/dev: debug, schema cache, API payload, token, state machine, adapter.

O maior ganho de UX vem de separar esses modos. A pessoa final deve ver uma conta simples. O reviewer tecnico deve ter um painel de evidencia. O operador deve ter logs e JSON, mas atras de um modo claramente marcado como debug/admin.

## Prioridade recomendada

Antes da proxima demo de usuarios, eu corrigiria nesta ordem:

1. Mapear erros tecnicos para mensagens acionaveis de usuario.
2. Tornar passkey opcional de verdade e deixar PIN como caminho principal de demo.
3. Separar modo usuario de modo debug no PIX e na rail institucional.
4. Padronizar idioma PT/EN nas telas principais.
5. Melhorar historico/receipt para fechar o ciclo de confianca.
6. Ajustar landing para nao prometer alem do estado real sandbox/testnet.
7. Adicionar estados de retry, expirado, pendente e "o que fazer agora" em todas as operacoes.

## Achados P0 - impacto direto na demo

### UX-001 - Erros tecnicos aparecem como resposta de chat

Evidencia:

- `frontend/app/api/chat/route.ts:137-160` cria erro `Agent API Error: ...` e devolve `content: Error: ...`.
- `frontend/components/chat-window.tsx:624-630` mostra `Sorry, something went wrong: ${error.message}` direto na conversa.
- `frontend/lib/i18n.tsx:31` e `frontend/lib/i18n.tsx:115` ainda usam texto generico `API response failed`.

Problema:

Quando o backend falha, o usuario ve erro de API, JSON interno, timeout ou configuracao. Isso quebra a ideia de "assistente financeiro" e tambem atrapalha demo, porque qualquer falha pequena parece bug critico.

Impacto:

- Usuario nao sabe se deve tentar de novo, fazer login, recriar link, aguardar ou falar com suporte.
- Reviewer ve detalhes tecnicos que deveriam ficar no log.
- O bot pode parecer instavel mesmo quando a falha e apenas backend temporariamente indisponivel.

Melhoria recomendada:

- Criar um `PublicErrorMapper` no frontend e backend.
- Trocar erros crus por mensagens como:
  - "Nao consegui concluir agora. Tente novamente em alguns segundos."
  - "Sua sessao expirou. Entre novamente para continuar."
  - "A cotacao expirou. Gere uma nova cotacao."
  - "Esse link expirou. Peca um novo link."
- Manter `debug_id`, `request_id` e erro cru somente no log interno ou painel debug.

### UX-002 - Proxies frontend ainda exibem troubleshooting de deploy para usuario

Evidencia:

- `frontend/lib/backend-proxy.ts:61-66` retorna `Backend proxy error... Check BACKEND_URL...`.
- `frontend/app/api/agent/[...path]/route.ts:46-51` retorna `Agent proxy error... Check BACKEND_URL or AGENT_API_URL`.
- `frontend/app/api/ramp/[...path]/route.ts:53-58` retorna `Ramp proxy error... Check BACKEND_URL...`.
- `frontend/app/api/financial/[...path]/route.ts:49-53` usa mensagem similar.

Problema:

Essas mensagens fazem sentido para dev, mas nao para usuario. Em uma demo de usuario, elas parecem erro de configuracao exposto publicamente.

Impacto:

- Piora confianca.
- Confunde avaliador nao tecnico.
- Vaza detalhes de arquitetura.

Melhoria recomendada:

- Retornar erro publico generico no browser.
- Incluir `support_code` ou `trace_id`.
- Logar URL alvo e env server-side apenas.
- Exemplo de resposta publica:

```json
{
  "success": false,
  "code": "backend_unavailable",
  "message": "Nao consegui conectar ao servico agora. Tente novamente em alguns segundos."
}
```

### UX-003 - Controllers backend retornam erro cru de Supabase, schema, token e provider

Evidencia:

- `backend/src/api/controllers/external.controller.ts:680-686` retorna `sessionsByEmailResp.error.message` diretamente.
- `backend/src/api/controllers/ramp.controller.ts:11-20` usa `error.message` como payload publico.
- `backend/src/api/controllers/financial.controller.ts:216-228` retorna `error?.message`.
- `backend/src/api/controllers/pin-reset.controller.ts:130-178` retorna erro cru de reset/token.
- `backend/src/app.ts:94-105` ainda retorna erro real para status abaixo de 500 em ambiente nao production-like.

Problema:

Erros como "schema cache", "could not find table", "invalid JWT", "foreign key" e mensagens de provider podem chegar em telas de usuario.

Impacto:

- Usuario nao entende a acao correta.
- Demo fica vulneravel a falha de migration/env.
- O produto parece menos polido.

Melhoria recomendada:

- Criar padrao de erro publico por dominio:
  - `session_expired`
  - `quote_expired`
  - `pix_provider_unavailable`
  - `missing_demo_migration`
  - `insufficient_balance`
  - `invalid_pin`
  - `provider_sandbox_unavailable`
- Separar `public_message` de `internal_message`.
- Em producao/demo, nunca retornar erro SQL bruto.

### UX-004 - Passkey ainda e apresentada como recomendada no onboarding, mesmo sendo fonte de timeout na demo

Evidencia:

- `frontend/app/create-account/create-account-client.tsx:1010-1018` deixa "Ativar passkey agora" como opcao recomendada.
- `frontend/app/create-account/create-account-client.tsx:1075-1104` mostra fluxo de biometria depois da conta criada.
- `frontend/app/login/login-client.tsx:627-637` mostra botao de Passkey no login.
- `frontend/app/login/login-client.tsx:638-650` tem bloco de QR de passkey desativado por `false &&`.

Problema:

Passkey depende de HTTPS, dominio, device/browser, cross-device e tempo de challenge. Na demo, isso ja causou timeout no celular. Mesmo corrigida tecnicamente, ela ainda aumenta risco de travar o fluxo principal.

Impacto:

- Usuario fica preso em biometria quando PIN seria suficiente.
- Demo perde tempo com comportamento do device, nao com produto.
- O texto "recomendado" empurra o usuario para o caminho mais instavel.

Melhoria recomendada:

- PIN-first no onboarding e demo.
- Passkey como segundo passo claro: "Ativar depois".
- CTA de passkey com "Opcional".
- Mostrar "Pular por agora" depois da conta criada.
- Se passkey falhar, voltar automaticamente para PIN com mensagem simples.
- Remover ou ativar corretamente o QR morto do login. Nao deixar codigo de UX inacessivel.

### UX-005 - Email confirmation ainda aparece na UI, mas email foi desacoplado no backend

Evidencia:

- `frontend/app/create-account/create-account-client.tsx:1020-1034` mostra "Codigo enviado por e-mail".
- `frontend/app/login/login-client.tsx:598-612` mostra campo de codigo por email.
- O contexto recente do projeto removeu/neutralizou envio de email por Resend/Sendgrid.

Problema:

Se o backend retornar `emailConfirmationRequired`, a tela pede um codigo que pode nao ser enviavel no ambiente atual.

Impacto:

- Bloqueia onboarding/login.
- Gera erro de demo ("Email sending is not configured").
- Contradiz a decisao de desacoplar email.

Melhoria recomendada:

- Enquanto email estiver inativo, esconder os campos de codigo.
- Se o backend pedir confirmacao, a UI deve mostrar:
  - "Confirmacao por email esta desativada neste ambiente. Use login via chat/PIN."
- Melhor ainda: backend nao deve retornar `emailConfirmationRequired` se email estiver disabled.

### UX-006 - PIX on-ramp mistura acao real, sandbox, Etherfuse e confirmacao manual em um unico bloco

Evidencia:

- `frontend/app/pix-ramp/pix-ramp-client.tsx:1852-1855` mostra recebedor como `Etherfuse`.
- `frontend/app/pix-ramp/pix-ramp-client.tsx:1867-1875` explica que o QR e demonstrativo.
- `frontend/app/pix-ramp/pix-ramp-client.tsx:1914-1935` diz para digitar PIN e tocar em "Ja fiz o PIX. Confirmar agora".
- `frontend/app/pix-ramp/pix-ramp-client.tsx:1958-2000` mostra endpoints temporarios quando debug esta ativo.

Problema:

Para usuario final, "Etherfuse", "sandbox", "endpoint temporario" e "confirmar PIX de fato" sao conceitos de operador. Alem disso, a frase pode parecer que o usuario esta confirmando sozinho um pagamento que deveria ser confirmado pelo provedor.

Impacto:

- Usuario pode achar que o botao confirma PIX sem banco.
- Reviewer pode confundir sandbox com fluxo real.
- A tela fica muito densa para demo de usuario.

Melhoria recomendada:

- Criar dois modos visuais:
  - `user_mode`: "Pague no seu app do banco" -> "Aguardando confirmacao" -> "Saldo creditado".
  - `demo_mode`: "Simular confirmacao sandbox" claramente marcado.
- Em user mode, ocultar Etherfuse e endpoints.
- Trocar copy para:
  - Sandbox: "Simular pagamento PIX neste ambiente de teste".
  - Real: "Ja paguei. Verificar status".
- Recebedor user-facing deve ser "TalkToStellar" ou "Conta de recebimento", nao provider.

### UX-007 - Chat fica bloqueado durante loading e nao oferece retry/cancelar

Evidencia:

- `frontend/components/chat-window.tsx:516` ignora submit se `isLoading`.
- `frontend/components/chat-window.tsx:541` ativa loading.
- `frontend/components/chat-window.tsx:761-771` desabilita input e botao durante loading.
- `frontend/app/api/chat/route.ts:122-123` espera ate 30s.

Problema:

Quando o agente demora, o usuario perde controle. Em chat financeiro, o usuario precisa ver se a mensagem foi recebida, se esta processando e como tentar de novo.

Impacto:

- Sensacao de travamento.
- Usuario envia mensagens repetidas no WhatsApp/Telegram.
- Pode aumentar duplicidade percebida.

Melhoria recomendada:

- Manter input habilitado, mas mostrar fila ou "aguarde esta resposta".
- Adicionar "Tentar novamente" em erro.
- Depois de 8-10s, mostrar "Ainda estou processando".
- Depois de timeout, oferecer:
  - "Tentar de novo"
  - "Abrir tela web equivalente"
  - "Voltar ao menu"

### UX-008 - Telegram ainda usa linguagem cripto no primeiro contato

Evidencia:

- `telegram/src/bot.js:5-10` diz: `enviar 10 USDC para Ana`.
- `backend/src/agent/routes.ts:181-184` instrui a nao expor XLM/trustline/ledger e preferir R$/US$.

Problema:

O primeiro contato do Telegram contradiz a estrategia de "invisible wallet".

Impacto:

- Usuario comum ve `USDC` antes de entender conta/saldo.
- Demo de usuario fica menos bancaria.

Melhoria recomendada:

- Trocar por:

```text
Ola, posso te ajudar com saldo, PIX, contatos, pagamentos e conversoes.
Exemplos:
1. saldo
2. colocar 10 reais via PIX
3. enviar 5 dolares para Ana
4. historico
```

### UX-009 - Evolution/WhatsApp responde de forma assincrona sem indicador de processamento

Evidencia:

- `backend/src/api/services/evolution.service.ts:557-583` responde o webhook imediatamente e processa o agente em background.
- `backend/src/api/services/evolution.service.ts:567-575` envia fallback de erro apenas se `EVOLUTION_SEND_FAILURE_FALLBACK` estiver ligado.
- `backend/src/api/services/evolution.service.ts:599-608` envia resposta final depois do agente.

Problema:

O usuario do WhatsApp nao recebe "recebi sua mensagem, processando" quando a chamada demora. Se a Evolution/API demorar ou duplicar eventos, a experiencia parece inconsistente.

Impacto:

- Usuario manda mensagens repetidas.
- Pode parecer que o bot nao respondeu.
- Em demo, pode haver longos silencios.

Melhoria recomendada:

- Para comandos financeiros, enviar uma mensagem curta de processamento apos X segundos, nao imediatamente para todo mundo.
- Exemplo: "Recebi. Estou consultando sua conta agora."
- Manter dedupe persistente, mas adicionar telemetria de "reply_sent", "reply_failed" e "agent_timeout" visivel em painel operador.

## Achados P1 - melhorias fortes de produto

### UX-010 - Idioma esta inconsistente entre telas

Evidencia:

- `frontend/lib/i18n.tsx:21-103` e `frontend/lib/i18n.tsx:105-175` mostram que existe estrutura de i18n.
- `frontend/app/pay-anyone/pay-anyone-client.tsx:196-208` esta em ingles.
- `frontend/app/claim-payment/claim-payment-client.tsx:262-323` esta em ingles.
- `frontend/app/transactions/transactions-client.tsx:109-132` esta em ingles.
- `frontend/app/receipt/page.tsx:58-75` esta em ingles.
- `frontend/app/confirm-payment/confirm-payment-client.tsx:803-811` esta em ingles apesar de usar partes traduzidas depois.
- `frontend/app/send-external/send-external-client.tsx:190-335` esta em portugues.

Problema:

O produto alterna portugues e ingles no meio da jornada. Isso fica muito visivel em demo.

Impacto:

- Parece prototipo fragmentado.
- Usuarios brasileiros podem travar em telas criticas.
- Reviewer percebe falta de polimento.

Melhoria recomendada:

- Migrar todas as strings user-facing para `frontend/lib/i18n.tsx`.
- Usar `language` vindo de query/token/session.
- Prioridade: login, create-account, pix, confirm-payment, claim-payment, pay-anyone, transactions, receipt.

### UX-011 - Landing promete mais do que o app deve prometer em demo

Evidencia:

- `frontend/lib/i18n.tsx:80-83` e `frontend/lib/i18n.tsx:164-167` falam "Move money worldwide".
- `frontend/components/landing-v2/FAQSection.tsx:7-24` fala envio mundial e conversao.
- `frontend/components/landing-v2/SimulatorSection.tsx:123-130` chama estimativa de "Optimized live estimate".
- `frontend/components/landing-v2/SimulatorSection.tsx:181-193` compara fee vs metodo tradicional.
- `frontend/components/landing-v2/ProblemSection.tsx` menciona settlement e destino em segundos.

Problema:

Como o produto ainda usa sandbox/testnet e partes mockadas, a landing precisa ser mais precisa. Para demo, pode vender "experiencia" e "infra em validacao", mas nao deve soar como operacao financeira real pronta.

Impacto:

- Risco de avaliador entender promessa regulatoria/producao.
- Desalinhamento com guias que dizem para nao prometer producao.

Melhoria recomendada:

- Trocar "send money worldwide" por "demo de conta global conversacional".
- Dizer "em ambiente sandbox/testnet" nos pontos certos.
- Mostrar "o que e real" e "o que e sandbox" em uma secao curta.
- Evitar claims absolutos de economia quando o numero e simulador.

### UX-012 - Landing e telas operacionais usam layout de hero/card muito pesado para fluxo de tarefa

Evidencia:

- `frontend/components/landing-v2/Hero.tsx:24-49` usa hero full-screen com card central, glows e split layout.
- `frontend/app/create-account/create-account-client.tsx:906-914` usa hero grande para onboarding.
- `frontend/app/login/login-client.tsx:506-515` usa hero grande para login.
- `frontend/app/confirm-payment/confirm-payment-client.tsx:799-811` usa hero grande para confirmacao.
- `frontend/app/pix-ramp/pix-ramp-client.tsx:1456-1468` usa header grande para PIX.

Problema:

Para tarefas financeiras repetidas, o usuario precisa de densidade e clareza. Hero grande consome espaco, especialmente no celular.

Impacto:

- O botao principal fica abaixo da dobra em mobile.
- Confirmacao exige mais scroll.
- A tela parece landing mesmo quando e uma operacao.

Melhoria recomendada:

- Criar `OperationShell` compacto para login, confirmacao, PIX, receipt.
- H1 menor em telas de tarefa.
- Resumo financeiro sempre primeiro viewport.
- Botao principal sempre visivel acima da dobra em mobile.

### UX-013 - Confirmacao de pagamento nao mostra caminhos de recuperacao suficientes

Evidencia:

- `frontend/app/confirm-payment/confirm-payment-client.tsx:851-900` pede PIN e confirma.
- `frontend/app/confirm-payment/confirm-payment-client.tsx:901-927` esconde/mostra passkey.
- `frontend/app/confirm-payment/confirm-payment-client.tsx:944-949` mostra "Processing on the network".

Problema:

Se PIN esta errado, sessao expirou, saldo insuficiente, cotacao expirou ou destino invalido, o usuario precisa de acao clara.

Impacto:

- Erros viram texto seco.
- Usuario nao sabe se deve pedir novo link, refazer PIX ou voltar ao chat.

Melhoria recomendada:

- Adicionar cards de erro por caso:
  - PIN incorreto -> "Tente novamente" + "Redefinir PIN".
  - Link expirado -> "Pedir novo link no chat".
  - Saldo insuficiente -> "Completar com PIX".
  - Cotacao expirada -> "Gerar nova cotacao".
- Trocar "Processing on the network" por "Enviando pagamento".

### UX-014 - Pay Anyone nao mostra taxa, saldo, rota ou preview antes de criar link

Evidencia:

- `frontend/app/pay-anyone/pay-anyone-client.tsx:271-365` coleta destinatario, valor, moedas e PIN.
- O botao cria link diretamente.

Problema:

O usuario autoriza com PIN sem ver claramente:

- saldo disponivel;
- taxa estimada;
- quando o link expira;
- o que acontece se o destinatario nao criar conta;
- qual moeda sera debitada e qual sera recebida.

Impacto:

- Menor confianca.
- Maior chance de suporte.
- "Authorize link creation" soa tecnico.

Melhoria recomendada:

- Adicionar etapa "Resumo antes de autorizar".
- Mostrar saldo disponivel e taxa.
- Mostrar expira em linguagem humana.
- Para receive mode, mostrar link fixo sem pedir logica de envio.
- Trocar copy:
  - "Criar link de pagamento"
  - "Destinatario recebe"
  - "Voce paga"
  - "Valido ate"

### UX-015 - Claim Payment tem texto longo e nao usa idioma do usuario consistentemente

Evidencia:

- `frontend/app/claim-payment/claim-payment-client.tsx:262-270` tem paragrafo longo com varios conceitos.
- `frontend/app/claim-payment/claim-payment-client.tsx:311-323` mostra "1) Sign in" e "2) Create account".
- `frontend/app/claim-payment/claim-payment-client.tsx:343-371` mostra processamento e erro.

Problema:

Receber dinheiro deve ser um fluxo de baixa ansiedade. O texto atual explica demais e mistura ingles com termos de conta global.

Impacto:

- Usuario pode abandonar no momento de receber.
- Em mobile, a acao principal fica menos clara.

Melhoria recomendada:

- Titulo simples: "Voce recebeu US$ X de Rodrigo".
- Subtitulo: "Entre ou crie sua conta para receber."
- Dois botoes:
  - "Entrar e receber"
  - "Criar conta e receber"
- Mostrar progresso: "Validando conta" -> "Creditando" -> "Recebido".

### UX-016 - Historico e comprovantes ainda nao fecham a narrativa financeira

Evidencia:

- `frontend/app/transactions/transactions-client.tsx:163-220` usa tabela com colunas fixas.
- `frontend/app/receipt/page.tsx:37-49` depende de `localStorage` ou `image` query.
- `frontend/app/receipt/[code]/page.tsx:48-60` falha silenciosamente se nao consegue carregar recibo.

Problema:

Historico e comprovante sao a parte que gera confianca depois da operacao. Hoje eles sao funcionais, mas nao mostram uma narrativa clara de "o que aconteceu, quando, valor, taxa, origem, destino, comprovante".

Impacto:

- Demo perde forca no fechamento.
- Usuario nao sabe compartilhar comprovante ou abrir suporte.

Melhoria recomendada:

- Historico mobile em cards, nao so tabela.
- Filtros por tipo: PIX in, PIX out, envio, conversao, recebido.
- Cada item com CTA "Ver comprovante".
- Receipt por codigo deve ser fonte primaria; `localStorage` so fallback.
- Receipt deve mostrar metadados textuais alem de imagem: valor, destino, data, status, codigo.
- Se falhar, mostrar "Gerar novamente" ou "Voltar ao historico".

### UX-017 - PIX pede email manual quando nao ha sessao, em vez de conduzir para login

Evidencia:

- `frontend/app/pix-ramp/pix-ramp-client.tsx:1686-1714` pede "Email da conta".
- Placeholder usa exemplo pessoal `jorge@gmail.com`.

Problema:

Em fluxo financeiro, pedir email para localizar conta e menos seguro e menos claro do que "entrar para continuar".

Impacto:

- Usuario pode errar email.
- Pode parecer lookup aberto de conta.
- A jornada fica diferente do resto do produto, que usa login/session.

Melhoria recomendada:

- Se nao ha sessao, mostrar CTA "Entrar para usar PIX".
- Preservar `next=/pix-on?...`.
- Email lookup deve ficar em modo demo/debug, nao no fluxo final.

### UX-018 - Send External ainda expoe chave Stellar e "dolar digital" em fluxo que parece usuario final

Evidencia:

- `frontend/app/send-external/send-external-client.tsx:196-220` pede "Chave da conta externa" com placeholder `GB...`.
- `frontend/app/send-external/send-external-client.tsx:198` fala "dolar digital".
- `frontend/app/send-external/send-external-client.tsx:301-315` inicia com Passkey e fallback PIN.

Problema:

Esse fluxo e avancado/tecnico. Para usuario final, "conta externa" deveria ser email, contato salvo, chave de transferencia, ou conta internacional formatada. `GB...` e conceito Stellar.

Impacto:

- Quebra a promessa de nao exigir conhecimento blockchain.
- Pode ser confundido com envio bancario externo.

Melhoria recomendada:

- Renomear para modo avancado ou esconder da navegacao normal.
- Para usuario final, usar contato salvo ou "chave de transferencia".
- Se o destino e Stellar publico, rotular como "endereco tecnico" e exigir confirmacao extra.

### UX-019 - Rail institucional ainda aparece com termos antigos e campos sensiveis na UI

Evidencia:

- `frontend/app/international-transfer/international-transfer-client.tsx:793-807` chama tela de "USD rail control room".
- `frontend/app/international-transfer/international-transfer-client.tsx:884-890` mostra `Session ID`, `Session token` e PIN manual.
- `frontend/app/international-transfer/international-transfer-client.tsx:946-963` mostra guidance de migration SQL quando falta tabela.
- `frontend/app/international-transfer/international-transfer-client.tsx:1211-1232` exibe JSON de quote, settlement e reconciliation.
- `frontend/app/international-transfer/international-transfer-client.tsx:1291-1310` mostra API log.
- `frontend/app/global-transfer/global-transfer-client.tsx:846-847` ainda diz "Wise-compatible".

Problema:

Essa tela e boa como painel tecnico, mas nao e UX de usuario. Ela tambem ainda carrega termos de "international transfer" e Wise-compatible em alguns pontos, apesar da direcao nova ser entre instituicoes.

Impacto:

- Reviewer de produto pode confundir com funcionalidade final.
- Usuario final nunca deve ver session token.

Melhoria recomendada:

- Deixar claramente como "Operator demo / Infrastructure tester".
- Proteger por flag ou rota interna.
- Trocar "international transfer" por "institution settlement route" na UI e nas mensagens.
- Ocultar session token por padrao e usar cookie/session.
- "Wise-compatible" deve virar "international USD account details".

### UX-020 - Global transfer cost lab mistura mock e narrativa de produto

Evidencia:

- `frontend/app/global-transfer/global-transfer-client.tsx:698-699` marca "Mock sandbox".
- `frontend/app/global-transfer/global-transfer-client.tsx:719-790` expoe dezenas de inputs financeiros.
- `frontend/app/global-transfer/global-transfer-client.tsx:833-847` cria mock flow e menciona payout.

Problema:

E uma boa ferramenta de simulacao, mas pode confundir usuario final se estiver facil de acessar. Ela parece produto financeiro configuravel, mas e mock.

Impacto:

- Risco de overclaim.
- A demo de usuario pode parecer mais complexa do que deveria.

Melhoria recomendada:

- Mover para `/ops/global-transfer-lab` ou proteger por feature flag.
- Na landing, apontar usuarios para chat/PIX, nao para lab.
- Manter lab para avaliador tecnico com badge forte "mock".

## Achados P2 - polimento, acessibilidade e consistencia

### UX-021 - Icones clicaveis sem rotulo ou acao clara

Evidencia:

- `frontend/components/chat-window.tsx:702-706` mostra Video, Phone, Search e MoreVertical como icones clicaveis sem `button`, `aria-label` ou acao.
- `frontend/components/chat-sidebar.tsx:197-200` mostra icones similares.
- `frontend/components/landing-v2/FAQSection.tsx:46-49` usa botao sem `aria-expanded`.

Problema:

Icones parecem interativos, mas nao explicam o que fazem. Para acessibilidade, leitores de tela nao entendem.

Impacto:

- UX confusa.
- Acessibilidade baixa.
- Usuario pode clicar em elementos que nao fazem nada.

Melhoria recomendada:

- Transformar icones em botoes reais com `aria-label`.
- Se nao ha funcao, remover ou desabilitar visualmente.
- FAQ com `aria-expanded`, `aria-controls` e ids.

### UX-022 - Botoes desabilitados nao dizem o que falta

Evidencia:

- `frontend/app/create-account/create-account-client.tsx:1039-1044` desabilita finalizar conta se PIN/codigo falta.
- `frontend/app/login/login-client.tsx:617-623` desabilita login em varios casos.
- `frontend/app/pay-anyone/pay-anyone-client.tsx:355-363` desabilita criar link.
- `frontend/app/pix-ramp/pix-ramp-client.tsx:1777-1779` desabilita gerar PIX em varios estados.

Problema:

Quando o botao esta desabilitado, o usuario nem sempre sabe qual campo falta.

Impacto:

- Friccao em mobile.
- Mais tentativas erradas.

Melhoria recomendada:

- Adicionar helper text "Falta confirmar o PIN", "Entre na conta para continuar", "Aguarde o calculo do PIX".
- Em botoes principais, usar `disabledReason`.

### UX-023 - Entrada de valores e documentos nao tem mascara/formatacao consistente

Evidencia:

- `frontend/app/create-account/create-account-client.tsx:961-980` telefone/CPF sao inputs simples.
- `frontend/app/pay-anyone/pay-anyone-client.tsx:287-290` aceita `,` e `.`.
- `frontend/app/pix-ramp/pix-ramp-client.tsx:1735-1743` valor PIX nao mostra mascara monetaria.
- `frontend/app/send-external/send-external-client.tsx:236-243` aceita decimal cru.

Problema:

Valores financeiros precisam de formatacao local clara. Documento/telefone devem reduzir erro de digitacao.

Impacto:

- Valores errados.
- Usuario brasileiro espera `R$ 10,00`.
- Validacao tardia gera frustracao.

Melhoria recomendada:

- Componente `MoneyInput` com locale pt-BR/en-US.
- Componente `CpfInput` e `PhoneInput`.
- Mostrar valor normalizado antes de confirmar.

### UX-024 - Copy usa "most optimized route" demais sem mostrar sempre a prova

Evidencia:

- `backend/src/agent/routes.ts:204-207` instrui uso forte de "most optimized".
- `frontend/app/confirm-payment/confirm-payment-client.tsx:865-872` mostra rota e economia quando disponivel.
- `frontend/app/pix-ramp/pix-ramp-client.tsx:1777-1779` usa "rota mais otimizada".

Problema:

"Mais otimizada" e bom como linguagem de produto, mas sem fee breakdown ou comparacao visivel pode parecer claim vago.

Impacto:

- Menos confianca.
- Reviewer pode perguntar "otimizada como?".

Melhoria recomendada:

- Sempre que usar a frase, mostrar pelo menos:
  - valor de origem;
  - valor de destino;
  - taxa;
  - validade da cotacao;
  - alternativa ou referencia, se houver.

### UX-025 - Historico usa tabela desktop e nao prioriza mobile

Evidencia:

- `frontend/app/transactions/transactions-client.tsx:179-220` usa tabela com `overflow-x-auto`.

Problema:

Historico financeiro em mobile deve ser escaneavel em cards. Tabela horizontal e aceitavel para desktop, mas fraca para celular.

Impacto:

- Usuario nao encontra comprovante rapido.
- Demo no celular parece apertada.

Melhoria recomendada:

- Cards mobile:
  - tipo;
  - valor;
  - contraparte;
  - status;
  - data;
  - botao "Comprovante".
- Tabela apenas `md+`.

### UX-026 - Receipt por imagem nao e suficiente para suporte/auditoria de usuario

Evidencia:

- `frontend/app/receipt/page.tsx:80-85` renderiza apenas imagem.
- `frontend/app/receipt/[code]/page.tsx:109-114` idem.

Problema:

Imagem e boa para compartilhar, mas usuario tambem precisa copiar texto/codigo, ver status e abrir historico.

Impacto:

- Suporte manual mais dificil.
- Acessibilidade ruim: imagem com alt generico nao comunica conteudo.

Melhoria recomendada:

- Mostrar campos textuais abaixo da imagem.
- Botao "Copiar dados do comprovante".
- Botao "Compartilhar no WhatsApp".
- Alt descritivo com valor/data quando possivel.

### UX-027 - Loading states nao sao time-aware

Evidencia:

- `frontend/components/chat-window.tsx:741-750` mostra typing dots indefinidamente.
- `frontend/app/pix-ramp/pix-ramp-client.tsx` usa varios labels de `loading`, mas sem tempo maximo claro.
- `backend/src/api/services/evolution.service.ts:409-410` permite timeout de agente ate 120s.

Problema:

Operacoes financeiras podem demorar, mas o usuario precisa saber o que esta acontecendo.

Impacto:

- Sensacao de travamento.
- Mensagens duplicadas.

Melhoria recomendada:

- Estados por tempo:
  - 0-3s: "Processando".
  - 3-10s: "Ainda consultando sua conta".
  - 10s+: "Esta demorando mais que o normal".
  - timeout: retry + fallback.

### UX-028 - Modo demo nao tem reset/preset unico para gravacao

Evidencia:

- `docs/USER_DEMO_GUIDE.md` define dados de teste.
- App ainda exige configurar manualmente varias telas/valores.
- `frontend/app/global-transfer` e `frontend/app/institution-settlement` tem presets tecnicos, mas nao ha preset unificado de usuario.

Problema:

Toda demo depende de preparar estado manualmente.

Impacto:

- Mais chance de erro ao vivo.
- Dificil repetir demo igual.

Melhoria recomendada:

- Criar `?demo=1` para preencher valores:
  - Rodrigo Demo;
  - Ana Demo;
  - R$ 10,00;
  - US$ 1,00;
  - PIN de teste nao exibido, mas helper de ambiente.
- Criar painel "Reset demo state" apenas local/sandbox.

### UX-029 - Onboarding coleta nome, email, telefone, CPF e PIN sem explicar por que cada dado e necessario

Evidencia:

- `frontend/app/create-account/create-account-client.tsx:935-1008` mostra todos os campos em sequencia.

Problema:

Usuario pode se assustar com CPF/telefone sem contexto.

Impacto:

- Menor conversao.
- Dificil demo se o avaliador pergunta necessidade dos dados.

Melhoria recomendada:

- Agrupar:
  - "Dados da conta"
  - "Seguranca"
  - "Contato"
- Explicar em uma linha:
  - CPF/telefone sao usados para identificar/recuperar conta em ambiente de teste.
- Se algum campo for opcional, marcar claramente.

### UX-030 - Login com canal externo mostra identificador tecnico demais

Evidencia:

- `frontend/app/login/login-client.tsx:521-525` mostra canal e identificador.
- `frontend/app/login/login-client.tsx:555-565` mostra Telegram ID.

Problema:

ID do Telegram/WhatsApp e util para suporte, mas usuario comum entende melhor "conta do Telegram detectada".

Impacto:

- Parece tecnico.

Melhoria recomendada:

- Texto principal: "Entrando pela sua conversa do Telegram".
- Identificador em detalhes recolhidos.

### UX-031 - Links de pagamento e recebimento nao tem preview social/compartilhamento forte

Evidencia:

- `frontend/app/pay-anyone/pay-anyone-client.tsx:367-385` mostra link cru e botao copiar.

Problema:

O principal fluxo social deve facilitar compartilhar no WhatsApp/Telegram.

Impacto:

- Usuario copia manualmente.
- Demo perde naturalidade.

Melhoria recomendada:

- Botoes:
  - Compartilhar no WhatsApp.
  - Compartilhar no Telegram.
  - Copiar mensagem pronta.
- Mensagem pronta com valor e instrucoes.

### UX-032 - Fluxos avancados deveriam ser separados do produto final

Evidencia:

- `frontend/app/global-transfer/global-transfer-client.tsx:688-695` linka para institution tester.
- `frontend/app/international-transfer/international-transfer-client.tsx:1211-1310` mostra JSON e API logs.

Problema:

Esses fluxos sao excelentes para avaliacao tecnica, mas podem prejudicar demo de usuario se acessiveis como produto.

Impacto:

- Produto parece mais complexo.
- Pode expor dados sensiveis.

Melhoria recomendada:

- Namespace `/ops/*` ou `/demo/infra/*`.
- Badge "Technical demo".
- Feature flag `NEXT_PUBLIC_ENABLE_OPS_DEMO=true`.

### UX-033 - Faltam estados vazios ricos

Evidencia:

- `frontend/app/transactions/transactions-client.tsx:175-177` mostra apenas "No transactions in this period."
- `frontend/app/receipt/page.tsx:14-28` mostra "No image found".
- `frontend/components/chat-window.tsx:716-720` mostra shimmer quando nao ha mensagens.

Problema:

Estados vazios deveriam conduzir o usuario para uma acao.

Impacto:

- Usuario nao sabe o proximo passo.

Melhoria recomendada:

- Historico vazio:
  - "Ainda nao ha transacoes em maio."
  - CTA "Colocar dinheiro via PIX" e "Enviar primeiro pagamento".
- Receipt vazio:
  - "Abra pelo link do comprovante ou pelo historico."
- Chat vazio:
  - Sugestoes clicaveis: saldo, PIX, enviar, historico.

### UX-034 - A interface de chat tem contatos mockados misturados com assistente real

Evidencia:

- `frontend/components/chat-sidebar.tsx` lista contatos como Marina, Roberto, Gustavo etc.
- `frontend/components/chat-window.tsx:543-553` responde localmente para chats que nao sao o agent.

Problema:

Na demo, clicar em contatos mockados pode parecer fluxo real, mas nao executa backend.

Impacto:

- Usuario/reviewer pode se confundir.
- Parece que algumas conversas sao fake.

Melhoria recomendada:

- Separar "Assistente" de "Contatos demo".
- Marcar contatos mockados como exemplos.
- Melhor: conectar contatos reais do backend ou ocultar mock em producao/demo publica.

### UX-035 - URLs com token ainda existem no fluxo, mesmo removendo depois

Evidencia:

- `frontend/app/confirm-payment/page.tsx:10-15` recebe token via query.
- `frontend/app/create-account/page.tsx:10-15` recebe token via query.
- `frontend/app/confirm-payment/confirm-payment-client.tsx:418-428` remove token da URL depois.

Problema:

O token aparece inicialmente na barra e pode aparecer em gravacao, historico e logs do browser.

Impacto:

- Risco de demo vazar token.
- UX de link longo menos limpa.

Melhoria recomendada:

- Link curto `/r/:code` como padrao.
- Tela inicial troca code por cookie/session server-side.
- Evitar mostrar token JWT em URL user-facing.

## Melhorias transversais recomendadas

### 1. Criar taxonomia de estados user-facing

Estados comuns para todos os fluxos:

```text
idle
needs_login
ready
quoting
quote_expired
waiting_payment
processing
needs_pin
completed
failed_retryable
failed_final
```

Cada estado deve ter:

- titulo;
- descricao curta;
- CTA principal;
- CTA secundario;
- `support_code` opcional.

### 2. Criar componentes de UX compartilhados

Componentes sugeridos:

- `OperationShell`
- `MoneyInput`
- `PinInput`
- `PublicErrorBanner`
- `StatusTimeline`
- `ReceiptSummary`
- `ShareActions`
- `DebugDisclosure`
- `DemoModeBadge`

### 3. Separar user mode, demo mode e ops mode

Proposta:

```text
/chat                         usuario
/pix-on                       usuario
/pix-off                      usuario
/pay-anyone                   usuario
/transactions                 usuario
/receipt/:code                usuario
/demo/user-flow               demo guiada de usuario
/demo/anchor                  demo tecnica de anchor
/ops/institution-settlement   operador/reviewer tecnico
/ops/global-transfer-lab      operador/reviewer tecnico
```

### 4. Padrao de copy para dinheiro

Usar:

- "saldo" em vez de "wallet";
- "conta" em vez de "wallet";
- "dolares" ou "US$" em vez de "USDC" no user mode;
- "codigo de comprovacao" em vez de "hash";
- "colocar dinheiro via PIX" em vez de "on-ramp";
- "retirar para PIX" em vez de "off-ramp";
- "ambiente de teste" somente quando a tela for demo/sandbox.

### 5. Padrao para demo

Antes de gravar demo de usuario:

- Usar PIN, nao passkey.
- Usar chat ou `/pix-on` e `/pay-anyone`, nao rail institucional.
- Desligar debug panels.
- Usar valores pequenos.
- Garantir que erros de provider nao aparecem crus.
- Ter fallback se WhatsApp/Evolution demorar: abrir `/chat`.

## Ordem de implementacao sugerida

### Sprint UX 1 - demo sem sustos

1. Error mapper publico no frontend/backend.
2. Passkey opcional e "Pular por agora".
3. Esconder email confirmation quando email disabled.
4. Trocar copy do Telegram inicial.
5. PIX sandbox com CTA "Simular pagamento" em vez de "Confirmar PIX de fato".
6. Adicionar retry nos erros de chat.

### Sprint UX 2 - jornadas principais

1. Refatorar login/onboarding/confirm-payment para `OperationShell`.
2. Padronizar i18n das telas criticas.
3. Pay Anyone com preview de taxa/saldo/validade.
4. Claim Payment simplificado.
5. Historico mobile em cards.
6. Receipt com metadados e share.

### Sprint UX 3 - separacao de modos

1. Mover labs para `/ops`.
2. Feature flag para paines debug.
3. Criar `/demo/user-flow`.
4. Preset de dados de demo.
5. Documentar "user demo" vs "anchor demo" dentro da UI.

### Sprint UX 4 - acessibilidade e polish

1. Aria labels em icones.
2. FAQ com `aria-expanded`.
3. Estados vazios ricos.
4. Inputs mascarados.
5. Revisao mobile de todas as telas.
6. Testes Playwright dos fluxos de usuario.

## Melhor achado unico para atacar primeiro

Se for escolher so uma melhoria de alto impacto:

```text
Criar uma camada unificada de erro publico e recovery CTA para chat, PIX, login, pagamento e receipt.
```

Motivo:

- Resolve os erros crus que ja apareceram em demo.
- Melhora todos os fluxos sem mudar regra financeira.
- Deixa o produto parecer confiavel mesmo quando algum provider falha.
- Facilita gravacao, suporte e debug.

Resultado esperado:

```text
Erro tecnico interno:
Agent API Error: fetch failed / schema cache / provider timeout

Usuario ve:
Nao consegui concluir agora. Tente novamente em alguns segundos.
[Tentar novamente] [Voltar ao chat]
Codigo de suporte: TTS-20260521-ABCD
```
