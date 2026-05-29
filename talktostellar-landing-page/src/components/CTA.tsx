import React from 'react';
import { motion } from 'motion/react';
import { MessageCircle, Send, Monitor } from 'lucide-react';

export default function CTA() {
  return (
    <section id="cta" className="py-24 md:py-32 w-full flex flex-col items-center bg-[#080808] bg-dotted-pattern relative px-4 sm:px-8 border-t border-white/5 scroll-mt-24">
      
      <div className="w-full max-w-7xl relative z-10 flex flex-col gap-16">
        
        <div className="w-full max-w-4xl flex flex-col items-start gap-6">
          <motion.h2 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="text-4xl md:text-5xl lg:text-7xl font-extrabold text-white leading-[0.95] tracking-tight"
          >
            Pare de perder dinheiro <br className="hidden lg:block"/><span className="text-[#E59E25]">com taxas abusivas.</span>
          </motion.h2>

          <motion.p 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
            className="text-lg md:text-xl text-[#9BA4B5] max-w-2xl leading-relaxed font-medium mt-2"
          >
            Inicie sua primeira conversão agora mesmo. Use o Pix para abastecer suas contas internacionais pagando uma fração do custo tradicional. Rápido, seguro e direto no seu aplicativo favorito.
          </motion.p>
          
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 }}
            className="flex flex-col sm:flex-row flex-wrap gap-4 mt-6 w-full sm:w-auto"
          >
            <a
              href="https://t.me/TalkToStellarTelegramBot"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex flex-1 sm:flex-none items-center justify-center gap-2 rounded-xl bg-[#D48C1C] px-8 py-4 text-sm font-bold text-black transition hover:bg-[#E59E25]"
            >
              <Send className="h-4 w-4" />
              <span>Telegram</span>
            </a>
            <button
              className="inline-flex flex-1 sm:flex-none items-center justify-center gap-2 rounded-xl bg-transparent border border-white/10 px-8 py-4 text-sm font-bold text-white transition hover:bg-white/5"
            >
              <MessageCircle className="h-4 w-4 text-[#E59E25]" />
              <span>WhatsApp</span>
            </button>
            <button
              onClick={() => document.getElementById('simulator')?.scrollIntoView({ behavior: 'smooth' })}
              className="inline-flex flex-1 sm:flex-none items-center justify-center gap-2 rounded-xl bg-white/5 border border-white/[0.05] px-8 py-4 text-sm font-bold text-white transition hover:bg-white/10"
            >
              <Monitor className="h-4 w-4 text-[#D48C1C]" />
              <span>Abrir chat web</span>
            </button>
          </motion.div>
        </div>

        {/* Stats Section */}
        <motion.div 
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-12 pt-16 border-t border-white/10"
        >
          <div>
            <div className="text-2xl md:text-3xl font-mono font-bold text-[#E59E25] mb-2 tracking-tight">Até 5 segundos</div>
            <div className="text-[10px] text-[#A1A1A1] font-mono tracking-widest uppercase font-bold">Tempo de liquidação</div>
          </div>
          <div>
            <div className="text-2xl md:text-3xl font-mono font-bold text-[#E59E25] mb-2 tracking-tight">24/7</div>
            <div className="text-[10px] text-[#A1A1A1] font-mono tracking-widest uppercase font-bold">Disponibilidade PIX</div>
          </div>
          <div>
            <div className="text-2xl md:text-3xl font-mono font-bold text-[#E59E25] mb-2 tracking-tight">4%</div>
            <div className="text-[10px] text-[#A1A1A1] font-mono tracking-widest uppercase font-bold">Economia média em taxas</div>
          </div>
        </motion.div>

      </div>
    </section>
  );
}
