"use client"

import { StellarLogo } from "./StellarLogo"
import { Instagram, Linkedin, Twitter } from "lucide-react"
import { useLanguage } from "@/lib/i18n"
import { t } from "./content"

export default function Footer() {
  const { language } = useLanguage()

  return (
    <footer className="w-full bg-[#080808] bg-dotted-pattern pt-24 pb-12 relative z-10 px-4 sm:px-8">
      <div className="max-w-7xl mx-auto flex flex-col gap-16">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-12 text-left">
          <div className="lg:col-span-2 flex flex-col items-start pr-8">
            <div className="flex items-center gap-2 mb-4">
              <div className="w-8 h-8 rounded-full bg-white flex items-center justify-center"><StellarLogo className="w-4 h-4 text-black" /></div>
              <span className="text-xl font-extrabold text-white tracking-tight">TalkToStellar</span>
            </div>
            <p className="text-sm text-[#A1A1A1] leading-relaxed max-w-xs font-medium">{t("footer", language, "description")}</p>
          </div>
          <div className="flex flex-col gap-4">
            <h4 className="text-[10px] font-mono font-bold tracking-widest uppercase text-[#A1A1A1] mb-2">{t("footer", language, "product")}</h4>
            <a href="#solution" className="text-sm text-white/80 hover:text-white transition-colors">{t("footer", language, "solution")}</a>
            <a href="#simulator" className="text-sm text-white/80 hover:text-white transition-colors">{t("footer", language, "simulation")}</a>
            <a href="#how-it-works" className="text-sm text-white/80 hover:text-white transition-colors">{t("footer", language, "howItWorks")}</a>
            <a href="#faq" className="text-sm text-white/80 hover:text-white transition-colors">FAQ</a>
          </div>
          <div className="flex flex-col gap-4">
            <h4 className="text-[10px] font-mono font-bold tracking-widest uppercase text-[#A1A1A1] mb-2">{t("footer", language, "legal")}</h4>
            <a href="#" className="text-sm text-white/80 hover:text-white transition-colors">{t("footer", language, "tos")}</a>
            <a href="#" className="text-sm text-white/80 hover:text-white transition-colors">{t("footer", language, "privacy")}</a>
          </div>
          <div className="flex flex-col gap-4">
            <h4 className="text-[10px] font-mono font-bold tracking-widest uppercase text-[#A1A1A1] mb-2">{t("footer", language, "contacts")}</h4>
            <div className="flex items-center gap-4">
              <a href="#" className="text-white/80 hover:text-white transition-colors"><Instagram size={18} /></a>
              <a href="#" className="text-white/80 hover:text-white transition-colors"><Linkedin size={18} /></a>
              <a href="#" className="text-white/80 hover:text-white transition-colors"><Twitter size={18} /></a>
            </div>
          </div>
        </div>
        <div className="flex flex-col sm:flex-row items-center justify-between pt-12 text-[10px] font-mono font-medium text-[#A1A1A1] border-white/5 border-t">
          <span>&copy; 2026 TalkToStellar. {t("footer", language, "rights")}</span>
          <div className="flex items-center gap-2 mt-4 sm:mt-0">
            {t("footer", language, "built")} <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#E59E25] to-[#D48C1C] font-bold flex items-center gap-1"><StellarLogo className="w-3 h-3 text-[#E59E25]" /> Stellar</span>
          </div>
        </div>
      </div>
    </footer>
  )
}
