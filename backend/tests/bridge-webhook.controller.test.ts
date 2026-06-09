/**
 * Bridge Webhook Controller Tests
 */

import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import type { Request, Response } from 'express';
import BridgeWebhookController from '../src/api/controllers/bridge-webhook.controller';

// Mock the bridge service
const mockBridgeService = {
  enabled: true,
  config: {
    baseUrl: 'https://api.bridge.xyz/v0',
    sandbox: true,
    webhookSecret: 'whsec_test',
    developerFeePercent: '0.30',
  },
  developerFeePercent: '0.30',
  verifyWebhookSignature: jest.fn(() => true),
  parseWebhookEvent: jest.fn(),
};

jest.mock('../src/integrations/bridge', () => ({
  getBridgeService: () => mockBridgeService,
  initBridgeService: () => mockBridgeService,
}));

function mockReq(body: any, headers: Record<string, string> = {}): Request {
  return {
    body,
    headers,
    get: (name: string) => headers[name.toLowerCase()] || '',
  } as unknown as Request;
}

function mockRes(): Response {
  const res: any = {
    status: jest.fn(() => res),
    json: jest.fn(() => res),
  };
  return res;
}

describe('BridgeWebhookController', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('webhook', () => {
    it('returns 200 for valid webhook event', async () => {
      const event = { id: 'evt_1', type: 'transfer.completed', data: { transfer_id: 'xfer_1' } };
      mockBridgeService.parseWebhookEvent.mockReturnValue(event);

      const req = mockReq(event, { 'x-bridge-signature': 'valid_sig' });
      const res = mockRes();

      await BridgeWebhookController.webhook(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({ success: true, event: 'transfer.completed' });
    });

    it('returns 400 for unparseable event', async () => {
      mockBridgeService.parseWebhookEvent.mockReturnValue(null);

      const req = mockReq({ garbage: true });
      const res = mockRes();

      await BridgeWebhookController.webhook(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('returns 401 for invalid signature', async () => {
      mockBridgeService.verifyWebhookSignature.mockReturnValue(false);
      mockBridgeService.parseWebhookEvent.mockReturnValue(null);

      const req = mockReq({}, { 'x-bridge-signature': 'bad_sig' });
      const res = mockRes();

      await BridgeWebhookController.webhook(req, res);

      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('handles transfer.completed event', async () => {
      const event = { id: 'evt_2', type: 'transfer.completed', data: { id: 'xfer_2' } };
      mockBridgeService.parseWebhookEvent.mockReturnValue(event);

      const req = mockReq(event);
      const res = mockRes();

      await BridgeWebhookController.webhook(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
    });

    it('handles customer.kyc_approved event', async () => {
      const event = { id: 'evt_3', type: 'customer.kyc_approved', data: { customer_id: 'cust_1' } };
      mockBridgeService.parseWebhookEvent.mockReturnValue(event);

      const req = mockReq(event);
      const res = mockRes();

      await BridgeWebhookController.webhook(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
    });
  });

  describe('health', () => {
    it('returns bridge service status', async () => {
      const req = mockReq({});
      const res = mockRes();

      await BridgeWebhookController.health(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        bridge: {
          enabled: true,
          baseUrl: 'https://api.bridge.xyz/v0',
          sandbox: true,
          developerFeePercent: '0.30',
        },
      });
    });
  });
});
