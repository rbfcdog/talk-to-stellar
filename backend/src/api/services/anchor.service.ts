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
import {
  assetMatchesConfiguredIssuer,
  ETHERFUSE_TESOURO_ISSUER,
  getAssetIssuer,
  getUserFacingAssetCodes,
  normalizeAssetCode,
  resolveConfiguredAsset,
} from '../../config/assets';
import { AgentRepository } from '../../repositories/agent.repository';
import { WalletInfo, WalletRepository } from '../../repositories/wallet.repository';
import VaultService from '../../services/vault.service';
import { isSessionExpired } from '../../utils/session-expiry';
import { OperationRepository } from '../repository/operation.repository';
import { PaymentReceiptService } from './payment-receipt.service';
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
  pin?: string;
  wallet_pin?: string;
  walletPin?: string;
  wallet_code?: string;
  walletCode?: string;
  passcode?: string;
}

interface SessionWalletContext {
  sessionId: string;
  sessionToken: string;
  userId: string;
  email?: string;
  publicKey: string;
  vaultSecretId?: string;
  sessionPinHash?: string;
  wallet?: WalletInfo | null;
}

interface ExternalBankAccount {
  id: string;
  session_id: string;
  user_id: string;
  wallet_public_key: string;
  label: string;
  institution: string;
  branch: string;
  account_number: string;
  pix_key: string;
  rail: string;
  country: string;
  currency: string;
  status: string;
  metadata?: Record<string, unknown>;
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
  final_asset?: string;
  finalAsset?: string;
  final_asset_code?: string;
  finalAssetCode?: string;
}

interface CreateOnRampForSessionInput extends RampSessionInput {
  customer_id?: string;
  customerId?: string;
  quote_id?: string;
  quoteId?: string;
  amount?: string;
  expected_to_amount?: string;
  expectedToAmount?: string;
  from_currency?: string;
  fromCurrency?: string;
  to_currency?: string;
  toCurrency?: string;
  final_asset?: string;
  finalAsset?: string;
  final_asset_code?: string;
  finalAssetCode?: string;
  final_currency?: string;
  finalCurrency?: string;
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

interface ExternalBankAccountInput extends RampSessionInput {}

interface SubmitOffRampForSessionInput extends RampSessionInput {
  order_id?: string;
  orderId?: string;
  unsigned_xdr?: string;
  unsignedXdr?: string;
  operation_id?: string;
  operationId?: string;
}

interface PixFundedTransferInput extends RampSessionInput {
  recipient?: string;
  recipient_query?: string;
  recipientQuery?: string;
  amount?: string;
  asset_code?: string;
  assetCode?: string;
  order_id?: string;
  orderId?: string;
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

interface SandboxMockOnRampOrder {
  transaction: OnRampTransaction;
  userId: string;
  sessionId: string;
  publicKey: string;
  vaultSecretId?: string;
  sourceAmountBrl: string;
  destinationAmount: string;
  finalAssetCode: string;
  finalAssetIssuer?: string;
  finalAmount?: string;
  finalConversionHash?: string;
  finalConversionSourceAmount?: string;
  finalConversionError?: string;
  operationId?: string;
  deliveryHash?: string;
  deliverySourceAmount?: string;
  deliveryError?: string;
  upstreamError?: string;
  operationContext?: Record<string, unknown>;
}

interface SandboxMockOffRampOrder {
  transaction: OffRampTransaction;
  userId: string;
  sessionId: string;
  publicKey: string;
  amountTesouro: string;
  operationId?: string;
  submitHash?: string;
  submitError?: string;
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

function toStellarAmount(value: unknown): string {
  const amount = Number(String(value || '0').replace(',', '.'));
  if (!Number.isFinite(amount) || amount <= 0) {
    throw apiError('amount must be a positive decimal amount.', 400);
  }
  return amount.toFixed(7);
}

function formatDisplayAmount(value: unknown, assetCode: string): string {
  const amount = String(value || '0').replace(',', '.');
  return `${amount} ${normalizeAssetCode(assetCode)}`;
}

function truncatePublicKey(value: string): string {
  return value ? `${value.slice(0, 7)}...${value.slice(-7)}` : 'wallet';
}

function hashWalletPin(pin: string): string {
  return crypto
    .pbkdf2Sync(pin, process.env.PIN_SALT || 'salt', 100000, 64, 'sha256')
    .toString('hex');
}

function stableHex(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function buildExternalBankAccountFields(context: SessionWalletContext) {
  const hash = stableHex(`${context.publicKey}:${context.email || context.userId}`);
  const numeric = BigInt(`0x${hash.slice(0, 12)}`).toString().padStart(14, '0');
  const email = String(context.email || '').trim().toLowerCase();
  return {
    label: 'Conta bancária externa TalkToStellar',
    institution: 'Banco externo vinculado',
    branch: numeric.slice(0, 4),
    account_number: `${numeric.slice(4, 11)}-${numeric.slice(11, 12)}`,
    pix_key: email.includes('@') ? email : `pix-${hash.slice(0, 8)}@talktostellar.bank`,
    rail: 'PIX',
    country: 'BR',
    currency: 'BRL',
    status: 'active',
    metadata: {
      generated_for: 'pix_off_ramp',
      deterministic_hash: hash.slice(0, 16),
    },
  };
}

function estimateTesouroFromBrl(amountBrl: string, expectedToAmount?: string): string {
  const expected = Number(String(expectedToAmount || '').replace(',', '.'));
  if (Number.isFinite(expected) && expected > 0) {
    return toStellarAmount(expected);
  }
  const brl = Number(String(amountBrl || '0').replace(',', '.'));
  return toStellarAmount(brl * 0.8665);
}

function formatPixAmount(value: string): string {
  const amount = Number(String(value || '0').replace(',', '.'));
  if (!Number.isFinite(amount) || amount <= 0) {
    throw apiError('PIX amount must be a positive decimal amount.', 400);
  }
  return amount.toFixed(2);
}

function pixTlv(id: string, value: string): string {
  const normalized = String(value || '');
  const length = Buffer.byteLength(normalized, 'utf8');
  if (!/^\d{2}$/.test(id) || length > 99) {
    throw new Error(`Invalid PIX TLV field ${id}.`);
  }
  return `${id}${String(length).padStart(2, '0')}${normalized}`;
}

function sanitizePixText(value: string, maxLength: number): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9 .\-]/g, '')
    .trim()
    .slice(0, maxLength);
}

function sanitizePixTxid(value: string): string {
  const txid = String(value || '')
    .replace(/[^A-Za-z0-9]/g, '')
    .slice(0, 25);
  return txid || '***';
}

function crc16CcittFalse(value: string): string {
  let crc = 0xffff;
  for (const byte of Buffer.from(value, 'utf8')) {
    crc ^= byte << 8;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) : (crc << 1);
      crc &= 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

function buildPixBrCode(input: {
  pixKey: string;
  amount: string;
  merchantName: string;
  merchantCity: string;
  txid: string;
  description?: string;
}): string {
  const merchantAccount = pixTlv('00', 'br.gov.bcb.pix') +
    pixTlv('01', input.pixKey) +
    (input.description ? pixTlv('02', sanitizePixText(input.description, 72)) : '');
  const additionalData = pixTlv('05', sanitizePixTxid(input.txid));
  const payloadWithoutCrc = [
    pixTlv('00', '01'),
    pixTlv('01', '12'),
    pixTlv('26', merchantAccount),
    pixTlv('52', '0000'),
    pixTlv('53', '986'),
    pixTlv('54', formatPixAmount(input.amount)),
    pixTlv('58', 'BR'),
    pixTlv('59', sanitizePixText(input.merchantName, 25) || 'Etherfuse'),
    pixTlv('60', sanitizePixText(input.merchantCity, 15) || 'SAO PAULO'),
    pixTlv('62', additionalData),
    '6304',
  ].join('');

  return `${payloadWithoutCrc}${crc16CcittFalse(payloadWithoutCrc)}`;
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

function mapOperationStatusToRampStatus(status: string): string {
  const normalized = String(status || '').toUpperCase();
  if (normalized === 'COMPLETED' || normalized === 'SUCCESS') return 'completed';
  if (normalized === 'PROCESSING' || normalized === 'FUNDED') return 'processing';
  if (normalized === 'FAILED' || normalized === 'ERROR') return 'failed';
  return 'pending';
}

function parseOperationContext(value: unknown): Record<string, any> {
  if (!value) return {};
  if (typeof value === 'object') return value as Record<string, any>;
  try {
    const parsed = JSON.parse(String(value));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
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

function isDuplicateResourceError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error || '');
  return /already|duplicate|exists|409|conflict/i.test(message);
}

function debugErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error || 'Unknown error');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeBalances(balances: any[]): Array<{
  asset_code: string;
  asset_issuer?: string;
  balance: string;
}> {
  const configuredCodes = new Set(['XLM', ...getUserFacingAssetCodes()]);
  return (Array.isArray(balances) ? balances : [])
    .map((balance) => ({
      asset_code: normalizeAssetCode(balance.asset_code || (balance.asset_type === 'native' ? 'XLM' : 'UNKNOWN')),
      asset_issuer: balance.asset_issuer,
      balance: String(balance.balance || '0'),
    }))
    .filter((balance) => (
      configuredCodes.has(balance.asset_code) &&
      (balance.asset_code === 'XLM' || assetMatchesConfiguredIssuer(balance.asset_code, balance.asset_issuer))
    ));
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
  const normalizedCode = normalizeAssetCode(code || 'TESOURO');
  return {
    code: normalizedCode,
    issuer: issuer ? String(issuer).trim() : getAssetIssuer(normalizedCode),
  };
}

function assetIdentifier(asset: { code: string; issuer?: string }): string {
  const code = normalizeAssetCode(asset.code);
  if (code === 'XLM') return 'XLM';
  const issuer = String(asset.issuer || getAssetIssuer(code) || '').trim();
  return issuer ? `${code}:${issuer}` : code;
}

function sameIssuedAsset(left: { code: string; issuer?: string }, right: { code: string; issuer?: string }): boolean {
  const leftCode = normalizeAssetCode(left.code);
  const rightCode = normalizeAssetCode(right.code);
  if (leftCode !== rightCode) return false;
  if (leftCode === 'XLM') return true;
  return String(left.issuer || getAssetIssuer(leftCode) || '') === String(right.issuer || getAssetIssuer(rightCode) || '');
}

function resolveRampFinalAsset(...values: unknown[]): { code: string; issuer?: string } {
  const raw = coalesceString(...values) || 'TESOURO';
  const parsed = parseIssuedAssetIdentifier(raw);
  const code = normalizeAssetCode(parsed.code || 'TESOURO');
  if (!getUserFacingAssetCodes().includes(code)) {
    throw apiError(`Asset final ${code} não é suportado para PIX ramp. Use BRL, USDC ou TESOURO.`, 400);
  }
  return resolveConfiguredAsset(code, parsed.issuer);
}

export class AnchorService {
  private static etherfuseClient?: EtherfuseClient;
  private static etherfuseConfigSignature?: string;
  private static programmaticOnboardingCache = new Map<string, { cryptoWalletId?: string }>();
  private static sandboxMockOnRampOrders = new Map<string, SandboxMockOnRampOrder>();
  private static sandboxMockOffRampOrders = new Map<string, SandboxMockOffRampOrder>();

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
      sessionPinHash: coalesceString((session as any).session_password_hash, (session as any).password_hash) || undefined,
      wallet,
    };
  }

