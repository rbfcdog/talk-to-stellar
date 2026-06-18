/**
 * Bridge.xyz Anchor Adapter
 *
 * Production-ready anchor implementation for Bridge (Stripe-owned).
 * Supports 4 rails:
 *   1. PIX on-ramp  (BRL → USDC on Stellar)
 *   2. PIX off-ramp (USDC on Stellar → BRL via PIX)
 *   3. ACH on-ramp  (USD → USDC on Stellar)
 *   4. ACH off-ramp (USDC on Stellar → USD via ACH)
 */

import { BridgeService, getBridgeService } from '../../../bridge';
import type {
  BridgeCustomer,
  BridgeExternalAccount,
  BridgeTransfer,
  BridgeVirtualAccount,
} from '../../../bridge';
import {
  AnchorError,
} from '../types';
import type {
  Anchor,
  AnchorCapabilities,
  CreateCustomerInput,
  CreateOffRampInput,
  CreateOnRampInput,
  Customer,
  GetCustomerInput,
  GetQuoteInput,
  KycRequirements,
  KycStatus,
  KycSubmissionData,
  KycSubmissionResult,
  OffRampTransaction,
  OnRampTransaction,
  Quote,
  RegisterFiatAccountInput,
  RegisteredFiatAccount,
  SavedFiatAccount,
  TokenInfo,
  TransactionStatus,
} from '../types';
import { logger } from '../../../../utils/logger';

// ── Constants ──────────────────────────────────────────────────────

const BRIDGE_TOKENS: readonly TokenInfo[] = [
  {
    symbol: 'USDC',
    name: 'USD Coin',
    issuer: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN',
    description: 'Circle USD Coin on Stellar',
  },
  {
    symbol: 'USDB',
    name: 'Bridge USD',
    issuer: undefined,
    description: 'Bridge native stablecoin (auto-earns yield)',
  },
];

const BRIDGE_CAPABILITIES: AnchorCapabilities = {
  kycUrl: true,
  sandbox: true,
  fiatAccountRegistration: 'inline',
  requiresTos: false,
  requiresOffRampSigning: false,
  deferredOffRampSigning: false,
  requiresBankBeforeQuote: false,
  requiresBlockchainWalletRegistration: false,
  requiresAnchorPayoutSubmission: false,
  kycFlow: 'redirect',
};

const CURRENCIES = ['BRL', 'USD'] as const;
const RAILS = ['pix', 'ach', 'ach_push', 'wire', 'ach_same_day'] as const;

// ── Helpers ────────────────────────────────────────────────────────

function mapBridgeKycToAnchorStatus(kyc: string): KycStatus {
  switch (kyc) {
    case 'approved': return 'approved';
    case 'rejected': return 'rejected';
    case 'pending': return 'pending';
    case 'not_started': return 'not_started';
    case 'update_required': return 'update_required';
    default: return 'not_started';
  }
}

function mapBridgeTransferState(state: string): TransactionStatus {
  switch (state) {
    case 'awaiting_funds': return 'pending';
    case 'pending': return 'processing';
    case 'completed': return 'completed';
    case 'failed': return 'failed';
    case 'cancelled': return 'cancelled';
    default: return 'pending';
  }
}

const FEE_BPS = 30; // 0.30%

// ── BridgeAnchor ───────────────────────────────────────────────────

export class BridgeAnchor implements Anchor {
  readonly name = 'bridge';
  readonly displayName = 'Bridge (Stripe)';
  readonly capabilities = BRIDGE_CAPABILITIES;
  readonly supportedTokens = BRIDGE_TOKENS;
  readonly supportedCurrencies = CURRENCIES as unknown as string[];
  readonly supportedRails = RAILS as unknown as string[];

  private bridge: BridgeService;

  constructor() {
    this.bridge = getBridgeService();
  }

  // ── Customer ──────────────────────────────────────────────────

