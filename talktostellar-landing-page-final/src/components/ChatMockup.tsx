import React from 'react';
import { motion } from 'motion/react';
import { StellarLogo } from './StellarLogo';
import { CheckCheck, BadgeCheck } from 'lucide-react';

export interface ChatMessage {
  type: 'bot' | 'user';
  text: React.ReactNode;
  time: string;
}

interface ChatMockupProps {
  messages: ChatMessage[];
  className?: string;
}

export default function ChatMockup({ messages, className = '' }: ChatMockupProps) {
  return (
    <div className={`bg-[#080808] rounded-[2rem] border-[6px] border-[#1a1a1a] shadow-[0_8px_32px_rgba(0,0,0,0.3)] overflow-hidden w-full max-w-[320px] mx-auto flex flex-col font-sans ${className}`} style={{ backgroundImage: 'url("https://www.transparenttextures.com/patterns/cubes.png")', opacity: 0.95 }}>
      
      {/* Header */}
      <div className="bg-[#121212] px-4 py-3 flex items-center gap-3 border-b border-white/[0.05] shrink-0 z-10 shadow-sm">
        <div className="w-10 h-10 rounded-full bg-[#080808] flex items-center justify-center p-2 border border-white/[0.05]">
          <StellarLogo className="w-full h-full text-white" />
        </div>
        <div className="flex flex-col">
          <div className="flex items-center gap-1">
            <span className="text-[#e9edef] font-semibold text-[15px] leading-none">TalkToStellar</span>
            <BadgeCheck className="text-[#E59E25] w-4 h-4" />
          </div>
          <div className="text-[#E59E25] text-[11px] mt-1.5 leading-none font-medium">online</div>
        </div>
      </div>

      {/* Body */}
      <div className="p-4 flex flex-col gap-3 min-h-[350px] max-h-[400px] overflow-y-auto w-full relative [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
        <div className="absolute inset-0 bg-gradient-to-b from-[#E59E25]/5 to-transparent pointer-events-none" />

        <div className="flex justify-center my-1 z-10">
          <span className="bg-[#121212] text-[#9BA4B5] text-[10px] px-3 py-1 rounded-lg border border-white/[0.05] shadow-sm uppercase tracking-wider font-semibold">Hoje</span>
        </div>

        {messages.map((msg, idx) => (
          msg.type === 'bot' ? (
            <motion.div 
              key={idx} 
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              whileInView={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ delay: 0.1 * idx, duration: 0.3 }}
              className="self-start bg-[#121212] text-[#e9edef] px-3.5 py-2.5 rounded-2xl rounded-tl-sm text-[14px] shadow-[0_2px_10px_rgba(0,0,0,0.1)] max-w-[88%] leading-relaxed border border-white/[0.05] relative z-10 whitespace-pre-wrap"
            >
              {msg.text}
              <div className="text-[10px] text-[#9BA4B5] text-right mt-1.5 opacity-80">{msg.time}</div>
            </motion.div>
          ) : (
            <motion.div 
              key={idx}
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              whileInView={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ delay: 0.1 * idx, duration: 0.3 }}
              className="self-end bg-[#005c4b] text-[#e9edef] px-3.5 py-2.5 rounded-2xl rounded-tr-sm text-[14px] shadow-[0_2px_10px_rgba(0,0,0,0.1)] max-w-[88%] leading-relaxed border border-[#005c4b] relative z-10 whitespace-pre-wrap"
            >
              {msg.text}
              <div className="flex items-center justify-end gap-1 mt-1.5 opacity-80">
                <span className="text-[10px] text-white/70">{msg.time}</span>
                <CheckCheck className="w-3.5 h-3.5 text-[#D48C1C]" />
              </div>
            </motion.div>
          )
        ))}
      </div>
    </div>
  );
}