  private static requireWalletPin(input: RampSessionInput, context: SessionWalletContext): void {
    const pin = coalesceString(
      input.pin,
      input.wallet_pin,
      input.walletPin,
      input.wallet_code,
      input.walletCode,
      input.passcode,
    );
    if (!/^\d{4,8}$/.test(pin)) {
      throw apiError('PIN da wallet é obrigatório para confirmar esta operação.', 400);
    }
    if (!context.sessionPinHash || hashWalletPin(pin) !== context.sessionPinHash) {
      throw apiError('PIN inválido. Tente novamente.', 401);
    }
  }

  static async getOrCreateExternalBankAccountForSession(input: ExternalBankAccountInput): Promise<{
    external_bank_account: ExternalBankAccount;
  }> {
    const context = await this.resolveSessionWallet(input);
    const fields = buildExternalBankAccountFields(context);

    const { data: existing, error: existingError } = await supabase
      .from('external_bank_accounts')
      .select('*')
      .eq('wallet_public_key', context.publicKey)
      .eq('status', 'active')
      .maybeSingle();

    if (existingError && !String(existingError.message || '').toLowerCase().includes('does not exist')) {
      throw new Error(`Failed to load external bank account: ${existingError.message}`);
    }

    if (existing) {
      return { external_bank_account: existing as ExternalBankAccount };
    }

    const row = {
      session_id: context.sessionId,
      user_id: context.userId,
      wallet_public_key: context.publicKey,
      ...fields,
      updated_at: new Date().toISOString(),
    };

    const { data: created, error: createError } = await supabase
      .from('external_bank_accounts')
      .insert(row)
      .select('*')
      .single();

    if (createError) {
      throw new Error(`Failed to create external bank account: ${createError.message}`);
    }

    return { external_bank_account: created as ExternalBankAccount };
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

  private static async notifySandboxOnRampCompleted(record: SandboxMockOnRampOrder, hash?: string): Promise<void> {
    try {
      await PaymentReceiptService.sendReceipt({
        type: 'payment_received',
        sessionId: record.sessionId,
        userId: record.userId,
        counterpartyLabel: 'PIX Etherfuse',
        sourceAmount: record.sourceAmountBrl,
        sourceAssetCode: 'BRL',
        destinationAmount: record.finalAmount || record.destinationAmount,
        destinationAssetCode: record.finalAssetCode || 'BRL',
        hash: hash || record.deliveryHash || null,
        status: 'completed',
        contextMessage: `Escolhemos a melhor rota para essa conversão e entregamos ${record.finalAssetCode || 'BRL'} na sua wallet.`,
      });
    } catch (error) {
      console.warn('[ramp] Could not notify sandbox PIX completion:', debugErrorMessage(error));
    }
  }

  private static isMissingEtherfuseProxyError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error || '');
    return /proxy account not found|bank account not found|account not found/i.test(message);
  }

  private static isExpiredEtherfuseQuoteError(error: unknown): boolean {
    const message = debugErrorMessage(error);
    return /quote (not found|expired)|not found or expired|quote.*expired/i.test(message);
  }

  private static async prepareEtherfusePixProxy(input: {
    customerId: string;
    publicKey: string;
    bankAccountId?: string;
    email?: string;
  }): Promise<{ bankAccountId: string; kycUrl?: string }> {
    const bankAccountId = input.bankAccountId || crypto.randomUUID();
    const anchor = this.getEtherfuseClient();
    const kycUrl = await anchor.getKycUrl?.(
      input.customerId,
      input.publicKey,
      bankAccountId,
      input.email ? { email: input.email, displayName: input.email } : undefined,
    );

    return { bankAccountId, kycUrl };
  }

  private static async getActiveEtherfuseOrganizationBankAccountId(): Promise<string | undefined> {
    const anchor = this.getEtherfuseClient() as EtherfuseClient & {
      getOrganizationFiatAccounts?: () => Promise<Array<SavedFiatAccount & {
        status?: string;
        compliant?: boolean;
        currency?: string;
      }>>;
    };
    if (typeof anchor.getOrganizationFiatAccounts !== 'function') return undefined;

    try {
      const accounts = await anchor.getOrganizationFiatAccounts();
      const active = accounts.find((account) =>
        String(account.status || '').toLowerCase() === 'active' &&
        account.compliant !== false
      );
      return active?.id;
    } catch (error) {
      console.warn('[ramp] Could not list Etherfuse organization bank accounts:', debugErrorMessage(error));
      return undefined;
    }
  }

  private static missingProxySetupError(
    message: string,
    kycUrl?: string,
    bankAccountId?: string,
    programmaticOnboarding?: Record<string, unknown>,
  ): Error {
    const error = apiError(message, 409) as Error & {
      kyc_url?: string;
      bank_account_id?: string;
      programmatic_onboarding?: Record<string, unknown>;
    };
    if (kycUrl) error.kyc_url = kycUrl;
    if (bankAccountId) error.bank_account_id = bankAccountId;
    if (programmaticOnboarding) error.programmatic_onboarding = programmaticOnboarding;
    return error;
  }

  private static sandboxPixFallbackEnabled(): boolean {
    return this.getRuntimeInfo().sandbox &&
      String(process.env.ETHERFUSE_SANDBOX_PIX_FALLBACK || 'true').trim().toLowerCase() !== 'false';
  }

  private static buildSandboxPixInstructions(orderId: string, amount: string) {
    const pixKey = `sandbox-${orderId.replace(/^sandbox-pix-/, '').slice(0, 8)}@etherfuse.dev`;
    const txid = `TS${orderId.replace(/[^a-f0-9]/gi, '').slice(0, 23)}`;
    const pixCode = buildPixBrCode({
      pixKey,
      amount,
      merchantName: 'Etherfuse Sandbox',
      merchantCity: 'SAO PAULO',
      txid,
      description: `TalkToStellar ${orderId.slice(-8)}`,
    });

    return {
      type: 'pix' as const,
      amount,
      currency: 'BRL',
      reference: orderId,
      pixKey,
      pixKeyType: 'email',
      pixCode,
      beneficiary: 'Etherfuse Sandbox',
    };
  }

  private static async getSandboxTesouroTreasuryBalance(): Promise<string | undefined> {
    const publicKey = coalesceString(process.env.BRL_DISTRIBUTOR_PUBLIC);
    if (!publicKey) return undefined;

    try {
      const balances = await StellarService.getAccountBalance(publicKey);
      const tesouro = balances.find(isTesouroBalance);
      return String(tesouro?.balance || '0');
    } catch (error) {
      console.warn('[ramp] Could not read sandbox TESOURO treasury balance:', debugErrorMessage(error));
      return undefined;
    }
  }

  private static createSandboxOnRampFallback(input: {
    context: SessionWalletContext;
    customerId: string;
    quoteId: string;
    amount: string;
    toCurrency: string;
    finalAsset: { code: string; issuer?: string };
    expectedToAmount?: string;
    upstreamError?: string;
  }): OnRampTransaction {
    const orderId = `sandbox-pix-${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    const destinationAmount = estimateTesouroFromBrl(input.amount, input.expectedToAmount);
    const finalIsTesouro = sameIssuedAsset(input.finalAsset, { code: 'TESOURO', issuer: this.getTesouroIssuer() });
    const transaction = {
      id: orderId,
      customerId: input.customerId,
      quoteId: input.quoteId,
      status: 'pending' as const,
      fromAmount: input.amount,
      fromCurrency: 'BRL',
      toAmount: finalIsTesouro ? destinationAmount : '',
      toCurrency: assetIdentifier(input.finalAsset),
      stellarAddress: input.context.publicKey,
      paymentInstructions: this.buildSandboxPixInstructions(orderId, input.amount),
      createdAt: now,
      updatedAt: now,
      sandbox_mock: true,
      upstream_error: input.upstreamError,
      anchorAsset: this.getTesouroIdentifier(),
      anchorAmount: destinationAmount,
      finalAsset: input.finalAsset,
      auto_conversion: finalIsTesouro ? { required: false } : {
        required: true,
        source_asset_code: 'TESOURO',
        destination_asset_code: input.finalAsset.code,
        destination_asset_issuer: input.finalAsset.issuer,
        status: 'pending',
      },
    } as OnRampTransaction & { sandbox_mock: boolean; upstream_error?: string };

    this.sandboxMockOnRampOrders.set(orderId, {
      transaction,
      userId: input.context.userId,
      sessionId: input.context.sessionId,
      publicKey: input.context.publicKey,
      vaultSecretId: input.context.vaultSecretId,
      sourceAmountBrl: input.amount,
      destinationAmount,
      finalAssetCode: input.finalAsset.code,
      finalAssetIssuer: input.finalAsset.issuer,
      finalAmount: finalIsTesouro ? destinationAmount : undefined,
      upstreamError: input.upstreamError,
    });

    return transaction;
  }

  private static async persistSandboxOnRampContext(
    record: SandboxMockOnRampOrder,
    patch: Record<string, unknown>,
  ): Promise<void> {
    if (!record.operationId) return;
    const context = {
      ...(record.operationContext || {}),
      ...patch,
      payment_instructions: record.transaction.paymentInstructions,
      sandbox_mock: true,
    };
    record.operationContext = context;
    try {
      await OperationRepository.update(record.operationId, { context: JSON.stringify(context) } as any);
    } catch (error) {
      console.warn(`[ramp] Could not persist sandbox on-ramp context ${record.operationId}:`, debugErrorMessage(error));
    }
  }

  private static async hydrateSandboxOnRampFromOperation(
    orderId: string,
    operationId?: string,
  ): Promise<SandboxMockOnRampOrder | null> {
    const existing = this.sandboxMockOnRampOrders.get(orderId);
    if (existing) return existing;
    if (!operationId || !orderId.startsWith('sandbox-pix-')) return null;

    const operation = await OperationRepository.findById(operationId);
    if (!operation) return null;

    const context = parseOperationContext(operation.context);
    const storedOrderId = coalesceString(context.anchor_order_id, context.order_id);
    if (storedOrderId !== orderId || context.sandbox_mock !== true || context.direction !== 'onramp') {
      return null;
    }

    const amount = coalesceString(
      context.source_amount_brl,
      context.amount_brl,
      context.payment_instructions?.amount,
      operation.amount,
      '0',
    );
    const finalAsset = resolveRampFinalAsset(context.target_asset, context.final_asset, this.getTesouroIdentifier());
    const finalIsTesouro = sameIssuedAsset(finalAsset, { code: 'TESOURO', issuer: this.getTesouroIssuer() });
    const storedInstructions = context.payment_instructions && typeof context.payment_instructions === 'object'
      ? context.payment_instructions
      : {};
    const storedPixCode = coalesceString(storedInstructions.pixCode);
    const shouldRegeneratePix = !storedPixCode || storedPixCode.startsWith('PIX-SANDBOX|');
    const paymentInstructions = shouldRegeneratePix
      ? this.buildSandboxPixInstructions(orderId, amount)
      : {
          ...storedInstructions,
          type: 'pix' as const,
          amount,
          currency: coalesceString(storedInstructions.currency) || 'BRL',
          reference: orderId,
        };
    const destinationAmount = coalesceString(
      context.destination_amount_anchor,
      context.anchor_amount,
      context.destination_amount,
      context.to_amount,
      estimateTesouroFromBrl(amount, coalesceString(context.expected_to_amount)),
    );
    const finalAmount = coalesceString(context.final_amount) || (finalIsTesouro ? destinationAmount : '');
    const status = mapOperationStatusToRampStatus(operation.status);
    const now = new Date().toISOString();
    const transaction = {
      id: orderId,
      customerId: coalesceString(context.customer_id),
      quoteId: coalesceString(context.quote_id),
      status: status as any,
      fromAmount: amount,
      fromCurrency: 'BRL',
      toAmount: finalAmount,
      toCurrency: assetIdentifier(finalAsset),
      stellarAddress: coalesceString(operation.source_public_key, context.public_key),
      paymentInstructions,
      createdAt: operation.created_at || now,
      updatedAt: operation.updated_at || now,
      sandbox_mock: true,
      upstream_error: coalesceString(context.upstream_error) || undefined,
      anchorAsset: this.getTesouroIdentifier(),
      anchorAmount: destinationAmount,
      finalAsset,
      finalAmount: finalAmount || undefined,
      auto_conversion: finalIsTesouro ? { required: false } : {
        required: true,
        status: coalesceString(context.final_conversion_status) || (status === 'completed' ? 'completed' : 'pending'),
        source_asset_code: 'TESOURO',
        source_amount: destinationAmount,
        destination_asset_code: finalAsset.code,
        destination_asset_issuer: finalAsset.issuer,
        destination_amount: finalAmount || undefined,
        hash: coalesceString(context.final_conversion_hash) || undefined,
        error: coalesceString(context.final_conversion_error) || undefined,
      },
    } as OnRampTransaction & { sandbox_mock: boolean; upstream_error?: string; stellarTxHash?: string };

    const deliveryHash = coalesceString(context.delivery_hash, context.stellar_tx_hash);
    if (deliveryHash) transaction.stellarTxHash = deliveryHash;

    const record: SandboxMockOnRampOrder = {
      transaction,
      userId: operation.user_id,
      sessionId: coalesceString(operation.source_session_id),
      publicKey: transaction.stellarAddress,
      sourceAmountBrl: amount,
      destinationAmount,
      finalAssetCode: finalAsset.code,
      finalAssetIssuer: finalAsset.issuer,
      finalAmount: finalAmount || undefined,
      finalConversionHash: coalesceString(context.final_conversion_hash) || undefined,
      finalConversionSourceAmount: coalesceString(context.final_conversion_source_amount) || undefined,
      finalConversionError: coalesceString(context.final_conversion_error) || undefined,
      operationId,
      deliveryHash: deliveryHash || undefined,
      deliverySourceAmount: coalesceString(context.delivery_source_amount) || undefined,
      deliveryError: coalesceString(context.delivery_error) || undefined,
      upstreamError: coalesceString(context.upstream_error) || undefined,
      operationContext: {
        ...context,
        payment_instructions: paymentInstructions,
        destination_amount_anchor: destinationAmount,
        final_amount: finalAmount || undefined,
        source_amount_brl: amount,
      },
    };

    this.sandboxMockOnRampOrders.set(orderId, record);
    if (shouldRegeneratePix) {
      await this.persistSandboxOnRampContext(record, {
        payment_instructions: paymentInstructions,
        destination_amount_anchor: destinationAmount,
        final_amount: finalAmount || undefined,
        source_amount_brl: amount,
      });
    }
    return record;
  }

  private static async completeSandboxOnRamp(record: SandboxMockOnRampOrder, hash?: string, patch: Record<string, unknown> = {}): Promise<SandboxMockOnRampOrder> {
    record.transaction.status = 'completed' as any;
    record.transaction.updatedAt = new Date().toISOString();
    record.deliveryHash = hash || record.deliveryHash;
    if (hash) {
      (record.transaction as OnRampTransaction & { stellarTxHash?: string }).stellarTxHash = hash;
    }
    await this.updateRampOperationStatus(record.operationId, 'COMPLETED');
    await this.persistSandboxOnRampContext(record, {
      delivery_hash: record.deliveryHash,
      final_transaction_status: 'completed',
      final_asset: assetIdentifier({ code: record.finalAssetCode, issuer: record.finalAssetIssuer }),
      final_amount: record.finalAmount,
      ...patch,
    });
    await this.notifySandboxOnRampCompleted(record, hash);
    return record;
  }

  private static async failSandboxOnRamp(record: SandboxMockOnRampOrder, message: string): Promise<SandboxMockOnRampOrder> {
    record.transaction.status = 'failed' as any;
    record.transaction.updatedAt = new Date().toISOString();
    record.deliveryError = message;
    await this.updateRampOperationStatus(record.operationId, 'FAILED');
    await this.persistSandboxOnRampContext(record, {
      delivery_error: message,
      final_transaction_status: 'failed',
    });
    return record;
  }

  private static async settleSandboxOnRampFinalAsset(input: {
    record: SandboxMockOnRampOrder;
    sourceSecret: string;
    destinationAmountTesouro: string;
  }): Promise<SandboxMockOnRampOrder> {
    const { record, sourceSecret, destinationAmountTesouro } = input;
    const finalAsset = resolveConfiguredAsset(record.finalAssetCode || 'TESOURO', record.finalAssetIssuer);
    const tesouroAsset = { code: 'TESOURO', issuer: this.getTesouroIssuer() };

    if (sameIssuedAsset(finalAsset, tesouroAsset)) {
      const directTesouroResult = await StellarService.submitAssetPaymentFromSecret({
        sourceSecret,
        destination: record.publicKey,
        amount: destinationAmountTesouro,
        assetCode: 'TESOURO',
        assetIssuer: this.getTesouroIssuer(),
        memoText: 'PIX ONRAMP SANDBOX',
      });

      if (directTesouroResult.success) {
        record.finalAmount = destinationAmountTesouro;
        record.deliverySourceAmount = record.sourceAmountBrl;
        (record.transaction as any).toAmount = destinationAmountTesouro;
        (record.transaction as any).toCurrency = this.getTesouroIdentifier();
        (record.transaction as any).finalAmount = destinationAmountTesouro;
        (record.transaction as any).auto_conversion = { required: false };
        return this.completeSandboxOnRamp(record, directTesouroResult.hash, {
          delivery_source_amount: record.sourceAmountBrl,
        });
      }

      const brlIssuer = getAssetIssuer('BRL');
      if (!brlIssuer) {
        return this.failSandboxOnRamp(record, `BRL issuer is required for sandbox PIX path settlement. Direct TESOURO settlement failed: ${directTesouroResult.error || 'unknown error'}.`);
      }

      const sourceMax = toStellarAmount(Math.max(
        Number(record.sourceAmountBrl) * 2,
        Number(record.sourceAmountBrl) + 1,
      ));
      const result = await StellarService.submitStrictReceivePaymentFromSecret({
        sourceSecret,
        destination: record.publicKey,
        sourceAsset: { code: 'BRL', issuer: brlIssuer },
        destinationAsset: tesouroAsset,
        destinationAmount: destinationAmountTesouro,
        sourceMax,
        memoText: 'PIX ONRAMP SANDBOX',
      });

      if (!result.success) {
        const treasuryTesouroBalance = await this.getSandboxTesouroTreasuryBalance();
        const liquidityDetail = treasuryTesouroBalance !== undefined
          ? ` Sandbox TESOURO treasury balance is ${treasuryTesouroBalance}; this order needs ${destinationAmountTesouro}.`
          : '';
        return this.failSandboxOnRamp(
          record,
          result.error
            ? `${result.error}. Direct TESOURO settlement also failed: ${directTesouroResult.error || 'unknown error'}.${liquidityDetail}`
            : `Sandbox TESOURO delivery failed. Direct TESOURO settlement also failed: ${directTesouroResult.error || 'unknown error'}.${liquidityDetail}`,
        );
      }

      record.finalAmount = destinationAmountTesouro;
      record.deliverySourceAmount = result.sourceAmount;
      (record.transaction as any).toAmount = destinationAmountTesouro;
      (record.transaction as any).toCurrency = this.getTesouroIdentifier();
      (record.transaction as any).finalAmount = destinationAmountTesouro;
      (record.transaction as any).auto_conversion = { required: false };
      return this.completeSandboxOnRamp(record, result.hash, {
        delivery_source_amount: result.sourceAmount,
      });
    }

    const finalTrustline = await this.ensureIssuedAssetTrustline({
      sessionId: record.sessionId,
      sessionToken: '',
      userId: record.userId,
      publicKey: record.publicKey,
      vaultSecretId: record.vaultSecretId,
    }, finalAsset);
    if (!finalTrustline.success) {
      return this.failSandboxOnRamp(record, finalTrustline.error || `Could not create ${finalAsset.code} trustline before final PIX settlement.`);
    }

    if (finalAsset.code === 'BRL' && finalAsset.issuer) {
      const exactBrl = toStellarAmount(record.sourceAmountBrl);
      const exactBrlConversion = await StellarService.submitStrictReceivePaymentFromSecret({
        sourceSecret,
        destination: record.publicKey,
        sourceAsset: tesouroAsset,
        destinationAsset: finalAsset,
        destinationAmount: exactBrl,
        sourceMax: toStellarAmount(Math.max(Number(destinationAmountTesouro) * 1.2, Number(destinationAmountTesouro) + 1)),
        memoText: 'PIX ONRAMP BRL',
      });

      if (exactBrlConversion.success) {
        record.finalAmount = exactBrl;
        record.finalConversionHash = exactBrlConversion.hash;
        record.finalConversionSourceAmount = exactBrlConversion.sourceAmount || destinationAmountTesouro;
        (record.transaction as any).toAmount = exactBrl;
        (record.transaction as any).toCurrency = assetIdentifier(finalAsset);
        (record.transaction as any).finalAmount = exactBrl;
        (record.transaction as any).auto_conversion = {
          required: true,
          status: 'completed',
          source_asset_code: 'TESOURO',
          source_amount: record.finalConversionSourceAmount,
          destination_asset_code: finalAsset.code,
          destination_asset_issuer: finalAsset.issuer,
          destination_amount: exactBrl,
          hash: exactBrlConversion.hash,
          mode: 'strict_receive_exact_brl',
        };
        return this.completeSandboxOnRamp(record, exactBrlConversion.hash, {
          final_conversion_status: 'completed',
          final_conversion_hash: exactBrlConversion.hash,
          final_conversion_source_amount: record.finalConversionSourceAmount,
          final_conversion_mode: 'strict_receive_exact_brl',
        });
      }
    }

    const converted = await StellarService.submitStrictSendPaymentFromSecret({
      sourceSecret,
      destination: record.publicKey,
      sourceAsset: tesouroAsset,
      sourceAmount: destinationAmountTesouro,
      destinationAsset: finalAsset,
      memoText: 'PIX ONRAMP CONVERT',
    });

    if (converted.success) {
      record.finalAmount = converted.destinationAmount || destinationAmountTesouro;
      record.finalConversionHash = converted.hash;
      record.finalConversionSourceAmount = destinationAmountTesouro;
      (record.transaction as any).toAmount = record.finalAmount;
      (record.transaction as any).toCurrency = assetIdentifier(finalAsset);
      (record.transaction as any).finalAmount = record.finalAmount;
      (record.transaction as any).auto_conversion = {
        required: true,
        status: 'completed',
        source_asset_code: 'TESOURO',
        source_amount: destinationAmountTesouro,
        destination_asset_code: finalAsset.code,
        destination_asset_issuer: finalAsset.issuer,
        destination_amount: record.finalAmount,
        hash: converted.hash,
      };
      return this.completeSandboxOnRamp(record, converted.hash, {
        final_conversion_status: 'completed',
        final_conversion_hash: converted.hash,
        final_conversion_source_amount: destinationAmountTesouro,
      });
    }

    if (finalAsset.code === 'USDC' && finalAsset.issuer) {
      const brlIssuer = getAssetIssuer('BRL');
      if (brlIssuer) {
        const brlToUsdc = await StellarService.submitStrictSendPaymentFromSecret({
          sourceSecret,
          destination: record.publicKey,
          sourceAsset: { code: 'BRL', issuer: brlIssuer },
          sourceAmount: toStellarAmount(record.sourceAmountBrl),
          destinationAsset: finalAsset,
          memoText: 'PIX ONRAMP USDC',
        });
        if (brlToUsdc.success) {
          record.finalAmount = brlToUsdc.destinationAmount || '0';
          record.finalConversionHash = brlToUsdc.hash;
          record.finalConversionSourceAmount = toStellarAmount(record.sourceAmountBrl);
          (record.transaction as any).toAmount = record.finalAmount;
          (record.transaction as any).toCurrency = assetIdentifier(finalAsset);
          (record.transaction as any).finalAmount = record.finalAmount;
          (record.transaction as any).auto_conversion = {
            required: true,
            status: 'completed',
            source_asset_code: 'BRL',
            source_amount: record.finalConversionSourceAmount,
            destination_asset_code: finalAsset.code,
            destination_asset_issuer: finalAsset.issuer,
            destination_amount: record.finalAmount,
            hash: brlToUsdc.hash,
            fallback: 'configured_brl_to_usdc_treasury_path',
          };
          return this.completeSandboxOnRamp(record, brlToUsdc.hash, {
            final_conversion_status: 'completed',
            final_conversion_hash: brlToUsdc.hash,
            final_conversion_source_amount: record.finalConversionSourceAmount,
            final_conversion_fallback: 'configured_brl_to_usdc_treasury_path',
          });
        }
        record.finalConversionError = `${converted.error || 'TESOURO conversion path failed'}; BRL -> USDC fallback failed: ${brlToUsdc.error || 'unknown error'}`;
      }
    }

    if (finalAsset.code === 'BRL' && finalAsset.issuer) {
      const directBrl = await StellarService.submitAssetPaymentFromSecret({
        sourceSecret,
        destination: record.publicKey,
        amount: toStellarAmount(record.sourceAmountBrl),
        assetCode: 'BRL',
        assetIssuer: finalAsset.issuer,
        memoText: 'PIX ONRAMP BRL',
      });
      if (directBrl.success) {
        record.finalAmount = toStellarAmount(record.sourceAmountBrl);
        record.finalConversionHash = directBrl.hash;
        record.finalConversionSourceAmount = destinationAmountTesouro;
        (record.transaction as any).toAmount = record.finalAmount;
        (record.transaction as any).toCurrency = assetIdentifier(finalAsset);
        (record.transaction as any).finalAmount = record.finalAmount;
        (record.transaction as any).auto_conversion = {
          required: true,
          status: 'completed',
          source_asset_code: 'TESOURO',
          source_amount: destinationAmountTesouro,
          destination_asset_code: finalAsset.code,
          destination_asset_issuer: finalAsset.issuer,
          destination_amount: record.finalAmount,
          hash: directBrl.hash,
          fallback: 'direct_configured_brl_treasury_payment',
        };
        return this.completeSandboxOnRamp(record, directBrl.hash, {
          final_conversion_status: 'completed',
          final_conversion_hash: directBrl.hash,
          final_conversion_source_amount: destinationAmountTesouro,
          final_conversion_fallback: 'direct_configured_brl_treasury_payment',
        });
      }
      record.finalConversionError = `${converted.error || 'TESOURO conversion path failed'}; direct BRL fallback failed: ${directBrl.error || 'unknown error'}`;
    } else {
      record.finalConversionError = converted.error || `Could not convert TESOURO to ${finalAsset.code}.`;
    }

    (record.transaction as any).auto_conversion = {
      required: true,
      status: 'failed',
      source_asset_code: 'TESOURO',
      source_amount: destinationAmountTesouro,
      destination_asset_code: finalAsset.code,
      destination_asset_issuer: finalAsset.issuer,
      error: record.finalConversionError,
    };
    return this.failSandboxOnRamp(record, record.finalConversionError);
  }

  private static async deliverSandboxOnRamp(orderId: string, operationId?: string, context?: SessionWalletContext): Promise<SandboxMockOnRampOrder | null> {
    const record = await this.hydrateSandboxOnRampFromOperation(orderId, operationId);
    if (!record) return null;
    if (record.transaction.status === 'completed') return record;
    if (context?.vaultSecretId && !record.vaultSecretId) {
      record.vaultSecretId = context.vaultSecretId;
    }

    record.transaction.status = 'processing' as any;
    record.transaction.updatedAt = new Date().toISOString();
    await this.updateRampOperationStatus(record.operationId, 'PROCESSING');

    const sourceSecret = coalesceString(process.env.BRL_DISTRIBUTOR_SECRET);
    if (!sourceSecret) {
      return this.failSandboxOnRamp(record, 'BRL_DISTRIBUTOR_SECRET is required for sandbox PIX settlement.');
    }

    const destinationAmount = toStellarAmount(record.destinationAmount);
    return this.settleSandboxOnRampFinalAsset({ record, sourceSecret, destinationAmountTesouro: destinationAmount });
  }

  private static async ensureSandboxTesouroCollectorTrustline(): Promise<{ publicKey: string; success: boolean; error?: string }> {
    const publicKey = coalesceString(process.env.BRL_DISTRIBUTOR_PUBLIC);
    const secret = coalesceString(process.env.BRL_DISTRIBUTOR_SECRET);
    if (!publicKey || !secret) {
      return {
        publicKey,
        success: false,
        error: 'BRL_DISTRIBUTOR_PUBLIC and BRL_DISTRIBUTOR_SECRET are required for sandbox off-ramp settlement.',
      };
    }

    const trustline = await StellarService.ensureTrustlineFromSecret({
      sourceSecret: secret,
      assetCode: 'TESOURO',
      assetIssuer: this.getTesouroIssuer(),
    });

    return { publicKey, success: trustline.success, error: trustline.error };
  }

  private static createSandboxOffRampFallback(input: {
    context: SessionWalletContext;
    customerId: string;
    quoteId: string;
    amount: string;
    fiatAccountId?: string;
    upstreamError?: string;
  }): OffRampTransaction {
    const orderId = `sandbox-offramp-${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    const transaction = {
      id: orderId,
      customerId: input.customerId,
      quoteId: input.quoteId,
      status: 'pending' as const,
      fromAmount: toStellarAmount(input.amount),
      fromCurrency: this.getTesouroIdentifier(),
      toAmount: '',
      toCurrency: 'BRL',
      stellarAddress: input.context.publicKey,
      fiatAccount: {
        id: input.fiatAccountId || `sandbox-pix-${crypto.randomUUID()}`,
        type: 'pix',
        label: 'Etherfuse Sandbox PIX',
      },
      signableTransaction: `sandbox-mock-xdr:${orderId}`,
      createdAt: now,
      updatedAt: now,
      sandbox_mock: true,
      upstream_error: input.upstreamError,
    } as OffRampTransaction & { sandbox_mock: boolean; upstream_error?: string };

    this.sandboxMockOffRampOrders.set(orderId, {
      transaction,
      userId: input.context.userId,
      sessionId: input.context.sessionId,
      publicKey: input.context.publicKey,
      amountTesouro: toStellarAmount(input.amount),
    });

    return transaction;
  }

  private static async submitSandboxOffRamp(input: {
    context: SessionWalletContext;
    orderId: string;
    operationId?: string;
  }): Promise<{ success: boolean; hash?: string; error?: string; order_id: string }> {
    const record = this.sandboxMockOffRampOrders.get(input.orderId);
    if (!record) {
      return { success: false, order_id: input.orderId, error: 'Sandbox off-ramp order not found.' };
    }
    if (record.transaction.status === 'completed') {
      return { success: true, order_id: input.orderId, hash: record.submitHash };
    }
    if (!input.context.vaultSecretId) {
      return { success: false, order_id: input.orderId, error: 'Wallet private key is not available in Vault.' };
    }

    const collector = await this.ensureSandboxTesouroCollectorTrustline();
    if (!collector.success || !collector.publicKey) {
      record.transaction.status = 'failed' as any;
      record.transaction.updatedAt = new Date().toISOString();
      record.submitError = collector.error || 'Could not prepare sandbox TESOURO collector.';
      await this.updateRampOperationStatus(record.operationId || input.operationId, 'FAILED');
      return { success: false, order_id: input.orderId, error: record.submitError };
    }

    record.transaction.status = 'processing' as any;
    record.transaction.updatedAt = new Date().toISOString();
    await this.updateRampOperationStatus(record.operationId || input.operationId, 'PROCESSING');

    const secret = await new VaultService(supabase).getSecret(input.context.vaultSecretId);
    const result = await StellarService.submitAssetPaymentFromSecret({
      sourceSecret: secret,
      destination: collector.publicKey,
      amount: record.amountTesouro,
      assetCode: 'TESOURO',
      assetIssuer: this.getTesouroIssuer(),
      memoText: 'PIX OFFRAMP SANDBOX',
    });

    if (!result.success) {
      record.transaction.status = 'failed' as any;
      record.transaction.updatedAt = new Date().toISOString();
      record.submitError = result.error || 'Sandbox off-ramp payment failed.';
      await this.updateRampOperationStatus(record.operationId || input.operationId, 'FAILED');
      return { ...result, order_id: input.orderId };
    }

    record.transaction.status = 'completed' as any;
    record.transaction.updatedAt = new Date().toISOString();
    record.submitHash = result.hash;
    record.transaction.stellarTxHash = result.hash;
    await this.updateRampOperationStatus(record.operationId || input.operationId, 'COMPLETED');
    return { ...result, order_id: input.orderId };
  }

  private static buildSandboxKycPayload(publicKey: string): any {
    return {
      pubkey: publicKey,
      identity: {
        id: publicKey,
        name: {
          givenName: 'Ana',
          familyName: 'Silva',
        },
        dateOfBirth: '1990-05-15',
        phoneNumber: '+5511999999999',
        address: {
          street: 'Avenida Paulista 1000',
          city: 'Sao Paulo',
          region: 'SP',
          postalCode: '01310-100',
          country: 'BR',
        },
        idNumbers: [
          {
            value: '37155878661',
            type: 'CPF',
          },
        ],
      },
    };
  }

  private static buildSandboxDocumentPayload(publicKey: string, documentType: 'document' | 'selfie'): any {
    // 1x1 PNG data URL. Etherfuse sandbox accepts fake KYC images for devnet flows.
    const image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=';
    return documentType === 'selfie'
      ? {
          pubkey: publicKey,
          documentType,
          images: [{ label: 'selfie', image }],
        }
      : {
          pubkey: publicKey,
          documentType,
          images: [
            { label: 'id_front', image },
            { label: 'id_back', image },
          ],
        };
  }

  private static buildSandboxPixAccount(bankAccountId: string, email?: string): any {
    const pixKey = email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : crypto.randomUUID();
    const pixKeyType = email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? 'email' : 'evp';
    return {
      bankAccountId,
      label: 'TalkToStellar PIX sandbox',
      skipAutoApproval: false,
      account: {
        pixKey,
        pixKeyType,
        firstName: 'Ana',
        lastName: 'Silva',
        cpf: '37155878661',
      },
    };
  }

  private static async runSandboxProgrammaticOnboarding(input: {
    customerId: string;
    publicKey: string;
    bankAccountId: string;
    email?: string;
    kycUrl?: string;
  }): Promise<{
    bankAccountId: string;
    cryptoWalletId?: string;
    steps: Record<string, unknown>;
  }> {
    if (!this.getRuntimeInfo().sandbox) {
      return { bankAccountId: input.bankAccountId, steps: { skipped: 'production' } };
    }

    const cacheKey = `${input.customerId}:${input.publicKey}:${input.bankAccountId}`;
    const cached = this.programmaticOnboardingCache.get(cacheKey);
    if (cached) {
      return {
        bankAccountId: input.bankAccountId,
        cryptoWalletId: cached.cryptoWalletId,
        steps: { cached: true, crypto_wallet_id: cached.cryptoWalletId },
      };
    }

    const anchor = this.getEtherfuseClient() as any;
    const steps: Record<string, unknown> = {};
    let cryptoWalletId: string | undefined;

    try {
      steps.wallet = await anchor.registerCustomerWallet(input.customerId, input.publicKey, false);
    } catch (error) {
      steps.wallet = isDuplicateResourceError(error) ? 'already_registered' : { error: debugErrorMessage(error) };
    }

    if (typeof anchor.registerOrganizationWallet === 'function') {
      try {
        const organizationWallet = await anchor.registerOrganizationWallet(input.publicKey, true);
        steps.organization_wallet = organizationWallet;
        cryptoWalletId = coalesceString(
          organizationWallet?.walletId,
          organizationWallet?.cryptoWalletId,
          organizationWallet?.id,
        );
      } catch (error) {
        try {
          const organizationWallet = await anchor.registerOrganizationWallet(input.publicKey, false);
          steps.organization_wallet = {
            claim_ownership_error: debugErrorMessage(error),
            registered_without_claim: organizationWallet,
          };
          cryptoWalletId = coalesceString(
            organizationWallet?.walletId,
            organizationWallet?.cryptoWalletId,
            organizationWallet?.id,
          );
        } catch (fallbackError) {
          steps.organization_wallet = isDuplicateResourceError(fallbackError)
            ? 'already_registered'
            : { error: debugErrorMessage(fallbackError), claim_ownership_error: debugErrorMessage(error) };
        }
      }
    }

    try {
      steps.kyc_identity = await anchor.submitKycIdentity(
        input.customerId,
        this.buildSandboxKycPayload(input.publicKey),
      );
    } catch (error) {
      steps.kyc_identity = isDuplicateResourceError(error) ? 'already_submitted' : { error: debugErrorMessage(error) };
    }

    try {
      steps.kyc_documents = await anchor.submitKycDocuments(
        input.customerId,
        this.buildSandboxDocumentPayload(input.publicKey, 'document'),
      );
      steps.kyc_selfie = await anchor.submitKycDocuments(
        input.customerId,
        this.buildSandboxDocumentPayload(input.publicKey, 'selfie'),
      );
    } catch (error) {
      steps.kyc_documents = isDuplicateResourceError(error) ? 'already_submitted' : { error: debugErrorMessage(error) };
    }

    if (input.kycUrl && typeof anchor.acceptAgreements === 'function') {
      try {
        steps.agreements = await anchor.acceptAgreements(input.kycUrl);
      } catch (error) {
        steps.agreements = isDuplicateResourceError(error) ? 'already_accepted' : { error: debugErrorMessage(error) };
      }
    }

    try {
      steps.bank_account = await anchor.createBankAccountForCustomer(
        input.customerId,
        this.buildSandboxPixAccount(input.bankAccountId, input.email),
      );
    } catch (error) {
      if (isDuplicateResourceError(error)) {
        steps.bank_account = 'already_registered';
      } else if (input.kycUrl && typeof anchor.createBankAccountWithPresignedUrl === 'function') {
        const pixAccount = this.buildSandboxPixAccount(input.bankAccountId, input.email);
        try {
          steps.bank_account = await anchor.createBankAccountWithPresignedUrl({
            presignedUrl: input.kycUrl,
            account: pixAccount.account,
            skipAutoApproval: false,
            label: pixAccount.label,
          });
        } catch (fallbackError) {
          steps.bank_account = isDuplicateResourceError(fallbackError)
            ? 'already_registered'
            : { error: debugErrorMessage(fallbackError) };
        }
      } else {
        steps.bank_account = { error: debugErrorMessage(error) };
      }
    }

    this.programmaticOnboardingCache.set(cacheKey, { cryptoWalletId });
    return { bankAccountId: input.bankAccountId, cryptoWalletId, steps };
  }

  static async createCustomerForSession(input: CustomerForSessionInput): Promise<{
    customer: Customer;
    kyc_url?: string;
    programmatic_onboarding?: Record<string, unknown>;
    provider: 'etherfuse';
    rail: 'pix';
    fiat_currency: 'BRL';
    asset: { code: 'TESOURO'; issuer: string; identifier: string };
  }> {
    const context = await this.resolveSessionWallet(input);
    const anchor = this.getEtherfuseClient();
    let customer = await anchor.createCustomer({
      email: coalesceString(input.email, context.email) || undefined,
      country: coalesceString(input.country) || 'BR',
      publicKey: context.publicKey,
    });

    const preparedProxy = await this.prepareEtherfusePixProxy({
      customerId: customer.id,
      publicKey: context.publicKey,
      bankAccountId: customer.bankAccountId,
      email: coalesceString(input.email, context.email) || undefined,
    });
    const programmatic = await this.runSandboxProgrammaticOnboarding({
      customerId: customer.id,
      publicKey: context.publicKey,
      bankAccountId: preparedProxy.bankAccountId,
      email: coalesceString(input.email, context.email) || undefined,
      kycUrl: preparedProxy.kycUrl,
    });
    customer = { ...customer, bankAccountId: programmatic.bankAccountId };

    return {
      customer,
      kyc_url: preparedProxy.kycUrl,
      programmatic_onboarding: programmatic.steps,
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
    final_asset?: { code: string; issuer?: string; identifier: string };
    anchor_asset?: { code: 'TESOURO'; issuer: string; identifier: string };
  }> {
    const context = await this.resolveSessionWallet(input);
    const customerId = coalesceString(input.customer_id, input.customerId);
    if (!customerId) throw apiError('customer_id is required.', 400);

    const direction = input.direction === 'offramp' ? 'offramp' : 'onramp';
    const amount = normalizeAmount(coalesceString(input.amount, input.from_amount));
    const finalAsset = direction === 'onramp'
      ? resolveRampFinalAsset(input.final_asset, input.finalAsset, input.final_asset_code, input.finalAssetCode, input.to_currency, input.toCurrency, 'TESOURO')
      : undefined;
    const fromCurrency = coalesceString(input.from_currency, input.fromCurrency) ||
      (direction === 'offramp' ? this.getTesouroIdentifier() : 'BRL');
    const toCurrency = coalesceString(input.to_currency, input.toCurrency) ||
      (direction === 'offramp' ? 'BRL' : this.getTesouroIdentifier());
    const anchorToCurrency = direction === 'onramp' ? this.getTesouroIdentifier() : toCurrency;

    const quote = await this.getEtherfuseClient().getQuote({
      customerId,
      stellarAddress: context.publicKey,
      fromCurrency,
      toCurrency: anchorToCurrency,
      fromAmount: amount,
    });

    return {
      quote,
      direction,
      from_currency: fromCurrency,
      to_currency: anchorToCurrency,
      ...(finalAsset ? {
        final_asset: {
          ...finalAsset,
          identifier: assetIdentifier(finalAsset),
        },
        anchor_asset: {
          code: 'TESOURO' as const,
          issuer: this.getTesouroIssuer(),
          identifier: this.getTesouroIdentifier(),
        },
      } : {}),
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
    final_trustline?: TrustlineResult;
    quote?: Quote;
    quote_refreshed?: boolean;
  }> {
    const context = await this.resolveSessionWallet(input);
    const customerId = coalesceString(input.customer_id, input.customerId);
    let quoteId = coalesceString(input.quote_id, input.quoteId);
    const amount = normalizeAmount(input.amount);
    const fromCurrency = coalesceString(input.from_currency, input.fromCurrency) || 'BRL';
    const requestedFinalCurrency = coalesceString(
      input.final_asset,
      input.finalAsset,
      input.final_asset_code,
      input.finalAssetCode,
      input.final_currency,
      input.finalCurrency,
      input.to_currency,
      input.toCurrency,
      'TESOURO',
    );
    const finalAsset = resolveRampFinalAsset(requestedFinalCurrency);
    const anchorToCurrency = this.getTesouroIdentifier();
    const targetAsset = parseIssuedAssetIdentifier(anchorToCurrency);

    if (!customerId) throw apiError('customer_id is required.', 400);

    const trustline = await this.ensureIssuedAssetTrustline(context, {
      code: targetAsset.code || 'TESOURO',
      issuer: targetAsset.issuer || getAssetIssuer(targetAsset.code || 'TESOURO'),
    });
    if (!trustline.success) {
      throw apiError(trustline.error || `Could not create ${targetAsset.code || 'asset'} trustline before on-ramp.`, 409);
    }
    let finalTrustline: TrustlineResult | undefined;
    if (!sameIssuedAsset(finalAsset, targetAsset)) {
      finalTrustline = await this.ensureIssuedAssetTrustline(context, finalAsset);
      if (!finalTrustline.success) {
        throw apiError(finalTrustline.error || `Could not create ${finalAsset.code} trustline before final PIX settlement.`, 409);
      }
    }

    const anchor = this.getEtherfuseClient();
    let bankAccountId = coalesceString(input.bank_account_id, input.bankAccountId) || undefined;
    let cryptoWalletId: string | undefined;
    let kycUrl: string | undefined;

    const preparedProxy = await this.prepareEtherfusePixProxy({
      customerId,
      publicKey: context.publicKey,
      bankAccountId,
      email: context.email,
    });
    bankAccountId = preparedProxy.bankAccountId;
    kycUrl = preparedProxy.kycUrl;

    const programmatic = await this.runSandboxProgrammaticOnboarding({
      customerId,
      publicKey: context.publicKey,
      bankAccountId,
      email: context.email,
      kycUrl,
    });
    bankAccountId = programmatic.bankAccountId;
    cryptoWalletId = programmatic.cryptoWalletId;
    const organizationBankAccountId = await this.getActiveEtherfuseOrganizationBankAccountId();
    if (organizationBankAccountId) {
      bankAccountId = organizationBankAccountId;
    }

    let orderQuote: Quote | undefined;
    let quoteRefreshReason: string | undefined;
    const refreshQuoteForOrder = async (reason: string) => {
      orderQuote = await anchor.getQuote({
        customerId,
          stellarAddress: context.publicKey,
          fromCurrency,
          toCurrency: anchorToCurrency,
          fromAmount: amount,
        });
      quoteId = orderQuote.id;
      quoteRefreshReason = reason;
      return orderQuote;
    };

    // Etherfuse quotes are intentionally short-lived. Create a server-side quote
    // only after trustline/proxy/KYC preparation, right before /ramp/order.
    await refreshQuoteForOrder(quoteId ? 'pre_order_freshness' : 'missing_quote_id');

    const createOrder = () => anchor.createOnRamp({
      customerId,
      quoteId,
      stellarAddress: context.publicKey,
      fromCurrency,
      toCurrency: anchorToCurrency,
      amount,
      bankAccountId,
      cryptoWalletId,
      memo: coalesceString(input.memo) || undefined,
    });

    const createOrderWithQuoteRetry = async () => {
      try {
        return await createOrder();
      } catch (error) {
        if (!this.isExpiredEtherfuseQuoteError(error)) throw error;
        await refreshQuoteForOrder('retry_after_expired_quote');
        return createOrder();
      }
    };

    const createSandboxFallback = (error: unknown) => this.createSandboxOnRampFallback({
      context,
      customerId,
      quoteId,
      amount,
      toCurrency: anchorToCurrency,
      finalAsset,
      expectedToAmount: orderQuote?.toAmount || coalesceString(input.expected_to_amount, input.expectedToAmount),
      upstreamError: debugErrorMessage(error),
    });

    let transaction: OnRampTransaction;
    try {
      transaction = await createOrderWithQuoteRetry();
    } catch (error) {
      if (this.sandboxPixFallbackEnabled() && this.isExpiredEtherfuseQuoteError(error)) {
        transaction = createSandboxFallback(error);
      } else if (!this.isMissingEtherfuseProxyError(error)) {
        throw error;
      } else {
        const freshBankAccountId = crypto.randomUUID();
        const preparedProxy = await this.prepareEtherfusePixProxy({
          customerId,
          publicKey: context.publicKey,
          bankAccountId: freshBankAccountId,
          email: context.email,
        });
        bankAccountId = preparedProxy.bankAccountId;
        kycUrl = preparedProxy.kycUrl;
        const retryProgrammatic = await this.runSandboxProgrammaticOnboarding({
          customerId,
          publicKey: context.publicKey,
          bankAccountId,
          email: context.email,
          kycUrl,
        });
        bankAccountId = retryProgrammatic.bankAccountId;
        cryptoWalletId = retryProgrammatic.cryptoWalletId || cryptoWalletId;
        const organizationBankAccountId = await this.getActiveEtherfuseOrganizationBankAccountId();
        if (organizationBankAccountId) {
          bankAccountId = organizationBankAccountId;
        }

        try {
          transaction = await createOrderWithQuoteRetry();
        } catch (retryError) {
          const retryCanUseSandbox = this.isMissingEtherfuseProxyError(retryError) ||
            this.isExpiredEtherfuseQuoteError(retryError);
          if (this.sandboxPixFallbackEnabled() && retryCanUseSandbox) {
            transaction = createSandboxFallback(retryError);
          } else if (this.isMissingEtherfuseProxyError(retryError)) {
            throw this.missingProxySetupError(
              'Etherfuse ainda nao encontrou a conta PIX/proxy desta wallet depois do bootstrap programatico sandbox. Veja programmatic_onboarding no debug; se a API da Etherfuse ainda exigir, use o kyc_url de fallback.',
              kycUrl,
              bankAccountId,
              retryProgrammatic.steps,
            );
          } else {
            throw retryError;
          }
        }
      }
    }

    const operationContext = {
      provider: 'etherfuse',
      rail: 'pix',
      direction: 'onramp',
      customer_id: customerId,
      quote_id: quoteId,
      quote_refresh_reason: quoteRefreshReason,
      anchor_order_id: transaction.id,
      target_asset: assetIdentifier(finalAsset),
      anchor_asset: anchorToCurrency,
      crypto_wallet_id: cryptoWalletId,
      source_amount_brl: amount,
      destination_amount_anchor: orderQuote?.toAmount || coalesceString(input.expected_to_amount, input.expectedToAmount, transaction.toAmount),
      final_amount: sameIssuedAsset(finalAsset, targetAsset) ? (transaction.toAmount || orderQuote?.toAmount || coalesceString(input.expected_to_amount, input.expectedToAmount)) : undefined,
      final_asset_code: finalAsset.code,
      final_asset_issuer: finalAsset.issuer,
      payment_instructions: transaction.paymentInstructions,
      sandbox_mock: Boolean((transaction as OnRampTransaction & { sandbox_mock?: boolean }).sandbox_mock),
      upstream_error: (transaction as OnRampTransaction & { upstream_error?: string }).upstream_error,
    };

    const operationId = await this.persistRampOperation({
      userId: context.userId,
      type: 'PIX_ONRAMP',
      amount,
      assetCode: finalAsset.code || 'TESOURO',
      sessionId: context.sessionId,
      publicKey: context.publicKey,
      context: operationContext,
    });
    const mockRecord = this.sandboxMockOnRampOrders.get(transaction.id);
    if (mockRecord) {
      mockRecord.operationId = operationId;
      mockRecord.operationContext = operationContext;
    }

    return {
      transaction,
      operation_id: operationId,
      trustline,
      final_trustline: finalTrustline,
      quote: orderQuote,
      quote_refreshed: Boolean(orderQuote),
    };
  }

  private static async maybeAutoConvertCompletedOnRamp(
    transaction: OnRampTransaction,
    operationId?: string,
  ): Promise<OnRampTransaction> {
    if (!operationId || String(transaction.status || '').toLowerCase() !== 'completed') {
      return transaction;
    }

    const operation = await OperationRepository.findById(operationId);
    if (!operation) return transaction;

    const context = parseOperationContext(operation.context);
    const finalAsset = resolveRampFinalAsset(context.target_asset, context.final_asset, 'TESOURO');
    const tesouroAsset = { code: 'TESOURO', issuer: this.getTesouroIssuer() };
    if (sameIssuedAsset(finalAsset, tesouroAsset)) {
      return transaction;
    }

    const existingHash = coalesceString(context.final_conversion_hash);
    if (existingHash) {
      return {
        ...transaction,
        toAmount: coalesceString(context.final_amount, transaction.toAmount),
        toCurrency: assetIdentifier(finalAsset),
        finalAmount: coalesceString(context.final_amount, transaction.toAmount),
        finalAsset,
        auto_conversion: {
          required: true,
          status: 'completed',
          source_asset_code: 'TESOURO',
          source_amount: coalesceString(context.destination_amount_anchor, transaction.toAmount),
          destination_asset_code: finalAsset.code,
          destination_asset_issuer: finalAsset.issuer,
          destination_amount: coalesceString(context.final_amount, transaction.toAmount),
          hash: existingHash,
        },
      } as OnRampTransaction;
    }

    try {
      const sessionId = coalesceString(operation.source_session_id, context.session_id);
      const wallet = sessionId ? await new WalletRepository(supabase).getWalletBySession(sessionId) : null;
      const publicKey = coalesceString(operation.source_public_key, wallet?.public_key, transaction.stellarAddress);
      const vaultSecretId = coalesceString(wallet?.vault_secret_id);
      const userId = coalesceString(operation.user_id, context.user_id, sessionId);
      if (!publicKey || !vaultSecretId) {
        throw new Error('Wallet private key is not available in Vault for automatic post-PIX conversion.');
      }

      const finalTrustline = await this.ensureIssuedAssetTrustline({
        sessionId,
        sessionToken: '',
        userId,
        publicKey,
        vaultSecretId,
      }, finalAsset);
      if (!finalTrustline.success) {
        throw new Error(finalTrustline.error || `Could not create ${finalAsset.code} trustline for automatic PIX conversion.`);
      }

      const sourceAmount = toStellarAmount(coalesceString(
        context.destination_amount_anchor,
        context.anchor_amount,
        transaction.toAmount,
      ));
      const secret = await new VaultService(supabase).getSecret(vaultSecretId);
      const exactFinalBrl = finalAsset.code === 'BRL'
        ? coalesceString(context.source_amount_brl, transaction.fromAmount)
        : '';
      const usesStrictReceive = Boolean(exactFinalBrl);
      const xdr = usesStrictReceive
        ? await StellarService.buildPathPaymentXdr({
            sourcePublicKey: publicKey,
            destination: publicKey,
            destAmount: toStellarAmount(exactFinalBrl),
            sourceAsset: tesouroAsset,
            destAsset: finalAsset,
          })
        : await StellarService.buildStrictSendConversionXdr({
            sourcePublicKey: publicKey,
            destination: publicKey,
            sourceAmount,
            sourceAsset: tesouroAsset,
            destAsset: finalAsset,
            memoText: 'PIX AUTO CONVERT',
          });
      const result = await StellarService.signAndSubmitXdr(userId, secret, xdr, {
        user_id: userId,
        type: (usesStrictReceive ? 'PATH_PAYMENT_STRICT_RECEIVE' : 'PATH_PAYMENT_STRICT_SEND') as any,
        destination_key: publicKey,
        asset_code: finalAsset.code,
        amount: Number(usesStrictReceive ? exactFinalBrl : sourceAmount),
        context: JSON.stringify({
          provider: 'etherfuse',
          rail: 'pix',
          direction: 'onramp_auto_conversion',
          anchor_order_id: transaction.id,
          source_asset_code: 'TESOURO',
          source_amount: sourceAmount,
          destination_asset_code: finalAsset.code,
          destination_asset_issuer: finalAsset.issuer,
          conversion_mode: usesStrictReceive ? 'strict_receive_exact_final_asset' : 'strict_send_anchor_tesouro',
        }),
        source_public_key: publicKey,
        source_session_id: sessionId,
        destination_session_id: sessionId,
      } as any);
      if (!result.success) {
        throw new Error(result.error || 'Could not submit automatic PIX conversion.');
      }

      const details = result.hash ? await StellarService.getSubmittedPaymentDetails(result.hash) : null;
      const finalAmount = details?.destinationAmount || '';
      const updatedContext = {
        ...context,
        final_conversion_status: 'completed',
        final_conversion_hash: result.hash,
        final_conversion_source_amount: sourceAmount,
        final_amount: finalAmount,
      };
      await OperationRepository.update(operationId, { context: JSON.stringify(updatedContext) } as any);

      return {
        ...transaction,
        toAmount: finalAmount || transaction.toAmount,
        toCurrency: assetIdentifier(finalAsset),
        finalAmount: finalAmount || transaction.toAmount,
        finalAsset,
        auto_conversion: {
          required: true,
          status: 'completed',
          source_asset_code: 'TESOURO',
          source_amount: sourceAmount,
          destination_asset_code: finalAsset.code,
          destination_asset_issuer: finalAsset.issuer,
          destination_amount: finalAmount || undefined,
          hash: result.hash,
        },
      } as OnRampTransaction;
    } catch (error) {
      const message = debugErrorMessage(error);
      const updatedContext = {
        ...context,
        final_conversion_status: 'failed',
        final_conversion_error: message,
      };
      await OperationRepository.update(operationId, { context: JSON.stringify(updatedContext) } as any).catch(() => undefined);
      return {
        ...transaction,
        auto_conversion: {
          required: true,
          status: 'failed',
          source_asset_code: 'TESOURO',
          source_amount: coalesceString(context.destination_amount_anchor, transaction.toAmount),
          destination_asset_code: finalAsset.code,
          destination_asset_issuer: finalAsset.issuer,
          error: message,
        },
      } as OnRampTransaction;
    }
  }

  static async getOnRampStatus(orderId: string, operationId?: string): Promise<{
    transaction: OnRampTransaction;
  }> {
    const mockRecord = await this.hydrateSandboxOnRampFromOperation(orderId, operationId);
    if (mockRecord) {
      await this.updateRampOperationStatus(
        operationId || mockRecord.operationId,
        mapAnchorStatusToOperationStatus(mockRecord.transaction.status),
      );
      return { transaction: mockRecord.transaction };
    }

    if (orderId.startsWith('sandbox-pix-')) {
      throw apiError('Sandbox on-ramp order not found. Generate a new PIX checkout or pass the operation_id returned when the checkout was created.', 404);
    }

    const transaction = await this.getEtherfuseClient().getOnRampTransaction(orderId);
    if (!transaction) throw apiError('On-ramp order not found.', 404);

    await this.updateRampOperationStatus(operationId, mapAnchorStatusToOperationStatus(transaction.status));
    const maybeConverted = await this.maybeAutoConvertCompletedOnRamp(transaction, operationId);
    return { transaction: maybeConverted };
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
    let transaction: OffRampTransaction;
    if (!fiatAccountId) {
      if (!this.sandboxPixFallbackEnabled()) {
        throw apiError('No PIX fiat account registered. Open the Etherfuse onboarding URL and register a PIX account first.', 409);
      }
      fiatAccountId = crypto.randomUUID();
      transaction = this.createSandboxOffRampFallback({
        context,
        customerId,
        quoteId,
        amount,
        fiatAccountId,
        upstreamError: 'No Etherfuse PIX fiat account is available in sandbox; using local mock settlement.',
      });
    } else {
      try {
        transaction = await this.getEtherfuseClient().createOffRamp({
          customerId,
          quoteId,
          stellarAddress: context.publicKey,
          fromCurrency: this.getTesouroIdentifier(),
          toCurrency: 'BRL',
          amount,
          fiatAccountId,
          memo: coalesceString(input.memo) || undefined,
        });
      } catch (error) {
        if (!this.sandboxPixFallbackEnabled() || !this.isMissingEtherfuseProxyError(error)) {
          throw error;
        }
        transaction = this.createSandboxOffRampFallback({
          context,
          customerId,
          quoteId,
          amount,
          fiatAccountId,
          upstreamError: debugErrorMessage(error),
        });
      }
    }

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
        sandbox_mock: Boolean((transaction as OffRampTransaction & { sandbox_mock?: boolean }).sandbox_mock),
        upstream_error: (transaction as OffRampTransaction & { upstream_error?: string }).upstream_error,
      },
    });
    const mockRecord = this.sandboxMockOffRampOrders.get(transaction.id);
    if (mockRecord) mockRecord.operationId = operationId;

    return { transaction, operation_id: operationId };
  }

  static async getOffRampStatus(orderId: string, operationId?: string): Promise<{
    transaction: OffRampTransaction;
    ready_to_sign: boolean;
  }> {
    const mockRecord = this.sandboxMockOffRampOrders.get(orderId);
    if (mockRecord) {
      await this.updateRampOperationStatus(
        operationId || mockRecord.operationId,
        mapAnchorStatusToOperationStatus(mockRecord.transaction.status),
      );
      return {
        transaction: mockRecord.transaction,
        ready_to_sign: Boolean(mockRecord.transaction.signableTransaction),
      };
    }

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
    this.requireWalletPin(input, context);
    const orderId = coalesceString(input.order_id, input.orderId);
    if (!orderId) throw apiError('order_id is required.', 400);
    const mockRecord = this.sandboxMockOffRampOrders.get(orderId);
    if (mockRecord) {
      return this.submitSandboxOffRamp({
        context,
        orderId,
        operationId: coalesceString(input.operation_id, input.operationId),
      });
    }
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

  static async simulateFiatReceivedForSession(input: RampSessionInput & {
    order_id?: string;
    orderId?: string;
    operation_id?: string;
    operationId?: string;
  }): Promise<{
    order_id: string;
    upstream_status: number;
    success: boolean;
  }> {
    const context = await this.resolveSessionWallet(input);
    const orderId = coalesceString(input.order_id, input.orderId);
    const operationId = coalesceString(input.operation_id, input.operationId);
    if (!orderId) throw apiError('order_id is required.', 400);

    const mockRecord = await this.deliverSandboxOnRamp(orderId, operationId, context);
    if (mockRecord) {
      return {
        order_id: orderId,
        upstream_status: mockRecord.transaction.status === 'completed' ? 200 : 500,
        success: mockRecord.transaction.status === 'completed',
        transaction: mockRecord.transaction,
        ...(mockRecord.deliveryHash ? { delivery_hash: mockRecord.deliveryHash } : {}),
        ...(mockRecord.deliverySourceAmount ? { delivery_source_amount: mockRecord.deliverySourceAmount } : {}),
        ...(mockRecord.deliveryError ? { error: mockRecord.deliveryError } : {}),
        sandbox_mock: true,
      } as any;
    }

    const status = await this.getEtherfuseClient().simulateFiatReceived(orderId);
    return { order_id: orderId, upstream_status: status, success: status >= 200 && status < 300 };
  }

  static async getWalletBalancesForSession(input: RampSessionInput): Promise<{
    public_key: string;
    balances: Array<{ asset_code: string; asset_issuer?: string; balance: string }>;
  }> {
    const context = await this.resolveSessionWallet(input);
    if (this.getRuntimeInfo().sandbox) {
      await StellarService.ensureTestnetAccountFunded(context.publicKey, 1);
    }
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
    final_asset?: string;
    finalAsset?: string;
    final_asset_code?: string;
    finalAssetCode?: string;
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
    const finalAsset = resolveRampFinalAsset(
      input.final_asset,
      input.finalAsset,
      input.final_asset_code,
      input.finalAssetCode,
      input.to_currency,
      input.toCurrency,
      'TESOURO',
    );
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
      to_currency: this.getTesouroIdentifier(),
      final_asset: assetIdentifier(finalAsset),
    });
    const orderResult = await this.createOnRampForSession({
      session_id: context.sessionId,
      session_token: context.sessionToken,
      customer_id: customerResult.customer.id,
      quote_id: quoteResult.quote.id,
      amount,
      expected_to_amount: quoteResult.quote.toAmount,
      to_currency: quoteResult.quote.toCurrency,
      final_asset: assetIdentifier(finalAsset),
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
    fiat_amount?: string;
    fiatAmount?: string;
    target_brl?: string;
    targetBrl?: string;
    to_amount?: string;
    toAmount?: string;
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
    target_brl?: string;
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
    this.requireWalletPin(input, context);
    const requestedTargetBrl = coalesceString(
      input.fiat_amount,
      input.fiatAmount,
      input.target_brl,
      input.targetBrl,
      input.to_amount,
      input.toAmount,
    );
    let amount = normalizeAmount(input.amount || '1');
    const targetBrl = requestedTargetBrl ? normalizeAmount(requestedTargetBrl, 'fiat_amount') : '';
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
    if (!fiatAccountId && !this.sandboxPixFallbackEnabled()) {
      throw apiError('No PIX fiat account registered for off-ramp test. Open the Etherfuse KYC/PIX URL and register a PIX account first.', 409);
    }

    if (targetBrl) {
      const probeQuote = await this.getQuoteForSession({
        session_id: context.sessionId,
        session_token: context.sessionToken,
        customer_id: customerResult.customer.id,
        direction: 'offramp',
        amount: '1',
        from_currency: this.getTesouroIdentifier(),
        to_currency: 'BRL',
      });
      const probeReceive = Number(String(probeQuote.quote.toAmount || '').replace(',', '.'));
      const impliedRate = Number(String(probeQuote.quote.exchangeRate || '').replace(',', '.'));
      const brlPerTesouro = Number.isFinite(probeReceive) && probeReceive > 0
        ? probeReceive
        : (Number.isFinite(impliedRate) && impliedRate > 0 ? impliedRate : 1.154);
      amount = toStellarAmount(Number(targetBrl) / brlPerTesouro);
    }

    let quoteResult = await this.getQuoteForSession({
      session_id: context.sessionId,
      session_token: context.sessionToken,
      customer_id: customerResult.customer.id,
      direction: 'offramp',
      amount,
      from_currency: this.getTesouroIdentifier(),
      to_currency: 'BRL',
    });
    if (targetBrl) {
      const quotedReceive = Number(String(quoteResult.quote.toAmount || '').replace(',', '.'));
      const targetReceive = Number(targetBrl);
      if (Number.isFinite(quotedReceive) && quotedReceive > 0 && Math.abs(quotedReceive - targetReceive) > 0.01) {
        amount = toStellarAmount(Number(amount) * (targetReceive / quotedReceive));
        quoteResult = await this.getQuoteForSession({
          session_id: context.sessionId,
          session_token: context.sessionToken,
          customer_id: customerResult.customer.id,
          direction: 'offramp',
          amount,
          from_currency: this.getTesouroIdentifier(),
          to_currency: 'BRL',
        });
      }
    }

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
      ...(targetBrl ? { target_brl: targetBrl } : {}),
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

  private static async resolveTransferRecipient(userId: string, recipientQuery: string): Promise<{
    publicKey: string;
    displayName: string;
    pixKey?: string;
    sessionId?: string;
    userId?: string;
    vaultSecretId?: string;
  }> {
    const query = coalesceString(recipientQuery);
    if (!query) throw apiError('recipient is required for PIX-funded transfer.', 400);
    if (/^G[A-Z2-7]{55}$/i.test(query)) {
      return { publicKey: query, displayName: truncatePublicKey(query) };
    }

    const normalized = query.toLowerCase();
    const exactContact = await supabase
      .from('contacts')
      .select('contact_name, stellar_public_key, pix_key')
      .eq('owner_id', userId)
      .ilike('contact_name', query)
      .maybeSingle();
    if (exactContact.error) throw apiError(`Could not resolve transfer recipient: ${exactContact.error.message}`, 500);

    let contact = exactContact.data as any;
    if (!contact) {
      const fuzzy = await supabase
        .from('contacts')
        .select('contact_name, stellar_public_key, pix_key')
        .eq('owner_id', userId)
        .or(`contact_name.ilike.%${normalized}%,pix_key.ilike.%${normalized}%`)
        .limit(1)
        .maybeSingle();
      if (fuzzy.error) throw apiError(`Could not resolve transfer recipient: ${fuzzy.error.message}`, 500);
      contact = fuzzy.data as any;
    }

    const contactPublicKey = coalesceString(contact?.stellar_public_key);
    if (contactPublicKey) {
      const walletRepository = new WalletRepository(supabase);
      const destinationWallet = await walletRepository.getWalletByPublicKey(contactPublicKey).catch(() => null);
      return {
        publicKey: contactPublicKey,
        displayName: coalesceString(contact?.contact_name) || query,
        pixKey: coalesceString(contact?.pix_key) || undefined,
        sessionId: coalesceString(destinationWallet?.session_id) || undefined,
        vaultSecretId: coalesceString(destinationWallet?.vault_secret_id) || undefined,
      };
    }

    const walletByPix = await supabase
      .from('wallets')
      .select('public_key, name, pix_key, session_id, vault_secret_id')
      .ilike('pix_key', normalized)
      .limit(1)
      .maybeSingle();
    if (walletByPix.error) throw apiError(`Could not resolve recipient wallet: ${walletByPix.error.message}`, 500);
    if (walletByPix.data?.public_key) {
      return {
        publicKey: String(walletByPix.data.public_key),
        displayName: coalesceString(walletByPix.data.name) || query,
        pixKey: coalesceString(walletByPix.data.pix_key) || undefined,
        sessionId: coalesceString(walletByPix.data.session_id) || undefined,
        vaultSecretId: coalesceString(walletByPix.data.vault_secret_id) || undefined,
      };
    }

    throw apiError(`Recipient "${query}" was not found in contacts or TalkToStellar wallets.`, 404);
  }

  static async submitPixFundedTransferForSession(input: PixFundedTransferInput): Promise<Record<string, unknown>> {
    if (!this.getRuntimeInfo().sandbox) {
      throw apiError('PIX-funded transfer automation is available only in Etherfuse sandbox/devnet.', 403);
    }

    const context = await this.resolveSessionWallet(input);
    this.requireWalletPin(input, context);
    if (!context.vaultSecretId) {
      throw apiError('Source wallet secret is unavailable for the current TalkToStellar session.', 409);
    }

    const amount = normalizeAmount(input.amount, 'amount');
    const assetCode = normalizeAssetCode(coalesceString(input.asset_code, input.assetCode) || 'BRL');
    if (!['BRL', 'USDC'].includes(assetCode)) {
      throw apiError('PIX-funded transfer can only expose BRL or USDC to the user.', 400);
    }

    const asset = resolveConfiguredAsset(assetCode);
    if (asset.code === 'XLM' || !asset.issuer) {
      throw apiError(`${assetCode} is not configured for PIX-funded transfer.`, 400);
    }

    const recipient = await this.resolveTransferRecipient(context.userId, coalesceString(input.recipient, input.recipient_query, input.recipientQuery));
    if (recipient.vaultSecretId) {
      const destinationSecret = await new VaultService(supabase).getSecret(recipient.vaultSecretId);
      const trustline = await StellarService.ensureTrustlineFromSecret({
        sourceSecret: destinationSecret,
        assetCode: asset.code,
        assetIssuer: asset.issuer,
      });
      if (!trustline.success) {
        throw apiError(`Could not activate ${asset.code} for recipient: ${trustline.error || 'unknown trustline error'}`, 409);
      }
    }

    const sourceSecret = await new VaultService(supabase).getSecret(context.vaultSecretId);
    const result = await StellarService.submitAssetPaymentFromSecret({
      sourceSecret,
      destination: recipient.publicKey,
      amount: toStellarAmount(amount),
      assetCode: asset.code,
      assetIssuer: asset.issuer,
      memoText: 'PIX funded',
    });

    if (!result.success) {
      throw apiError(result.error || 'Could not submit PIX-funded transfer.', 400);
    }

    const route = {
      selected: `${asset.code} direto`,
      criteria: 'menor custo após a conversão do PIX',
      reason: `O saldo final já estava em ${asset.code}; enviar direto evita conversão extra antes de chegar em ${recipient.displayName}.`,
    };
    const routeContext = `Escolhemos a melhor rota para essa conversão: ${route.selected}. ${route.reason}`;
    let receiptUrl = '';
    try {
      receiptUrl = await PaymentReceiptService.sendReceipt({
        type: 'payment_sent',
        sessionId: context.sessionId,
        userId: context.userId,
        counterpartyLabel: recipient.displayName,
        sourceAmount: amount,
        sourceAssetCode: asset.code,
        destinationAmount: amount,
        destinationAssetCode: asset.code,
        hash: result.hash || null,
        status: 'completed',
        contextMessage: routeContext,
      });
    } catch (error) {
      console.warn('[ramp] Could not send PIX-funded transfer receipt:', debugErrorMessage(error));
    }

    if (recipient.sessionId) {
      try {
        const recipientSession = await new AgentRepository(supabase).getSession(recipient.sessionId);
        await PaymentReceiptService.sendReceipt({
          type: 'payment_received',
          sessionId: recipient.sessionId,
          userId: coalesceString(recipientSession?.user_id) || recipient.sessionId,
          counterpartyLabel: 'PIX via TalkToStellar',
          sourceAmount: amount,
          sourceAssetCode: asset.code,
          destinationAmount: amount,
          destinationAssetCode: asset.code,
          hash: result.hash || null,
          status: 'completed',
          contextMessage: routeContext,
        });
      } catch (error) {
        console.warn('[ramp] Could not send recipient PIX-funded transfer receipt:', debugErrorMessage(error));
      }
    }

    return {
      success: true,
      sandbox: true,
      order_id: coalesceString(input.order_id, input.orderId) || undefined,
      operation_id: coalesceString(input.operation_id, input.operationId) || undefined,
      source_public_key: context.publicKey,
      recipient_public_key: recipient.publicKey,
      recipient_name: recipient.displayName,
      recipient_pix_key: recipient.pixKey,
      amount,
      asset_code: asset.code,
      asset_issuer: asset.issuer,
      transaction_hash: result.hash,
      receipt_url: receiptUrl,
      route_summary: routeContext,
      route,
      message: `PIX confirmado e transferencia de ${formatDisplayAmount(amount, asset.code)} enviada para ${recipient.displayName}.`,
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
