import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Minus } from 'lucide-react';
import { useLanguage } from '@/lib/i18n';

const portugueseFaqs = [
  {
    question: "O que é o TalkToStellar?",
    answer: "É uma conta conversacional para pedir saldo, usar PIX, converter moedas, deixar dinheiro rendendo e acompanhar comprovantes direto pelo WhatsApp, Telegram ou chat web."
  },
  {
    question: "Consigo entrar, render e retirar em um fluxo só?",
    answer: "Sim. Você pode pedir o ciclo completo: colocar dinheiro por PIX, escolher a melhor opção de rendimento disponível e retirar para uma chave PIX informada na hora."
  },
  {
    question: "Preciso baixar um aplicativo novo?",
    answer: "Não. Você pode começar por um canal que já usa. A página final da landing mostra as opções: WhatsApp, Telegram e chat web."
  },
  {
    question: "Como eu confirmo uma operação?",
    answer: "Antes de qualquer pagamento, a tela mostra valor, destino e taxa. A confirmação acontece com PIN e o comprovante fica no histórico."
  },
  {
    question: "As taxas aparecem antes?",
    answer: "Sim. A experiência mostra quanto você paga, quanto chega e qual taxa será cobrada antes da confirmação."
  },
  {
    question: "Isso substitui meu banco internacional?",
    answer: "Não. O foco é ser uma rota simples e eficiente antes da conta de destino, mantendo liberdade para usar o banco ou conta global de sua preferência."
  }
];

const englishFaqs = [
  {
    question: "What is TalkToStellar?",
    answer: "TalkToStellar is a conversational account for checking balance, using PIX, converting currencies, keeping money earning, and tracking receipts through WhatsApp, Telegram, or web chat."
  },
  {
    question: "Can I add, earn, and withdraw in one flow?",
    answer: "Yes. You can ask for the full money cycle: add money with PIX, choose the best available earning option, and withdraw to a PIX key entered at the moment."
  },
  {
    question: "Do I need to download a new app?",
    answer: "No. You can start from a channel you already use. The final CTA shows WhatsApp, Telegram, and web chat options."
  },
  {
    question: "How do I confirm an operation?",
    answer: "Before any payment, the screen shows amount, destination, and fee. You confirm with PIN and the receipt stays in your history."
  },
  {
    question: "Are fees shown before confirmation?",
    answer: "Yes. The experience shows what you pay, what arrives, and which fee is charged before confirmation."
  },
  {
    question: "Does this replace my international bank?",
    answer: "No. The focus is to be a simple, efficient route before the destination account, while keeping your freedom to use the bank or global account you prefer."
  }
];

export default function FAQSection() {
  const { language } = useLanguage();
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const faqs = language === "pt-BR" ? portugueseFaqs : englishFaqs;

  const toggleFaq = (index: number) => {
    setOpenIndex(openIndex === index ? null : index);
  };

  return (
    <section id="faq" className="py-20 md:py-32 w-full max-w-4xl mx-auto px-4 sm:px-0 scroll-mt-24">
      <div className="text-center mb-16">
        <h2 className="text-3xl md:text-5xl font-bold text-white mb-4">
          {language === "pt-BR" ? "Perguntas frequentes" : "Frequently Asked Questions"}
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