  async createCustomer(input: CreateCustomerInput): Promise<Customer> {
    const created = await this.bridge.createCustomer({
      email: input.email,
      type: 'individual',
      country: input.country || 'BR',
    });

    return {
      id: created.id,
      email: created.email || input.email,
        kycStatus: mapBridgeKycToAnchorStatus(created.kyc_status || created.status || 'not_started'),
      country: created.country || input.country,
      createdAt: created.created_at,
      updatedAt: created.updated_at,
    };
  }

  async getCustomer(input: GetCustomerInput): Promise<Customer | null> {
    if (!input.customerId) return null;
    try {
      const c = await this.bridge.getCustomer(input.customerId);
      return {
        id: c.id,
        email: c.email || '',
        kycStatus: mapBridgeKycToAnchorStatus(c.kyc_status || c.status || 'not_started'),
        country: c.country,
        createdAt: c.created_at,
        updatedAt: c.updated_at,
      };
    } catch (e: any) {
      if (e?.status === 404) return null;
      throw new AnchorError(e?.message || String(e), 'BRIDGE_GET_CUSTOMER_ERROR', e?.status || 500);
    }
  }

  // ── KYC ───────────────────────────────────────────────────────

  async getKycUrl(customerId: string, _publicKey?: string): Promise<string> {
    const link = await this.bridge.createKycLink(customerId);
    return link.url;
  }

  async getKycStatus(customerId: string): Promise<KycStatus> {
    const c = await this.bridge.getCustomer(customerId);
    return mapBridgeKycToAnchorStatus(c.kyc_status || c.status || 'not_started');
  }

  async getKycRequirements(country?: string): Promise<KycRequirements> {
    const isBr = (country || 'BR').toUpperCase() === 'BR';
    return {
      fields: isBr
        ? [
            { key: 'cpf', label: 'CPF', type: 'text', required: true },
            { key: 'phone', label: 'Phone', type: 'text', required: true },
          ]
        : [
            { key: 'passport', label: 'Passport ID', type: 'text', required: true },
            { key: 'phone', label: 'Phone', type: 'text', required: true },
          ],
      documents: [
        { key: 'selfie', label: 'Selfie', accept: 'image/jpeg,image/png', mode: 'file_upload' as const },
        ...(isBr ? [] : [{ key: 'passport_image', label: 'Passport Image', accept: 'image/jpeg,image/png', mode: 'file_upload' as const }]),
      ],
    };
  }

  async submitKyc(customerId: string, data: KycSubmissionData): Promise<KycSubmissionResult> {
    const updated = await this.bridge.updateCustomer(customerId, {
      identifying_information: [
        {
          type: data.fields.cpf ? 'cpf' : 'passport',
          value: data.fields.cpf || data.fields.passport || '',
          issuing_country: data.fields.country || 'BR',
        },
      ],
      selfies: data.documents.selfie ? [String(data.documents.selfie)] : undefined,
    });

    return {
      customerId: updated.id,
      kycStatus: mapBridgeKycToAnchorStatus(updated.kyc_status || updated.status || 'not_started'),
    };
  }

  // ── Quote ─────────────────────────────────────────────────────

  async getQuote(input: GetQuoteInput): Promise<Quote> {
    // Bridge computes the rate during transfer creation; for quotes,
    // we use the exchange rate endpoint as an estimate.
    const fromCur = input.fromCurrency.toUpperCase();
    const toCur = input.toCurrency.toUpperCase();
    const amount = parseFloat(input.fromAmount || '0');

    let rate = '0';
    try {
      const resp = await fetch(
        `${this.bridge.config.baseUrl}/exchange_rates?from=${encodeURIComponent(fromCur.toLowerCase())}&to=${encodeURIComponent(toCur.toLowerCase())}`,
        { headers: { 'Api-Key': this.bridge.config.apiKey } },
      );
      if (resp.ok) {
        const body = await resp.json() as any;
        rate = String(body?.rate || '0');
      }
    } catch {
      // Fall through with rate=0 — real rate will be applied at transfer time
    }

    const fee = String(amount * (FEE_BPS / 10000));
    const expiresAt = new Date(Date.now() + 30 * 1000).toISOString();

    return {
      id: `bridge_quote_${Date.now()}`,
      fromCurrency: fromCur,
      toCurrency: toCur,
      fromAmount: input.fromAmount || '0',
      toAmount: rate !== '0' ? String(amount * parseFloat(rate)) : '0',
      exchangeRate: rate,
      fee,
      feeBps: String(FEE_BPS),
      provider: 'bridge',
      expiresAt,
      createdAt: new Date().toISOString(),
    };
  }

