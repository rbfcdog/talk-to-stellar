# TalkToStellar

TalkToStellar é um produto financeiro conversacional para converter reais em dólares digitais e movimentar valor usando Pix, Stellar e uma experiência simples por chat.

O usuário não precisa entender carteira cripto, issuer, trustline, XDR, pathfinding, anchor ou blockchain. Ele conversa pelo WhatsApp, Telegram ou chat web, consulta saldo, simula custo, coloca dinheiro via Pix, envia para contatos, converte saldo, acompanha histórico e recebe comprovantes.

Em uma frase:

```text
TalkToStellar transforma Pix em uma rota conversacional de conversão BRL -> USD, usando Stellar como trilho de liquidação, transparência de taxas e evidência verificável.
```

## Produto Ao Vivo

| Superfície | Link |
| --- | --- |
| Landing page | https://talk-to-stellar-owxg.vercel.app |
| Chat web | https://talk-to-stellar-owxg.vercel.app/chat |
| Fluxo Pix | https://talk-to-stellar-owxg.vercel.app/pix-on |
| Histórico | https://talk-to-stellar-owxg.vercel.app/transactions |
| Console Stellar Mainnet | https://talk-to-stellar-owxg.vercel.app/mainnet |

O produto já demonstra experiência real de usuário, pagamentos e conversões em ambiente seguro de Testnet/sandbox, integração conversacional e uma camada Mainnet read-only para visualizar carteiras públicas da Stellar sem pedir secret key.

Movimentação real irrestrita em Mainnet permanece bloqueada por design até existirem signer seguro, limites, aprovação operacional, compliance e parceiros regulados.

## Resumo Executivo

O Brasil tem uma das melhores infraestruturas de pagamento doméstico do mundo com o Pix. Mesmo assim, converter BRL em USD e entregar esse valor em contas internacionais ainda é caro, fragmentado e pouco transparente.

O usuário muitas vezes já tem um destino preferido para dólares: Wise, conta global, banco internacional, corretora, conta de investimento, conta empresarial ou outro provedor. O TalkToStellar não precisa substituir esses destinos.

A tese é mais direta:

```text
Ser a rota mais barata, simples e transparente antes do dinheiro chegar ao destino escolhido pelo usuário.
```

TalkToStellar combina:

- Pix como entrada familiar em BRL;
- Stellar como camada de liquidação e evidência;
- USDC/dólar digital como infraestrutura de valor em USD;
- WhatsApp, Telegram e web chat como interface;
- taxas e economia visíveis como gatilho de conversão.

O usuário pede:

```text
"quanto custa enviar 5000 reais?"
"quero mandar 100 dólares para Ana"
"saldo"
"quanto eu economizei esse ano?"
```

O sistema responde com cotação, taxa, economia frente a métodos tradicionais, link de confirmação e comprovante com evidência Stellar quando aplicável.

## Problema

Mover dinheiro do Brasil para valor em dólar ainda exige etapas demais.

O problema não é só a conta final. O problema é o caminho até o dinheiro chegar lá:

- bancos escondem custo em spread cambial;
- usuários comparam cotações manualmente;
- Pix, câmbio, stablecoins, conta global, comprovante e suporte ficam separados;
- produtos cripto exigem conhecimento técnico;
- o usuário raramente sabe a taxa real paga;
- pequenas empresas não têm uma camada programável simples para BRL -> USD.

No fundo, a intenção do usuário é simples:

```text
"Tenho reais e quero dólares utilizáveis em outro lugar."
```

## Solução

TalkToStellar é uma camada conversacional de conversão e movimentação BRL -> USD.

O usuário não opera uma carteira manualmente. O produto traduz linguagem natural em fluxo financeiro guiado:

```text
Usuário envia uma mensagem
-> TalkToStellar entende a intenção
-> backend calcula cotação e taxas
-> usuário financia ou confirma com Pix/PIN
-> valor é liquidado ou evidenciado via Stellar
-> comprovante volta no mesmo canal de conversa
```

O foco do produto é deixar o valor financeiro óbvio:

- quanto o usuário envia;
- quanto chega;
- qual taxa foi paga;
- quanto um método tradicional cobraria;
- quanto o usuário economizou;
- onde a transação pode ser verificada.

Isso posiciona o TalkToStellar como produto de pagamento, conversão e confiança.

## Experiência Do Produto

### Entrada Por Conversa

O usuário começa pelo WhatsApp, Telegram ou chat web.

