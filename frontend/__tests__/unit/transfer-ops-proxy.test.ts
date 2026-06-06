import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/transfers/[...path]/route";

describe("/api/transfers operator authorization forwarding", () => {
  const previousBackendUrl = process.env.BACKEND_URL;

  afterEach(() => {
    vi.restoreAllMocks();
    if (previousBackendUrl === undefined) delete process.env.BACKEND_URL;
    else process.env.BACKEND_URL = previousBackendUrl;
  });

  it("forwards only an explicitly supplied transfer ops credential", async () => {
    process.env.BACKEND_URL = "https://backend.test";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }) as any,
    );

    const request = new NextRequest("https://app.test/api/transfers/tr-1/settle-stellar", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-international-transfer-ops-secret": "operator-supplied-secret",
      },
      body: JSON.stringify({}),
    });

    await POST(request, { params: Promise.resolve({ path: ["tr-1", "settle-stellar"] }) });

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.headers).toMatchObject({
      "x-international-transfer-ops-secret": "operator-supplied-secret",
    });
    expect(init.headers).not.toHaveProperty("x-internal-api-secret");
  });

  it("does not synthesize operator authorization", async () => {
    process.env.BACKEND_URL = "https://backend.test";
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }) as any,
    );

    const request = new NextRequest("https://app.test/api/transfers/tr-1/settle-stellar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    await POST(request, { params: Promise.resolve({ path: ["tr-1", "settle-stellar"] }) });

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    expect(init.headers).not.toHaveProperty("x-international-transfer-ops-secret");
  });
});
