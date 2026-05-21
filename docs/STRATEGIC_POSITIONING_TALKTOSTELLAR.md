# Documento de Posicionamento Estrategico - TalkToStellar

## 1. Tese central

TalkToStellar e uma infraestrutura conversacional para conversao e roteamento de dinheiro entre BRL e USD usando Pix, Stellar e contas internacionais existentes.

A tese nao e competir diretamente com bancos globais, contas internacionais ou provedores como Wise, Mercury, Revolut e similares. A tese e operar antes deles:

```text
Pix em BRL
-> conversao eficiente
-> settlement em Stellar como USDC
-> coordenacao de entrega em USD
-> deposito/instrucao para uma conta internacional de preferencia do usuario
```

Em termos simples:

```text
TalkToStellar quer ser a rota mais simples e barata para transformar reais em dolares e entregar esse valor no destino financeiro que o usuario ja usa.
```

O usuario nao precisa aprender blockchain, Stellar, USDC, trustlines, XDR, pathfinding ou detalhes de liquidacao. Ele conversa no WhatsApp, Telegram ou web chat, confirma a operacao, paga por Pix e acompanha status/comprovante.

## 2. Frase de posicionamento

TalkToStellar e um trilho conversacional de conversao BRL -> USD que usa Pix e Stellar para reduzir friccao, custo e complexidade operacional antes da entrega em contas internacionais ja existentes.

## 3. O que o produto e

TalkToStellar e:

- Uma interface financeira por conversa.
- Uma camada de orquestracao de Pix, cotacao, saldo, conversao e pagamento.
- Uma infraestrutura de settlement usando Stellar.
- Um roteador de conversao BRL -> USDC -> USD.
- Um produto que salva contatos, destinos e historico para reduzir repeticao.
- Um painel tecnico para provar chamadas, evidencias, reconciliacao e estados da transferencia.
- Uma base para B2C, B2B e B2B2C.

TalkToStellar nao deve ser apresentado como:

- Um banco internacional completo em producao.
- Uma forma de evitar impostos, IOF, compliance ou regulacao.
- Um substituto direto de Wise, Mercury, Revolut ou bancos internacionais.
- Uma operacao de remessa regulada pronta para usuarios reais sem parceiros adequados.
- Um payout bancario real quando o adapter esta em sandbox/mock.

## 4. Proposta de valor

### Para o usuario final

O usuario quer converter e enviar dinheiro com menos custo e menos friccao.

Hoje, esse processo normalmente envolve:

- abrir apps diferentes;
- comparar cotacao manualmente;
- lidar com spread escondido;
- copiar dados bancarios;
- esperar compensacao;
- receber pouca visibilidade de status;
- guardar comprovantes de forma manual.

TalkToStellar simplifica isso em uma conversa:

```text
"quero colocar 500 reais em dolares"
"enviar 100 dolares para minha conta internacional"
"historico"
"quanto vou receber se pagar R$ 1.000?"
```

O produto responde com cotacao, taxa, destino, status e comprovante.

### Para empresas

Empresas precisam pagar ferramentas, fornecedores, freelancers, prestadores internacionais ou abastecer contas globais operacionais.

TalkToStellar pode oferecer:

- cotacao BRL -> USD;
- Pix como funding domestico;
- roteamento por Stellar;
- status operacional;
- reconciliacao;
- comprovantes;
- destinos salvos;
- API futura para lotes e pagamentos recorrentes.

### Para fintechs e instituicoes

Fintechs, wallets, plataformas de payroll, ERPs, marketplaces e remittance startups podem usar TalkToStellar como camada de infraestrutura:

- intake Pix;
- quote engine;
- Stellar settlement evidence;
- payout instruction adapter;
- same-name identity alignment;
- reconciliation metadata;
- logs operacionais;
- painel de auditoria tecnica.

Aqui o produto deixa de ser apenas interface e vira infraestrutura.

## 5. Categoria de mercado

TalkToStellar se posiciona em uma categoria hibrida:

```text
Conversational FX + Stablecoin Settlement Rail + Pix-to-USD Routing Infrastructure
```

Em portugues:

```text
Trilho conversacional de cambio, liquidacao em stablecoin e entrega em conta internacional.
```