  // ── PIX On-Ramp (BRL → USDC on Stellar) ──────────────────────

  async createOnRamp(input: CreateOnRampInput): Promise<OnRampTransaction> {
    const rail = input.fromCurrency?.toUpperCase() === 'USD' ? 'ach_push' : 'pix';

    const va = await this.bridge.createVirtualAccount(input.customerId, {
      source: { currency: input.fromCurrency?.toLowerCase() === 'usd' ? 'usd' : 'brl' },
      destination: {
        payment_rail: 'stellar',
        currency: 'usdc',
        address: input.stellarAddress,
      },
      developer_fee_percent: this.bridge.developerFeePercent,
    });

    return this.vaToOnRamp(input, va);
  }

  async getOnRampTransaction(transactionId: string): Promise<OnRampTransaction | null> {
    try {
      const va = await this.bridge.getVirtualAccount(transactionId);
      if (!va) return null;

      return {
        id: va.id,
        customerId: va.customer_id,
        quoteId: '',
        status: va.status === 'activated' ? 'pending' : 'completed',
        fromAmount: '0',
        fromCurrency: va.source_deposit_instructions?.currency === 'brl' ? 'BRL' : 'USD',
        toAmount: '0',
        toCurrency: 'USDC',
        stellarAddress: va.destination?.address || '',
        feeBps: FEE_BPS,
        createdAt: va.created_at,
        updatedAt: va.updated_at,
      };
    } catch (e: any) {
      if (e?.status === 404) return null;
      throw new AnchorError(e?.message || String(e), 'BRIDGE_GET_ONRAMP_ERROR', e?.status || 500);
    }
  }

  // ── PIX / ACH Off-Ramp (USDC → BRL or USD) ───────────────────

  async createOffRamp(input: CreateOffRampInput): Promise<OffRampTransaction> {
    const isUsd = input.toCurrency?.toUpperCase() === 'USD';
    const rail = isUsd ? 'ach' : 'pix';
    const currency = isUsd ? 'usd' : 'brl';

    const transfer = await this.bridge.createTransfer({
      on_behalf_of: input.customerId,
      developer_fee_percent: this.bridge.developerFeePercent,
      source: {
        payment_rail: 'stellar',
        currency: 'usdc',
        from_address: input.stellarAddress,
      },
      destination: {
        amount: input.amount || '0',
        payment_rail: rail,
        currency,
        external_account_id: input.fiatAccountId || '',
      },
    });

    return this.transferToOffRamp(input, transfer);
  }

  async getOffRampTransaction(transactionId: string): Promise<OffRampTransaction | null> {
    try {
      const t = await this.bridge.getTransfer(transactionId);
      if (!t) return null;

      return {
        id: t.id,
        customerId: t.on_behalf_of,
        quoteId: '',
        status: mapBridgeTransferState(t.state),
        fromAmount: t.amount || '0',
        fromCurrency: 'USDC',
        toAmount: t.destination?.amount || '0',
        toCurrency: t.destination?.currency?.toUpperCase() || 'BRL',
        stellarAddress: t.source?.from_address || '',
        feeBps: FEE_BPS,
        feeAmount: t.receipt?.developer_fee || '0',
        stellarTxHash: t.receipt?.destination_tx_hash,
        createdAt: t.created_at,
        updatedAt: t.updated_at,
      };
    } catch (e: any) {
      if (e?.status === 404) return null;
      throw new AnchorError(e?.message || String(e), 'BRIDGE_GET_OFFRAMP_ERROR', e?.status || 500);
    }
  }

  // ── Fiat Accounts ─────────────────────────────────────────────

