import { describe, it, expect } from 'vitest'
import { buildIdempotencyKey } from '@/lib/idempotency'

describe('buildIdempotencyKey', () => {
  describe('determinism', () => {
    it('returns the same key for identical scope and payload', () => {
      const a = buildIdempotencyKey('payments.create', { amount: 100, currency: 'BRL' })
      const b = buildIdempotencyKey('payments.create', { amount: 100, currency: 'BRL' })
      expect(a).toBe(b)
    })

    it('produces the same key regardless of object key order', () => {
      const a = buildIdempotencyKey('scope', { a: 1, b: 2, c: 3 })
      const b = buildIdempotencyKey('scope', { c: 3, b: 2, a: 1 })
      expect(a).toBe(b)
    })

    it('handles nested objects deterministically', () => {
      const a = buildIdempotencyKey('scope', { user: { id: 1, name: 'x' }, amount: 50 })
      const b = buildIdempotencyKey('scope', { amount: 50, user: { name: 'x', id: 1 } })
      expect(a).toBe(b)
    })
  })

  describe('uniqueness', () => {
    it('returns different keys when scope differs', () => {
      const a = buildIdempotencyKey('payments.create', { amount: 100 })
      const b = buildIdempotencyKey('payments.refund', { amount: 100 })
      expect(a).not.toBe(b)
    })

    it('returns different keys when payload differs', () => {
      const a = buildIdempotencyKey('scope', { amount: 100 })
      const b = buildIdempotencyKey('scope', { amount: 101 })
      expect(a).not.toBe(b)
    })

    it('distinguishes nested payload differences', () => {
      const a = buildIdempotencyKey('scope', { user: { id: 1 } })
      const b = buildIdempotencyKey('scope', { user: { id: 2 } })
      expect(a).not.toBe(b)
    })
  })

  describe('output shape', () => {
    it('returns a non-empty string', () => {
      const key = buildIdempotencyKey('scope', { foo: 'bar' })
      expect(typeof key).toBe('string')
      expect(key.length).toBeGreaterThan(0)
    })

    it('starts with the tts_ prefix', () => {
      const key = buildIdempotencyKey('scope', { foo: 'bar' })
      expect(key.startsWith('tts_')).toBe(true)
    })

    it('handles primitive payloads', () => {
      const key = buildIdempotencyKey('scope', 'simple-string')
      expect(typeof key).toBe('string')
      expect(key.length).toBeGreaterThan(0)
    })
  })
})
