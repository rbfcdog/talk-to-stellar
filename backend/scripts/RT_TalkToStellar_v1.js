const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  HeadingLevel, AlignmentType, BorderStyle, WidthType, ShadingType,
  LevelFormat, PageNumber, Header, Footer, TabStopType, TabStopPosition
} = require('docx');
const fs = require('fs');

const BLUE       = "1A56A0";
const LIGHT_BLUE = "D6E4F7";
const DARK_GRAY  = "2D2D2D";
const MID_GRAY   = "595959";
const LIGHT_GRAY = "F5F5F5";
const BORDER_GRAY= "CCCCCC";

const border   = { style: BorderStyle.SINGLE, size: 1, color: BORDER_GRAY };
const borders  = { top: border, bottom: border, left: border, right: border };
const noBorder = { style: BorderStyle.NONE,   size: 0, color: "FFFFFF" };
const noBorders= { top: noBorder, bottom: noBorder, left: noBorder, right: noBorder };

function h1(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { before: 400, after: 160 },
    children: [new TextRun({ text, bold: true, size: 32, color: BLUE, font: "Arial" })]
  });
}
function h2(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    spacing: { before: 320, after: 120 },
    children: [new TextRun({ text, bold: true, size: 26, color: DARK_GRAY, font: "Arial" })]
  });
}
function h3(text) {
  return new Paragraph({
    heading: HeadingLevel.HEADING_3,
    spacing: { before: 240, after: 80 },
    children: [new TextRun({ text, bold: true, size: 22, color: MID_GRAY, font: "Arial" })]
  });
}
function p(text, options = {}) {
  return new Paragraph({
    spacing: { before: 80, after: 80 },
    children: [new TextRun({ text, size: 22, color: DARK_GRAY, font: "Arial", ...options })]
  });
}
function placeholder(text) {
  return new Paragraph({
    spacing: { before: 80, after: 80 },
    children: [new TextRun({ text: `[ ${text} ]`, size: 22, color: "999999", italics: true, font: "Arial" })]
  });
}
function bullet(text, level = 0) {
  return new Paragraph({
    numbering: { reference: "bullets", level },
    spacing: { before: 60, after: 60 },
    children: [new TextRun({ text, size: 22, color: DARK_GRAY, font: "Arial" })]
  });
}
function divider() {
  return new Paragraph({
    spacing: { before: 200, after: 200 },
    border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: LIGHT_BLUE } },
    children: []
  });
}
function infoBox(label, content) {
  return new Table({
    width: { size: 9360, type: WidthType.DXA },
    columnWidths: [1800, 7560],
    rows: [
      new TableRow({
        children: [
          new TableCell({
            borders,
            width: { size: 1800, type: WidthType.DXA },
            shading: { fill: LIGHT_BLUE, type: ShadingType.CLEAR },
            margins: { top: 80, bottom: 80, left: 120, right: 120 },
            children: [new Paragraph({ children: [new TextRun({ text: label, bold: true, size: 20, color: BLUE, font: "Arial" })] })]
          }),
          new TableCell({
            borders,
            width: { size: 7560, type: WidthType.DXA },
            shading: { fill: "FFFFFF", type: ShadingType.CLEAR },
            margins: { top: 80, bottom: 80, left: 120, right: 120 },
            children: [new Paragraph({ children: [new TextRun({ text: content, size: 20, color: DARK_GRAY, font: "Arial" })] })]
          })
        ]
      })
    ]
  });
}
function spacer(size = 120) {
  return new Paragraph({ spacing: { before: size, after: 0 }, children: [] });
}

