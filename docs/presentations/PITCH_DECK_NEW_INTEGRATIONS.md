# Pitch Deck — As Novas Integrações (Bridge · DeFindex · Blend)

Data: 2026-06-26
Status: documento de narrativa de negócio para **atualizar** o deck de 7 slides
([PITCH_DECK_7_SLIDES_INITIAL.md](./PITCH_DECK_7_SLIDES_INITIAL.md)).

> Este documento existe para um propósito: dar ao pitch a história das novas
> integrações Stellar — **Bridge, DeFindex e Blend** — de um ponto de vista de
> negócio. Não é doc técnico (esse já existe em `docs/bridge-integration-status.md`
> e no `README`). Aqui é narrativa, slides, números, posicionamento e objeções.

---

## 0. A frase que muda o pitch

O deck antigo dizia:

```text
TalkToStellar é a rota mais barata e transparente para converter BRL -> USD pelo chat.
```

O deck novo diz:

```text
TalkToStellar é a conta em dólar que rende — você recebe, guarda, faz render
e saca dólares pelo chat, sem nunca tocar em cripto.
```

A diferença não é cosmética. Antes éramos um **trilho de passagem** (o dinheiro
entrava e saía). Agora somos um **lugar onde o dinheiro fica e trabalha**. Isso
muda o produto, o modelo de receita e o tamanho do mercado.

---

## 1. O salto: de "rota de conversão" para "conta em dólar que rende"

| Antes (deck v1) | Agora (com as novas integrações) |
| --- | --- |
| Pix entra, converte, sai para destino externo | Pix/dólar entra, **fica na conta**, rende e sai quando o usuário quiser |
| Receita só na passagem (spread/fee de conversão) | Receita na passagem **+ no saldo parado** (spread de rendimento, float) |
| Sem retenção: o dinheiro vai embora | Retenção: o saldo rende e dá motivo para ficar |
| Concorrente: serviço de remessa | Concorrente: conta digital em dólar (Nubank/Wise-grade) |
| Stellar como evidência de settlement | Stellar como **back-end bancário inteiro** (custódia + rendimento + liquidez) |

As três integrações são o que torna esse salto real — e cada dólar passa por
todas elas:

```text
Recebe dólar           Guarda em custódia        Faz render                 Saca
   (Bridge)        ->  (carteira Stellar)   ->   (DeFindex + Blend)    ->    (Bridge off-ramp)
 wire / ACH / Pix       chave em cofre            cofre + empréstimo          ACH / wire / Pix
```

---

## 2. As integrações, do ponto de vista de negócio

### 2.1 Bridge — "a conta em dólar de verdade"

**O que é, em uma frase:** dá ao usuário brasileiro/latino uma conta em dólar
americano funcional — com dados de wire/ACH para receber — sem precisar de banco
nos EUA, visto, SSN ou viagem.

**Por que importa para o negócio:**

- **Remove a maior fricção do dólar de varejo na América Latina:** abrir conta
  internacional. Aqui é só um e-mail.
- **Cria a porta de entrada E de saída:** o usuário recebe dólar (virtual
  accounts USD/EUR/MXN/GBP/COP/BRL) e saca para o banco dele (ACH/wire/Pix). A
  passagem completa, dos dois lados, na nossa interface.
- **Custódia sem dor:** cada conta tem uma carteira Stellar com a chave guardada
  em cofre. O usuário nunca vê secret key, trustline ou XDR. Para ele, é "minha
  conta em dólar".
- **Suíte de contas + transferência interna:** virtual accounts, carteiras
  custodiais e carteiras Stellar aparecem como uma só conta, e o usuário move
  dinheiro entre elas. Isso é a sensação de "banco", não de "carteira cripto".

**Slide-pronto:**

```text
Bridge = a conta em dólar sem banco gringo.
Receba por wire/ACH, guarde com custódia invisível, saque para o seu banco.
```

### 2.2 DeFindex — "o dólar que rende sozinho"

**O que é, em uma frase:** um cofre auto-otimizado de USDC na Stellar (Soroban)
onde o saldo do usuário rende, com APY transparente.

**Por que importa para o negócio:**

