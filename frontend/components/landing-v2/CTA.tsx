import React from 'react';
import { motion } from 'framer-motion';
import ChannelButtons from './ChannelButtons';

export default function CTA() {
  return (
    <section className="py-20 md:py-32 w-full flex flex-col items-center text-center relative px-4 sm:px-0">
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#00D2FF]/5 to-transparent -z-10" />
      
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        whileInView={{ opacity: 1, scale: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.6 }}
        className="max-w-4xl flex flex-col items-center w-full bg-white/5 border border-white/[0.03] rounded-2xl p-10 md:p-16 relative overflow-hidden"
      >
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[300px] bg-gradient-to-b from-[#4CA1EF]/20 to-transparent blur-[80px] rounded-full pointer-events-none" />
        
        <h2 className="text-3xl md:text-5xl lg:text-6xl font-bold mb-6 relative z-10">
          Stop losing money <br className="block md:hidden" /><span className="text-gradient">to excessive fees.</span>
        </h2>
        <p className="text-lg md:text-xl text-gray-300 mb-10 max-w-2xl relative z-10 leading-relaxed">
          Make your first operation now. Pay with PIX and receive digital dollars (USDC), without bureaucracy, directly in your favorite app.
        </p>
        
        <ChannelButtons className="w-full max-w-4xl mx-auto relative z-10 pt-2" />
      </motion.div>
    </section>
  );
}