function decisionTable(rows) {
  const hCell = (text) => new TableCell({
    borders,
    shading: { fill: BLUE, type: ShadingType.CLEAR },
    margins: { top: 80, bottom: 80, left: 120, right: 120 },
    children: [new Paragraph({ children: [new TextRun({ text, bold: true, size: 20, color: "FFFFFF", font: "Arial" })] })]
  });
  const headerRow = new TableRow({
    children: [
      hCell("Decisão"), hCell("Alternativas Consideradas"),
      hCell("Justificativa"), hCell("Status")
    ]
  });
  const widths = [2800, 2280, 2280, 2000];
  const dataRows = rows.map(([d, a, j, s], i) => {
    const fill = i % 2 === 0 ? "FFFFFF" : LIGHT_GRAY;
    return new TableRow({
      children: [d, a, j, s].map((txt, ci) => new TableCell({
        borders,
        width: { size: widths[ci], type: WidthType.DXA },
        shading: { fill, type: ShadingType.CLEAR },
        margins: { top: 80, bottom: 80, left: 120, right: 120 },
        children: [new Paragraph({ children: [new TextRun({ text: txt, size: 20, font: "Arial" })] })]
      }))
    });
  });
  return new Table({
    width: { size: 9360, type: WidthType.DXA },
    columnWidths: widths,
    rows: [headerRow, ...dataRows]
  });
}

function competitorTable(rows) {
  const cols = ["Concorrente", "O que faz", "Limitação", "Nosso diferencial"];
  const hRow = new TableRow({
    children: cols.map(c => new TableCell({
      borders,
      width: { size: 2340, type: WidthType.DXA },
      shading: { fill: BLUE, type: ShadingType.CLEAR },
      margins: { top: 80, bottom: 80, left: 120, right: 120 },
      children: [new Paragraph({ children: [new TextRun({ text: c, bold: true, size: 20, color: "FFFFFF", font: "Arial" })] })]
    }))
  });
  const dRows = rows.map(([c1, c2, c3, c4], i) => {
    const fill = i % 2 === 0 ? "FFFFFF" : LIGHT_GRAY;
    return new TableRow({
      children: [c1, c2, c3, c4].map(txt => new TableCell({
        borders,
        width: { size: 2340, type: WidthType.DXA },
        shading: { fill, type: ShadingType.CLEAR },
        margins: { top: 80, bottom: 80, left: 120, right: 120 },
        children: [new Paragraph({ children: [new TextRun({ text: txt, size: 20, font: "Arial" })] })]
      }))
    });
  });
  return new Table({ width: { size: 9360, type: WidthType.DXA }, columnWidths: [2340,2340,2340,2340], rows: [hRow, ...dRows] });
}

function logTable(rows) {
  const hRow = new TableRow({
    children: ["Data","Autor","O que mudou"].map(t => new TableCell({
      borders,
      shading: { fill: BLUE, type: ShadingType.CLEAR },
      margins: { top: 80, bottom: 80, left: 120, right: 120 },
      children: [new Paragraph({ children: [new TextRun({ text: t, bold: true, size: 20, color: "FFFFFF", font: "Arial" })] })]
    }))
  });
  const widths = [1800, 2000, 5560];
  const dRows = rows.map(([d, a, o], i) => {
    const fill = i % 2 === 0 ? "FFFFFF" : LIGHT_GRAY;
    return new TableRow({
      children: [d, a, o].map((txt, ci) => new TableCell({
        borders,
        width: { size: widths[ci], type: WidthType.DXA },
        shading: { fill, type: ShadingType.CLEAR },
        margins: { top: 80, bottom: 80, left: 120, right: 120 },
        children: [new Paragraph({ children: [new TextRun({ text: txt, size: 20, font: "Arial" })] })]
      }))
    });
  });
  return new Table({ width: { size: 9360, type: WidthType.DXA }, columnWidths: widths, rows: [hRow, ...dRows] });
}

const today = new Date().toLocaleDateString('pt-BR');

