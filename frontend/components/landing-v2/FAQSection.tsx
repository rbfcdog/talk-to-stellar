import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Minus } from 'lucide-react';

const faqs = [
  {
    question: "What is TalkToStellar?",
    answer: "TalkToStellar is an intelligent assistant for WhatsApp and Telegram that lets you convert Brazilian reais (BRL) into digital dollars (USDC) and send money worldwide by sending messages."
  },
  {
    question: "How does BRL to USDC conversion work?",
    answer: "You tell us how much you want to convert and we find a low-cost route. You pay with PIX and the corresponding USDC is credited to your account."
  },
  {
    question: "Is TalkToStellar secure?",
    answer: "Yes. Every operation uses secure confirmation, clear receipts, and visible amounts before you approve."
  },
  {
    question: "What fees do you charge?",
    answer: "We avoid hidden spread and excessive traditional-bank fees. TalkToStellar shows the final amount before you confirm."
  },
  {
    question: "Do I need to download a new app?",
    answer: "No. The experience runs inside messaging apps you already use, such as WhatsApp or Telegram. Start a conversation with the bot to begin."
  }
];

export default function FAQSection() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const toggleFaq = (index: number) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  return (
    <section id="faq" className="py-20 md:py-32 w-full max-w-4xl mx-auto px-4 sm:px-0 scroll-mt-24">
      <div className="text-center mb-16">
        <h2 className="text-3xl md:text-5xl font-bold text-white mb-4">
          Frequently Asked Questions
        </h2>
      </div>

      <div className="flex flex-col border-t border-white/[0.03]">
        {faqs.map((faq, index) => (
          <div key={index} className="border-b border-white/[0.03]">
            <button
              onClick={() => toggleFaq(index)}
              className="w-full flex items-center justify-between py-6 text-left focus:outline-none group"
            >
              <span className="text-xl md:text-2xl font-medium text-white group-hover:text-[#00D2FF] transition-colors">
                {faq.question}
              </span>
              <div className="shrink-0 ml-4 text-white">
                {openIndex === index ? (
                  <Minus className="w-6 h-6 md:w-8 md:h-8" />
                ) : (
                  <Plus className="w-6 h-6 md:w-8 md:h-8" />
                )}
              </div>
            </button>
            <AnimatePresence>
              {openIndex === index && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.3, ease: "easeInOut" }}
                  className="overflow-hidden"
                >
                  <p className="pb-6 text-[#9BA4B5] text-lg md:text-xl leading-relaxed">
                    {faq.answer}
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ))}
      </div>
    </section>
  );
}
