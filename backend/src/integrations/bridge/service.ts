/**
 * Bridge.xyz Service
 *
 * High-level service for Bridge stablecoin orchestration.
 * Provides PIX on/off-ramp, USD ACH on/off-ramp, and customer management.
 */

import { BridgeClient } from './client';
import { loadBridgeConfig, validateBridgeConfig } from './config';
import type { BridgeConfig } from './config';
import crypto from 'crypto';
import { logger } from '../../utils/logger';
import type {
  BridgeCustomer,
  BridgeExternalAccount,
  BridgeKycLink,
  BridgeLiquidationAddress,
  BridgeTransfer,
  BridgeVirtualAccount,
  BridgeWebhookEvent,
  CustomerCreateInput,
  CustomerUpdateInput,
  ExternalAccountCreateInput,
  TransferCreateInput,
  VirtualAccountCreateInput,
} from './types';

export class BridgeService {
  private client: BridgeClient;
  config: BridgeConfig;

  constructor(configOverride?: Partial<BridgeConfig>) {
    this.config = { ...loadBridgeConfig(), ...configOverride };
    const missing = validateBridgeConfig(this.config);
    if (missing.length > 0) {
      logger.warn(`[bridge] not configured: ${missing.join(', ')}`);
      this.config.enabled = false;
    }
    if (this.config.enabled) {
      logger.info(`[bridge] initialized base_url=${this.config.baseUrl} sandbox=${this.config.sandbox} fee=${this.config.developerFeePercent}%`);
    }
    this.client = new BridgeClient(this.config);
  }

  get enabled(): boolean {
    return this.config.enabled;
  }

  get developerFeePercent(): string {
    return this.config.developerFeePercent;
  }

  // ── Customers ─────────────────────────────────────────────────

  async createCustomer(input: CustomerCreateInput): Promise<BridgeCustomer> {
    return this.client.post('/customers', input, BridgeClient.idempotencyKey('cust'));
  }

  async getCustomer(customerId: string): Promise<BridgeCustomer> {
    return this.client.get(`/customers/${encodeURIComponent(customerId)}`);
  }

  async updateCustomer(
    customerId: string,
    input: CustomerUpdateInput,
  ): Promise<BridgeCustomer> {
    return this.client.put(`/customers/${encodeURIComponent(customerId)}`, input);
  }

  async listCustomers(params?: {
    starting_after?: string;
    limit?: number;
  }): Promise<BridgeCustomer[]> {
    return this.client.get('/customers', params as Record<string, string>);
  }

  // ── KYC ───────────────────────────────────────────────────────

  async createKycLink(customerId: string): Promise<BridgeKycLink> {
    return this.client.post(
      `/customers/${encodeURIComponent(customerId)}/kyc_links`,
      {},
      BridgeClient.idempotencyKey('kyc'),
    );
  }

  async getKycStatus(kycLinkId: string): Promise<BridgeKycLink> {
    return this.client.get(`/kyc_links/${encodeURIComponent(kycLinkId)}`);
  }

  // ── Transfers ─────────────────────────────────────────────────

  async createTransfer(input: TransferCreateInput): Promise<BridgeTransfer> {
    return this.client.post(
      '/transfers',
      input,
      BridgeClient.idempotencyKey('xfer'),
    );
  }

  async getTransfer(transferId: string): Promise<BridgeTransfer> {
    return this.client.get(`/transfers/${encodeURIComponent(transferId)}`);
  }

  async listCustomerTransfers(
    customerId: string,
    params?: { starting_after?: string; limit?: number },
  ): Promise<BridgeTransfer[]> {
    return this.client.get(
      `/customers/${encodeURIComponent(customerId)}/transfers`,
      params as Record<string, string>,
    );
  }

  async cancelTransfer(transferId: string): Promise<void> {
    await this.client.delete(`/transfers/${encodeURIComponent(transferId)}`);
  }

  // ── Virtual Accounts (Persistent Deposit Addresses) ────────────

  async createVirtualAccount(
    customerId: string,
    input: VirtualAccountCreateInput,
  ): Promise<BridgeVirtualAccount> {
    return this.client.post(
      `/customers/${encodeURIComponent(customerId)}/virtual_accounts`,
      input,
      BridgeClient.idempotencyKey('va'),
    );
  }

