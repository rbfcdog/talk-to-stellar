import Image from 'next/image'
import { cn } from '@/lib/utils'

interface LogoProps {
  className?: string
  size?: number
}

export function Logo({ className, size = 28 }: LogoProps) {
  return (
    <Image
      src="/talktostellar.png"
      alt="TalkToStellar"
      width={size}
      height={size}
      priority
      className={cn('rounded-md object-contain', className)}
    />
  )
}
