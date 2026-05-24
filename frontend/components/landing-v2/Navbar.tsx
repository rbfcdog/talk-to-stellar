import React from 'react';
import { motion } from 'framer-motion';
import { StellarLogo } from './StellarLogo';
import { useLanguage } from '@/lib/i18n';

export default function Navbar() {
  const { language, t } = useLanguage();
  const L = (pt: string, en: string) => language === "pt-BR" ? pt : en;

  return (
    <motion.nav 
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6 }}
      className="absolute top-0 left-0 right-0 z-50 flex items-center justify-between px-4 md:px-8 py-3 md:py-4 backdrop-blur-md bg-[#0C1421]/80 border-b border-white/[0.03]"
    >
      <div className="flex items-center gap-2">
        <StellarLogo className="w-6 h-6 md:w-8 md:h-8 text-white" />
        <span className="text-lg md:text-xl font-bold tracking-tight text-gradient">
          TalkToStellar
        </span>
      </div>

      <div className="hidden lg:flex items-center gap-8 absolute left-1/2 -translate-x-1/2">
        <button onClick={() => document.getElementById('solution')?.scrollIntoView({ behavior: 'smooth' })} className="text-sm font-medium text-[#9BA4B5] hover:text-white transition-colors">{t("nav_solution")}</button>
        <button onClick={() => document.getElementById('simulator')?.scrollIntoView({ behavior: 'smooth' })} className="text-sm font-medium text-[#9BA4B5] hover:text-white transition-colors">{t("nav_simulator")}</button>
        <button onClick={() => document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' })} className="text-sm font-medium text-[#9BA4B5] hover:text-white transition-colors">{t("nav_how")}</button>
        <button onClick={() => document.getElementById('faq')?.scrollIntoView({ behavior: 'smooth' })} className="text-sm font-medium text-[#9BA4B5] hover:text-white transition-colors">FAQ</button>
      </div>

      <button
        onClick={() => document.getElementById('start')?.scrollIntoView({ behavior: 'smooth' })}
        className="shrink-0 rounded-full border border-[#00D2FF]/30 bg-[#00D2FF]/10 px-4 py-2 text-sm font-black text-white transition hover:border-[#00D2FF]/60 hover:bg-[#00D2FF]/20 md:px-5"
      >
        {L("Começar agora", "Start now")}
      </button>
    </motion.nav>
  );
}