Essa categoria e mais precisa do que chamar o produto de "wallet cripto", "bot de Stellar" ou "remessa internacional". A experiencia e de conta e pagamento; a infraestrutura usa Stellar nos bastidores.

## 6. Por que nao competir com contas internacionais

Wise, Mercury, Revolut, Nomad, bancos globais e contas internacionais ja resolveram uma parte importante do problema: o usuario consegue ter dados bancarios internacionais ou uma conta global.

O problema que ainda sobra e:

```text
Como transformar BRL em USD de forma barata, rapida, rastreavel e facil antes de mandar para essa conta?
```

TalkToStellar entra exatamente nesse espaco.

Em vez de dizer:

```text
"Troque sua conta internacional por TalkToStellar."
```

A mensagem correta e:

```text
"Use TalkToStellar para converter melhor e enviar para a conta internacional que voce ja prefere."
```

Isso reduz resistencia do usuario. Ele nao precisa abandonar o banco favorito. Ele apenas usa TalkToStellar como rota de conversao.

## 7. Fluxo principal do produto

### Fluxo B2C

```text
Usuario abre WhatsApp, Telegram ou web chat
-> pede uma conversao ou envio
-> TalkToStellar gera quote BRL -> USD
-> usuario paga por Pix
-> backend confirma funding
-> valor e convertido/liquidado como USDC via Stellar
-> sistema prepara entrega/instrucao em USD
-> usuario acompanha status e comprovante
```

### Fluxo B2B

```text
Empresa cria transferencia BRL -> USD
-> sistema gera quote
-> empresa faz Pix
-> TalkToStellar registra Pix recebido
-> settlement Stellar e anexado como evidencia
-> payout adapter gera instrucao para destino USD
-> reconciliacao liga Pix, quote, Stellar tx e payout instruction
```

### Fluxo institucional

```text
Instituicao origem em BRL
-> Pix/on-ramp
-> conversao para USDC
-> Stellar settlement
-> adapter de off-ramp/payout
-> instituicao destino em USD
-> relatorio de delta, taxas e status
```

## 8. Capacidades que ja existem no projeto

O posicionamento acima nao e apenas conceitual. O repo ja caminha nessa direcao.

### Interface conversacional

Ja existe:

- chat web;
- Telegram bot;
- WhatsApp via Evolution API;
- roteamento de mensagens para `/api/agent/query`;
- linguagem natural para saldo, contatos, envio, conversao, historico e Pix.

Valor estrategico:

```text
O canal de entrada nao e um app novo. E o app de conversa que o usuario ja usa.
```

### Conta e autorizacao

Ja existe:

- criacao/acesso de conta por link;
- sessao;
- PIN;
- passkey como opcional;
- confirmacao de pagamento;
- reset/recuperacao de PIN;
- vinculo entre canal externo e conta.

Valor estrategico:

```text
O usuario pode sair do chat para uma tela segura apenas quando precisa confirmar algo sensivel.
```

### Stellar e saldo

Ja existe:

- wallet orchestration;
- Stellar SDK;
- envio e assinatura de transacoes;
- pathfinding/conversao;
- trustlines;
- infra testnet;
- preparacao para mainnet sem plugar no fluxo principal ainda.

Valor estrategico:

```text
Stellar vira a camada de liquidacao invisivel, nao a interface do usuario.
```

### Pix e Etherfuse

Ja existe:

- integracao Pix/Etherfuse em sandbox;
- on-ramp Pix;
- off-ramp Pix;
- fallback sandbox;
- QR/copia e cola;
- simulacao de funding;
- comparacao de saldo antes/depois.

Valor estrategico:

```text
Pix e a ponte natural de entrada para usuarios brasileiros.
```

### Quote e rota BRL -> USD

Ja existe:

- quote BRL -> USD;
- quote BRL -> USDC;
- estimativa de taxas;
- quote expiration;
- retry quando quote expira;
- rota mais otimizada como linguagem de produto.

Valor estrategico:

```text
O usuario nao escolhe trilho tecnico. Ele escolhe valor e destino; o sistema escolhe rota.
```

### Transfer lifecycle e reconciliacao

Ja existe infraestrutura para:

