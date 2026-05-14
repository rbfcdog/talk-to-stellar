import { EtherfuseClient } from '../../integrations/regional-starter-pack/anchors/etherfuse';
import type {
  Customer,
  OffRampTransaction,
  OnRampTransaction,
  Quote,
  SavedFiatAccount,
} from '../../integrations/regional-starter-pack/anchors/types';
import { AnchorError } from '../../integrations/regional-starter-pack/anchors/types';
import { supabase } from '../../config/supabase';
import { ETHERFUSE_TESOURO_ISSUER, getAssetIssuer } from '../../config/assets';
import { AgentRepository } from '../../repositories/agent.repository';
import { WalletInfo, WalletRepository } from '../../repositories/wallet.repository';
import VaultService from '../../services/vault.service';
import { isSessionExpired } from '../../utils/session-expiry';
import { OperationRepository } from '../repository/operation.repository';
import { StellarService } from './stellar.service';
import crypto from 'crypto';

interface InitiatePixDepositInput {
  userId: string;
  publicKey: string;
  assetCode?: string;
  amount: string;
}

interface RampSessionInput {
  session_id?: string;
  sessionId?: string;
  session_token?: string;
  sessionToken?: string;
}

interface SessionWalletContext {
  sessionId: string;
  sessionToken: string;
  userId: string;
  email?: string;
  publicKey: string;
  vaultSecretId?: string;
  wallet?: WalletInfo | null;
}

interface CustomerForSessionInput extends RampSessionInput {
  email?: string;
  country?: string;
}

interface QuoteForSessionInput extends RampSessionInput {
  customer_id?: string;
  customerId?: string;
  direction?: 'onramp' | 'offramp';
  amount?: string;
  from_amount?: string;
  fromCurrency?: string;
  from_currency?: string;
  toCurrency?: string;
  to_currency?: string;
}

interface CreateOnRampForSessionInput extends RampSessionInput {
  customer_id?: string;
  customerId?: string;
  quote_id?: string;
  quoteId?: string;
  amount?: string;
  to_currency?: string;
  toCurrency?: string;
  bank_account_id?: string;
  bankAccountId?: string;
  memo?: string;
}

interface CreateOffRampForSessionInput extends RampSessionInput {
  customer_id?: string;
  customerId?: string;
  quote_id?: string;
  quoteId?: string;
  amount?: string;
  fiat_account_id?: string;
  fiatAccountId?: string;
  bank_account_id?: string;
  bankAccountId?: string;
  memo?: string;
}

interface SubmitOffRampForSessionInput extends RampSessionInput {
  order_id?: string;
  orderId?: string;
  unsigned_xdr?: string;
  unsignedXdr?: string;
  operation_id?: string;
  operationId?: string;
}

interface TrustlineResult {
  success: boolean;
  existing: boolean;
  asset_code: string;
  asset_issuer: string;
  hash?: string;
  error?: string;
}

interface ResolveWalletByEmailInput {
  email?: string;
}

function apiError(message: string, statusCode = 400): Error {
  const error = new Error(message) as Error & { statusCode?: number };
  error.statusCode = statusCode;
  return error;
}

function normalizeAmount(value: unknown, label = 'amount'): string {
  const amount = String(value || '').trim().replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(amount) || Number(amount) <= 0) {
    throw apiError(`${label} must be a positive decimal amount.`, 400);
  }
  return amount;
}

function coalesceString(...values: unknown[]): string {
  for (const value of values) {
    const normalized = String(value || '').trim();
    if (normalized) return normalized;
  }
  return '';
}

