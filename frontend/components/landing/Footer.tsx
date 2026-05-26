import { StellarLogo } from './StellarLogo';
import { useLanguage } from '@/lib/i18n';

export default function Footer() {
  const { language } = useLanguage();
  const L = (pt: string, en: string) => language === "pt-BR" ? pt : en;

  return (
    <footer className="w-full border-t border-white/[0.03] bg-[#0C1421]/80 backdrop-blur-md py-12 mt-auto relative z-10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row items-center justify-between gap-8 md:gap-6 text-center md:text-left">
        
        <div className="flex flex-col items-center md:items-start">
          <div className="flex items-center gap-2 mb-1">
            <StellarLogo className="w-6 h-6 text-white" />
            <span className="text-lg font-bold text-white">TalkToStellar</span>
          </div>
          <span className="text-sm text-gray-500">© 2026 {L("Todos os direitos reservados.", "All rights reserved.")}</span>
        </div>

        <div className="flex flex-col sm:flex-row items-center gap-4 sm:gap-6 text-sm text-gray-400">
          <a href="#" className="hover:text-white transition-colors">{L("Termos de uso", "Terms of Use")}</a>
          <a href="#" className="hover:text-white transition-colors">{L("Política de privacidade", "Privacy Policy")}</a>
        </div>

        <div className="flex items-center gap-2 text-sm font-medium text-gray-300 bg-white/5 px-4 py-2 rounded-full border border-white/[0.03]">
          {L("Criado para PIX, rendimento e saída", "Built for PIX, yield, and withdrawal")}
        </div>

      </div>
    </footer>
  );
}
