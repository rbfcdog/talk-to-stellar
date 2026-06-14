"use client"

import { motion } from "framer-motion"
import { MessageCircle, Send, Monitor } from "lucide-react"
import { useLanguage } from "@/lib/i18n"
import { t } from "./content"
import EarlyAccessSignup from "./EarlyAccessSignup"

export default function CTA() {
  const { language } = useLanguage()

  return (
    <section id="cta" className="py-24 md:py-32 w-full flex flex-col items-center relative px-4 sm:px-8 border-t border-white/5 scroll-mt-24">
      <div className="w-full max-w-7xl relative z-10 flex flex-col gap-16">
        <div className="w-full max-w-4xl flex flex-col items-start gap-6">
          <motion.h2 initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
            className="text-4xl md:text-5xl lg:text-7xl font-extrabold text-white leading-[0.95] tracking-tight"
          >
            {t("cta", language, "title1")} <br className="hidden lg:block" /><span className="text-[#E59E25]">{t("cta", language, "title2")}</span>
          </motion.h2>
          <motion.p initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: 0.1 }}
            className="text-lg md:text-xl text-[#9BA4B5] max-w-2xl leading-relaxed font-medium mt-2">{t("cta", language, "subtitle")}</motion.p>
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: 0.2 }}
            className="flex flex-col sm:flex-row flex-wrap gap-4 mt-6 w-full sm:w-auto"
          >
            <a href="https://t.me/TalkToStellarTLBot" target="_blank" rel="noopener noreferrer"
              className="inline-flex flex-1 sm:flex-none items-center justify-center gap-2 rounded-xl bg-[#D48C1C] px-8 py-4 text-sm font-bold text-black transition hover:bg-[#E59E25]"
            ><Send className="h-4 w-4" /> <span>Telegram</span></a>
            <a href="https://wa.me/5519981808102" target="_blank" rel="noopener noreferrer"
              className="inline-flex flex-1 sm:flex-none items-center justify-center gap-2 rounded-xl bg-transparent border border-white/10 px-8 py-4 text-sm font-bold text-white transition hover:bg-white/5"
            ><MessageCircle className="h-4 w-4 text-[#E59E25]" /> <span>{language === "pt-BR" ? "WhatsApp" : "WhatsApp"}</span></a>
            <a href="/chat"
              className="inline-flex flex-1 sm:flex-none items-center justify-center gap-2 rounded-xl bg-white/5 border border-white/[0.05] px-8 py-4 text-sm font-bold text-white transition hover:bg-white/10"
            ><Monitor className="h-4 w-4 text-[#D48C1C]" /> <span>{language === "pt-BR" ? "Abrir chat web" : "Open web chat"}</span></a>
          </motion.div>
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: 0.3 }}
            className="mt-2 w-full"
          >
            <EarlyAccessSignup />
          </motion.div>
        </div>
        <motion.div initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
          className="grid grid-cols-1 md:grid-cols-3 gap-8 md:gap-12 pt-16 border-t border-white/10"
        >
          <div>
            <div className="text-2xl md:text-3xl font-mono font-bold text-[#E59E25] mb-2 tracking-tight">{t("cta", language, "stat1Value")}</div>
            <div className="text-[10px] text-[#A1A1A1] font-mono tracking-widest uppercase font-bold">{t("cta", language, "stat1Label")}</div>
          </div>
          <div>
            <div className="text-2xl md:text-3xl font-mono font-bold text-[#E59E25] mb-2 tracking-tight">{t("cta", language, "stat2Value")}</div>
            <div className="text-[10px] text-[#A1A1A1] font-mono tracking-widest uppercase font-bold">{t("cta", language, "stat2Label")}</div>
          </div>
          <div>
            <div className="text-2xl md:text-3xl font-mono font-bold text-[#E59E25] mb-2 tracking-tight">{t("cta", language, "stat3Value")}</div>
            <div className="text-[10px] text-[#A1A1A1] font-mono tracking-widest uppercase font-bold">{t("cta", language, "stat3Label")}</div>
          </div>
        </motion.div>
      </div>
    </section>
  )
}
