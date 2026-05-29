import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { MessageCircle, Send, CheckCircle2, Monitor, ArrowRight, DollarSign, Landmark } from 'lucide-react';
import PhoneMockup from './PhoneMockup';

export default function Hero() {
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setMousePosition({
        x: (e.clientX - window.innerWidth / 2) / 50,
        y: (e.clientY - window.innerHeight / 2) / 50,
      });
    };

    window.addEventListener("mousemove", handleMouseMove);
    return () => window.removeEventListener("mousemove", handleMouseMove);
  }, []);

  return (
    <section className="relative w-full min-h-screen flex items-center pt-28 pb-12 overflow-hidden px-4 sm:px-6 lg:px-8">
      {/* Dynamic Background Glows */}
      <div className="absolute inset-0 pointer-events-none">
        <div
          className="absolute left-1/4 top-1/4 h-96 w-96 rounded-full bg-[#E59E25]/5 opacity-30 blur-3xl"
          style={{
            transform: `translate(${mousePosition.x}px, ${mousePosition.y}px)`,
            transition: "transform 0.3s ease-out",
          }}
        />
        <div
          className="absolute bottom-1/4 right-1/4 h-80 w-80 rounded-full bg-[#D48C1C]/5 opacity-20 blur-3xl"
          style={{
            transform: `translate(${-mousePosition.x}px, ${-mousePosition.y}px)`,
            transition: "transform 0.3s ease-out",
          }}
        />
      </div>

      <div className="relative z-10 w-full max-w-7xl mx-auto">
        <div className="flex flex-col lg:flex-row items-center justify-between gap-12 lg:gap-8">
          
          {/* Left Side: Texts & CTAs */}
          <motion.div 
            initial="hidden"
            animate="visible"
            variants={{
              hidden: { opacity: 0 },
              visible: {
                opacity: 1,
                transition: { staggerChildren: 0.15 }
              }
            }}
            className="flex-1 flex flex-col gap-6 max-w-2xl"
          >
            {/* Badge */}
            <motion.div variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0, transition: { duration: 0.8, ease: "easeOut" } } }} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/10 bg-white/5 w-fit">
              <CheckCircle2 size={14} className="text-gray-400" />
              <span className="text-[10px] font-bold text-gray-300 tracking-[0.15em] uppercase">PRODUTO EM VALIDAÇÃO</span>
            </motion.div>
            {/* Title */}
            <motion.div variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0, transition: { duration: 0.8, ease: "easeOut" } } }} className="space-y-4">
              <h1 className="text-4xl md:text-5xl lg:text-[56px] font-bold text-white tracking-tight leading-[1.1]">
                Envie para o mundo. <br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#D48C1C] to-[#E59E25]">Em uma mensagem.</span>
              </h1>
              <p className="text-base md:text-lg text-[#9BA4B5] leading-relaxed max-w-xl">
                O jeito mais rápido e barato de abastecer suas contas globais. Faça o Pix e converta para dólar diretamente pelo WhatsApp ou Telegram, sem precisar baixar nenhum aplicativo novo.
              </p>
            </motion.div>

            {/* Main Buttons */}
            <motion.div variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0, transition: { duration: 0.8, ease: "easeOut" } } }} className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-4 mt-4">
              <a href="https://t.me/TalkToStellarTelegramBot" target="_blank" rel="noopener noreferrer" className="flex flex-1 sm:flex-none items-center justify-center gap-2 px-8 py-4 rounded-xl border border-white/10 hover:bg-white/5 transition text-base font-semibold text-white">
                <Send size={20} className="text-[#229ED9]" /> Telegram
              </a>
              <button onClick={() => document.getElementById('cta')?.scrollIntoView({ behavior: 'smooth' })} className="flex flex-1 sm:flex-none items-center justify-center gap-2 px-8 py-4 rounded-xl border border-white/10 hover:bg-white/5 transition text-base font-semibold text-white">
                <MessageCircle size={20} className="text-[#25D366]" /> WhatsApp
              </button>
              <button onClick={() => document.getElementById('simulator')?.scrollIntoView({ behavior: 'smooth' })} className="flex w-full sm:w-auto items-center justify-center gap-2 px-8 py-4 rounded-xl bg-[#E59E25] text-black hover:bg-[#D48C1C] transition shadow-[0_0_20px_rgba(229,158,37,0.2)] text-base font-semibold">
                <Monitor size={20} /> Abrir chat web
              </button>
            </motion.div>
            
            <motion.div variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0, transition: { duration: 0.8, ease: "easeOut" } } }} className="grid grid-cols-1 sm:grid-cols-2 gap-8 mt-8 pt-6 border-t border-white/[0.05]">
              <div>
                <h3 className="text-[11px] font-bold tracking-[0.15em] text-[#E59E25] uppercase mb-2">Comece pelo chat</h3>
                <p className="text-sm text-[#9BA4B5] leading-relaxed">Abra WhatsApp, Telegram ou chat web e peça saldo, PIX ou conversão.</p>
              </div>
              <div>
                <h3 className="text-[11px] font-bold tracking-[0.15em] text-[#E59E25] uppercase mb-2">Revise antes de confirmar</h3>
                <p className="text-sm text-[#9BA4B5] leading-relaxed">Comparamos rotas em tempo real e mostramos taxas antes do aceite.</p>
              </div>
            </motion.div>
          </motion.div>

          {/* Right Side: Phone Mockup */}
          <motion.div 
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8, delay: 0.2 }}
            className="flex-1 w-full max-w-[400px] lg:max-w-[420px] flex justify-center mt-12 lg:mt-0"
          >
            <motion.div
              animate={{ y: [0, -15, 0] }}
              transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
              className="w-full flex justify-center drop-shadow-[0_4px_32px_rgba(0,0,0,0.4)]"
            >
              <PhoneMockup />
            </motion.div>
          </motion.div>

        </div>
      </div>
    </section>
  );
}