  async registerFiatAccount(input: RegisterFiatAccountInput): Promise<RegisteredFiatAccount> {
    const isPix = input.account.type === 'pix';
    let external: BridgeExternalAccount;

    if (isPix) {
      const pixAccount = input.account as import('../types').PixFiatAccountInput;
      external = await this.bridge.addPixKey(
        input.customerId,
        pixAccount.pixKey,
        pixAccount.accountHolderName,
      );
    } else {
      // ACH / US bank: use raw properties via any cast since the shared types
      // currently only define SPEI and PIX fiat account inputs.
      const achAccount = input.account as any;
      external = await this.bridge.addUsBankAccount(input.customerId, {
        firstName: (achAccount.accountHolderName || '').split(' ')[0] || '',
        lastName: (achAccount.accountHolderName || '').split(' ').slice(1).join(' ') || '',
        routingNumber: achAccount.routingNumber || '',
        accountNumber: achAccount.accountNumber || achAccount.clabe || '',
        accountType: achAccount.accountType || 'checking',
        streetLine1: achAccount.streetLine1 || '',
        city: achAccount.city || '',
        state: achAccount.state || '',
        postalCode: achAccount.postalCode || '',
      });
    }

    return {
      id: external.id,
      customerId: external.customer_id,
      type: isPix ? 'PIX' : 'ACH',
      status: external.active ? 'active' : 'inactive',
      createdAt: external.created_at,
    };
  }

  async getFiatAccounts(customerId: string): Promise<SavedFiatAccount[]> {
    const accounts = await this.bridge.listExternalAccounts(customerId);
    return accounts.map((a: any) => ({
      id: a.id,
      type: a.account_type === 'pix_key' ? 'PIX' : 'ACH',
      accountNumber: a.pix_key || a.account?.last_4 || '',
      bankName: a.bank_name || 'Bridge',
      accountHolderName: a.account_owner_name || '',
      createdAt: a.created_at,
    }));
  }

  // ── Mapping Helpers ────────────────────────────────────────────

  private vaToOnRamp(input: CreateOnRampInput, va: BridgeVirtualAccount): OnRampTransaction {
    return {
      id: va.id,
      customerId: va.customer_id,
      quoteId: '',
      status: 'pending',
      fromAmount: '0',
      fromCurrency: input.fromCurrency?.toUpperCase() || 'BRL',
      toAmount: '0',
      toCurrency: 'USDC',
      stellarAddress: va.destination?.address || input.stellarAddress,
      paymentInstructions: va.source_deposit_instructions?.pix_key
        ? {
            type: 'pix' as const,
            pixCode: '',
            pixKey: va.source_deposit_instructions.pix_key,
            amount: '0',
            currency: 'BRL',
          }
        : va.source_deposit_instructions?.bank_name
          ? {
              type: 'spei' as const,
              clabe: va.source_deposit_instructions.bank_account_number || '',
              bankName: va.source_deposit_instructions.bank_name,
              beneficiary: va.source_deposit_instructions.bank_beneficiary_name || '',
              amount: '0',
              currency: 'USD',
            }
          : undefined,
      feeBps: FEE_BPS,
      createdAt: va.created_at,
      updatedAt: va.updated_at,
    };
  }

  private transferToOffRamp(input: CreateOffRampInput, t: BridgeTransfer): OffRampTransaction {
    return {
      id: t.id,
      customerId: t.on_behalf_of,
      quoteId: '',
      status: mapBridgeTransferState(t.state),
      fromAmount: t.amount || input.amount || '0',
      fromCurrency: 'USDC',
      toAmount: t.destination?.amount || input.amount || '0',
      toCurrency: t.destination?.currency?.toUpperCase() || 'BRL',
      stellarAddress: t.source?.from_address || input.stellarAddress,
      feeBps: FEE_BPS,
      feeAmount: t.receipt?.developer_fee || '0',
      stellarTxHash: t.receipt?.destination_tx_hash,
      createdAt: t.created_at,
      updatedAt: t.updated_at,
    };
  }
}
