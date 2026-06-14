import { afterEach, describe, expect, it, vi } from "vitest"
import userEvent from "@testing-library/user-event"
import { render, screen, waitFor } from "../utils/render"
import EarlyAccessSignup from "@/components/landing-reluca/EarlyAccessSignup"

describe("EarlyAccessSignup", () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it("posts a normalized email to the early-access API", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, signup: { email: "early@example.com" } }),
    })
    vi.stubGlobal("fetch", fetchMock)

    render(<EarlyAccessSignup />)

    const user = userEvent.setup()
    await user.type(screen.getByLabelText(/e-?mail/i), " Early@Example.COM ")
    await user.click(screen.getByRole("button", { name: /entrar na lista|join list/i }))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe("/api/early-access")
    expect(init.method).toBe("POST")
    expect(init.headers).toEqual({ "Content-Type": "application/json" })

    const body = JSON.parse(init.body)
    expect(body).toMatchObject({
      email: "early@example.com",
      source: "landing-reluca",
      metadata: { component: "cta-email-list" },
    })
    expect(["pt-BR", "en"]).toContain(body.locale)
    expect(body.page_url).toContain("http://localhost")
    expect(await screen.findByText(/lista recebida|you are on the list/i)).toBeInTheDocument()
  })

  it("shows validation feedback without posting invalid emails", async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal("fetch", fetchMock)

    render(<EarlyAccessSignup />)

    const user = userEvent.setup()
    await user.type(screen.getByLabelText(/e-?mail/i), "invalid")
    await user.click(screen.getByRole("button", { name: /entrar na lista|join list/i }))

    expect(fetchMock).not.toHaveBeenCalled()
    expect(screen.getByText(/e-mail válido|valid email/i)).toBeInTheDocument()
  })
})
