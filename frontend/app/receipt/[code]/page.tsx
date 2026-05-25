"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useParams } from "next/navigation"
import { Download, ExternalLink } from "lucide-react"

function inferFileName(imageUrl: string) {
  if (imageUrl.startsWith("data:image/png")) return "talktostellar-receipt.png"
  if (imageUrl.startsWith("data:image/svg+xml")) return "talktostellar-receipt.svg"
  if (imageUrl.startsWith("data:image/jpeg")) return "talktostellar-receipt.jpg"
  return "talktostellar-receipt"
}

function ReceiptFallback() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-tts-bg px-4 text-tts-deep">
      <section className="max-w-lg rounded-2xl border border-tts-border bg-tts-surface p-6 shadow-2xl backdrop-blur">
        <h1 className="text-2xl font-semibold text-tts-surface">Receipt not found</h1>
        <p className="mt-3 text-sm leading-6 text-tts-deep">
          This link may have expired. Open the receipt from the web chat conversation.
        </p>
        <Link
          href="/chat"
          className="mt-5 inline-flex items-center gap-2 rounded-lg bg-tts-confirm px-4 py-3 text-sm font-semibold text-tts-deep transition hover:bg-tts-confirm"
        >
          <ExternalLink className="h-4 w-4" />
          Back to chat
        </Link>
      </section>
    </main>
  )
}

export default function ReceiptByCodePage() {
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
      <main className="flex min-h-screen items-center justify-center bg-tts-bg px-4 text-tts-deep">
        <p className="text-sm text-tts-deep">Loading receipt...</p>
      </main>
    )
  }

  if (!imageUrl) return <ReceiptFallback />

  return (
    <main className="min-h-screen bg-tts-bg px-4 py-8 text-tts-deep">
      <div className="mx-auto flex min-h-screen w-full max-w-5xl items-center">
        <section className="w-full overflow-hidden rounded-[2rem] border border-tts-border bg-tts-surface p-4 shadow-2xl backdrop-blur md:p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.24em] text-tts-confirm">Receipt</p>
              <h1 className="mt-2 text-3xl font-semibold text-tts-surface">View and download receipt</h1>
            </div>
            <div className="flex flex-wrap gap-3">
              <a
                href={imageUrl}
                download={downloadName}
                className="inline-flex items-center gap-2 rounded-lg bg-tts-confirm px-4 py-3 text-sm font-semibold text-tts-deep transition hover:bg-tts-confirm"
              >
                <Download className="h-4 w-4" />
                Download image
              </a>
              <Link
                href="/chat"
                className="inline-flex items-center gap-2 rounded-lg border border-tts-border bg-tts-surface px-4 py-3 text-sm font-semibold text-tts-surface transition hover:bg-tts-surface"
              >
                <ExternalLink className="h-4 w-4" />
                Back to chat
              </Link>
            </div>
          </div>

          <div className="mt-6 overflow-hidden rounded-2xl border border-tts-border bg-tts-deep/40 p-3 shadow-xl">
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
