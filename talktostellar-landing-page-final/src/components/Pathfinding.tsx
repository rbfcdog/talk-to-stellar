import React from 'react';
import { motion } from 'motion/react';
import { BrainCircuit, ArrowRight, Zap, Clock, DollarSign, CheckCheck } from 'lucide-react';

export default function Pathfinding() {
  return (
    <section className="py-16 md:py-24 w-full flex flex-col items-center text-center relative px-4 sm:px-0">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-[#D48C1C]/5 blur-[120px] rounded-full pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="max-w-3xl mb-12 md:mb-16"
      >
        <div className="inline-block mb-6 px-4 py-1.5 rounded-full bg-[#D48C1C]/10 border border-[#D48C1C]/20 text-[#D48C1C] font-semibold text-sm tracking-wide uppercase">
          O Segredo do Preço Baixo
        </div>
        <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold mb-4 md:mb-6">
          A Rota Mais Barata. <br className="block md:hidden" /><span className="text-transparent bg-clip-text bg-gradient-to-r from-[#E59E25] to-[#D48C1C]">Sempre.</span>
        </h2>
        <p className="text-[#9BA4B5] text-base md:text-lg max-w-2xl mx-auto">
          Esqueça o IOF abusivo e as taxas surpresas. Nossa infraestrutura varre o mercado em milissegundos para encontrar a rota de conversão mais barata para o seu dólar, liquidando a operação antes mesmo de você piscar.
        </p>
      </motion.div>

      <div className="w-full max-w-4xl flex flex-col items-center relative z-10">
        
        {/* User Input Box (WhatsApp Style) */}
        <motion.div 
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          whileInView={{ opacity: 1, scale: 1, y: 0 }}
          viewport={{ once: true }}
          className="bg-[#E59E25] text-[#e9edef] px-4 py-2 md:px-5 md:py-3 rounded-2xl rounded-br-sm shadow-[0_4px_24px_rgba(0,0,0,0.2)] mb-8 relative flex items-end gap-3 z-10"
        >
          <p className="text-base md:text-lg leading-snug pb-1 text-left">Converta R$ 250 e pague via Pix.</p>
          <div className="flex items-center gap-1 shrink-0 mb-1">
            <span className="text-xs text-[#9BA4B5]">14:42</span>
            <CheckCheck className="text-[#D48C1C] w-4 h-4" />
          </div>
          {/* Chat bubble tail */}
          <div className="absolute -right-2 bottom-0 w-3 h-4 bg-[#E59E25]" style={{ clipPath: 'polygon(0 100%, 0 0, 100% 100%)' }} />
        </motion.div>

        {/* AI Brain */}
        <motion.div 
          animate={{ scale: [1, 1.05, 1], boxShadow: ["0 0 20px rgba(212,140,28,0.1)", "0 0 40px rgba(212,140,28,0.3)", "0 0 20px rgba(212,140,28,0.1)"] }}
          transition={{ duration: 2, repeat: Infinity }}
          className="w-20 h-20 bg-[#080808] border border-[#D48C1C]/50 rounded-full flex items-center justify-center mb-12 relative z-10"
        >
          <BrainCircuit className="text-[#D48C1C] w-10 h-10" />
          
          {/* Energy Pulses */}
          <div className="absolute top-full left-1/2 -translate-x-1/2 w-px h-16 bg-gradient-to-b from-[#D48C1C] to-transparent opacity-50" />
        </motion.div>

        {/* Route Comparisons */}
        <div className="w-full grid grid-cols-1 md:grid-cols-3 gap-6">
          
          {/* CEX Tradicional */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="bg-white/5 backdrop-blur-md border border-red-500/10 rounded-2xl p-6 flex flex-col items-center relative overflow-hidden opacity-60 hover:opacity-100 transition-opacity duration-300 order-2 md:order-1"
          >
            <div className="absolute top-0 left-0 w-full h-1 bg-red-500/30" />
            <h3 className="text-gray-500 font-medium mb-4">Intermediários Tradicionais</h3>
            <div className="flex items-center gap-2 text-xs md:text-sm text-gray-500 mb-6 font-mono font-medium">
              <span>BRL</span> <ArrowRight size={14} /> <span>SWIFT</span> <ArrowRight size={14} /> <span>USD</span>
            </div>
            <div className="flex w-full justify-between items-center mt-auto pt-4 border-t border-white/[0.05]">
              <div className="flex flex-col gap-0.5 text-red-500/80">
                <span className="text-[10px] uppercase tracking-wider font-semibold">Custo</span>
                <span className="font-bold flex items-center gap-1"><DollarSign size={16} /> ~6.0%</span>
              </div>
              <div className="flex flex-col gap-0.5 text-gray-600 text-right">
                <span className="text-[10px] uppercase tracking-wider font-semibold text-gray-700">Tempo</span>
                <span className="flex items-center justify-end gap-1"><Clock size={16} /> ~2 dias</span>
              </div>
            </div>
          </motion.div>

          {/* TalkToStellar (Center, Highlighted) */}
          <motion.div 
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            whileInView={{ opacity: 1, y: 0, scale: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 }}
            className="border-gradient-card p-6 flex flex-col items-center relative transform md:-translate-y-4 glow-gradient z-20 shadow-[0_0_50px_rgba(229,158,37,0.15)] order-1 md:order-2"
          >
            <div className="absolute -top-3 bg-gradient-custom text-black text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider shadow-[0_4px_24px_rgba(0,0,0,0.2)]">
              Melhor Rota
            </div>
            <h3 className="text-white font-bold mb-4 mt-2 text-lg">TalkToStellar</h3>
            
            <motion.div 
              animate={{ opacity: [0.7, 1, 0.7] }}
              transition={{ duration: 2, repeat: Infinity }}
              className="flex items-center gap-2 text-base text-white mb-6 font-mono bg-white/5 px-4 py-2 rounded-lg border border-white/[0.05]"
            >
              <span className="text-[#E59E25]">BRL</span> 
              <ArrowRight size={16} className="text-gray-400" /> 
              <span className="text-[#D48C1C]">Rede Subjacente</span> 
              <ArrowRight size={16} className="text-gray-400" /> 
              <span className="text-[#E59E25]">USD</span>
            </motion.div>

            <div className="flex w-full justify-between items-center mt-auto pt-4 border-t border-white/[0.05]">
              <div className="flex items-center gap-1 text-[#E59E25]">
                <DollarSign size={18} />
                <span className="font-bold text-xl">0.05%</span>
              </div>
              <div className="flex items-center gap-1 text-[#E59E25]">
                <Zap size={18} />
                <span className="font-bold">~3s</span>
              </div>
            </div>
          </motion.div>

          {/* Contas Globais App */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.4 }}
            className="bg-white/5 backdrop-blur-md border border-yellow-500/10 rounded-2xl p-6 flex flex-col items-center relative overflow-hidden opacity-60 hover:opacity-100 transition-opacity duration-300 order-3 md:order-3"
          >
            <div className="absolute top-0 left-0 w-full h-1 bg-yellow-500/30" />
            <h3 className="text-gray-500 font-medium mb-4 text-center">Contas Globais App</h3>
            <div className="flex items-center justify-center gap-2 text-xs md:text-sm text-gray-500 mb-6 font-mono font-medium">
              <span>BRL</span> <ArrowRight size={14} /> <span>App</span> <ArrowRight size={14} /> <span>USD</span>
            </div>
            <div className="flex w-full justify-between items-center mt-auto pt-4 border-t border-white/[0.05]">
              <div className="flex flex-col gap-0.5 text-yellow-500/80">
                <span className="text-[10px] uppercase tracking-wider font-semibold">Custo</span>
                <span className="font-bold flex items-center gap-1"><DollarSign size={16} /> ~4.0%</span>
              </div>
              <div className="flex flex-col gap-0.5 text-gray-600 text-right">
                <span className="text-[10px] uppercase tracking-wider font-semibold text-gray-700">Tempo</span>
                <span className="flex items-center justify-end gap-1"><Clock size={16} /> ~2 min</span>
              </div>
            </div>
          </motion.div>

        </div>
      </div>
    </section>
  );
}
