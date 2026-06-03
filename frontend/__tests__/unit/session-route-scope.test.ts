import { describe, expect, it } from "vitest";
import { DELETE, GET } from "@/app/api/session/route";

function setCookieHeaders(response: Response): string[] {
  const getSetCookie = (response.headers as any).getSetCookie;
  if (typeof getSetCookie === "function") return getSetCookie.call(response.headers);
  const single = response.headers.get("set-cookie");
  return single ? [single] : [];
}

describe("/api/session channel scoping", () => {
  it("reports the web session even when a legacy source cookie says WhatsApp", async () => {
    const request = new Request("https://app.test/api/session", {
      headers: {
        cookie: [
          "tts_session_id=web-session",
          "tts_session_token=web-token",
          "tts_session_source=whatsapp",
          "tts_session_id_whatsapp=whatsapp-session",
          "tts_session_token_whatsapp=whatsapp-token",
          "tts_session_source_whatsapp=whatsapp",
        ].join("; "),
      },
    });

    const response = await GET(request);
    const payload = await response.json();

    expect(payload).toMatchObject({
      authenticated: true,
      session_id: "web-session",
      session_source: "web",
      external_priority: false,
    });
  });

  it("reports the WhatsApp session only when the request asks for WhatsApp", async () => {
    const request = new Request("https://app.test/api/session?source=whatsapp", {
      headers: {
        cookie: [
          "tts_session_id=web-session",
          "tts_session_token=web-token",
          "tts_session_source=web",
          "tts_session_id_whatsapp=whatsapp-session",
          "tts_session_token_whatsapp=whatsapp-token",
          "tts_session_source_whatsapp=whatsapp",
        ].join("; "),
      },
    });

    const response = await GET(request);
    const payload = await response.json();

    expect(payload).toMatchObject({
      authenticated: true,
      session_id: "whatsapp-session",
      session_source: "whatsapp",
      external_priority: true,
    });
  });

  it("treats session_scope=whatsapp as WhatsApp even when source=chat is also present", async () => {
    const request = new Request("https://app.test/api/session?source=chat&session_scope=whatsapp", {
      headers: {
        cookie: [
          "tts_session_id=web-session",
          "tts_session_token=web-token",
          "tts_session_source=web",
          "tts_session_id_whatsapp=whatsapp-session",
          "tts_session_token_whatsapp=whatsapp-token",
          "tts_session_source_whatsapp=whatsapp",
        ].join("; "),
      },
    });

    const response = await GET(request);
    const payload = await response.json();

    expect(payload).toMatchObject({
      authenticated: true,
      session_id: "whatsapp-session",
      session_source: "whatsapp",
      external_priority: true,
    });
  });

  it("clears only the WhatsApp cookies on WhatsApp logout", async () => {
    const request = new Request("https://app.test/api/session?source=whatsapp", {
      method: "DELETE",
      headers: {
        cookie: [
          "tts_session_id=web-session",
          "tts_session_token=web-token",
          "tts_session_source=web",
          "tts_session_id_whatsapp=whatsapp-session",
          "tts_session_token_whatsapp=whatsapp-token",
          "tts_session_source_whatsapp=whatsapp",
        ].join("; "),
      },
    });

    const response = await DELETE(request);
    const cookies = setCookieHeaders(response).join("\n");

    expect(cookies).toContain("tts_session_id_whatsapp=");
    expect(cookies).toContain("tts_session_token_whatsapp=");
    expect(cookies).toContain("tts_session_source_whatsapp=");
    expect(cookies).not.toContain("tts_session_id=;");
    expect(cookies).not.toContain("tts_session_token=;");
  });
});
