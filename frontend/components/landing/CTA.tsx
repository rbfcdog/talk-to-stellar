import { motion } from 'framer-motion';
import ChannelButtons from './ChannelButtons';
import { useLanguage } from '@/lib/i18n';

export default function CTA() {
  const { language } = useLanguage();
  const L = (pt: string, en: string) => language === "pt-BR" ? pt : en;

  return (
    <section id="start" className="py-20 md:py-32 w-full flex flex-col items-center text-center relative px-4 sm:px-0 scroll-mt-24">
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#00D2FF]/5 to-transparent -z-10" />
      
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        whileInView={{ opacity: 1, scale: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6 }}
        className="max-w-4xl flex flex-col items-center w-full border border-white/[0.08] rounded-2xl p-10 md:p-16 relative overflow-hidden"
      >
        <h2 className="text-3xl md:text-5xl lg:text-6xl font-bold mb-6 relative z-10">
          {L("Comece pelo canal", "Start from the channel")} <br className="block md:hidden" />
          <span className="text-[#00D2FF]">{L("que você já usa.", "you already use.")}</span>
        </h2>
        <p className="text-lg md:text-xl text-gray-300 mb-10 max-w-2xl relative z-10 leading-relaxed">
          {L(
            "Escolha WhatsApp, Telegram ou chat web. Você conversa, confirma com PIN e acompanha tudo até o comprovante.",
            "Choose WhatsApp, Telegram, or web chat. You talk, confirm with PIN, and follow everything through the receipt."
          )}
        </p>
        
        <ChannelButtons className="w-full max-w-4xl mx-auto relative z-10 pt-2" />
      </motion.div>
    </section>
  );
}
