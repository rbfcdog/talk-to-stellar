"use client"

import { motion } from "framer-motion"
import { MessageCircle, Send, CheckCircle2, Monitor } from "lucide-react"
import PhoneMockup from "./PhoneMockup"
import { useLanguage } from "@/lib/i18n"
import { t } from "./content"

export default function Hero() {
  const { language } = useLanguage()

  return (
    <section className="relative w-full min-h-screen flex items-center pt-28 pb-12 overflow-hidden px-4 sm:px-6 lg:px-8">
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.08]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.18) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.18) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
        aria-hidden
      />
      <div className="relative z-10 w-full max-w-7xl mx-auto">
        <div className="flex flex-col lg:flex-row items-center justify-between gap-12 lg:gap-8">
          <motion.div initial="hidden" animate="visible" variants={{ hidden: { opacity: 0 }, visible: { opacity: 1, transition: { staggerChildren: 0.15 } } }}
            className="flex-1 flex flex-col gap-6 max-w-2xl"
          >
            <motion.div variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0, transition: { duration: 0.8, ease: "easeOut" } } }}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/10 bg-white/5 w-fit"
            >
              <CheckCircle2 size={14} className="text-gray-400" />
              <span className="text-[10px] font-bold text-gray-300 tracking-[0.15em] uppercase">{t("hero", language, "badge")}</span>
            </motion.div>
            <motion.div variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0, transition: { duration: 0.8, ease: "easeOut" } } }} className="space-y-4">
              <h1 className="text-4xl md:text-5xl lg:text-[56px] font-bold text-white tracking-tight leading-[1.1]">
                {t("hero", language, "title1")}<br />
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#D48C1C] to-[#E59E25]">{t("hero", language, "title2")}</span>
              </h1>
              <p className="text-base md:text-lg text-[#9BA4B5] leading-relaxed max-w-xl">{t("hero", language, "subtitle")}</p>
            </motion.div>
            <motion.div variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0, transition: { duration: 0.8, ease: "easeOut" } } }}
              className="flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center gap-4 mt-4"
            >
              <a href="https://t.me/TalkToStellarTLBot" target="_blank" rel="noopener noreferrer"
                className="flex flex-1 sm:flex-none items-center justify-center gap-2 px-8 py-4 rounded-xl border border-white/10 hover:bg-white/5 transition text-base font-semibold text-white"
              ><Send size={20} className="text-[#229ED9]" /> {t("hero", language, "btnTelegram")}</a>
              <a href="https://wa.me/5519981808102" target="_blank" rel="noopener noreferrer"
                className="flex flex-1 sm:flex-none items-center justify-center gap-2 px-8 py-4 rounded-xl border border-white/10 hover:bg-white/5 transition text-base font-semibold text-white"
              ><MessageCircle size={20} className="text-[#25D366]" /> {t("hero", language, "btnWhatsApp")}</a>
              <a href="/chat"
                className="flex w-full sm:w-auto items-center justify-center gap-2 px-8 py-4 rounded-xl bg-[#E59E25] text-black hover:bg-[#D48C1C] transition shadow-[0_0_20px_rgba(229,158,37,0.2)] text-base font-semibold"
              ><Monitor size={20} /> {t("hero", language, "btnWebChat")}</a>
            </motion.div>
            <motion.div variants={{ hidden: { opacity: 0, y: 20 }, visible: { opacity: 1, y: 0, transition: { duration: 0.8, ease: "easeOut" } } }}
              className="grid grid-cols-1 sm:grid-cols-2 gap-8 mt-8 pt-6 border-t border-white/[0.05]"
            >
              <div>
                <h3 className="text-[11px] font-bold tracking-[0.15em] text-[#E59E25] uppercase mb-2">{t("hero", language, "card1Title")}</h3>
                <p className="text-sm text-[#9BA4B5] leading-relaxed">{t("hero", language, "card1Body")}</p>
              </div>
              <div>
                <h3 className="text-[11px] font-bold tracking-[0.15em] text-[#E59E25] uppercase mb-2">{t("hero", language, "card2Title")}</h3>
                <p className="text-sm text-[#9BA4B5] leading-relaxed">{t("hero", language, "card2Body")}</p>
              </div>
            </motion.div>
          </motion.div>
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.8, delay: 0.2 }}
            className="flex-1 w-full max-w-[400px] lg:max-w-[420px] flex justify-center mt-12 lg:mt-0"
          >
            <motion.div animate={{ y: [0, -15, 0] }} transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
              className="w-full flex justify-center drop-shadow-[0_4px_32px_rgba(0,0,0,0.4)]"
            ><PhoneMockup /></motion.div>
          </motion.div>
        </div>
      </div>
    </section>
  )
}
