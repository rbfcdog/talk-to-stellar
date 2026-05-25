'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { ChevronRight, Menu, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Logo } from '@/components/shared/logo'

const NAV_LINKS = [
  { label: 'Produto', href: '#produto' },
  { label: 'Integrações', href: '#canais' },
  { label: 'Documentação', href: '#api' },
  { label: 'FAQ', href: '#faq' },
  { label: 'Empresa', href: '#empresa' },
]

const EASE = 'cubic-bezier(0.16, 1, 0.3, 1)'

export function Navbar() {
  const [expanded, setExpanded] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const rootRef = useRef<HTMLElement>(null)

  // Click-outside to collapse desktop expand
  useEffect(() => {
    if (!expanded) return
    const onPointerDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setExpanded(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setExpanded(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [expanded])

  // Close mobile menu on resize to desktop
  useEffect(() => {
    const onResize = () => {
      if (window.innerWidth >= 768) setMobileOpen(false)
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // Lock body scroll while mobile menu is open
  useEffect(() => {
    if (mobileOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [mobileOpen])

  const closeMobile = useCallback(() => setMobileOpen(false), [])

  return (
    <>
      <header
        ref={rootRef}
        className="fixed left-1/2 top-4 z-50 -translate-x-1/2"
      >
        <div className="flex items-center rounded-full border border-tts-deep bg-tts-deep px-2 py-1.5 text-tts-surface shadow-lg shadow-tts-deep/15 backdrop-blur-sm">
          {/* Logo + wordmark always visible */}
          <a
            href="#top"
            onClick={() => setExpanded(false)}
            className="flex shrink-0 items-center gap-2 px-2"
            aria-label="TalkToStellar — início"
          >
            <Logo size={20} />
            <span className="hidden text-[13px] font-extrabold tracking-[-0.018em] sm:inline">
              TalkToStellar
            </span>
          </a>

          {/* Desktop nav links — expand horizontally via max-width */}
          <div
            className="hidden overflow-hidden md:block"
            style={{
              maxWidth: expanded ? '700px' : '0px',
              transition: expanded
                ? `max-width 700ms ${EASE}`
                : `max-width 400ms ${EASE}`,
            }}
          >
            <div className="flex items-center whitespace-nowrap">
              <span className="mx-2 h-5 w-px shrink-0 bg-white/15" aria-hidden />
              {NAV_LINKS.map((link, i) => (
                <a
                  key={link.href}
                  href={link.href}
                  onClick={() => setExpanded(false)}
                  className="shrink-0 rounded-full px-3 py-1 text-[12px] font-medium text-tts-surface/70 transition-colors hover:bg-white/10 hover:text-tts-surface"
                  style={{
                    opacity: expanded ? 1 : 0,
                    transition: expanded
                      ? `opacity 200ms ${EASE} ${80 + i * 70}ms`
                      : 'opacity 120ms ease-out',
                  }}
                >
                  {link.label}
                </a>
              ))}
            </div>
          </div>

          {/* Desktop expand/collapse chevron */}
          <button
            onClick={() => setExpanded((prev) => !prev)}
            aria-label={expanded ? 'Fechar menu' : 'Abrir menu'}
            aria-expanded={expanded}
            className="ml-1 hidden h-7 w-7 shrink-0 items-center justify-center rounded-full text-tts-surface/70 transition-colors hover:bg-white/10 hover:text-tts-surface md:flex"
          >
            <ChevronRight
              className="h-3.5 w-3.5"
              style={{
                transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)',
                transition: `transform 350ms ${EASE}`,
              }}
            />
          </button>

          {/* Mobile hamburger */}
          <button
            onClick={() => setMobileOpen((prev) => !prev)}
            aria-label={mobileOpen ? 'Fechar menu' : 'Abrir menu'}
            aria-expanded={mobileOpen}
            className="ml-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-tts-surface/70 transition-colors hover:bg-white/10 hover:text-tts-surface md:hidden"
          >
            {mobileOpen ? (
              <X className="h-4 w-4" />
            ) : (
              <Menu className="h-4 w-4" />
            )}
          </button>

          {/* Divider */}
          <span className="mx-1 h-5 w-px shrink-0 bg-white/15" aria-hidden />

          {/* Right-side controls — always visible */}
          <a
            href="/login"
            className="hidden h-7 shrink-0 items-center rounded-full px-3 text-[12px] font-medium text-tts-surface/80 transition-colors hover:bg-white/10 hover:text-tts-surface sm:inline-flex"
          >
            Entrar
          </a>
          <Button
            asChild
            size="sm"
            className="ml-1 h-7 shrink-0 rounded-full bg-tts-gold px-3 text-[12px] text-tts-deep hover:bg-tts-gold-lt"
          >
            <a href="#comecar">Falar com o time</a>
          </Button>
        </div>
      </header>

      {/* Mobile fullscreen menu */}
      <div
        className="fixed inset-0 z-40 md:hidden"
        style={{
          opacity: mobileOpen ? 1 : 0,
          pointerEvents: mobileOpen ? 'auto' : 'none',
          transition: `opacity 0.3s ${EASE}`,
        }}
        aria-hidden={!mobileOpen}
      >
        <div
          className="absolute inset-0 bg-tts-deep/85 backdrop-blur-xl"
          onClick={closeMobile}
        />
        <div className="relative flex h-full flex-col items-center justify-center gap-2 px-8 text-tts-surface">
          {NAV_LINKS.map((link, i) => (
            <a
              key={link.href}
              href={link.href}
              onClick={closeMobile}
              className="w-full rounded-xl py-3 text-center text-lg font-medium text-tts-surface/80 transition-colors hover:bg-white/10 hover:text-tts-surface"
              style={{
                opacity: mobileOpen ? 1 : 0,
                transform: mobileOpen ? 'translateY(0)' : 'translateY(12px)',
                transition: mobileOpen
                  ? `opacity 350ms ${EASE} ${i * 60}ms, transform 350ms ${EASE} ${i * 60}ms`
                  : 'opacity 180ms ease-out, transform 180ms ease-out',
              }}
            >
              {link.label}
            </a>
          ))}
          <div
            className="mt-6 flex flex-col items-center gap-3"
            style={{
              opacity: mobileOpen ? 1 : 0,
              transform: mobileOpen ? 'translateY(0)' : 'translateY(12px)',
              transition: mobileOpen
                ? `opacity 350ms ${EASE} ${NAV_LINKS.length * 60}ms, transform 350ms ${EASE} ${NAV_LINKS.length * 60}ms`
                : 'opacity 180ms ease-out, transform 180ms ease-out',
            }}
          >
            <Button
              asChild
              size="lg"
              className="rounded-full bg-tts-gold px-6 text-tts-deep hover:bg-tts-gold-lt"
            >
              <a href="#comecar" onClick={closeMobile}>
                Falar com o time
              </a>
            </Button>
            <a
              href="/login"
              onClick={closeMobile}
              className="text-sm text-tts-surface/70 underline-offset-4 hover:text-tts-surface hover:underline"
            >
              Entrar
            </a>
          </div>
        </div>
      </div>
    </>
  )
}