- **Transforma saldo parado em produto:** dólar guardado normalmente não rende
  nada para o usuário de varejo. Aqui rende — e isso é o gancho de retenção.
- **Receita recorrente sobre AUM:** ganhamos um spread sobre o rendimento, não só
  uma fee de passagem única. Quanto mais saldo fica, mais receita recorrente.
- **Mensagem "Nubank do dólar":** "seu dinheiro rende sozinho" é exatamente a
  promessa que popularizou contas digitais no Brasil — agora em dólar.
- **Um toque:** o auto-yield coloca o saldo para render sem o usuário entender
  cofre, vault ou DeFi.

**Slide-pronto:**

```text
DeFindex = seu dólar rende sozinho.
Cofre auto-otimizado, APY transparente, um toque para começar.
```

### 2.3 Blend — "rendimento de empréstimo, lado a lado"

**O que é, em uma frase:** uma pool de empréstimo (lending) de USDC na Stellar
onde o usuário pode fornecer liquidez e ganhar juros, com APY ao vivo.

**Por que importa para o negócio:**

- **Diversifica a fonte de rendimento:** cofre (DeFindex) e empréstimo (Blend) são
  estratégias diferentes. Ter as duas dá escolha e resiliência ao rendimento.
- **Permite perfis de risco/retorno:** o auto-yield divide o saldo entre os dois
  (slider 100/0 → 0/100). Isso vira um recurso de produto: "conservador" vs.
  "agressivo", sem jargão.
- **Aprofundamento de integração:** mostra que não dependemos de um único
  protocolo — somos uma camada de alocação sobre o ecossistema Stellar.

**Slide-pronto:**

```text
Blend = rendimento de empréstimo, ao lado do cofre.
O usuário escolhe a mistura; nós cuidamos da execução.
```

### 2.4 Auto-yield + Soroswap — "a cola invisível"

Não é uma das três principais, mas é o que faz as três parecerem uma só:

- **Auto-yield** varre o saldo parado e divide entre DeFindex e Blend conforme o
  perfil escolhido — nas duas redes, e por agendador.
- **Soroswap** faz a conversão interna (path payments) e a provisão de liquidez
  (XLM/USDC), para que o usuário só pense em "dólar".

**Mensagem:** o usuário aperta um botão; por baixo, três protocolos Stellar se
coordenam.

---

## 3. A jornada do dinheiro (o slide de "como funciona", reescrito)

```text
1. "quero receber dólares"          -> Bridge cria conta + dados de wire/ACH
2. dólar chega                       -> vira USDC custodiado na carteira Stellar
3. "põe pra render"                  -> auto-yield aloca em DeFindex + Blend
4. saldo rende com APY transparente  -> gráfico de evolução real (snapshots 4h)
5. "quero sacar"                     -> Bridge envia ACH/wire/Pix para o banco do usuário
```

Tudo isso por chat (WhatsApp/Telegram/web) e por telas simples estilo Nubank.
Nenhum passo exige que o usuário entenda blockchain.

---

## 4. Modelo de negócio — o que as integrações destravam

O deck v1 listava receita só na passagem. As novas integrações adicionam
camadas de receita recorrente:

| Linha de receita | Origem | Novo? |
| --- | --- | --- |
| Spread/fee de conversão | Pix/dólar on-ramp e off-ramp | já existia |
| **Spread de rendimento** | Diferença entre APY bruto (DeFindex/Blend) e APY entregue | **novo — recorrente sobre AUM** |
| **Float / saldo parado** | Dólar custodiado parado entre operações | **novo** |
| Fee de saque (off-ramp) | ACH/wire/Pix via Bridge | reforçado |
| Fee de transferência interna | Movimento entre contas da suíte | **novo** |
| SaaS/API B2B | Empresas que querem "conta dólar que rende" como serviço | ampliado |

**Princípio mantido:** ganhar pela economia e pelo rendimento entregue ao
usuário, nunca por taxa escondida.

**A mudança estratégica:** receita deixa de ser só transacional (ganha quando o
dinheiro passa) e passa a ter um componente de **AUM** (ganha enquanto o dinheiro
fica). É a diferença entre uma corretora de câmbio e um banco digital.

---

## 5. Mercado — por que o TAM cresce

