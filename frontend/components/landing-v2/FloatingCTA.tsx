import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageCircle } from 'lucide-react';

export default function FloatingCTA() {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const toggleVisibility = () => {
      const isNearBottom = window.innerHeight + window.scrollY >= document.body.offsetHeight - 500;
      // Show the floating button after scrolling down 300px, but hide if near bottom
      if (window.scrollY > 300 && !isNearBottom) {
        setIsVisible(true);
      } else {
        setIsVisible(false);
      }
    };

    window.addEventListener('scroll', toggleVisibility);
    return () => window.removeEventListener('scroll', toggleVisibility);
  }, []);

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, y: 50, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 50, scale: 0.9 }}
          transition={{ duration: 0.4, type: 'spring', stiffness: 260, damping: 20 }}
          className="fixed bottom-6 right-6 md:bottom-8 md:right-8 z-[100]"
        >
          <button 
            onClick={() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' })}
            className="flex items-center justify-center gap-2 bg-gradient-custom text-white px-6 py-3 md:px-8 md:py-4 rounded-full font-bold text-sm md:text-base shadow-[0_0_40px_rgba(129,140,248,0.5)] hover:shadow-[0_0_60px_rgba(34,211,238,0.6)] transition-all duration-300 transform hover:scale-105 active:scale-95 border border-white/[0.03]"
          >
            <MessageCircle size={22} />
            Começar Agora
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
