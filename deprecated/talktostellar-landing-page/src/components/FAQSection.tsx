import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Plus, Minus } from 'lucide-react';

const faqs = [
  {
    question: "O que é o TalkToStellar?",
    answer: "O TalkToStellar é um assistente inteligente no WhatsApp e Telegram que permite converter Reais (BRL) em Dólar Digital (USDC) e enviar para qualquer lugar do mundo, apenas enviando mensagens, usando a rede Stellar por trás."
  },
  {
    question: "Como funciona a conversão de BRL para USDC?",
    answer: "Você diz o quanto quer converter e nós encontramos a rota mais barata no mercado. Você paga via Pix e o valor correspondente em Dólar Digital (USDC) cai na sua carteira na mesma hora."
  },
  {
    question: "É seguro usar o TalkToStellar?",
    answer: "Sim. Todas as transações são registradas publicamente na blockchain da Stellar, garantindo transparência total e segurança criptográfica. Nós não temos acesso aos fundos da sua carteira após a liquidação da transação."
  },
  {
    question: "Quais são as taxas cobradas?",
    answer: "Nós eliminamos spread oculto e taxas abusivas de bancos tradicionais. Usamos a liquidez descentralizada da rede Stellar para garantir taxas a partir de 0.05% por operação, sempre mostrando o valor final antes de você confirmar."
  },
  {
    question: "Preciso baixar algum aplicativo novo?",
    answer: "Não! Todo o processo acontece dentro dos aplicativos de mensagens que você já usa todos os dias, como WhatsApp ou Telegram. Basta iniciar uma conversa com o nosso bot."
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
          Perguntas Frequentes
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
