import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { StellarLogo } from './StellarLogo';

export default function Navbar() {
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      if (window.scrollY > 300) {
        setIsScrolled(true);
      } else {
        setIsScrolled(false);
      }
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

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
        <button onClick={() => document.getElementById('solution')?.scrollIntoView({ behavior: 'smooth' })} className="text-sm font-medium text-[#9BA4B5] hover:text-white transition-colors">A Solução</button>
        <button onClick={() => document.getElementById('simulator')?.scrollIntoView({ behavior: 'smooth' })} className="text-sm font-medium text-[#9BA4B5] hover:text-white transition-colors">Simulação de Conversão</button>
        <button onClick={() => document.getElementById('how-it-works')?.scrollIntoView({ behavior: 'smooth' })} className="text-sm font-medium text-[#9BA4B5] hover:text-white transition-colors">Como Funciona</button>
        <button onClick={() => document.getElementById('faq')?.scrollIntoView({ behavior: 'smooth' })} className="text-sm font-medium text-[#9BA4B5] hover:text-white transition-colors">FAQ</button>
      </div>

      <div className="flex items-center gap-4 md:gap-6 min-h-[36px] md:min-h-[40px]">
        <AnimatePresence>
          {!isScrolled && (
            <motion.button 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.2 }}
              onClick={() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' })}
              className="bg-gradient-custom px-4 py-1.5 md:px-6 md:py-2 rounded-full text-xs md:text-sm font-medium text-white hover:glow-gradient hover:scale-105 active:scale-95 transition-all duration-300 transform"
            >
              Começar Agora
            </motion.button>
          )}
        </AnimatePresence>
      </div>
    </motion.nav>
  );
}