const doc = new Document({
  numbering: {
    config: [{
      reference: "bullets",
      levels: [
        { level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 720, hanging: 360 } } } },
        { level: 1, format: LevelFormat.BULLET, text: "◦", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 1080, hanging: 360 } } } }
      ]
    }]
  },
  styles: {
    default: { document: { run: { font: "Arial", size: 22, color: DARK_GRAY } } },
    paragraphStyles: [
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true, run: { size: 32, bold: true, font: "Arial", color: BLUE }, paragraph: { spacing: { before: 400, after: 160 }, outlineLevel: 0 } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true, run: { size: 26, bold: true, font: "Arial", color: DARK_GRAY }, paragraph: { spacing: { before: 320, after: 120 }, outlineLevel: 1 } },
      { id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true, run: { size: 22, bold: true, font: "Arial", color: MID_GRAY }, paragraph: { spacing: { before: 240, after: 80 }, outlineLevel: 2 } },
    ]
  },
  sections: [{
    properties: {
      page: {
        size: { width: 12240, height: 15840 },
        margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 }
      }
    },
    headers: {
      default: new Header({
        children: [
          new Paragraph({
            spacing: { before: 0, after: 120 },
            border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: LIGHT_BLUE } },
            children: [
              new TextRun({ text: "TalkToStellar  |  Registro Técnico (RT)", bold: true, size: 20, color: BLUE, font: "Arial" }),
              new TextRun({ text: "    Documento Vivo — Atualizado continuamente", size: 18, color: "999999", font: "Arial" }),
            ]
          })
        ]
      })
    },
    footers: {
      default: new Footer({
        children: [
          new Paragraph({
            tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
            border: { top: { style: BorderStyle.SINGLE, size: 4, color: LIGHT_BLUE } },
            spacing: { before: 80, after: 0 },
            children: [
              new TextRun({ text: "Confidencial — uso interno e avaliadores do desafio", size: 18, color: "999999", font: "Arial" }),
              new TextRun({ text: "\tPágina ", size: 18, color: "999999", font: "Arial" }),
              new TextRun({ children: [PageNumber.CURRENT], size: 18, color: "999999", font: "Arial" }),
            ]
          })
        ]
      })
    },
    children: [

      // ─── CAPA ───
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 1200, after: 240 }, children: [new TextRun({ text: "TalkToStellar", bold: true, size: 64, color: BLUE, font: "Arial" })] }),
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 0, after: 120 }, children: [new TextRun({ text: "Registro Técnico de Produto (RT)", size: 32, color: MID_GRAY, font: "Arial" })] }),
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 0, after: 80 }, children: [new TextRun({ text: "Documento Vivo · Versão 1.0", size: 22, color: "999999", italics: true, font: "Arial" })] }),
      new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 0, after: 600 }, children: [new TextRun({ text: `Iniciado em: ${today}`, size: 20, color: "999999", font: "Arial" })] }),

      infoBox("Projeto",            "TalkToStellar"),
      spacer(40),
      infoBox("Versão",             "1.0 — Rascunho inicial"),
      spacer(40),
      infoBox("Fundador(es)",       "[ Nome(s) do(s) fundador(es) ]"),
      spacer(40),
      infoBox("Contato",            "[ Email / X / LinkedIn ]"),
      spacer(40),
      infoBox("Última atualização", today),
      spacer(40),
      infoBox("Status",             "🟡 Em desenvolvimento"),
      spacer(600),

      // ─── 1. VISÃO GERAL ───
      divider(),
      h1("1. Visão Geral do Produto"),

      h2("1.1 O que é o TalkToStellar?"),
      p("O TalkToStellar é uma plataforma integrada a aplicativos de mensagem como WhatsApp e Telegram, baseada na rede Stellar, que permite converter e transferir BRL via Pix para USDC de forma simples, rápida e com baixo custo, utilizando comandos em linguagem natural."),
      p("Por meio de agentes de IA, o sistema interpreta mensagens do usuário e executa operações como criação de carteiras, envio de valores e conversões automáticas, utilizando mecanismos inteligentes de otimização de rotas para garantir as melhores taxas e liquidez."),
      p("A solução elimina a complexidade da Web3 e democratiza o acesso a serviços financeiros globais, tornando transações internacionais tão simples quanto enviar uma mensagem."),

      h2("1.2 Proposta de Valor"),
      bullet("Elimina a complexidade do Web3 — sem instalar carteiras, sem entender chaves privadas"),
      bullet("Interface familiar — o usuário opera pelo WhatsApp ou Telegram que já usa"),
      bullet("Custo baixo e velocidade alta via rede Stellar"),
      bullet("Acesso a dólares digitais (USDC) a partir de Pix em BRL"),
      bullet("Transações internacionais tão simples quanto enviar uma mensagem"),

      h2("1.3 Tagline"),
      p('"Envie dólares pelo WhatsApp. Tão fácil quanto mandar uma mensagem."', { italics: true }),

      divider(),

      // ─── 2. PERSONA ───
      h1("2. Persona Alvo"),

      h2("2.1 Perfil da Persona"),
      spacer(40),
      infoBox("Nome da Persona", "[ Ex: Ana, a Autônoma Digital ]"),
      spacer(40),
      infoBox("Cargo / Ocupação", "[ Ex: Freelancer, Designer, Dev remoto ]"),
      spacer(40),
      infoBox("Faixa Etária", "[ Ex: 25–40 anos ]"),
      spacer(40),
      infoBox("Localização", "[ Ex: Brasil, cidades médias e grandes ]"),
      spacer(40),
      infoBox("Renda", "[ Ex: R$ 3.000–10.000/mês ]"),
      spacer(200),

      h2("2.2 Dor Específica"),
      placeholder("Descreva a dor principal da persona — o problema concreto que ela enfrenta hoje e que o TalkToStellar resolve"),
      spacer(80),
      bullet("[ Dor 1 — ex: receber pagamentos internacionais tem taxa absurda ]"),
      bullet("[ Dor 2 — ex: abrir conta em exchange é burocrático demais ]"),
      bullet("[ Dor 3 — ex: não entende cripto mas precisa de acesso a dólar ]"),

      h2("2.3 Comportamento & Contexto"),
      placeholder("Como essa persona se comporta hoje? Quais ferramentas usa? Onde encontra esse problema?"),

      h2("2.4 Jobs to Be Done"),
      bullet("[ Job 1 — ex: 'Quero receber em dólar sem abrir conta gringa' ]"),
      bullet("[ Job 2 — ex: 'Quero proteger meu dinheiro da inflação' ]"),
      bullet("[ Job 3 — ex: 'Quero enviar dinheiro para familiar no exterior' ]"),

      divider(),

      // ─── 3. MERCADO ───
      h1("3. Mercado & Oportunidade"),

      h2("3.1 Tamanho de Mercado"),
      placeholder("TAM / SAM / SOM — estime o tamanho do mercado endereçável"),
      spacer(40),
      infoBox("TAM", "[ Mercado total — ex: remessas internacionais Brasil = US$ X bi/ano ]"),
      spacer(40),
      infoBox("SAM", "[ Segmento endereçável — ex: freelancers e autônomos com renda internacional ]"),
      spacer(40),
      infoBox("SOM", "[ Fatia realista em 12 meses — ex: X mil usuários, R$ Y em volume ]"),
      spacer(200),

      h2("3.2 Concorrentes & Diferencial"),
      competitorTable([
        ["Wise",             "Transferências internacionais",       "KYC pesado, não é cripto",     "Interface por mensagem, Stellar nativo"],
        ["Remessa Online",   "Câmbio e remessas internacionais",    "Não opera com cripto/USDC",    "Zero instalação, linguagem natural, USDC em segundos"],
        ["Binance Pay",      "Pagamentos em cripto",                "Requer conta em exchange, KYC", "Opera pelo WhatsApp/Telegram sem app adicional"],
        ["[ Concorrente 4 ]","[ ... ]",                             "[ ... ]",                      "[ ... ]"],
      ]),

      divider(),

      // ─── 4. PRODUTO ───
      h1("4. O Produto — O que Exatamente Estamos Oferecendo"),

      h2("4.1 Funcionalidades Principais (MVP)"),
      bullet("Criação de carteira Stellar via mensagem (não-custodial com Passkey + SEP-30)"),
      bullet("Conversão de BRL → USDC via Pix integrado"),
      bullet("Envio de USDC para qualquer endereço Stellar via linguagem natural"),
      bullet("Consulta de saldo e histórico via chat"),
      bullet("Otimização automática de rotas para melhores taxas (via Stellar DEX / SDEX)"),
      spacer(80),
      placeholder("Adicione ou remova funcionalidades conforme o escopo do MVP evoluir"),

      h2("4.2 Fora do Escopo (MVP)"),
      bullet("Suporte a outras redes blockchain além de Stellar"),
      bullet("Integração com outros apps além de WhatsApp e Telegram"),
      bullet("Cartão de débito físico"),
      bullet("Exchange de criptomoedas além do par BRL/USDC"),

      h2("4.3 Fluxo Principal do Usuário"),
      p("1. Usuário envia mensagem: \"quero converter R$200 para dólar\""),
      p("2. Agente de IA interpreta o comando e verifica carteira do usuário"),
      p("3. Se primeira vez: envia link de setup para criação de carteira (não-custodial)"),
      p("4. Sistema gera instrução de Pix com valor e chave"),
      p("5. Usuário faz o Pix normalmente pelo banco"),
      p("6. Sistema detecta o Pix, converte BRL → USDC na melhor taxa disponível"),
      p("7. USDC creditado na carteira Stellar do usuário"),
      p("8. Usuário recebe confirmação via mensagem"),
      spacer(80),
      placeholder("Adicione detalhes, edge cases e fluxos alternativos conforme forem mapeados"),

      divider(),

      // ─── 5. ARQUITETURA ───
      h1("5. Arquitetura Técnica"),

      h2("5.1 Visão Geral da Stack"),
      spacer(40),
      infoBox("Frontend / Interface", "WhatsApp Business API + Telegram Bot API"),
      spacer(40),
      infoBox("Agente de IA",         "[ Ex: GPT-4o / Claude / Gemini ] via function calling para interpretar comandos"),
      spacer(40),
      infoBox("Backend",              "[ Ex: Node.js / Python / Go ] — orquestra agente, Pix e Stellar"),
      spacer(40),
      infoBox("Blockchain",           "Stellar Network (Mainnet / Testnet em dev)"),
      spacer(40),
      infoBox("Stablecoin",           "USDC no ecossistema Stellar (emitido pela Circle)"),
      spacer(40),
      infoBox("Pix / Liquidez BRL",   "[ PSP parceiro — ex: Swap, OpenPix, Celcoin ]"),
      spacer(40),
      infoBox("Banco de Dados",       "[ Ex: PostgreSQL — metadados de usuários, chaves públicas ]"),
      spacer(40),
      infoBox("Custódia",             "Não-custodial — Passkey + WebAuthn PRF + SEP-30 recovery"),
      spacer(200),

      h2("5.2 Modelo de Custódia (Decisão Crítica)"),
      p("O TalkToStellar adota modelo não-custodial para evitar enquadramento como instituição custodiante de ativos digitais (Resolução BCB 219/2024). A chave privada do usuário nunca transita pelo servidor em texto claro."),
      spacer(80),
      h3("Fluxo de assinatura"),
      bullet("Chave Stellar gerada localmente no dispositivo do usuário (via WebCrypto API no browser)"),
      bullet("Chave privada encriptada usando output do WebAuthn PRF extension (biometria como fator)"),
      bullet("Blob encriptado armazenado no servidor — inútil sem a biometria do usuário"),
      bullet("Assinatura de transações ocorre no dispositivo — servidor nunca vê a chave em claro"),
      bullet("Recuperação via SEP-30 com múltiplos recovery servers para portabilidade"),
      spacer(80),
      h3("Fallback para dispositivos sem Passkey"),
      bullet("PIN com KDF (PBKDF2 / Argon2) como fator de encriptação"),
      bullet("SEP-30 com threshold de recuperação (ex: 2 de 3 servers)"),

      h2("5.3 Diagrama de Arquitetura"),
      placeholder("Insira aqui um diagrama da arquitetura (draw.io, Excalidraw, etc.) — fluxo completo do usuário até a rede Stellar"),

      divider(),

      // ─── 6. DECISÕES ───
      h1("6. Registro de Decisões (ADR)"),
      p("Todas as decisões relevantes de produto, tecnologia e negócio são registradas aqui. Atualizar sempre que uma nova decisão for tomada."),
      spacer(120),
      decisionTable([
        ["Rede blockchain",    "Ethereum, Solana, Base",                  "Stellar tem fees baixíssimos (~0,00001 XLM), finality rápida e suporte nativo a USDC via Circle. Ideal para micro-transações.",                                     "✅ Decidido"],
        ["Modelo de custódia", "Custodial (mais simples de UX), MPC third-party", "Não-custodial via Passkey + SEP-30 evita enquadramento regulatório como custodiante (BCB 219/2024).",                                                          "✅ Decidido"],
        ["Interface do usuário","App mobile nativo, web app, extensão browser","WhatsApp + Telegram: zero atrito de instalação, base de usuários já existente, interface familiar.",                                                               "✅ Decidido"],
        ["Agente de IA",       "GPT-4o, Claude, Gemini",                  "[ Justificativa — custo, latência, function calling, suporte a pt-BR ]",                                                                                              "🟡 Em avaliação"],
        ["PSP / On-ramp BRL",  "Swap, Celcoin, OpenPix, Barte",           "[ Justificativa — custo de integração, disponibilidade de API Pix, compliance ]",                                                                                    "🟡 Em avaliação"],
        ["[ Decisão futura ]", "[ Alternativas ]",                        "[ Justificativa ]",                                                                                                                                                    "⬜ Pendente"],
      ]),

      divider(),

      // ─── 7. MODELO DE NEGÓCIO ───
      h1("7. Modelo de Negócio"),

      h2("7.1 Fontes de Receita"),
      bullet("Spread na conversão BRL → USDC (ex: 0,5% a 1% sobre o valor convertido)"),
      bullet("Taxa por transação (ex: R$0,99 fixo ou % do valor enviado)"),
      bullet("Plano premium com limites maiores e taxas menores"),
      bullet("[ Ex: receita de yield sobre liquidez depositada aguardando conversão ]"),

      h2("7.2 Estrutura de Custos"),
      bullet("Custo de chamadas à API do WhatsApp Business (por mensagem)"),
      bullet("Custo do LLM por mensagem processada (tokens de entrada e saída)"),
      bullet("Custo de infraestrutura cloud (servidor, banco, monitoramento)"),
      bullet("Custo do PSP / liquidez Pix (taxa por transação Pix + spread do parceiro)"),
      bullet("Fees de rede Stellar (desprezível — ~0,00001 XLM por operação)"),

      h2("7.3 Unit Economics (estimativa)"),
      spacer(40),
      infoBox("CAC estimado",          "[ R$ X por usuário — como vai adquirir? ]"),
      spacer(40),
      infoBox("LTV estimado",          "[ R$ Y por usuário ao longo de Z meses ]"),
      spacer(40),
      infoBox("Volume mínimo viável",  "[ R$ X em volume mensal para break-even ]"),
      spacer(200),

      divider(),

      // ─── 8. REGULATÓRIO ───
      h1("8. Considerações Regulatórias e Legais"),

      h2("8.1 Framework Regulatório"),
      bullet("Resolução BCB 219/2024 — não enquadramento como custodiante (modelo não-custodial)"),
      bullet("Marco Legal das Criptomoedas (Lei 14.478/2022) — monitorar obrigações de prestadores de serviços de ativos virtuais (VASP)"),
      bullet("LGPD — dados de usuários, mensagens e metadados de transações"),
      bullet("AML/KYC — [ definir política de limites e verificação de identidade ]"),
      bullet("FATF Travel Rule — compliance acima de threshold definido (ex: USD 1.000)"),

      h2("8.2 Pontos de Atenção"),
      placeholder("Liste aqui os riscos regulatórios identificados e como o produto os mitiga"),
      bullet("[ Ex: limites de transação para não exigir KYC completo (ex: até R$3.000/mês sem KYC) ]"),
      bullet("[ Ex: parceria com PSP regulado para o lado Pix garante compliance de câmbio ]"),
      bullet("[ Ex: compliance com FATF travel rule acima de certo threshold via integração de identidade ]"),

      divider(),

      // ─── 9. TRAÇÃO ───
      h1("9. Tração e Métricas"),

      h2("9.1 Métricas de Sucesso (OKRs / KPIs)"),
      spacer(40),
      infoBox("Usuários cadastrados",           "[ Meta: X em Y semanas ]"),
      spacer(40),
      infoBox("Volume transacionado (BRL)",     "[ Meta: R$ X em Y semanas ]"),
      spacer(40),
      infoBox("Transações por usuário/mês",     "[ Meta: X ]"),
      spacer(40),
      infoBox("Taxa de conversão onboarding",   "[ Meta: X% ]"),
      spacer(40),
      infoBox("NPS / satisfação",               "[ Meta: X ]"),
      spacer(200),

      h2("9.2 Resultados Atuais"),
      placeholder("Atualize conforme surgem dados reais — entrevistas, testes, usuários piloto, volume movimentado"),
      bullet("[ Data ] — [ Resultado / aprendizado ]"),
      bullet("[ Data ] — [ Resultado / aprendizado ]"),

      h2("9.3 Evidências de Validação"),
      placeholder("Links para entrevistas, posts, feedback de usuários, dados de uso"),
      bullet("[ Link para entrevista 1 ]"),
      bullet("[ Link para entrevista 2 ]"),
      bullet("[ Link para post no X com engajamento ]"),

      divider(),

      // ─── 10. ROADMAP ───
      h1("10. Roadmap"),

      h2("10.1 Agora (MVP — Semana 1–4)"),
      bullet("Criação de carteira Stellar via mensagem (Passkey + SEP-30)"),
      bullet("Conversão BRL → USDC via Pix (integração com PSP parceiro)"),
      bullet("Envio de USDC via linguagem natural no WhatsApp"),
      bullet("Consulta de saldo via chat"),

      h2("10.2 Próximo (Pós-MVP — Mês 2–3)"),
      bullet("Integração com Telegram Bot"),
      bullet("Histórico de transações com filtros"),
      bullet("Limites e tiers de KYC"),
      bullet("Dashboard web básico"),

      h2("10.3 Futuro (Visão — Mês 4+)"),
      bullet("Suporte a outros pares além de BRL/USDC"),
      bullet("Yield em USDC (integração com protocolos DeFi em Stellar)"),
      bullet("Cartão virtual para gastos em USDC"),
      bullet("[ Feature adicional ]"),

      divider(),

      // ─── 11. LOG ───
      h1("11. Log de Atualizações"),
      p("Registre aqui cada vez que o documento for atualizado — data, quem atualizou e o que mudou."),
      spacer(80),
      logTable([
        [today,             "[ Seu nome ]",     "Criação do documento inicial"],
        ["[ DD/MM/AAAA ]",  "[ Nome ]",         "[ Descrição da atualização ]"],
        ["[ DD/MM/AAAA ]",  "[ Nome ]",         "[ Descrição da atualização ]"],
      ]),

      spacer(400),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 200, after: 0 },
        children: [new TextRun({ text: "— Fim do Registro Técnico v1.0 —", size: 20, italics: true, color: "999999", font: "Arial" })]
      }),
    ]
  }]
});

Packer.toBuffer(doc).then(buffer => {
  fs.writeFileSync("RT_TalkToStellar_v1.docx", buffer);
  console.log("✅ RT_TalkToStellar_v1.docx gerado com sucesso!");
});