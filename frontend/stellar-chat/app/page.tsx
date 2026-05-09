import { Suspense } from "react"
"use client"

import { useEffect, useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { MessageCircle } from "lucide-react"

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
    <main className="min-h-screen bg-gradient-to-br from-[#667eea] via-[#764ba2] to-[#f093fb] overflow-hidden">
      {/* Animated background elements */}
      <div className="absolute inset-0 overflow-hidden">
        <div
          className="absolute top-1/4 left-1/4 w-96 h-96 bg-white/10 rounded-full blur-3xl opacity-30 animate-pulse"
          style={{
            transform: `translate(${mousePosition.x}px, ${mousePosition.y}px)`,
            transition: "transform 0.3s ease-out",
          }}
        />
        <div
          className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-white/10 rounded-full blur-3xl opacity-20 animate-pulse"
          style={{
            transform: `translate(${-mousePosition.x}px, ${-mousePosition.y}px)`,
            transition: "transform 0.3s ease-out",
            animationDelay: "1s",
          }}
        />
      </div>

      {/* Hero Section */}
      <div className="relative z-10 min-h-screen flex flex-col items-center justify-center px-4">
        <div className="max-w-4xl mx-auto text-center">
          {/* Logo and Title */}
          <div className="mb-8 flex flex-col items-center">
            <div className="mb-6">
              <Image
                src="/talktostellar.png"
                alt="TalkToStellar"
                width={120}
                height={120}
                className="mx-auto drop-shadow-lg"
              />
            </div>
            <h1 className="text-5xl md:text-6xl font-bold text-white mb-4 drop-shadow-lg">
              TalkToStellar
            </h1>
            <p className="text-xl md:text-2xl text-white/90 font-light mb-8">
              Your AI-Powered Stellar Wallet Assistant
            </p>
          </div>

          {/* Description */}
          <p className="text-lg text-white/80 mb-12 max-w-2xl mx-auto leading-relaxed">
            Send money, manage contacts, and use blockchain with natural language. 
            Connect through WhatsApp, Telegram, or our web interface.
          </p>

          {/* CTA Buttons */}
          <div className="flex flex-col sm:flex-row gap-6 justify-center mb-12">
            <Link href="/chat" className="group">
              <button className="bg-white text-[#667eea] px-8 py-4 rounded-full font-semibold text-lg hover:bg-white/95 transition-all duration-300 shadow-2xl hover:shadow-3xl hover:scale-105">
                <div className="flex items-center gap-2">
                  <span>Open Web Chat</span>
                  <MessageCircle className="h-5 w-5" />
                </div>
              </button>
            </Link>

            <a 
              href="https://wa.me/+5511999999999" 
              target="_blank" 
              rel="noopener noreferrer"
              className="group"
            >
              <button className="bg-[#25D366] text-white px-8 py-4 rounded-full font-semibold text-lg hover:bg-[#20BA5A] transition-all duration-300 shadow-2xl hover:shadow-3xl hover:scale-105">
                <div className="flex items-center gap-2">
                  <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.272-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.67-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.076 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421-7.403h-.004a9.87 9.87 0 00-9.746 9.798c0 2.737.732 5.363 2.122 7.619L2.884 22l8.129-2.136a9.84 9.84 0 004.708 1.198h.004c5.431 0 9.842-4.411 9.842-9.843 0-2.629-.998-5.095-2.813-6.978A9.82 9.82 0 0011.051 6.979z" />
                  </svg>
                  <span>Chat on WhatsApp</span>
                </div>
              </button>
            </a>

            <a 
              href="https://t.me/talk_to_stellar_bot" 
              target="_blank" 
              rel="noopener noreferrer"
              className="group"
            >
              <button className="bg-[#0088cc] text-white px-8 py-4 rounded-full font-semibold text-lg hover:bg-[#0077b5] transition-all duration-300 shadow-2xl hover:shadow-3xl hover:scale-105">
                <div className="flex items-center gap-2">
                  <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.894 8.221l-1.97 9.28c-.145.658-.537.82-1.084.508l-3-2.21-1.446 1.394c-.16.16-.295.295-.605.295-.2 0-.33-.09-.44-.31l-.653-2.14-2.771-.883c-.6-.19-.588-.582.13-.873l10.859-4.185c.5-.29.966.063.79.953z" />
                  </svg>
                  <span>Chat on Telegram</span>
                </div>
              </button>
            </a>
          </div>

          {/* Features Grid */}
          <div className="grid md:grid-cols-3 gap-8 mt-20">
            <div className="bg-white/10 backdrop-blur-md rounded-2xl p-8 border border-white/20 hover:border-white/40 transition-all">
              <div className="text-4xl mb-4">💬</div>
              <h3 className="text-xl font-semibold text-white mb-2">Natural Language</h3>
              <p className="text-white/80">Chat naturally to send money and manage your wallet</p>
            </div>

            <div className="bg-white/10 backdrop-blur-md rounded-2xl p-8 border border-white/20 hover:border-white/40 transition-all">
              <div className="text-4xl mb-4">🔐</div>
              <h3 className="text-xl font-semibold text-white mb-2">Secure & Private</h3>
              <p className="text-white/80">End-to-end encryption with PIN protection</p>
            </div>

            <div className="bg-white/10 backdrop-blur-md rounded-2xl p-8 border border-white/20 hover:border-white/40 transition-all">
              <div className="text-4xl mb-4">⭐</div>
              <h3 className="text-xl font-semibold text-white mb-2">Multi-Platform</h3>
              <p className="text-white/80">Available on Telegram, WhatsApp, and Web</p>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="relative z-10 border-t border-white/20 backdrop-blur-md">
        <div className="max-w-6xl mx-auto px-4 py-8 text-center">
          <p className="text-white/70 text-sm">
            © 2026 TalkToStellar. Built on Stellar network. All rights reserved.
          </p>
        </div>
      </div>
    </main>
  )
}
