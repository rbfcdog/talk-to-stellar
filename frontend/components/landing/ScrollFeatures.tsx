import React from 'react';
import { motion } from 'framer-motion';
import { MessageCircle, FileText, Download, ArrowDownToLine, ArrowUpFromLine, PiggyBank } from 'lucide-react';
import ChatMockup, { ChatMessage } from './ChatMockup';
import { useLanguage } from '@/lib/i18n';

const PhaseIconAnim = ({ Icon, color, delay }: { Icon: any, color: string, delay: number }) => {
  const isCyan = color === '#00D2FF';
  const shadowColor = isCyan ? 'rgba(0, 210, 255, 0.3)' : 'rgba(76, 161, 239, 0.3)';
  return (
    <div className="relative w-full h-full flex items-center justify-center">
      <motion.div
        animate={{ 
          y: [-3, 3, -3],
          rotate: [-2, 2, -2]
        }}
        transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut', delay }}
        className="relative z-10 flex items-center justify-center w-[60px] h-[60px] rounded-2xl backdrop-blur-sm"
        style={{
          backgroundColor: `${color}15`,
          border: `1px solid ${color}30`,
          boxShadow: `0 8px 32px ${shadowColor}`
        }}
      >
        <Icon className="w-8 h-8" style={{ color }} />
      </motion.div>
      <motion.div
        animate={{ scale: [1, 1.5, 1], opacity: [0.5, 0, 0.5] }}
        transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut', delay }}
        className="absolute rounded-full"
        style={{ width: '40px', height: '40px', backgroundColor: `${color}20` }}
      />
    </div>
  )
}

