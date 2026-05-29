import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Send, MessageCircle, Monitor, Globe, Moon, Sun } from 'lucide-react';
import { StellarLogo } from './StellarLogo';

export default function Navbar() {
  const [showCTA, setShowCTA] = useState(false);
  const [isDarkMode, setIsDarkMode] = useState(true);

  useEffect(() => {
    const handleScroll = () => {
      const scrollY = window.scrollY;
      const docHeight = document.body.scrollHeight;
      const winHeight = window.innerHeight;
      
      // Tela 2 approx happens after 500px of scrolling
      const isPastHero = scrollY > 500;
      // Penúltima before CTA approx docHeight - winHeight - 600
      const isBeforeFooter = scrollY < docHeight - winHeight - 600;

      if (isPastHero && isBeforeFooter) {
        setShowCTA(true);
      } else {
        setShowCTA(false);
      }
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  return (
    <>
      <motion.nav 
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="absolute top-0 left-0 right-0 z-50 flex items-center justify-between px-4 md:px-8 py-3 md:py-4 backdrop-blur-md border-b border-white/[0.05]"
      >
        <div className="flex items-center gap-2">
          <StellarLogo className="w-6 h-6 md:w-8 md:h-8 text-white" />
          <span className="text-lg md:text-xl font-bold tracking-tight text-gradient">
            TalkToStellar
          </span>
        </div>

        <div className="hidden lg:flex items-center gap-8 absolute left-1/2 -translate-x-1/2">
          <button onClick={() => document.getElementById('solution')?.scrollIntoView({ behavior: 'smooth' })} className="text-sm font-medium text-[#9BA4B5] hover:text-white transition-colors">A Solução</button>
          <button onClick={() => document.getElementById('simulator')?.scrollIntoView({ behavior: 'smooth' })} className="text-sm font-medium text-[#9BA4B5] hover:text-white transition-colors">Simulação de Conversão</button>
          <button onClick={() => document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' })} className="text-sm font-medium text-[#9BA4B5] hover:text-white transition-colors">Como Funciona</button>
          <button onClick={() => document.getElementById('faq')?.scrollIntoView({ behavior: 'smooth' })} className="text-sm font-medium text-[#9BA4B5] hover:text-white transition-colors">FAQ</button>
        </div>

        <div className="flex items-center gap-4 md:gap-6 min-h-[36px] md:min-h-[40px]">
          <div className="flex items-center gap-2">
            <button 
              onClick={() => setIsDarkMode(!isDarkMode)}
              className="flex items-center justify-center w-8 h-8 rounded-full border border-white/10 hover:bg-white/5 transition text-white"
            >
              {isDarkMode ? <Moon size={14} /> : <Sun size={14} />}
            </button>
            <button className="hidden sm:flex items-center gap-1 px-3 py-2 rounded-full border border-white/10 hover:bg-white/5 transition text-xs font-medium text-white uppercase ml-1">
              <Globe size={14} /> EN
            </button>
          </div>
        </div>
      </motion.nav>

      <AnimatePresence>
        {showCTA && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            transition={{ duration: 0.2 }}
            className="fixed bottom-6 right-6 z-50"
          >
            <button 
              onClick={() => document.getElementById('cta')?.scrollIntoView({ behavior: 'smooth' })}
              className="bg-[#E59E25] px-6 py-3 rounded-full text-sm font-bold text-black hover:bg-[#D48C1C] hover:scale-105 active:scale-95 transition-all duration-300 shadow-[0_4px_24px_rgba(229,158,37,0.4)] flex items-center gap-2"
            >
              Começar Agora
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
