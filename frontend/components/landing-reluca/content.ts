export type Lang = "pt-BR" | "en"

const c = {
  nav: {
    "pt-BR": ["A Solução", "Simulação de Conversão", "Como Funciona", "FAQ"],
    en: ["Solution", "Conversion Simulator", "How It Works", "FAQ"],
  },
  hero: {
    badge: {
      "pt-BR": "PRODUTO EM VALIDAÇÃO",
      en: "PRODUCT IN VALIDATION",
    },
    title1: {
      "pt-BR": "Converta ativos.",
      en: "Convert assets.",
    },
    title2: {
      "pt-BR": "Com uma mensagem.",
      en: "With one message.",
    },
    subtitle: {
      "pt-BR": "O jeito mais rápido e barato de converter entre ativos com taxa transparente. Faça o Pix e converta para dólar direto pelo WhatsApp ou Telegram, com o melhor custo de roteamento do mercado.",
      en: "The fastest and cheapest way to convert between assets with transparent fees. Pay with Pix and convert to dollars directly from WhatsApp or Telegram, with the best routing cost in the market.",
    },
    btnTelegram: { "pt-BR": "Telegram", en: "Telegram" },
    btnWhatsApp: { "pt-BR": "WhatsApp", en: "WhatsApp" },
    btnWebChat: { "pt-BR": "Abrir chat web", en: "Open web chat" },
    card1Title: { "pt-BR": "Comece pelo chat", en: "Start from chat" },
    card1Body: { "pt-BR": "Abra WhatsApp, Telegram ou chat web e peça saldo, PIX ou conversão.", en: "Open WhatsApp, Telegram or web chat and ask for balance, PIX or conversion." },
    card2Title: { "pt-BR": "Revise antes de confirmar", en: "Review before confirming" },
    card2Body: { "pt-BR": "Comparamos rotas em tempo real e mostramos taxas antes do aceite.", en: "We compare routes in real time and show fees before approval." },
  },
  problem: {
    title: {
      "pt-BR": "Mover dinheiro entre ativos não precisa ser caro.",
      en: "Moving money between assets shouldn't be expensive.",
    },
    subtitle: {
      "pt-BR": "Bancos lucram com spread escondido e corretoras com tarifas abusivas. Nós usamos a rede Stellar para cortar intermediários, liquidando transações em segundos com taxas transparentes e custo até 20x menor que o mercado tradicional.",
      en: "Banks profit from hidden spreads and brokerages from abusive fees. We use the Stellar network to cut out intermediaries, settling transactions in seconds with transparent fees at up to 20x less than traditional markets.",
    },
    f1Title: { "pt-BR": "Esqueça novos downloads.", en: "Forget new downloads." },
    f1Body: {
      "pt-BR": "Sem aplicativos pesados, senhas complexas ou jargões do mercado financeiro. Com o TalkToStellar, a sua ponte para o dólar funciona diretamente no WhatsApp. Simples, sem atrito e onde você já conversa todo dia.",
      en: "No heavy apps, complex passwords or financial jargon. With TalkToStellar, your bridge to dollars works directly on WhatsApp. Simple, frictionless, and where you already chat every day.",
    },
    f2Title: { "pt-BR": "Custo real, sem entrelinhas.", en: "Real cost, no fine print." },
    f2Body: {
      "pt-BR": "Escondidas no spread cambial e taxas operacionais, as instituições tradicionais engolem até 6% do seu dinheiro. Nós eliminamos isso conectando você diretamente aos provedores de liquidez da rede Stellar, garantindo o menor custo de roteamento do mercado.",
      en: "Hidden in exchange rate spreads and operational fees, traditional institutions swallow up to 6% of your money. We eliminate this by connecting you directly to Stellar network liquidity providers, guaranteeing the lowest routing cost in the market.",
    },
    f3Title: { "pt-BR": "Velocidade de liquidação.", en: "Settlement speed." },
    f3Body: {
      "pt-BR": "As transferências internacionais tradicionais operam em horário comercial e podem levar dias. Usando a nossa infraestrutura, o seu Pix cruza o globo e vira dólar digital na conta de destino em cerca de 5 segundos. 24 horas por dia, 7 dias por semana.",
      en: "Traditional international transfers operate during business hours and can take days. Using our infrastructure, your Pix crosses the globe and becomes digital dollars in the destination account in about 5 seconds. 24 hours a day, 7 days a week.",
    },
  },
  solution: {
    title: {
      "pt-BR": "Transações entre ativos com o menor custo do mercado.",
      en: "Asset-to-asset transactions at the lowest market cost.",
    },
    subtitle: {
      "pt-BR": "Toda a eficiência e segurança da infraestrutura financeira moderna, totalmente invisível aos seus olhos. Você só interage com o aplicativo de mensagens que já sabe usar.",
      en: "All the efficiency and security of modern financial infrastructure, completely invisible to your eyes. You only interact with the messaging app you already know how to use.",
    },
    s1Title: { "pt-BR": "Seu dinheiro livre de fronteiras financeiras.", en: "Your money free from financial borders." },
    s1Body: {
      "pt-BR": "Envie e receba de qualquer lugar do mundo. Transformamos o seu Pix em um passaporte financeiro global rodando direto na Stellar Network. Menos intermediários, zero atrasos.",
      en: "Send and receive from anywhere in the world. We transform your Pix into a global financial passport running directly on the Stellar Network. Fewer intermediaries, zero delays.",
    },
    s2Title: { "pt-BR": "Tudo por onde você já conversa.", en: "Everything where you already chat." },
    s2Body: {
      "pt-BR": "WhatsApp e Telegram já fazem parte do seu dia. Nossa Inteligência Artificial entende a sua intenção em linguagem natural. Basta digitar o que você quer converter ou pagar, e nosso agente estrutura toda a operação financeira pela rota mais eficiente.",
      en: "WhatsApp and Telegram are already part of your day. Our AI understands your intent in natural language. Just type what you want to convert or pay, and our agent structures the entire financial operation through the most efficient route.",
    },
  },
  pathfinding: {
    tag: {
      "pt-BR": "O Segredo do Preço Baixo",
      en: "The Secret to Low Prices",
    },
    title1: { "pt-BR": "A Rota Mais Barata.", en: "The Cheapest Route." },
    title2: { "pt-BR": "Sempre.", en: "Always." },
    subtitle: {
      "pt-BR": "Esqueça o IOF abusivo e as taxas surpresas. Nossa infraestrutura varre o mercado em milissegundos para encontrar a rota de conversão mais barata para o seu dólar, liquidando a operação antes mesmo de você piscar.",
      en: "Forget abusive IOF and surprise fees. Our infrastructure scans the market in milliseconds to find the cheapest conversion route for your dollar, settling the operation before you even blink.",
    },
    chatUser: { "pt-BR": "Converta R$ 250 e pague via Pix.", en: "Convert R$ 250 and pay via Pix." },
    cex: { "pt-BR": "Intermediários Tradicionais", en: "Traditional Intermediaries" },
    tts: { "pt-BR": "TalkToStellar", en: "TalkToStellar" },
    global: { "pt-BR": "Contas Globais App", en: "Global Account Apps" },
    cost: { "pt-BR": "Custo", en: "Cost" },
    time: { "pt-BR": "Tempo", en: "Time" },
    bestRoute: { "pt-BR": "Melhor Rota", en: "Best Route" },
  },
  simulator: {
    title1: { "pt-BR": "Simule sua", en: "Simulate your" },
    title2: { "pt-BR": "economia", en: "savings" },
    subtitle: {
      "pt-BR": "Descubra o quanto você deixa de pagar em taxas abusivas usando nossa rota de conversão inteligente.",
      en: "Discover how much you save on abusive fees using our intelligent conversion route.",
    },
    rateLabel: { "pt-BR": "Taxa de câmbio estimada", en: "Estimated exchange rate" },
    youSend: { "pt-BR": "Você envia", en: "You send" },
    youReceive: { "pt-BR": "Você recebe (estimativa)", en: "You receive (estimate)" },
    sendNow: { "pt-BR": "Enviar dinheiro agora", en: "Send money now" },
    comparisonTitle: { "pt-BR": "Por que a nossa rota é imbatível?", en: "Why is our route unbeatable?" },
    banks: { "pt-BR": "Bancos Tradicionais", en: "Traditional Banks" },
    banksSub: { "pt-BR": "Taxas altas e demoradas", en: "High fees and slow" },
    youLose: { "pt-BR": "Você perde até", en: "You lose up to" },
    ttsSub: { "pt-BR": "A melhor rota blockchain", en: "The best blockchain route" },
    from: { "pt-BR": "Taxas mínimas a partir de", en: "Minimum fees from" },
    bestGuaranteed: { "pt-BR": "Maior economia garantida", en: "Best savings guaranteed" },
    apps: { "pt-BR": "Contas Globais", en: "Global Accounts" },
    appsSub: { "pt-BR": "Apps de conversão em dólar", en: "Dollar conversion apps" },
    avgSpread: { "pt-BR": "de spread médio", en: "average spread" },
    spreadIof: { "pt-BR": "(Spread + IOF)", en: "(Spread + IOF)" },
  },
  scroll: {
    title1: { "pt-BR": "Faça sua transação em", en: "Make your transaction in" },
    title2: { "pt-BR": "poucos segundos", en: "just seconds" },
    steps: {
      "pt-BR": [
        { title: "1. Inicie a conversa", description: "Mande um 'Olá' no WhatsApp ou Telegram e nosso sistema gera um ambiente seguro para você operar em instantes." },
        { title: "2. Informe o destino", description: "Diga para qual conta global você quer enviar ou salve seus contatos. Tudo de forma intuitiva, apenas conversando." },
        { title: "3. Aceite a cotação", description: "Peça a conversão e nossa IA apresenta a rota mais barata na hora. Se estiver de acordo com as taxas transparentes, é só confirmar." },
        { title: "4. Pague via Pix", description: "Assim que você faz o Pix, os dólares aterrissam quase em tempo real no destino final, e você recebe o comprovante no próprio chat." },
      ],
      en: [
        { title: "1. Start the conversation", description: "Say 'Hello' on WhatsApp or Telegram and our system creates a secure environment for you to operate instantly." },
        { title: "2. Set the destination", description: "Tell us which global account you want to send to or save your contacts. All intuitive, just by chatting." },
        { title: "3. Accept the quote", description: "Ask for conversion and our AI presents the cheapest route instantly. If you agree with the transparent fees, just confirm." },
        { title: "4. Pay via Pix", description: "As soon as you make the Pix, dollars land almost in real time at the final destination, and you receive the receipt in the chat." },
      ],
    },
  },
  faq: {
    title: { "pt-BR": "Perguntas Frequentes", en: "Frequently Asked Questions" },
    items: {
      "pt-BR": [
        { q: "O TalkToStellar é uma conta internacional?", a: "Sim — é a sua conta global no chat. Você traz reais por PIX, converte para dólar, guarda, rende, e paga contatos. Tudo vive dentro da sua conta TalkToStellar." },
        { q: "O que é o TalkToStellar?", a: "O TalkToStellar é sua conta global operada inteiramente por chat. Você fala com um assistente por WhatsApp, Telegram ou web — ele gerencia seus saldos, converte reais para dólares, processa pagamentos e mantém seu histórico com comprovantes Stellar verificáveis." },
        { q: "Como funciona a conversão?", a: "Você diz quanto quer converter. Seus reais entram por PIX, nosso Algoritmo de Roteamento acha a melhor taxa, e os dólares caem na sua conta TalkToStellar — prontos para guardar, investir ou enviar para um contato." },
        { q: "É seguro usar o TalkToStellar?", a: "Sim. Todas as transações são registradas publicamente na blockchain da Stellar, garantindo transparência total e segurança criptográfica. Nós não temos acesso aos fundos da sua carteira após a liquidação da transação." },
        { q: "Quais são as taxas cobradas?", a: "Nós eliminamos spread oculto e taxas abusivas de bancos tradicionais. Usamos o Algoritmo de Roteamento TalkToStellar e a rede subjacente para garantir taxas a partir de 0.05% por operação, sempre mostrando o valor comercial final antes de você aceitar." },
        { q: "Preciso baixar algum aplicativo novo?", a: "Não! Todo o processo acontece dentro dos aplicativos de mensagens que você já usa todos os dias, como WhatsApp ou Telegram. Basta iniciar uma conversa com o nosso bot." },
      ],
      en: [
        { q: "Is TalkToStellar an international account?", a: "Yes — it's your global account in the chat. You bring reais in via PIX, convert to dollars, hold them, earn yield, and pay contacts. Everything lives inside your TalkToStellar account." },
        { q: "What is TalkToStellar?", a: "TalkToStellar is your global account operated entirely through chat. You talk to an AI assistant on WhatsApp, Telegram, or web — it manages your balances, converts reais to dollars, processes payments, and tracks your history with verifiable Stellar receipts." },
        { q: "How does conversion work?", a: "You tell us how much you want to convert. Your reais enter via PIX, our Routing Algorithm finds the best rate, and the dollars land in your TalkToStellar account — ready to hold, invest, or send to a contact." },
        { q: "Is it safe to use TalkToStellar?", a: "Yes. All transactions are publicly recorded on the Stellar blockchain, ensuring total transparency and cryptographic security. We do not have access to your wallet funds after transaction settlement." },
        { q: "What are the fees?", a: "We eliminate hidden spreads and abusive fees from traditional banks. We use the TalkToStellar Routing Algorithm and the underlying network to guarantee fees from 0.05% per operation, always showing the final commercial value before you accept." },
        { q: "Do I need to download a new app?", a: "No! The entire process happens within the messaging apps you already use every day, such as WhatsApp or Telegram. Just start a conversation with our bot." },
      ],
    },
  },
  cta: {
    title1: { "pt-BR": "Pare de perder dinheiro", en: "Stop losing money" },
    title2: { "pt-BR": "com taxas abusivas.", en: "to abusive fees." },
    subtitle: {
      "pt-BR": "Inicie sua primeira conversão agora mesmo. Use o Pix para colocar reais e converter para dólar pagando uma fração do custo tradicional. Rápido, seguro e direto no seu aplicativo favorito.",
      en: "Start your first conversion right now. Use Pix to bring in reais and convert to dollars at a fraction of the traditional cost. Fast, secure and straight from your favorite app.",
    },
    stat1Value: { "pt-BR": "Até 5 segundos", en: "Up to 5 seconds" },
    stat1Label: { "pt-BR": "Tempo de liquidação", en: "Settlement time" },
    stat2Value: { "pt-BR": "24/7", en: "24/7" },
    stat2Label: { "pt-BR": "Disponibilidade PIX", en: "PIX Availability" },
    stat3Value: { "pt-BR": "4%", en: "4%" },
    stat3Label: { "pt-BR": "Economia média em taxas", en: "Average fee savings" },
  },
  earlyAccess: {
    eyebrow: { "pt-BR": "Acesso antecipado", en: "Early access" },
    title: { "pt-BR": "Entre na lista privada", en: "Join the private list" },
    subtitle: {
      "pt-BR": "Receba o convite quando abrirmos novos testes de conversão PIX, dólar e multiativos.",
      en: "Get the invite when we open new Pix, dollar, and multi-asset conversion tests.",
    },
    label: { "pt-BR": "E-mail", en: "Email" },
    placeholder: { "pt-BR": "seu@email.com", en: "you@example.com" },
    submit: { "pt-BR": "Entrar na lista", en: "Join list" },
    submitting: { "pt-BR": "Salvando", en: "Saving" },
    success: {
      "pt-BR": "Lista recebida. Vamos te avisar quando abrirmos mais vagas.",
      en: "You are on the list. We will tell you when more spots open.",
    },
    invalid: { "pt-BR": "Informe um e-mail válido para entrar na lista.", en: "Enter a valid email to join the list." },
    error: {
      "pt-BR": "Não consegui salvar seu e-mail agora. Tente novamente em alguns segundos.",
      en: "Could not save your email right now. Try again in a few seconds.",
    },
    privacy: {
      "pt-BR": "Sem spam. Só convite e atualizações importantes.",
      en: "No spam. Only invites and important updates.",
    },
  },
  footer: {
    description: {
      "pt-BR": "Sua conta local com o poder de uma carteira global. Dolarize seu capital em segundos.",
      en: "Your local account with the power of a global wallet. Dollarize your capital in seconds.",
    },
    product: { "pt-BR": "Produto", en: "Product" },
    solution: { "pt-BR": "A Solução", en: "Solution" },
    simulation: { "pt-BR": "Simulação", en: "Simulation" },
    howItWorks: { "pt-BR": "Como Funciona", en: "How It Works" },
    legal: { "pt-BR": "Legal", en: "Legal" },
    tos: { "pt-BR": "Termos de Uso", en: "Terms of Service" },
    privacy: { "pt-BR": "Política de Privacidade", en: "Privacy Policy" },
    contacts: { "pt-BR": "Contatos", en: "Contacts" },
    rights: { "pt-BR": "Todos os direitos reservados.", en: "All rights reserved." },
    built: { "pt-BR": "Construído para", en: "Built for" },
  },
  navLangs: {
    "pt-BR": { pt: "PT", en: "EN" },
    en: { pt: "PT", en: "EN" },
  },
}

export function t(key: keyof typeof c, lang: Lang, subKey?: string): any {
  const entry = c[key]
  if (subKey && typeof entry === "object" && entry !== null && !Array.isArray(entry)) {
    const sub = (entry as Record<string, any>)[subKey]
    if (sub && typeof sub === "object" && lang in sub) return sub[lang]
    return sub
  }
  if (typeof entry === "object" && entry !== null && lang in entry) return (entry as Record<string, any>)[lang]
  return entry
}
