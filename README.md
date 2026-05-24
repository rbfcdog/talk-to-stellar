# TalkToStellar

TalkToStellar e um produto financeiro conversacional para converter e movimentar valor entre BRL e USD usando Pix, Stellar e uma experiencia simples por chat.

O usuario nao precisa entender carteira, issuer, trustline, XDR, pathfinding, anchor ou rede blockchain. Ele conversa no WhatsApp, Telegram ou web chat, pede saldo, simula custo, coloca dinheiro via Pix, envia para contatos salvos, converte saldo, acompanha historico e recebe comprovantes.

Em uma frase:

```text
TalkToStellar transforma Pix em uma rota conversacional de conversao BRL -> USD, usando Stellar como infraestrutura de liquidacao e evidencia.
```

## Produto ao vivo

| Item | Link |
| --- | --- |
| Landing page | https://talk-to-stellar-owxg.vercel.app |
| Chat web | https://talk-to-stellar-owxg.vercel.app/chat |
| URL do produto ao vivo na Stellar Mainnet | https://talk-to-stellar-owxg.vercel.app/mainnet |
| Fluxo Pix | https://talk-to-stellar-owxg.vercel.app/pix-on |
| Historico | https://talk-to-stellar-owxg.vercel.app/transactions |

### Estado Mainnet atual

O produto ja possui uma camada ao vivo para Stellar Mainnet em modo seguro:

- usuarios podem anexar uma chave publica Mainnet;
- o backend consulta saldo e operacoes publicas na Stellar Public Network;
- nenhuma seed, secret key ou chave privada e solicitada;
- envio Mainnet real permanece bloqueado por design ate signer, limites, aprovacao manual e compliance estarem configurados;
- Pix/Etherfuse permanece Testnet-only.

Isso significa que a URL Mainnet acima e adequada para demonstrar leitura real de carteiras Mainnet e preparacao de infraestrutura, mas nao deve ser apresentada como remessa ou pagamento Mainnet irrestrito.

## Materiais de apresentacao

| Material | Arquivo/link |
| --- | --- |
| Pitch deck inicial de 7 slides | [docs/PITCH_DECK_7_SLIDES_INITIAL.md](docs/PITCH_DECK_7_SLIDES_INITIAL.md) |
| Landing page | https://talk-to-stellar-owxg.vercel.app |
| README GitHub | este arquivo |
| Demo de usuarios | [docs/USER_DEMO_GUIDE.md](docs/USER_DEMO_GUIDE.md) |
| Demo tecnica de anchor/testnet | [docs/ANCHOR_TESTNET_VIDEO_WALKTHROUGH.md](docs/ANCHOR_TESTNET_VIDEO_WALKTHROUGH.md) |
| Guia de infraestrutura entre instituicoes | [docs/INSTITUTION_SETTLEMENT_INTERFACE_GUIDE.md](docs/INSTITUTION_SETTLEMENT_INTERFACE_GUIDE.md) |
| Estado atual de features para revisao | [docs/PROJECT_FEATURE_STATE_FOR_AI_REVIEW_20260523.md](docs/PROJECT_FEATURE_STATE_FOR_AI_REVIEW_20260523.md) |

## 5 usuarios reais na Mainnet

Para submissao de "5 usuarios reais na Mainnet", use apenas chaves publicas reais da Stellar Public Network. Nao invente chaves e nunca colete secret key.

Preencha esta tabela antes da submissao:

| Usuario | Tipo | Chave publica Mainnet | Evidencia | Status |
| --- | --- | --- | --- | --- |
| Usuario 1 | pessoa/empresa | `G...` | link Stellar Expert / screenshot / perfil | pendente |
| Usuario 2 | pessoa/empresa | `G...` | link Stellar Expert / screenshot / perfil | pendente |
| Usuario 3 | pessoa/empresa | `G...` | link Stellar Expert / screenshot / perfil | pendente |
| Usuario 4 | pessoa/empresa | `G...` | link Stellar Expert / screenshot / perfil | pendente |
| Usuario 5 | pessoa/empresa | `G...` | link Stellar Expert / screenshot / perfil | pendente |

Checklist para cada usuario:

- a chave comeca com `G`;
- a chave existe na Stellar Public Network;
- o usuario autorizou usar a chave publica como evidencia;
- nenhum segredo foi compartilhado;
- a chave pode ser aberta em Stellar Expert;
- a conta aparece no console `/mainnet` em modo read-only.

## Problema

O Brasil tem Pix, mas converter BRL em USD e entregar esse valor em uma conta internacional ainda e caro, fragmentado e pouco transparente.

Na pratica, usuarios e empresas sofrem com:

