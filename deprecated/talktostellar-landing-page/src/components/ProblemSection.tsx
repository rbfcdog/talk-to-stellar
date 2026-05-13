import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Smartphone, BadgeDollarSign, Zap, MessageCircle, ArrowRightLeft, Timer, CheckCheck } from 'lucide-react';
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
          className="text-4xl md:text-5xl lg:text-6xl font-bold mb-6 text-white leading-tight tracking-tight"
        >
          O segredo que as instituições financeiras ocultam.
        </motion.h2>
        
        <motion.p 
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.1 }}
          className="text-lg md:text-xl text-[#9BA4B5] leading-relaxed font-light max-w-2xl mx-auto"
        >
          Corretoras lucram com a sua pressa e os bancos com a sua paciência. Nós usamos a infraestrutura da Stellar para eliminar ineficiências e dolarizar seu capital instantaneamente, com zero spread.
        </motion.p>
      </div>

      <div className="w-full flex flex-col gap-8 relative z-10">
        
        {/* Feature 1: No app */}
        <motion.div 
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="w-full bg-[#162032]/40 backdrop-blur-md border border-white/[0.03] rounded-2xl overflow-hidden flex flex-col md:flex-row group hover:bg-[#162032]/60 hover:border-white/[0.03] transition-all duration-500"
        >
          <div className="w-full md:w-1/2 p-10 md:p-16 flex flex-col justify-center">
            <h3 className="text-2xl md:text-3xl font-bold text-white mb-6 tracking-tight">Esqueça novos downloads.</h3>
            <p className="text-[#9BA4B5] text-lg leading-relaxed mb-8">
              Bancos e corretoras te forçam a baixar aplicativos pesados, decorar senhas e passar por onboarding complexos. Com o TalkToStellar, sua carteira de investimentos funciona diretamente no WhatsApp. Sem atritos, integrado onde você já está.
            </p>
          </div>
          <div className="w-full md:w-1/2 bg-[#0C1421] min-h-[350px] flex items-center justify-center p-8 relative overflow-hidden">
             <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-[#00D87A]/10 via-transparent to-transparent opacity-60" />
             
             {/* WhatsApp Chat Animation */}
             <div className="relative z-10 w-full max-w-[280px]">
                <div className="bg-[#162032] rounded-2xl border-[6px] border-[#1a1a1a] shadow-[0_4px_24px_rgba(0,0,0,0.2)] overflow-hidden transform group-hover:scale-105 transition-transform duration-700 ease-out">
                  {/* Header */}
                  <div className="bg-[#162032] px-4 py-3 flex items-center gap-3 border-b border-white/[0.03]">
                    <div className="w-10 h-10 rounded-full flex-shrink-0 bg-[#0C1421] flex items-center justify-center border border-white/[0.03]">
                      <StellarLogo className="w-6 h-6 text-white" />
                    </div>
                    <div>
                      <div className="text-[#e9edef] font-semibold text-sm">TalkToStellar</div>
                      <div className="text-[#00D2FF] text-[11px] mt-0.5">online</div>
                    </div>
                  </div>
                  {/* Chat Body */}
                  <div className="p-4 bg-[#0C1421] flex flex-col gap-3 min-h-[200px] relative [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]" style={{ backgroundImage: 'url("https://www.transparenttextures.com/patterns/cubes.png")', opacity: 0.95 }}>
                    <div className="self-start bg-[#162032] text-[#e9edef] px-3 py-2.5 rounded-xl rounded-tl-sm text-[13px] shadow-[0_2px_10px_rgba(0,0,0,0.1)] max-w-[90%] leading-relaxed border border-white/[0.03] mt-2 relative z-10">
                      Como posso ajudar com suas finanças hoje?
                      <div className="text-[9px] text-[#9BA4B5] text-right mt-1 opacity-80">09:41</div>
                    </div>
                    <motion.div 
                      initial={{ opacity: 0, y: 10 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.5 }}
                      className="self-end bg-[#005c4b] text-[#e9edef] px-3 py-2.5 rounded-xl rounded-tr-sm text-[13px] shadow-[0_2px_10px_rgba(0,0,0,0.1)] max-w-[90%] leading-relaxed border border-[#005c4b] relative z-10"
                    >
                      Converta R$5.000 para dólar e envie para minha conta Nomad.
                      <div className="flex items-center justify-end gap-1 mt-1 opacity-80">
                        <span className="text-[9px] text-white/70">09:42</span>
                        <CheckCheck className="w-3 h-3 text-[#4CA1EF]" />
                      </div>
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
          className="w-full bg-[#162032]/40 backdrop-blur-md border border-white/[0.03] rounded-2xl overflow-hidden flex flex-col md:flex-row-reverse group hover:bg-[#162032]/60 hover:border-white/[0.03] transition-all duration-500"
        >
          <div className="w-full md:w-1/2 p-10 md:p-16 flex flex-col justify-center">
            <h3 className="text-2xl md:text-3xl font-bold text-white mb-6 tracking-tight">Custo real, sem entrelinhas.</h3>
            <p className="text-[#9BA4B5] text-lg leading-relaxed mb-8">
              Escondidas no "spread" e "taxas operacionais", instituições tradicionais mordem até 5% do seu dinheiro. Nós eliminamos isso exibindo a cotação comercial crua e garantindo custo zero de spread graças aos provedores de liquidez na Stellar.
            </p>
          </div>
          <div className="w-full md:w-1/2 bg-[#0C1421] min-h-[350px] flex items-center justify-center p-8 relative overflow-hidden">
             <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-cyan-500/10 via-transparent to-transparent opacity-60" />
             
             {/* Exchange Animation Component */}
             <div className="relative z-10 w-full max-w-sm flex flex-col gap-2">
                <motion.div 
                  className="bg-white/5 border border-white/[0.03] rounded-2xl p-5 flex justify-between items-center backdrop-blur-sm z-10"
                  whileHover={{ scale: 1.02, translateX: 10 }}
                  transition={{ duration: 0.3 }}
                >
                  <div>
                    <div className="text-[#9BA4B5] text-xs uppercase tracking-widest font-medium mb-1">Você envia via Pix</div>
                    <div className="text-2xl font-bold text-white tracking-tight">R$ 5.000,00</div>
                  </div>
                  <div className="w-10 h-10 rounded-full border border-white/[0.03] bg-[#162032] flex items-center justify-center">
                    <img src="https://flagcdn.com/w40/br.png" alt="BRL" className="w-6 h-6 rounded-full object-cover" />
                  </div>
                </motion.div>
                
                <div className="flex justify-center -my-3 relative z-20">
                  <motion.div 
                    animate={{ rotate: 180 }}
                    transition={{ ease: "easeInOut", duration: 3, repeat: Infinity, repeatDelay: 1 }}
                    className="bg-[#162032] border border-[#00D2FF]/30 rounded-full p-2.5 text-[#00D2FF] shadow-[0_4px_24px_rgba(0,0,0,0.2)] shadow-[#00D2FF]/10"
                  >
                    <ArrowRightLeft className="w-5 h-5 rotate-90" />
                  </motion.div>
                </div>
                
                <motion.div 
                  className="bg-[#162032]/80 border border-[#00D2FF]/30 rounded-2xl p-5 flex justify-between items-center backdrop-blur-sm shadow-[0_4px_24px_rgba(0,0,0,0.2)] shadow-[#00D2FF]/10 z-10"
                  whileHover={{ scale: 1.02, translateX: -10 }}
                  transition={{ duration: 0.3 }}
                >
                  <div>
                    <div className="text-[#00D2FF]/80 text-xs uppercase tracking-widest font-medium mb-1">Você recebe (exato)</div>
                    <div className="text-2xl font-bold text-[#00D2FF] tracking-tight">994.50 USDC</div>
                  </div>
                  <div className="w-10 h-10 rounded-full bg-[#4CA1EF] flex items-center justify-center shadow-[0_4px_24px_rgba(0,0,0,0.2)]">
                    <span className="text-white font-bold text-sm tracking-tighter">USDC</span>
                  </div>
                </motion.div>
                
                {/* Cost Comparison Pill */}
                 <motion.div 
                  initial={{ opacity: 0, y: -10 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.8 }}
                  className="mx-auto mt-4 bg-red-500/10 border border-red-500/20 text-red-400 text-xs px-4 py-2 rounded-full font-medium flex items-center justify-center gap-2"
                 >
                   Economia de ~ R$ 150,00 vs Bancos
                 </motion.div>
             </div>
          </div>
        </motion.div>

        {/* Feature 3: Speed */}
        <motion.div 
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="w-full bg-[#162032]/40 backdrop-blur-md border border-white/[0.03] rounded-2xl overflow-hidden flex flex-col md:flex-row group hover:bg-[#162032]/60 hover:border-white/[0.03] transition-all duration-500"
        >
          <div className="w-full md:w-1/2 p-10 md:p-16 flex flex-col justify-center">
            <h3 className="text-2xl md:text-3xl font-bold text-white mb-6 tracking-tight">Velocidade de liquidação.</h3>
            <p className="text-[#9BA4B5] text-lg leading-relaxed mb-8">
              Transferências internacionais tradicionais (SWIFT) operam em horário comercial e podem levar dias. Ao usar a infraestrutura Stellar, seu dinheiro cruza o globo e é liquidado na conta de destino em cerca de 5 segundos, 24 horas por dia, 7 dias por semana.
            </p>
          </div>
          <div className="w-full md:w-1/2 bg-[#0C1421] min-h-[350px] flex items-center justify-center p-8 relative overflow-hidden">
             <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-[#4CA1EF]/10 via-transparent to-transparent opacity-60" />
             
             {/* Node Transfer Animation */}
             <div className="relative w-full max-w-sm h-48 flex items-center justify-between">
                
                {/* Node A */}
                <div className="w-20 h-20 rounded-full bg-[#162032] border border-white/[0.03] flex items-center justify-center z-10 relative shadow-[0_4px_24px_rgba(0,0,0,0.2)]">
                  <div className="absolute -top-8 text-[11px] text-[#9BA4B5] font-medium tracking-widest uppercase">Origem</div>
                  <div className="absolute inset-2 rounded-full border border-dashed border-[#00D2FF]/30 animate-[spin_10s_linear_infinite]" />
                  <div className="w-5 h-5 rounded-full bg-[#00D2FF] shadow-[0_0_15px_rgba(34,211,238,0.5)]" />
                </div>
                
                {/* Path */}
                <div className="flex-1 h-0.5 bg-white/5 relative overflow-hidden mx-2">
                  <motion.div 
                    className="absolute top-0 bottom-0 w-32 bg-gradient-to-r from-transparent via-[#00D2FF] to-transparent"
                    initial={{ left: '-100%' }}
                    animate={{ left: '100%' }}
                    transition={{ duration: 1.5, repeat: Infinity, ease: "linear", repeatDelay: 0.5 }}
                  />
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-[#0C1421] px-3 py-1 rounded-full border border-white/[0.03] flex items-center gap-2">
                     <Timer className="w-4 h-4 text-[#00D2FF]" />
                     <span className="text-white text-xs font-mono font-medium">5s</span>
                  </div>
                </div>

                {/* Node B */}
                <div className="w-20 h-20 rounded-full bg-[#162032] border border-white/[0.03] flex items-center justify-center z-10 relative shadow-[0_4px_24px_rgba(0,0,0,0.2)]">
                  <div className="absolute -top-8 text-[11px] text-[#9BA4B5] font-medium tracking-widest uppercase">Destino (EUA)</div>
                  <div className="absolute inset-2 rounded-full border border-dashed border-[#4CA1EF]/30 animate-[spin_10s_linear_infinite_reverse]" />
                  <motion.div 
                    className="w-5 h-5 rounded-full bg-[#4CA1EF] shadow-[0_0_15px_rgba(129,140,248,0.5)]"
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

