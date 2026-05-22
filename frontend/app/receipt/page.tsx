"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { Download, ExternalLink } from "lucide-react"
import { useLanguage } from "@/lib/i18n"
import { UserGuidance } from "@/components/user-guidance"

function inferFileName(imageUrl: string) {
  if (imageUrl.startsWith("data:image/png")) return "talktostellar-receipt.png"
  if (imageUrl.startsWith("data:image/svg+xml")) return "talktostellar-receipt.svg"
  if (imageUrl.startsWith("data:image/jpeg")) return "talktostellar-receipt.jpg"
  return "talktostellar-receipt"
}

function ReceiptFallback() {
  const { language } = useLanguage()
  const L = (pt: string, en: string) => language === "pt-BR" ? pt : en
  return (
    <main className="flex min-h-screen items-center justify-center bg-[#07111f] px-4 text-slate-100">
      <section className="max-w-lg rounded-2xl border border-white/10 bg-white/5 p-6 shadow-2xl backdrop-blur">
        <h1 className="text-2xl font-semibold text-white">{L("Comprovante não encontrado", "No image found")}</h1>
        <p className="mt-3 text-sm leading-6 text-slate-300">
          {L("Abra o comprovante pelo chat ou pelo histórico. Se a operação acabou de acontecer, peça “comprovante” no chat.", "Open the receipt from web chat or history. If the operation just happened, ask for “receipt” in chat.")}
        </p>
        <Link
          href="/chat"
          className="mt-5 inline-flex items-center gap-2 rounded-lg bg-emerald-400 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-300"
        >
          <ExternalLink className="h-4 w-4" />
          {L("Voltar ao chat", "Back to chat")}
        </Link>
      </section>
    </main>
  )
}

export default function ReceiptPage() {
  const { language } = useLanguage()
  const L = (pt: string, en: string) => language === "pt-BR" ? pt : en
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
              <p className="text-xs uppercase tracking-[0.24em] text-emerald-200">{L("Comprovante", "Receipt")}</p>
              <h1 className="mt-2 text-3xl font-semibold text-white">{L("Ver e baixar comprovante", "View and download receipt")}</h1>
            </div>
            <div className="flex flex-wrap gap-3">
              <a
                href={imageUrl}
                download={downloadName}
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-400 px-4 py-3 text-sm font-semibold text-slate-950 transition hover:bg-emerald-300"
              >
                <Download className="h-4 w-4" />
                {L("Baixar imagem", "Download image")}
              </a>
              <Link
                href="/chat"
                className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
              >
                <ExternalLink className="h-4 w-4" />
                {L("Voltar ao chat", "Back to chat")}
              </Link>
            </div>
          </div>

          <UserGuidance
            className="mt-6"
            eyebrow={L("Como usar", "How to use")}
            title={L("Guarde ou compartilhe o comprovante", "Save or share the receipt")}
            body={L(
              "Esta página é para o usuário conferir a imagem do comprovante. Para ver status e lista completa, use o histórico.",
              "This page lets the user review the receipt image. For status and the full list, use history.",
            )}
            steps={[
              { title: L("Baixar", "Download"), body: L("Salve a imagem para compartilhar.", "Save the image to share.") },
              { title: L("Histórico", "History"), body: L("Volte ao histórico para status e data.", "Return to history for status and date.") },
              { title: L("Chat", "Chat"), body: L("Peça ajuda ou novo comprovante no chat.", "Ask for help or a new receipt in chat.") },
            ]}
            actions={[
              { label: L("Histórico", "History"), href: "/transactions" },
              { label: L("Chat", "Chat"), href: "/chat" },
            ]}
          />

          <div className="mt-6 overflow-hidden rounded-2xl border border-white/10 bg-slate-950/80 p-3 shadow-xl">
            <img
              src={imageUrl}
              alt="TalkToStellar receipt"
              className="h-auto w-full rounded-xl object-contain"
            />
          </div>
        </section>
      </div>
    </main>
  )
}