- spread escondido em bancos e provedores tradicionais;
- comparacao manual de cotacao;
- passos demais entre Pix, cambio, conta global e comprovante;
- pouca visibilidade de taxa real;
- baixa rastreabilidade depois que a operacao e concluida;
- interfaces cripto que exigem conhecimento tecnico.

Ao mesmo tempo, muitos usuarios ja possuem contas internacionais ou destinos preferidos, como Wise, Mercury, Revolut, bancos nos EUA ou contas globais. O problema nao e necessariamente criar outra conta internacional. O problema e transformar reais em dolares de forma simples, barata e rastreavel antes de entregar no destino escolhido.

## Solucao

TalkToStellar entra como o trilho anterior ao banco internacional:

```text
Usuario paga Pix em BRL
-> TalkToStellar gera cotacao e confirma funding
-> valor e convertido/liquidado como USDC via Stellar
-> backend registra evidencia de settlement
-> sistema prepara entrega/instrucao em USD
-> usuario acompanha pelo chat, historico e comprovante
```

O diferencial nao e pedir que o usuario use uma carteira cripto. O diferencial e esconder a complexidade tecnica atras de uma conversa:

```text
"quanto custa enviar 5000 reais?"
"saldo"
"contatos"
"quero mandar 100 dolares para Ana"
"quero colocar 100 reais via Pix"
"quanto eu economizei esse ano?"
```

O agente responde com numeros reais vindos do backend: cotacao, fee, economia, historico, hash Stellar e comprovante.

## Como funciona para o usuario

### 1. Entrada por chat

O usuario pode entrar por:

- WhatsApp via Evolution API;
- Telegram;
- chat web;
- links de confirmacao.

O chat entende linguagem natural em portugues e ingles, mas evita expor termos tecnicos. A experiencia fala em conta, saldo, Pix, contato, envio, conversao, historico e comprovante.

### 2. Conta e seguranca

O usuario acessa uma conta TalkToStellar por link seguro, PIN e sessao controlada.

Passkey existe como capacidade tecnica, mas o fluxo principal de demo e operacao usa PIN para reduzir friccao e evitar travas de dispositivo.

### 3. Pix

O usuario pode:

- colocar dinheiro via Pix;
- retirar para o proprio Pix;
- pagar um contato salvo usando Pix como funding;
- ver taxa real antes de confirmar.

Pix/Etherfuse fica isolado no trilho Testnet/sandbox enquanto Mainnet permanece separada.

### 4. Conversao e pagamento

O backend usa cotacao real configurada, fee services, historico e logs de pagamento. O usuario ve:

- valor enviado;
- valor liquido recebido;
- taxa TalkToStellar;
- taxa de rede quando houver;
- taxa Etherfuse quando houver;
- economia vs benchmark tradicional;
- hash/evidencia Stellar quando a operacao e concluida.

### 5. Comprovante

Depois de pagamento ou conversao, o usuario recebe comprovante com:

- destinatario real;
- timestamp real;
- valor entregue;
- taxa paga;
- economia calculada sobre fee real;
- hash Stellar real quando houver;
- link para historico;
- link de comprovante.

## Estrategia correta para "real" / BRL na Stellar

A decisao mais importante: para o produto atual, BRL nao precisa ser uma stablecoin dinamica.

Opcoes avaliadas:

### Opcao A - Nao usar asset BRL no produto principal

Recomendacao atual.

BRL fica como valor fiat off-chain:

- Pix confirma entrada/saida;
- banco de dados registra ledger, quote e status;
- backend calcula BRL -> USDC;
- Stellar liquida em USDC;
- recibos mostram BRL para usuario e USDC como evidencia tecnica.

Vantagens:

- menos complexidade de trustline e liquidez;
- UX mais clara;
- menor risco de parecer emissao de moeda;
- melhor alinhamento com Pix e parceiros regulados;
- mais facil para Mainnet, porque evita emitir um BRL publico sem lastro/regulacao.

### Opcao B - Asset BRL fixo somente na Testnet

Boa para demo tecnica e pathfinding.

Criar um asset testnet fixo, por exemplo:

```text
Code: TBRL ou BRL
Issuer: conta testnet controlada pelo projeto
Home domain: dominio do projeto
Uso: simulacao de saldo BRL, trustline, rota e liquidez com USDC
```

Regras:

- um issuer fixo;
- asset documentado;
- liquidez controlada em testnet;
- nunca apresentar como dinheiro real;
- nunca criar uma stablecoin dinamica por usuario.

### Opcao C - Asset BRL de parceiro/anchor regulado

Futuro mais robusto.

Se houver parceiro autorizado, o produto pode usar um asset BRL emitido por um anchor ou instituicao. Nesse caso o asset teria:

- issuer publico;
- `stellar.toml`;
- politica de emissao/resgate;
- KYC/KYB;
- lastro/contabilidade;
- limites e compliance.

