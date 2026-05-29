"use client"

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Plus, Minus } from "lucide-react"
import { useLanguage } from "@/lib/i18n"
import { t } from "./content"

export default function FAQSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(null)
  const { language } = useLanguage()
  const faqs = t("faq", language, "items") as { q: string; a: string }[]

  return (
    <section id="faq" className="py-20 md:py-32 w-full max-w-4xl mx-auto px-4 sm:px-0 scroll-mt-24">
      <div className="text-center mb-16">
        <h2 className="text-3xl md:text-5xl font-bold text-white mb-4">{t("faq", language, "title")}</h2>
      </div>
      <div className="flex flex-col border-t border-white/[0.05]">
        {faqs.map((faq, index) => (
          <div key={index} className="border-b border-white/[0.05]">
            <button onClick={() => setOpenIndex(openIndex === index ? null : index)}
              className="w-full flex items-center justify-between py-6 text-left focus:outline-none group"
            >
              <span className="text-xl md:text-2xl font-medium text-white group-hover:text-[#E59E25] transition-colors">{faq.q}</span>
              <div className="shrink-0 ml-4 text-white">
                {openIndex === index ? <Minus className="w-6 h-6 md:w-8 md:h-8" /> : <Plus className="w-6 h-6 md:w-8 md:h-8" />}
              </div>
            </button>
            <AnimatePresence>
              {openIndex === index && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.3, ease: "easeInOut" }} className="overflow-hidden">
                  <p className="pb-6 text-[#9BA4B5] text-lg md:text-xl leading-relaxed">{faq.a}</p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ))}
      </div>
    </section>
  )
}
