import * as React from 'react'
import { Logo } from '@/components/shared/logo'
import { cn } from '@/lib/utils'

type OperationalPageProps = {
  children: React.ReactNode
  className?: string
  frameClassName?: string
  size?: 'sm' | 'md' | 'lg' | 'xl'
}

const frameSize = {
  sm: 'max-w-3xl',
  md: 'max-w-5xl',
  lg: 'max-w-6xl',
  xl: 'max-w-7xl',
}

export function OperationalPage({
  children,
  className,
  frameClassName,
  size = 'lg',
}: OperationalPageProps) {
  return (
    <main className={cn('tts-op-page min-h-screen bg-tts-bg text-tts-deep', className)}>
      <div className={cn('tts-op-frame mx-auto w-full px-4 py-6 sm:px-6 lg:px-8', frameSize[size], frameClassName)}>
        {children}
      </div>
    </main>
  )
}

type OperationalHeaderProps = {
  eyebrow?: React.ReactNode
  title: React.ReactNode
  description?: React.ReactNode
  actions?: React.ReactNode
  children?: React.ReactNode
  className?: string
}

export function OperationalHeader({
  eyebrow,
  title,
  description,
  actions,
  children,
  className,
}: OperationalHeaderProps) {
  return (
    <header className={cn('tts-op-header rounded-2xl border border-tts-border bg-tts-surface p-5 shadow-sm sm:p-6', className)}>
      <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="mb-4 flex items-center gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-tts-border bg-tts-bg text-tts-gold">
              <Logo size={22} />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-black uppercase tracking-[0.18em] text-tts-muted">TalkToStellar</p>
              {eyebrow ? <p className="mt-1 text-xs font-bold text-tts-gold">{eyebrow}</p> : null}
            </div>
          </div>
          <h1 className="max-w-3xl text-2xl font-black tracking-tight text-tts-deep sm:text-4xl">{title}</h1>
          {description ? <div className="mt-3 max-w-3xl text-sm font-semibold leading-6 text-tts-muted">{description}</div> : null}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
      {children ? <div className="mt-5">{children}</div> : null}
    </header>
  )
}

type OperationalCardProps = React.HTMLAttributes<HTMLElement> & {
  as?: 'section' | 'article' | 'div'
}

export function OperationalCard({
  as = 'section',
  className,
  children,
  ...props
}: OperationalCardProps) {
  const Comp = as
  return (
    <Comp
      className={cn('tts-op-card rounded-2xl border border-tts-border bg-tts-surface p-4 shadow-sm sm:p-5', className)}
      {...props}
    >
      {children}
    </Comp>
  )
}

type OperationalStatProps = {
  label: React.ReactNode
  value: React.ReactNode
  detail?: React.ReactNode
  tone?: 'default' | 'gold' | 'confirm' | 'error'
  className?: string
}

export function OperationalStat({
  label,
  value,
  detail,
  tone = 'default',
  className,
}: OperationalStatProps) {
  const toneClass = {
    default: 'text-tts-deep',
    gold: 'text-tts-gold',
    confirm: 'text-tts-confirm',
    error: 'text-tts-error',
  }[tone]

  return (
    <div className={cn('tts-op-stat rounded-xl border border-tts-border bg-tts-bg/60 p-4', className)}>
      <p className="text-xs font-black uppercase tracking-[0.16em] text-tts-muted">{label}</p>
      <p className={cn('mt-2 text-xl font-black tracking-tight', toneClass)}>{value}</p>
      {detail ? <p className="mt-1 text-xs font-semibold leading-5 text-tts-muted">{detail}</p> : null}
    </div>
  )
}

type StatusPillProps = {
  children: React.ReactNode
  tone?: 'default' | 'gold' | 'confirm' | 'error'
  className?: string
}

export function StatusPill({ children, tone = 'default', className }: StatusPillProps) {
  const toneClass = {
    default: 'border-tts-border bg-tts-bg text-tts-muted',
    gold: 'border-tts-gold-br bg-tts-gold-bg text-tts-gold',
    confirm: 'border-tts-confirm/25 bg-tts-confirm/10 text-tts-confirm',
    error: 'border-tts-error/25 bg-tts-error/10 text-tts-error',
  }[tone]

  return (
    <span className={cn('inline-flex min-h-8 items-center rounded-full border px-3 py-1 text-xs font-black uppercase tracking-[0.12em]', toneClass, className)}>
      {children}
    </span>
  )
}
