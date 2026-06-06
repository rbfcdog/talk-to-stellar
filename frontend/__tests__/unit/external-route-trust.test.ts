import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET, POST } from "@/app/api/external/[...path]/route";

describe("/api/external public proxy trust boundary", () => {
  const previousBackendUrl = process.env.BACKEND_URL;
  const previousSecret = process.env.SHORT_LINK_PROXY_SECRET;
  const previousInternalSecret = process.env.INTERNAL_API_SECRET;

  afterEach(() => {
    vi.restoreAllMocks();
    if (previousBackendUrl === undefined) delete process.env.BACKEND_URL;
    else process.env.BACKEND_URL = previousBackendUrl;
    if (previousSecret === undefined) delete process.env.SHORT_LINK_PROXY_SECRET;
    else process.env.SHORT_LINK_PROXY_SECRET = previousSecret;
    if (previousInternalSecret === undefined) delete process.env.INTERNAL_API_SECRET;
    else process.env.INTERNAL_API_SECRET = previousInternalSecret;
  });

  it("does not forward internal secrets for normal external API calls", async () => {
    process.env.BACKEND_URL = "https://backend.test";
    process.env.INTERNAL_API_SECRET = "internal-secret";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }) as any,
    );

    const request = new NextRequest("https://app.test/api/external/check-account", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ provider: "web", provider_user_id: "browser-1" }),
    });

    await POST(request, { params: Promise.resolve({ path: ["check-account"] }) });

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.headers).not.toHaveProperty("x-internal-api-secret");
    expect(init.headers).not.toHaveProperty("x-short-link-proxy-secret");
  });

  it("uses only the scoped short-link proxy secret for public short-link creation", async () => {
    process.env.BACKEND_URL = "https://backend.test";
    process.env.SHORT_LINK_PROXY_SECRET = "short-link-secret";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ success: true, url: "https://app.test/r/abc" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }) as any,
    );

    const request = new NextRequest("https://app.test/api/external/short-links", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        url: "https://app.test/setup-passkey?user_id=user-1",
        purpose: "create_account_passkey_qr",
      }),
    });

    await POST(request, { params: Promise.resolve({ path: ["short-links"] }) });

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.headers).toMatchObject({ "x-short-link-proxy-secret": "short-link-secret" });
    expect(init.headers).not.toHaveProperty("x-internal-api-secret");
  });

  it("does not attach trust headers when a browser resolves a short link with include_session", async () => {
    process.env.BACKEND_URL = "https://backend.test";
    process.env.INTERNAL_API_SECRET = "internal-secret";
    process.env.SHORT_LINK_PROXY_SECRET = "short-link-secret";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({
        success: true,
        url: "https://app.test/pix-ramp?source=whatsapp",
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }) as any,
    );

    const request = new NextRequest("https://app.test/api/external/short-links/abc123?include_session=1");

    await GET(request, { params: Promise.resolve({ path: ["short-links", "abc123"] }) });

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.headers).not.toHaveProperty("x-internal-api-secret");
    expect(init.headers).not.toHaveProperty("x-short-link-proxy-secret");
  });
});
