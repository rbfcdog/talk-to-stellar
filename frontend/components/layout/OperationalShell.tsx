import * as React from 'react'
import { Logo } from '@/components/shared/logo'
import { cn } from '@/lib/utils'

type OperationalPageProps = {
  children: React.ReactNode
  className?: string
  frameClassName?: string
  size?: 'sm' | 'md' | 'lg' | 'xl'
  centered?: boolean
}

const frameSize = {
  sm: 'max-w-xl',
  md: 'max-w-3xl',
  lg: 'max-w-5xl',
  xl: 'max-w-6xl',
}

export function OperationalPage({
  children,
  className,
  frameClassName,
  size = 'lg',
  centered = false,
}: OperationalPageProps) {
  return (
    <main
      className={cn(
        'tts-op-page relative min-h-screen overflow-hidden bg-tts-bg px-4 py-8 text-tts-deep sm:py-10',
        centered && 'flex items-center justify-center',
        className,
      )}
    >
      <div
        className={cn(
          'tts-op-frame relative mx-auto flex w-full flex-col gap-5',
          frameSize[size],
          frameClassName,
        )}
      >
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
    <header
      className={cn(
        'tts-op-header tts-op-shell border border-tts-border bg-tts-surface p-6 shadow-sm sm:p-8',
        className,
      )}
    >
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="mb-6 flex items-center gap-3">
            <Logo size={34} />
            <div className="min-w-0">
              <p className="text-sm font-extrabold text-tts-deep">TalkToStellar</p>
              {eyebrow ? <p className="mt-0.5 text-xs font-semibold text-tts-muted">{eyebrow}</p> : null}
            </div>
          </div>
          <h1 className="max-w-3xl text-xl font-bold text-tts-deep sm:text-2xl">{title}</h1>
          {description ? <div className="mt-2 max-w-3xl text-sm leading-relaxed text-tts-muted">{description}</div> : null}
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2 lg:justify-end">{actions}</div> : null}
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
      className={cn('tts-op-card tts-op-shell border border-tts-border bg-tts-surface p-5 shadow-sm sm:p-6', className)}
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
    <div className={cn('tts-op-stat tts-op-tile border border-tts-border bg-tts-bg/55 p-4', className)}>
      <p className="text-xs font-semibold text-tts-muted">{label}</p>
      <p className={cn('mt-2 text-lg font-bold', toneClass)}>{value}</p>
      {detail ? <p className="mt-1 text-xs leading-5 text-tts-muted">{detail}</p> : null}
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
    <span className={cn('inline-flex min-h-8 items-center rounded-full border px-3 py-1 text-xs font-bold', toneClass, className)}>
      {children}
    </span>
  )
}
