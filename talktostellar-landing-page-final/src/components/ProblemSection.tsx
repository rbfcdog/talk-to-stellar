import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Smartphone, BadgeDollarSign, Zap, MessageCircle, ArrowRightLeft, Timer, CheckCheck, ArrowRight } from 'lucide-react';
import { StellarLogo } from './StellarLogo';

export default function ProblemSection() {
  return (
    <section className="py-24 md:py-32 w-full mx-auto max-w-7xl px-4 md:px-8 relative bg-transparent flex flex-col items-center">
      
      {/* Header Section */}
      <div className="w-full max-w-3xl mx-auto text-center mb-20 relative z-10">
        <motion.h2 
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-3xl md:text-5xl font-bold mb-6 text-white leading-tight"
        >
          Converter não precisa ser caro e muito menos difícil.
        </motion.h2>
        
        <motion.p 
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.1 }}
          className="text-lg md:text-xl text-[#9BA4B5] leading-relaxed font-light max-w-2xl mx-auto"
        >
          Bancos lucram com a sua paciência e corretoras com a sua pressa. Nós usamos a tecnologia da rede Stellar para cortar os intermediários, dolarizando seu capital em segundos, com taxas transparentes e uma fração do custo tradicional.
        </motion.p>
      </div>

      <div className="w-full flex flex-col gap-8 relative z-10">
        
        {/* Feature 1: No app */}
        <motion.div 
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="w-full bg-[#121212]/40 backdrop-blur-md border border-white/[0.05] rounded-2xl overflow-hidden flex flex-col md:flex-row group hover:bg-[#121212]/60 hover:border-white/[0.05] transition-all duration-500"
        >
          <div className="w-full md:w-1/2 p-10 md:p-16 flex flex-col justify-center">
            <h3 className="text-2xl md:text-3xl font-bold text-white mb-6">Esqueça novos downloads.</h3>
            <p className="text-[#9BA4B5] text-lg leading-relaxed mb-8">
              Sem aplicativos pesados, senhas complexas ou jargões do mercado financeiro. Com o TalkToStellar, a sua ponte para o dólar funciona diretamente no WhatsApp. Simples, sem atrito e onde você já conversa todo dia.
            </p>
          </div>
          <div className="w-full md:w-1/2 bg-[#080808] min-h-[350px] flex items-center justify-center p-8 relative overflow-hidden">
             <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-[#E59E25]/10 via-transparent to-transparent opacity-60" />
             
             {/* WhatsApp Chat Animation */}
             <div className="relative z-10 w-full max-w-[280px]">
                <div className="bg-[#121212] rounded-2xl border-[6px] border-[#1a1a1a] shadow-[0_4px_24px_rgba(0,0,0,0.2)] overflow-hidden transform group-hover:scale-105 transition-transform duration-700 ease-out">
                  {/* Header */}
                  <div className="bg-[#121212] px-4 py-3 flex items-center gap-3 border-b border-white/[0.05]">
                    <div className="w-10 h-10 rounded-full flex-shrink-0 bg-[#080808] flex items-center justify-center border border-white/[0.05]">
                      <StellarLogo className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <div className="text-white font-medium text-sm flex items-center gap-1.5">TalkToStellar <CheckCheck className="w-3.5 h-3.5 text-[#E59E25]" /></div>
                      <div className="text-[#9BA4B5] text-xs">bot</div>
                    </div>
                  </div>
                  {/* Body */}
                  <div className="p-4 bg-[#080808] flex flex-col gap-3 min-h-[200px] relative [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]" style={{ backgroundImage: 'url("https://www.transparenttextures.com/patterns/cubes.png")', opacity: 0.95 }}>
                    <div className="self-start bg-[#121212] text-[#e9edef] px-3 py-2.5 rounded-xl rounded-tl-sm text-[13px] shadow-[0_2px_10px_rgba(0,0,0,0.1)] max-w-[90%] leading-relaxed border border-white/[0.05] mt-2 relative z-10">
                      Como posso ajudar com suas finanças hoje?
                      <div className="text-[9px] text-[#9BA4B5] text-right mt-1 opacity-80">09:41</div>
                    </div>
                    <motion.div 
                      initial={{ opacity: 0, y: 10 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.5 }}
                      className="self-end bg-[#E59E25] text-black px-3 py-2.5 rounded-xl rounded-tr-sm text-[13px] max-w-[90%] shadow-[0_2px_10px_rgba(0,0,0,0.1)] leading-relaxed mt-2"
                    >
                      Converter R$1000 para Dólares 💵
                      <div className="text-[9px] text-black/70 text-right mt-1">09:42 <CheckCheck className="inline w-3 h-3 text-[#D48C1C]" /></div>
                    </motion.div>
                  </div>
                </div>
             </div>
          </div>
        </motion.div>

        {/* Feature 2: Cost */}
        <motion.div 
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="w-full bg-[#121212]/40 backdrop-blur-md border border-white/[0.05] rounded-2xl overflow-hidden flex flex-col md:flex-row-reverse group hover:bg-[#121212]/60 hover:border-white/[0.05] transition-all duration-500"
        >
          <div className="w-full md:w-1/2 p-10 md:p-16 flex flex-col justify-center">
            <h3 className="text-2xl md:text-3xl font-bold text-white mb-6">Custo real, sem entrelinhas.</h3>
            <p className="text-[#9BA4B5] text-lg leading-relaxed mb-8">
              Escondidas no "spread" cambial e "taxas operacionais", as instituições tradicionais engolem até 6% do seu dinheiro. Nós eliminamos isso conectando você diretamente aos provedores de liquidez da rede Stellar, garantindo o menor custo de roteamento do mercado.
            </p>
          </div>
          <div className="w-full md:w-1/2 bg-[#080808] min-h-[350px] flex items-center justify-center p-8 relative overflow-hidden">
             <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-[#D48C1C]/10 via-transparent to-transparent opacity-60" />
             
             {/* Exchange Animation Component */}
             <div className="relative z-10 w-full max-w-sm flex flex-col gap-2">
                <motion.div 
                  className="bg-white/5 border border-white/[0.05] rounded-2xl p-5 flex justify-between items-center backdrop-blur-sm z-10"
                  whileHover={{ scale: 1.02, translateX: 10 }}
                  transition={{ duration: 0.3 }}
                >
                  <div>
                    <div className="text-[#9BA4B5] text-xs uppercase tracking-widest font-medium mb-1">Você envia via Pix</div>
                    <div className="text-2xl font-bold text-white">R$ 5.000,00</div>
                  </div>
                  <div className="w-10 h-10 rounded-full border border-white/[0.05] bg-[#121212] flex items-center justify-center">
                    <img src="https://flagcdn.com/w40/br.png" alt="BRL" className="w-6 h-6 rounded-full object-cover" />
                  </div>
                </motion.div>
                
                <div className="flex justify-center -my-3 relative z-20">
                  <motion.div 
                    animate={{ rotate: 180 }}
                    transition={{ ease: "easeInOut", duration: 3, repeat: Infinity, repeatDelay: 1 }}
                    className="bg-[#121212] border border-[#E59E25]/30 rounded-full p-2.5 text-[#E59E25] shadow-[0_4px_24px_rgba(0,0,0,0.2)] shadow-[#E59E25]/10"
                  >
                    <ArrowRightLeft className="w-5 h-5 rotate-90" />
                  </motion.div>
                </div>
                
                <motion.div 
                  className="bg-[#121212]/80 border border-[#D48C1C]/30 rounded-2xl p-5 flex justify-between items-center backdrop-blur-sm shadow-[0_4px_24px_rgba(0,0,0,0.2)] shadow-[#D48C1C]/10 z-10"
                  whileHover={{ scale: 1.02, translateX: -10 }}
                  transition={{ duration: 0.3 }}
                >
                  <div>
                    <div className="text-[#9BA4B5] text-xs uppercase tracking-widest font-medium mb-1">Você recebe digital</div>
                    <div className="text-2xl font-bold text-[#D48C1C]">918.52 <span className="text-white">USDC</span></div>
                  </div>
                  <div className="w-10 h-10 rounded-full border border-white/[0.05] bg-[#121212] flex items-center justify-center overflow-hidden">
                    <span className="text-white font-bold text-sm">USD</span>
                  </div>
                </motion.div>
                
             </div>
          </div>
        </motion.div>

        {/* Feature 3: Speed */}
        <motion.div 
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="w-full bg-[#121212]/40 backdrop-blur-md border border-white/[0.05] rounded-2xl overflow-hidden flex flex-col md:flex-row group hover:bg-[#121212]/60 hover:border-white/[0.05] transition-all duration-500"
        >
          <div className="w-full md:w-1/2 p-10 md:p-16 flex flex-col justify-center">
            <h3 className="text-2xl md:text-3xl font-bold text-white mb-6">Velocidade de liquidação.</h3>
            <p className="text-[#9BA4B5] text-lg leading-relaxed mb-8">
              As transferências internacionais tradicionais operam em horário comercial e podem levar dias. Usando a nossa infraestrutura, o seu Pix cruza o globo e vira dólar digital na conta de destino em cerca de 5 segundos. 24 horas por dia, 7 dias por semana.
            </p>
          </div>
          <div className="w-full md:w-1/2 bg-[#080808] min-h-[350px] flex items-center justify-center p-8 relative overflow-hidden">
             <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-[#E59E25]/10 via-transparent to-transparent opacity-60" />
             
             {/* Node Transfer Animation */}
             <div className="relative w-full max-w-sm h-48 flex items-center justify-between">
                
                {/* Node A */}
                <div className="w-20 h-20 rounded-full bg-[#121212] border border-white/[0.05] flex items-center justify-center z-10 relative shadow-[0_4px_24px_rgba(0,0,0,0.2)]">
                  <div className="absolute -top-8 text-[11px] text-[#9BA4B5] font-medium tracking-widest uppercase">Origem</div>
                  <div className="absolute inset-2 rounded-full border border-dashed border-[#E59E25]/30 animate-[spin_10s_linear_infinite]" />
                  <div className="w-5 h-5 rounded-full bg-[#E59E25] shadow-[0_0_15px_rgba(229,158,37,0.5)]" />
                </div>
                
                {/* Path */}
                <div className="flex-1 h-20 relative mx-2 flex items-center justify-center">
                  <div className="absolute top-1/2 -translate-y-1/2 w-full h-0.5 bg-white/5" />
                  
                  <motion.div 
                    className="absolute top-1/2 -translate-y-1/2 flex items-center justify-center bg-[#080808] px-1"
                    animate={{ 
                      left: ['10%', '90%', '90%', '10%', '10%'],
                      rotateY: [0, 0, 180, 180, 0]
                    }}
                    transition={{ 
                      duration: 4, 
                      repeat: Infinity, 
                      ease: "easeInOut",
                      times: [0, 0.45, 0.5, 0.95, 1]
                    }}
                    style={{ x: '-50%' }}
                  >
                    <ArrowRight className="w-5 h-5 text-[#E59E25]" />
                  </motion.div>

                  <div className="absolute top-0 left-1/2 -translate-x-1/2 bg-[#080808] px-3 py-1 rounded-full border border-white/[0.05] flex items-center gap-2 z-10 shadow-[0_4px_12px_rgba(0,0,0,0.5)]">
                     <Timer className="w-4 h-4 text-[#E59E25]" />
                     <span className="text-white text-xs font-mono font-medium">5s</span>
                  </div>
                </div>

                {/* Node B */}
                <div className="w-20 h-20 rounded-full bg-[#121212] border border-white/[0.05] flex items-center justify-center z-10 relative shadow-[0_4px_24px_rgba(0,0,0,0.2)]">
                  <div className="absolute -top-8 text-[11px] text-[#9BA4B5] font-medium tracking-widest uppercase">Destino (EUA)</div>
                  <div className="absolute inset-2 rounded-full border border-dashed border-[#D48C1C]/30 animate-[spin_10s_linear_infinite_reverse]" />
                  <motion.div 
                    className="w-5 h-5 rounded-full bg-[#D48C1C] shadow-[0_0_15px_rgba(212,140,28,0.5)]"
                    animate={{ scale: [1, 1.2, 1] }}
                    transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut", repeatDelay: 0.5, delay: 0.7 }}
                  />
                </div>

             </div>
          </div>
        </motion.div>

      </div>
    </section>
  );
}