- Links assinados para onboarding e confirmação.
- Validação de expiração e payload dos tokens.
- Confirmação de pagamento protegida por PIN.
- Reset de PIN com token temporário e invalidação de uso.
- Logs de auditoria para eventos críticos.
- `POST /api/agent/query` exige `x-agent-ingest-secret` quando `source` é `telegram` ou `whatsapp`. Prefira `AGENT_INGEST_SECRET` com o mesmo valor em backend e adapters. Para compatibilidade, o backend e o Telegram tambem aceitam `INTERNAL_API_SECRET` ou `TELEGRAM_NOTIFY_SECRET` como fallback resolvido; sem um segredo compartilhado, o backend recusa a requisicao.

```text
saldo
contatos
quanto custa enviar 5000 reais?
quero mandar 100 dólares para Ana
quero colocar 100 reais via Pix
quero retirar 50 reais para meu Pix
quanto eu economizei esse ano?
```

A linguagem é financeira e familiar, não cripto. O produto fala em saldo, Pix, dólares, contatos, taxas, histórico, comprovante e economia.

### Pix Como Porta De Entrada

Pix é o ponto de entrada natural para usuários brasileiros.

O produto prepara o fluxo Pix, mostra a taxa, guia a confirmação, atualiza o estado da operação e entrega o comprovante. Em sandbox/Testnet, isso demonstra o modelo operacional com segurança. Em produção, essa camada deve ser conectada a parceiros Pix/FX regulados.

### Pagamento Para Contatos Salvos

O produto exige clareza de destinatário.

Se o usuário pede para pagar Ana, Ana precisa ser um contato salvo real na conta dele. Isso reduz erro operacional e cria uma experiência mais próxima de banco:

- valida contato salvo;
- valida destino;
- valida valor;
- mostra taxa;
- pede confirmação;
- registra comprovante.

### Taxas E Economia Como Parte Do Produto

O TalkToStellar não deve esconder a taxa no número final.

A experiência é construída em torno de uma mensagem simples:

```text
Você pagou esta taxa.
Um banco tradicional cobraria isso.
Você economizou isso.
```

Esse conceito aparece em:

- simulações de custo;
- telas Pix;
- previews de conversão;
- comprovantes;
- resumos de economia;
- contexto de saldo.

O objetivo é fazer a economia aparecer toda vez que o usuário interage com dinheiro.

### Comprovante Com Evidência

Depois de pagamento ou conversão, o usuário recebe um comprovante no mesmo canal.

O comprovante pode incluir:

- horário da operação;
- destinatário;
- valor enviado;
- valor entregue;
- taxa paga;
- economia estimada;
- hash Stellar quando houver;
- link de histórico;
- link de comprovante.

Para o usuário, parece um comprovante financeiro simples. Para o avaliador técnico, existe evidência verificável por trás.

## Por Que Stellar

Stellar faz sentido porque o problema aqui não é especulação. É liquidação, interoperabilidade, baixo custo e rastreabilidade.

TalkToStellar usa Stellar como infraestrutura:

- liquidação rápida;
- custo de rede baixo;
- suporte a stablecoins;
- evidência pública de transação;
- Testnet para desenvolvimento seguro;
- preparação para Mainnet com leitura de carteiras públicas e execução futura controlada.

O produto não vende "cripto" para o usuário. Ele vende economia, clareza e conveniência. Stellar fica nos bastidores como o trilho que permite essa experiência.

## Mercado

Públicos iniciais:

- brasileiros que dolarizam patrimônio;
- viajantes que abastecem contas globais;
- freelancers que pagam ou recebem serviços internacionais;
- startups e pequenas empresas com necessidade de USD;
- fintechs que precisam de uma camada Pix -> USD programável;
- usuários que já têm Wise, Revolut, Mercury, corretora ou banco internacional.

A estratégia não é competir de frente com contas globais.

A estratégia é se tornar a rota de conversão que o usuário confia antes de enviar para essas contas.

## Modelo De Negócio

Possíveis receitas:

- taxa transparente por conversão;
- fee de Pix on-ramp/off-ramp;
- fee por transferência B2B;
- API/SaaS para empresas;
- reconciliação e relatórios premium;
- receita com parceiros regulados de off-ramp/payout;
- produtos financeiros próprios depois que houver confiança e volume.

O produto deve ganhar pela economia entregue ao usuário, não por margem escondida em câmbio confuso.

## Estratégia De Entrada

A primeira promessa é simples:

```text
Converta mais barato e envie para o destino que você já usa.
```

Isso cria confiança e volume transacional.

Depois que o usuário reconhece o TalkToStellar como a rota mais barata e prática para sair de BRL para USD, o produto pode expandir para:

- destinos internacionais salvos;
- fluxos B2B;
- liquidação entre instituições;
- tesouraria e reconciliação;
- produtos financeiros nativos dentro do ecossistema TalkToStellar.

A entrada é economia. A oportunidade de longo prazo é controle do fluxo financeiro.

## Produto Construído Até Agora

O projeto já inclui:

- landing page ao vivo;
- chat web;
- integração com WhatsApp via Evolution API;
- integração com Telegram;
- onboarding por link;
- confirmação por PIN;
- contatos salvos;
- links de confirmação de pagamento;
- fluxo Pix on-ramp/off-ramp;
- UX orientada a taxas e economia;
- histórico de transações;
- geração de comprovantes;
- infraestrutura Stellar Testnet;
- console Stellar Mainnet read-only;
- protótipo de roteamento institucional BRL -> USD;
- arquitetura de payout adapters;
- modelos de reconciliação e evidência de settlement;
- documentação de demo, deploy, taxas, segurança e Mainnet readiness.

Isso não é apenas uma landing page. O repositório contém produto full-stack, integração conversacional e infraestrutura de liquidação em evolução.

## Arquitetura Em Alto Nível

```text
WhatsApp / Telegram / Web
        |
        v
Agente conversacional
        |
        v
Ferramentas de cotação, taxa, contato, Pix e pagamento
        |
        v
Backend de orquestração e estado transacional
        |
        v
Stellar settlement / evidência / recibos
        |
        v
Histórico, reconciliação e notificações
```

Componentes principais:

- `frontend/`: interface Next.js;
- `backend/`: API TypeScript, agente, Stellar services, Pix adapters e fee services;
- `telegram/`: adaptador Telegram;
- `evolution/`: suporte a WhatsApp/Evolution;
- `docs/`: guias de demo, deploy, segurança, UX, taxas e Mainnet.

## Posição Atual De Mainnet

O produto possui uma superfície Mainnet ao vivo:

```text
https://talk-to-stellar-owxg.vercel.app/mainnet
```

Estado atual:

- o usuário pode anexar uma chave pública Stellar Mainnet;
- o app consulta saldos e operações públicas;
- secret keys nunca são solicitadas;
- pagamentos Mainnet ficam desativados até existir signer, limites, aprovação manual, compliance e operação com parceiros.

Esse é o estágio correto para demonstrar preparação Mainnet sem assumir risco prematuro de movimentar valor real.

## Realidade Regulatória E Operacional

TalkToStellar não deve ser apresentado como banco, instituição de pagamento licenciada ou operação de remessa internacional pronta para escala sem parceiros adequados.

O caminho de produção exige:

- parceiro Pix/FX regulado;
- KYC/KYB;
- screening de sanções;
- monitoramento transacional;
- revisão de IOF e tratamento tributário;
- provedor de payout/off-ramp;
- limites e revisão manual;
- signer seguro e controles de tesouraria;
- revisão jurídica e compliance.

O framing correto hoje é:

```text
Produto vivo e infraestrutura em validação para conversão conversacional BRL -> USD usando Stellar.
```

## Roadmap

### Fase 1 - Validação De Produto

- melhorar UX WhatsApp-first;
- fortalecer fluxos Pix;
- tornar economia visível em toda interação;
- validar usuários reais com leitura de carteiras públicas Mainnet;
- coletar feedback sobre intenção de conversão e confiança no comprovante.

### Fase 2 - Piloto Com Parceiros

- integrar parceiro Pix/FX/off-ramp regulado;
- habilitar fluxos controlados de baixo valor;
- adicionar checks de compliance;
- expandir reconciliação e painel operacional;
- suportar usuários empresariais e destinos internacionais salvos.

### Fase 3 - Infraestrutura De Liquidação

- roteamento entre instituições;
- payout provider adapters;
- instruções de entrega USD;
- controles de tesouraria;
- API para empresas.

### Fase 4 - Ecossistema Financeiro Próprio

- reter mais valor dentro do TalkToStellar;
- lançar controles de conta próprios;
- ampliar produtos B2B;
- explorar produtos financeiros nativos em Stellar.

## Tese Para Investidor

TalkToStellar combina três comportamentos fortes:

1. Brasileiros já usam Pix todos os dias.
2. Usuários e empresas querem cada vez mais exposição e uso de dólares.
3. Interfaces conversacionais reduzem fricção em ações financeiras.

A tese de produto é prática: reduzir fricção de conversão e mostrar economia de forma clara.

A tese de infraestrutura é mais profunda: usar Stellar como trilho de liquidação e evidência por trás de uma experiência familiar de chat.

