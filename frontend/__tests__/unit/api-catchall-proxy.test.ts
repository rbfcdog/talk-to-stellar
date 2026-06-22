import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET, POST } from "@/app/api/[...path]/route";

describe("/api catch-all backend proxy", () => {
  const previousBackendUrl = process.env.BACKEND_URL;
  const previousPublicBackendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
  const previousAgentApiUrl = process.env.AGENT_API_URL;
  const previousPublicAgentApiUrl = process.env.NEXT_PUBLIC_AGENT_API_URL;
  const previousNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    vi.restoreAllMocks();
    if (previousBackendUrl === undefined) delete process.env.BACKEND_URL;
    else process.env.BACKEND_URL = previousBackendUrl;
    if (previousPublicBackendUrl === undefined) delete process.env.NEXT_PUBLIC_BACKEND_URL;
    else process.env.NEXT_PUBLIC_BACKEND_URL = previousPublicBackendUrl;
    if (previousAgentApiUrl === undefined) delete process.env.AGENT_API_URL;
    else process.env.AGENT_API_URL = previousAgentApiUrl;
    if (previousPublicAgentApiUrl === undefined) delete process.env.NEXT_PUBLIC_AGENT_API_URL;
    else process.env.NEXT_PUBLIC_AGENT_API_URL = previousPublicAgentApiUrl;
    process.env.NODE_ENV = previousNodeEnv;
  });

  it("falls back to the deployed backend in production when no backend env is configured", async () => {
    delete process.env.BACKEND_URL;
    delete process.env.NEXT_PUBLIC_BACKEND_URL;
    delete process.env.AGENT_API_URL;
    delete process.env.NEXT_PUBLIC_AGENT_API_URL;
    process.env.NODE_ENV = "production";

    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ xlm_usd: 0.1 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }) as any,
    );

    const request = new NextRequest("https://app.test/api/oracle/rates");

    await GET(request, { params: Promise.resolve({ path: ["oracle", "rates"] }) });

    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://talk-to-stellar-production-e284.up.railway.app/api/oracle/rates",
    );
  });

  it("forwards POST bodies without injecting browser session fields", async () => {
    process.env.BACKEND_URL = "https://backend.test";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ pixKey: "abc" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }) as any,
    );

    const body = JSON.stringify({ payload: "00020126" });
    const request = new NextRequest("https://app.test/api/abroad/decode-pix", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        cookie: "tts_session_id=web-session; tts_session_token=web-token",
      },
      body,
    });

    await POST(request, { params: Promise.resolve({ path: ["abroad", "decode-pix"] }) });

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(fetchMock.mock.calls[0][0]).toBe("https://backend.test/api/abroad/decode-pix");
    expect(init.body).toBe(body);
    expect(init.headers).not.toMatchObject({
      "x-tts-session-id": "web-session",
      "x-tts-session-token": "web-token",
    });
  });
});
