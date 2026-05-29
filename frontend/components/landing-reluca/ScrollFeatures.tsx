"use client"

import { motion } from "framer-motion"
import { MessageCircle, UserPlus, Send, Zap, FileText, Download, CheckCheck } from "lucide-react"
import { StellarLogo } from "./StellarLogo"
import { useLanguage } from "@/lib/i18n"
import { t } from "./content"

const PhaseIconAnim = ({ Icon, color, delay }: { Icon: any; color: string; delay: number }) => (
  <div className="relative w-12 h-12 flex items-center justify-center rounded-xl bg-[#080808] border border-white/[0.05] shadow-[0_4px_24px_rgba(0,0,0,0.2)] shrink-0 overflow-hidden">
    <div className="absolute inset-0 opacity-20" style={{ backgroundColor: color }} />
    <motion.div animate={{ scale: [1, 1.1, 1], opacity: [0.8, 1, 0.8] }} transition={{ duration: 2, repeat: Infinity, ease: "easeInOut", delay }}>
      <Icon className="w-5 h-5 relative z-10" style={{ color }} />
    </motion.div>
  </div>
)

const stepMessages: Record<string, { type: "bot" | "user"; text: any; time: string }[][]> = {
  "pt-BR": [
    [
      { type: "user", text: "Olá!", time: "09:40" },
      { type: "bot", text: 'Olá! Bem-vindo ao TalkToStellar. Para começar, por favor, clique no link abaixo para criar sua conta rapidamente.', time: "09:40" },
      { type: "bot", text: <a href="/chat" className="text-[#E59E25] hover:underline font-medium">Criar minha conta 🚀</a>, time: "09:40" },
      { type: "user", text: "Pronto! Conta criada.", time: "09:42" },
    ],
    [
      { type: "user", text: "Quero cadastrar minha conta Nomad.", time: "09:45" },
      { type: "bot", text: "Certo! Por favor, me informe o número da conta e o routing number (ABA) da sua Nomad.", time: "09:45" },
      { type: "user", text: "Conta 12345678, Routing 122105155", time: "09:46" },
      { type: "bot", text: 'Contato salvo com sucesso como "Minha Conta Nomad". ✅', time: "09:46" },
    ],
    [
      { type: "user", text: "Converter R$5.000 para dólar e enviar para minha conta Nomad", time: "09:50" },
      { type: "bot", text: 'Você está enviando R$5.000,00 para "Minha Conta Nomad".\n\nCotação comercial atual: 1 USD = R$ 5,02.\nVocê receberá: 994.50 USD.', time: "09:50" },
      { type: "bot", text: "Para prosseguir, escaneie o código abaixo ou copie o Pix Copia e Cola:", time: "09:50" },
      { type: "bot", text: <div className="bg-[#080808] text-[#9BA4B5] p-2.5 rounded-lg border border-white/[0.05] break-all text-[11px] font-mono text-center shadow-inner">00020101021126580014br.gov.bcb.pix.gui...</div>, time: "09:50" },
    ],
    [
      { type: "bot", text: "Pix de R$5.000,00 recebido com sucesso! 💸", time: "09:52" },
      { type: "bot", text: (
        <div className="flex flex-col gap-2">
          <span>Transação concluída! Aqui está o seu comprovante:</span>
          <div className="bg-[#080808] border border-white/[0.05] rounded-xl p-3 flex items-center gap-3 w-[200px] mt-1 relative overflow-hidden group hover:bg-[#121212] transition-colors cursor-pointer shadow-sm">
            <div className="w-10 h-10 bg-red-500/10 rounded-lg flex items-center justify-center shrink-0"><FileText className="w-5 h-5 text-red-500" /></div>
            <div className="flex flex-col min-w-0 flex-1">
              <span className="text-[#e9edef] text-sm font-medium truncate">Comprovante</span>
              <span className="text-[#9BA4B5] text-[10px] uppercase tracking-wider">PDF • 120 KB</span>
            </div>
            <Download className="w-4 h-4 text-[#9BA4B5] absolute right-3 opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
        </div>
      ), time: "09:52" },
    ],
  ],
  en: [
    [
      { type: "user", text: "Hello!", time: "09:40" },
      { type: "bot", text: "Hello! Welcome to TalkToStellar. To get started, please click the link below to create your account quickly.", time: "09:40" },
      { type: "bot", text: <a href="/chat" className="text-[#E59E25] hover:underline font-medium">Create my account 🚀</a>, time: "09:40" },
      { type: "user", text: "Done! Account created.", time: "09:42" },
    ],
    [
      { type: "user", text: "I want to register my Nomad account.", time: "09:45" },
      { type: "bot", text: "Sure! Please provide your account number and routing number (ABA) for your Nomad.", time: "09:45" },
      { type: "user", text: "Account 12345678, Routing 122105155", time: "09:46" },
      { type: "bot", text: "Contact saved successfully as 'My Nomad Account'. ✅", time: "09:46" },
    ],
    [
      { type: "user", text: "Convert R$5,000 to dollars and send to my Nomad account", time: "09:50" },
      { type: "bot", text: "You are sending R$5,000.00 to 'My Nomad Account'.\n\nCurrent exchange rate: 1 USD = R$ 5.02.\nYou will receive: 994.50 USD.", time: "09:50" },
      { type: "bot", text: "To proceed, scan the code below or copy the Pix Copy and Paste:", time: "09:50" },
      { type: "bot", text: <div className="bg-[#080808] text-[#9BA4B5] p-2.5 rounded-lg border border-white/[0.05] break-all text-[11px] font-mono text-center shadow-inner">00020101021126580014br.gov.bcb.pix.gui...</div>, time: "09:50" },
    ],
    [
      { type: "bot", text: "Pix of R$5,000.00 received successfully! 💸", time: "09:52" },
      { type: "bot", text: (
        <div className="flex flex-col gap-2">
          <span>Transaction complete! Here is your receipt:</span>
          <div className="bg-[#080808] border border-white/[0.05] rounded-xl p-3 flex items-center gap-3 w-[200px] mt-1 relative overflow-hidden group hover:bg-[#121212] transition-colors cursor-pointer shadow-sm">
            <div className="w-10 h-10 bg-red-500/10 rounded-lg flex items-center justify-center shrink-0"><FileText className="w-5 h-5 text-red-500" /></div>
            <div className="flex flex-col min-w-0 flex-1">
              <span className="text-[#e9edef] text-sm font-medium truncate">Receipt</span>
              <span className="text-[#9BA4B5] text-[10px] uppercase tracking-wider">PDF • 120 KB</span>
            </div>
            <Download className="w-4 h-4 text-[#9BA4B5] absolute right-3 opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
        </div>
      ), time: "09:52" },
    ],
  ],
}