Se o TalkToStellar ganhar confiança como a forma mais simples e barata de sair de BRL para USD, pode evoluir de "rota de conversão" para "camada operacional financeira" para pessoas e empresas.

## Como Rodar Localmente

Subida local:

```bash
chmod +x start-local.sh
./start-local.sh
```

URLs locais:

```text
Frontend: http://localhost:3000
Backend:  http://localhost:3001
```

Build backend:

```bash
cd backend
npm run build
```

Build frontend:

```bash
cd frontend
npm run build
```

Evals do agente:

```bash
cd backend
npm run eval:agent
```

## Apêndice De Negócio E Tecnologia

Esta seção resume o projeto de um ponto de vista mais operacional: qual negócio o produto quer ser, quais fluxos já existem, como o sistema é montado e quais decisões precisam estar claras antes de produção.

### Proposta Comercial

TalkToStellar é uma camada de conversão, pagamento e evidência para usuários que começam em BRL e precisam chegar a USD, Pix, contatos ou uma public key externa sem operar infraestrutura cripto diretamente.

O produto captura valor em três momentos:

- antes da operação, mostrando cotação, taxa, destino e economia estimada;
- durante a operação, reduzindo fricção com chat, links curtos, PIN e telas de revisão;
- depois da operação, entregando histórico, comprovante e rastreabilidade.

O diferencial não é apenas "usar Stellar". O diferencial é esconder a complexidade certa e revelar a informação financeira que importa: quanto sai, quanto chega, qual taxa foi paga e onde a operação pode ser auditada.

### Personas Prioritárias

| Persona | Dor principal | Valor entregue |
| --- | --- | --- |
| Usuário pessoa física | Converter BRL para USD sem comparar várias plataformas | Cotação clara, Pix, saldo, histórico e comprovante |
| Freelancer ou creator | Receber/pagar em dólar com menos fricção | Fluxo conversacional, contatos e confirmação segura |
| Pequena empresa | Reconciliar pagamentos e conversões recorrentes | Histórico, evidência e relatório operacional |
| Produto fintech/API | Adicionar rota Pix -> USD sem construir tudo do zero | Backend modular, adapters e endpoints reaproveitáveis |

### Fluxos Centrais Do Produto

1. **Conta e sessão**
   O usuário entra por chat, link ou web. O backend cria ou recupera sessão, carteira e estado de conversa. A sessão é protegida por token, cookies HttpOnly no frontend e validações no backend.

2. **Saldo e histórico**
   A experiência mostra saldos em linguagem simples e consulta histórico consolidado a partir de operações, logs de pagamento e comprovantes.

3. **Pix on-ramp**
   O usuário coloca reais por Pix. O sistema cria a intenção, acompanha status, atualiza saldo e mantém a experiência separada de detalhes técnicos do provedor.

4. **Conversão**
   O usuário escolhe origem, destino e valor. A tela de conversão pede rota real ao backend, mostra estimativa e só depois libera confirmação.

5. **Pagamento para contato**
   O usuário escolhe um contato salvo, revisa valor e destino, confirma com PIN e recebe comprovante. Isso evita envio para destinatários ambíguos.

6. **Envio externo**
   O usuário envia para uma public key externa em uma tela dedicada. A interface valida chave, saldo, destino e PIN antes de submeter.

7. **Pix off-ramp**
   O usuário informa uma chave Pix e revisa quanto sai do saldo e quanto chega em reais. Se faltar saldo, a tela deve oferecer conversão ou complemento por Pix.

### Arquitetura Técnica

O sistema é dividido em superfícies de experiência, orquestração financeira e infraestrutura de integração.

| Camada | Responsabilidade | Diretórios principais |
| --- | --- | --- |
| Frontend | Telas web, confirmação, Pix, conversão, histórico, conta e UX de chat | `frontend/app`, `frontend/components`, `frontend/lib` |
| Agente | Interpretação de intenção, escolha de tools e resposta conversacional | `backend/src/api/agent` |
| Backend API | Sessão, carteira, pagamentos, conversão, Pix, recibos e auditoria | `backend/src/api` |
| Stellar | XDR, assinatura, submit, path payment, saldos e evidência | `backend/src/api/services/stellar.service.ts` |
| Provedores | Pix, WhatsApp, Telegram, e-mail, payout e integrações externas | `backend/src/integrations`, `telegram`, `evolution` |
| Dados | Estado de sessão, carteiras, operações, contatos, links e comprovantes | Supabase/Postgres via repositories |

Fluxo simplificado de uma operação:

