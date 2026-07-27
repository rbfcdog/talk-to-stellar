import { describe, expect, it } from 'vitest'
import { cpfDigits, formatCpf, isValidCpf } from '@/lib/cpf'

describe('isValidCpf', () => {
  it('accepts a valid CPF', () => {
    expect(isValidCpf('52998224725')).toBe(true)
  })

  it('accepts a valid CPF with formatting', () => {
    expect(isValidCpf('529.982.247-25')).toBe(true)
  })

  it('rejects repeated digits', () => {
    expect(isValidCpf('11111111111')).toBe(false)
  })

  it('rejects a wrong check digit', () => {
    expect(isValidCpf('52998224726')).toBe(false)
    expect(isValidCpf('12345678900')).toBe(false)
  })

  it('rejects short or empty values', () => {
    expect(isValidCpf('123')).toBe(false)
    expect(isValidCpf('')).toBe(false)
  })
})

describe('cpfDigits / formatCpf', () => {
  it('strips non-digits', () => {
    expect(cpfDigits('529.982.247-25')).toBe('52998224725')
  })

  it('formats progressively', () => {
    expect(formatCpf('529')).toBe('529')
    expect(formatCpf('529982')).toBe('529.982')
    expect(formatCpf('52998224725')).toBe('529.982.247-25')
  })
})
