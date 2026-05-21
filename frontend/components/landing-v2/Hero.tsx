import React from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, CheckCircle2, CircleDollarSign, Landmark } from 'lucide-react';
import PhoneMockup from './PhoneMockup';
import ChannelButtons from './ChannelButtons';
import { useLanguage } from '@/lib/i18n';

export default function Hero() {
  const { language, t } = useLanguage();
  const L = (pt: string, en: string) => language === "pt-BR" ? pt : en;
  const firstActions = [
    {
      href: "/chat",
      icon: ArrowRight,
      label: L("Abrir chat web", "Open web chat"),
      detail: L("Comece por saldo, PIX ou pagamento.", "Start with balance, PIX, or payment."),
    },
    {
      href: "/pix-on?amount=10&asset=BRL&from=landing",
      icon: CircleDollarSign,
      label: L("Simular PIX de R$10", "Simulate R$10 PIX"),
      detail: L("Veja intent, status e confirmação.", "See intent, status, and confirmation."),
    },
    {
      href: "/institution-settlement",
      icon: Landmark,
      label: L("Ver infra entre instituições", "View institution rail"),
      detail: L("Painel técnico com logs e evidências.", "Technical panel with logs and evidence."),
    },
  ];

  return (
    <section className="relative flex w-full min-h-screen items-center overflow-hidden pt-24 pb-10">
      <div className="relative z-10 w-full max-w-7xl mx-auto">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8 }}
          className="grid min-w-0 w-full gap-8 overflow-hidden md:grid-cols-[minmax(0,1.04fr)_minmax(0,0.96fr)] items-center"
        >
          <section className="min-w-0 space-y-7 overflow-hidden">
            <div className="inline-flex w-fit items-center gap-2 rounded-full border border-emerald-300/25 bg-emerald-300/10 px-3 py-2 text-xs font-bold uppercase tracking-[0.14em] text-emerald-100">
              <CheckCircle2 className="h-4 w-4" />
              {L("Demo sandbox/testnet", "Sandbox/testnet demo")}
            </div>

            <div className="space-y-4">
              <h1 className="max-w-2xl text-4xl font-bold tracking-tight text-white md:text-[60px] leading-[1.04]">
                {t("hero_title_1")} <br className="hidden md:block"/>
                <span className="text-[#00D2FF]">{t("hero_title_2")}</span>
              </h1>
              <p className="max-w-xl text-base leading-relaxed text-[#9BA4B5] md:text-lg">
                {t("hero_subtitle")}
              </p>
            </div>

            <ChannelButtons />

            <div className="grid min-w-0 gap-3 md:grid-cols-3">
              {firstActions.map(({ href, icon: Icon, label, detail }) => (
                <a
                  key={href}
                  href={href}
                  className="group min-w-0 rounded-2xl border border-white/10 bg-white/[0.04] p-4 transition hover:border-[#00D2FF]/40 hover:bg-white/[0.07]"
                >
                  <div className="flex items-center gap-2 text-sm font-black text-white">
                    <Icon className="h-4 w-4 text-[#00D2FF]" />
                    <span className="truncate">{label}</span>
                  </div>
                  <p className="mt-2 text-xs leading-5 text-[#9BA4B5]">{detail}</p>
                </a>
              ))}
            </div>

            <div className="grid min-w-0 gap-4 sm:grid-cols-2 pt-2">
              <div className="min-w-0 overflow-hidden rounded-xl border border-white/[0.08] bg-black/20 p-5">
                <p className="text-xs uppercase tracking-[0.2em] text-[#00D2FF]/80 font-semibold">{t("hero_card_1_title")}</p>
                <p className="mt-2 text-sm text-[#9BA4B5] leading-relaxed">{t("hero_card_1_body")}</p>
              </div>
              <div className="min-w-0 overflow-hidden rounded-xl border border-white/[0.08] bg-black/20 p-5">
                <p className="text-xs uppercase tracking-[0.2em] text-[#00D2FF]/80 font-semibold">{t("hero_card_2_title")}</p>
                <p className="mt-2 text-sm text-[#9BA4B5] leading-relaxed">{t("hero_card_2_body")}</p>
              </div>
            </div>
          </section>

          <section className="relative min-w-0 flex justify-center items-center">
            <div className="transform scale-[0.85] sm:scale-100 origin-center drop-shadow-[0_4px_24px_rgba(0,0,0,0.2)]">
              <PhoneMockup />
            </div>
          </section>

        </motion.div>
      </div>
    </section>
  );
}
