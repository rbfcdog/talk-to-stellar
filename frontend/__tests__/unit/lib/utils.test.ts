import { describe, it, expect } from 'vitest'
import { cn } from '@/lib/utils'

describe('cn', () => {
  describe('merging', () => {
    it('joins multiple class strings into one', () => {
      expect(cn('px-2', 'py-1', 'rounded')).toBe('px-2 py-1 rounded')
    })

    it('accepts a conditional object', () => {
      expect(cn('base', { active: true, disabled: false })).toBe('base active')
    })

    it('flattens arrays of class names', () => {
      expect(cn(['foo', 'bar'], 'baz')).toBe('foo bar baz')
    })
  })

  describe('nullish values', () => {
    it('ignores undefined values', () => {
      expect(cn('foo', undefined, 'bar')).toBe('foo bar')
    })

    it('ignores null values', () => {
      expect(cn('foo', null, 'bar')).toBe('foo bar')
    })

    it('ignores false values', () => {
      expect(cn('foo', false, 'bar')).toBe('foo bar')
    })

    it('returns empty string when all inputs are nullish', () => {
      expect(cn(undefined, null, false)).toBe('')
    })
  })

  describe('tailwind conflict resolution', () => {
    it('keeps the later padding class when conflicting', () => {
      expect(cn('px-2', 'px-4')).toBe('px-4')
    })

    it('keeps the later color class when conflicting', () => {
      expect(cn('text-red-500', 'text-blue-500')).toBe('text-blue-500')
    })

    it('preserves non-conflicting classes alongside resolved ones', () => {
      expect(cn('px-2 py-1', 'px-4')).toBe('py-1 px-4')
    })
  })
})
