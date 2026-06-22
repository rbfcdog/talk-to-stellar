import { describe, expect, it, jest } from "@jest/globals";
import { BridgeService } from "../src/integrations/bridge/service";

function makeService() {
  const service = new BridgeService({
    apiKey: "test-key",
    baseUrl: "https://api.bridge.xyz/v0",
    enabled: true,
  });
  const client = {
    get: jest.fn<(path: string, params?: Record<string, string>) => Promise<any>>(),
    post: jest.fn<(path: string, body?: unknown, idempotencyKey?: string) => Promise<any>>(),
  };
  (service as unknown as { client: typeof client }).client = client;
  return { service, client };
}

describe("BridgeService virtual account paths", () => {
  it("gets a virtual account through the customer-scoped Bridge endpoint", async () => {
    const { service, client } = makeService();
    client.get.mockResolvedValue({ id: "va_123" });

    await service.getVirtualAccount("cust_123", "va_123");

    expect(client.get).toHaveBeenCalledWith(
      "/customers/cust_123/virtual_accounts/va_123",
    );
  });

  it("gets virtual account activity through the Bridge history endpoint", async () => {
    const { service, client } = makeService();
    client.get.mockResolvedValue({ data: [] });

    await service.getVirtualAccountActivity("cust_123", "va_123", {
      limit: 100,
    });

    expect(client.get).toHaveBeenCalledWith(
      "/customers/cust_123/virtual_accounts/va_123/history",
      { limit: "100" },
    );
  });
});
