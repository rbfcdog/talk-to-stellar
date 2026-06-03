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

  it("clears only WhatsApp cookies when the logout request is scoped to WhatsApp", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }) as any,
    );

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
        session_id: "whatsapp-session",
        provider: "whatsapp",
        provider_user_id: "5519999999999",
      }),
    });

    const response = await POST(request);
    const payload = await response.json();
    const cookies = setCookieHeaders(response).join("\n");

    expect(payload).toMatchObject({ success: true });
    expect(cookies).toContain("tts_session_id_whatsapp=");
    expect(cookies).toContain("tts_session_token_whatsapp=");
    expect(cookies).toContain("tts_session_source_whatsapp=");
    expect(cookies).not.toContain("tts_session_id=;");
    expect(cookies).not.toContain("tts_session_token=;");
  });
});
