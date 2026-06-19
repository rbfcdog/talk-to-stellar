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
  BridgeStaticMemo,
  BridgeTransfer,
  BridgeVirtualAccount,
  BridgeWebhook,
  BridgeWebhookEvent,
  BridgeWebhookEventType,
  BridgeVirtualAccountEvent,
  BridgeWallet,
  BridgeWalletBalance,
  BridgeWalletChain,
  BridgeWalletTransaction,
  BusinessCustomerCreateInput,
  CustomerCreateInput,
  CustomerUpdateInput,
  ExternalAccountCreateInput,
  StaticMemoCreateInput,
  TransferCreateInput,
  VirtualAccountCreateInput,
} from './types';

/** Bridge requires blockchain_memo for Stellar destinations. Auto-generate if not supplied. */
function resolveStellarMemo(chain: string, provided?: string): string | undefined {
  if (chain !== 'stellar') return provided || undefined;
  return provided?.trim() || String(Math.floor(Math.random() * 9_000_000) + 1_000_000);
}

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
    const res = await this.client.get<{ count: number; data: BridgeCustomer[] }>('/customers', params as Record<string, string>);
    return (res as any).data ?? (res as any) ?? [];
  }

  // ── KYC ───────────────────────────────────────────────────────

  async createKycLink(customerId: string): Promise<BridgeKycLink> {
    return this.client.post(
      `/customers/${encodeURIComponent(customerId)}/kyc_links`,
      {},
      BridgeClient.idempotencyKey('kyc'),
    );
  }

  async createStandaloneKycLink(email: string, type: string, endorsement?: string): Promise<BridgeKycLink> {
    const body: Record<string, string> = { email, type };
    if (endorsement) body.endorsement = endorsement;
    try {
      return await this.client.post('/kyc_links', body, BridgeClient.idempotencyKey(`kyc-${endorsement || 'base'}`));
    } catch (error: any) {
      // Bridge returns 409 with existing_kyc_link when one already exists
      const existing = error?.response?.existing_kyc_link || error?.existing_kyc_link;
      if (existing) return existing as BridgeKycLink;
      if (String(error?.message || '').includes('already been created')) {
        return this.client.post('/kyc_links', body) as Promise<BridgeKycLink>;
      }
      throw error;
    }
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
    const res = await this.client.get<{ data: BridgeTransfer[] }>(
      `/customers/${encodeURIComponent(customerId)}/transfers`,
      params as Record<string, string>,
    );
    return (res as any).data ?? (res as any) ?? [];
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
    const res = await this.client.get<{ data: BridgeVirtualAccount[] }>(
      `/customers/${encodeURIComponent(customerId)}/virtual_accounts`,
    );
    return (res as any).data ?? (res as any) ?? [];
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
    const res = await this.client.get<{ data: BridgeExternalAccount[] }>(
      `/customers/${encodeURIComponent(customerId)}/external_accounts`,
    );
    return (res as any).data ?? (res as any) ?? [];
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
      currency: string;                  // source crypto: usdc | usdt | usdb | pyusd | eurc
      chain: string;                     // source chain: stellar | base | ethereum | solana | ...
      destination_payment_rail?: string; // pix | ach | wire | sepa | spei | faster_payments | bre_b
      destination_currency?: string;     // brl | usd | eur | mxn | gbp | cop
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
    const res = await this.client.get<{ data: BridgeLiquidationAddress[] }>(
      `/customers/${encodeURIComponent(customerId)}/liquidation_addresses`,
    );
    return (res as any).data ?? (res as any) ?? [];
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
    blockchainMemo?: string,
  ): Promise<BridgeVirtualAccount> {
    const memo = resolveStellarMemo(destinationChain, blockchainMemo);
    return this.createVirtualAccount(customerId, {
      source: { currency: 'brl' },
      destination: {
        payment_rail: destinationChain as any,
        currency: 'usdc',
        address: destinationWallet,
        ...(memo ? { blockchain_memo: memo } : {}),
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

  // ── USD Virtual Account (ACH / Wire On-Ramp) ─────────────────

  async createUsdVirtualAccount(
    customerId: string,
    destinationWallet: string,
    destinationChain: string,
    blockchainMemo?: string,
  ): Promise<BridgeVirtualAccount> {
    const memo = resolveStellarMemo(destinationChain, blockchainMemo);
    return this.createVirtualAccount(customerId, {
      source: { currency: 'usd' },
      destination: {
        payment_rail: destinationChain as any,
        currency: 'usdc',
        address: destinationWallet,
        ...(memo ? { blockchain_memo: memo } : {}),
      },
      developer_fee_percent: this.config.developerFeePercent,
    });
  }

  // ── EUR Virtual Account (SEPA On-Ramp) ───────────────────────

  async createEurVirtualAccount(
    customerId: string,
    destinationWallet: string,
    destinationChain: string,
    blockchainMemo?: string,
  ): Promise<BridgeVirtualAccount> {
    const memo = resolveStellarMemo(destinationChain, blockchainMemo);
    return this.createVirtualAccount(customerId, {
      source: { currency: 'eur' },
      destination: {
        payment_rail: destinationChain as any,
        currency: 'usdc',
        address: destinationWallet,
        ...(memo ? { blockchain_memo: memo } : {}),
      },
      developer_fee_percent: this.config.developerFeePercent,
    });
  }

  // ── MXN Virtual Account (SPEI On-Ramp) ───────────────────────

  async createMxnVirtualAccount(
    customerId: string,
    destinationWallet: string,
    destinationChain: string,
    blockchainMemo?: string,
  ): Promise<BridgeVirtualAccount> {
    const memo = resolveStellarMemo(destinationChain, blockchainMemo);
    return this.createVirtualAccount(customerId, {
      source: { currency: 'mxn' },
      destination: {
        payment_rail: destinationChain as any,
        currency: 'usdc',
        address: destinationWallet,
        ...(memo ? { blockchain_memo: memo } : {}),
      },
      developer_fee_percent: this.config.developerFeePercent,
    });
  }

  // ── GBP Virtual Account (Faster Payments On-Ramp) ────────────

  async createGbpVirtualAccount(
    customerId: string,
    destinationWallet: string,
    destinationChain: string,
    blockchainMemo?: string,
  ): Promise<BridgeVirtualAccount> {
    const memo = resolveStellarMemo(destinationChain, blockchainMemo);
    return this.createVirtualAccount(customerId, {
      source: { currency: 'gbp' },
      destination: {
        payment_rail: destinationChain as any,
        currency: 'usdc',
        address: destinationWallet,
        ...(memo ? { blockchain_memo: memo } : {}),
      },
      developer_fee_percent: this.config.developerFeePercent,
    });
  }

  // ── COP Virtual Account (Bre-B On-Ramp) ──────────────────────

  async createCopVirtualAccount(
    customerId: string,
    destinationWallet: string,
    destinationChain: string,
    blockchainMemo?: string,
  ): Promise<BridgeVirtualAccount> {
    const memo = resolveStellarMemo(destinationChain, blockchainMemo);
    return this.createVirtualAccount(customerId, {
      source: { currency: 'cop' },
      destination: {
        payment_rail: destinationChain as any,
        currency: 'usdc',
        address: destinationWallet,
        ...(memo ? { blockchain_memo: memo } : {}),
      },
      developer_fee_percent: this.config.developerFeePercent,
    });
  }

  // ── Wire Off-Ramp ─────────────────────────────────────────────

  async createWireOffRamp(
    customerId: string,
    stellarAddress: string,
    amountUsd: string,
    externalAccountId: string,
    wireMessage?: string,
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
        payment_rail: 'wire',
        currency: 'usd',
        external_account_id: externalAccountId,
        ...(wireMessage ? { wire_message: wireMessage.slice(0, 140) } : {}),
      },
    });
  }

  // ── RTP Off-Ramp ──────────────────────────────────────────────

  async createRtpOffRamp(
    customerId: string,
    stellarAddress: string,
    amountUsd: string,
    externalAccountId: string,
  ): Promise<BridgeTransfer> {
    return this.createTransfer({
      on_behalf_of: customerId,
      developer_fee_percent: this.config.developerFeePercent,
      source: { payment_rail: 'stellar', currency: 'usdc', from_address: stellarAddress },
      destination: { amount: amountUsd, payment_rail: 'rtp', currency: 'usd', external_account_id: externalAccountId },
    });
  }

  // ── FedNow Off-Ramp ───────────────────────────────────────────

  async createFedNowOffRamp(
    customerId: string,
    stellarAddress: string,
    amountUsd: string,
    externalAccountId: string,
  ): Promise<BridgeTransfer> {
    return this.createTransfer({
      on_behalf_of: customerId,
      developer_fee_percent: this.config.developerFeePercent,
      source: { payment_rail: 'stellar', currency: 'usdc', from_address: stellarAddress },
      destination: { amount: amountUsd, payment_rail: 'fednow', currency: 'usd', external_account_id: externalAccountId },
    });
  }

  // ── SEPA Off-Ramp ─────────────────────────────────────────────

  async createSepaOffRamp(
    customerId: string,
    stellarAddress: string,
    amountEur: string,
    externalAccountId: string,
  ): Promise<BridgeTransfer> {
    return this.createTransfer({
      on_behalf_of: customerId,
      developer_fee_percent: this.config.developerFeePercent,
      source: { payment_rail: 'stellar', currency: 'usdc', from_address: stellarAddress },
      destination: { amount: amountEur, payment_rail: 'sepa', currency: 'eur', external_account_id: externalAccountId },
    });
  }

  // ── SPEI Off-Ramp ─────────────────────────────────────────────

  async createSpeiOffRamp(
    customerId: string,
    stellarAddress: string,
    amountMxn: string,
    externalAccountId: string,
  ): Promise<BridgeTransfer> {
    return this.createTransfer({
      on_behalf_of: customerId,
      developer_fee_percent: this.config.developerFeePercent,
      source: { payment_rail: 'stellar', currency: 'usdc', from_address: stellarAddress },
      destination: { amount: amountMxn, payment_rail: 'spei', currency: 'mxn', external_account_id: externalAccountId },
    });
  }

  // ── IBAN External Account (SEPA) ──────────────────────────────

  async addIbanAccount(
    customerId: string,
    input: {
      firstName: string;
      lastName: string;
      iban: string;
      bic?: string;
      bankName?: string;
      currency?: string;
    },
  ): Promise<BridgeExternalAccount> {
    return this.createExternalAccount(customerId, {
      currency: (input.currency || 'eur') as any,
      account_type: 'iban',
      account_owner_type: 'individual',
      account_owner_name: `${input.firstName} ${input.lastName}`,
      first_name: input.firstName,
      last_name: input.lastName,
      bank_name: input.bankName,
      iban: { iban: input.iban, bic: input.bic },
    });
  }

  // ── CLABE External Account (SPEI) ─────────────────────────────

  async addClabeAccount(
    customerId: string,
    input: {
      firstName: string;
      lastName: string;
      clabe: string;
      bankName?: string;
    },
  ): Promise<BridgeExternalAccount> {
    return this.createExternalAccount(customerId, {
      currency: 'mxn',
      account_type: 'clabe',
      account_owner_type: 'individual',
      account_owner_name: `${input.firstName} ${input.lastName}`,
      first_name: input.firstName,
      last_name: input.lastName,
      bank_name: input.bankName,
      clabe: { clabe: input.clabe },
    });
  }

  // ── Business Customer ─────────────────────────────────────────

  async createBusinessCustomer(input: BusinessCustomerCreateInput): Promise<BridgeCustomer> {
    return this.client.post('/customers', input, BridgeClient.idempotencyKey('biz'));
  }

  // ── List All Transfers ────────────────────────────────────────

  async listAllTransfers(params?: { starting_after?: string; limit?: number }): Promise<BridgeTransfer[]> {
    const res = await this.client.get<{ data: BridgeTransfer[] }>(
      '/transfers',
      params as Record<string, string>,
    );
    return (res as any).data ?? (res as any) ?? [];
  }

  // ── Webhook Management ────────────────────────────────────────

  async listWebhooks(): Promise<BridgeWebhook[]> {
    const res = await this.client.get<{ data: BridgeWebhook[] }>('/webhooks');
    return (res as any).data ?? (res as any) ?? [];
  }

  async createWebhook(url: string, eventTypes?: BridgeWebhookEventType[]): Promise<BridgeWebhook> {
    return this.client.post(
      '/webhooks',
      { url, event_types: eventTypes },
      BridgeClient.idempotencyKey('wh'),
    );
  }

  async getWebhook(webhookId: string): Promise<BridgeWebhook> {
    return this.client.get(`/webhooks/${encodeURIComponent(webhookId)}`);
  }

  async updateWebhook(webhookId: string, url: string, eventTypes?: BridgeWebhookEventType[]): Promise<BridgeWebhook> {
    return this.client.put(`/webhooks/${encodeURIComponent(webhookId)}`, {
      url,
      event_types: eventTypes,
    });
  }

  async deleteWebhook(webhookId: string): Promise<void> {
    await this.client.delete(`/webhooks/${encodeURIComponent(webhookId)}`);
  }

  // ── Static Memo Management ────────────────────────────────────

  async listStaticMemos(): Promise<BridgeStaticMemo[]> {
    const res = await this.client.get<{ data: BridgeStaticMemo[] }>('/static_memos');
    return (res as any).data ?? (res as any) ?? [];
  }

  async createStaticMemo(input: StaticMemoCreateInput): Promise<BridgeStaticMemo> {
    return this.client.post('/static_memos', input, BridgeClient.idempotencyKey('memo'));
  }

  async getStaticMemo(memoId: string): Promise<BridgeStaticMemo> {
    return this.client.get(`/static_memos/${encodeURIComponent(memoId)}`);
  }

  async deleteStaticMemo(memoId: string): Promise<void> {
    await this.client.delete(`/static_memos/${encodeURIComponent(memoId)}`);
  }

  async getVirtualAccountActivity(customerId: string, virtualAccountId: string, params?: { limit?: number; starting_after?: string }): Promise<BridgeVirtualAccountEvent[]> {
    const q: Record<string, string> = {};
    if (params?.limit) q.limit = String(params.limit);
    if (params?.starting_after) q.starting_after = params.starting_after;
    const res = await this.client.get<{ data: BridgeVirtualAccountEvent[] }>(
      `/customers/${encodeURIComponent(customerId)}/virtual_accounts/${encodeURIComponent(virtualAccountId)}/activity`,
      q,
    );
    return (res as any).data ?? (res as any) ?? [];
  }

  // ── Bridge Wallets ────────────────────────────────────────────
  // Custodial wallets on base, ethereum, solana, tempo, or tron.
  // Stellar is NOT a supported chain for Bridge Wallets.

  async createWallet(customerId: string, chain: BridgeWalletChain): Promise<BridgeWallet> {
    return this.client.post(
      `/customers/${encodeURIComponent(customerId)}/wallets`,
      { chain },
      BridgeClient.idempotencyKey(`wallet-${customerId}-${chain}`),
    );
  }

  async listWallets(customerId: string): Promise<BridgeWallet[]> {
    const res = await this.client.get<{ wallets: BridgeWallet[] }>(
      `/customers/${encodeURIComponent(customerId)}/wallets`,
    );
    return (res as any).wallets ?? (res as any) ?? [];
  }

  async getWallet(customerId: string, walletId: string): Promise<BridgeWallet> {
    return this.client.get(
      `/customers/${encodeURIComponent(customerId)}/wallets/${encodeURIComponent(walletId)}`,
    );
  }

  async getWalletTransactions(walletId: string, params?: { limit?: number; starting_after?: string }): Promise<BridgeWalletTransaction[]> {
    const q: Record<string, string> = {};
    if (params?.limit) q.limit = String(params.limit);
    if (params?.starting_after) q.starting_after = params.starting_after;
    const res = await this.client.get<{ data: BridgeWalletTransaction[] }>(
      `/wallets/${encodeURIComponent(walletId)}/transactions`,
      q,
    );
    return (res as any).data ?? (res as any) ?? [];
  }

  async getWalletBalances(): Promise<BridgeWalletBalance[]> {
    const res = await this.client.get<{ data: BridgeWalletBalance[] }>('/wallets/balances');
    return (res as any).data ?? (res as any) ?? [];
  }

  async getGlobalWallet(walletId: string): Promise<BridgeWallet> {
    return this.client.get(`/wallets/${encodeURIComponent(walletId)}`);
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