```text
Mensagem ou tela web
-> normalização de intenção e parâmetros
-> criação de preview/cotação
-> revisão em página dedicada
-> PIN/passkey quando aplicável
-> execução backend
-> submit Stellar/provedor externo
-> log transacional
-> comprovante e resposta ao usuário
```

### Modelo De Dados Operacional

As principais entidades do produto são:

- `agent_sessions`: estado de sessão, usuário, canal e token;
- `wallets`: carteira Stellar vinculada à sessão/usuário;
- `contacts`: destinatários salvos e chaves de entrega;
- `operations`: operações financeiras internas e status;
- `payment_logs`: pagamentos, conversões, hashes e metadados de execução;
- `payment_confirmations`: links de confirmação de uso único;
- `short_links`: links públicos curtos com expiração;
- `activity_feed`: histórico amigável para a interface;
- `user_passkeys` e `passkey_challenges`: credenciais e desafios WebAuthn quando habilitados.

Na prática, `operations` é a camada de controle operacional e `payment_logs` é a camada de evidência de pagamentos/conversões. As telas devem preferir dados consolidados e nunca expor erros crus do banco.

### Segurança E Controles

Controles já tratados ou previstos no desenho:

- links assinados e expiráveis para onboarding, login e confirmação;
- PIN obrigatório para confirmação sensível;
- passkey/WebAuthn como caminho de autenticação forte;
- cookies HttpOnly para sessão web;
- `x-agent-ingest-secret` para proteger ingestão vinda de WhatsApp/Telegram;
- idempotency key em operações mutáveis;
- logs de auditoria para eventos críticos;
- mensagens públicas sanitizadas para não expor schema, constraint ou stack trace;
- Mainnet em modo read-only até existir signer e operação aprovada.

### Integrações Externas

| Integração | Uso atual | Observação |
| --- | --- | --- |
| Stellar SDK/Horizon | Conta, saldo, XDR, submit e histórico público | Testnet para execução; Mainnet read-only |
| Supabase | Banco operacional, sessão, carteiras e logs | Precisa migrations aplicadas fora do startup |
| Evolution API | WhatsApp | Requer instância e secrets alinhados |
| Telegram/Telegraf | Bot Telegram | Token inválido gera `401 Unauthorized` no startup |
| Etherfuse sandbox | Pix/on-ramp/off-ramp e assets sandbox | Produção exige parceiro e enquadramento regulatório |
| SendGrid/e-mail | Confirmações e recuperação | Opcional conforme fluxo habilitado |

### Critérios De Produção

Antes de tratar o produto como operação financeira em produção, estes pontos precisam estar fechados:

- parceiro Pix/FX/off-ramp regulado e contrato operacional;
- KYC/KYB e screening adequados ao país do usuário;
- limites por usuário, operação, dia e destino;
- rotina de monitoramento, alerta e revisão manual;
- reconciliação entre banco, provedor, Stellar e banco de dados;
- política de chargeback/refund/erro operacional;
- signer seguro, segregação de chaves e plano de recuperação;
- termos, política de privacidade e disclosure de risco;
- observabilidade com correlação entre `request_id`, sessão, operação e hash.

### Métricas Que Importam

Métricas de negócio:

- volume convertido;
- número de usuários ativos por canal;
- taxa de conclusão de Pix, conversão e pagamento;
- economia estimada entregue ao usuário;
- receita por operação;
- recorrência por usuário.

Métricas técnicas:

- erro por fluxo e por provedor;
- tempo de cotação;
- tempo até confirmação;
- tempo até submit/settlement;
- falhas de idempotência;
- divergência de saldo;
- taxa de links expirados ou usados duas vezes.

### O Que Este Repo Não Deve Prometer Ainda

Este repositório não deve ser apresentado como:

- banco;
- conta global regulada pronta;
- remessa internacional irrestrita;
- custodiante Mainnet sem controles adicionais;
- substituto de compliance, KYC, parceiro Pix/FX ou parecer jurídico.

O posicionamento correto é: produto full-stack vivo, com UX real e infraestrutura de conversão/pagamento em validação, pronto para evoluir para piloto regulado com parceiros.

## Resumo

TalkToStellar está construindo uma rota conversacional BRL -> USD para o Brasil.

O produto não pede que o usuário vire especialista em cripto. Ele usa canais familiares, Pix, contatos, taxas transparentes e comprovantes, enquanto Stellar fornece liquidação, baixo custo e evidência verificável nos bastidores.

A oportunidade de curto prazo é conversão mais barata. A oportunidade de longo prazo é se tornar a camada de fluxo financeiro para pessoas e empresas que transitam entre reais e dólares.
