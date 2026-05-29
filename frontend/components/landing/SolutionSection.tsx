import { motion } from 'framer-motion';
import { MessageCircle, Globe } from 'lucide-react';
import { useLanguage } from '@/lib/i18n';

export default function SolutionSection() {
  const { language } = useLanguage();
  const L = (pt: string, en: string) => language === "pt-BR" ? pt : en;

  return (
    <section id="solution" className="py-24 md:py-32 w-full flex flex-col items-center bg-transparent scroll-mt-24">
      <div className="w-full max-w-7xl mx-auto px-4 md:px-8 flex flex-col gap-12 md:gap-24">
        
        {/* Transition Headline */}
        <div className="w-full text-center mb-4 md:mb-10 mt-8">
          <motion.h2 
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-4xl md:text-5xl lg:text-5xl font-bold text-white leading-tight tracking-tight max-w-4xl mx-auto"
          >
            {L("Sua conta local com alcance de", "Your local account with the power of a")} <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#00D2FF] to-[#4CA1EF]">{L("conta global.", "global account.")}</span>
          </motion.h2>
          <motion.p
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
            className="text-lg md:text-xl text-[#9BA4B5] leading-relaxed font-light mt-6 max-w-2xl mx-auto"
          >
            {L("PIX, moedas, aplicação e retirada com a clareza e a simplicidade de uma conversa.", "PIX, currencies, applications, and withdrawals with the clarity and simplicity of the experience you already know.")}
          </motion.p>
        </div>

        {/* Feature 1 */}
        <motion.div 
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          className="flex flex-col md:flex-row items-center gap-10 md:gap-20 bg-white/5 border border-white/[0.03] rounded-2xl p-8 md:p-12 overflow-hidden relative"
        >
          <div className="w-full md:w-1/2 relative z-10">
            <div className="w-12 h-12 rounded-xl bg-[#00D2FF]/10 flex items-center justify-center mb-6">
              <Globe className="text-[#00D2FF] w-6 h-6" />
            </div>
            <h3 className="text-3xl md:text-4xl font-bold text-white mb-6 leading-tight">
              {L("Seu dinheiro com mais caminhos.", "Your money with more paths.")}
            </h3>
            <p className="text-lg text-[#9BA4B5] leading-relaxed mb-8">
              {L("Coloque dinheiro com PIX, escolha a moeda, aplique ou retire para seu PIX quando quiser, com menos etapas manuais e mais visibilidade.", "Add money with PIX, choose a currency, apply or withdraw to your PIX when you want, with fewer manual steps and more visibility.")}
            </p>
          </div>
          <div className="w-full md:w-1/2 relative h-[300px] rounded-2xl overflow-hidden border border-white/[0.03] bg-[#162032]">
            {/* Abstract visual representing global payment flow */}
            <div className="absolute inset-0 opacity-50" style={{ backgroundImage: 'radial-gradient(circle at 50% 50%, #22d3ee 0%, transparent 50%)', filter: 'blur(40px)' }}/>
            <div className="absolute top-8 left-8 bg-[#162032] border border-white/[0.03] rounded-xl p-4 shadow-[0_4px_24px_rgba(0,0,0,0.2)] flex items-center gap-4">
               <img src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=100&h=100" alt="Avatar" className="w-12 h-12 rounded-full object-cover" />
               <div>
                  <p className="text-xs text-[#9BA4B5]">{L("Saldo em dólares", "Dollar balance")}</p>
                  <p className="text-xl font-bold text-white">+ US$ 225,00</p>
               </div>
            </div>
            <div className="absolute bottom-8 right-8 bg-[#162032] border border-white/[0.03] rounded-xl p-4 shadow-[0_4px_24px_rgba(0,0,0,0.2)] flex items-center gap-4">
               <div>
                  <p className="text-xs text-[#9BA4B5]">{L("Você recebeu em reais", "You received in reais")}</p>
                  <p className="text-xl font-bold text-[#00D2FF]">+ R$ 1.125,00</p>
               </div>
               <img src="https://flagcdn.com/w40/br.png" alt="Brazil" className="w-10 h-10 rounded-full object-cover" />
            </div>
            {/* Connecting line */}
            <svg className="absolute top-0 left-0 w-full h-full" xmlns="http://www.w3.org/2000/svg">
               <path d="M120,60 C 200,60 150,220 250,220" fill="transparent" stroke="rgba(34, 211, 238, 0.4)" strokeWidth="2" strokeDasharray="5,5" />
            </svg>
          </div>
        </motion.div>

        {/* Feature 2 */}
        <motion.div 
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-100px" }}
          className="flex flex-col md:flex-row-reverse items-center gap-10 md:gap-20 bg-white/5 border border-white/[0.03] rounded-2xl p-8 md:p-12 overflow-hidden relative"
        >
          <div className="w-full md:w-1/2 relative z-10">
            <div className="w-12 h-12 rounded-xl bg-[#4CA1EF]/10 flex items-center justify-center mb-6">
              <MessageCircle className="text-[#4CA1EF] w-6 h-6" />
            </div>
            <h3 className="text-3xl md:text-4xl font-bold text-white mb-6 leading-tight">
              {L("Tudo onde você já conversa.", "Everything where you already chat.")}
            </h3>
            <p className="text-lg text-[#9BA4B5] leading-relaxed">
              {L("WhatsApp e Telegram já fazem parte do seu dia. Você diz se quer trazer, converter, aplicar ou retirar, e o assistente organiza a operação com valor, destino e confirmação.", "WhatsApp and Telegram are already part of your day. Say whether you want to add, convert, apply, or withdraw, and the assistant structures the operation through the most optimized available route.")}
            </p>
          </div>
          <div className="w-full md:w-1/2 relative h-[300px] rounded-2xl overflow-hidden border border-white/[0.03] bg-[#162032] flex items-center justify-center">
            {/* Chat Bubble Mockup */}
             <div className="space-y-4 w-full px-6">
                <div className="bg-[#162032] border border-white/[0.03] rounded-2xl rounded-tr-sm p-4 max-w-[80%] self-end ml-auto text-sm text-slate-200">
                  {L("Colocar R$ 500, converter para euros e aplicar.", "Add R$500, convert to euros, and apply.")}
                </div>
                <div className="bg-[#162032] border border-white/[0.03] rounded-2xl rounded-tl-sm p-4 max-w-[85%] text-sm text-slate-200 flex flex-col gap-2 shadow-[0_4px_24px_rgba(0,0,0,0.2)] shadow-[#00D2FF]/5">
                   <p>{L("Pronto. Encontrei a melhor rota para você.", "Done. I found the most optimized route.")}</p>
                   <div className="bg-[#162032] p-3 rounded-xl border border-white/[0.03]">
                      <p className="text-xs text-[#9BA4B5]">{L("Valor para aplicar", "Amount to apply")}</p>
                      <p className="text-lg font-bold text-[#00D2FF]">€ 92,00</p>
                   </div>
                   <button className="bg-[#4CA1EF] text-white font-medium py-2 rounded-lg mt-1 text-xs uppercase tracking-wider w-full">{L("Aplicar", "Apply")}</button>
                </div>
             </div>
          </div>
        </motion.div>

      </div>
    </section>
  );
}
