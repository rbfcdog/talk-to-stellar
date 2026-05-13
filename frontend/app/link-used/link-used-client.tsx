"use client"

import Link from "next/link"
import { useSearchParams } from "next/navigation"

export default function LinkUsedClient() {
  const searchParams = useSearchParams()
  const rawMessage = String(searchParams.get("message") || "").trim()
  const message = rawMessage || "Este link já foi utilizado."

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_#16324f,_#07111f_55%,_#02050b_100%)] text-slate-100">
      <div className="mx-auto flex min-h-screen w-full max-w-xl items-center px-4 py-12 sm:px-6">
        <section className="w-full rounded-[2rem] border border-rose-300/25 bg-rose-300/10 p-8 shadow-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-rose-200">Link inválido</p>
          <h1 className="mt-3 text-3xl font-semibold text-white">Link já usado</h1>
          <p className="mt-4 text-sm text-slate-200">{message}</p>
          <div className="mt-6 flex gap-2">
            <Link
              href="/login"
              className="rounded-lg bg-cyan-400 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-cyan-300"
            >
              Ir para login
            </Link>
            <Link
              href="/chat"
              className="rounded-lg border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10"
            >
              Ir para chat
            </Link>
          </div>
        </section>
      </div>
    </main>
  )
}

