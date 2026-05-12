"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { Download, ExternalLink } from "lucide-react"

function inferFileName(imageUrl: string) {
  if (imageUrl.startsWith("data:image/png")) return "talktostellar-receipt.png"
  if (imageUrl.startsWith("data:image/svg+xml")) return "talktostellar-receipt.svg"
  if (imageUrl.startsWith("data:image/jpeg")) return "talktostellar-receipt.jpg"
  return "talktostellar-receipt"
}

function ReceiptFallback() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#07111f] px-4 text-slate-100">
      <section className="max-w-lg rounded-2xl border border-white/10 bg-white/5 p-6 shadow-2xl backdrop-blur">
        <h1 className="text-2xl font-semibold text-white">Nenhuma imagem encontrada</h1>
        <p className="mt-3 text-sm leading-6 text-slate-300">
          Abra o comprovante pela conversa do chat web. A imagem mais recente fica disponível nessa página.
        </p>
        <Link
          href="/chat"
          className="mt-5 inline-flex items-center gap-2 rounded-lg bg-emerald-400 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-300"
        >
          <ExternalLink className="h-4 w-4" />
          Voltar ao chat
        </Link>
      </section>
    </main>
  )
}

export default function ReceiptPage() {
  const [imageUrl, setImageUrl] = useState("")

  useEffect(() => {
    const queryImage = new URLSearchParams(window.location.search).get("image") || ""
    const storedImage = window.localStorage.getItem("talk-to-stellar.lastReceiptImage") || ""
    const candidate = queryImage || storedImage
    if (candidate) {
      setImageUrl(candidate)
    }
  }, [])

  const downloadName = useMemo(() => inferFileName(imageUrl), [imageUrl])

  if (!imageUrl) {
    return <ReceiptFallback />
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,_#16324f,_#07111f_55%,_#02050b_100%)] px-4 py-8 text-slate-100">
      <div className="mx-auto flex min-h-screen w-full max-w-5xl items-center">
        <section className="w-full overflow-hidden rounded-[2rem] border border-white/10 bg-white/5 p-4 shadow-2xl backdrop-blur md:p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-emerald-200">Recibo</p>
              <h1 className="mt-2 text-3xl font-semibold text-white">Visualizar e baixar comprovante</h1>
            </div>
            <div className="flex flex-wrap gap-3">
              <a
                href={imageUrl}
                download={downloadName}
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-400 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-300"
              >
                <Download className="h-4 w-4" />
                Baixar imagem
              </a>
              <Link
                href="/chat"
                className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
              >
                <ExternalLink className="h-4 w-4" />
                Voltar ao chat
              </Link>
            </div>
          </div>

          <div className="mt-6 overflow-hidden rounded-2xl border border-white/10 bg-slate-950/80 p-3 shadow-xl">
            <img
              src={imageUrl}
              alt="Comprovante TalkToStellar"
              className="h-auto w-full rounded-xl object-contain"
            />
          </div>
        </section>
      </div>
    </main>
  )
}