- `QUOTE_CREATED`;
- `PIX_PENDING`;
- `PIX_RECEIVED`;
- `BRL_TO_USDC_PENDING`;
- `USDC_SETTLEMENT_PENDING`;
- `USDC_SETTLED`;
- `PAYOUT_INSTRUCTION_CREATED`;
- `PAYOUT_PENDING`;
- `PAYOUT_COMPLETED`;
- `FAILED`;
- `REFUNDED`.

Tambem existe endpoint de reconciliacao ligando:

- quote;
- Pix;
- Stellar transaction hash/memo;
- payout instruction;
- provider payout id;
- status final.

Valor estrategico:

```text
O produto nao e apenas uma tela bonita. Ele cria rastro operacional auditavel.
```

### Payout adapters

Ja existe estrutura para:

- mock USD payout adapter;
- Etherfuse off-ramp proof;
- Circle compatibility adapter;
- Bridge compatibility adapter.

Valor estrategico:

```text
O backend nao fica preso a um unico provedor. Ele pode trocar ou combinar parceiros de payout conforme custo, pais, disponibilidade e compliance.
```

### Interface institucional

Ja existe:

- `/institution-settlement`;
- `/global-transfer`;
- logs de API;
- stream de execucao;
- quote;
- funding;
- blockchain evidence;
- destination instruction;
- metricas;
- delta entre valor inicial e final.

Valor estrategico:

```text
O produto consegue ser demonstrado para usuario final e tambem para avaliador tecnico/institucional.
```

## 9. Pilares estrategicos

### Pilar 1 - Familiaridade

O usuario nao precisa baixar app novo nem aprender interface financeira complexa.

Entrada natural:

- WhatsApp;
- Telegram;
- web chat.

Promessa:

```text
Se voce sabe mandar mensagem, consegue iniciar uma operacao.
```

### Pilar 2 - Economia transparente

O produto deve mostrar:

- quanto o usuario paga;
- quanto recebe;
- taxa da plataforma;
- taxa do provedor;
- validade da cotacao;
- status de execucao.

Promessa:

```text
O usuario ve o custo antes de confirmar.
```

### Pilar 3 - Liberdade de destino

O usuario nao precisa manter tudo dentro da TalkToStellar.

Destinos possiveis:

- conta USD internacional propria;
- conta global de terceiros, quando permitido por regras do parceiro;
- conta de empresa;
- provider compativel com ACH/wire/local USD rails;
- destino salvo no produto.

Promessa:

```text
TalkToStellar converte e roteia. O usuario escolhe onde quer receber.
```

### Pilar 4 - Rastreabilidade

Cada operacao deve ter:

- quote;
- referencia Pix;
- status lifecycle;
- memo/reference;
- evidence de settlement;
- payout instruction id;
- comprovante;
- reconciliation output.

Promessa:

```text
Toda operacao tem trilha de auditoria.
```

### Pilar 5 - Repeticao facil

O primeiro envio pode exigir dados. O segundo deve ser muito mais rapido.

Funcionalidades de retencao:

- contatos salvos;
- destinos favoritos;
- historico;
- comprovantes;
- comandos recorrentes;
- sugestoes do bot;
- memoria financeira;
- alertas e insights futuros.

Promessa:

```text
Depois que o destino esta salvo, enviar de novo vira um comando simples.
```

## 10. Publicos-alvo

### Investidores individuais

Perfil:

- dolarizam patrimonio;
- compram ativos internacionais;
- usam conta global;
- fazem aportes recorrentes.

Dor:

- spread alto;
- pouca transparencia;
- retrabalho mensal.

Mensagem:

```text
Converta reais em dolares com uma rota mais eficiente e envie para sua conta internacional.
```

### Profissionais e freelancers

Perfil:

- pagam ou recebem do exterior;
- usam ferramentas globais;
- precisam manter saldo em USD.

Dor:

- conversao manual;
- taxas pequenas que acumulam;
- dificuldade de organizar comprovantes.

Mensagem:

```text
Mova BRL para USD e acompanhe tudo pelo chat.
```

### Viajantes

Perfil:

- querem abastecer conta global antes de viajar;
- buscam previsibilidade de custo.

Dor:

- cotacao ruim em bancos/cartoes;
- IOF e tarifas pouco claras;
- medo de ficar sem saldo.

Mensagem:

```text
Planeje quanto quer colocar em dolares e veja o custo antes de pagar por Pix.
```

### Pequenas empresas e startups

