import { jest, describe, it, expect, beforeEach } from "@jest/globals";
import type { Request, Response } from "express";
import { BridgeController } from "../src/api/controllers/bridge.controller";
import { supabase } from "../src/config/supabase";
import { getBridgeService } from "../src/integrations/bridge";

jest.mock("../src/integrations/bridge", () => ({
  getBridgeService: jest.fn(),
}));

jest.mock("../src/utils/public-error", () => ({
  publicErrorMessage: jest.fn((e: Error, fallback: string) => fallback),
}));

function mockReq(overrides: Partial<Request> = {}): Request {
  return {
    params: {},
    query: {},
    body: {},
    headers: {},
    ...overrides,
  } as unknown as Request;
}

function mockRes(): Response {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.send = jest.fn().mockReturnValue(res);
  return res as Response;
}

function supabaseBuilder({ maybeSingleData = null, listData = [] }: { maybeSingleData?: any; listData?: any[] }) {
  const builder: any = {};
  const chain = () => builder;
  ["select", "eq", "order", "limit"].forEach((method) => {
    builder[method] = jest.fn(chain);
  });
  builder.maybeSingle = jest.fn(() => Promise.resolve({ data: maybeSingleData, error: null }));
  builder.then = (onFulfilled: any, onRejected: any) => (
    Promise.resolve({ data: listData, error: null }).then(onFulfilled, onRejected)
  );
  return builder;
}