Essa e a melhor opcao se o produto precisar representar BRL on-chain em producao.

### Opcao D - Stablecoin BRL dinamica criada pelo app

Nao recomendada.

Problemas:

- cada issuer dinamico quebra confianca e liquidez;
- usuarios precisariam confiar em varios assets parecidos;
- pathfinding fica instavel;
- aumenta superficie de compliance;
- confunde avaliador e usuario;
- dificulta Mainnet.

Conclusao:

```text
Para usuario/produto: BRL como ledger fiat + Pix + quote.
Para testnet tecnica: um unico asset TBRL/BRL fixo, controlado e documentado.
Para producao futura: parceiro/anchor regulado se BRL on-chain for necessario.
```

Documento detalhado: [docs/BRL_ASSET_STRATEGY_STELLAR.md](docs/BRL_ASSET_STRATEGY_STELLAR.md)

## O que ja existe no projeto

### Produto e UX

- landing page;
- chat web;
- WhatsApp via Evolution API;
- Telegram bot;
- onboarding por link;
- login por link;
- PIN;
- fluxo de pagamento;
- Pix on-ramp/off-ramp;
- historico;
- recibos;
- painel Mainnet read-only;
- tela de infraestrutura entre instituicoes.

### Agente e LLM

- agente com ferramentas estruturadas;
- prompt de producao com politica tool-first;
- evals para bloquear resposta livre em taxa/economia;
- ferramentas para saldo, contatos, Pix, pagamentos, conversao, economia e recibo;
- mensagens WhatsApp-ready com markdown nativo.

### Fees e economia

- `get_conversion_preview` usa cotacao real do backend;
- `show_savings_calculator` mostra custo e economia com dados de tool;
- `send_receipt_with_savings` usa `payment_logs`, fee real, destinatario real e hash real;
- `show_annual_savings_summary` usa historico real;
- recibos nao inventam cambio se quote/fallback real nao existe;
- benchmark tradicional fica separado da fee real.

### Stellar

- Testnet como runtime principal de produto;
- Mainnet isolada em modo read-only;
- readiness scripts para Mainnet;
- auditoria estatica de Mainnet;
- suporte a public wallet attachment;
- preview Mainnet sem submissao.

### Pix e Etherfuse

- Etherfuse integrado ao trilho Pix em Testnet/sandbox;
- Pix on-ramp;
- Pix off-ramp;
- controle para bloquear Pix/Etherfuse em Mainnet;
- guias de deploy da Evolution/Etherfuse.

### Infraestrutura BRL -> USD institucional

- quote BRL -> USD;
- lifecycle de transferencia;
- settlement evidence;
- payout adapter abstraction;
- reconciliation endpoint;
- interface de teste institucional;
- logs/evidence checklist.

## O que e real, testnet e sandbox

| Area | Estado |
| --- | --- |
| Landing e chat web | ao vivo |
| WhatsApp/Evolution | integravel com instancia real da Evolution |
| Telegram | integravel com bot real |
| Stellar Testnet | runtime principal de pagamentos/testes |
| Stellar Mainnet | read-only public wallet console |
| Pix/Etherfuse | Testnet/sandbox |
| USD payout bancario | adapter/instrucao; producao depende de parceiro |
| BRL on-chain | nao recomendado para produto principal; usar ledger/quote ou asset testnet fixo |
| Remessa regulada | fora do escopo sem parceiro/licenca/compliance |

## Arquitetura

```text
frontend/
  Next.js app: landing, chat, Pix, pagamentos, recibos, Mainnet console

backend/
  Node.js/TypeScript API
  agente LLM
  Stellar services
  Pix/Etherfuse adapter
  payment logs
  quote/fee services
  transfer lifecycle
  reconciliation

telegram/
  Telegram adapter

evolution/
  Railway/Docker helper para Evolution API

docs/
  guias de demo, deploy, seguranca, taxas, Mainnet e estrategia
```

## Fluxos principais

### Saldo

```text
Usuario: saldo
Agente -> get_balance
Resposta: BRL, USDC e economia acumulada do mes quando houver historico real
```

### Simulacao de custo

```text
Usuario: quanto custa enviar 5000 reais?
Agente -> show_savings_calculator
Tool -> get_conversion_preview
Resposta: cambio atual, valor liquido, taxa real e economia vs banco
```

### Pagamento para contato salvo

```text
Usuario: mandar 100 dolares para Ana
Agente valida contato salvo
Backend prepara link de confirmacao
Usuario confirma com PIN
Backend submete transacao
Payment logs registram fee/hash
WhatsApp recebe recibo com economia e evidencia
```

### Pix para pagar contato

```text
Usuario: mandar 100 reais por Pix para Ana
Agente exige contato salvo real
Frontend Pix cria checkout/funding intent
Pix confirma funding
Backend executa pagamento
Usuario recebe comprovante
```