  async listVirtualAccounts(customerId: string): Promise<BridgeVirtualAccount[]> {
    return this.client.get(
      `/customers/${encodeURIComponent(customerId)}/virtual_accounts`,
    );
  }

  async getVirtualAccount(accountId: string): Promise<BridgeVirtualAccount> {
    return this.client.get(`/virtual_accounts/${encodeURIComponent(accountId)}`);
  }

  async deactivateVirtualAccount(accountId: string): Promise<void> {
    await this.client.post(`/virtual_accounts/${encodeURIComponent(accountId)}/deactivate`);
  }

  async reactivateVirtualAccount(accountId: string): Promise<void> {
    await this.client.post(`/virtual_accounts/${encodeURIComponent(accountId)}/reactivate`);
  }

  // ── External Accounts (Off-Ramp Destinations) ─────────────────

  async createExternalAccount(
    customerId: string,
    input: ExternalAccountCreateInput,
  ): Promise<BridgeExternalAccount> {
    return this.client.post(
      `/customers/${encodeURIComponent(customerId)}/external_accounts`,
      input,
      BridgeClient.idempotencyKey('ea'),
    );
  }

  async listExternalAccounts(customerId: string): Promise<BridgeExternalAccount[]> {
    return this.client.get(
      `/customers/${encodeURIComponent(customerId)}/external_accounts`,
    );
  }

  async getExternalAccount(accountId: string): Promise<BridgeExternalAccount> {
    return this.client.get(`/external_accounts/${encodeURIComponent(accountId)}`);
  }

  async deactivateExternalAccount(accountId: string): Promise<void> {
    await this.client.post(`/external_accounts/${encodeURIComponent(accountId)}/deactivate`);
  }

  async deleteExternalAccount(accountId: string): Promise<void> {
    await this.client.delete(`/external_accounts/${encodeURIComponent(accountId)}`);
  }

  // ── Liquidation Addresses ─────────────────────────────────────

  async createLiquidationAddress(
    customerId: string,
    input: {
      payment_rail: string;
      currency: string;
      external_account_id?: string;
      custom_developer_fee_percent?: string;
    },
  ): Promise<BridgeLiquidationAddress> {
    return this.client.post(
      `/customers/${encodeURIComponent(customerId)}/liquidation_addresses`,
      input,
      BridgeClient.idempotencyKey('liq'),
    );
  }

  async listLiquidationAddresses(
    customerId: string,
  ): Promise<BridgeLiquidationAddress[]> {
    return this.client.get(
      `/customers/${encodeURIComponent(customerId)}/liquidation_addresses`,
    );
  }

  async getLiquidationAddress(
    customerId: string,
    addressId: string,
  ): Promise<BridgeLiquidationAddress> {
    return this.client.get(
      `/customers/${encodeURIComponent(customerId)}/liquidation_addresses/${encodeURIComponent(addressId)}`,
    );
  }

  // ── Convenience: PIX On-Ramp ──────────────────────────────────

  /**
   * Create a PIX deposit address that auto-converts BRL → USDC on Stellar.
   * Returns the PIX key and instructions for the user to send money to.
   */
  async createPixOnRamp(customerId: string, stellarAddress: string): Promise<BridgeVirtualAccount> {
    return this.createVirtualAccount(customerId, {
      source: { currency: 'brl' },
      destination: {
        payment_rail: 'stellar',
        currency: 'usdc',
        address: stellarAddress,
      },
      developer_fee_percent: this.config.developerFeePercent,
    });
  }

  // ── Convenience: PIX Off-Ramp ─────────────────────────────────

  /**
   * Send USDC from a Stellar address to a PIX key as BRL.
   * Requires an external_account_id for the PIX destination.
   */
  async createPixOffRamp(
    customerId: string,
    stellarAddress: string,
    amountBrl: string,
    externalAccountId: string,
  ): Promise<BridgeTransfer> {
    return this.createTransfer({
      on_behalf_of: customerId,
      developer_fee_percent: this.config.developerFeePercent,
      source: {
        payment_rail: 'stellar',
        currency: 'usdc',
        from_address: stellarAddress,
      },
      destination: {
        amount: amountBrl,
        payment_rail: 'pix',
        currency: 'brl',
        external_account_id: externalAccountId,
      },
    });
  }

  // ── Exchange Rates ────────────────────────────────────────────

