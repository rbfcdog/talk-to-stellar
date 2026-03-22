"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"
import { ArrowRight } from "lucide-react"
import { useEffect, useState } from "react"

export function HeroSection() {
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

  const scrollToSection = (sectionId: string) => {
    const element = document.getElementById(sectionId)
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "start" })
    }
  }

  return (
    <section className="relative min-h-screen flex items-center justify-center bg-white overflow-hidden">
      <div className="absolute inset-0 overflow-hidden">
        <div
          className="absolute top-1/4 left-1/4 w-96 h-96 bg-gray-100 rounded-full blur-3xl opacity-30 animate-pulse"
          style={{
            transform: `translate(${mousePosition.x}px, ${mousePosition.y}px)`,
            transition: "transform 0.3s ease-out",
          }}
        />
        <div
          className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-gray-50 rounded-full blur-3xl opacity-40 animate-pulse"
          style={{
            transform: `translate(${-mousePosition.x}px, ${-mousePosition.y}px)`,
            transition: "transform 0.3s ease-out",
            animationDelay: "1s",
          }}
        />
      </div>

      <div className="container mx-auto px-4 relative z-10">
        <div className="mx-auto max-w-4xl text-center">
          <h1 className="mb-8 text-balance text-6xl font-light tracking-tight lg:text-8xl text-gray-900">
            Talk To <span className="font-medium text-gray-700">Stellar</span>
          </h1>

          <p className="mb-12 text-balance text-xl lg:text-2xl font-light leading-relaxed max-w-3xl mx-auto text-gray-600">
            The conversational layer for Stellar payments. Send money, manage contacts, and use blockchain with natural language.
          </p>

          <div className="mb-16 flex flex-wrap justify-center gap-6">
            {[
              { text: "3-5s settlement" },
              { text: "Low fees" },
              { text: "Chat-first UX" },
            ].map((feature, index) => (
              <div
                key={index}
                className="px-6 py-3 rounded-full bg-gray-50 border border-gray-200 shadow-sm hover:shadow-md hover:scale-105 transition-all duration-300"
              >
                <span className="font-medium text-gray-700">{feature.text}</span>
              </div>
            ))}
          </div>

          <div className="flex flex-col gap-6 sm:flex-row sm:justify-center">
            <Link href="/chat">
              <Button
                size="lg"
                className="group bg-gray-900 hover:bg-gray-800 text-white text-lg px-8 py-4 rounded-full transition-all duration-500 shadow-lg hover:shadow-xl hover:scale-105 active:scale-95"
              >
                <span className="flex items-center gap-2">
                  Open Chat
                  <ArrowRight className="h-5 w-5 group-hover:translate-x-1 transition-transform duration-300" />
                </span>
              </Button>
            </Link>

            <Button
              size="lg"
              variant="outline"
              onClick={() => scrollToSection("how-it-works")}
              className="text-lg px-8 py-4 rounded-full border-2 border-gray-300 hover:border-gray-500 transition-all duration-500 bg-white text-gray-700 hover:text-gray-900 hover:bg-gray-50 shadow-sm hover:shadow-md hover:scale-105 active:scale-95"
            >
              See Details
            </Button>
          </div>
        </div>
      </div>
    </section>
  )
}
