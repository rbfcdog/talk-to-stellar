import React from 'react';
import { motion } from 'framer-motion';
import { BrainCircuit, ArrowRight, Zap, Clock, DollarSign, CheckCheck } from 'lucide-react';

export default function Pathfinding() {
  return (
    <section className="py-16 md:py-24 w-full flex flex-col items-center text-center relative px-4 sm:px-0">
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-[#4CA1EF]/5 blur-[120px] rounded-full pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="max-w-3xl mb-12 md:mb-16"
      >
        <div className="inline-block mb-6 px-4 py-1.5 rounded-full bg-[#4CA1EF]/10 border border-[#4CA1EF]/20 text-[#4CA1EF] font-semibold text-sm tracking-wide uppercase">
          The Low-Fee Advantage
        </div>
        <h2 className="text-3xl md:text-4xl lg:text-5xl font-bold mb-4 md:mb-6">
          The Cheapest Route. <br className="block md:hidden" /><span className="text-gradient">Every Time.</span>
        </h2>
        <p className="text-gray-400 text-base md:text-lg max-w-2xl mx-auto">
          Forget hidden fees. Stellar handles liquidity routing with fast settlement, and TalkToStellar shows fees and final value before confirmation.
        </p>
      </motion.div>

      <div className="w-full max-w-4xl flex flex-col items-center relative z-10">
        
        {/* User Input Box (WhatsApp Style) */}
        <motion.div 
          initial={{ opacity: 0, scale: 0.9, y: 20 }}
          whileInView={{ opacity: 1, scale: 1, y: 0 }}
          viewport={{ once: true }}
          className="bg-[#00D87A] text-[#e9edef] px-4 py-2 md:px-5 md:py-3 rounded-2xl rounded-br-sm shadow-[0_4px_24px_rgba(0,0,0,0.2)] mb-8 relative flex items-end gap-3 z-10"
        >
          <p className="text-base md:text-lg leading-snug pb-1 text-left">Convert R$250 and pay with PIX.</p>
          <div className="flex items-center gap-1 shrink-0 mb-1">
            <span className="text-xs text-[#9BA4B5]">14:42</span>
            <CheckCheck className="text-[#4CA1EF] w-4 h-4" />
          </div>
          {/* Chat bubble tail */}
          <div className="absolute -right-2 bottom-0 w-3 h-4 bg-[#00D87A]" style={{ clipPath: 'polygon(0 100%, 0 0, 100% 100%)' }} />
        </motion.div>

        {/* AI Brain */}
        <motion.div 
          animate={{ scale: [1, 1.05, 1], boxShadow: ["0 0 20px rgba(143,0,255,0.2)", "0 0 40px rgba(143,0,255,0.5)", "0 0 20px rgba(143,0,255,0.2)"] }}
          transition={{ duration: 2, repeat: Infinity }}
          className="w-20 h-20 bg-[#0C1421] border border-[#4CA1EF]/50 rounded-full flex items-center justify-center mb-12 relative z-10"
        >
          <BrainCircuit className="text-[#4CA1EF] w-10 h-10" />
          
          {/* Energy Pulses */}
          <div className="absolute top-full left-1/2 -translate-x-1/2 w-px h-16 bg-gradient-to-b from-[#4CA1EF] to-transparent opacity-50" />
        </motion.div>

        {/* Route Comparisons */}
        <div className="w-full grid grid-cols-1 md:grid-cols-3 gap-6">
          
          {/* Traditional providers */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="bg-white/5 backdrop-blur-md border border-red-500/10 rounded-2xl p-6 flex flex-col items-center relative overflow-hidden opacity-60 hover:opacity-100 transition-opacity duration-300 order-2 md:order-1"
          >
            <div className="absolute top-0 left-0 w-full h-1 bg-red-500/30" />
            <h3 className="text-gray-500 font-medium mb-4">Banks & Exchanges</h3>
            <div className="flex items-center gap-2 text-sm text-gray-600 mb-6 font-mono">
              <span>BRL</span> <ArrowRight size={14} /> <span>SWIFT</span> <ArrowRight size={14} /> <span>USD</span>
            </div>
            <div className="flex w-full justify-between items-center mt-auto pt-4 border-t border-white/[0.03]">
              <div className="flex items-center gap-1 text-red-500/80">
                <DollarSign size={16} />
                <span className="font-bold">~5.0%</span>
              </div>
              <div className="flex items-center gap-1 text-gray-600">
                <Clock size={16} />
                <span>~2 days</span>
              </div>
            </div>
          </motion.div>

          {/* TalkToStellar (Center, Highlighted) */}
          <motion.div 
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            whileInView={{ opacity: 1, y: 0, scale: 1 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 }}
            className="border-gradient-card p-6 flex flex-col items-center relative transform md:-translate-y-4 glow-gradient z-20 shadow-[0_0_50px_rgba(143,0,255,0.15)] order-1 md:order-2"
          >
            <div className="absolute -top-3 bg-gradient-custom text-white text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider shadow-[0_4px_24px_rgba(0,0,0,0.2)]">
              Best Route
            </div>
            <h3 className="text-white font-bold mb-4 mt-2 text-lg">TalkToStellar</h3>
            
            <motion.div 
              animate={{ opacity: [0.7, 1, 0.7] }}
              transition={{ duration: 2, repeat: Infinity }}
              className="flex items-center gap-2 text-base text-white mb-6 font-mono bg-white/5 px-4 py-2 rounded-lg border border-white/[0.03]"
            >
              <span className="text-[#00D2FF]">BRL</span> 
              <ArrowRight size={16} className="text-gray-400" /> 
              <span className="text-[#4CA1EF]">XLM</span> 
              <ArrowRight size={16} className="text-gray-400" /> 
              <span className="text-[#00D2FF]">USDC</span>
            </motion.div>

            <div className="flex w-full justify-between items-center mt-auto pt-4 border-t border-white/[0.03]">
              <div className="flex items-center gap-1 text-[#00D2FF]">
                <DollarSign size={18} />
                <span className="font-bold text-xl">0.05%</span>
              </div>
              <div className="flex items-center gap-1 text-[#00D2FF]">
                <Zap size={18} />
                <span className="font-bold">~3s</span>
              </div>
            </div>
          </motion.div>

          {/* Bridge DeFi */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.4 }}
            className="bg-white/5 backdrop-blur-md border border-yellow-500/10 rounded-2xl p-6 flex flex-col items-center relative overflow-hidden opacity-60 hover:opacity-100 transition-opacity duration-300 order-3 md:order-3"
          >
            <div className="absolute top-0 left-0 w-full h-1 bg-yellow-500/30" />
            <h3 className="text-gray-500 font-medium mb-4">Bridge DeFi</h3>
            <div className="flex items-center gap-2 text-sm text-gray-600 mb-6 font-mono">
              <span>BRL</span> <ArrowRight size={14} /> <span>ETH</span> <ArrowRight size={14} /> <span>USDC</span>
            </div>
            <div className="flex w-full justify-between items-center mt-auto pt-4 border-t border-white/[0.03]">
              <div className="flex items-center gap-1 text-yellow-500/80">
                <DollarSign size={16} />
                <span className="font-bold">1.2%</span>
              </div>
              <div className="flex items-center gap-1 text-gray-600">
                <Clock size={16} />
                <span>~15 min</span>
              </div>
            </div>
          </motion.div>

        </div>
      </div>
    </section>
  );
}