Perfil:

- pagam SaaS, fornecedores, agencias, freelancers e servicos internacionais;
- podem ter conta internacional propria.

Dor:

- reconciliacao;
- custo de cambio;
- comprovantes;
- processos manuais.

Mensagem:

```text
Use Pix para iniciar a operacao, Stellar para settlement e um adapter de payout para coordenar entrega em USD.
```

### Plataformas e fintechs

Perfil:

- querem oferecer conversao/settlement sem criar todo o trilho do zero;
- precisam de API, logs e reconciliacao.

Dor:

- integracao Pix;
- FX;
- stablecoin settlement;
- payout provider orchestration;
- compliance hooks.

Mensagem:

```text
TalkToStellar pode operar como camada de infraestrutura para BRL -> USD routing.
```

## 11. Diferenciais competitivos

### Diferencial 1 - Conversa como interface

A maioria dos produtos financeiros exige que o usuario entenda a interface do app.

TalkToStellar inverte isso:

```text
O usuario descreve a intencao. O sistema estrutura a operacao.
```

### Diferencial 2 - Stellar invisivel

O produto usa Stellar para liquidacao, mas nao obriga o usuario a entender Stellar.

Isso permite:

- settlement rapido;
- baixo custo de rede;
- prova tecnica;
- composability;
- caminho para anchors e SEPs;
- futura interoperabilidade.

### Diferencial 3 - Pix como funding natural

No Brasil, Pix e o comportamento financeiro mais familiar.

Usar Pix como entrada reduz friccao e melhora conversao de usuario.

### Diferencial 4 - Provider-agnostic payout

O backend nao deve depender de um unico off-ramp.

Adapters permitem:

- mock para demo;
- Etherfuse proof;
- Circle compatibility;
- Bridge compatibility;
- outros provedores futuros.

### Diferencial 5 - Reconciliacao desde o MVP

Muitos prototipos mostram pagamento, mas nao mostram rastro operacional.

TalkToStellar ja caminha para:

- lifecycle states;
- reconciliation endpoint;
- logs;
- evidence;
- metricas de delta;
- suporte a auditoria.

## 12. Estrategia de entrada: wedge strategy

O wedge e simples:

```text
Resolver uma dor especifica e frequente: converter BRL em USD com menor custo e entregar no destino internacional favorito do usuario.
```

Esse wedge e forte porque:

- o usuario ja tem a demanda;
- o produto nao precisa convencer a pessoa a trocar de banco;
- a economia e uma dor facil de entender;
- o Pix torna a entrada familiar;
- o chat reduz barreira de uso;
- destinos salvos criam recorrencia.

### Fase 1 - Rota mais barata e simples

Objetivo:

- provar economia;
- provar UX conversacional;
- provar Pix -> Stellar -> payout instruction;
- ganhar usuarios por custo e facilidade.

Produto:

- chat;
- Pix;
- quote;
- conversao;
- comprovante;
- destino salvo;
- historico.

### Fase 2 - Infraestrutura B2B

Objetivo:

- transformar a rota em API e painel operacional;
- atender empresas;
- integrar provedores regulados;
- melhorar reconciliacao.

Produto:

- transfer lifecycle engine;
- payout adapter interface;
- reconciliation endpoint;
- same-name checks;
- logs de operacao;
- painel institucional.

### Fase 3 - Produtos financeiros proprios

Objetivo:

- depois de ter confianca, volume e destinos salvos, oferecer produtos nativos.

Possibilidades futuras:

- saldo global dentro da TalkToStellar;
- conta USD nativa via parceiro;
- rendimento em USDC com estruturas adequadas;
- pagamentos recorrentes;
- API para empresas;
- treasury tools;
- dashboard de economia acumulada;
- multi-corridor expansion.

## 13. Como o produto retem usuarios

Economia traz o usuario. Conveniencia faz o usuario voltar.

Mecanismos de retencao:

- destinos salvos;
- contatos favoritos;
- historico;
- comprovantes;
- cotacoes recorrentes;
- comandos naturais;
- "repetir ultima operacao";
- alertas de cotacao;
- resumo mensal de economia;
- fluxo de Pix mais rapido para usuarios recorrentes.

Exemplo:

```text
Primeiro uso:
"Enviar 500 dolares para minha conta internacional"

Segundo uso:
"manda mais 500 pra minha conta dos EUA"
```

O segundo comando so funciona bem porque o produto lembra destino, contexto e preferencias.

## 14. Transparencia de custos

O produto deve sempre separar:

- valor em BRL pago;
- cotacao usada;
- USD/USDC estimado;
- taxa da plataforma;
- taxa do provedor;
- custo de liquidez/spread;
- taxa de rede;
- valor liquido esperado;
- validade da cotacao.

Modelo de comunicacao:

```text
Voce paga: R$ 1.000,00
Cotacao usada: R$ 5,60 por US$
Taxas estimadas: R$ X
Destino recebe: US$ Y
Valido ate: 14:35
```

Isso evita a sensacao de spread escondido.

## 15. Posicionamento de compliance

TalkToStellar deve ser claro:

```text
O objetivo e reduzir ineficiencia operacional, nao evitar regulacao.
```

Pontos obrigatorios para producao:

- parceiro Pix adequado;
- parceiro de cambio/regulado quando necessario;
- KYC/KYB;
- AML/PLD-FT;
- sanctions screening;
- source of funds;
- same-name payout checks;
- politica de limites;
- logs e auditoria;
- tratamento fiscal/IOF conforme natureza da operacao;
- contratos com off-ramp/payout providers.

Na demo atual:

- Pix pode estar sandboxado;
- payout bancario pode estar mockado;
- Stellar pode estar em testnet;
- mainnet deve ser apenas validacao pequena quando explicitamente habilitada;
- nao ha claim de operacao financeira real em producao.

## 16. Same-name payout como ponto estrategico

Um problema real em entregas para contas internacionais e a origem aparente dos fundos.

Contas internacionais podem rejeitar ou revisar entradas que parecam vir de terceiros, pools corporativos ou provedores cripto sem alinhamento claro de identidade.

Por isso, a infraestrutura deve rastrear:

- nome legal do remetente;
- nome legal do destinatario;
- titular da conta destino;
- entidade/instituicao de origem;
- match status;
- notas de risco.

Isso nao bloqueia tudo automaticamente, mas permite:

- marcar revisao;
- escolher rota adequada;
- evitar destinos de risco;
- preparar compliance futuro.

## 17. O que torna a tese defensavel

TalkToStellar nao depende de apenas uma tela bonita. A defesa do produto vem da combinacao:

- canal conversacional;
- Pix;
- Stellar settlement;
- quote/pathfinding;
- destinos salvos;
- adapters de payout;
- reconciliacao;
- comprovantes;
- historico;
- UX simples;
- infraestrutura auditavel.

Cada camada isolada pode ser copiada. A combinacao operacional e mais dificil.

## 18. Narrativa para investidores, grants e avaliadores

### Versao curta

TalkToStellar transforma conversao BRL -> USD em uma conversa. O usuario paga por Pix, a infraestrutura liquida via Stellar e o sistema prepara a entrega em USD para uma conta internacional existente.

### Versao media

O produto nao tenta substituir bancos globais. Ele atua como a rota anterior: uma camada de conversao e settlement que reduz custo, melhora transparencia e gera rastro operacional. A experiencia acontece em WhatsApp, Telegram ou web chat; a infraestrutura usa Pix, Stellar, adapters de payout e reconciliacao.

### Versao tecnica

TalkToStellar esta construindo um transfer routing engine para o corredor BRL -> USD. A arquitetura inclui quote service, Pix/Etherfuse funding wrapper, Stellar USDC settlement evidence, payout provider adapter interface, same-name identity alignment e reconciliation endpoint. O objetivo do MVP e provar uma rota institucional entre funding em BRL, settlement em Stellar e instrucao de entrega em USD, mantendo a experiencia final conversacional.

## 19. Como explicar o produto sem confundir

Evite:

```text
"Somos uma Wise melhor."
"Fazemos remessa internacional real em producao."
"Fugimos de IOF."
"Tudo ja esta em mainnet."
"O usuario usa blockchain."
```

Use:

```text
"Somos a rota de conversao antes da conta internacional."
"Usamos Pix e Stellar para reduzir friccao e custo operacional."
"O usuario conversa; a infraestrutura executa."
"A entrega bancaria real depende de parceiros regulados."
"A demo mostra sandbox/testnet e adapters integration-ready."
```