describe("Bridge Customer API", () => {
  let mockService: any;

  beforeEach(() => {
    mockService = {
      enabled: true,
      config: {
        enableMainnetMoneyMovement: false,
        requireManualConfirmation: true,
        defaultSourceChain: "base",
        defaultSourceCurrency: "usdc",
        defaultDestinationCurrency: "brl",
        defaultDestinationRail: "pix",
        minBrlAmount: "10",
        maxBrlAmount: "50000",
        minUsdcAmount: "5",
        maxUsdcAmount: "10000",
        developerFeePercent: "0.30",
      },
      createCustomer: jest.fn(),
      getCustomer: jest.fn(),
      createKycLink: jest.fn(),
      addPixKey: jest.fn(),
      listExternalAccounts: jest.fn(),
      getExternalAccount: jest.fn(),
      deleteExternalAccount: jest.fn(),
      createLiquidationAddress: jest.fn(),
      listLiquidationAddresses: jest.fn(),
      getLiquidationAddress: jest.fn(),
      createTransfer: jest.fn(),
      getTransfer: jest.fn(),
      getExchangeRate: jest.fn(),
      createBrlVirtualAccount: jest.fn(),
      listVirtualAccounts: jest.fn(),
      getVirtualAccount: jest.fn(),
      getVirtualAccountActivity: jest.fn(),
      getWalletBalances: jest.fn(),
    };
    (getBridgeService as jest.Mock).mockReturnValue(mockService);
  });

  // ── Customer ──────────────────────────────

  it("creates a customer", async () => {
    const customer = {
      id: "cust_123",
      type: "individual",
      kyc_status: "not_started",
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    };
    mockService.createCustomer.mockResolvedValue(customer);

    const req = mockReq({
      body: {
        first_name: "John",
        last_name: "Doe",
        email: "john@example.com",
        country: "BR",
      },
    });
    const res = mockRes();
    await BridgeController.createCustomer(req, res);

    expect(mockService.createCustomer).toHaveBeenCalledWith(
      expect.objectContaining({
        first_name: "John",
        email: "john@example.com",
        type: "individual",
      }),
    );
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, customer }),
    );
  });

  it("gets a customer", async () => {
    const customer = { id: "cust_123", type: "individual", kyc_status: "approved" };
    mockService.getCustomer.mockResolvedValue(customer);

    const req = mockReq({ params: { id: "cust_123" } });
    const res = mockRes();
    await BridgeController.getCustomer(req, res);

    expect(mockService.getCustomer).toHaveBeenCalledWith("cust_123");
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, customer }),
    );
  });

  // ── KYC ──────────────────────────────────

  it("creates a KYC link", async () => {
    const kycLink = { id: "kyc_456", status: "pending", url: "https://..." };
    mockService.createKycLink.mockResolvedValue(kycLink);

    const req = mockReq({ params: { id: "cust_123" } });
    const res = mockRes();
    await BridgeController.getKycLink(req, res);

    expect(mockService.createKycLink).toHaveBeenCalledWith("cust_123");
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, kyc_link: kycLink }),
    );
  });

  // ── External Account ──────────────────────

  it("adds a PIX key external account", async () => {
    const account = { id: "ea_789", currency: "brl", account_type: "pix_key" };
    mockService.addPixKey.mockResolvedValue(account);

    const req = mockReq({
      params: { id: "cust_123" },
      body: { pix_key: "john@email.com", account_owner_name: "John Doe" },
    });
    const res = mockRes();
    await BridgeController.createPixKeyExternalAccount(req, res);

    expect(mockService.addPixKey).toHaveBeenCalledWith(
      "cust_123",
      "john@email.com",
      "John Doe",
    );
    expect(res.status).toHaveBeenCalledWith(201);
  });

  // ── Liquidation Address ───────────────────

  it("creates a liquidation address", async () => {
    const address = {
      id: "la_001",
      payment_rail: "pix",
      currency: "brl",
    };
    mockService.createLiquidationAddress.mockResolvedValue(address);

    const req = mockReq({
      params: { id: "cust_123" },
      body: {
        external_account_id: "ea_789",
        developer_fee_percent: "0.20",
      },
    });
    const res = mockRes();
    await BridgeController.createPixLiquidationAddress(req, res);

    expect(mockService.createLiquidationAddress).toHaveBeenCalledWith(
      "cust_123",
      expect.objectContaining({
        chain: "base",
        currency: "usdc",
        destination_payment_rail: "pix",
        destination_currency: "brl",
        external_account_id: "ea_789",
        custom_developer_fee_percent: "0.20",
      }),
    );
    expect(res.status).toHaveBeenCalledWith(201);
  });

  // ── Transfer ──────────────────────────────

  it("creates a crypto-to-pix transfer", async () => {
    const transfer = {
      id: "xfer_001",
      state: "awaiting_funds",
    };
    mockService.createTransfer.mockResolvedValue(transfer);

    const req = mockReq({
      body: {
        on_behalf_of: "cust_123",
        amount: "100",
        external_account_id: "ea_789",
        from_address: "GABC...",
      },
    });
    const res = mockRes();
    await BridgeController.createCryptoToPixTransfer(req, res);

    expect(mockService.createTransfer).toHaveBeenCalledWith(
      expect.objectContaining({
        on_behalf_of: "cust_123",
        destination: expect.objectContaining({
          amount: "100",
          payment_rail: "pix",
          currency: "brl",
          external_account_id: "ea_789",
        }),
      }),
    );
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it("rejects transfer below minimum BRL", async () => {
    const req = mockReq({
      body: { on_behalf_of: "cust_123", amount: "5" },
    });
    const res = mockRes();
    await BridgeController.createCryptoToPixTransfer(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false }),
    );
  });

  it("rejects transfer above maximum BRL", async () => {
    const req = mockReq({
      body: { on_behalf_of: "cust_123", amount: "999999" },
    });
    const res = mockRes();
    await BridgeController.createCryptoToPixTransfer(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  // ── Exchange Rate ─────────────────────────

  it("gets exchange rate", async () => {
    const rate = { from_currency: "usd", to_currency: "brl", rate: "5.50" };
    mockService.getExchangeRate.mockResolvedValue(rate);

    const req = mockReq({
      query: { from: "usd", to: "brl" },
    });
    const res = mockRes();
    await BridgeController.getExchangeRate(req, res);

    expect(mockService.getExchangeRate).toHaveBeenCalledWith("usd", "brl");
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, exchange_rate: rate }),
    );
  });

  it("estimates payout", async () => {
    const rate = { from_currency: "usd", to_currency: "brl", rate: "5.50" };
    mockService.getExchangeRate.mockResolvedValue(rate);

    const req = mockReq({
      body: { amount: "100", source_currency: "usd", destination_currency: "brl" },
    });
    const res = mockRes();
    await BridgeController.estimatePayout(req, res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        estimate: expect.objectContaining({
          source_amount: "100",
          destination_amount: "550.00",
          is_estimate: true,
        }),
      }),
    );
  });

  // ── Virtual Account ───────────────────────

  it("creates a BRL virtual account", async () => {
    const vAccount = { id: "va_001", status: "activated" };
    mockService.createBrlVirtualAccount.mockResolvedValue(vAccount);

    const req = mockReq({
      params: { id: "cust_123" },
      body: { destination_wallet: "GABC...", destination_chain: "stellar" },
    });
    const res = mockRes();
    await BridgeController.createBrlVirtualAccount(req, res);

    expect(mockService.createBrlVirtualAccount).toHaveBeenCalledWith(
      "cust_123",
      "GABC...",
      "stellar",
      undefined,
    );
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it("loads a USD virtual account from short-link context and DB cache", async () => {
    mockService.listVirtualAccounts.mockResolvedValue([]);
    mockService.getVirtualAccountActivity.mockResolvedValue([
      {
        id: "event_001",
        type: "funds_received",
        amount: "250.00",
        currency: "usd",
        virtual_account_id: "va_001",
      },
    ]);

    const fromMock = supabase.from as any;
    const originalImplementation = fromMock.getMockImplementation();
    fromMock.mockImplementation((table: string) => {
      if (table === "short_links") {
        return supabaseBuilder({
          maybeSingleData: {
            code: "wtuBS4frJ0un",
            session_id: "whatsapp-session-001",
            url: "https://www.talktostellar.com/wire-onramp?short_link_code=wtuBS4frJ0un",
          },
        });
      }
      if (table === "agent_sessions") {
        return supabaseBuilder({
          maybeSingleData: {
            session_id: "whatsapp-session-001",
            email: "rodtretinha@gmail.com",
            user_id: "rodtretinha@gmail.com",
          },
        });
      }
      if (table === "bridge_customers") {
        return supabaseBuilder({
          maybeSingleData: {
            bridge_customer_id: "cust_001",
            kyc_status: "approved",
            status: "active",
          },
        });
      }
      if (table === "bridge_va_cache") {
        return supabaseBuilder({
          listData: [
            {
              id: "va_001",
              customer_id: "cust_001",
              status: "activated",
              source_deposit_instructions: {
                bank_name: "Lead Bank",
                bank_routing_number: "101019644",
                bank_account_number: "214921413117",
                currency: "usd",
                payment_rails: ["ach_push", "fednow", "wire"],
              },
              destination: { chain: "base", address: "0x19edf064c5" },
            },
          ],
        });
      }
      if (table === "wallets") {
        return supabaseBuilder({ maybeSingleData: null });
      }
      return supabaseBuilder({});
    });

    try {
      const req = mockReq({ query: { short_link_code: "wtuBS4frJ0un" } });
      const res = mockRes();
      await BridgeController.getSessionUsdAccount(req, res);

      expect(mockService.listVirtualAccounts).toHaveBeenCalledWith("cust_001");
      expect(mockService.getVirtualAccountActivity).toHaveBeenCalledWith(
        "cust_001",
        "va_001",
        { limit: 100 },
      );
      expect(res.status).not.toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          has_account: true,
          customer_id: "cust_001",
          email: "rodtretinha@gmail.com",
          lookup_source: "short_link",
          virtual_account_source: "db_cache",
          virtual_accounts: [
            expect.objectContaining({
              id: "va_001",
              currency: "USD",
              total_received_usd: 250,
              balance_summaries: [
                expect.objectContaining({
                  amount: "250.00",
                  currency: "USD",
                  source: "activity",
                }),
              ],
            }),
          ],
        }),
      );
    } finally {
      fromMock.mockImplementation(originalImplementation);
    }
  });

  it("summarizes virtual account received funds when no live balance is exposed", async () => {
    mockService.getVirtualAccount.mockResolvedValue({
      id: "va_001",
      status: "activated",
      source_currency: "usd",
      destination: { payment_rail: "base", bridge_wallet_id: "wallet_001" },
    });
    mockService.getVirtualAccountActivity.mockResolvedValue([
      {
        id: "event_001",
        type: "funds_received",
        amount: "125.50",
        currency: "usd",
        virtual_account_id: "va_001",
      },
      {
        id: "event_002",
        type: "payment_submitted",
        amount: "125.50",
        currency: "usdc",
        virtual_account_id: "va_001",
      },
    ]);
    mockService.getWalletBalances.mockResolvedValue([]);

    const req = mockReq({ params: { id: "cust_123", virtualAccountId: "va_001" } });
    const res = mockRes();
    await BridgeController.getVirtualAccountBalance(req, res);

    expect(mockService.getVirtualAccount).toHaveBeenCalledWith("cust_123", "va_001");
    expect(mockService.getVirtualAccountActivity).toHaveBeenCalledWith(
      "cust_123",
      "va_001",
      { limit: 100 },
    );
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        balances: expect.arrayContaining([
          expect.objectContaining({
            amount: "125.50",
            currency: "USD",
            source: "activity",
            label: "Received via activity",
          }),
        ]),
      }),
    );
  });

  it("returns virtual account activity totals even when live wallet lookups fail", async () => {
    mockService.getVirtualAccount.mockRejectedValue(new Error("Bridge wallet not found"));
    mockService.getVirtualAccountActivity.mockResolvedValue([
      {
        id: "event_001",
        type: "funds_received",
        deposit_id: "deposit_001",
        amount: "250.00",
        currency: "usd",
        virtual_account_id: "va_001",
      },
      {
        id: "event_002",
        type: "payment_processed",
        deposit_id: "deposit_001",
        amount: "249.00",
        currency: "usdc",
        virtual_account_id: "va_001",
      },
    ]);
    mockService.getWalletBalances.mockRejectedValue(new Error("Bridge wallet not found"));

    const req = mockReq({ params: { id: "cust_123", virtualAccountId: "va_001" } });
    const res = mockRes();
    await BridgeController.getVirtualAccountBalance(req, res);

    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        balances: [
          expect.objectContaining({
            amount: "250.00",
            currency: "USD",
            source: "activity",
          }),
        ],
        warnings: expect.arrayContaining([
          "virtual_account: Bridge wallet not found",
          "wallet_balances: Bridge wallet not found",
        ]),
      }),
    );
  });

  // ── Error paths ───────────────────────────

  it("returns 404 for missing customer", async () => {
    mockService.getCustomer.mockRejectedValue(
      new Error("Not found"),
    );

    const req = mockReq({ params: { id: "nonexistent" } });
    const res = mockRes();
    await BridgeController.getCustomer(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("correctly maps customer readiness states", async () => {
    const customer = {
      id: "cust_123",
      type: "individual",
      kyc_status: "not_started",
      endorsements: [],
    };
    mockService.getCustomer.mockResolvedValue(customer);

    const req = mockReq({ params: { id: "cust_123" } });
    const res = mockRes();
    await BridgeController.getCustomerReadiness(req, res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        readiness: expect.objectContaining({
          status: "needs_kyc",
          pix_ready: false,
        }),
      }),
    );
  });
});
