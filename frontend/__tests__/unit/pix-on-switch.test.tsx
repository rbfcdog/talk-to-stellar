import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import PixOnSwitch from '@/app/pix-on/pix-on-switch'

vi.mock('@/app/pix-ramp/pix-ramp-client', () => ({
  default: () => <div data-testid="legacy-ramp" />,
}))

vi.mock('@/app/pix-on/pagfinance-onramp-client', () => ({
  default: ({ config }: { config: { available: boolean } }) => (
    <div data-testid="pagfinance-onramp" data-available={String(config.available)} />
  ),
}))

const originalFetch = global.fetch

afterEach(() => {
  global.fetch = originalFetch
  vi.restoreAllMocks()
})

function mockConfigResponse(payload: unknown, ok = true) {
  global.fetch = vi.fn().mockResolvedValue({
    ok,
    json: async () => payload,
  }) as unknown as typeof fetch
}

describe('PixOnSwitch', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders the PagFinance client when the rail is available', async () => {
    mockConfigResponse({ success: true, available: true, needs_customer_data: false })
    render(<PixOnSwitch initialQuery="amount=50" />)
    expect(await screen.findByTestId('pagfinance-onramp')).toBeInTheDocument()
  })

  it('falls back to the legacy ramp client when unavailable', async () => {
    mockConfigResponse({ success: true, available: false })
    render(<PixOnSwitch initialQuery="" />)
    expect(await screen.findByTestId('legacy-ramp')).toBeInTheDocument()
  })

  it('falls back to the legacy ramp client when the config fetch fails', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('offline')) as unknown as typeof fetch
    render(<PixOnSwitch initialQuery="" />)
    expect(await screen.findByTestId('legacy-ramp')).toBeInTheDocument()
  })

  it('shows a loading state before the config resolves', () => {
    global.fetch = vi.fn().mockReturnValue(new Promise(() => {})) as unknown as typeof fetch
    render(<PixOnSwitch initialQuery="" />)
    expect(screen.getByTestId('pix-on-loading')).toBeInTheDocument()
  })
})
