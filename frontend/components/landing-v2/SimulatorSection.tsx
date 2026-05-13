import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowRightLeft } from 'lucide-react';

export default function SimulatorSection() {
  const [brlAmount, setBrlAmount] = useState<string>("1000");
  const exchangeRate = 0.18; // Approx

  const handleBrlChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setBrlAmount(e.target.value);
  };

  const usdcAmount = (parseFloat(brlAmount || "0") * exchangeRate).toFixed(2);

  return (
    <section id="simulator" className="py-20 w-full flex flex-col items-center relative scroll-mt-24">
      <div className="text-center mb-12">
        <h2 className="text-3xl md:text-5xl font-bold mb-4 text-white leading-tight">
          Simule sua <span className="text-[#00D2FF]">economia</span>
        </h2>
        <p className="text-lg text-[#9BA4B5] max-w-2xl mx-auto">
          Descubra o quanto você deixa de pagar em taxas abusivas usando nossa rota de conversão inteligente.
        </p>
      </div>

      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        className="w-full max-w-md relative min-w-0 overflow-hidden rounded-[1.5rem] border border-white/[0.03] bg-[#0C1421]/80 backdrop-blur-md p-6 shadow-[0_4px_24px_rgba(0,0,0,0.2)]"
      >
        <div className="absolute top-0 right-0 w-32 h-32 bg-[#00D2FF]/10 blur-[50px] pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-32 h-32 bg-[#4CA1EF]/10 blur-[50px] pointer-events-none" />
        
        <div className="text-center mb-8 relative z-10">
          <p className="text-[#9BA4B5] text-sm font-medium">Taxa de câmbio estimada</p>
          <p className="text-[#00D2FF] font-semibold mt-1">1 BRL = {(exchangeRate).toFixed(4)} USDC</p>
        </div>

        <div className="space-y-6 relative z-10">
          {/* Send Amount Wrapper */}
          <div className="bg-white/5 border border-white/[0.03] rounded-2xl p-4 transition-colors focus-within:border-[#00D2FF]/50 hover:border-white/[0.03]">
            <label className="block text-xs font-medium text-[#9BA4B5] mb-2 uppercase tracking-wider">Você envia</label>
            <div className="flex items-center justify-between">
              <input 
                type="number"
                value={brlAmount}
                onChange={handleBrlChange}
                className="bg-transparent border-none outline-none text-3xl font-bold text-white w-full"
                placeholder="0.00"
              />
              <div className="flex items-center gap-2 bg-[#0C1421]/80 rounded-full px-3 py-1.5 shrink-0 ml-2 border border-white/[0.03]">
                <img src="https://flagcdn.com/w20/br.png" alt="BRL" className="w-5 h-5 rounded-full object-cover" />
                <span className="font-bold text-slate-200">BRL</span>
              </div>
            </div>
          </div>

          {/* Swap Button Area */}
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-20 pointer-events-none">
            <div className="bg-[#16324f] border border-white/[0.03] p-2 rounded-full hidden sm:block shadow-[0_4px_24px_rgba(0,0,0,0.2)]">
              <ArrowRightLeft className="w-5 h-5 text-[#00D2FF] rotate-90" />
            </div>
          </div>

          {/* Receive Amount Wrapper */}
          <div className="bg-white/5 border border-white/[0.03] rounded-2xl p-4">
            <label className="block text-xs font-medium text-[#9BA4B5] mb-2 uppercase tracking-wider">Você recebe (estimativa)</label>
            <div className="flex items-center justify-between">
              <input 
                type="text"
                value={usdcAmount}
                readOnly
                className="bg-transparent border-none outline-none text-3xl font-bold text-[#00D2FF] w-full"
                placeholder="0.00"
              />
              <div className="flex items-center gap-2 bg-[#0C1421]/80 rounded-full px-3 py-1.5 shrink-0 ml-2 border border-white/[0.03]">
                <div className="w-5 h-5 rounded-full bg-[#4CA1EF] flex items-center justify-center">
                  <span className="text-white text-[10px] font-bold">$</span>
                </div>
                <span className="font-bold text-slate-200">USDC</span>
              </div>
            </div>
          </div>

        </div>

        <div className="space-y-6 relative z-10 w-full mt-8">
          <button 
            onClick={() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' })}
            className="w-full bg-[#00D2FF] text-slate-950 font-bold text-lg py-4 rounded-xl hover:bg-cyan-300 transition-colors shadow-[0_0_20px_rgba(34,211,238,0.2)]"
          >
            Enviar dinheiro agora
          </button>
        </div>
      </motion.div>

      {/* Comparison Grid below */}
      <div className="w-full max-w-5xl mx-auto px-4 mt-16">
        <h4 className="text-xl md:text-2xl font-semibold text-white text-center mb-8">Por que a nossa rota é imbatível?</h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-stretch">
          
          {/* Left: Bancos Tradicionais */}
          <div className="bg-[#162032] border border-white/[0.03] rounded-2xl p-6 flex flex-col items-center text-center shadow-[0_4px_24px_rgba(0,0,0,0.2)] relative opacity-70 hover:opacity-100 transition-opacity">
            <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center mb-4">
              <span className="text-red-500 font-bold text-lg">✗</span>
            </div>
            <h5 className="text-white font-medium mb-1">Bancos Tradicionais</h5>
            <p className="text-[#9BA4B5] text-sm mb-4">Taxas altas e demoradas</p>
            <div className="mt-auto pt-4 border-t border-white/[0.03] w-full">
              <p className="text-[11px] text-[#9BA4B5] uppercase tracking-wider mb-1">Você perde até</p>
              <p className="font-bold text-red-400 text-xl">R$ {(parseFloat(brlAmount || "0") * 0.06).toFixed(2)}</p>
              <p className="text-xs text-red-500/60 mt-1">~6% (Spread + IOF)</p>
            </div>
          </div>

          {/* Center: TalkToStellar */}
          <div className="bg-[#0C1421] border border-[#00D2FF]/30 rounded-2xl p-8 flex flex-col items-center text-center shadow-[0_4px_32px_rgba(34,211,238,0.15)] relative transform md:-translate-y-4 z-10">
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-1 bg-gradient-to-r from-transparent via-[#00D2FF] to-transparent" />
            <div className="w-16 h-16 rounded-full bg-[#00D2FF]/10 flex items-center justify-center mb-4 border border-[#00D2FF]/20">
              <span className="text-[#00D2FF] font-bold text-2xl">✓</span>
            </div>
            <h5 className="text-white font-bold text-lg mb-1">TalkToStellar</h5>
            <p className="text-[#00D2FF] text-sm font-medium mb-4">A melhor rota blockchain</p>
            <div className="mt-auto pt-4 border-t border-white/[0.03] w-full">
              <p className="text-[11px] text-[#00D2FF]/70 uppercase tracking-wider mb-1">Taxas mínimas a partir de</p>
              <p className="font-black text-[#00D2FF] text-3xl">0.05%</p>
              <p className="text-xs text-[#9BA4B5] mt-2">Maior economia garantida</p>
            </div>
          </div>

          {/* Right: Contas Globais */}
          <div className="bg-[#162032] border border-white/[0.03] rounded-2xl p-6 flex flex-col items-center text-center shadow-[0_4px_24px_rgba(0,0,0,0.2)] relative opacity-70 hover:opacity-100 transition-opacity">
            <div className="w-12 h-12 rounded-full bg-orange-500/10 flex items-center justify-center mb-4">
              <span className="text-orange-500 font-bold text-lg">✗</span>
            </div>
            <h5 className="text-white font-medium mb-1">Contas Globais</h5>
            <p className="text-[#9BA4B5] text-sm mb-4">Apps de conversão em dólar</p>
            <div className="mt-auto pt-4 border-t border-white/[0.03] w-full">
              <p className="text-[11px] text-[#9BA4B5] uppercase tracking-wider mb-1">Você perde até</p>
              <p className="font-bold text-orange-400 text-xl">R$ {(parseFloat(brlAmount || "0") * 0.04).toFixed(2)}</p>
              <p className="text-xs text-orange-500/60 mt-1">~4% de spread médio</p>
            </div>
          </div>

        </div>
      </div>
    </section>
  );
}
