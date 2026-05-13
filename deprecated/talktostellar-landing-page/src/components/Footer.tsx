import React from 'react';
import { StellarLogo } from './StellarLogo';

export default function Footer() {
  return (
    <footer className="w-full border-t border-white/[0.03] bg-[#0C1421]/80 backdrop-blur-md py-12 mt-auto relative z-10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row items-center justify-between gap-8 md:gap-6 text-center md:text-left">
        
        <div className="flex flex-col items-center md:items-start">
          <div className="flex items-center gap-2 mb-1">
            <StellarLogo className="w-6 h-6 text-white" />
            <span className="text-lg font-bold text-white">TalkToStellar</span>
          </div>
          <span className="text-sm text-gray-500">© 2026 Todos os direitos reservados.</span>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-6 text-sm text-gray-400">
          <a href="#" className="hover:text-white transition-colors">Termos de Uso</a>
          <a href="#" className="hover:text-white transition-colors">Política de Privacidade</a>
        </div>

        <div className="flex items-center gap-2 text-sm font-medium text-gray-300 bg-white/5 px-4 py-2 rounded-full border border-white/[0.03]">
          Built for <span className="text-gradient font-bold flex items-center gap-1"><StellarLogo className="w-4 h-4" /> Stellar</span>
        </div>

      </div>
    </footer>
  );
}