function normalizeEtherfuseApiKey(rawValue: unknown): string {
  return String(rawValue || '')
    .trim()
    .replace(/^Bearer\s+/i, '')
    .replace(/^['"]|['"]$/g, '')
    .trim();
}

function mapAnchorStatusToOperationStatus(status: string): string {
  const normalized = String(status || '').toLowerCase();
  if (normalized === 'completed') return 'COMPLETED';
  if (['failed', 'expired', 'cancelled', 'canceled', 'refunded'].includes(normalized)) return 'FAILED';
  if (normalized === 'processing') return 'PROCESSING';
  return 'PENDING';
}

function isTesouroBalance(balance: any): boolean {
  return (
    balance?.asset_type !== 'native' &&
    String(balance?.asset_code || '').toUpperCase() === 'TESOURO' &&
    String(balance?.asset_issuer || '') === AnchorService.getTesouroIssuer()
  );
}

function isRampSandboxEnvironment(apiKey: string, baseUrl: string): boolean {
  return apiKey.startsWith('api_sand:') || baseUrl.includes('.sand.') || baseUrl.includes('sandbox');
}

function isTerminalRampStatus(status: string): boolean {
  return ['completed', 'failed', 'expired', 'cancelled', 'canceled', 'refunded'].includes(
    String(status || '').toLowerCase(),
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeBalances(balances: any[]): Array<{
  asset_code: string;
  asset_issuer?: string;
  balance: string;
}> {
  return (Array.isArray(balances) ? balances : []).map((balance) => ({
    asset_code: String(balance.asset_code || (balance.asset_type === 'native' ? 'XLM' : 'UNKNOWN')).toUpperCase(),
    asset_issuer: balance.asset_issuer,
    balance: String(balance.balance || '0'),
  }));
}

function balanceKey(balance: { asset_code: string; asset_issuer?: string }): string {
  return `${balance.asset_code}:${balance.asset_issuer || 'native'}`;
}

function calculateBalanceDeltas(before: any[], after: any[]): Array<{
  asset_code: string;
  asset_issuer?: string;
  before: string;
  after: string;
  delta: string;
}> {
  const beforeBalances = normalizeBalances(before);
  const afterBalances = normalizeBalances(after);
  const keys = new Set([...beforeBalances.map(balanceKey), ...afterBalances.map(balanceKey)]);

  return Array.from(keys).map((key) => {
    const beforeBalance = beforeBalances.find((balance) => balanceKey(balance) === key);
    const afterBalance = afterBalances.find((balance) => balanceKey(balance) === key);
    const code = afterBalance?.asset_code || beforeBalance?.asset_code || key.split(':')[0];
    const issuer = afterBalance?.asset_issuer || beforeBalance?.asset_issuer;
    const beforeValue = Number(beforeBalance?.balance || 0);
    const afterValue = Number(afterBalance?.balance || 0);
    const delta = afterValue - beforeValue;

    return {
      asset_code: code,
      asset_issuer: issuer,
      before: String(beforeBalance?.balance || '0'),
      after: String(afterBalance?.balance || '0'),
      delta: Number.isFinite(delta) ? delta.toFixed(7).replace(/\.?0+$/, '') : '0',
    };
  });
}

function parseIssuedAssetIdentifier(identifier: string): { code: string; issuer?: string } {
  const [code, issuer] = String(identifier || '').trim().split(':');
  return {
    code: String(code || '').toUpperCase(),
    issuer: issuer ? String(issuer).trim() : undefined,
  };
}

export class AnchorService {
  private static etherfuseClient?: EtherfuseClient;
  private static etherfuseConfigSignature?: string;

  static getTesouroIssuer(): string {
    return getAssetIssuer('TESOURO') || ETHERFUSE_TESOURO_ISSUER;
  }

  static getTesouroIdentifier(): string {
    return `TESOURO:${this.getTesouroIssuer()}`;
  }

  static getRuntimeInfo(): {
    provider: 'etherfuse';
    sandbox: boolean;
    network: string;
    base_url: string;
    asset: { code: 'TESOURO'; issuer: string; identifier: string };
  } {
    const apiKey = normalizeEtherfuseApiKey(coalesceString(
      process.env.ETHERFUSE_API_KEY,
      process.env.ETHERFUSE_SANDBOX_API_KEY,
    ));
    const baseUrl = coalesceString(process.env.ETHERFUSE_BASE_URL) || 'https://api.sand.etherfuse.com';

    return {
      provider: 'etherfuse',
      sandbox: isRampSandboxEnvironment(apiKey, baseUrl),
      network: String(process.env.STELLAR_NETWORK || 'TESTNET').trim().toUpperCase() === 'PUBLIC'
        ? 'Stellar Public'
        : 'Stellar Testnet',
      base_url: baseUrl.replace(/\/$/, ''),
      asset: {
        code: 'TESOURO',
        issuer: this.getTesouroIssuer(),
        identifier: this.getTesouroIdentifier(),
      },
    };
  }

  private static getEtherfuseClient(): EtherfuseClient {
    const apiKey = normalizeEtherfuseApiKey(coalesceString(
      process.env.ETHERFUSE_API_KEY,
      process.env.ETHERFUSE_SANDBOX_API_KEY,
    ));
    if (!apiKey) {
      throw apiError('ETHERFUSE_API_KEY is not configured in the backend environment.', 500);
    }
    if (!/^api_[a-z]+:[^:\s]+:[^:\s]+$/.test(apiKey)) {
      throw apiError('ETHERFUSE_API_KEY has an invalid format. Expected api_<environment>:<api_key>:<organization_id> without Bearer.', 500);
    }

    const baseUrl = coalesceString(process.env.ETHERFUSE_BASE_URL) || 'https://api.sand.etherfuse.com';
    const blockchain = coalesceString(process.env.ETHERFUSE_BLOCKCHAIN) || 'stellar';
    const signature = `${baseUrl}|${blockchain}|${apiKey.length}`;

    if (!this.etherfuseClient || this.etherfuseConfigSignature !== signature) {
      this.etherfuseClient = new EtherfuseClient({
        apiKey,
        baseUrl: baseUrl.replace(/\/$/, ''),
        defaultBlockchain: blockchain,
      });
      this.etherfuseConfigSignature = signature;
    }

    return this.etherfuseClient;
  }

  private static async resolveSessionWallet(input: RampSessionInput): Promise<SessionWalletContext> {
    const sessionId = coalesceString(input.session_id, input.sessionId);
    const sessionToken = coalesceString(input.session_token, input.sessionToken);

    if (!sessionId || !sessionToken) {
      throw apiError('session_id and session_token are required for ramp operations.', 401);
    }

    const agentRepository = new AgentRepository(supabase);
    const walletRepository = new WalletRepository(supabase);
    const session = await agentRepository.getSession(sessionId);

    if (!session || String(session.session_token || '') !== sessionToken) {
      throw apiError('Invalid or expired TalkToStellar session.', 401);
    }

    if (isSessionExpired(session)) {
      throw apiError('TalkToStellar session expired. Sign in again before using PIX ramp.', 401);
    }

    const wallet = await walletRepository.getWalletBySession(sessionId);
    const publicKey = coalesceString(session.public_key, wallet?.public_key);
    if (!publicKey) {
      throw apiError('This TalkToStellar session does not have an active wallet.', 409);
    }

    return {
      sessionId,
      sessionToken,
      userId: coalesceString(session.user_id) || sessionId,
      email: coalesceString(session.email) || undefined,
      publicKey,
      vaultSecretId: coalesceString(wallet?.vault_secret_id) || undefined,
      wallet,
    };
  }

  static async resolveWalletByEmail(input: ResolveWalletByEmailInput): Promise<{
    email: string;
    session_id: string;
    session_token: string;
    public_key: string;
    public_key_display: string;
    wallet_found: boolean;
  }> {
    const email = String(input.email || '').trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw apiError('Valid email is required to find a TalkToStellar wallet.', 400);
    }

    const runtime = this.getRuntimeInfo();
    if (!runtime.sandbox) {
      throw apiError('Email wallet lookup is only enabled for Etherfuse sandbox/devnet ramp testing.', 403);
    }

    const { data: sessions, error } = await supabase
      .from('agent_sessions')
      .select('*')
      .ilike('email', email)
      .order('last_activity', { ascending: false, nullsFirst: false })
      .order('updated_at', { ascending: false, nullsFirst: false })
      .limit(5);

    if (error) {
      throw new Error(`Failed to resolve TalkToStellar session by email: ${error.message || JSON.stringify(error)}`);
    }

    const walletRepository = new WalletRepository(supabase);
    let selectedSession: any | null = null;
    let selectedWallet: WalletInfo | null = null;

    for (const session of sessions || []) {
      const wallet = await walletRepository.getWalletBySession(String(session.session_id || ''));
      const publicKey = coalesceString(session.public_key, wallet?.public_key);
      if (publicKey) {
        selectedSession = session;
        selectedWallet = wallet;
        break;
      }
    }

    if (!selectedSession) {
      throw apiError('No TalkToStellar wallet was found for this email. Create or import a wallet first.', 404);
    }

    const sessionId = coalesceString(selectedSession.session_id);
    const sessionToken = coalesceString(selectedSession.session_token) || crypto.randomUUID();
    const publicKey = coalesceString(selectedSession.public_key, selectedWallet?.public_key);

    if (!sessionId || !publicKey) {
      throw apiError('The TalkToStellar account exists but does not have an active wallet session.', 409);
    }

    const { error: updateError } = await supabase
      .from('agent_sessions')
      .update({
        session_token: sessionToken,
        public_key: publicKey,
        last_activity: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('session_id', sessionId);

    if (updateError) {
      throw new Error(`Failed to activate TalkToStellar ramp session: ${updateError.message || JSON.stringify(updateError)}`);
    }

    return {
      email,
      session_id: sessionId,
      session_token: sessionToken,
      public_key: publicKey,
      public_key_display: `${publicKey.slice(0, 7)}...${publicKey.slice(-7)}`,
      wallet_found: true,
    };
  }

  private static async persistRampOperation(input: {
    userId: string;
    type: 'PIX_ONRAMP' | 'PIX_OFFRAMP';
    status?: string;
    amount: string;
    assetCode: string;
    sessionId?: string;
    publicKey?: string;
    context: Record<string, unknown>;
  }): Promise<string | undefined> {
    try {
      const operation = await OperationRepository.create({
        user_id: input.userId,
        type: input.type as any,
        status: (input.status || 'PENDING') as any,
        amount: Number(input.amount),
        asset_code: input.assetCode,
        source_session_id: input.sessionId,
        source_public_key: input.publicKey,
        context: JSON.stringify(input.context),
      } as any);
      return operation.id;
    } catch (error) {
      console.warn('[ramp] Could not persist ramp operation:', error);
      return undefined;
    }
  }

  private static async updateRampOperationStatus(operationId: string | undefined, status: string): Promise<void> {
    if (!operationId) return;
    try {
      await OperationRepository.update(operationId, { status: status as any });
    } catch (error) {
      console.warn(`[ramp] Could not update operation ${operationId}:`, error);
    }
  }

  static async createCustomerForSession(input: CustomerForSessionInput): Promise<{
    customer: Customer;
    kyc_url?: string;
    provider: 'etherfuse';
    rail: 'pix';
    fiat_currency: 'BRL';
    asset: { code: 'TESOURO'; issuer: string; identifier: string };
  }> {
    const context = await this.resolveSessionWallet(input);
    const anchor = this.getEtherfuseClient();
    const customer = await anchor.createCustomer({
      email: coalesceString(input.email, context.email) || undefined,
      country: coalesceString(input.country) || 'BR',
      publicKey: context.publicKey,
    });

    const kycUrl = await anchor.getKycUrl?.(customer.id, context.publicKey, customer.bankAccountId);

    return {
      customer,
      kyc_url: kycUrl,
      provider: 'etherfuse',
      rail: 'pix',
      fiat_currency: 'BRL',
      asset: {
        code: 'TESOURO',
        issuer: this.getTesouroIssuer(),
        identifier: this.getTesouroIdentifier(),
      },
    };
  }

  static async getKycStatusForSession(input: RampSessionInput & { customer_id?: string; customerId?: string }): Promise<{
    customer_id: string;
    status: string;
  }> {
    const context = await this.resolveSessionWallet(input);
    const customerId = coalesceString(input.customer_id, input.customerId);
    if (!customerId) throw apiError('customer_id is required.', 400);

    const status = await this.getEtherfuseClient().getKycStatus(customerId, context.publicKey);
    return { customer_id: customerId, status };
  }

  static async getAssetsForSession(input: RampSessionInput & { currency?: string }): Promise<unknown> {
    const context = await this.resolveSessionWallet(input);
    const currency = coalesceString(input.currency) || 'brl';
    return this.getEtherfuseClient().getAssets(
      coalesceString(process.env.ETHERFUSE_BLOCKCHAIN) || 'stellar',
      currency.toLowerCase(),
      context.publicKey,
    );
  }

  static async listFiatAccountsForSession(input: RampSessionInput & { customer_id?: string; customerId?: string }): Promise<{
    customer_id: string;
    accounts: SavedFiatAccount[];
  }> {
    await this.resolveSessionWallet(input);
    const customerId = coalesceString(input.customer_id, input.customerId);
    if (!customerId) throw apiError('customer_id is required.', 400);

    const accounts = await this.getEtherfuseClient().getFiatAccounts(customerId);
    return { customer_id: customerId, accounts };
  }

  static async getQuoteForSession(input: QuoteForSessionInput): Promise<{
    quote: Quote;
    direction: 'onramp' | 'offramp';
    from_currency: string;
    to_currency: string;
  }> {
    const context = await this.resolveSessionWallet(input);
    const customerId = coalesceString(input.customer_id, input.customerId);
    if (!customerId) throw apiError('customer_id is required.', 400);

    const direction = input.direction === 'offramp' ? 'offramp' : 'onramp';
    const amount = normalizeAmount(coalesceString(input.amount, input.from_amount));
    const fromCurrency = coalesceString(input.from_currency, input.fromCurrency) ||
      (direction === 'offramp' ? this.getTesouroIdentifier() : 'BRL');
    const toCurrency = coalesceString(input.to_currency, input.toCurrency) ||
      (direction === 'offramp' ? 'BRL' : this.getTesouroIdentifier());

    const quote = await this.getEtherfuseClient().getQuote({
      customerId,
      stellarAddress: context.publicKey,
      fromCurrency,
      toCurrency,
      fromAmount: amount,
    });

    return {
      quote,
      direction,
      from_currency: fromCurrency,
      to_currency: toCurrency,
    };
  }

  static async ensureTesouroTrustlineForSession(input: RampSessionInput): Promise<{
    success: boolean;
    existing: boolean;
    asset_code: 'TESOURO';
    asset_issuer: string;
    hash?: string;
    error?: string;
  }> {
    const context = await this.resolveSessionWallet(input);
    return this.ensureIssuedAssetTrustline(context, {
      code: 'TESOURO',
      issuer: this.getTesouroIssuer(),
    }) as Promise<{
      success: boolean;
      existing: boolean;
      asset_code: 'TESOURO';
      asset_issuer: string;
      hash?: string;
      error?: string;
    }>;
  }

  private static async ensureIssuedAssetTrustline(
    context: SessionWalletContext,
    asset: { code: string; issuer?: string },
  ): Promise<TrustlineResult> {
    const code = String(asset.code || '').toUpperCase();
    const issuer = String(asset.issuer || getAssetIssuer(code) || '').trim();
    if (!code || code === 'XLM' || code === 'NATIVE') {
      return { success: true, existing: true, asset_code: 'XLM', asset_issuer: '' };
    }
    if (!issuer) {
      throw apiError(`Issuer for ${code} is not configured; cannot create trustline.`, 409);
    }

    const balances = await StellarService.getAccountBalance(context.publicKey);
    const hasTrustline = balances.some((balance) => (
      balance?.asset_type !== 'native' &&
      String(balance?.asset_code || '').toUpperCase() === code &&
      String(balance?.asset_issuer || '') === issuer
    ));
    if (hasTrustline) {
      return { success: true, existing: true, asset_code: code, asset_issuer: issuer };
    }

    if (!context.vaultSecretId) {
      throw apiError(`Wallet private key is not available in Vault; cannot create ${code} trustline automatically.`, 409);
    }

    const unsignedXdr = await StellarService.buildTrustlineXdr({
      sourcePublicKey: context.publicKey,
      assetCode: code,
      assetIssuer: issuer,
    });
    const secret = await new VaultService(supabase).getSecret(context.vaultSecretId);
    const result = await StellarService.signAndSubmitXdr(context.userId, secret, unsignedXdr, {
      user_id: context.userId,
      type: 'CHANGE_TRUST' as any,
      asset_code: code,
      context: JSON.stringify({
        provider: 'etherfuse',
        rail: 'pix',
        asset_issuer: issuer,
        reason: `${code} trustline before PIX ramp`,
      }),
    } as any);

    if (!result.success) {
      return {
        success: false,
        existing: false,
        asset_code: code,
        asset_issuer: issuer,
        error: result.error,
      };
    }

    return {
      success: true,
      existing: false,
      asset_code: code,
      asset_issuer: issuer,
      hash: result.hash,
    };
  }

  static async createOnRampForSession(input: CreateOnRampForSessionInput): Promise<{
    transaction: OnRampTransaction;
    operation_id?: string;
    trustline: TrustlineResult;
  }> {
    const context = await this.resolveSessionWallet(input);
    const customerId = coalesceString(input.customer_id, input.customerId);
    const quoteId = coalesceString(input.quote_id, input.quoteId);
    const amount = normalizeAmount(input.amount);
    const toCurrency = coalesceString(input.to_currency, input.toCurrency) || this.getTesouroIdentifier();
    const targetAsset = parseIssuedAssetIdentifier(toCurrency);

    if (!customerId) throw apiError('customer_id is required.', 400);
    if (!quoteId) throw apiError('quote_id is required.', 400);

    const trustline = await this.ensureIssuedAssetTrustline(context, {
      code: targetAsset.code || 'TESOURO',
      issuer: targetAsset.issuer || getAssetIssuer(targetAsset.code || 'TESOURO'),
    });
    if (!trustline.success) {
      throw apiError(trustline.error || `Could not create ${targetAsset.code || 'asset'} trustline before on-ramp.`, 409);
    }

    const transaction = await this.getEtherfuseClient().createOnRamp({
      customerId,
      quoteId,
      stellarAddress: context.publicKey,
      fromCurrency: 'BRL',
      toCurrency,
      amount,
      bankAccountId: coalesceString(input.bank_account_id, input.bankAccountId) || undefined,
      memo: coalesceString(input.memo) || undefined,
    });

    const operationId = await this.persistRampOperation({
      userId: context.userId,
      type: 'PIX_ONRAMP',
      amount,
      assetCode: targetAsset.code || 'TESOURO',
      sessionId: context.sessionId,
      publicKey: context.publicKey,
      context: {
        provider: 'etherfuse',
        rail: 'pix',
        direction: 'onramp',
        customer_id: customerId,
        quote_id: quoteId,
        anchor_order_id: transaction.id,
        target_asset: toCurrency,
        payment_instructions: transaction.paymentInstructions,
      },
    });

    return { transaction, operation_id: operationId, trustline };
  }

  static async getOnRampStatus(orderId: string, operationId?: string): Promise<{
    transaction: OnRampTransaction;
  }> {
    const transaction = await this.getEtherfuseClient().getOnRampTransaction(orderId);
    if (!transaction) throw apiError('On-ramp order not found.', 404);

    await this.updateRampOperationStatus(operationId, mapAnchorStatusToOperationStatus(transaction.status));
    return { transaction };
  }

  static async createOffRampForSession(input: CreateOffRampForSessionInput): Promise<{
    transaction: OffRampTransaction;
    operation_id?: string;
  }> {
    const context = await this.resolveSessionWallet(input);
    const customerId = coalesceString(input.customer_id, input.customerId);
    const quoteId = coalesceString(input.quote_id, input.quoteId);
    const amount = normalizeAmount(input.amount);
    let fiatAccountId = coalesceString(
      input.fiat_account_id,
      input.fiatAccountId,
      input.bank_account_id,
      input.bankAccountId,
    );

    if (!customerId) throw apiError('customer_id is required.', 400);
    if (!quoteId) throw apiError('quote_id is required.', 400);

    if (!fiatAccountId) {
      const accounts = await this.getEtherfuseClient().getFiatAccounts(customerId);
      fiatAccountId = accounts[0]?.id || '';
    }
    if (!fiatAccountId) {
      throw apiError('No PIX fiat account registered. Open the Etherfuse onboarding URL and register a PIX account first.', 409);
    }

    const transaction = await this.getEtherfuseClient().createOffRamp({
      customerId,
      quoteId,
      stellarAddress: context.publicKey,
      fromCurrency: this.getTesouroIdentifier(),
      toCurrency: 'BRL',
      amount,
      fiatAccountId,
      memo: coalesceString(input.memo) || undefined,
    });

    const operationId = await this.persistRampOperation({
      userId: context.userId,
      type: 'PIX_OFFRAMP',
      amount,
      assetCode: 'TESOURO',
      sessionId: context.sessionId,
      publicKey: context.publicKey,
      context: {
        provider: 'etherfuse',
        rail: 'pix',
        direction: 'offramp',
        customer_id: customerId,
        quote_id: quoteId,
        anchor_order_id: transaction.id,
        fiat_account_id: fiatAccountId,
      },
    });

    return { transaction, operation_id: operationId };
  }

  static async getOffRampStatus(orderId: string, operationId?: string): Promise<{
    transaction: OffRampTransaction;
    ready_to_sign: boolean;
  }> {
    const transaction = await this.getEtherfuseClient().getOffRampTransaction(orderId);
    if (!transaction) throw apiError('Off-ramp order not found.', 404);

    await this.updateRampOperationStatus(operationId, mapAnchorStatusToOperationStatus(transaction.status));
    return { transaction, ready_to_sign: Boolean(transaction.signableTransaction) };
  }

  static async submitOffRampForSession(input: SubmitOffRampForSessionInput): Promise<{
    success: boolean;
    hash?: string;
    error?: string;
    order_id: string;
  }> {
    const context = await this.resolveSessionWallet(input);
    const orderId = coalesceString(input.order_id, input.orderId);
    if (!orderId) throw apiError('order_id is required.', 400);
    if (!context.vaultSecretId) {
      throw apiError('Wallet private key is not available in Vault; cannot sign off-ramp transaction.', 409);
    }

    const transaction = await this.getEtherfuseClient().getOffRampTransaction(orderId);
    const unsignedXdr = coalesceString(input.unsigned_xdr, input.unsignedXdr, transaction?.signableTransaction);
    if (!unsignedXdr) {
      throw apiError('Etherfuse has not prepared the off-ramp burn transaction yet. Poll status and retry when ready_to_sign=true.', 409);
    }

    const secret = await new VaultService(supabase).getSecret(context.vaultSecretId);
    const result = await StellarService.signAndSubmitXdr(context.userId, secret, unsignedXdr, {
      user_id: context.userId,
      type: 'PAYMENT' as any,
      asset_code: 'TESOURO',
      amount: transaction?.fromAmount,
      context: JSON.stringify({
        provider: 'etherfuse',
        rail: 'pix',
        direction: 'offramp',
        anchor_order_id: orderId,
        source_public_key: context.publicKey,
      }),
    } as any);

    if (result.success) {
      await this.updateRampOperationStatus(coalesceString(input.operation_id, input.operationId), 'PROCESSING');
    }

    return { ...result, order_id: orderId };
  }

  static async simulateFiatReceivedForSession(input: RampSessionInput & { order_id?: string; orderId?: string }): Promise<{
    order_id: string;
    upstream_status: number;
    success: boolean;
  }> {
    await this.resolveSessionWallet(input);
    const orderId = coalesceString(input.order_id, input.orderId);
    if (!orderId) throw apiError('order_id is required.', 400);

    const status = await this.getEtherfuseClient().simulateFiatReceived(orderId);
    return { order_id: orderId, upstream_status: status, success: status >= 200 && status < 300 };
  }

  static async getWalletBalancesForSession(input: RampSessionInput): Promise<{
    public_key: string;
    balances: Array<{ asset_code: string; asset_issuer?: string; balance: string }>;
  }> {
    const context = await this.resolveSessionWallet(input);
    const balances = await StellarService.getAccountBalance(context.publicKey);
    return {
      public_key: context.publicKey,
      balances: normalizeBalances(balances),
    };
  }

  static async runTemporarySandboxOnRampTest(input: RampSessionInput & {
    amount?: string;
    to_currency?: string;
    toCurrency?: string;
  }): Promise<{
    success: boolean;
    temporary: true;
    sandbox: boolean;
    wallet_public_key: string;
    amount_brl: string;
    customer: Customer;
    quote: Quote;
    transaction: OnRampTransaction;
    final_transaction?: OnRampTransaction;
    simulation: { order_id: string; upstream_status: number; success: boolean };
    balances_before: Array<{ asset_code: string; asset_issuer?: string; balance: string }>;
    balances_after: Array<{ asset_code: string; asset_issuer?: string; balance: string }>;
    balance_delta: Array<{ asset_code: string; asset_issuer?: string; before: string; after: string; delta: string }>;
  }> {
    const runtime = this.getRuntimeInfo();
    if (!runtime.sandbox) {
      throw apiError('Temporary PIX on-ramp test endpoint is available only in Etherfuse sandbox/devnet.', 403);
    }

    const context = await this.resolveSessionWallet(input);
    const amount = normalizeAmount(input.amount || '100');
    const toCurrencyInput = coalesceString(input.to_currency, input.toCurrency) || this.getTesouroIdentifier();
    const beforeRaw = await StellarService.getAccountBalance(context.publicKey);
    const balancesBefore = normalizeBalances(beforeRaw);

    const customerResult = await this.createCustomerForSession({
      session_id: context.sessionId,
      session_token: context.sessionToken,
      country: 'BR',
    });
    const quoteResult = await this.getQuoteForSession({
      session_id: context.sessionId,
      session_token: context.sessionToken,
      customer_id: customerResult.customer.id,
      direction: 'onramp',
      amount,
      from_currency: 'BRL',
      to_currency: toCurrencyInput,
    });
    const orderResult = await this.createOnRampForSession({
      session_id: context.sessionId,
      session_token: context.sessionToken,
      customer_id: customerResult.customer.id,
      quote_id: quoteResult.quote.id,
      amount,
      to_currency: quoteResult.quote.toCurrency,
      bank_account_id: customerResult.customer.bankAccountId,
    });

    const simulation = await this.simulateFiatReceivedForSession({
      session_id: context.sessionId,
      session_token: context.sessionToken,
      order_id: orderResult.transaction.id,
    });

    let finalTransaction: OnRampTransaction | undefined = orderResult.transaction;
    for (let attempt = 0; attempt < 6; attempt += 1) {
      await sleep(1500);
      const statusResult = await this.getOnRampStatus(orderResult.transaction.id, orderResult.operation_id);
      finalTransaction = statusResult.transaction;
      if (isTerminalRampStatus(finalTransaction.status)) {
        break;
      }
    }

    const afterRaw = await StellarService.getAccountBalance(context.publicKey);
    const balancesAfter = normalizeBalances(afterRaw);

    return {
      success: true,
      temporary: true,
      sandbox: true,
      wallet_public_key: context.publicKey,
      amount_brl: amount,
      customer: customerResult.customer,
      quote: quoteResult.quote,
      transaction: orderResult.transaction,
      final_transaction: finalTransaction,
      simulation,
      balances_before: balancesBefore,
      balances_after: balancesAfter,
      balance_delta: calculateBalanceDeltas(balancesBefore, balancesAfter),
    };
  }

  static async runTemporarySandboxOffRampTest(input: RampSessionInput & {
    amount?: string;
    customer_id?: string;
    customerId?: string;
    fiat_account_id?: string;
    fiatAccountId?: string;
  }): Promise<{
    success: boolean;
    temporary: true;
    sandbox: boolean;
    ready_to_sign: boolean;
    submitted: boolean;
    wallet_public_key: string;
    amount_tesouro: string;
    customer: Customer;
    fiat_account_id?: string;
    quote?: Quote;
    transaction?: OffRampTransaction;
    final_transaction?: OffRampTransaction;
    submit_result?: { success: boolean; hash?: string; error?: string; order_id: string };
    balances_before: Array<{ asset_code: string; asset_issuer?: string; balance: string }>;
    balances_after: Array<{ asset_code: string; asset_issuer?: string; balance: string }>;
    balance_delta: Array<{ asset_code: string; asset_issuer?: string; before: string; after: string; delta: string }>;
  }> {
    const runtime = this.getRuntimeInfo();
    if (!runtime.sandbox) {
      throw apiError('Temporary PIX off-ramp test endpoint is available only in Etherfuse sandbox/devnet.', 403);
    }

    const context = await this.resolveSessionWallet(input);
    const amount = normalizeAmount(input.amount || '1');
    const beforeRaw = await StellarService.getAccountBalance(context.publicKey);
    const balancesBefore = normalizeBalances(beforeRaw);

    const customerIdInput = coalesceString(input.customer_id, input.customerId);
    const customerResult = customerIdInput
      ? {
          customer: {
            id: customerIdInput,
            kycStatus: 'not_started' as const,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        }
      : await this.createCustomerForSession({
          session_id: context.sessionId,
          session_token: context.sessionToken,
          country: 'BR',
        });

    let fiatAccountId = coalesceString(input.fiat_account_id, input.fiatAccountId);
    if (!fiatAccountId) {
      const accounts = await this.getEtherfuseClient().getFiatAccounts(customerResult.customer.id);
      fiatAccountId = accounts[0]?.id || '';
    }
    if (!fiatAccountId) {
      throw apiError('No PIX fiat account registered for off-ramp test. Open the Etherfuse KYC/PIX URL and register a PIX account first.', 409);
    }

    const quoteResult = await this.getQuoteForSession({
      session_id: context.sessionId,
      session_token: context.sessionToken,
      customer_id: customerResult.customer.id,
      direction: 'offramp',
      amount,
      from_currency: this.getTesouroIdentifier(),
      to_currency: 'BRL',
    });

    const orderResult = await this.createOffRampForSession({
      session_id: context.sessionId,
      session_token: context.sessionToken,
      customer_id: customerResult.customer.id,
      quote_id: quoteResult.quote.id,
      amount,
      fiat_account_id: fiatAccountId,
    });

    let statusResult = await this.getOffRampStatus(orderResult.transaction.id, orderResult.operation_id);
    for (let attempt = 0; attempt < 6 && !statusResult.ready_to_sign; attempt += 1) {
      await sleep(1500);
      statusResult = await this.getOffRampStatus(orderResult.transaction.id, orderResult.operation_id);
    }

    let submitResult: { success: boolean; hash?: string; error?: string; order_id: string } | undefined;
    let finalTransaction = statusResult.transaction;
    if (statusResult.ready_to_sign) {
      submitResult = await this.submitOffRampForSession({
        session_id: context.sessionId,
        session_token: context.sessionToken,
        order_id: orderResult.transaction.id,
        operation_id: orderResult.operation_id,
      });

      for (let attempt = 0; attempt < 6; attempt += 1) {
        await sleep(1500);
        const nextStatus = await this.getOffRampStatus(orderResult.transaction.id, orderResult.operation_id);
        finalTransaction = nextStatus.transaction;
        if (isTerminalRampStatus(finalTransaction.status)) {
          break;
        }
      }
    }

    const afterRaw = await StellarService.getAccountBalance(context.publicKey);
    const balancesAfter = normalizeBalances(afterRaw);

    return {
      success: true,
      temporary: true,
      sandbox: true,
      ready_to_sign: statusResult.ready_to_sign,
      submitted: Boolean(submitResult?.success),
      wallet_public_key: context.publicKey,
      amount_tesouro: amount,
      customer: customerResult.customer as Customer,
      fiat_account_id: fiatAccountId,
      quote: quoteResult.quote,
      transaction: orderResult.transaction,
      final_transaction: finalTransaction,
      submit_result: submitResult,
      balances_before: balancesBefore,
      balances_after: balancesAfter,
      balance_delta: calculateBalanceDeltas(balancesBefore, balancesAfter),
    };
  }

  static async initiatePixDeposit(input: InitiatePixDepositInput): Promise<{
    depositUrl: string;
    operationId?: string;
    customerId: string;
    quote: Quote;
    transaction: OnRampTransaction;
  }> {
    const { userId, publicKey } = input;
    const amount = normalizeAmount(input.amount);
    const assetCode = coalesceString(input.assetCode) || 'TESOURO';
    if (assetCode.toUpperCase() !== 'TESOURO') {
      throw apiError('Etherfuse PIX devnet on-ramp settles into TESOURO. Use assetCode=TESOURO.', 400);
    }

    try {
      const anchor = this.getEtherfuseClient();
      const customer = await anchor.createCustomer({ country: 'BR', publicKey });
      const quote = await anchor.getQuote({
        customerId: customer.id,
        stellarAddress: publicKey,
        fromCurrency: 'BRL',
        toCurrency: this.getTesouroIdentifier(),
        fromAmount: amount,
      });
      const transaction = await anchor.createOnRamp({
        customerId: customer.id,
        quoteId: quote.id,
        stellarAddress: publicKey,
        fromCurrency: 'BRL',
        toCurrency: this.getTesouroIdentifier(),
        amount,
        bankAccountId: customer.bankAccountId,
      });

      const operationId = await this.persistRampOperation({
        userId,
        type: 'PIX_ONRAMP',
        amount,
        assetCode: 'TESOURO',
        publicKey,
        context: {
          provider: 'etherfuse',
          rail: 'pix',
          direction: 'onramp',
          customer_id: customer.id,
          quote_id: quote.id,
          anchor_order_id: transaction.id,
          payment_instructions: transaction.paymentInstructions,
        },
      });

      return {
        depositUrl:
          transaction.interactiveUrl ||
          (transaction.paymentInstructions?.type === 'pix'
            ? transaction.paymentInstructions.pixCode || transaction.paymentInstructions.pixKey
            : undefined) ||
          transaction.id,
        operationId,
        customerId: customer.id,
        quote,
        transaction,
      };
    } catch (error: any) {
      const message = error instanceof AnchorError ? error.message : error?.message || String(error);
      console.error('Erro ao iniciar on-ramp PIX Etherfuse:', message);
      throw apiError(`Falha ao iniciar on-ramp PIX Etherfuse: ${message}`, error?.statusCode || 500);
    }
  }

  static async checkDepositStatus(operationId: string): Promise<{
    status: string;
    message: string;
    transaction?: OnRampTransaction | OffRampTransaction;
  }> {
    try {
      const operation = await OperationRepository.findById(operationId);
      if (!operation) throw apiError('Operacao nao encontrada em nosso sistema.', 404);

      const context = operation.context ? JSON.parse(operation.context) : {};
      const orderId = coalesceString(context.anchor_order_id, context.order_id);
      if (!orderId) {
        throw apiError('ID do pedido Etherfuse nao encontrado no registro da operacao.', 400);
      }

      const direction = coalesceString(context.direction) || 'onramp';
      const transaction = direction === 'offramp'
        ? await this.getEtherfuseClient().getOffRampTransaction(orderId)
        : await this.getEtherfuseClient().getOnRampTransaction(orderId);

      if (!transaction) throw apiError('Pedido Etherfuse nao encontrado.', 404);

      const ourStatus = mapAnchorStatusToOperationStatus(transaction.status);
      if (operation.status !== ourStatus) {
        await this.updateRampOperationStatus(operationId, ourStatus);
      }

      const message = ourStatus === 'COMPLETED'
        ? 'Ramp PIX concluido com sucesso.'
        : `Status atual na Etherfuse: ${transaction.status}.`;

      return { status: ourStatus, message, transaction };
    } catch (error: any) {
      const message = error?.message || String(error);
      console.error('Erro ao verificar status do ramp PIX Etherfuse:', message);
      throw apiError(`Falha ao consultar status do ramp PIX Etherfuse: ${message}`, error?.statusCode || 500);
    }
  }
}