export default function ScrollFeatures() {
  const { language } = useLanguage()
  const steps = t("scroll", language, "steps") as { title: string; description: string }[]
  const msgs = stepMessages[language === "pt-BR" ? "pt-BR" : "en"]

  return (
    <section id="how-it-works" className="relative w-full py-16 md:py-24 scroll-mt-24">
      <div className="max-w-7xl mx-auto flex flex-col items-center gap-16 px-4 sm:px-6 lg:px-8">
        <div className="flex items-center pb-8 text-center">
          <motion.h2 initial={{ opacity: 0, y: 40 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-100px" }} transition={{ duration: 0.8 }}
            className="text-4xl md:text-5xl lg:text-[72px] font-extrabold leading-[1.1] tracking-tight text-white w-full"
          >
            {t("scroll", language, "title1")}<br className="hidden md:block" />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#E59E25] to-[#D48C1C]">{t("scroll", language, "title2")}</span>
          </motion.h2>
        </div>
        <div className="w-full flex flex-col gap-8 md:gap-16">
          {steps.map((step, index) => (
            <motion.div key={index} initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-50px" }} transition={{ duration: 0.6 }}
              className={`flex flex-col ${index % 2 === 0 ? "md:flex-row" : "md:flex-row-reverse"} items-center gap-8 lg:gap-16 group`}
            >
              <div className="flex-1 w-full space-y-6">
                <div className="flex items-center gap-4">
                  <PhaseIconAnim Icon={[MessageCircle, UserPlus, Send, Zap][index]} color={["#00D2FF", "#4CA1EF", "#00D2FF", "#4CA1EF"][index]} delay={index * 0.5} />
                  <h3 className="text-2xl md:text-3xl font-bold tracking-tight text-white">{step.title}</h3>
                </div>
                <p className="text-lg text-[#9BA4B5] leading-relaxed font-light">{step.description}</p>
              </div>
              <div className="flex-1 w-full flex justify-center">
                <div className="bg-[#121212] w-full max-w-sm rounded-[2rem] border-[6px] border-[#1a1a1a] shadow-[0_4px_32px_rgba(0,0,0,0.3)] overflow-hidden transform group-hover:scale-[1.02] transition-transform duration-500 ease-out">
                  <div className="bg-[#121212] px-4 py-3 flex items-center gap-3 border-b border-white/[0.05]">
                    <div className="w-10 h-10 rounded-full shrink-0 bg-[#080808] flex items-center justify-center border border-white/[0.05]"><StellarLogo className="w-6 h-6 text-white" /></div>
                    <div className="flex-1"><div className="text-[#e9edef] font-semibold text-sm">TalkToStellar</div><div className="text-[#E59E25] text-[11px] mt-0.5 tracking-wider uppercase">Bot Online</div></div>
                  </div>
                  <div className="p-4 bg-[#080808] flex flex-col gap-3 min-h-[280px] max-h-[320px] overflow-y-auto relative" style={{ backgroundImage: 'url("https://www.transparenttextures.com/patterns/cubes.png")', opacity: 0.95 }}>
                    {msgs[index]?.map((msg, i) => (
                      <motion.div key={i} initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ delay: 0.2 + i * 0.15 }}
                        className={`px-3 py-2.5 rounded-xl text-[13px] shadow-[0_2px_10px_rgba(0,0,0,0.1)] max-w-[90%] leading-relaxed relative z-10 border ${
                          msg.type === "bot" ? "self-start bg-[#121212] text-[#e9edef] rounded-tl-sm border-white/[0.05]" : "self-end bg-[#005c4b] text-[#e9edef] rounded-tr-sm border-[#005c4b]"
                        }`}
                      >
                        <span className="whitespace-pre-wrap">{msg.text}</span>
                        <div className={`flex items-center justify-end gap-1 mt-1 ${msg.type === "bot" ? "opacity-60" : "opacity-80"}`}>
                          <span className={`text-[9px] ${msg.type === "bot" ? "text-[#9BA4B5]" : "text-white/70"}`}>{msg.time}</span>
                          {msg.type === "user" && <CheckCheck className="w-3 h-3 text-[#D48C1C]" />}
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
