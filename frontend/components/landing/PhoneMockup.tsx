import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence, useInView } from 'framer-motion';
import { ChevronLeft, Video, Phone, Plus, Camera, Mic, Smile, BadgeCheck, CheckCheck } from 'lucide-react';
import { StellarLogo } from './StellarLogo';
import { useLanguage } from '@/lib/i18n';

export default function PhoneMockup() {
  const { language } = useLanguage();
  const L = (pt: string, en: string) => language === "pt-BR" ? pt : en;
  const [step, setStep] = useState(0);
  const chatRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isInView = useInView(containerRef, { once: true, margin: "-100px" });

  useEffect(() => {
    if (!isInView) return;

    const timer1 = setTimeout(() => setStep(1), 1000);
    const timer2 = setTimeout(() => setStep(2), 3500);
    const timer3 = setTimeout(() => setStep(3), 5500);

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(timer3);
    };
  }, [isInView]);

  useEffect(() => {
    if (chatRef.current) {
      chatRef.current.scrollTop = chatRef.current.scrollHeight;
    }
  }, [step]);

  return (
    <div ref={containerRef} className="relative w-[340px] h-[780px] rounded-2xl border-[8px] border-[#1a1a1a] bg-[#0C1421] overflow-hidden shadow-[0_4px_24px_rgba(0,0,0,0.2)] mx-auto flex flex-col">
      {/* Notch */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-32 h-6 bg-[#1a1a1a] rounded-b-2xl z-20" />

      {/* iOS WhatsApp Header */}
      <div className="bg-[#162032] px-2 pt-12 pb-2 flex items-center justify-between z-10 relative shadow-sm border-b border-black/5">
        <div className="flex items-center gap-1">
          <ChevronLeft className="text-[#00D2FF] w-6 h-6" />
          <div className="w-9 h-9 flex-shrink-0 bg-[#0C1421] rounded-full flex items-center justify-center border border-white/[0.03]">
            <StellarLogo className="w-5 h-5 text-white" />
          </div>
          <div className="flex flex-col ml-1">
            <div className="flex items-center gap-1">
              <span className="text-[#e9edef] font-semibold text-base leading-tight">TalkToStellar</span>
              <BadgeCheck className="text-[#00D2FF] w-4 h-4" />
            </div>
          </div>
        </div>
        <div className="flex items-center gap-4 pr-2">
          <Video className="text-[#00D2FF] w-6 h-6" />
          <Phone className="text-[#00D2FF] w-5 h-5" />
        </div>
      </div>

      {/* Chat Area */}
      <div 
        ref={chatRef}
        className="flex-1 p-3 flex flex-col gap-3 overflow-hidden pb-20" 
        style={{ backgroundImage: 'url("https://www.transparenttextures.com/patterns/cubes.png")', opacity: 0.95 }}
      >
        {/* Date Badge */}
        <div className="flex justify-center my-2">
          <span className="bg-[#162032] text-[#9BA4B5] text-[11px] px-3 py-1 rounded-lg shadow-sm border border-white/[0.03]">
            {L("Hoje", "Today")}
          </span>
        </div>

        {/* Step 1: Bot Introduction */}
        <AnimatePresence>
          {step >= 1 && (
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              className="self-start bg-[#162032] text-[#e9edef] px-3 py-2 rounded-2xl rounded-bl-sm max-w-[85%] shadow-sm relative flex flex-col"
            >
              <p className="text-[15px] leading-snug">
                {L("Oi. Eu sou o ", "Hi. I am ")}
                <strong className="text-[#00D2FF]">TalkToStellar</strong>
                {L(". Peça saldo, PIX, conversão ou envio para um contato. Se precisar entrar, eu gero um link seguro.", ". Ask for balance, PIX, conversion, or a payment to a contact. If you need to sign in, I create a secure link.")}
              </p>
              <div className="text-right mt-1">
                <span className="text-[10px] text-[#9BA4B5]">14:40</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Step 2: User Message */}
        <AnimatePresence>
          {step >= 2 && (
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              className="self-end bg-[#00D87A] text-[#e9edef] px-3 py-2 rounded-2xl rounded-br-sm max-w-[85%] shadow-sm flex flex-col relative"
            >
              <p className="text-[15px] leading-snug">
                {L("Quero mandar R$ 10 para Ana via PIX.", "I want to send R$10 to Ana with PIX.")}
              </p>
              <div className="flex items-center gap-1 self-end mt-1">
                <span className="text-[10px] text-[#9BA4B5]">14:41</span>
                <CheckCheck className="text-[#4CA1EF] w-3.5 h-3.5" />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Step 3: Bot Confirmation */}
        <AnimatePresence>
          {step >= 3 && (
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              className="self-start bg-[#162032] text-[#e9edef] px-3 py-2 rounded-2xl rounded-bl-sm max-w-[85%] shadow-sm relative flex flex-col"
            >
              <p className="text-[15px] leading-snug">
                {L("Perfeito. Preparei o fluxo para ", "Done. I prepared the flow for ")}
                <strong className="text-[#00D2FF]">Ana</strong>
                . <br/>
                {L("Valor: ", "Amount: ")}
                <strong className="text-[#00D2FF]">R$ 10,00</strong>
                . <br/><br/>
                {L("Vou abrir um link para revisar e confirmar com PIN.", "I will open a link to review and confirm with PIN.")}
              </p>
              <div className="mt-2 pt-2 border-t border-white/[0.03] flex gap-2">
                <a href="/chat" className="flex-1 bg-[#00D2FF] text-slate-950 text-sm py-1.5 rounded-lg font-medium hover:bg-cyan-300 transition-colors text-center shadow-[0_0_10px_rgba(34,211,238,0.2)]">
                  {L("Abrir chat", "Open chat")}
                </a>
              </div>
              <div className="text-right mt-1">
                <span className="text-[10px] text-[#9BA4B5]">14:41</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

      </div>

      {/* iOS WhatsApp Input Area */}
      <div className="absolute bottom-0 left-0 right-0 bg-[#162032] px-2 pt-2 pb-6 flex items-end gap-2 z-10 border-t border-white/[0.03]">
        <Plus className="text-[#00D2FF] w-7 h-7 mb-1.5 flex-shrink-0" />
        <div className="flex-1 bg-[#162032] rounded-2xl min-h-[36px] flex items-center px-3 py-1.5 border border-white/[0.03] shadow-sm">
          <span className="text-[#9BA4B5] text-[15px] flex-1">{L("Mensagem", "Message")}</span>
          <Smile className="text-[#9BA4B5] w-5 h-5" />
        </div>
        <Camera className="text-[#00D2FF] w-6 h-6 mb-1.5 flex-shrink-0" />
        <Mic className="text-[#00D2FF] w-6 h-6 mb-1.5 flex-shrink-0" />
        {/* Home indicator */}
        <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 w-1/3 h-1 bg-white/30 rounded-full" />
      </div>
    </div>
  );
}
