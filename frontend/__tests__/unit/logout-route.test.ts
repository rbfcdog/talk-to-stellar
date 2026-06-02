import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/logout/route";

function setCookieHeaders(response: Response): string[] {
  const getSetCookie = (response.headers as any).getSetCookie;
  if (typeof getSetCookie === "function") return getSetCookie.call(response.headers);
  const single = response.headers.get("set-cookie");
  return single ? [single] : [];
}

describe("/api/logout channel scoping", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("keeps WhatsApp scoped cookies when the web chat logs out", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    } as Response);

    const request = new Request("https://app.test/api/logout", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        cookie: [
          "tts_session_id=web-session",
          "tts_session_token=web-token",
          "tts_session_source=web",
          "tts_session_id_whatsapp=whatsapp-session",
          "tts_session_token_whatsapp=whatsapp-token",
          "tts_session_source_whatsapp=whatsapp",
        ].join("; "),
      },
      body: JSON.stringify({
        session_id: "web-session",
      }),
    });

    const response = await POST(request);
    const payload = await response.json();
    const cookies = setCookieHeaders(response).join("\n");

    expect(payload).toEqual({ success: true, localOnly: true });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(cookies).toContain("tts_session_id=");
    expect(cookies).toContain("tts_session_token=");
    expect(cookies).toContain("tts_session_source=");
    expect(cookies).not.toContain("tts_session_id_whatsapp=");
    expect(cookies).not.toContain("tts_session_token_whatsapp=");
    expect(cookies).not.toContain("tts_session_source_whatsapp=");
  });

  it("treats token-only web logout links as local browser logout", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    } as Response);

    const request = new Request("https://app.test/api/logout?source=web", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        cookie: "tts_session_id=web-session; tts_session_token=web-token; tts_session_source=web",
      },
      body: JSON.stringify({
        session_id: "web-session",
        token: "legacy-web-logout-token",
      }),
    });

    const response = await POST(request);
    const payload = await response.json();

    expect(payload).toEqual({ success: true, localOnly: true });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("treats source=web from the logout page as local browser logout", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    } as Response);

    const request = new Request("https://app.test/api/logout?source=web", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        cookie: [
          "tts_session_id=web-session",
          "tts_session_token=web-token",
          "tts_session_source=web",
          "tts_session_id_whatsapp=whatsapp-session",
          "tts_session_token_whatsapp=whatsapp-token",
          "tts_session_source_whatsapp=whatsapp",
        ].join("; "),
      },
      body: JSON.stringify({
        session_id: "web-session",
        provider: "web",
      }),
    });

    const response = await POST(request);
    const payload = await response.json();
    const cookies = setCookieHeaders(response).join("\n");

    expect(payload).toEqual({ success: true, localOnly: true });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(cookies).toContain("tts_session_id=");
    expect(cookies).not.toContain("tts_session_id_whatsapp=");
  });
});