O deck v1 mirava remessa/conversão. Com rendimento + custódia, entramos no
mercado de **dólar digital de varejo** na América Latina:

- **Dolarização de patrimônio:** milhões de brasileiros/argentinos/colombianos
  querem proteger valor em dólar. Hoje fazem isso de forma cara e fragmentada.
- **Argentina e Colômbia:** demanda estrutural por dólar (inflação, controle
  cambial). O PULSO roda nesses três países — o produto fala direto com essa dor.
- **Quem já tem conta global** ainda quer um lugar simples para o dólar render
  enquanto não usa. Não competimos com Wise/contas globais — somos o lugar barato
  e que rende **antes** delas.

```text
De: "rota de remessa BRL -> USD"
Para: "conta em dólar que rende para a América Latina, pelo chat"
```

---

## 6. Posicionamento competitivo

| Player | O que faz | O que falta | Onde ganhamos |
| --- | --- | --- | --- |
| Bancos/corretoras de câmbio | Conversão | Spread escondido, sem rendimento, UX técnica | Transparência + rendimento + chat |
| Contas globais (Wise et al.) | Conta multi-moeda | Onboarding pesado, rendimento limitado p/ LatAm | Entrada por e-mail/Pix, rendimento, conversa |
| Apps cripto/DeFi | Rendimento on-chain | Exige entender carteira/DeFi | Custódia invisível, zero jargão |
| Stablecoin wallets | Guardar USDC | Sem ramp fiat fácil, sem rendimento gerido | Ramp Bridge + alocação DeFindex/Blend |

**Nosso fosso:** a combinação. Ramp fiat (Bridge) + custódia invisível +
rendimento gerido (DeFindex/Blend) + interface conversacional, tudo sobre
Stellar. Cada peça existe isolada no mercado; juntar com UX de varejo é o produto.

---

## 7. Por que isto vence o PULSO (mapeamento direto aos critérios)

| Critério do PULSO | Como as novas integrações respondem |
| --- | --- |
| **Profundidade de integração & complexidade técnica** | 3+ integrações Stellar encadeadas (Bridge → custódia → DeFindex/Blend → off-ramp), com assinatura por chave em cofre e contratos Soroban. Load-bearing de ponta a ponta. |
| **Impacto no ecossistema Stellar** | Traz dólar de varejo e Pix para trilhos Stellar com UX de conversa — usuários reais, não traders. |
| **Customer discovery & validação** | Produto desenhado para a dor real de dolarização na LatAm; entrevistas de discovery direcionadas a esse público. |
| **Qualidade de deploy testnet/mainnet** | Execução custodial ao vivo em Mainnet (Bridge + rendimento) e fluxo completo em Testnet. Off-ramp real comprovado. |

A regra do PULSO diz que a integração precisa ser **load-bearing** — "powers a
real part of how the project works, rather than appearing only on a slide". Aqui
ela literalmente move e faz render o dinheiro. É o coração do produto.

---

## 8. Como mudar o deck de 7 slides (edição slide a slide)

Mantém a espinha, troca a ambição. Sugestão de reescrita:

- **Slide 1 — Problema:** adicionar a segunda dor além da conversão: "guardar e
  fazer dólar render na América Latina é caro, burocrático e exige banco gringo".
- **Slide 2 — Solução:** trocar "rota de conversão" por "conta em dólar que rende
  pelo chat". Mostrar a jornada da seção 3.
- **Slide 3 — Como funciona:** substituir o fluxo antigo pela jornada do dinheiro
  (recebe → guarda → rende → saca) e nomear Bridge/DeFindex/Blend como os trilhos.
- **Slide 4 — Mercado:** ampliar de remessa para "dólar digital de varejo LatAm"
  (BR/AR/CO), usando a seção 5.
- **Slide 5 — Modelo de negócio:** adicionar spread de rendimento e float
  (seção 4); destacar a virada transacional → AUM.
- **Slide 6 — Tração/produto:** adicionar conta em dólar (Bridge), rendimento
  ao vivo (DeFindex/Blend), auto-yield, off-ramp ACH/wire — itens novos e reais.
