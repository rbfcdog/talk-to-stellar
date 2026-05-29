"use client"

import { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Globe } from "lucide-react"
import { StellarLogo } from "./StellarLogo"
import { useLanguage } from "@/lib/i18n"
import { t } from "./content"

export default function Navbar() {
  const [showCTA, setShowCTA] = useState(false)
  const { language, toggleLanguage } = useLanguage()

  useEffect(() => {
    const handleScroll = () => {
      const scrollY = window.scrollY
      const docHeight = document.body.scrollHeight
      const winHeight = window.innerHeight
      setShowCTA(scrollY > 500 && scrollY < docHeight - winHeight - 600)
    }
    window.addEventListener("scroll", handleScroll)
    return () => window.removeEventListener("scroll", handleScroll)
  }, [])

  const navItems = t("nav", language) as string[]

  return (
    <>
      <motion.nav initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6 }}
        className="fixed top-0 left-0 right-0 z-50 flex items-center justify-between px-4 md:px-8 py-3 md:py-4 backdrop-blur-md border-b border-white/[0.05]"
      >
        <div className="flex items-center gap-2">
          <StellarLogo className="w-6 h-6 md:w-8 md:h-8 text-white" />
          <span className="text-lg md:text-xl font-bold tracking-tight text-gradient">TalkToStellar</span>
        </div>
        <div className="hidden lg:flex items-center gap-8 absolute left-1/2 -translate-x-1/2">
          <button onClick={() => document.getElementById("solution")?.scrollIntoView({ behavior: "smooth" })}
            className="text-sm font-medium text-[#9BA4B5] hover:text-white transition-colors">{navItems[0]}</button>
          <button onClick={() => document.getElementById("simulator")?.scrollIntoView({ behavior: "smooth" })}
            className="text-sm font-medium text-[#9BA4B5] hover:text-white transition-colors">{navItems[1]}</button>
          <button onClick={() => document.getElementById("how-it-works")?.scrollIntoView({ behavior: "smooth" })}
            className="text-sm font-medium text-[#9BA4B5] hover:text-white transition-colors">{navItems[2]}</button>
          <button onClick={() => document.getElementById("faq")?.scrollIntoView({ behavior: "smooth" })}
            className="text-sm font-medium text-[#9BA4B5] hover:text-white transition-colors">{navItems[3]}</button>
        </div>
        <div className="flex items-center gap-4 md:gap-6 min-h-[36px] md:min-h-[40px]">
          <button onClick={toggleLanguage}
            className="flex items-center gap-1 px-3 py-2 rounded-full border border-white/10 hover:bg-white/5 transition text-xs font-medium text-white uppercase"
          >
            <Globe size={14} /> {language === "pt-BR" ? "PT" : "EN"}
          </button>
        </div>
      </motion.nav>
      <AnimatePresence>
        {showCTA && (
          <motion.div initial={{ opacity: 0, scale: 0.9, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.9, y: 20 }} transition={{ duration: 0.2 }}
            className="fixed bottom-6 right-6 z-50"
          >
            <button onClick={() => document.getElementById("cta")?.scrollIntoView({ behavior: "smooth" })}
              className="bg-[#E59E25] px-6 py-3 rounded-full text-sm font-bold text-black hover:bg-[#D48C1C] hover:scale-105 active:scale-95 transition-all duration-300 shadow-[0_4px_24px_rgba(229,158,37,0.4)] flex items-center gap-2">
              {language === "pt-BR" ? "Começar Agora" : "Start Now"}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
