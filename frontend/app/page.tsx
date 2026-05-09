"use client"

import { useEffect, useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { MessageCircle, Send } from "lucide-react"

export default function HomePage() {
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 })

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      setMousePosition({
        x: (e.clientX - window.innerWidth / 2) / 50,
        y: (e.clientY - window.innerHeight / 2) / 50,
      })
    }

    window.addEventListener("mousemove", handleMouseMove)
    return () => window.removeEventListener("mousemove", handleMouseMove)
  }, [])

  return (
    <main className="min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top,_#16324f,_#07111f_55%,_#02050b_100%)] text-slate-100">
      <div className="absolute inset-0 overflow-hidden">
        <div
          className="absolute left-1/4 top-1/4 h-96 w-96 rounded-full bg-cyan-400/10 opacity-30 blur-3xl"
          style={{
            transform: `translate(${mousePosition.x}px, ${mousePosition.y}px)`,
            transition: "transform 0.3s ease-out",
          }}
        />
        <div
          className="absolute bottom-1/4 right-1/4 h-80 w-80 rounded-full bg-indigo-400/10 opacity-20 blur-3xl"
          style={{
            transform: `translate(${-mousePosition.x}px, ${-mousePosition.y}px)`,
            transition: "transform 0.3s ease-out",
          }}
        />
      </div>

      <div className="relative z-10 mx-auto flex min-h-screen max-w-6xl items-center px-6 py-12">
        <div className="grid w-full gap-8 rounded-[2rem] border border-white/10 bg-white/5 p-6 shadow-2xl backdrop-blur md:grid-cols-[1.1fr_0.9fr] md:p-10">
          <section className="space-y-6">
            <div className="inline-flex rounded-full border border-cyan-400/30 bg-cyan-400/10 px-4 py-1 text-xs font-medium uppercase tracking-[0.3em] text-cyan-200">
              TalkToStellar
            </div>
            <div className="space-y-4">
              <Image
                src="/talktostellar.png"
                alt="TalkToStellar"
                width={84}
                height={84}
                className="drop-shadow-lg"
              />
              <h1 className="max-w-xl text-4xl font-semibold tracking-tight text-white md:text-6xl">
                Sua carteira Stellar com assistente de IA
              </h1>
              <p className="max-w-2xl text-base leading-7 text-slate-300 md:text-lg">
                Envie dinheiro, gerencie contatos e use a blockchain com linguagem natural no Telegram ou no chat web.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <p className="text-sm uppercase tracking-[0.24em] text-slate-400">Linguagem natural</p>
                <p className="mt-2 text-sm text-slate-200">Use mensagens simples para consultar saldo, transferir e organizar contatos.</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <p className="text-sm uppercase tracking-[0.24em] text-slate-400">Segurança primeiro</p>
                <p className="mt-2 text-sm text-slate-200">Recupere o PIN e ative sua conta com etapas simples e seguras.</p>
              </div>
            </div>
          </section>

          <section className="rounded-[1.5rem] border border-white/10 bg-slate-950/70 p-5 shadow-xl md:p-6">
            <div className="space-y-4">
              <Link
                href="/chat"
                className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-cyan-400 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-cyan-300"
              >
                <span>Abrir chat web</span>
                <MessageCircle className="h-5 w-5" />
              </Link>
              <a
                href="https://t.me/TalkToStellarTelegramBot"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-[#229ED9] px-4 py-3 text-sm font-semibold text-white transition hover:bg-[#1e8cc1]"
              >
                <span>@TalkToStellarTelegramBot</span>
                <Send className="h-5 w-5" />
              </a>
              <p className="rounded-2xl border border-cyan-400/20 bg-cyan-400/10 p-4 text-sm text-cyan-50">
                Escolha como começar: conversar no Telegram ou acessar o chat na web.
              </p>
            </div>
          </section>
        </div>
      </div>
      <div className="relative z-10 border-t border-white/10 backdrop-blur-md">
        <div className="mx-auto max-w-6xl px-4 py-8 text-center">
          <p className="text-sm text-slate-400">
            © 2026 TalkToStellar. Construído na rede Stellar. Todos os direitos reservados.
          </p>
        </div>
      </div>
    </main>
  )
}