### Mainnet read-only

```text
Usuario abre /mainnet
Anexa chave publica G...
Backend consulta Horizon Mainnet
Usuario ve saldos e operacoes publicas
Nenhuma transacao real e assinada
```

## Como rodar localmente

Pre-requisitos:

- Node.js 18+;
- npm;
- Supabase/Postgres configurado;
- variaveis de ambiente do backend e frontend.

Subida completa:

```bash
chmod +x start-local.sh
./start-local.sh
```

Servicos locais:

```text
Frontend: http://localhost:3000
Backend:  http://localhost:3001
```

Build backend:

```bash
cd backend
npm run build
```

Evals do agente:

```bash
cd backend
npm run eval:agent
```

Build frontend:

```bash
cd frontend
npm run build
```

## Variaveis importantes

### Stellar Testnet

```bash
STELLAR_NETWORK=TESTNET
STELLAR_HORIZON_URL=https://horizon-testnet.stellar.org
STELLAR_FRIENDBOT_URL=https://friendbot.stellar.org
```

### Mainnet read-only / readiness

```bash
STELLAR_MAINNET_ENABLED=false
STELLAR_MAINNET_HORIZON_URL=https://horizon.stellar.org
STELLAR_MAINNET_ALLOW_RUNTIME_ACTIVATION=false
STELLAR_MAINNET_SIGNER_MODE=disabled
STELLAR_MAINNET_REQUIRE_MANUAL_APPROVAL=true
```

### Fees e cambio

```bash
BRL_USDC_QUOTE_SYMBOL=USDCBRL
USD_BRL_FALLBACK_RATE=5.13
TALKTOSTELLAR_SPREAD_BPS=30
TALKTOSTELLAR_FEE_TREASURY_PUBLIC_KEY=G...
```

Observacao: se a cotacao real estiver indisponivel e `USD_BRL_FALLBACK_RATE` nao estiver configurado, o backend deve falhar em vez de inventar cambio.

### WhatsApp/Evolution

```bash
EVOLUTION_API_URL=https://...
EVOLUTION_API_KEY=...
EVOLUTION_INSTANCE=TalkToStellar
EVOLUTION_WEBHOOK_SECRET=...
PUBLIC_BACKEND_URL=https://...
```

## Migrations relevantes

Aplicar conforme o ambiente:

```text
backend/migrations/20260518_00_prepare_stellar_mainnet_infrastructure.sql
backend/migrations/20260521_00_user_mainnet_wallets.sql
backend/migrations/20260523_01_payment_logs_operation_fingerprint_unique.sql
```

A migration `payment_logs_operation_fingerprint_unique` e importante para recibos e economia reais, porque evita falha no `upsert` de logs de pagamento.

## Seguranca e compliance

TalkToStellar nao deve ser apresentado como banco, instituicao de pagamento licenciada ou remessa internacional regulada pronta para escala sem parceiros adequados.

Principios atuais:

- nunca pedir seed/secret key Mainnet;
- Mainnet read-only por padrao;
- Pix/Etherfuse Testnet-only;
- PIN para confirmacao de operacoes;
- passkey opcional;
- mensagens de erro publicas sem SQL/provider stack;
- contato salvo real antes de pagamento para pessoa;
- fees e economia vindas de tools, nao de texto livre;
- logs e recibos para rastreabilidade.

Antes de producao financeira real:

- parceiro Pix/FX autorizado;
- KYC/KYB;
- screening de sancoes;
- politica PLD/FT;
- IOF/tratamento tributario revisado;
- off-ramp/payout provider regulado;
- signer Mainnet seguro;
- limites e aprovacao manual;
- auditoria de seguranca.

## Referencias oficiais Stellar

- Redes Stellar, Testnet e Mainnet: https://developers.stellar.org/docs/learn/fundamentals/networks
- Emissao de assets na Stellar: https://developers.stellar.org/docs/tokens/how-to-issue-an-asset
- Asset management/Testnet: https://developers.stellar.org/docs/tools/cli/cookbook/asset-management

## Resumo para avaliador

TalkToStellar e um produto vivo com uma experiencia conversacional de conta, Pix, conversao, pagamentos e comprovantes. O runtime de produto financeiro continua em Testnet/sandbox para seguranca. A Mainnet ja existe como camada ao vivo read-only para anexar carteiras publicas reais, consultar saldo e demonstrar preparacao operacional sem risco de mover valor real.

A estrategia de BRL e pragmatica: nao criar uma stablecoin dinamica. Para produto, BRL deve ser ledger/quote conectado a Pix; para demo tecnica, um asset testnet fixo basta; para producao on-chain de BRL, o caminho correto e parceiro/anchor regulado.
