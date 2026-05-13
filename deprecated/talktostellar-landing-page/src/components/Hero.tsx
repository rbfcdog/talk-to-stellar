import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import { MessageCircle, Send } from 'lucide-react';
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
    <section className="relative w-full min-h-screen flex items-center pt-24 pb-12">
      {/* Dynamic Background Glows */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div
          className="absolute left-1/4 top-1/4 h-96 w-96 rounded-full bg-[#00D2FF]/10 opacity-30 blur-3xl"
          style={{
            transform: `translate(${mousePosition.x}px, ${mousePosition.y}px)`,
            transition: "transform 0.3s ease-out",
          }}
        />
        <div
          className="absolute bottom-1/4 right-1/4 h-80 w-80 rounded-full bg-[#4CA1EF]/10 opacity-20 blur-3xl"
          style={{
            transform: `translate(${-mousePosition.x}px, ${-mousePosition.y}px)`,
            transition: "transform 0.3s ease-out",
          }}
        />
      </div>

      <div className="relative z-10 w-full max-w-7xl mx-auto">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="grid min-w-0 w-full gap-8 overflow-hidden rounded-2xl border border-white/[0.03] bg-white/5 p-6 shadow-[0_4px_24px_rgba(0,0,0,0.2)] backdrop-blur-md md:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] md:p-10 items-center"
        >
          
          {/* Left Side: Texts & CTAs */}
          <section className="min-w-0 space-y-8 overflow-hidden">
            
            <div className="space-y-4">
              <h1 className="max-w-xl text-4xl font-bold tracking-tight text-white md:text-[56px] leading-[1.1]">
                Converta pro mundo todo. <br className="hidden md:block"/>
                <span className="text-[#00D2FF]">Em uma mensagem.</span>
              </h1>
              <p className="max-w-xl text-base leading-relaxed text-[#9BA4B5] md:text-lg">
                Envie dinheiro, gerencie contatos e use a blockchain com linguagem natural. Direto do Telegram ou WhatsApp, sem burocracia.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row min-w-0 gap-4 pt-2">
              <a
                href="#"
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl bg-[#00D2FF] px-6 py-4 text-base font-semibold text-slate-950 transition hover:bg-cyan-300 shadow-[0_0_20px_rgba(34,211,238,0.3)]"
              >
                <MessageCircle className="h-5 w-5" />
                <span>Usar no WhatsApp</span>
              </a>
              <a
                href="https://t.me/TalkToStellarTelegramBot"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-2xl bg-[#229ED9]/10 border border-[#229ED9]/30 px-6 py-4 text-base font-semibold text-white transition hover:bg-[#229ED9]/20"
              >
                <Send className="h-5 w-5 text-[#229ED9]" />
                <span>@TalkToStellar</span>
              </a>
            </div>
            
            <div className="grid min-w-0 gap-4 sm:grid-cols-2 pt-4">
              <div className="min-w-0 overflow-hidden rounded-2xl border border-white/[0.03] bg-[#0C1421]/40 p-5">
                <p className="text-xs uppercase tracking-[0.2em] text-[#00D2FF]/80 font-semibold">Linguagem natural</p>
                <p className="mt-2 text-sm text-[#9BA4B5] leading-relaxed">Use mensagens simples para simular, transferir e organizar transações.</p>
              </div>
              <div className="min-w-0 overflow-hidden rounded-2xl border border-white/[0.03] bg-[#0C1421]/40 p-5">
                <p className="text-xs uppercase tracking-[0.2em] text-[#00D2FF]/80 font-semibold">Sem novos apps</p>
                <p className="mt-2 text-sm text-[#9BA4B5] leading-relaxed">Não perca espaço no celular. Tudo funciona no chat que você já usa.</p>
              </div>
            </div>
          </section>

          {/* Right Side: Phone Mockup */}
          <section className="relative min-w-0 flex justify-center items-center">
            <div className="transform scale-[0.85] sm:scale-100 origin-center drop-shadow-[0_4px_24px_rgba(0,0,0,0.2)]">
              <PhoneMockup />
            </div>
          </section>

        </motion.div>
      </div>
    </section>
  );
}
