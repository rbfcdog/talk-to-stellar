import { jest, describe, it, expect, beforeEach } from "@jest/globals";
import type { Request, Response, NextFunction } from "express";
import {
  requireBridgeEnabled,
  requireBridgeMainnetEnabled,
  requireBridgeAuth,
} from "../src/api/middlewares/bridge-mainnet.middleware";

// Mock the bridge service
jest.mock("../src/integrations/bridge", () => ({
  getBridgeService: jest.fn(),
}));

const { getBridgeService } = require("../src/integrations/bridge");

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
  return res as Response;
}

describe("Bridge Mainnet Guards", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("requireBridgeEnabled", () => {
    it("passes when bridge is enabled", () => {
      getBridgeService.mockReturnValue({ enabled: true });
      const next = jest.fn() as NextFunction;
      requireBridgeEnabled(mockReq(), mockRes(), next);
      expect(next).toHaveBeenCalled();
    });

    it("returns 503 when bridge is disabled", () => {
      getBridgeService.mockReturnValue({ enabled: false });
      const res = mockRes();
      const next = jest.fn() as NextFunction;
      requireBridgeEnabled(mockReq(), res, next);
      expect(res.status).toHaveBeenCalledWith(503);
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe("requireBridgeMainnetEnabled", () => {
    it("returns 403 when mainnet movement is disabled", () => {
      getBridgeService.mockReturnValue({
        enabled: true,
        config: { enableMainnetMoneyMovement: false, requireManualConfirmation: false },
      });
      const res = mockRes();
      const next = jest.fn() as NextFunction;
      requireBridgeMainnetEnabled(mockReq(), res, next);
      expect(res.status).toHaveBeenCalledWith(403);
    });

    it("returns 400 when manual confirmation is required but missing", () => {
      getBridgeService.mockReturnValue({
        enabled: true,
        config: { enableMainnetMoneyMovement: true, requireManualConfirmation: true },
      });
      const res = mockRes();
      const next = jest.fn() as NextFunction;
      requireBridgeMainnetEnabled(mockReq({ body: {} }), res, next);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it("passes when confirmed", () => {
      getBridgeService.mockReturnValue({
        enabled: true,
        config: { enableMainnetMoneyMovement: true, requireManualConfirmation: true },
      });
      const next = jest.fn() as NextFunction;
      requireBridgeMainnetEnabled(
        mockReq({ body: { confirm_mainnet: true } }),
        mockRes(),
        next,
      );
      expect(next).toHaveBeenCalled();
    });

    it("passes when confirmation not required", () => {
      getBridgeService.mockReturnValue({
        enabled: true,
        config: { enableMainnetMoneyMovement: true, requireManualConfirmation: false },
      });
      const next = jest.fn() as NextFunction;
      requireBridgeMainnetEnabled(mockReq({ body: {} }), mockRes(), next);
      expect(next).toHaveBeenCalled();
    });
  });

  describe("requireBridgeAuth", () => {
    it("returns 401 when no auth provided", () => {
      delete process.env.INTERNATIONAL_TRANSFER_OPS_SECRET;
      delete process.env.OPS_DASHBOARD_TOKEN;
      const res = mockRes();
      const next = jest.fn() as NextFunction;
      requireBridgeAuth(mockReq(), res, next);
      expect(res.status).toHaveBeenCalledWith(401);
    });

    it("passes with Bearer token", () => {
      process.env.OPS_DASHBOARD_TOKEN = "test-secret";
      const next = jest.fn() as NextFunction;
      requireBridgeAuth(
        mockReq({ headers: { authorization: "Bearer test-secret" } }),
        mockRes(),
        next,
      );
      expect(next).toHaveBeenCalled();
      delete process.env.OPS_DASHBOARD_TOKEN;
    });
  });
});
