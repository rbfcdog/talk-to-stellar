import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/evolution/[...path]/route";

describe("/api/evolution frontend compatibility proxy", () => {
  const previousBackendUrl = process.env.BACKEND_URL;

  afterEach(() => {
    vi.restoreAllMocks();
    if (previousBackendUrl === undefined) delete process.env.BACKEND_URL;
    else process.env.BACKEND_URL = previousBackendUrl;
  });

  it("forwards Evolution webhook bodies and auth headers to the backend without session injection", async () => {
    process.env.BACKEND_URL = "https://backend.test";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ success: true, async: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }) as any,
    );

    const request = new NextRequest("https://app.test/api/evolution/webhook?secret=query-secret", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-evolution-webhook-secret": "header-secret",
        authorization: "Bearer diagnostic-secret",
        cookie: "tts_session_id=web-session; tts_session_token=web-token",
      },
      body: JSON.stringify({
        key: {
          remoteJid: "5519997624114@s.whatsapp.net",
          id: "msg-1",
          fromMe: false,
        },
        message: { conversation: "teste" },
      }),
    });

    await POST(request, { params: Promise.resolve({ path: ["webhook"] }) });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toBe("https://backend.test/api/evolution/webhook?secret=query-secret");
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.headers).toMatchObject({
      "x-evolution-webhook-secret": "header-secret",
      authorization: "Bearer diagnostic-secret",
    });
    expect(init.headers).not.toHaveProperty("X-Session-Id");
    expect(JSON.parse(String(init.body))).toMatchObject({
      key: { remoteJid: "5519997624114@s.whatsapp.net" },
      message: { conversation: "teste" },
    });
  });
});