export default function ScrollFeatures() {
  const { language } = useLanguage();
  const L = (pt: string, en: string) => language === "pt-BR" ? pt : en;
  const steps: { title: string, description: string, messages: ChatMessage[], color: string, animIcon: React.ReactNode }[] = [
    {
      title: L("1. Chame no chat e entre", "1. Message the Chat and Sign Up"),
      description: L("Começar é simples. A pessoa manda uma mensagem e recebe um link seguro para criar ou acessar a conta.", "Getting started is simple. Send a quick hello and the system sends you a secure link to finish onboarding in moments."),
      color: "#00D2FF",
      animIcon: <PhaseIconAnim Icon={MessageCircle} color="#00D2FF" delay={0} />,
      messages: [
        { type: 'user', text: L('oi', 'Hi!'), time: '09:40' },
        { type: 'bot', text: L('Olá. Para começar, abra este link seguro e entre na sua conta.', 'Hi. Welcome to TalkToStellar. To get started, open the secure link below and create your account.'), time: '09:40' },
        { type: 'bot', text: <a href="#" className="text-blue-500 underline font-medium">{L("Entrar na conta", "Create my account")}</a>, time: '09:40' },
        { type: 'user', text: L('Pronto. Entrei.', 'Done. Account created.'), time: '09:42' },
      ]
    },
    {
      title: L("2. Traga dinheiro por PIX", "2. Add Money with PIX"),
      description: L("Digite valor e moeda. A tela abre com PIX preenchido, mostra quanto entra e mantém a chave de retirada separada para quando você quiser sair.", "Type the amount and currency. The screen opens with PIX prefilled, shows what enters the account, and keeps withdrawal details for later."),
      color: "#4CA1EF",
      animIcon: <PhaseIconAnim Icon={ArrowDownToLine} color="#4CA1EF" delay={0.5} />,
      messages: [
        { type: 'user', text: L('Colocar R$ 500 via PIX e manter em euro.', 'Add R$500 with PIX and keep it in euros.'), time: '09:45' },
        { type: 'bot', text: L('Abri o PIX com valor e moeda preenchidos. Antes do PIN, você vê taxa, valor final e saldo esperado.', 'I opened PIX with amount and currency prefilled. Before PIN, you see fee, final amount, and expected balance.'), time: '09:45' },
        { type: 'bot', text: <a href="#" className="text-blue-500 underline font-medium">{L("Abrir PIX", "Open PIX")}</a>, time: '09:45' },
      ]
    },
    {
      title: L("3. Aplique ou retire", "3. Apply or withdraw"),
      description: L("Depois que o saldo entra, o assistente mostra opções por moeda e prepara entrada ou saída com confirmação clara.", "After the balance arrives, the assistant shows options by currency and prepares entry or exit with clear confirmation."),
      color: "#00D2FF",
      animIcon: <PhaseIconAnim Icon={PiggyBank} color="#00D2FF" delay={1} />,
      messages: [
        { type: 'user', text: L('Quais opções eu tenho?', 'Which options do I have?'), time: '09:50' },
        { type: 'bot', text: L('Opções disponíveis agora:\n1. Reais\n2. Dólares\n3. Euros\n\nVocê confere os valores antes de confirmar.', 'Available options now:\n1. Reais\n2. Dollars\n3. Euros\n\nYou check values before confirming.'), time: '09:50' },
        { type: 'user', text: L('Aplicar 200 euros.', 'Apply 200 euros.'), time: '09:51' },
      ]
    },
    {
      title: L("4. Saia para seu PIX", "4. Withdraw to PIX"),
      description: L("Quando quiser retirar, digite a chave PIX no momento da saída. A tela mostra quanto sai, quanto chega em reais e registra o comprovante.", "When you want to withdraw, enter the PIX key at the moment. The screen shows what leaves, what arrives in reais, and stores the receipt."),
      color: "#4CA1EF",
      animIcon: <PhaseIconAnim Icon={ArrowUpFromLine} color="#4CA1EF" delay={1.5} />,
      messages: [
        { type: 'user', text: L('Retirar 80 euros para meu PIX user@example.com', 'Withdraw 80 euros to my PIX user@example.com'), time: '09:52' },
        { type: 'bot', text: L('A retirada está pronta. Antes do PIN, você verá quanto chega em reais no seu PIX.', 'The withdrawal is ready. Before PIN, you will see how much arrives in reais in your PIX.'), time: '09:52' },
        { type: 'bot', text: (
          <div className="flex flex-col gap-2">
            <span>{L("Retirada concluída. Aqui está o comprovante:", "Withdrawal complete. Here is your receipt:")}</span>
            <div className="bg-[#0C1421] border border-white/[0.03] rounded-xl p-3 flex items-center gap-3 w-[200px] mt-1 relative overflow-hidden group hover:bg-[#162032] transition-colors cursor-pointer shadow-sm">
              <div className="w-10 h-10 bg-red-500/10 rounded-lg flex items-center justify-center shrink-0">
                <FileText className="w-5 h-5 text-red-500" />
              </div>
              <div className="flex flex-col min-w-0 flex-1">
                <span className="text-[#e9edef] text-sm font-medium truncate">{L("Comprovante", "Receipt")}</span>
                <span className="text-[#9BA4B5] text-[10px] uppercase tracking-wider">PDF • 120 KB</span>
              </div>
              <Download className="w-4 h-4 text-[#9BA4B5] absolute right-3 opacity-0 group-hover:opacity-100 transition-opacity" />
            </div>
          </div>
        ), time: '09:52' },
      ]
    }
  ];

  return (
    <section id="how-it-works" className="relative w-full py-16 md:py-24 scroll-mt-24">
      <div className="max-w-7xl mx-auto flex flex-col items-center gap-16 px-4 sm:px-6 lg:px-8">
        
        {/* Huge Intro Text */}
        <div className="flex items-center pb-8 text-center">
          <motion.h2 
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-100px" }}
            transition={{ duration: 0.8 }}
            className="text-4xl md:text-5xl lg:text-[72px] font-extrabold leading-[1.1] tracking-tight text-white w-full"
          >
            {L("Conclua sua operação em", "Complete your transaction in")} <br className="hidden md:block" />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#00D2FF] to-[#4CA1EF] drop-shadow-[0_0_15px_rgba(0,210,255,0.4)]">
              {L("poucos minutos", "just a few minutes")}
            </span>
          </motion.h2>
        </div>

        {/* Steps List (Alternating Layout) */}
        <div className="flex flex-col gap-24 relative w-full mt-10">
          {steps.map((step, index) => (
            <motion.div 
              key={index}
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-10%" }}
              transition={{ duration: 0.6 }}
              className={`flex flex-col ${index % 2 === 0 ? 'lg:flex-row' : 'lg:flex-row-reverse'} gap-12 lg:gap-20 items-center lg:items-center relative z-10 w-full`}
            >
              {/* Text Side */}
              <div className={`w-full lg:w-1/2 flex flex-col gap-6 text-left items-start`}>
                <div className="flex flex-col sm:flex-row sm:items-center gap-5">
                  <div className="shrink-0 w-20 h-20 flex items-center justify-center">
                    {step.animIcon}
                  </div>
                  <h3 className="text-3xl md:text-4xl font-bold text-white tracking-tight">
                    {step.title}
                  </h3>
                </div>
                
                <p className={`text-xl text-[#9BA4B5] leading-relaxed max-w-lg`}>
                  {step.description}
                </p>
              </div>

              {/* Chat Mockup Side */}
              <div className="w-full lg:w-1/2 flex justify-center">
                <ChatMockup messages={step.messages} className="transform hover:scale-105 transition-transform duration-500 ease-out" />
              </div>

            </motion.div>
          ))}
        </div>

      </div>
    </section>
  );
}
