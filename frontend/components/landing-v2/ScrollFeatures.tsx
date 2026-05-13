import React from 'react';
import { motion } from 'framer-motion';
import { MessageCircle, BrainCircuit, ShieldCheck, Zap, FileText, Download, Send, UserPlus } from 'lucide-react';
import ChatMockup, { ChatMessage } from './ChatMockup';

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
  const steps: { title: string, description: string, messages: ChatMessage[], color: string, animIcon: React.ReactNode }[] = [
    {
      title: "1. Fale com o Chat e se cadastre",
      description: "Iniciar é simples. Mande um 'Olá' e nosso sistema já te envia um link seguro para finalizar seu onboarding num instante.",
      color: "#00D2FF",
      animIcon: <PhaseIconAnim Icon={MessageCircle} color="#00D2FF" delay={0} />,
      messages: [
        { type: 'user', text: 'Olá!', time: '09:40' },
        { type: 'bot', text: 'Olá! Bem-vindo ao TalkToStellar. Para começar, por favor, clique no link abaixo para criar sua conta rapidamente.', time: '09:40' },
        { type: 'bot', text: <a href="#" className="text-blue-500 underline font-medium">Criar minha conta 🚀</a>, time: '09:40' },
        { type: 'user', text: 'Pronto! Conta criada.', time: '09:42' },
      ]
    },
    {
      title: "2. Cadastrar Contato",
      description: "Salve os dados de quem vai receber ou as suas próprias contas globais. Você faz isso de forma intuitiva, conversando.",
      color: "#4CA1EF",
      animIcon: <PhaseIconAnim Icon={UserPlus} color="#4CA1EF" delay={0.5} />,
      messages: [
        { type: 'user', text: 'Quero cadastrar minha conta Nomad.', time: '09:45' },
        { type: 'bot', text: 'Certo! Por favor, me informe o número da conta e o routing number (ABA) da sua Nomad.', time: '09:45' },
        { type: 'user', text: 'Conta 12345678, Routing 122105155', time: '09:46' },
        { type: 'bot', text: 'Contato salvo com sucesso como "Minha Conta Nomad". ✅', time: '09:46' },
      ]
    },
    {
      title: "3. Enviar Para o Contato",
      description: "Peça uma cotação e aprove para a conta cadastrada. Nossa IA estrutura a operação e mostra o valor da conversão.",
      color: "#00D2FF",
      animIcon: <PhaseIconAnim Icon={Send} color="#00D2FF" delay={1} />,
      messages: [
        { type: 'user', text: 'Converter R$5.000 para dólar e enviar para minha conta Nomad', time: '09:50' },
        { type: 'bot', text: 'Você está enviando R$5.000,00 para "Minha Conta Nomad".\n\nCotação atual: 1 USDC = R$ 5,02.\nVocê receberá: 994.50 USDC.', time: '09:50' },
        { type: 'bot', text: 'Para prosseguir, escaneie o código abaixo ou copie o Pix Copia e Cola:', time: '09:50' },
        { type: 'bot', text: <div className="bg-[#0C1421] text-[#9BA4B5] p-2.5 rounded-lg border border-white/[0.03] break-all text-[11px] font-mono text-center shadow-inner">00020101021126580014br.gov.bcb.pix.gui<br/>...</div>, time: '09:50' },
      ]
    },
    {
      title: "4. Transação Confirmada",
      description: "Assim que você confirma a transação, os dólares aterrissam quase em tempo real do outro lado (com comprovante).",
      color: "#4CA1EF",
      animIcon: <PhaseIconAnim Icon={Zap} color="#4CA1EF" delay={1.5} />,
      messages: [
        { type: 'bot', text: 'Transação de R$5.000,00 confirmada com sucesso! 💸', time: '09:52' },
        { type: 'bot', text: (
          <div className="flex flex-col gap-2">
            <span>Transação concluída! Aqui está o seu comprovante:</span>
            <div className="bg-[#0C1421] border border-white/[0.03] rounded-xl p-3 flex items-center gap-3 w-[200px] mt-1 relative overflow-hidden group hover:bg-[#162032] transition-colors cursor-pointer shadow-sm">
              <div className="w-10 h-10 bg-red-500/10 rounded-lg flex items-center justify-center shrink-0">
                <FileText className="w-5 h-5 text-red-500" />
              </div>
              <div className="flex flex-col min-w-0 flex-1">
                <span className="text-[#e9edef] text-sm font-medium truncate">Comprovante</span>
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
            Faça sua transação em <br className="hidden md:block" />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#00D2FF] to-[#4CA1EF] drop-shadow-[0_0_15px_rgba(0,210,255,0.4)]">
              poucos minutos
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
