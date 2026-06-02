import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  clearClientSession,
  getClientSession,
  saveClientSession,
  scopedClientStorageKey,
} from '@/lib/session'

describe('getClientSession', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    window.localStorage.clear()
    window.history.pushState({}, '', '/')
  })

  it('reads the same-origin HttpOnly session cookie through /api/session', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      json: async () => ({
        authenticated: true,
        session_id: 'session-1',
        session_source: 'whatsapp',
        external_priority: true,
      }),
    } as Response)

    await expect(getClientSession()).resolves.toEqual({
      authenticated: true,
      externalPriority: true,
      sessionId: 'session-1',
      sessionSource: 'whatsapp',
    })

    expect(fetchMock).toHaveBeenCalledWith('/api/session', expect.objectContaining({
      cache: 'no-store',
      credentials: 'same-origin',
      signal: expect.any(AbortSignal),
    }))
  })

  it('reads a WhatsApp scoped session without consulting the web cookie scope', async () => {
    window.history.pushState({}, '', '/chat?source=whatsapp')
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      json: async () => ({
        authenticated: true,
        session_id: 'whatsapp-session',
        session_source: 'whatsapp',
        external_priority: true,
      }),
    } as Response)

    await expect(getClientSession()).resolves.toEqual({
      authenticated: true,
      externalPriority: true,
      sessionId: 'whatsapp-session',
      sessionSource: 'whatsapp',
    })

    expect(fetchMock).toHaveBeenCalledWith('/api/session?source=whatsapp', expect.objectContaining({
      cache: 'no-store',
      credentials: 'same-origin',
      signal: expect.any(AbortSignal),
    }))
  })

  it('stores local session timestamps per channel scope', () => {
    window.history.pushState({}, '', '/chat?source=whatsapp')

    saveClientSession()

    expect(window.localStorage.getItem(scopedClientStorageKey('talk-to-stellar.sessionCreatedAt', 'whatsapp'))).toBeTruthy()
    expect(window.localStorage.getItem(scopedClientStorageKey('talk-to-stellar.sessionLastSeenAt', 'whatsapp'))).toBeTruthy()
    expect(window.localStorage.getItem('talk-to-stellar.sessionCreatedAt')).toBeNull()
    expect(window.localStorage.getItem('talk-to-stellar.sessionCreatedAt:web')).toBeNull()
  })

  it('clears only the active channel scope on external logout', () => {
    window.history.pushState({}, '', '/chat?source=whatsapp')
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({ json: async () => ({}) } as Response)
    window.localStorage.setItem(scopedClientStorageKey('talk-to-stellar.sessionCreatedAt', 'whatsapp'), '1')
    window.localStorage.setItem(scopedClientStorageKey('talk-to-stellar.sessionCreatedAt', 'web'), '2')
    window.localStorage.setItem('talk-to-stellar.sessionCreatedAt', 'legacy-web')

    clearClientSession()

    expect(window.localStorage.getItem(scopedClientStorageKey('talk-to-stellar.sessionCreatedAt', 'whatsapp'))).toBeNull()
    expect(window.localStorage.getItem(scopedClientStorageKey('talk-to-stellar.sessionCreatedAt', 'web'))).toBe('2')
    expect(window.localStorage.getItem('talk-to-stellar.sessionCreatedAt')).toBe('legacy-web')
    expect(fetchMock).toHaveBeenCalledWith('/api/session?source=whatsapp', expect.objectContaining({
      method: 'DELETE',
      cache: 'no-store',
    }))
  })
})
