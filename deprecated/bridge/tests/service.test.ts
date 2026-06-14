/**
 * Bridge.xyz Service Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BridgeService } from '../src/service';
import { BridgeClient } from '../src/client';
import type { BridgeConfig } from '../src/config';
import type {
  BridgeCustomer,
  BridgeTransfer,
  BridgeVirtualAccount,
  BridgeExternalAccount,
  BridgeKycLink,
  TransferCreateInput,
  VirtualAccountCreateInput,
} from '../src/types';

// ── Helpers ──────────────────────────────────────────────────────

function makeConfig(overrides: Partial<BridgeConfig> = {}): BridgeConfig {
  return {
    apiKey: 'test-key-bridge-12345',
    baseUrl: 'https://api.bridge.xyz/v0',
    webhookSecret: 'whsec_test',
    enabled: true,
    developerFeePercent: '0.30',
    sandbox: true,
    ...overrides,
  };
}

function mockCustomer(overrides: Partial<BridgeCustomer> = {}): BridgeCustomer {
  return {
    id: 'cust_abc123',
    first_name: 'Ada',
    last_name: 'Lovelace',
    email: 'ada@example.com',
    type: 'individual',
    kyc_status: 'approved',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────────

describe('BridgeService', () => {
  let service: BridgeService;

  beforeEach(() => {
    service = new BridgeService(makeConfig());
    // Spy on the client's post/get to avoid real HTTP
    vi.spyOn(BridgeClient.prototype, 'post').mockResolvedValue(undefined);
    vi.spyOn(BridgeClient.prototype, 'get').mockResolvedValue(undefined);
    vi.spyOn(BridgeClient.prototype, 'put').mockResolvedValue(undefined);
    vi.spyOn(BridgeClient.prototype, 'delete').mockResolvedValue(undefined);
  });

  describe('configuration', () => {
    it('throws if API key is missing', () => {
      expect(() => new BridgeService(makeConfig({ apiKey: '' }))).toThrow(
        'Bridge configuration missing: BRIDGE_API_KEY',
      );
    });

    it('returns enabled status', () => {
      expect(service.enabled).toBe(true);
      const disabled = new BridgeService(makeConfig({ enabled: false }));
      expect(disabled.enabled).toBe(false);
    });

    it('returns developer fee percent', () => {
      expect(service.developerFeePercent).toBe('0.30');
      const custom = new BridgeService(makeConfig({ developerFeePercent: '0.50' }));
      expect(custom.developerFeePercent).toBe('0.50');
    });
  });

  describe('customers', () => {
    it('creates a customer', async () => {
      const expected = mockCustomer();
      vi.mocked(BridgeClient.prototype.post).mockResolvedValue(expected);

      const result = await service.createCustomer({
        first_name: 'Ada',
        last_name: 'Lovelace',
        email: 'ada@example.com',
        type: 'individual',
      });

      expect(result).toEqual(expected);
      expect(BridgeClient.prototype.post).toHaveBeenCalledWith(
        '/customers',
        expect.objectContaining({ type: 'individual' }),
        expect.stringContaining('cust_'),
      );
    });

    it('gets a customer by ID', async () => {
      const expected = mockCustomer();
      vi.mocked(BridgeClient.prototype.get).mockResolvedValue(expected);

      const result = await service.getCustomer('cust_abc123');
      expect(result).toEqual(expected);
    });

    it('updates a customer', async () => {
      const expected = mockCustomer({ kyc_status: 'approved' });
      vi.mocked(BridgeClient.prototype.put).mockResolvedValue(expected);

      const result = await service.updateCustomer('cust_abc123', {
        identifying_information: [
          { type: 'cpf', value: '12345678900', issuing_country: 'BR' },
        ],
      });

      expect(result).toEqual(expected);
      expect(BridgeClient.prototype.put).toHaveBeenCalledWith(
        '/customers/cust_abc123',
        expect.objectContaining({
          identifying_information: expect.any(Array),
        }),
      );
    });
  });

  describe('KYC', () => {
    it('creates a KYC link', async () => {
      const expected: BridgeKycLink = {
        id: 'kyc_xyz',
        customer_id: 'cust_abc123',
        url: 'https://bridge.xyz/kyc/xyz',
        status: 'not_started',
        created_at: '2026-01-01T00:00:00Z',
        expires_at: '2026-01-08T00:00:00Z',
      };
      vi.mocked(BridgeClient.prototype.post).mockResolvedValue(expected);

      const result = await service.createKycLink('cust_abc123');
      expect(result).toEqual(expected);
    });
  });

  describe('transfers', () => {
    it('creates a transfer', async () => {
      const expected: BridgeTransfer = {
        id: 'xfer_001',
        state: 'awaiting_funds',
        on_behalf_of: 'cust_abc123',
        amount: '100.00',
        source: { payment_rail: 'pix', currency: 'brl' },
        destination: { payment_rail: 'stellar', currency: 'usdc' },
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      };
      vi.mocked(BridgeClient.prototype.post).mockResolvedValue(expected);

      const input: TransferCreateInput = {
        on_behalf_of: 'cust_abc123',
        source: { payment_rail: 'pix', currency: 'brl' },
        destination: {
          payment_rail: 'stellar',
          currency: 'usdc',
          address: 'GXXX',
        },
      };

      const result = await service.createTransfer(input);
      expect(result).toEqual(expected);
    });

    it('gets a transfer by ID', async () => {
      const expected: BridgeTransfer = {
        id: 'xfer_001',
        state: 'completed',
        on_behalf_of: 'cust_abc123',
        amount: '100.00',
        source: { payment_rail: 'pix', currency: 'brl' },
        destination: { payment_rail: 'stellar', currency: 'usdc' },
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      };
      vi.mocked(BridgeClient.prototype.get).mockResolvedValue(expected);

      const result = await service.getTransfer('xfer_001');
      expect(result).toEqual(expected);
      expect(result.state).toBe('completed');
    });

    it('cancels an awaiting_funds transfer', async () => {
      vi.mocked(BridgeClient.prototype.delete).mockResolvedValue(undefined);
      await service.cancelTransfer('xfer_001');
      expect(BridgeClient.prototype.delete).toHaveBeenCalledWith('/transfers/xfer_001');
    });
  });

  describe('virtual accounts', () => {
    it('creates a virtual account', async () => {
      const expected: BridgeVirtualAccount = {
        id: 'va_001',
        status: 'activated',
        customer_id: 'cust_abc123',
        source_deposit_instructions: {
          currency: 'brl',
          payment_rail: 'pix',
          pix_key: 'test@example.com',
        },
        destination: {
          payment_rail: 'stellar',
          currency: 'usdc',
          address: 'GXXX',
        },
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      };
      vi.mocked(BridgeClient.prototype.post).mockResolvedValue(expected);

      const input: VirtualAccountCreateInput = {
        source: { currency: 'brl' },
        destination: {
          payment_rail: 'stellar',
          currency: 'usdc',
          address: 'GXXX',
        },
        developer_fee_percent: '0.30',
      };

      const result = await service.createVirtualAccount('cust_abc123', input);
      expect(result).toEqual(expected);
      expect(result.status).toBe('activated');
    });
  });

  describe('external accounts', () => {
    it('adds a PIX key', async () => {
      const expected: BridgeExternalAccount = {
        id: 'ea_001',
        customer_id: 'cust_abc123',
        active: true,
        currency: 'brl',
        account_type: 'pix_key',
        pix_key: 'test@example.com',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      };
      vi.mocked(BridgeClient.prototype.post).mockResolvedValue(expected);

      const result = await service.addPixKey(
        'cust_abc123',
        'test@example.com',
        'Ada Lovelace',
      );

      expect(result).toEqual(expected);
      expect(result.account_type).toBe('pix_key');
    });

    it('adds a US bank account', async () => {
      const expected: BridgeExternalAccount = {
        id: 'ea_002',
        customer_id: 'cust_abc123',
        active: true,
        currency: 'usd',
        account_type: 'us',
        account: { last_4: '9123', routing_number: '101019644' },
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      };
      vi.mocked(BridgeClient.prototype.post).mockResolvedValue(expected);

      const result = await service.addUsBankAccount('cust_abc123', {
        firstName: 'Ada',
        lastName: 'Lovelace',
        routingNumber: '101019644',
        accountNumber: '215268129123',
        accountType: 'checking',
        streetLine1: '923 Folsom Street',
        city: 'San Francisco',
        state: 'CA',
        postalCode: '94107',
      });

      expect(result).toEqual(expected);
    });
  });

  describe('convenience flows', () => {
    it('createPixOnRamp sends correct payload', async () => {
      vi.mocked(BridgeClient.prototype.post).mockResolvedValue({ id: 'va_001' });

      await service.createPixOnRamp('cust_abc123', 'GXXX');

      expect(BridgeClient.prototype.post).toHaveBeenCalledWith(
        expect.stringContaining('/virtual_accounts'),
        expect.objectContaining({
          source: { currency: 'brl' },
          destination: {
            payment_rail: 'stellar',
            currency: 'usdc',
            address: 'GXXX',
          },
          developer_fee_percent: '0.30',
        }),
        expect.any(String),
      );
    });

    it('createPixOffRamp sends correct payload', async () => {
      vi.mocked(BridgeClient.prototype.post).mockResolvedValue({ id: 'xfer_001' });

      await service.createPixOffRamp('cust_abc123', 'GXXX', '100.00', 'ea_pix');

      expect(BridgeClient.prototype.post).toHaveBeenCalledWith(
        '/transfers',
        expect.objectContaining({
          on_behalf_of: 'cust_abc123',
          developer_fee_percent: '0.30',
          source: {
            payment_rail: 'stellar',
            currency: 'usdc',
            from_address: 'GXXX',
          },
          destination: {
            amount: '100.00',
            payment_rail: 'pix',
            currency: 'brl',
            external_account_id: 'ea_pix',
          },
        }),
        expect.any(String),
      );
    });

    it('createAchOffRamp sends correct payload with reference', async () => {
      vi.mocked(BridgeClient.prototype.post).mockResolvedValue({ id: 'xfer_002' });

      await service.createAchOffRamp('cust_abc123', 'GXXX', '50.00', 'ea_bank', 'INV143509');

      expect(BridgeClient.prototype.post).toHaveBeenCalledWith(
        '/transfers',
        expect.objectContaining({
          destination: expect.objectContaining({
            amount: '50.00',
            payment_rail: 'ach',
            currency: 'usd',
            external_account_id: 'ea_bank',
            ach_reference: 'INV143509',
          }),
        }),
        expect.any(String),
      );
    });

    it('createAchOffRamp truncates reference to 10 chars', async () => {
      vi.mocked(BridgeClient.prototype.post).mockResolvedValue({ id: 'xfer_003' });

      await service.createAchOffRamp('cust_abc123', 'GXXX', '50.00', 'ea_bank', 'LONGREFERENCE123');

      const call = vi.mocked(BridgeClient.prototype.post).mock.calls[0];
      const body = call[1] as TransferCreateInput;
      expect(body.destination.ach_reference).toBe('LONGREFERE');
    });
  });
});
