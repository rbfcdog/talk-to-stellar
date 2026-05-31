import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "@/app/r/[code]/route";

function setCookieHeaders(response: Response): string[] {
  const getSetCookie = (response.headers as any).getSetCookie;
  if (typeof getSetCookie === "function") return getSetCookie.call(response.headers);
  const single = response.headers.get("set-cookie");
  return single ? [single] : [];
}

describe("/r short-link session handoff", () => {
  const previousBackendUrl = process.env.BACKEND_URL;
  const previousSecret = process.env.SHORT_LINK_PROXY_SECRET;

  afterEach(() => {
    vi.restoreAllMocks();
    if (previousBackendUrl === undefined) delete process.env.BACKEND_URL;
    else process.env.BACKEND_URL = previousBackendUrl;
    if (previousSecret === undefined) delete process.env.SHORT_LINK_PROXY_SECRET;
    else process.env.SHORT_LINK_PROXY_SECRET = previousSecret;
  });

  it("lets WhatsApp short links replace an existing browser session", async () => {
    process.env.BACKEND_URL = "https://backend.test";
    process.env.SHORT_LINK_PROXY_SECRET = "secret";
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        url: "https://app.test/rendimentos?source=whatsapp",
        session_id: "whatsapp-session",
        session_token: "whatsapp-token",
        session_source: "whatsapp",
      }),
    } as Response);

    const request = new NextRequest("https://app.test/r/abc", {
      headers: {
        cookie: "tts_session_id=web-session; tts_session_token=web-token; tts_session_source=web",
      },
    });

    const response = await GET(request, { params: Promise.resolve({ code: "abc" }) });
    const cookies = setCookieHeaders(response).join("\n");

    expect(response.headers.get("location")).toBe("https://app.test/rendimentos?source=whatsapp");
    expect(cookies).toContain("tts_session_id=whatsapp-session");
    expect(cookies).toContain("tts_session_token=whatsapp-token");
    expect(cookies).toContain("tts_session_source=whatsapp");
  });

  it("clears the browser session before opening a WhatsApp login link without a session token", async () => {
    process.env.BACKEND_URL = "https://backend.test";
    process.env.SHORT_LINK_PROXY_SECRET = "secret";
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        url: "https://app.test/login?provider=whatsapp&source=whatsapp",
        session_source: "whatsapp",
      }),
    } as Response);

    const request = new NextRequest("https://app.test/r/login", {
      headers: {
        cookie: "tts_session_id=web-session; tts_session_token=web-token; tts_session_source=web",
      },
    });

    const response = await GET(request, { params: Promise.resolve({ code: "login" }) });
    const cookies = setCookieHeaders(response).join("\n");

    expect(response.headers.get("location")).toBe("https://app.test/login?provider=whatsapp&source=whatsapp");
    expect(cookies).toContain("tts_session_id=");
    expect(cookies).toContain("tts_session_token=");
    expect(cookies).toContain("tts_session_source=");
    expect(cookies).toContain("Max-Age=0");
  });
});
