import { afterEach, describe, expect, it, vi } from 'vitest'
import { getClientSession } from '@/lib/session'

describe('getClientSession', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('reads the same-origin HttpOnly session cookie through /api/session', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      json: async () => ({
        authenticated: true,
        session_id: 'session-1',
      }),
    } as Response)

    await expect(getClientSession()).resolves.toEqual({
      authenticated: true,
      sessionId: 'session-1',
    })

    expect(fetchMock).toHaveBeenCalledWith('/api/session', expect.objectContaining({
      cache: 'no-store',
      credentials: 'same-origin',
      signal: expect.any(AbortSignal),
    }))
  })
})
