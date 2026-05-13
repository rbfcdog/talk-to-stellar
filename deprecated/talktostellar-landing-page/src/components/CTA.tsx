import React from 'react';
import { motion } from 'motion/react';
import { MessageCircle, Send } from 'lucide-react';

export default function CTA() {
  return (
    <section className="py-20 md:py-32 w-full flex flex-col items-center text-center relative px-4 sm:px-0">
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#00D2FF]/5 to-transparent -z-10" />
      
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        whileInView={{ opacity: 1, scale: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6 }}
        className="max-w-4xl flex flex-col items-center w-full bg-white/5 border border-white/[0.03] rounded-2xl p-10 md:p-16 relative overflow-hidden"
      >
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-gradient-to-b from-[#4CA1EF]/20 to-transparent blur-[80px] rounded-full pointer-events-none" />
        
        <h2 className="text-3xl md:text-5xl lg:text-6xl font-bold mb-6 relative z-10">
          Pare de perder dinheiro <br className="block md:hidden" /><span className="text-gradient">com taxas abusivas.</span>
        </h2>
        <p className="text-lg md:text-xl text-gray-300 mb-10 max-w-2xl relative z-10 leading-relaxed">
          Faça sua primeira operação agora mesmo. Pague no Pix, receba em Dólar digital (USDC). Sem burocracia, direto no seu app favorito.
        </p>
        
        <div className="flex flex-col sm:flex-row min-w-0 gap-4 pt-2 w-full max-w-lg mx-auto relative z-10">
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
      </motion.div>
    </section>
  );
}
