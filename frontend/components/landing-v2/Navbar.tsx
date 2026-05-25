'use client'

import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { ChevronDown, X } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { Logo } from '@/components/shared/logo'

const NAV_LINKS = [
  { id: 'produto', label: 'Produto' },
  { id: 'canais', label: 'Integrações' },
  { id: 'api', label: 'Intents' },
  { id: 'comecar', label: 'Começar' },
]

const EXPANDED_PANEL_ID = 'navbar-expanded'

export function Navbar() {
  const [expanded, setExpanded] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const reduceMotion = useReducedMotion()

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

  const transition = reduceMotion
    ? { duration: 0 }
    : { type: 'spring' as const, stiffness: 380, damping: 32 }

  const close = () => {
    setExpanded(false)
    triggerRef.current?.focus()
  }

  return (
    <header
      ref={rootRef}
      className="fixed left-1/2 top-3 z-50 -translate-x-1/2"
    >
      <motion.div
        layout
        transition={transition}
        className={cn(
          'flex h-11 items-center overflow-hidden rounded-full border border-tts-deep bg-tts-deep text-tts-surface shadow-lg shadow-tts-deep/15 backdrop-blur-sm',
          expanded
            ? 'w-[min(900px,calc(100vw-24px))] gap-2 pl-3 pr-1.5'
            : 'px-1',
        )}
        role={expanded ? 'dialog' : undefined}
        aria-label={expanded ? 'Navegação' : undefined}
        id={EXPANDED_PANEL_ID}
      >
        <AnimatePresence mode="wait" initial={false}>
          {!expanded ? (
            <motion.button
              key="trigger"
              ref={triggerRef}
              type="button"
              onClick={() => setExpanded(true)}
              aria-expanded={false}
              aria-controls={EXPANDED_PANEL_ID}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.12 }}
              className="flex h-full items-center gap-2 rounded-full px-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-tts-gold focus-visible:ring-offset-2 focus-visible:ring-offset-tts-bg"
            >
              <Logo size={20} />
              <span className="text-[13px] font-extrabold tracking-[-0.018em]">
                TalkToStellar
              </span>
              <ChevronDown className="h-3.5 w-3.5 text-tts-surface/70" />
            </motion.button>
          ) : (
            <motion.div
              key="expanded"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15, delay: 0.05 }}
              className="flex h-full w-full items-center gap-2"
            >
              <a
                href="#top"
                onClick={close}
                className="flex items-center gap-2 pr-2"
                aria-label="TalkToStellar — início"
              >
                <Logo size={20} />
                <span className="hidden text-[13px] font-extrabold tracking-[-0.018em] sm:inline">
                  TalkToStellar
                </span>
              </a>

              <nav className="flex flex-1 items-center justify-center gap-1 overflow-x-auto md:gap-2">
                {NAV_LINKS.map((link) => (
                  <a
                    key={link.id}
                    href={`#${link.id}`}
                    onClick={close}
                    className="shrink-0 rounded-full px-3 py-1.5 text-[12px] font-medium text-tts-surface/75 transition-colors hover:bg-white/10 hover:text-tts-surface md:text-[13px]"
                  >
                    {link.label}
                  </a>
                ))}
              </nav>

              <div className="flex shrink-0 items-center gap-1">
                <Button
                  asChild
                  variant="ghost"
                  size="sm"
                  className="hidden h-8 px-3 text-tts-surface/80 hover:bg-white/10 hover:text-tts-surface md:inline-flex"
                >
                  <a href="/login" onClick={close}>
                    Entrar
                  </a>
                </Button>
                <Button
                  asChild
                  size="sm"
                  className="h-8 rounded-full bg-tts-gold px-3 text-[12px] text-tts-deep hover:bg-tts-gold-lt"
                >
                  <a href="#comecar" onClick={close}>
                    Falar com o time
                  </a>
                </Button>
                <button
                  type="button"
                  onClick={close}
                  aria-label="Fechar menu"
                  className="ml-1 inline-flex h-8 w-8 items-center justify-center rounded-full text-tts-surface/70 transition hover:bg-white/10 hover:text-tts-surface"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </header>
  )
}
