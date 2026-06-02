import { afterEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/chat/route";

function setCookieHeaders(response: Response): string[] {
  const getSetCookie = (response.headers as any).getSetCookie;
  if (typeof getSetCookie === "function") return getSetCookie.call(response.headers);
  const single = response.headers.get("set-cookie");
  return single ? [single] : [];
}

describe("/api/chat channel-scoped sessions", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("uses the WhatsApp scoped session and never resolves the web browser session", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({
        success: true,
        session_id: "whatsapp-session",
        message: "ok",
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }) as any,
    );

    const request = new Request("https://app.test/api/chat?source=whatsapp", {
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
        messages: [{ role: "user", content: "saldo" }],
        session_id: "browser-session",
        source: "whatsapp",
        language: "pt-BR",
        metadata: {
          browser_id: "web-browser-id",
          source: "whatsapp",
        },
      }),
    });

    const response = await POST(request);
    const payload = await response.json();
    const cookies = setCookieHeaders(response).join("\n");

    expect(payload).toMatchObject({
      content: "ok",
      session_id: "whatsapp-session",
      success: true,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toContain("/api/agent/query");
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.headers).toMatchObject({
      "X-Session-Id": "whatsapp-session",
      "X-Session-Token": "whatsapp-token",
    });
    expect(JSON.parse(String(init.body))).toMatchObject({
      query: "saldo",
      session_id: "whatsapp-session",
      session_token: "whatsapp-token",
      source: "whatsapp",
      metadata: {
        source: "whatsapp",
      },
    });
    expect(cookies).toContain("tts_session_id_whatsapp=whatsapp-session");
    expect(cookies).toContain("tts_session_token_whatsapp=whatsapp-token");
    expect(cookies).not.toContain("tts_session_id=whatsapp-session");
  });
});