## 20. Mapa de capacidades

| Capacidade | Estado atual | Valor estrategico |
|---|---|---|
| WhatsApp/Evolution | Implementado/integrado | Canal familiar de entrada |
| Telegram | Implementado | Canal de demo e uso rapido |
| Web chat | Implementado | Fallback e experiencia controlada |
| Conta/PIN | Implementado | Confirmacao previsivel |
| Passkey | Implementado, deve ser opcional | UX segura futura |
| Stellar wallet | Implementado | Base de liquidacao |
| Stellar pathfinding/conversion | Implementado/parcial por ambiente | Otimizacao de rota |
| Pix/Etherfuse sandbox | Implementado | Funding BRL demonstravel |
| Pix off-ramp sandbox | Implementado/parcial | Saida PIX demonstravel |
| BRL -> USD quote | Implementado | Base do produto internacional |
| Transfer state machine | Implementado | Controle operacional |
| Payout adapters | Implementado como mock/compatibilidade | Provider-agnostic infra |
| Reconciliation endpoint | Implementado | Auditoria e suporte |
| Institution UI | Implementado | Demo tecnica B2B |
| Production bank payout | Pendente de parceiro | Necessario para launch real |
| Regulated FX/compliance | Pendente de parceiro/legal | Necessario para producao |

## 21. Go-to-market inicial

### Nicho 1 - Usuarios com conta internacional existente

Mensagem:

```text
Converta com a gente e envie para sua conta internacional favorita.
```

Por que funciona:

- dor clara;
- comparacao facil de custo;
- usuario ja entende o destino.

### Nicho 2 - Empresas pequenas com pagamentos internacionais

Mensagem:

```text
Reduza custo e melhore reconciliacao em pagamentos USD.
```

Por que funciona:

- volume recorrente;
- necessidade de comprovante;
- tolerancia maior a onboarding/KYB.

### Nicho 3 - Fintechs e plataformas

Mensagem:

```text
Adicione uma rota BRL -> USD com Pix, Stellar settlement e payout adapters sem construir tudo do zero.
```

Por que funciona:

- venda B2B;
- uso de API;
- menos foco em UX final, mais em infra.

## 22. Roadmap estrategico

### Agora

- consolidar demo de usuario;
- melhorar UX de PIX, pagamento e receipt;
- manter Stellar/testnet seguro;
- fortalecer painel institucional;
- documentar o que e real vs sandbox;
- melhorar error handling.

### Proximo

- integrar sandbox real de payout provider;
- testar mainnet pequeno com limites;
- criar API B2B;
- melhorar KYC/KYB hooks;
- expandir reconciliacao;
- criar demo de operador.

### Depois

- fechar parceiro regulado;
- piloto com empresa;
- corridor BRL -> USD em producao controlada;
- produtos nativos de saldo/conta;
- multi-corridor expansion.

## 23. Riscos e mitigacoes

| Risco | Mitigacao |
|---|---|
| Overclaim regulatorio | Documentar sempre sandbox/testnet e dependencia de parceiros |
| Provider lock-in | Usar payout adapter interface |
| Rejeicao em contas destino | Implementar same-name checks e risk notes |
| UX tecnica demais | Separar user mode, demo mode e ops mode |
| Passkey instavel em demo | PIN-first e passkey opcional |
| Falha de Pix sandbox | Mostrar estado de fallback e guide de env/migrations |
| Spread nao competitivo | Medir delta, custos e comparar com rota tradicional |
| Falta de confianca | Historico, receipt, reconciliacao e status lifecycle |

## 24. Mensagem final

TalkToStellar deve ser entendido como um produto de entrada estrategica:

```text
Primeiro, ajuda o usuario a economizar ao converter e enviar dolares para destinos que ele ja usa.
Depois, transforma essa recorrencia em confianca.
Com confianca e volume, pode expandir para produtos financeiros nativos.
```

A forca do produto esta em unir:

- conversa;
- Pix;
- Stellar;
- roteamento;
- transparencia;
- destino livre;
- reconciliacao;
- experiencia simples.

Essa combinacao permite que TalkToStellar comece como a rota mais eficiente antes das contas internacionais e evolua para uma plataforma financeira propria quando a base de usuarios ja confiar no produto.
