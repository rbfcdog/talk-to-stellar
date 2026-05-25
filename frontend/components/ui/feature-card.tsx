import * as React from 'react'
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
}

const VALUE_COLOR: Record<SnippetType, string> = {
  string: 'text-tts-gold',
  number: 'text-tts-deep',
  boolean: 'text-tts-confirm',
}

function formatValue(value: string, type: SnippetType): string {
  return type === 'string' ? `"${value}"` : value
}

export function FeatureCard({
  snippetLines,
  title,
  description,
  className,
  ...rest
}: FeatureCardProps) {
  return (
    <div
      className={cn(
        'flex flex-col overflow-hidden rounded-xl border border-tts-border bg-tts-surface',
        className,
      )}
      {...rest}
    >
      <div className="border-b border-tts-border bg-tts-bg/60 px-4 py-3 font-mono text-[11px] leading-relaxed">
        <span className="text-tts-muted">{'{'}</span>
        {snippetLines.map((line) => (
          <div key={line.key} className="pl-3">
            <span className="text-tts-deep/70">{`"${line.key}"`}</span>
            <span className="text-tts-muted">: </span>
            <span className={cn('font-bold', VALUE_COLOR[line.type])}>
              {formatValue(line.value, line.type)}
            </span>
            <span className="text-tts-muted">,</span>
          </div>
        ))}
        <span className="text-tts-muted">{'}'}</span>
      </div>

      <div className="flex flex-col gap-2 px-5 py-5">
        <h3 className="text-base font-bold tracking-[-0.018em] text-tts-deep">
          {title}
        </h3>
        <p className="text-sm leading-[1.55] text-tts-muted">{description}</p>
      </div>
    </div>
  )
}
