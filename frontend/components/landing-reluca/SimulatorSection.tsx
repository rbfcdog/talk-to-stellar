"use client"

import { useState } from "react"
import { motion } from "framer-motion"
import { ArrowRightLeft } from "lucide-react"
import { useLanguage } from "@/lib/i18n"
import { t } from "./content"

export default function SimulatorSection() {
  const [brlAmount, setBrlAmount] = useState("1000")
  const { language } = useLanguage()
  const exchangeRate = 0.18
  const usdcAmount = (parseFloat(brlAmount || "0") * exchangeRate).toFixed(2)
  const brlNum = parseFloat(brlAmount || "0")

  return (
    <section id="simulator" className="py-20 w-full flex flex-col items-center relative scroll-mt-24">
      <div className="text-center mb-12">
        <h2 className="text-3xl md:text-5xl font-bold mb-4 text-white leading-tight">
          {t("simulator", language, "title1")} <span className="text-[#E59E25]">{t("simulator", language, "title2")}</span>
        </h2>
        <p className="text-lg text-[#9BA4B5] max-w-2xl mx-auto">{t("simulator", language, "subtitle")}</p>
      </div>
      <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
        className="w-full max-w-md relative min-w-0 overflow-hidden rounded-[1.5rem] border border-white/[0.05] bg-[#080808]/80 backdrop-blur-md p-6 shadow-[0_4px_24px_rgba(0,0,0,0.2)]"
      >
        <div className="absolute top-0 right-0 w-32 h-32 bg-[#E59E25]/10 blur-[50px] pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-32 h-32 bg-[#D48C1C]/10 blur-[50px] pointer-events-none" />
        <div className="text-center mb-8 relative z-10">
          <p className="text-[#9BA4B5] text-sm font-medium">{t("simulator", language, "rateLabel")}</p>
          <p className="text-[#E59E25] font-semibold mt-1">1 BRL = {exchangeRate.toFixed(4)} USD</p>
        </div>
        <div className="space-y-6 relative z-10">
          <div className="bg-white/5 border border-white/[0.05] rounded-2xl p-4 transition-colors focus-within:border-[#E59E25]/50 hover:border-white/[0.05]">
            <label className="block text-xs font-medium text-[#9BA4B5] mb-2 uppercase tracking-wider">{t("simulator", language, "youSend")}</label>
            <div className="flex items-center justify-between">
              <input type="number" value={brlAmount} onChange={(e) => setBrlAmount(e.target.value)}
                className="bg-transparent border-none outline-none text-3xl font-bold text-white w-full" placeholder="0.00" />
              <div className="flex items-center gap-2 bg-[#080808]/80 rounded-full px-3 py-1.5 shrink-0 ml-2 border border-white/[0.05]">
                <img src="https://flagcdn.com/w20/br.png" alt="BRL" className="w-5 h-5 rounded-full object-cover" />
                <span className="font-bold text-slate-200">BRL</span>
              </div>
            </div>
          </div>
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-20 pointer-events-none">
            <div className="bg-[#16324f] border border-white/[0.05] p-2 rounded-full hidden sm:block shadow-[0_4px_24px_rgba(0,0,0,0.2)]">
              <ArrowRightLeft className="w-5 h-5 text-[#E59E25] rotate-90" />
            </div>
          </div>
          <div className="bg-white/5 border border-white/[0.05] rounded-2xl p-4">
            <label className="block text-xs font-medium text-[#9BA4B5] mb-2 uppercase tracking-wider">{t("simulator", language, "youReceive")}</label>
            <div className="flex items-center justify-between">
              <input type="text" value={usdcAmount} readOnly
                className="bg-transparent border-none outline-none text-3xl font-bold text-[#E59E25] w-full" placeholder="0.00" />
              <div className="flex items-center gap-2 bg-[#080808]/80 rounded-full px-3 py-1.5 shrink-0 ml-2 border border-white/[0.05]">
                <div className="w-5 h-5 rounded-full bg-[#D48C1C] flex items-center justify-center"><span className="text-white text-[10px] font-bold">$</span></div>
                <span className="font-bold text-slate-200">USD</span>
              </div>
            </div>
          </div>
        </div>
        <div className="space-y-6 relative z-10 w-full mt-8">
          <a href="/chat"
            className="block w-full bg-[#E59E25] text-slate-950 font-bold text-lg py-4 rounded-xl hover:bg-cyan-300 transition-colors shadow-[0_0_20px_rgba(34,211,238,0.2)] text-center"
          >{t("simulator", language, "sendNow")}</a>
        </div>
      </motion.div>
      <div className="w-full max-w-5xl mx-auto px-4 mt-16">
        <h4 className="text-xl md:text-2xl font-semibold text-white text-center mb-8">{t("simulator", language, "comparisonTitle")}</h4>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-stretch">
          <div className="bg-[#121212] border border-white/[0.05] rounded-2xl p-6 flex flex-col items-center text-center shadow-[0_4px_24px_rgba(0,0,0,0.2)] relative opacity-70 hover:opacity-100 transition-opacity">
            <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center mb-4"><span className="text-red-500 font-bold text-lg">✗</span></div>
            <h5 className="text-white font-medium mb-1">{t("simulator", language, "banks")}</h5>
            <p className="text-[#9BA4B5] text-sm mb-4">{t("simulator", language, "banksSub")}</p>
            <div className="mt-auto pt-4 border-t border-white/[0.05] w-full">
              <p className="text-[11px] text-[#9BA4B5] uppercase tracking-wider mb-1">{t("simulator", language, "youLose")}</p>
              <p className="font-bold text-red-400 text-xl">R$ {(brlNum * 0.06).toFixed(2)}</p>
              <p className="text-xs text-red-500/60 mt-1">~6% {t("simulator", language, "spreadIof")}</p>
            </div>
          </div>
          <div className="bg-[#080808] border border-[#E59E25]/30 rounded-2xl p-8 flex flex-col items-center text-center shadow-[0_4px_32px_rgba(34,211,238,0.15)] relative transform md:-translate-y-4 z-10">
            <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-1 bg-gradient-to-r from-transparent via-[#E59E25] to-transparent" />
            <div className="w-16 h-16 rounded-full bg-[#E59E25]/10 flex items-center justify-center mb-4 border border-[#E59E25]/20"><span className="text-[#E59E25] font-bold text-2xl">✓</span></div>
            <h5 className="text-white font-bold text-lg mb-1">{t("pathfinding", language, "tts")}</h5>
            <p className="text-[#E59E25] text-sm font-medium mb-4">{t("simulator", language, "ttsSub")}</p>
            <div className="mt-auto pt-4 border-t border-white/[0.05] w-full">
              <p className="text-[11px] text-[#E59E25]/70 uppercase tracking-wider mb-1">{t("simulator", language, "from")}</p>
              <p className="font-black text-[#E59E25] text-3xl">0.05%</p>
              <p className="text-xs text-[#9BA4B5] mt-2">{t("simulator", language, "bestGuaranteed")}</p>
            </div>
          </div>
          <div className="bg-[#121212] border border-white/[0.05] rounded-2xl p-6 flex flex-col items-center text-center shadow-[0_4px_24px_rgba(0,0,0,0.2)] relative opacity-70 hover:opacity-100 transition-opacity">
            <div className="w-12 h-12 rounded-full bg-orange-500/10 flex items-center justify-center mb-4"><span className="text-orange-500 font-bold text-lg">✗</span></div>
            <h5 className="text-white font-medium mb-1">{t("simulator", language, "apps")}</h5>
            <p className="text-[#9BA4B5] text-sm mb-4">{t("simulator", language, "appsSub")}</p>
            <div className="mt-auto pt-4 border-t border-white/[0.05] w-full">
              <p className="text-[11px] text-[#9BA4B5] uppercase tracking-wider mb-1">{t("simulator", language, "youLose")}</p>
              <p className="font-bold text-orange-400 text-xl">R$ {(brlNum * 0.04).toFixed(2)}</p>
              <p className="text-xs text-orange-500/60 mt-1">~4% {t("simulator", language, "avgSpread")}</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