- **Slide 7 — Próximo passo:** trocar "piloto de conversão" por "piloto de conta
  em dólar que rende, com parceiros regulados e limites".

**Slides novos sugeridos (se houver espaço):**

- **Slide 3.5 — "O dinheiro que fica e trabalha":** a tabela antes/depois
  (seção 1) — a virada de trilho para conta.
- **Slide 5.5 — "Arquitetura de integrações":** o diagrama da jornada + os 3
  logos (Bridge, DeFindex, Blend) sobre Stellar, com a frase "load-bearing".

---

## 9. Talking points e objeções (para o pitch IRL)

**Talking points de abertura:**

- "Pix resolveu o real. Ninguém resolveu o dólar de varejo na América Latina."
- "Demos ao usuário uma conta em dólar que ele abre com um e-mail — e que rende."
- "Por baixo, três protocolos Stellar fazem o trabalho de um banco. Por cima, é
  uma conversa."

**Objeções prováveis e respostas:**

- *"Isso não é só DeFi com roupa nova?"* — Não. O usuário nunca toca em carteira,
  vault ou trustline. Custódia invisível + UX de conversa. DeFi é o motor, não a
  experiência.
- *"E regulação/compliance?"* — Bridge é parceiro regulado de ramp; movimentação
  Mainnet fica atrás de senha de acesso, confirmação e limites. Caminho para
  KYC/KYB e parceiros está no roadmap.
- *"O rendimento é sustentável?"* — Vem de protocolos estabelecidos (cofre +
  empréstimo) e é diversificado entre os dois; o usuário escolhe a mistura de
  risco. Entregamos APY transparente, não promessa fixa.
- *"Por que Stellar?"* — Liquidação rápida e barata, USDC nativo, contratos
  Soroban para rendimento, e ramp fiat via parceiro. Sem isso, a UX de varejo não
  fecha em custo.

---

## 10. Métricas que passam a importar

Com as integrações, o painel de métricas do deck ganha indicadores de "banco",
não só de "passagem":

- **AUM custodiado** (saldo total em dólar guardado);
- **% do saldo em rendimento** (ativação do auto-yield);
- **APY médio entregue** vs. APY bruto (nosso spread);
- **Retenção de saldo** (quanto tempo o dólar fica antes de sacar);
- **Receita recorrente sobre AUM** vs. receita transacional;
- **Conversão recebe → rende** (quantos que recebem dólar ativam rendimento);
- **Volume de off-ramp** (saques ACH/wire/Pix).

---

## 11. Apêndice — credibilidade técnica (para sustentar as afirmações)

Tudo abaixo está implementado no repositório (não é roadmap):

- **Bridge:** virtual accounts (USD/EUR/MXN/GBP/COP/BRL), carteiras custodiais,
  liquidation addresses, transfers `crypto-to-{ach,wire,pix,rtp,sepa,spei}`,
  carteiras Stellar por e-mail com chave em cofre, transferência interna
  unificada (custodial⇄stellar). Off-ramp real já observado em Mainnet.
- **DeFindex:** deposit/withdraw no cofre USDC via build de XDR + assinatura com a
  chave da carteira + submit, em Mainnet e Testnet.
- **Blend:** supply de USDC na pool via build de XDR + assinatura + submit, com
  APY ao vivo.
- **Soroswap:** conversão via path payments e provisão de liquidez (zap XLM/USDC).
- **Auto-yield:** varredura de saldo parado, divisão DeFindex/Blend, swap de XLM
  parado para USDC, agendador.
- **Arquitetura de duas carteiras:** Testnet (carteira de sessão) e Mainnet
  (carteira Bridge por e-mail), gás patrocinado pela plataforma.

Detalhe técnico completo: `README.md` (seção Integrações Stellar) e
`docs/bridge-integration-status.md`.

---

## 12. Resumo de uma página (para colar no início do deck)

```text
TalkToStellar — a conta em dólar que rende, pelo chat.

Recebe dólar (Bridge) -> guarda com custódia invisível (Stellar) ->
faz render (DeFindex + Blend) -> saca para o banco (Bridge off-ramp).

3 integrações Stellar load-bearing. Zero jargão para o usuário.
De trilho de passagem para banco digital em dólar da América Latina.
```
