"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
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
        <h1 className="text-2xl font-semibold text-white">{L("Comprovante não encontrado", "Receipt not found")}</h1>
        <p className="mt-3 text-sm leading-6 text-slate-300">
          {L("Este link pode ter expirado. Abra o comprovante pelo histórico ou peça um novo no chat.", "This link may have expired. Open the receipt from history or ask for a new one in chat.")}
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

export default function ReceiptByCodePage() {
  const { language } = useLanguage()
  const L = (pt: string, en: string) => language === "pt-BR" ? pt : en
  const params = useParams<{ code: string }>()
  const code = String(params?.code || "").trim()
  const [imageUrl, setImageUrl] = useState("")
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    async function loadImage() {
      if (!code) {
        setLoading(false)
        return
      }
      try {
        let response = await fetch(`/api/external/receipts/viewer/${encodeURIComponent(code)}`, { cache: "no-store" })
        let payload = await response.json().catch(() => ({}))
        let url = String(payload?.imageDataUrl || payload?.url || "").trim()
        if (!response.ok || !/^data:image\//i.test(url)) {
          response = await fetch(`/api/external/short-links/${encodeURIComponent(code)}`, { cache: "no-store" })
          payload = await response.json().catch(() => ({}))
          url = String(payload?.url || "").trim()
        }
        if (active && response.ok && /^data:image\//i.test(url)) {
          setImageUrl(url)
        }
      } catch {}
      if (active) setLoading(false)
    }
    loadImage()
    return () => {
      active = false
    }
  }, [code])

  const downloadName = useMemo(() => inferFileName(imageUrl), [imageUrl])

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#07111f] px-4 text-slate-100">
        <p className="text-sm text-slate-300">{L("Carregando comprovante...", "Loading receipt...")}</p>
      </main>
    )
  }

  if (!imageUrl) return <ReceiptFallback />

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
            title={L("Confirme o comprovante e volte ao histórico", "Confirm the receipt and return to history")}
            body={L(
              "O comprovante mostra a evidência visual. O histórico é o lugar certo para revisar status, data e contraparte.",
              "The receipt shows visual evidence. History is the right place to review status, date, and counterparty.",
            )}
            steps={[
              { title: L("Conferir", "Review"), body: L("Veja se valor e destino fazem sentido.", "Check that amount and destination make sense.") },
              { title: L("Baixar", "Download"), body: L("Salve a imagem para compartilhar.", "Save the image to share.") },
              { title: L("Histórico", "History"), body: L("Abra a lista completa se precisar de suporte.", "Open the full list if support is needed.") },
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
