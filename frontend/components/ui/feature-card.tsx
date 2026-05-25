'use client'

import * as React from 'react'
import { motion, useInView, useReducedMotion } from 'framer-motion'
import { cn } from '@/lib/utils'

export type SnippetType = 'string' | 'number' | 'boolean'

export interface SnippetLine {
  key: string
  value: string
  type: SnippetType
}

export interface FeatureCardProps extends React.HTMLAttributes<HTMLDivElement> {
  snippetLines: SnippetLine[]
  title: string
  description: string
  index?: number
}

const VALUE_COLOR_DARK: Record<SnippetType, string> = {
  string: 'text-tts-gold-lt',
  number: 'text-tts-surface',
  boolean: 'text-tts-confirm',
}

function formatValue(value: string, type: SnippetType): string {
  return type === 'string' ? `"${value}"` : value
}

export function FeatureCard({
  snippetLines,
  title,
  description,
  index = 0,
  className,
  ...rest
}: FeatureCardProps) {
  const ref = React.useRef<HTMLDivElement | null>(null)
  const inView = useInView(ref, { once: true, amount: 0.3 })
  const reduceMotion = useReducedMotion()
  const reveal = inView || reduceMotion

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.3 }}
      transition={{ duration: 0.45, delay: index * 0.12, ease: 'easeOut' }}
      className={cn(
        'group flex flex-col overflow-hidden rounded-xl border border-tts-border bg-tts-surface transition-colors hover:border-tts-gold/40',
        className,
      )}
      {...(rest as React.ComponentProps<typeof motion.div>)}
    >
      <div className="border-b border-tts-deep bg-tts-deep px-4 py-3 font-mono text-[11px] leading-relaxed text-tts-surface/80">
        <span className="text-tts-surface/40">{'{'}</span>
        {snippetLines.map((line, i) => (
          <motion.div
            key={line.key}
            initial={{ opacity: 0, x: -4 }}
            animate={reveal ? { opacity: 1, x: 0 } : { opacity: 0, x: -4 }}
            transition={{
              duration: 0.25,
              delay: 0.3 + index * 0.12 + i * 0.08,
              ease: 'easeOut',
            }}
            className="pl-3"
          >
            <span className="text-tts-surface/55">{`"${line.key}"`}</span>
            <span className="text-tts-surface/40">: </span>
            <span className={cn('font-bold', VALUE_COLOR_DARK[line.type])}>
              {formatValue(line.value, line.type)}
            </span>
            <span className="text-tts-surface/40">,</span>
          </motion.div>
        ))}
        <span className="text-tts-surface/40">{'}'}</span>
      </div>

      <div className="flex flex-col gap-2 px-5 py-5">
        <h3 className="text-base font-bold tracking-[-0.018em] text-tts-deep">
          {title}
        </h3>
        <p className="text-sm leading-[1.55] text-tts-muted">{description}</p>
      </div>
    </motion.div>
  )
}