  async getExchangeRate(
    from: string,
    to: string,
  ): Promise<Record<string, unknown>> {
    return this.client.get(
      `/exchange_rates?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
    );
  }

  // ── Convenience: BRL Virtual Account (PIX On-Ramp) ────────────

  async createBrlVirtualAccount(
    customerId: string,
    destinationWallet: string,
    destinationChain: string,
  ): Promise<BridgeVirtualAccount> {
    return this.createVirtualAccount(customerId, {
      source: { currency: 'brl' },
      destination: {
        payment_rail: destinationChain as any,
        currency: 'usdc',
        address: destinationWallet,
      },
      developer_fee_percent: this.config.developerFeePercent,
    });
  }

  // ── Convenience: USD ACH Off-Ramp ─────────────────────────────

  /**
   * Send USDC from a Stellar address to a US bank account via ACH.
   */
  async createAchOffRamp(
    customerId: string,
    stellarAddress: string,
    amountUsd: string,
    externalAccountId: string,
    reference?: string,
  ): Promise<BridgeTransfer> {
    return this.createTransfer({
      on_behalf_of: customerId,
      developer_fee_percent: this.config.developerFeePercent,
      source: {
        payment_rail: 'stellar',
        currency: 'usdc',
        from_address: stellarAddress,
      },
      destination: {
        amount: amountUsd,
        payment_rail: 'ach',
        currency: 'usd',
        external_account_id: externalAccountId,
        ...(reference ? { ach_reference: reference.slice(0, 10) } : {}),
      },
    });
  }

  // ── Convenience: Add PIX Key ──────────────────────────────────

  /**
   * Register a PIX key as an off-ramp destination for a customer.
   */
  async addPixKey(
    customerId: string,
    pixKey: string,
    ownerName: string,
  ): Promise<BridgeExternalAccount> {
    return this.createExternalAccount(customerId, {
      currency: 'brl',
      account_type: 'pix',
      account_owner_name: ownerName,
      pix_key: { pix_key: pixKey.toLowerCase() } as any,
      account_owner_type: 'individual',
    });
  }

  // ── Convenience: Add US Bank Account ──────────────────────────

  /**
   * Register a US bank account as an off-ramp destination.
   */
  async addUsBankAccount(
    customerId: string,
    input: {
      firstName: string;
      lastName: string;
      routingNumber: string;
      accountNumber: string;
      accountType: 'checking' | 'savings';
      streetLine1: string;
      city: string;
      state: string;
      postalCode: string;
    },
  ): Promise<BridgeExternalAccount> {
    return this.createExternalAccount(customerId, {
      currency: 'usd',
      account_type: 'us',
      first_name: input.firstName,
      last_name: input.lastName,
      account_owner_type: 'individual',
      account_owner_name: `${input.firstName} ${input.lastName}`,
      account: {
        routing_number: input.routingNumber,
        account_number: input.accountNumber,
        checking_or_savings: input.accountType,
      },
      address: {
        street_line_1: input.streetLine1,
        country: 'USA',
        state: input.state,
        city: input.city,
        postal_code: input.postalCode,
      },
    });
  }

  // ── Webhook Verification ──────────────────────────────────────

  /**
   * Verify a Bridge webhook signature.
   * Bridge signs webhooks with HMAC-SHA256 using your webhook secret.
   */
  verifyWebhookSignature(payload: string, signature: string): boolean {
    if (!this.config.webhookSecret) {
      return false;
    }
    const expected = crypto
      .createHmac('sha256', this.config.webhookSecret)
      .update(payload)
      .digest('hex');
    return crypto.timingSafeEqual(
      Buffer.from(expected),
      Buffer.from(signature),
    );
  }

  /**
   * Parse a raw webhook body into a typed event.
   */
  parseWebhookEvent(body: unknown): BridgeWebhookEvent | null {
    try {
      const raw = typeof body === 'string' ? JSON.parse(body) : body;
      const event = raw as Record<string, unknown>;
      if (!event?.id || !event?.type) return null;
      return raw as BridgeWebhookEvent;
    } catch {
      return null;
    }
  }
}

/** Singleton instance, lazily initialized. */
let _instance: BridgeService | null = null;

export function getBridgeService(): BridgeService {
  if (!_instance) {
    _instance = new BridgeService();
  }
  return _instance;
}

/** Initialize the Bridge service at startup. */
export function initBridgeService(): BridgeService {
  _instance = new BridgeService();
  return _instance;
}
