import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET, POST } from "@/app/api/ramp/[...path]/route";

const scopedCookies = [
  "tts_session_id=web-session",
  "tts_session_token=web-token",
  "tts_session_source=web",
  "tts_session_id_whatsapp=whatsapp-session",
  "tts_session_token_whatsapp=whatsapp-token",
  "tts_session_source_whatsapp=whatsapp",
].join("; ");

describe("/api/ramp channel-scoped session forwarding", () => {
  const previousBackendUrl = process.env.BACKEND_URL;
  const previousInternalSecret = process.env.INTERNAL_API_SECRET;
  const previousSandboxSecret = process.env.RAMP_SANDBOX_INTERNAL_SECRET;

  afterEach(() => {
    vi.restoreAllMocks();
    if (previousBackendUrl === undefined) delete process.env.BACKEND_URL;
    else process.env.BACKEND_URL = previousBackendUrl;
    if (previousInternalSecret === undefined) delete process.env.INTERNAL_API_SECRET;
    else process.env.INTERNAL_API_SECRET = previousInternalSecret;
    if (previousSandboxSecret === undefined) delete process.env.RAMP_SANDBOX_INTERNAL_SECRET;
    else process.env.RAMP_SANDBOX_INTERNAL_SECRET = previousSandboxSecret;
  });

  it("forwards WhatsApp cookies on scoped GET calls even when web cookies exist", async () => {
    process.env.BACKEND_URL = "https://backend.test";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ success: true, balances: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }) as any,
    );

    const request = new NextRequest(
      "https://app.test/api/ramp/etherfuse/wallet-balances?source=chat&session_scope=whatsapp",
      { headers: { cookie: scopedCookies } },
    );

    const response = await GET(request, { params: Promise.resolve({ path: ["etherfuse", "wallet-balances"] }) });
    const payload = await response.json();

    expect(payload).toMatchObject({ success: true, balances: [] });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(String(fetchMock.mock.calls[0][0])).toBe(
      "https://backend.test/api/ramp/etherfuse/wallet-balances?source=chat&session_scope=whatsapp",
    );
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.headers).toMatchObject({
      "X-Session-Id": "whatsapp-session",
      "X-Session-Token": "whatsapp-token",
    });
    expect(init.headers).not.toHaveProperty("X-Internal-Api-Secret");
    expect(init.headers).not.toHaveProperty("X-Ramp-Sandbox-Secret");
    expect(init.body).toBeUndefined();
  });

  it("overrides web session fields with WhatsApp cookies on scoped POST bodies", async () => {
    process.env.BACKEND_URL = "https://backend.test";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({
        success: true,
        session_id: "whatsapp-session",
        session_token: "whatsapp-token",
        session_source: "whatsapp",
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }) as any,
    );

    const request = new NextRequest("https://app.test/api/ramp/etherfuse/customer", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        cookie: scopedCookies,
      },
      body: JSON.stringify({
        session_id: "web-session",
        source: "chat",
        session_scope: "whatsapp",
        language: "pt-BR",
      }),
    });

    const response = await POST(request, { params: Promise.resolve({ path: ["etherfuse", "customer"] }) });
    const payload = await response.json();
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    const forwardedBody = JSON.parse(String(init.body));

    expect(payload).toMatchObject({
      success: true,
      session_id: "whatsapp-session",
      session_source: "whatsapp",
    });
    expect(init.headers).toMatchObject({
      "X-Session-Id": "whatsapp-session",
      "X-Session-Token": "whatsapp-token",
    });
    expect(forwardedBody).toMatchObject({
      session_id: "whatsapp-session",
      session_token: "whatsapp-token",
      session_source: "whatsapp",
      source: "chat",
      session_scope: "whatsapp",
      language: "pt-BR",
    });
  });

  it("uses WhatsApp scoped cookies for rendimento PIN verification", async () => {
    process.env.BACKEND_URL = "https://backend.test";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({
        success: true,
        authenticated: true,
        session_id: "whatsapp-session",
        session_source: "whatsapp",
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }) as any,
    );

    const request = new NextRequest("https://app.test/api/ramp/session/verify-pin?source=whatsapp&session_scope=whatsapp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        cookie: scopedCookies,
      },
      body: JSON.stringify({
        pin: "1234",
        wallet_pin: "1234",
        source: "whatsapp",
        session_scope: "whatsapp",
      }),
    });

    const response = await POST(request, { params: Promise.resolve({ path: ["session", "verify-pin"] }) });
    const payload = await response.json();
    const init = fetchMock.mock.calls[0][1] as RequestInit;
    const forwardedBody = JSON.parse(String(init.body));

    expect(payload).toMatchObject({
      success: true,
      authenticated: true,
      session_id: "whatsapp-session",
    });
    expect(init.headers).toMatchObject({
      "X-Session-Id": "whatsapp-session",
      "X-Session-Token": "whatsapp-token",
    });
    expect(forwardedBody).toMatchObject({
      session_id: "whatsapp-session",
      session_token: "whatsapp-token",
      session_source: "whatsapp",
      source: "whatsapp",
      session_scope: "whatsapp",
      pin: "1234",
      wallet_pin: "1234",
    });
  });

  it("does not upgrade browser ramp calls with internal sandbox trust", async () => {
    process.env.BACKEND_URL = "https://backend.test";
    process.env.INTERNAL_API_SECRET = "internal-secret";
    process.env.RAMP_SANDBOX_INTERNAL_SECRET = "sandbox-secret";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }) as any,
    );

    const request = new NextRequest("https://app.test/api/ramp/etherfuse/simulate-fiat-received", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        cookie: scopedCookies,
        "x-internal-api-secret": "internal-secret",
      },
      body: JSON.stringify({
        session_id: "whatsapp-session",
        session_token: "whatsapp-token",
        order_id: "sandbox-pix-1",
        source: "whatsapp",
        session_scope: "whatsapp",
      }),
    });

    await POST(request, { params: Promise.resolve({ path: ["etherfuse", "simulate-fiat-received"] }) });

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.headers).not.toHaveProperty("X-Internal-Api-Secret");
    expect(init.headers).not.toHaveProperty("X-Ramp-Sandbox-Secret");
  });

  it("forwards only the scoped sandbox proxy secret when it matches", async () => {
    process.env.BACKEND_URL = "https://backend.test";
    process.env.INTERNAL_API_SECRET = "internal-secret";
    process.env.RAMP_SANDBOX_INTERNAL_SECRET = "sandbox-secret";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }) as any,
    );

    const request = new NextRequest("https://app.test/api/ramp/etherfuse/simulate-fiat-received", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        cookie: scopedCookies,
        "x-ramp-sandbox-secret": "sandbox-secret",
      },
      body: JSON.stringify({
        session_id: "whatsapp-session",
        session_token: "whatsapp-token",
        order_id: "sandbox-pix-1",
        source: "whatsapp",
        session_scope: "whatsapp",
      }),
    });

    await POST(request, { params: Promise.resolve({ path: ["etherfuse", "simulate-fiat-received"] }) });

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.headers).toMatchObject({ "X-Ramp-Sandbox-Secret": "sandbox-secret" });
    expect(init.headers).not.toHaveProperty("X-Internal-Api-Secret");
  });
});
