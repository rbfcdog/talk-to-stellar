import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET } from "@/app/api/financial/[...path]/route";

const scopedCookies = [
  "tts_session_id=web-session",
  "tts_session_token=web-token",
  "tts_session_source=web",
  "tts_session_id_whatsapp=whatsapp-session",
  "tts_session_token_whatsapp=whatsapp-token",
  "tts_session_source_whatsapp=whatsapp",
].join("; ");

describe("/api/financial channel-scoped session forwarding", () => {
  const previousBackendUrl = process.env.BACKEND_URL;

  afterEach(() => {
    vi.restoreAllMocks();
    if (previousBackendUrl === undefined) delete process.env.BACKEND_URL;
    else process.env.BACKEND_URL = previousBackendUrl;
  });

  it("forwards WhatsApp cookies for transaction history opened from WhatsApp", async () => {
    process.env.BACKEND_URL = "https://backend.test";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ success: true, transactions: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }) as any,
    );

    const request = new NextRequest(
      "https://app.test/api/financial/transactions/whatsapp-session?limit=500&session_source=whatsapp&session_scope=whatsapp",
      { headers: { cookie: scopedCookies } },
    );

    const response = await GET(request, { params: Promise.resolve({ path: ["transactions", "whatsapp-session"] }) });
    const payload = await response.json();

    expect(payload).toMatchObject({ success: true, transactions: [] });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toBe(
      "https://backend.test/api/financial/transactions/whatsapp-session?limit=500&session_source=whatsapp&session_scope=whatsapp",
    );
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.headers).toMatchObject({
      "X-Session-Id": "whatsapp-session",
      "X-Session-Token": "whatsapp-token",
    });
  });
});
