"use client"

import { motion } from "framer-motion"
import { MessageCircle, Globe } from "lucide-react"
import { useLanguage } from "@/lib/i18n"
import { t } from "./content"

export default function SolutionSection() {
  const { language } = useLanguage()

  return (
    <section id="solution" className="py-24 md:py-32 w-full flex flex-col items-center bg-transparent scroll-mt-24">
      <div className="w-full max-w-7xl mx-auto px-4 md:px-8 flex flex-col gap-12 md:gap-24">
        <div className="w-full text-center mb-4 md:mb-10 mt-8">
          <motion.h2 initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
            className="text-4xl md:text-5xl lg:text-5xl font-bold text-white leading-tight tracking-tight max-w-4xl mx-auto"
          >{t("solution", language, "title")}</motion.h2>
          <motion.p initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: 0.1 }}
            className="text-lg md:text-xl text-[#9BA4B5] leading-relaxed font-light mt-6 max-w-2xl mx-auto">{t("solution", language, "subtitle")}</motion.p>
        </div>

        <motion.div initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-100px" }}
          className="flex flex-col md:flex-row items-center gap-10 md:gap-20 bg-white/5 border border-white/[0.05] rounded-2xl p-8 md:p-12 overflow-hidden relative">
          <div className="w-full md:w-1/2 relative z-10">
            <div className="w-12 h-12 rounded-xl bg-[#E59E25]/10 flex items-center justify-center mb-6"><Globe className="text-[#E59E25] w-6 h-6" /></div>
            <h3 className="text-3xl md:text-4xl font-bold text-white mb-6 leading-tight">{t("solution", language, "s1Title")}</h3>
            <p className="text-lg text-[#9BA4B5] leading-relaxed mb-8">{t("solution", language, "s1Body")}</p>
          </div>
          <div className="w-full md:w-1/2 relative h-[300px] rounded-2xl overflow-hidden border border-white/[0.05] bg-[#121212]">
            <div className="absolute inset-0 opacity-50" style={{ backgroundImage: "radial-gradient(circle at 50% 50%, #E59E25 0%, transparent 50%)", filter: "blur(40px)" }}/>
            <div className="absolute top-8 left-8 bg-[#121212] border border-white/[0.05] rounded-xl p-4 shadow-[0_4px_24px_rgba(0,0,0,0.2)] flex items-center gap-4">
              <img src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=100&h=100" alt="Avatar" className="w-12 h-12 rounded-full object-cover" />
              <div><p className="text-xs text-[#9BA4B5]">Maria enviou do exterior</p><p className="text-xl font-bold text-white">+ 225 USD</p></div>
            </div>
            <div className="absolute bottom-8 right-8 bg-[#121212] border border-white/[0.05] rounded-xl p-4 shadow-[0_4px_24px_rgba(0,0,0,0.2)] flex items-center gap-4">
              <div><p className="text-xs text-[#9BA4B5]">Você recebeu em BRL</p><p className="text-xl font-bold text-[#E59E25]">+ R$ 1.125,00</p></div>
              <img src="https://flagcdn.com/w40/br.png" alt="Brazil" className="w-10 h-10 rounded-full object-cover" />
            </div>
            <svg className="absolute top-0 left-0 w-full h-full" xmlns="http://www.w3.org/2000/svg">
              <path d="M120,60 C 200,60 150,220 250,220" fill="transparent" stroke="rgba(229, 158, 37, 0.4)" strokeWidth="2" strokeDasharray="5,5" />
            </svg>
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-100px" }}
          className="flex flex-col md:flex-row-reverse items-center gap-10 md:gap-20 bg-white/5 border border-white/[0.05] rounded-2xl p-8 md:p-12 overflow-hidden relative">
          <div className="w-full md:w-1/2 relative z-10">
            <div className="w-12 h-12 rounded-xl bg-[#D48C1C]/10 flex items-center justify-center mb-6"><MessageCircle className="text-[#D48C1C] w-6 h-6" /></div>
            <h3 className="text-3xl md:text-4xl font-bold text-white mb-6 leading-tight">{t("solution", language, "s2Title")}</h3>
            <p className="text-lg text-[#9BA4B5] leading-relaxed">{t("solution", language, "s2Body")}</p>
          </div>
          <div className="w-full md:w-1/2 relative h-[300px] rounded-2xl overflow-hidden border border-white/[0.05] bg-[#121212] flex items-center justify-center">
            <div className="space-y-4 w-full px-6">
              <div className="bg-[#121212] border border-white/[0.05] rounded-2xl rounded-tr-sm p-4 max-w-[80%] self-end ml-auto text-sm text-slate-200">
                Transfere 50 dólares pra Maria Silva via Pix.
              </div>
              <div className="bg-[#121212] border border-white/[0.05] rounded-2xl rounded-tl-sm p-4 max-w-[85%] text-sm text-slate-200 flex flex-col gap-2 shadow-[0_4px_24px_rgba(0,0,0,0.2)]">
                <p>Pronto! Peguei a melhor cotação da Stellar.</p>
                <div className="bg-[#121212] p-3 rounded-xl border border-white/[0.05]">
                  <p className="text-xs text-[#9BA4B5]">Total a pagar</p>
                  <p className="text-lg font-bold text-[#E59E25]">R$ 256,20</p>
                </div>
                <button className="bg-[#D48C1C] text-white font-medium py-2 rounded-lg mt-1 text-xs uppercase tracking-wider w-full">Confirmar Pix</button>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  )
}
