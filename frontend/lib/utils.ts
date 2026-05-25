import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

/** Merge Tailwind class names, resolving conflicts so later utilities win. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
