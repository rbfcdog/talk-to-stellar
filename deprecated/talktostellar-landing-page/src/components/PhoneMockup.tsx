import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence, useInView } from 'motion/react';
import { ChevronLeft, Video, Phone, Plus, Camera, Mic, Smile, BadgeCheck, CheckCheck } from 'lucide-react';
import { StellarLogo } from './StellarLogo';

export default function PhoneMockup() {
  const [step, setStep] = useState(0);
  const chatRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const isInView = useInView(containerRef, { once: true, margin: "-100px" });

  useEffect(() => {
    if (!isInView) return;

    const timer1 = setTimeout(() => setStep(1), 1000); // Bot: Olá! Sou o TalkToStellar...
    const timer2 = setTimeout(() => setStep(2), 3500); // User: Que legal! Envia 50 USDC...
    const timer3 = setTimeout(() => setStep(3), 5500); // Bot: É pra já! Encontrei a melhor rota...

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
          <span className="bg-[#162032] text-[#9BA4B5] text-[11px] px-3 py-1 rounded-lg shadow-sm border border-white/[0.03]">Hoje</span>
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
                Olá! 👋 Sou o <strong className="text-[#00D2FF]">TalkToStellar</strong>. Me dê um comando simples e eu converto seus Reais em Dólar e envio para qualquer lugar do mundo com a melhor taxa. O que você quer fazer hoje?
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
              <p className="text-[15px] leading-snug">Vou precisar enviar 50 Dólares pra Maria. Pode fazer a conversão dos meus Reais?</p>
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
                É pra já! 🚀 Peguei a melhor taxa de agora. <br/>
                Para enviar 50 USD, você pagará exatamente <strong className="text-[#00D2FF]">R$ 256,20</strong> via Pix. Não cobraremos taxas ocultas. <br/><br/>
                Enviando link de confirmação...
              </p>
              <div className="mt-2 pt-2 border-t border-white/[0.03] flex gap-2">
                <a href="#simulator" className="flex-1 bg-[#00D2FF] text-slate-950 text-sm py-1.5 rounded-lg font-medium hover:bg-cyan-300 transition-colors text-center shadow-[0_0_10px_rgba(34,211,238,0.2)]">Pagar R$ 256,20</a>
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
          <span className="text-[#9BA4B5] text-[15px] flex-1">Mensagem</span>
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
