'use client'

import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import * as Dialog from '@radix-ui/react-dialog'
import { ChevronDown, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Logo } from './Logo'

type DesktopMode = 'bar' | 'pill-collapsed' | 'pill-expanded'

const NAV_LINKS = [
  { id: 'produto', label: 'Produto' },
  { id: 'canais', label: 'Integrações' },
  { id: 'api', label: 'Intents' },
  { id: 'comecar', label: 'Começar' },
]

const HERO_SECTION_ID = 'produto'
const EXPANDED_PANEL_ID = 'navbar-expanded'

export function Navbar() {
  const [isDesktop, setIsDesktop] = useState(true)

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)')
    const update = () => setIsDesktop(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])

  return isDesktop ? <DesktopNav /> : <MobileNav />
}

function DesktopNav() {
  const [pastHero, setPastHero] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const rootRef = useRef<HTMLElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const reduceMotion = useReducedMotion()

  useEffect(() => {
    const hero = document.getElementById(HERO_SECTION_ID)
    if (!hero) return

    const observer = new IntersectionObserver(
      ([entry]) => setPastHero(entry.boundingClientRect.bottom < 0),
      { threshold: 0 },
    )
    observer.observe(hero)
    return () => observer.disconnect()
  }, [])

  const inBarMode = !pastHero
  useEffect(() => {
    if (inBarMode && expanded) setExpanded(false)
  }, [inBarMode, expanded])

  useEffect(() => {
    if (!expanded) return

    const onPointerDown = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setExpanded(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setExpanded(false)
        triggerRef.current?.focus()
      }
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [expanded])

  const mode: DesktopMode = inBarMode
    ? 'bar'
    : expanded
      ? 'pill-expanded'
      : 'pill-collapsed'

  const transition = reduceMotion
    ? { duration: 0 }
    : { duration: 0.22, ease: [0.22, 0.61, 0.36, 1] as const }

  const closeExpanded = () => {
    setExpanded(false)
    triggerRef.current?.focus()
  }

  return (
    <header ref={rootRef} className="contents">
      <AnimatePresence initial={false}>
        {mode === 'bar' && (
          <motion.div
            key="bar"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={transition}
            className="sticky top-0 z-50 flex h-14 w-full items-center border-b border-tts-border bg-tts-surface/90 px-4 backdrop-blur-sm md:px-8"
          >
            <BarBody onLinkClick={closeExpanded} />
          </motion.div>
        )}

        {mode === 'pill-collapsed' && (
          <motion.button
            key="pill"
            ref={triggerRef}
            type="button"
            onClick={() => setExpanded(true)}
            aria-expanded={false}
            aria-controls={EXPANDED_PANEL_ID}
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={transition}
            className="fixed left-1/2 top-3 z-50 flex h-11 -translate-x-1/2 items-center gap-2 rounded-full border border-tts-deep bg-tts-deep px-4 text-tts-surface shadow-lg shadow-tts-deep/15 backdrop-blur-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-tts-gold focus-visible:ring-offset-2 focus-visible:ring-offset-tts-bg"
          >
            <Logo size={22} />
            <span className="text-[13px] font-extrabold tracking-[-0.018em]">
              TalkToStellar
            </span>
            <ChevronDown className="h-3.5 w-3.5 text-tts-surface/70" />
          </motion.button>
        )}

        {mode === 'pill-expanded' && (
          <motion.div
            key="expanded"
            id={EXPANDED_PANEL_ID}
            role="dialog"
            aria-label="Navegação"
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={transition}
            className="fixed left-0 top-0 z-50 flex h-14 w-full items-center border-b border-tts-border bg-tts-surface/95 px-4 shadow-sm backdrop-blur-sm md:px-8"
          >
            <BarBody
              onLinkClick={closeExpanded}
              showCloseButton
              onClose={closeExpanded}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  )
}

function MobileNav() {
  const [open, setOpen] = useState(false)
  const close = () => setOpen(false)

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button
          type="button"
          aria-label="Abrir menu"
          aria-controls={EXPANDED_PANEL_ID}
          className="fixed left-1/2 top-3 z-50 flex h-11 -translate-x-1/2 items-center gap-2 rounded-full border border-tts-deep bg-tts-deep px-4 text-tts-surface shadow-lg shadow-tts-deep/15 focus:outline-none focus-visible:ring-2 focus-visible:ring-tts-gold focus-visible:ring-offset-2 focus-visible:ring-offset-tts-bg"
        >
          <Logo size={22} />
          <span className="text-[13px] font-extrabold tracking-[-0.018em]">
            TalkToStellar
          </span>
          <ChevronDown className="h-3.5 w-3.5 text-tts-surface/70" />
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-tts-deep/40 backdrop-blur-sm data-[state=closed]:animate-out data-[state=closed]:fade-out data-[state=open]:animate-in data-[state=open]:fade-in" />
        <Dialog.Content
          id={EXPANDED_PANEL_ID}
          className="fixed inset-y-0 right-0 z-50 flex w-[82vw] max-w-sm flex-col gap-6 bg-tts-surface p-6 shadow-xl data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right data-[state=open]:animate-in data-[state=open]:slide-in-from-right"
        >
          <div className="flex items-center justify-between">
            <Dialog.Title asChild>
              <a
                href="#top"
                onClick={close}
                className="flex items-center gap-2 text-tts-deep"
              >
                <Logo size={26} />
                <span className="text-base font-extrabold tracking-[-0.018em]">
                  TalkToStellar
                </span>
              </a>
            </Dialog.Title>
            <Dialog.Close
              className="inline-flex h-9 w-9 items-center justify-center rounded-md text-tts-muted hover:bg-tts-deep/5"
              aria-label="Fechar menu"
            >
              <X className="h-4 w-4" />
            </Dialog.Close>
          </div>

          <nav className="flex flex-col gap-1">
            {NAV_LINKS.map((link) => (
              <a
                key={link.id}
                href={`#${link.id}`}
                onClick={close}
                className="rounded-md px-3 py-2 text-sm font-medium text-tts-deep hover:bg-tts-deep/5"
              >
                {link.label}
              </a>
            ))}
          </nav>

          <div className="mt-auto flex flex-col gap-2">
            <Button asChild variant="outline" size="sm">
              <a href="/login">Entrar</a>
            </Button>
            <Button
              asChild
              size="sm"
              className="bg-tts-deep text-tts-surface hover:bg-tts-deep/90"
            >
              <a href="/chat" onClick={close}>
                Abrir chat
              </a>
            </Button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

function BarBody({
  onLinkClick,
  showCloseButton = false,
  onClose,
}: {
  onLinkClick: () => void
  showCloseButton?: boolean
  onClose?: () => void
}) {
  return (
    <div className="relative mx-auto flex w-full max-w-7xl items-center justify-between">
      <BrandLink onClick={onLinkClick} />

      <nav className="absolute left-1/2 flex -translate-x-1/2 items-center gap-7">
        {NAV_LINKS.map((link) => (
          <a
            key={link.id}
            href={`#${link.id}`}
            onClick={onLinkClick}
            className="text-[13px] font-medium text-tts-muted transition-colors hover:text-tts-deep"
          >
            {link.label}
          </a>
        ))}
      </nav>

      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="sm">
          <a href="/login">Entrar</a>
        </Button>
        <Button
          asChild
          size="sm"
          className="bg-tts-deep text-tts-surface hover:bg-tts-deep/90"
        >
          <a href="#comecar" onClick={onLinkClick}>
            Abrir chat
          </a>
        </Button>
        {showCloseButton && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar menu"
            className="inline-flex h-9 w-9 items-center justify-center rounded-md text-tts-muted hover:bg-tts-deep/5"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  )
}

function BrandLink({ onClick }: { onClick?: () => void }) {
  return (
    <a
      href="#top"
      onClick={onClick}
      className="flex items-center gap-2 text-tts-deep"
      aria-label="TalkToStellar — início"
    >
      <Logo size={26} />
      <span className="text-base font-extrabold tracking-[-0.018em]">
        TalkToStellar
      </span>
    </a>
  )
}
