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
import { mockPolicySnapshot } from '../../config/mock-policy';
import {
  assetMatchesConfiguredIssuer,
  ETHERFUSE_TESOURO_ISSUER,
  getAssetIssuer,
  getUserFacingAssetCodes,
  normalizeAssetCode,
  resolveConfiguredAsset,
  settlementAssetCode,
  userFacingAssetCode,
} from '../../config/assets';
import { AgentRepository } from '../repository/core/agent.repository';
import { WalletInfo, WalletRepository } from '../repository/core/wallet.repository';
import VaultService from './core/vault.service';
import { isSessionExpired } from '../../utils/session-expiry';
import { OperationRepository } from '../repository/operation.repository';
import { EconomyEngineService } from './economy-engine.service';
import { PaymentReceiptService } from './payment-receipt.service';
import { StellarService } from './stellar.service';
import { BrlReferenceRateService } from './brl-reference-rate.service';
import { PlatformFeeService } from './platform-fee.service';
import { ConversionRateMatrixService } from './conversion-rate-matrix.service';
import { DefindexYieldAction, DefindexYieldService } from './defindex-yield.service';
import { TrustlineService } from './trustline.service';
import { normalizeHumanAmountText, parseHumanAmountNumber } from '../../utils/amount';
import { verifyWalletPin } from '../../utils/pin-hash';
import { logger } from '../../utils/logger';
import { errorLogFields, errorLogMessage } from '../../utils/error-log';
import { publicErrorCode } from '../../utils/public-error';
import { sleep } from '../../utils/async';
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
  language?: string;
  lang?: string;
  locale?: string;
  intent_id?: string;
  intentId?: string;
  operation_key?: string;
  operationKey?: string;
  request_id?: string;
  requestId?: string;
  pin?: string;
  wallet_pin?: string;
  walletPin?: string;
  wallet_code?: string;
  walletCode?: string;
  passcode?: string;
  trusted_internal?: boolean;
  provider?: string;
  providerUserId?: string;
  provider_user_id?: string;
  source?: string;
  external_provider?: string;
  externalProvider?: string;
  external_provider_user_id?: string;
  externalProviderUserId?: string;
  session_scope?: string;
  sessionScope?: string;
  session_source?: string;
  sessionSource?: string;
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
  desired_final_amount?: string;
  desiredFinalAmount?: string;
  desired_final_asset?: string;
  desiredFinalAsset?: string;
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
  desired_final_amount?: string;
  desiredFinalAmount?: string;
  desired_final_asset?: string;
  desiredFinalAsset?: string;
  post_conversion_asset?: string;
  postConversionAsset?: string;
  post_conversion_asset_code?: string;
  postConversionAssetCode?: string;
  auto_pay_after_ramp?: boolean;
  autoPayAfterRamp?: boolean;
  auto_pay_recipient?: string;
  autoPayRecipient?: string;
  auto_pay_recipient_key?: string;
  autoPayRecipientKey?: string;
  auto_pay_recipient_public_key?: string;
  autoPayRecipientPublicKey?: string;
  auto_pay_amount?: string;
  autoPayAmount?: string;
  auto_pay_asset_code?: string;
  autoPayAssetCode?: string;
  auto_pay_destination_asset_code?: string;
  autoPayDestinationAssetCode?: string;
  auto_pay_dedupe_key?: string;
  autoPayDedupeKey?: string;
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
  source_amount?: string;
  sourceAmount?: string;
  source_asset_code?: string;
  sourceAssetCode?: string;
  source_asset_issuer?: string;
  sourceAssetIssuer?: string;
  target_brl?: string;
  targetBrl?: string;
  force_sandbox_mock?: boolean;
  forceSandboxMock?: boolean;
  fiat_account_id?: string;
  fiatAccountId?: string;
  bank_account_id?: string;
  bankAccountId?: string;
  destination_pix_key?: string;
  destinationPixKey?: string;
  pix_key?: string;
  pixKey?: string;
  pix_key_type?: string;
  pixKeyType?: string;
  external_bank_account?: Record<string, unknown>;
  externalBankAccount?: Record<string, unknown>;
  memo?: string;
}

interface PreviewOffRampForSessionInput extends RampSessionInput {
  amount?: string;
  amount_currency?: string;
  amountCurrency?: string;
  asset_code?: string;
  assetCode?: string;
  source_asset_code?: string;
  sourceAssetCode?: string;
  source_amount?: string;
  sourceAmount?: string;
  fiat_amount?: string;
  fiatAmount?: string;
  target_brl?: string;
  targetBrl?: string;
  to_amount?: string;
  toAmount?: string;
  customer_id?: string;
  customerId?: string;
}

interface RampOrderStatusInput extends RampSessionInput {
  order_id?: string;
  orderId?: string;
  operation_id?: string;
  operationId?: string;
}

interface ExternalBankAccountInput extends RampSessionInput {}

interface SubmitOffRampForSessionInput extends RampSessionInput {
  order_id?: string;
  orderId?: string;
  unsigned_xdr?: string;
  unsignedXdr?: string;
  operation_id?: string;
  operationId?: string;
  external_bank_account?: Record<string, unknown>;
  externalBankAccount?: Record<string, unknown>;
  skip_receipt?: boolean;
  skipReceipt?: boolean;
}

interface PixFundedTransferInput extends RampSessionInput {
  recipient?: string;
  recipient_query?: string;
  recipientQuery?: string;
  recipient_name?: string;
  recipientName?: string;
  recipient_key?: string;
  recipientKey?: string;
  recipient_email?: string;
  recipientEmail?: string;
  recipient_public_key?: string;
  recipientPublicKey?: string;
  amount?: string;
  asset_code?: string;
  assetCode?: string;
  source_asset_code?: string;
  sourceAssetCode?: string;
  destination_asset_code?: string;
  destinationAssetCode?: string;
  order_id?: string;
  orderId?: string;
  operation_id?: string;
  operationId?: string;
  dedupe_key?: string;
  dedupeKey?: string;
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
  desiredFinalAmount?: string;
  desiredFinalAssetCode?: string;
  finalConversionHash?: string;
  finalConversionSourceAmount?: string;
  finalConversionError?: string;
  postConversionAssetCode?: string;
  postConversionAssetIssuer?: string;
  postConversionHash?: string;
  postConversionSourceAmount?: string;
  postConversionAmount?: string;
  postConversionError?: string;
  operationId?: string;
  deliveryHash?: string;
  deliverySourceAmount?: string;
  deliveryError?: string;
  upstreamError?: string;
  operationContext?: Record<string, unknown>;
  receiptUrl?: string;
  postConversionReceiptUrl?: string;
}

interface SandboxMockOffRampOrder {
  transaction: OffRampTransaction;
  userId: string;
  sessionId: string;
  publicKey: string;
  amountTesouro: string;
  sourceAmount?: string;
  sourceAssetCode?: string;
  sourceAssetIssuer?: string;
  targetBrl?: string;
  destinationBrl?: string;
  externalBankAccount?: Record<string, unknown>;
  operationId?: string;
  submitHash?: string;
  submitError?: string;
}

interface ResolveWalletByEmailInput {
  email?: string;
}

function apiError(message: string, statusCode = 400, code?: string): Error {
  const error = new Error(message) as Error & { statusCode?: number; code?: string };
  error.statusCode = statusCode;
  if (code) error.code = code;
  return error;
}

function normalizeAmount(value: unknown, label = 'amount'): string {
  const amount = normalizeHumanAmountText(value);
  if (!/^\d+(\.\d+)?$/.test(amount) || Number(amount) <= 0) {
    throw apiError(`${label} must be a positive decimal amount.`, 400);
  }
  return amount;
}

function toStellarAmount(value: unknown): string {
  const amount = parseHumanAmountNumber(value);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw apiError('amount must be a positive decimal amount.', 400);
  }
  return amount.toFixed(7);
}

function formatDecimalAmount(value: unknown): string {
  const amount = parseHumanAmountNumber(value);
  if (!Number.isFinite(amount) || amount <= 0) return '0';
  return amount.toFixed(7).replace(/\.?0+$/, '');
}

const DEFINDEX_CONTRACT_DECIMALS = 7;
const DEFINDEX_CONTRACT_SCALE = BigInt(10) ** BigInt(DEFINDEX_CONTRACT_DECIMALS);

function normalizeDefindexNumberText(value: unknown): string {
  return String(value ?? '').trim().replace(/\s+/g, '').replace(',', '.');
}

function decimalDefindexAmount(value: unknown): string {
  const raw = normalizeDefindexNumberText(value);
  if (!/^\d+(\.\d+)?$/.test(raw)) return '';
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? formatDecimalAmount(parsed) : '';
}

function defindexAmountFromContractUnits(value: unknown): string {
  const raw = normalizeDefindexNumberText(value);
  if (!/^\d+$/.test(raw)) return decimalDefindexAmount(value);
  const units = BigInt(raw);
  if (units <= BigInt(0)) return '';
  const whole = units / DEFINDEX_CONTRACT_SCALE;
  const fraction = (units % DEFINDEX_CONTRACT_SCALE)
    .toString()
    .padStart(DEFINDEX_CONTRACT_DECIMALS, '0')
    .replace(/0+$/, '');
  return fraction ? `${whole.toString()}.${fraction}` : whole.toString();
}

function defindexAmountFromUnitArray(value: unknown): string {
  if (!Array.isArray(value)) return defindexAmountFromContractUnits(value);
  let total = BigInt(0);
  for (const item of value) {
    const raw = normalizeDefindexNumberText(item);
    if (/^\d+$/.test(raw)) total += BigInt(raw);
  }
  return total > BigInt(0) ? defindexAmountFromContractUnits(total.toString()) : '';
}

function extractDefindexBalanceAmountDecimal(value: any): string {
  if (value === null || value === undefined) return '0';
  if (typeof value === 'string' || typeof value === 'number') return defindexAmountFromContractUnits(value) || '0';
  if (Array.isArray(value)) return defindexAmountFromUnitArray(value) || '0';
  if (typeof value !== 'object') return '0';

  const decimalCandidates = [
    value.amount_decimal,
    value.amountDecimal,
    value.balance_decimal,
    value.balanceDecimal,
    value.display_amount,
    value.displayAmount,
  ];
  const decimalFound = decimalCandidates
    .map((candidate) => decimalDefindexAmount(candidate))
    .find((candidate) => Number(candidate) > 0);
  if (decimalFound) return decimalFound;

  const unitCandidates = [
    value.underlyingBalance,
    value.underlying_balance,
    value.underlyingBalances,
    value.underlying_balances,
    value.assetBalance,
    value.asset_balance,
    value.balance,
    value.amount,
    value.total,
    value.shares,
    value.dfTokens,
  ];
  const unitFound = unitCandidates
    .map((candidate) => defindexAmountFromUnitArray(candidate))
    .find((candidate) => Number(candidate) > 0);
  return unitFound || '0';
}

function formatCentsCeil(value: unknown): string {
  const amount = parseHumanAmountNumber(value);
  if (!Number.isFinite(amount) || amount <= 0) return '0';
  return (Math.ceil((amount - Number.EPSILON) * 100) / 100).toFixed(2);
}

function configuredEtherfuseOnRampFeeBps(): number {
  const parsed = parseHumanAmountNumber(
    process.env.ETHERFUSE_ONRAMP_FEE_BPS ||
    process.env.ETHERFUSE_TESTNET_FEE_BPS ||
    '20',
  );
  if (!Number.isFinite(parsed) || parsed < 0) return 20;
  return Math.min(parsed, 1000);
}

function formatDisplayAmount(value: unknown, assetCode: string): string {
  const amount = normalizeHumanAmountText(value) || '0';
  const code = normalizeAssetCode(assetCode) === 'TESOURO' ? 'BRL' : normalizeAssetCode(assetCode);
  const numeric = Number(amount);
  if (Number.isFinite(numeric)) {
    if (code === 'BRL') return `R$ ${numeric.toFixed(2).replace('.', ',')}`;
    if (code === 'USDC') return `US$ ${numeric.toFixed(2)}`;
    return `${numeric.toFixed(2)} ${code}`;
  }
  return `${amount} ${code}`;
}

function receiptBrlFeeFromContext(
  context: Record<string, unknown> | undefined,
  sourceAmountBrl?: unknown,
  destinationAmountBrl?: unknown,
): { feeDisplay?: string; feeBrl?: string } {
  const providerFee = parseHumanAmountNumber(coalesceString(
    context?.provider_onramp_fee_amount,
    context?.provider_offramp_fee_amount,
    context?.provider_withdrawal_fee_amount,
    context?.provider_fee_amount,
    context?.anchor_provider_fee_amount,
    context?.anchorProviderFeeAmount,
    context?.providerFeeAmount,
    context?.feeAmount,
  ));
  const appFee = parseHumanAmountNumber(coalesceString(
    context?.talktostellar_transaction_fee_amount,
    context?.talkToStellarFeeAmount,
    context?.app_fee_amount,
    context?.platform_fee_amount,
  ));
  const totalFromContext = parseHumanAmountNumber(coalesceString(
    context?.total_fee_amount,
    context?.totalFeeAmount,
    context?.total_fee_brl,
    context?.actual_fee_brl,
  ));
  const source = parseHumanAmountNumber(sourceAmountBrl);
  const destination = parseHumanAmountNumber(destinationAmountBrl);
  const deltaFee = Number.isFinite(source) && Number.isFinite(destination) && source > destination
    ? source - destination
    : 0;
  const summedFee = (Number.isFinite(providerFee) && providerFee > 0 ? providerFee : 0) +
    (Number.isFinite(appFee) && appFee > 0 ? appFee : 0);
  const fee = [totalFromContext, summedFee, deltaFee]
    .find((value) => Number.isFinite(value) && value > 0) || 0;

  if (!fee) return {};
  return {
    feeDisplay: `R$ ${fee.toFixed(2)}`,
    feeBrl: fee.toFixed(8),
  };
}

function truncatePublicKey(value: string): string {
  return value ? `${value.slice(0, 7)}...${value.slice(-7)}` : 'wallet';
}

function stableHex(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function normalizeRampIntentId(input: RampSessionInput): string {
  return coalesceString(input.intent_id, input.intentId, input.operation_key, input.operationKey)
    .replace(/[^A-Za-z0-9._:-]/g, '')
    .slice(0, 96);
}

function normalizeRampLanguage(value: unknown): 'pt-BR' | 'en' | '' {
  const normalized = coalesceString(value).toLowerCase();
  if (!normalized) return '';
  if (normalized === 'en' || normalized.startsWith('en-') || normalized.includes('english') || normalized.includes('ingles')) {
    return 'en';
  }
  return 'pt-BR';
}

function rampInputLanguage(input: RampSessionInput): 'pt-BR' | 'en' | undefined {
  return normalizeRampLanguage(coalesceString(input.language, input.lang, input.locale)) || undefined;
}

function rampContextLanguage(context?: Record<string, unknown> | null): 'pt-BR' | 'en' | undefined {
  if (!context) return undefined;
  return normalizeRampLanguage(coalesceString(context.language, context.lang, context.locale)) || undefined;
}

function rampText(language: 'pt-BR' | 'en' | undefined, pt: string, en: string): string {
  return language === 'en' ? en : pt;
}

function externalChannelProvider(input: RampSessionInput): string {
  const provider = coalesceString(
    input.external_provider,
    input.externalProvider,
    input.provider,
    input.session_scope,
    input.sessionScope,
    input.session_source,
    input.sessionSource,
    input.source,
  ).toLowerCase();
  if (provider.includes('telegram')) return 'telegram';
  if (provider.includes('whatsapp') || provider === 'phone' || provider === 'evolution') return 'whatsapp';
  return '';
}

function externalChannelProviderUserId(input: RampSessionInput): string {
  return coalesceString(input.external_provider_user_id, input.externalProviderUserId, input.provider_user_id, input.providerUserId);
}

function normalizeRampUserAsset(...values: unknown[]): { code: string; issuer?: string; identifier: string } {
  const raw = normalizeAssetCode(coalesceString(...values) || 'BRL');
  const userCode = raw === 'TESOURO' ? 'BRL' : raw;
  const configured = new Set(['BRL', 'USDC', 'XLM', ...getUserFacingAssetCodes().map(userFacingAssetCode)]);
  if (!configured.has(userCode)) {
    throw apiError('Este ativo ainda não está disponível para PIX neste ambiente.', 400);
  }
  const asset = resolveConfiguredAsset(userCode);
  return { ...asset, identifier: assetIdentifier(asset) };
}

function isBrlSettlementAsset(asset: { code: string; issuer?: string }): boolean {
  const code = settlementAssetCode(asset.code);
  return code === 'TESOURO' || code === 'BRL';
}

function buildExternalBankAccountFields(context: SessionWalletContext) {
  const hash = stableHex(`${context.publicKey}:${context.email || context.userId}`);
  const numeric = BigInt(`0x${hash.slice(0, 12)}`).toString().padStart(14, '0');
  const email = String(context.email || '').trim().toLowerCase();
  return {
    label: 'Seu PIX',
    institution: 'Destino PIX vinculado',
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

function estimateTesouroFromBrl(amountBrl: string): string {
  const brl = Number(String(amountBrl || '0').replace(',', '.'));
  return toStellarAmount(brl);
}

function formatPixAmount(value: string): string {
  const amount = parseHumanAmountNumber(value);
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
    pixTlv('59', sanitizePixText(input.merchantName, 25) || 'TalkToStellar'),
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

function isUuidLike(value: unknown): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    coalesceString(value),
  );
}

function providerFiatAccountIdFromExternalBankAccount(value: unknown): string {
  if (!value || typeof value !== 'object') return '';
  const record = value as Record<string, unknown>;
  const metadata = record.metadata && typeof record.metadata === 'object'
    ? record.metadata as Record<string, unknown>
    : {};
  return coalesceString(
    record.provider_fiat_account_id,
    record.providerFiatAccountId,
    record.fiat_account_id,
    record.fiatAccountId,
    record.bank_account_id,
    record.bankAccountId,
    metadata.provider_fiat_account_id,
    metadata.providerFiatAccountId,
    metadata.fiat_account_id,
    metadata.fiatAccountId,
    metadata.bank_account_id,
    metadata.bankAccountId,
  );
}

function pixKeyFromExternalBankAccount(value: unknown): string {
  if (!value || typeof value !== 'object') return '';
  const record = value as Record<string, unknown>;
  const metadata = record.metadata && typeof record.metadata === 'object'
    ? record.metadata as Record<string, unknown>
    : {};
  return coalesceString(
    record.pix_key,
    record.pixKey,
    metadata.pix_key,
    metadata.pixKey,
  );
}

function pixKeyTypeFromValue(value: unknown, fallback?: unknown): string {
  const explicit = coalesceString(fallback).toLowerCase();
  if (explicit) return explicit;
  const pixKey = coalesceString(value);
  const digits = pixKey.replace(/\D+/g, '');
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(pixKey)) return 'email';
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(pixKey)) return 'evp';
  if (digits.length === 11 && (/^\d{11}$/.test(pixKey) || /^\d{3}\.\d{3}\.\d{3}-\d{2}$/.test(pixKey))) return 'cpf';
  if (digits.length === 14 && (/^\d{14}$/.test(pixKey) || /^\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$/.test(pixKey))) return 'cnpj';
  if (/^\+?\d[\d\s().-]{7,}$/.test(pixKey)) return 'phone';
  return 'evp';
}

function pixDestinationFromRampInput(input: Record<string, unknown>, externalBankAccount: unknown): {
  pixKey: string;
  pixKeyType: string;
  externalBankAccount?: Record<string, unknown>;
} {
  const externalRecord = externalBankAccount && typeof externalBankAccount === 'object'
    ? externalBankAccount as Record<string, unknown>
    : undefined;
  const pixKey = coalesceString(
    input.destination_pix_key,
    input.destinationPixKey,
    input.pix_key,
    input.pixKey,
    pixKeyFromExternalBankAccount(externalRecord),
  );
  const pixKeyType = pixKeyTypeFromValue(
    pixKey,
    coalesceString(
      input.pix_key_type,
      input.pixKeyType,
      externalRecord?.pix_key_type,
      externalRecord?.pixKeyType,
    ),
  );
  return {
    pixKey,
    pixKeyType,
    externalBankAccount: pixKey
      ? {
          ...(externalRecord || {}),
          pix_key: pixKey,
          pix_key_type: pixKeyType,
        }
      : externalRecord,
  };
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

function envFlag(name: string, fallback = false): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw === null || raw === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(raw).trim().toLowerCase());
}

function isTerminalRampStatus(status: string): boolean {
  return ['completed', 'failed', 'expired', 'cancelled', 'canceled', 'refunded'].includes(
    String(status || '').toLowerCase(),
  );
}

function isFailedRampStatus(status: string): boolean {
  return ['failed', 'expired', 'cancelled', 'canceled', 'refunded'].includes(
    String(status || '').toLowerCase(),
  );
}

function isDuplicateResourceError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error || '');
  return /already|duplicate|exists|409|conflict/i.test(message);
}

function debugErrorMessage(error: unknown): string {
  return errorLogMessage(error);
}

function maskLogValue(value: unknown, start = 6, end = 4): string | undefined {
  const text = String(value || '').trim();
  if (!text) return undefined;
  if (text.length <= start + end + 3) return `${text.slice(0, 2)}...`;
  return `${text.slice(0, start)}...${text.slice(-end)}`;
}

function defindexErrorFields(error: unknown): Record<string, unknown> {
  return errorLogFields(error);
}

function classifyDefindexBuildFailure(error: unknown): {
  code: 'yield_account_setup_required' | 'yield_asset_incompatible' | 'yield_asset_conversion_required' | 'yield_asset_conversion_unavailable' | 'insufficient_balance' | 'yield_execution_unavailable';
  reason: string;
  setupRequired: boolean;
} {
  const fields = defindexErrorFields(error);
  const text = `${debugErrorMessage(error)} ${JSON.stringify(fields)}`.toLowerCase();
  if (/missing\s*trustline|missingtrustline|trustline|trust line/.test(text)) {
    return {
      code: 'yield_account_setup_required',
      reason: 'Aplicação preparada. Não precisa criar outra conta; falta ativar esta moeda para confirmação nesta conta. Tente novamente em alguns segundos ou escolha outra opção.',
      setupRequired: true,
    };
  }
  if (/insufficient|underfunded|not enough|saldo|balance/.test(text)) {
    return {
      code: 'insufficient_balance',
      reason: 'Aplicação preparada, mas o saldo disponível não é suficiente para confirmar este valor.',
      setupRequired: false,
    };
  }
  return {
    code: 'yield_execution_unavailable',
    reason: 'Aplicação preparada. A confirmação por PIN ainda não está disponível para esta opção; tente novamente em alguns segundos ou escolha outra opção.',
    setupRequired: false,
  };
}

function defindexRequestId(input: RampSessionInput): string | undefined {
  return coalesceString(input.request_id, input.requestId) || undefined;
}

function logDefindex(level: 'debug' | 'info' | 'warn' | 'error', event: string, fields: Record<string, unknown> = {}): void {
  const safeFields: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined || value === null || value === '') continue;
    if (!key.startsWith('has_') && /pin|secret|token|xdr|raw/i.test(key)) {
      safeFields[key] = '[redacted]';
      continue;
    }
    safeFields[key] = value;
  }
  logger[level](`[defindex] event=${event} ${JSON.stringify(safeFields)}`);
}

function onboardingStepHasError(value: unknown): boolean {
  return Boolean(value && typeof value === 'object' && 'error' in (value as Record<string, unknown>));
}

function onboardingBankAccountReady(value: unknown): boolean {
  if (!value) return false;
  if (typeof value === 'string') return /already|registered|created|approved|ok/i.test(value);
  if (onboardingStepHasError(value)) return false;
  if (typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  const status = String(record.status || record.complianceStatus || record.state || '').toLowerCase();
  return Boolean(
    coalesceString(record.bankAccountId, record.id, record.fiatAccountId) ||
      !status ||
      ['approved', 'active', 'created', 'compliant', 'pending', 'verified'].includes(status),
  );
}

type NormalizedWalletBalance = {
  asset_code: string;
  asset_issuer?: string;
  balance: string;
};

function normalizeBalances(balances: any[]): NormalizedWalletBalance[] {
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

function mergeBalanceAdjustments(
  balances: NormalizedWalletBalance[],
  adjustments: NormalizedWalletBalance[],
): NormalizedWalletBalance[] {
  const byKey = new Map<string, NormalizedWalletBalance & { numericBalance: number }>();
  const keyFor = (balance: NormalizedWalletBalance) => `${normalizeAssetCode(balance.asset_code)}:${balance.asset_issuer || ''}`;

  for (const balance of balances) {
    const key = keyFor(balance);
    const numericBalance = parseHumanAmountNumber(balance.balance);
    byKey.set(key, {
      ...balance,
      numericBalance: Number.isFinite(numericBalance) ? numericBalance : 0,
    });
  }

  for (const adjustment of adjustments) {
    const amount = parseHumanAmountNumber(adjustment.balance);
    if (!Number.isFinite(amount) || amount <= 0) continue;
    const key = keyFor(adjustment);
    const existing = byKey.get(key);
    byKey.set(key, {
      asset_code: normalizeAssetCode(adjustment.asset_code),
      asset_issuer: adjustment.asset_issuer,
      numericBalance: (existing?.numericBalance || 0) + amount,
      balance: '0',
    });
  }

  return Array.from(byKey.values()).map(({ numericBalance, ...balance }) => ({
    ...balance,
    balance: formatDecimalAmount(numericBalance),
  }));
}

function assertSufficientBalance(
  balances: Array<{ asset_code: string; asset_issuer?: string; balance: string }>,
  asset: { code: string; issuer?: string },
  amount: string,
): void {
  const assetCode = normalizeAssetCode(settlementAssetCode(asset.code));
  const displayAssetCode = userFacingAssetCode(assetCode);
  const expectedIssuer = String(asset.issuer || getAssetIssuer(assetCode) || '').trim();
  const requested = parseHumanAmountNumber(amount);
  const available = balances
    .filter((balance) => (
      normalizeAssetCode(balance.asset_code) === assetCode &&
      (assetCode === 'XLM' || String(balance.asset_issuer || '') === expectedIssuer)
    ))
    .reduce((sum, balance) => sum + parseHumanAmountNumber(balance.balance), 0);

  if (available + 0.0000001 < requested) {
    throw apiError(
      `Saldo insuficiente para esta retirada. Disponível: ${formatDisplayAmount(available.toFixed(7), displayAssetCode)}. ` +
      `Valor solicitado: ${formatDisplayAmount(requested.toFixed(7), displayAssetCode)}.`,
      409,
    );
  }
}

function rawIssuedBalanceAmount(
  balances: any[],
  asset: { code: string; issuer?: string },
): number {
  const assetCode = normalizeAssetCode(asset.code);
  const issuer = String(asset.issuer || '').trim();
  const match = (Array.isArray(balances) ? balances : []).find((balance) => {
    const balanceCode = normalizeAssetCode(balance?.asset_code || (balance?.asset_type === 'native' ? 'XLM' : ''));
    if (assetCode !== balanceCode) return false;
    if (assetCode === 'XLM') return true;
    return String(balance?.asset_issuer || '').trim() === issuer;
  });
  return parseHumanAmountNumber(match?.balance || '0');
}

function accountXlmBalanceAmount(account: any): number {
  const balance = (Array.isArray(account?.balances) ? account.balances : []).find((item: any) => (
    item?.asset_type === 'native' || normalizeAssetCode(item?.asset_code) === 'XLM'
  ));
  return parseHumanAmountNumber(balance?.balance || '0');
}

function accountMinimumXlmReserve(account: any): number {
  const baseReserve = Math.max(0.5, parseHumanAmountNumber(process.env.STELLAR_BASE_RESERVE_XLM || '0.5'));
  const floorReserve = Math.max(0, parseHumanAmountNumber(process.env.DEFINDEX_MIN_XLM_KEEP || process.env.STELLAR_MIN_XLM_RESERVE || '1.5'));
  const subentries = Math.max(0, Number(account?.subentry_count || 0));
  const sponsoring = Math.max(0, Number(account?.num_sponsoring || 0));
  const sponsored = Math.max(0, Number(account?.num_sponsored || 0));
  const calculatedReserve = Math.max(0, (2 + subentries + sponsoring - sponsored) * baseReserve);
  const feeBuffer = Math.max(0, parseHumanAmountNumber(process.env.DEFINDEX_XLM_FEE_BUFFER || '0.05'));
  return Math.max(floorReserve, calculatedReserve) + feeBuffer;
}

function accountSpendableXlmAmount(account: any): { total: number; reserve: number; spendable: number } {
  const total = accountXlmBalanceAmount(account);
  const reserve = accountMinimumXlmReserve(account);
  return {
    total,
    reserve,
    spendable: Math.max(0, total - reserve),
  };
}

function defindexSameCodeConversionSane(input: {
  requestedDestinationAmount: string;
  quotedSourceAmount?: unknown;
  quotedSourceMax?: unknown;
  maxPremiumPct?: number;
}): { sane: boolean; sourceAmount: number; sourceMax: number; maxAllowed: number; premiumPct: number } {
  const destination = Math.max(0, parseHumanAmountNumber(input.requestedDestinationAmount));
  const sourceAmount = Math.max(0, parseHumanAmountNumber(input.quotedSourceAmount));
  const sourceMax = Math.max(sourceAmount, parseHumanAmountNumber(input.quotedSourceMax));
  const maxPremiumPct = Number.isFinite(input.maxPremiumPct) ? Number(input.maxPremiumPct) : 2;
  const maxAllowed = destination * (1 + Math.max(0, maxPremiumPct) / 100);
  const premiumPct = destination > 0 ? ((sourceAmount / destination) - 1) * 100 : 0;
  return {
    sane: destination > 0 && sourceAmount > 0 && sourceAmount <= maxAllowed,
    sourceAmount,
    sourceMax,
    maxAllowed,
    premiumPct,
  };
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

function issuedAssetBalanceAmount(
  balances: any[],
  asset: { code: string; issuer?: string },
): number {
  const settlementCode = settlementAssetCode(asset.code);
  const normalized = normalizeBalances(balances).find((balance) => (
    normalizeAssetCode(balance.asset_code) === normalizeAssetCode(settlementCode) &&
    (normalizeAssetCode(settlementCode) === 'XLM' || assetMatchesConfiguredIssuer(settlementCode, balance.asset_issuer))
  ));
  const amount = Number(String(normalized?.balance || '0').replace(',', '.'));
  return Number.isFinite(amount) ? amount : 0;
}

function balanceDeltaAmount(before: any[], after: any[], asset: { code: string; issuer?: string }): number {
  return issuedAssetBalanceAmount(after, asset) - issuedAssetBalanceAmount(before, asset);
}

function sandboxSettlementBalancePollDelays(): number[] {
  const configured = String(process.env.SANDBOX_SETTLEMENT_BALANCE_POLL_MS || '').trim();
  if (configured) {
    const parsed = configured
      .split(',')
      .map((value) => Number(value.trim()))
      .filter((value) => Number.isFinite(value) && value >= 0);
    if (parsed.length > 0) return parsed;
  }
  return [800, 1500, 2500, 4000];
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

function unsafeSameSymbolConversionRatio(input: {
  sourceAsset: { code: string; issuer?: string };
  destinationAsset: { code: string; issuer?: string };
  sourceAmount: string;
  destinationAmount: string;
}): number | null {
  const sourceCode = normalizeAssetCode(input.sourceAsset.code);
  const destinationCode = normalizeAssetCode(input.destinationAsset.code);
  if (!sourceCode || sourceCode !== destinationCode) return null;
  if (sameIssuedAsset(input.sourceAsset, input.destinationAsset)) return null;

  const sourceAmount = parseHumanAmountNumber(input.sourceAmount);
  const destinationAmount = parseHumanAmountNumber(input.destinationAmount);
  if (!Number.isFinite(sourceAmount) || sourceAmount <= 0 || !Number.isFinite(destinationAmount) || destinationAmount <= 0) {
    return 0;
  }

  const ratio = destinationAmount / sourceAmount;
  const minimumRatio = Math.max(0.01, Number(process.env.DEFINDEX_MIN_SAME_ASSET_CONVERSION_RATIO || 0.98));
  return ratio < minimumRatio ? ratio : null;
}

function resolveRampFinalAsset(...values: unknown[]): { code: string; issuer?: string } {
  const raw = coalesceString(...values) || 'TESOURO';
  const parsed = parseIssuedAssetIdentifier(raw);
  const code = normalizeAssetCode(parsed.code || 'TESOURO');
  const settlementCode = code === 'BRL' ? 'TESOURO' : code;
  if (settlementCode !== 'TESOURO' && !getUserFacingAssetCodes().includes(settlementCode)) {
    throw apiError(`Asset final ${code} não é suportado para PIX ramp. Use BRL, USDC, CETES ou TESOURO.`, 400);
  }
  return resolveConfiguredAsset(settlementCode, parsed.issuer);
}

export class AnchorService {
  private static etherfuseClient?: EtherfuseClient;
  private static etherfuseConfigSignature?: string;
  private static programmaticOnboardingCache = new Map<string, { cryptoWalletId?: string }>();
  private static sandboxMockOnRampOrders = new Map<string, SandboxMockOnRampOrder>();
  private static sandboxMockOffRampOrders = new Map<string, SandboxMockOffRampOrder>();
  private static sandboxPostConversionLocks = new Map<string, Promise<SandboxMockOnRampOrder>>();
  private static sandboxAutoPayLocks = new Map<string, Promise<Record<string, unknown> | null>>();

  static getTesouroIssuer(): string {
    return getAssetIssuer('TESOURO') || ETHERFUSE_TESOURO_ISSUER;
  }

  static getTesouroIdentifier(): string {
    return `TESOURO:${this.getTesouroIssuer()}`;
  }

  private static async resolveOffRampSourceForTarget(input: {
    publicKey: string;
    sourceAsset: { code: string; issuer?: string };
    requestedSourceAmount?: string;
    requestedTargetBrl?: string;
  }): Promise<{
    sourceAmount: string;
    targetBrl: string;
    estimatedTargetBrl: string;
    targetReceiveMode: boolean;
    sourceQuote?: Awaited<ReturnType<typeof StellarService.quotePathPayment>>;
  }> {
    const explicitSourceAmount = coalesceString(input.requestedSourceAmount);
    const explicitTargetBrl = coalesceString(input.requestedTargetBrl);
    const targetReceiveMode = Boolean(explicitTargetBrl);

    if (targetReceiveMode) {
      const targetBrl = normalizeAmount(explicitTargetBrl, 'target_brl');
      if (isBrlSettlementAsset(input.sourceAsset)) {
        const feeBridge = this.estimateOnRampBrlFeeBridge(targetBrl, null, targetBrl);
        return {
          sourceAmount: explicitSourceAmount ? normalizeAmount(explicitSourceAmount, 'source_amount') : feeBridge.grossAmount,
          targetBrl,
          estimatedTargetBrl: targetBrl,
          targetReceiveMode: true,
        };
      }

      if (normalizeAssetCode(input.sourceAsset.code) === 'USDC') {
        try {
          const quote = await StellarService.quotePathPayment({
            sourcePublicKey: input.publicKey,
            destination: input.publicKey,
            sourceAsset: input.sourceAsset,
            destAsset: { code: 'TESOURO', issuer: this.getTesouroIssuer() },
            destAmount: targetBrl,
          });

          return {
            sourceAmount: normalizeAmount(quote.sourceAmount, 'source_amount'),
            targetBrl,
            estimatedTargetBrl: targetBrl,
            targetReceiveMode: true,
            sourceQuote: quote,
          };
        } catch (error) {
          throw apiError(
            `Não consegui encontrar uma rota segura para entregar R$ ${targetBrl} a partir de USDC. ${debugErrorMessage(error)}`,
            409,
          );
        }
      }

      const quote = await StellarService.quotePathPayment({
        sourcePublicKey: input.publicKey,
        destination: input.publicKey,
        sourceAsset: input.sourceAsset,
        destAsset: { code: 'TESOURO', issuer: this.getTesouroIssuer() },
        destAmount: targetBrl,
      });

      return {
        sourceAmount: normalizeAmount(quote.sourceAmount, 'source_amount'),
        targetBrl,
        estimatedTargetBrl: targetBrl,
        targetReceiveMode: true,
        sourceQuote: quote,
      };
    }

    const sourceAmount = normalizeAmount(explicitSourceAmount || '1', 'source_amount');
    let estimatedTargetBrl = sourceAmount;
    if (normalizeAssetCode(input.sourceAsset.code) === 'USDC') {
      try {
        const referenceQuote = await BrlReferenceRateService.quoteUsdcToBrl(sourceAmount);
        estimatedTargetBrl = toStellarAmount(referenceQuote.destinationAmount);
      } catch (error) {
        throw apiError(
          `Não consegui encontrar uma rota segura de USDC para reais agora. ${debugErrorMessage(error)}`,
          409,
        );
      }
    } else if (!isBrlSettlementAsset(input.sourceAsset)) {
      const estimated = EconomyEngineService.estimateAmountInBrl({
        amount: sourceAmount,
        assetCode: input.sourceAsset.code,
      });
      if (estimated > 0) {
        estimatedTargetBrl = toStellarAmount(estimated);
      } else {
        const quote = await StellarService.quotePathPayment({
          sourcePublicKey: input.publicKey,
          destination: input.publicKey,
          sourceAsset: input.sourceAsset,
          destAsset: { code: 'TESOURO', issuer: this.getTesouroIssuer() },
          destAmount: '1',
        });
        const rate = parseHumanAmountNumber(quote.sourceAmount);
        const source = parseHumanAmountNumber(sourceAmount);
        estimatedTargetBrl = rate > 0 ? toStellarAmount(source / rate) : sourceAmount;
      }
    }

    return {
      sourceAmount,
      targetBrl: estimatedTargetBrl,
      estimatedTargetBrl,
      targetReceiveMode: false,
    };
  }

  private static decorateOnRampQuoteForFinalAsset(input: {
    quote: Quote;
    sourceAmountBrl: string;
    finalAsset?: { code: string; issuer?: string };
    desiredFinalAmount?: string;
    desiredFinalAssetCode?: string;
    desiredFinalConversionSourceAmount?: string;
  }): Quote {
    const quote = input.quote as Quote & Record<string, unknown>;
    const finalAsset = input.finalAsset;
    if (!finalAsset) return input.quote;

    const anchorAsset = { code: 'TESOURO', issuer: this.getTesouroIssuer() };
    const finalIsAnchor = sameIssuedAsset(finalAsset, anchorAsset);
    const desiredFinalAmount = coalesceString(input.desiredFinalAmount);
    const desiredFinalAssetCode = normalizeAssetCode(input.desiredFinalAssetCode || finalAsset.code);
    const exactFinalAmount = desiredFinalAmount && desiredFinalAssetCode === normalizeAssetCode(finalAsset.code)
      ? desiredFinalAmount
      : '';
    const desiredFinalConversionSourceAmount = coalesceString(input.desiredFinalConversionSourceAmount);
    const desiredAnchorNetAmount = finalIsAnchor && desiredFinalAmount && ['BRL', 'TESOURO'].includes(desiredFinalAssetCode)
      ? desiredFinalAmount
      : !finalIsAnchor && exactFinalAmount && desiredFinalConversionSourceAmount
        ? desiredFinalConversionSourceAmount
        : undefined;
    const brlFeeBridge = this.estimateOnRampBrlFeeBridge(
      input.sourceAmountBrl,
      quote,
      desiredAnchorNetAmount,
    );
    const anchorAmountBeforeFee = brlFeeBridge.grossAmount;
    const anchorAmountAfterFee = brlFeeBridge.netAmount;

    const decorated: Quote & Record<string, unknown> = {
      ...input.quote,
      sourceCurrency: 'BRL',
      sourceAmountBrl: input.sourceAmountBrl,
      anchorCurrency: this.getTesouroIdentifier(),
      anchorAsset,
      anchorAmountBeforeFee,
      anchorAmountAfterFee,
      anchorProviderFeeAmount: brlFeeBridge.providerFeeAmount,
      anchorProviderFeeCurrency: 'BRL',
    };

    if (finalIsAnchor) {
      const exactBrlAmount = desiredFinalAmount && ['BRL', 'TESOURO'].includes(desiredFinalAssetCode)
        ? desiredFinalAmount
        : brlFeeBridge.netAmount;
      decorated.userFacingToCurrency = 'BRL';
      decorated.userFacingToAmount = exactBrlAmount;
      decorated.finalCurrency = this.getTesouroIdentifier();
      decorated.finalAsset = anchorAsset;
      decorated.finalAmountBeforeFee = anchorAmountBeforeFee;
      decorated.finalAmountAfterFee = exactBrlAmount;
      decorated.finalConversionRequired = false;
      decorated.finalSettlementMode = 'stellar_asset';
      decorated.talkToStellarFeeAmount = brlFeeBridge.talkToStellarFeeAmount;
      decorated.talkToStellarFeeCurrency = 'BRL';
      decorated.totalFeeAmount = brlFeeBridge.totalFeeAmount;
      decorated.totalFeeCurrency = 'BRL';
      decorated.requestedFinalAmount = exactBrlAmount;
      decorated.requestedFinalAssetCode = 'BRL';
      return decorated;
    }

    decorated.userFacingToCurrency = assetIdentifier(finalAsset);
    decorated.finalCurrency = assetIdentifier(finalAsset);
    decorated.finalAsset = finalAsset;
    decorated.finalConversionRequired = true;
    decorated.finalConversionSourceCurrency = this.getTesouroIdentifier();
    decorated.finalConversionSourceAmount = anchorAmountAfterFee;
    decorated.finalConversionMode = exactFinalAmount
      ? `strict_receive_exact_${normalizeAssetCode(finalAsset.code).toLowerCase()}`
      : 'strict_send_anchor_tesouro';
    decorated.talkToStellarFeeAmount = brlFeeBridge.talkToStellarFeeAmount;
    decorated.talkToStellarFeeCurrency = 'BRL';
    decorated.totalFeeAmount = brlFeeBridge.totalFeeAmount;
    decorated.totalFeeCurrency = 'BRL';

    if (exactFinalAmount) {
      decorated.userFacingToAmount = exactFinalAmount;
      decorated.finalAmountBeforeFee = exactFinalAmount;
      decorated.finalAmountAfterFee = exactFinalAmount;
      decorated.requestedFinalAmount = exactFinalAmount;
      decorated.requestedFinalAssetCode = normalizeAssetCode(finalAsset.code);
    }

    return decorated;
  }

  private static async resolveOnRampSourceAmountForExactFinalAsset(input: {
    publicKey: string;
    finalAsset?: { code: string; issuer?: string };
    desiredFinalAmount?: string;
    desiredFinalAssetCode?: string;
    sourceAmountBrl?: string;
  }): Promise<{
    sourceAmountBrl: string;
    finalConversionSourceAmount?: string;
    finalConversionQuote?: Awaited<ReturnType<typeof StellarService.quotePathPayment>>;
  } | null> {
    const finalAsset = input.finalAsset;
    const desiredFinalAmount = coalesceString(input.desiredFinalAmount);
    if (!finalAsset || !desiredFinalAmount) return null;

    const anchorAsset = { code: 'TESOURO', issuer: this.getTesouroIssuer() };
    const finalIsAnchor = sameIssuedAsset(finalAsset, anchorAsset);
    const desiredFinalAssetCode = normalizeAssetCode(input.desiredFinalAssetCode || finalAsset.code);
    const desiredMatchesFinalAsset =
      desiredFinalAssetCode === normalizeAssetCode(finalAsset.code) ||
      (finalIsAnchor && ['BRL', 'TESOURO'].includes(desiredFinalAssetCode));
    if (!desiredMatchesFinalAsset) return null;

    const exactFinalAmount = normalizeAmount(desiredFinalAmount, 'desired_final_amount');
    if (finalIsAnchor) {
      const bridge = this.estimateOnRampBrlFeeBridge(input.sourceAmountBrl || exactFinalAmount, null, exactFinalAmount);
      return {
        sourceAmountBrl: bridge.grossAmount,
        finalConversionSourceAmount: exactFinalAmount,
      };
    }

    try {
      const conversionQuote = await StellarService.quotePathPayment({
        sourcePublicKey: input.publicKey,
        destination: input.publicKey,
        sourceAsset: anchorAsset,
        destAsset: finalAsset,
        destAmount: exactFinalAmount,
      });
      const requiredAnchorAmount = normalizeAmount(conversionQuote.sourceAmount, 'final_conversion_source_amount');
      const bridge = this.estimateOnRampBrlFeeBridge(input.sourceAmountBrl || requiredAnchorAmount, null, requiredAnchorAmount);
      return {
        sourceAmountBrl: bridge.grossAmount,
        finalConversionSourceAmount: requiredAnchorAmount,
        finalConversionQuote: conversionQuote,
      };
    } catch (error) {
      throw apiError(
        `Não consegui cotar a conversão dinâmica para entregar ${exactFinalAmount} ${normalizeAssetCode(finalAsset.code)}. Gere uma nova cotação em alguns segundos.`,
        409,
        'dynamic_final_asset_quote_unavailable',
      );
    }
  }

  private static estimateOnRampBrlFeeBridge(sourceAmountBrl: unknown, quote?: Record<string, unknown> | null, desiredNetAmountBrl?: unknown): {
    grossAmount: string;
    netAmount: string;
    providerFeeAmount: string;
    talkToStellarFeeAmount: string;
    totalFeeAmount: string;
  } {
    const gross = Math.max(0, parseHumanAmountNumber(sourceAmountBrl));
    const desiredNet = Math.max(0, parseHumanAmountNumber(desiredNetAmountBrl));
    const feeBase = desiredNet > 0 ? desiredNet : gross;
    const rawProviderFee = Math.max(0, parseHumanAmountNumber(
      coalesceString(
        quote?.feeAmount,
        quote?.fee,
        quote?.anchorProviderFeeAmount,
      ) || '0',
    ));
    const quoteFeeBps = Math.max(0, parseHumanAmountNumber(quote?.feeBps));
    const feeBps = quoteFeeBps > 0 ? quoteFeeBps : configuredEtherfuseOnRampFeeBps();
    const providerFee = desiredNet > 0
      ? feeBase * (feeBps / 10000)
      : rawProviderFee > 0
        ? rawProviderFee
        : gross > 0 && feeBps > 0
          ? gross * (feeBps / 10000)
          : 0;
    const platformFee = PlatformFeeService.calculateSpread({
      sourceAmount: feeBase,
      sourceAssetCode: 'BRL',
      destinationAssetCode: 'USDC',
      mode: 'deduct_from_source',
    });
    const talkToStellarFee = Math.max(0, parseHumanAmountNumber(platformFee.feeAmount));
    const totalFee = desiredNet > 0
      ? providerFee + talkToStellarFee
      : Math.min(gross, providerFee + talkToStellarFee);
    const net = desiredNet > 0 ? desiredNet : Math.max(0, gross - totalFee);

    return {
      grossAmount: desiredNet > 0 ? formatCentsCeil(desiredNet + totalFee) : formatDecimalAmount(gross),
      netAmount: formatDecimalAmount(net),
      providerFeeAmount: formatDecimalAmount(providerFee),
      talkToStellarFeeAmount: formatDecimalAmount(talkToStellarFee),
      totalFeeAmount: formatDecimalAmount(totalFee),
    };
  }

  static getRuntimeInfo(): {
    provider: 'etherfuse';
    sandbox: boolean;
    available: boolean;
    testnet_only: true;
    network: string;
    stellar_network_id: 'TESTNET' | 'PUBLIC';
    base_url: string;
    unavailable_reason?: string;
    user_facing_mocks_allowed: boolean;
    ops_mocks_allowed: boolean;
    local_mock_fallback_allowed: boolean;
    asset: { code: 'TESOURO'; issuer: string; identifier: string };
  } {
    const apiKey = normalizeEtherfuseApiKey(coalesceString(
      process.env.ETHERFUSE_API_KEY,
      process.env.ETHERFUSE_SANDBOX_API_KEY,
    ));
    const baseUrl = coalesceString(process.env.ETHERFUSE_BASE_URL) || 'https://api.sand.etherfuse.com';
    const stellarNetworkId = String(process.env.STELLAR_NETWORK || 'TESTNET').trim().toUpperCase() === 'PUBLIC'
      ? 'PUBLIC'
      : 'TESTNET';
    const sandbox = isRampSandboxEnvironment(apiKey, baseUrl);
    const available = stellarNetworkId === 'TESTNET' && sandbox;
    const mockPolicy = mockPolicySnapshot();

    return {
      provider: 'etherfuse',
      sandbox,
      available,
      testnet_only: true,
      network: stellarNetworkId === 'PUBLIC' ? 'Stellar Public' : 'Stellar Testnet',
      stellar_network_id: stellarNetworkId,
      base_url: baseUrl.replace(/\/$/, ''),
      user_facing_mocks_allowed: mockPolicy.user_facing_mocks_allowed,
      ops_mocks_allowed: mockPolicy.ops_mocks_allowed,
      local_mock_fallback_allowed: stellarNetworkId === 'TESTNET' &&
        sandbox &&
        envFlag('ETHERFUSE_SANDBOX_PIX_FALLBACK', true),
      unavailable_reason: available
        ? undefined
        : stellarNetworkId === 'PUBLIC'
          ? 'PIX is disabled while the account is in Mainnet viewing mode.'
          : 'PIX is not available with the current payment configuration.',
      asset: {
        code: 'TESOURO',
        issuer: this.getTesouroIssuer(),
        identifier: this.getTesouroIdentifier(),
      },
    };
  }

  static assertEtherfuseTestnetRuntime(): void {
    const runtime = this.getRuntimeInfo();
    if (runtime.stellar_network_id !== 'TESTNET') {
      throw apiError('PIX is unavailable in the current account mode. Switch back to the validation account to use PIX.', 403);
    }
  }

  private static getEtherfuseClient(): EtherfuseClient {
    this.assertEtherfuseTestnetRuntime();
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

  private static async getWalletByPublicKeySafe(
    walletRepository: WalletRepository,
    publicKey: string,
    context: string,
  ): Promise<WalletInfo | null> {
    const normalizedPublicKey = coalesceString(publicKey);
    if (!normalizedPublicKey) return null;
    try {
      return await walletRepository.getWalletByPublicKey(normalizedPublicKey);
    } catch (error) {
      logger.warn(`[${context}] failed to load wallet by public key: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }

  private static async resolveSessionWallet(input: RampSessionInput): Promise<SessionWalletContext> {
    this.assertEtherfuseTestnetRuntime();
    const sessionId = coalesceString(input.session_id, input.sessionId);
    const sessionToken = coalesceString(input.session_token, input.sessionToken);

    if (!sessionId || !sessionToken) {
      throw apiError('session_id and session_token are required for ramp operations.', 401);
    }

    const agentRepository = new AgentRepository(supabase);
    const walletRepository = new WalletRepository(supabase);
    let session = await agentRepository.getSession(sessionId);

    if (!session || String(session.session_token || '') !== sessionToken) {
      throw apiError('Invalid or expired TalkToStellar session.', 401);
    }

    if (isSessionExpired(session)) {
      const channelProvider = externalChannelProvider(input);
      if (!channelProvider) {
        throw apiError('TalkToStellar session expired. Sign in again before using PIX ramp.', 401);
      }
      await agentRepository.saveSession(sessionId, session);
      session = await agentRepository.getSession(sessionId) || session;
    }

    const wallet = await walletRepository.getWalletBySession(sessionId);
    let publicKey = coalesceString(session.public_key, wallet?.public_key);

    if (!publicKey) {
      const userEmail = coalesceString(session.email);
      if (userEmail) {
        const { data: sessionByEmail } = await supabase
          .from('agent_sessions')
          .select('public_key')
          .ilike('email', userEmail)
          .not('public_key', 'is', null)
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        publicKey = coalesceString(sessionByEmail?.public_key);
      }
    }

    if (!publicKey) {
      throw apiError('This TalkToStellar session does not have an active wallet.', 409);
    }

    let resolvedWallet = wallet;
    if ((!resolvedWallet || !coalesceString(resolvedWallet.vault_secret_id)) && publicKey) {
      const walletByPublicKey = await this.getWalletByPublicKeySafe(
        walletRepository,
        publicKey,
        'resolve-session-wallet',
      );
      if (walletByPublicKey) {
        resolvedWallet = walletByPublicKey;
      }
    }

    if (!resolvedWallet) {
      try {
        await walletRepository.saveWallet({
          session_id: sessionId,
          public_key: publicKey,
        });
        resolvedWallet = { session_id: sessionId, public_key: publicKey };
      } catch (saveError) {
        logger.warn(`[resolve-session-wallet] failed to auto-create wallet record: ${saveError instanceof Error ? saveError.message : String(saveError)}`);
        resolvedWallet = await this.getWalletByPublicKeySafe(
          walletRepository,
          publicKey,
          'resolve-session-wallet-after-save-failure',
        );
      }
    }

    return {
      sessionId,
      sessionToken,
      userId: coalesceString(session.user_id) || sessionId,
      email: coalesceString(session.email) || undefined,
      publicKey,
      vaultSecretId: coalesceString(resolvedWallet?.vault_secret_id) || undefined,
      sessionPinHash: coalesceString((session as any).session_password_hash, (session as any).password_hash) || undefined,
      wallet: resolvedWallet,
    };
  }

  private static requireWalletPin(input: RampSessionInput, context: SessionWalletContext): string {
    const pin = coalesceString(
      input.pin,
      input.wallet_pin,
      input.walletPin,
      input.wallet_code,
      input.walletCode,
      input.passcode,
    );
    if (!/^\d{4,8}$/.test(pin)) {
      throw apiError('PIN da conta é obrigatório para confirmar esta operação.', 400, 'missing_pin');
    }
    if (!context.sessionPinHash || !verifyWalletPin(pin, context.sessionPinHash).valid) {
      throw apiError('PIN inválido. Tente novamente.', 401, 'invalid_pin');
    }
    return pin;
  }

  private static assertRampOwnerMatches(input: {
    sessionId?: unknown;
    userId?: unknown;
    publicKey?: unknown;
    operationContext?: Record<string, unknown>;
  }, context: SessionWalletContext): void {
    const operationContext = input.operationContext || {};
    const ownerSessionId = coalesceString(
      input.sessionId,
      operationContext.source_session_id,
      operationContext.session_id,
      operationContext.sessionId,
    );
    const ownerUserId = coalesceString(input.userId, operationContext.user_id, operationContext.userId);
    const ownerPublicKey = coalesceString(
      input.publicKey,
      operationContext.source_public_key,
      operationContext.public_key,
      operationContext.publicKey,
    );

    if (ownerSessionId && ownerSessionId === context.sessionId) return;
    if (ownerUserId && ownerUserId === context.userId) return;
    if (ownerPublicKey && ownerPublicKey === context.publicKey) return;

    throw apiError('Esta operação PIX não pertence à sessão atual.', 403, 'pix_order_forbidden');
  }

  private static assertSandboxOnRampOwner(record: SandboxMockOnRampOrder, context: SessionWalletContext): void {
    this.assertRampOwnerMatches({
      sessionId: record.sessionId,
      userId: record.userId,
      publicKey: record.publicKey,
      operationContext: record.operationContext,
    }, context);
  }

  private static assertSandboxOffRampOwner(record: SandboxMockOffRampOrder, context: SessionWalletContext): void {
    this.assertRampOwnerMatches({
      sessionId: record.sessionId,
      userId: record.userId,
      publicKey: record.publicKey,
    }, context);
  }

  private static async requireRampOperationOwner(
    operationId: string | undefined,
    context: SessionWalletContext,
    expectedOrderId: string,
    expectedDirection: 'onramp' | 'offramp',
  ): Promise<void> {
    if (!operationId) {
      throw apiError('operation_id is required to check this PIX order.', 400, 'missing_operation_id');
    }

    const operation = await OperationRepository.findById(operationId);
    if (!operation) {
      throw apiError('PIX operation not found.', 404, 'pix_operation_not_found');
    }

    const operationContext = parseOperationContext(operation.context);
    const storedOrderId = coalesceString(operationContext.anchor_order_id, operationContext.order_id);
    const storedDirection = coalesceString(operationContext.direction);
    if (expectedOrderId && storedOrderId && storedOrderId !== expectedOrderId) {
      throw apiError('Esta operação PIX não corresponde ao pedido informado.', 403, 'pix_order_forbidden');
    }
    if (storedDirection && storedDirection !== expectedDirection) {
      throw apiError('Esta operação PIX não corresponde ao tipo de pedido informado.', 403, 'pix_order_forbidden');
    }

    this.assertRampOwnerMatches({
      sessionId: operation.source_session_id,
      userId: operation.user_id,
      publicKey: operation.source_public_key,
      operationContext,
    }, context);
  }

  static async verifySessionPin(input: RampSessionInput): Promise<{
    authenticated: true;
    session_id: string;
    user_id: string;
  }> {
    const context = await this.resolveSessionWallet(input);
    this.requireWalletPin(input, context);
    return {
      authenticated: true,
      session_id: context.sessionId,
      user_id: context.userId,
    };
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
    this.assertEtherfuseTestnetRuntime();
    const email = String(input.email || '').trim().toLowerCase();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw apiError('Valid email is required to find a TalkToStellar wallet.', 400);
    }

    const runtime = this.getRuntimeInfo();
    if (!runtime.sandbox) {
      throw apiError('Email wallet lookup is unavailable in the current payment mode.', 403);
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

  private static async findActiveRampOperationByIntent(input: {
    userId: string;
    type: 'PIX_ONRAMP' | 'PIX_OFFRAMP';
    intentId?: string;
  }): Promise<Record<string, unknown> | null> {
    if (!input.intentId) return null;
    try {
      const { data, error } = await supabase
        .from('operations')
        .select('id, status, context, created_at')
        .eq('user_id', input.userId)
        .eq('type', input.type)
        .order('created_at', { ascending: false })
        .limit(25);

      if (error) {
        console.warn(`[ramp] Could not check idempotent ${input.type} intent:`, error.message);
        return null;
      }

      return ((data || []) as Array<Record<string, unknown>>).find((row) => {
        const context = parseOperationContext(row.context);
        const status = String(row.status || '').toUpperCase();
        return context.intent_id === input.intentId && !['FAILED', 'ERROR', 'CANCELLED', 'CANCELED'].includes(status);
      }) || null;
    } catch (error) {
      console.warn(`[ramp] Could not check idempotent ${input.type} intent:`, debugErrorMessage(error));
      return null;
    }
  }

  private static async notifySandboxOnRampCompleted(record: SandboxMockOnRampOrder, hash?: string): Promise<string> {
    try {
      const language = rampContextLanguage(record.operationContext);
      if (Boolean(record.operationContext?.auto_pay_after_ramp)) {
        console.info('[ramp] skipped intermediate PIX funding receipt because auto-pay will send the final receipt');
        return '';
      }
      const userFacingFinalAsset = normalizeAssetCode(record.finalAssetCode) === 'TESOURO'
        ? 'BRL'
        : (record.finalAssetCode || 'BRL');
      const finalIsAnchorAsset = normalizeAssetCode(record.finalAssetCode) === 'TESOURO';
      const desiredFinalAmount = coalesceString(record.desiredFinalAmount);
      const desiredFinalAssetCode = normalizeAssetCode(record.desiredFinalAssetCode || record.finalAssetCode);
      const pendingNonBrlFinalSettlement = Boolean(
        !finalIsAnchorAsset &&
        !coalesceString(record.finalAmount) &&
        desiredFinalAmount &&
        desiredFinalAssetCode === normalizeAssetCode(record.finalAssetCode)
      );
      const destinationAmount = finalIsAnchorAsset
        ? coalesceString(record.finalAmount, record.destinationAmount)
        : coalesceString(record.finalAmount, pendingNonBrlFinalSettlement ? desiredFinalAmount : '');
      if (!destinationAmount) return '';
      const postAsset = this.resolveSandboxPostConversionAsset(record);
      const postConversion = (record.transaction as OnRampTransaction & { post_conversion?: Record<string, unknown> }).post_conversion || {};
      const postConversionStatus = coalesceString(postConversion.status, record.operationContext?.post_conversion_status).toLowerCase();
      const pendingPostConversion = Boolean(
        postAsset &&
        !record.postConversionHash &&
        !coalesceString(record.operationContext?.post_conversion_hash) &&
        postConversionStatus !== 'completed'
      );
      const settlementFinalAsset = settlementAssetCode(record.finalAssetCode || userFacingFinalAsset);
      let balanceContext = '';
      if (!pendingNonBrlFinalSettlement && !pendingPostConversion) {
        try {
          const balances = normalizeBalances(await StellarService.getAccountBalance(record.publicKey));
          const updated = balances.find((balance) => (
            normalizeAssetCode(balance.asset_code) === normalizeAssetCode(settlementFinalAsset) &&
            (normalizeAssetCode(settlementFinalAsset) === 'XLM' || assetMatchesConfiguredIssuer(settlementFinalAsset, balance.asset_issuer))
          ));
          const updatedBalance = Number(String(updated?.balance || '0').replace(',', '.'));
          if (updated && Number.isFinite(updatedBalance) && updatedBalance > 0) {
            balanceContext = ` Saldo atualizado: ${formatDisplayAmount(updated.balance, userFacingFinalAsset)}.`;
          }
        } catch (balanceError) {
          console.warn('[ramp] Could not read updated balance for PIX receipt:', debugErrorMessage(balanceError));
        }
        if (!balanceContext && (record.transaction as any).sandbox_ledger_settlement === true) {
          balanceContext = ` Saldo atualizado: ${formatDisplayAmount(destinationAmount, userFacingFinalAsset)}.`;
        }
      }
      const fee = receiptBrlFeeFromContext(
        record.operationContext,
        record.sourceAmountBrl,
        destinationAmount,
      );
      const externalDeliveryText = pendingPostConversion
        ? [
            rampText(language, 'PIX confirmado com sucesso.', 'PIX confirmed successfully.'),
            `${rampText(language, 'Valor pago', 'Amount paid')}: ${formatDisplayAmount(record.sourceAmountBrl, 'BRL')}`,
            `${rampText(language, 'Valor recebido agora', 'Amount received now')}: ${formatDisplayAmount(destinationAmount, userFacingFinalAsset)}`,
            `${rampText(language, 'Conversão em andamento', 'Conversion in progress')}: ${formatDisplayAmount(destinationAmount, userFacingFinalAsset)} ${rampText(language, `para ${postAsset?.code || 'a moeda final'}`, `to ${postAsset?.code || 'the final asset'}`)}`,
            rampText(language, 'Quando a conversão finalizar, vou mandar outro comprovante aqui.', 'When the conversion finishes, I will send another receipt here.'),
          ].join('\n')
        : pendingNonBrlFinalSettlement
        ? [
            rampText(language, 'PIX confirmado com sucesso.', 'PIX confirmed successfully.'),
            `${rampText(language, 'Valor pago', 'Amount paid')}: ${formatDisplayAmount(record.sourceAmountBrl, 'BRL')}`,
            `${rampText(language, 'Valor alvo', 'Target amount')}: ${formatDisplayAmount(destinationAmount, userFacingFinalAsset)}`,
            `${rampText(language, 'Destino', 'Destination')}: ${rampText(language, 'sua conta TalkToStellar', 'your TalkToStellar account')}`,
            `${rampText(language, 'Status', 'Status')}: ${rampText(language, `conversão para ${userFacingFinalAsset} em andamento`, `conversion to ${userFacingFinalAsset} in progress`)}`,
          ].join('\n')
        : null;
      const contextMessage = pendingPostConversion
        ? rampText(
            language,
            `PIX confirmado. Recebemos ${formatDisplayAmount(destinationAmount, userFacingFinalAsset)} e a conversão para ${postAsset?.code || 'a moeda final'} está em andamento.`,
            `PIX confirmed. We received ${formatDisplayAmount(destinationAmount, userFacingFinalAsset)} and the conversion to ${postAsset?.code || 'the final asset'} is in progress.`
          )
        : pendingNonBrlFinalSettlement
        ? rampText(
            language,
            `PIX confirmado. Conversão para ${userFacingFinalAsset} em processamento para entregar ${formatDisplayAmount(destinationAmount, userFacingFinalAsset)} na sua conta.`,
            `PIX confirmed. Conversion to ${userFacingFinalAsset} is processing to deliver ${formatDisplayAmount(destinationAmount, userFacingFinalAsset)} to your account.`
          )
        : rampText(
            language,
            `Escolhemos a melhor rota para essa conversão e entregamos ${userFacingFinalAsset} na sua conta.${balanceContext}`,
            `We chose the best route for this conversion and delivered ${userFacingFinalAsset} to your account.`
          );
      return await PaymentReceiptService.sendReceipt({
        type: 'payment_received',
        sessionId: record.sessionId,
        userId: record.userId,
        language,
        provider: coalesceString(record.operationContext?.external_provider) || undefined,
        providerUserId: coalesceString(record.operationContext?.external_provider_user_id) || undefined,
        counterpartyLabel: 'PIX',
        sourceAmount: record.sourceAmountBrl,
        sourceAssetCode: 'BRL',
        destinationAmount,
        destinationAssetCode: userFacingFinalAsset,
        hash: hash || record.deliveryHash || null,
        feeDisplay: fee.feeDisplay || null,
        feeBrl: fee.feeBrl || null,
        quote: record.operationContext || null,
        status: pendingNonBrlFinalSettlement || pendingPostConversion ? 'processing' : 'completed',
        contextMessage,
        externalDeliveryText,
        dedupeKey: record.operationId ? `pix-onramp:${record.operationId}` : undefined,
      });
    } catch (error) {
      console.warn('[ramp] Could not notify sandbox PIX completion:', debugErrorMessage(error));
      return '';
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
      const activeAccounts = accounts.filter((account) =>
        String(account.status || '').toLowerCase() === 'active' &&
        account.compliant !== false
      );
      const active = activeAccounts.find((account) =>
        String(account.type || '').toUpperCase() === 'PIX' &&
        String(account.currency || '').toUpperCase() === 'BRL'
      ) || activeAccounts.find((account) =>
        String(account.type || '').toUpperCase() === 'PIX'
      ) || activeAccounts.find((account) =>
        String(account.currency || '').toUpperCase() === 'BRL'
      ) || activeAccounts[0];
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
    customerId?: string,
  ): Error {
    const error = apiError(message, 409) as Error & {
      code?: string;
      kyc_url?: string;
      bank_account_id?: string;
      programmatic_onboarding?: Record<string, unknown>;
      customer_id?: string;
      retry_after_ms?: number;
    };
    error.code = 'pix_account_not_ready';
    if (kycUrl) error.kyc_url = kycUrl;
    if (bankAccountId) error.bank_account_id = bankAccountId;
    if (programmaticOnboarding) error.programmatic_onboarding = programmaticOnboarding;
    if (customerId) error.customer_id = customerId;
    error.retry_after_ms = 5000;
    return error;
  }

  private static sandboxPixFallbackEnabled(): boolean {
    const runtime = this.getRuntimeInfo();
    return runtime.stellar_network_id === 'TESTNET' &&
      runtime.sandbox &&
      envFlag('ETHERFUSE_SANDBOX_PIX_FALLBACK', true);
  }

  private static sandboxLedgerFallbackAllowed(): boolean {
    return this.sandboxPixFallbackEnabled() &&
      envFlag('ALLOW_SANDBOX_LEDGER_SETTLEMENT', true);
  }

  private static sandboxLedgerSettlementEnabled(): boolean {
    return this.sandboxLedgerFallbackAllowed() &&
      !coalesceString(process.env.TESOURO_DISTRIBUTOR_SECRET);
  }

  private static buildSandboxPixInstructions(orderId: string, amount: string) {
    const pixKey = `pix-${orderId.replace(/^sandbox-pix-/, '').slice(0, 8)}@talktostellar.local`;
    const txid = `TS${orderId.replace(/[^a-f0-9]/gi, '').slice(0, 23)}`;
    const pixCode = buildPixBrCode({
      pixKey,
      amount,
      merchantName: 'TalkToStellar',
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
      beneficiary: 'TalkToStellar',
    };
  }

  private static async getSandboxTesouroTreasuryBalance(): Promise<string | undefined> {
    const publicKey = coalesceString(process.env.TESOURO_DISTRIBUTOR_PUBLIC);
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
    desiredFinalAmount?: string;
    desiredFinalAssetCode?: string;
    postConversionAsset?: { code: string; issuer?: string };
    quote?: Quote;
    upstreamError?: string;
  }): OnRampTransaction {
    const orderId = `sandbox-pix-${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    const finalIsTesouro = sameIssuedAsset(input.finalAsset, { code: 'TESOURO', issuer: this.getTesouroIssuer() });
    const hasPostConversion = Boolean(input.postConversionAsset && !sameIssuedAsset(input.postConversionAsset, input.finalAsset));
    const desiredFinalAssetCode = normalizeAssetCode(input.desiredFinalAssetCode || input.finalAsset.code);
    const shouldReceiveExactBrl = Boolean(
      finalIsTesouro &&
      input.desiredFinalAmount &&
      ['BRL', 'TESOURO'].includes(desiredFinalAssetCode)
    );
    const brlFeeBridge = this.estimateOnRampBrlFeeBridge(
      input.amount,
      input.quote as Record<string, unknown> | undefined,
      shouldReceiveExactBrl ? input.desiredFinalAmount : undefined,
    );
    const destinationAmount = toStellarAmount(
      finalIsTesouro && input.desiredFinalAmount && ['BRL', 'TESOURO'].includes(desiredFinalAssetCode)
        ? input.desiredFinalAmount
        : brlFeeBridge.netAmount,
    );
    const finalAmount = finalIsTesouro
      ? destinationAmount
      : undefined;
    const transaction = {
      id: orderId,
      customerId: input.customerId,
      quoteId: input.quoteId,
      status: 'pending' as const,
      fromAmount: input.amount,
      fromCurrency: 'BRL',
      toAmount: finalAmount || '',
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
      desired_final_amount: input.desiredFinalAmount,
      desired_final_asset_code: input.desiredFinalAssetCode,
      post_conversion: hasPostConversion ? {
        required: true,
        status: 'pending',
        source_asset_code: input.finalAsset.code,
        source_asset_issuer: input.finalAsset.issuer,
        destination_asset_code: input.postConversionAsset?.code,
        destination_asset_issuer: input.postConversionAsset?.issuer,
      } : undefined,
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
      finalAmount,
      desiredFinalAmount: input.desiredFinalAmount,
      desiredFinalAssetCode: input.desiredFinalAssetCode,
      postConversionAssetCode: hasPostConversion ? input.postConversionAsset?.code : undefined,
      postConversionAssetIssuer: hasPostConversion ? input.postConversionAsset?.issuer : undefined,
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
    const postConversionAsset = coalesceString(context.post_conversion_asset_code, context.post_conversion_asset)
      ? resolveRampFinalAsset(context.post_conversion_asset_code, context.post_conversion_asset, context.post_conversion_asset_issuer)
      : undefined;
    const hasPostConversion = Boolean(postConversionAsset && !sameIssuedAsset(postConversionAsset, finalAsset));
    const desiredFinalAmount = coalesceString(context.desired_final_amount);
    const desiredFinalAssetCode = normalizeAssetCode(coalesceString(context.desired_final_asset_code, context.desired_final_asset, finalAsset.code));
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
      estimateTesouroFromBrl(amount),
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
      desired_final_amount: desiredFinalAmount || undefined,
      desired_final_asset_code: desiredFinalAssetCode || undefined,
      post_conversion: hasPostConversion ? {
        required: true,
        status: coalesceString(context.post_conversion_status) || (coalesceString(context.post_conversion_hash) ? 'completed' : status === 'completed' ? 'completed' : 'pending'),
        source_asset_code: finalAsset.code,
        source_asset_issuer: finalAsset.issuer,
        source_amount: coalesceString(context.post_conversion_source_amount, context.final_amount) || undefined,
        destination_asset_code: postConversionAsset?.code,
        destination_asset_issuer: postConversionAsset?.issuer,
        destination_amount: coalesceString(context.post_conversion_amount) || undefined,
        hash: coalesceString(context.post_conversion_hash) || undefined,
        error: coalesceString(context.post_conversion_error) || undefined,
      } : undefined,
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
    const receiptUrl = coalesceString(context.receipt_url);
    if (receiptUrl) {
      (transaction as OnRampTransaction & { receiptUrl?: string; receipt_url?: string }).receiptUrl = receiptUrl;
      (transaction as OnRampTransaction & { receiptUrl?: string; receipt_url?: string }).receipt_url = receiptUrl;
    }

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
      desiredFinalAmount: desiredFinalAmount || undefined,
      desiredFinalAssetCode: desiredFinalAssetCode || undefined,
      finalConversionHash: coalesceString(context.final_conversion_hash) || undefined,
      finalConversionSourceAmount: coalesceString(context.final_conversion_source_amount) || undefined,
      finalConversionError: coalesceString(context.final_conversion_error) || undefined,
      postConversionAssetCode: hasPostConversion ? postConversionAsset?.code : undefined,
      postConversionAssetIssuer: hasPostConversion ? postConversionAsset?.issuer : undefined,
      postConversionHash: coalesceString(context.post_conversion_hash) || undefined,
      postConversionSourceAmount: coalesceString(context.post_conversion_source_amount) || undefined,
      postConversionAmount: coalesceString(context.post_conversion_amount) || undefined,
      postConversionError: coalesceString(context.post_conversion_error) || undefined,
      operationId,
      deliveryHash: deliveryHash || undefined,
      deliverySourceAmount: coalesceString(context.delivery_source_amount) || undefined,
      deliveryError: coalesceString(context.delivery_error) || undefined,
      upstreamError: coalesceString(context.upstream_error) || undefined,
      receiptUrl: receiptUrl || undefined,
      operationContext: {
        ...context,
        payment_instructions: paymentInstructions,
        destination_amount_anchor: destinationAmount,
        final_amount: finalAmount || undefined,
        source_amount_brl: amount,
        desired_final_amount: desiredFinalAmount || undefined,
        desired_final_asset_code: desiredFinalAssetCode || undefined,
        post_conversion_asset_code: hasPostConversion ? postConversionAsset?.code : undefined,
        post_conversion_asset_issuer: hasPostConversion ? postConversionAsset?.issuer : undefined,
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
    record.receiptUrl = await this.notifySandboxOnRampCompleted(record, hash);
    if (record.receiptUrl) {
      (record.transaction as OnRampTransaction & { receiptUrl?: string; receipt_url?: string }).receiptUrl = record.receiptUrl;
      (record.transaction as OnRampTransaction & { receiptUrl?: string; receipt_url?: string }).receipt_url = record.receiptUrl;
      await this.persistSandboxOnRampContext(record, { receipt_url: record.receiptUrl });
    }
    return record;
  }

  private static async sendCompletedOnRampReceiptForOperation(input: {
    transaction: OnRampTransaction;
    operation: Record<string, unknown>;
    context: Record<string, unknown>;
    finalAsset: { code: string; issuer?: string };
    destinationAmount?: string;
    hash?: string;
  }): Promise<string> {
    if (Boolean(input.context.auto_pay_after_ramp)) {
      console.info('[ramp] skipped completed PIX funding receipt because auto-pay will send the final receipt');
      return '';
    }

    const existingReceiptUrl = coalesceString(input.context.receipt_url);
    if (existingReceiptUrl) return existingReceiptUrl;

    const userFacingFinalAsset = normalizeAssetCode(input.finalAsset.code) === 'TESOURO'
      ? 'BRL'
      : input.finalAsset.code;
    const finalIsAnchorAsset = normalizeAssetCode(input.finalAsset.code) === 'TESOURO';
    const destinationAmount = finalIsAnchorAsset
      ? coalesceString(
          input.destinationAmount,
          input.context.final_amount,
          (input.transaction as OnRampTransaction & { finalAmount?: string }).finalAmount,
          input.transaction.toAmount,
          input.context.destination_amount_anchor,
          input.context.destination_amount,
        )
      : coalesceString(
          input.destinationAmount,
          input.context.final_amount,
          (input.transaction as OnRampTransaction & { finalAmount?: string }).finalAmount,
        );
    if (!destinationAmount) return '';
    const fee = receiptBrlFeeFromContext(
      input.context,
      coalesceString(input.context.source_amount_brl, input.transaction.fromAmount, input.operation.amount),
      destinationAmount,
    );
    const operationId = coalesceString(input.operation.id);
    const language = rampContextLanguage(input.context);

    const receiptUrl = await PaymentReceiptService.sendReceipt({
      type: 'payment_received',
      sessionId: coalesceString(input.operation.source_session_id, input.context.session_id),
      userId: coalesceString(input.operation.user_id, input.context.user_id),
      language,
      provider: coalesceString(input.context.external_provider) || undefined,
      providerUserId: coalesceString(input.context.external_provider_user_id) || undefined,
      counterpartyLabel: 'PIX',
      sourceAmount: coalesceString(input.context.source_amount_brl, input.transaction.fromAmount, input.operation.amount),
      sourceAssetCode: 'BRL',
      destinationAmount,
      destinationAssetCode: userFacingFinalAsset,
      hash: input.hash || coalesceString(input.context.final_conversion_hash, input.transaction.id) || null,
      feeDisplay: fee.feeDisplay || null,
      feeBrl: fee.feeBrl || null,
      quote: input.context || null,
      status: 'completed',
      contextMessage: rampText(
        language,
        `PIX confirmado. Entregamos ${userFacingFinalAsset} na sua conta TalkToStellar.`,
        `PIX confirmed. We delivered ${userFacingFinalAsset} to your TalkToStellar account.`
      ),
      dedupeKey: operationId ? `pix-onramp:${operationId}` : undefined,
    });

    if (receiptUrl && operationId) {
      await OperationRepository.update(operationId, {
        context: JSON.stringify({
          ...input.context,
          receipt_url: receiptUrl,
        }),
      } as any).catch((error) => {
        console.warn('[ramp] Could not persist completed PIX on-ramp receipt URL:', debugErrorMessage(error));
      });
    }
    return receiptUrl;
  }

  private static async sendCompletedPostOnRampConversionReceiptForOperation(input: {
    operation: Record<string, unknown>;
    context: Record<string, unknown>;
    sourceAsset: { code: string; issuer?: string };
    sourceAmount?: string;
    destinationAsset: { code: string; issuer?: string };
    destinationAmount?: string;
    hash?: string;
  }): Promise<string> {
    const existingReceiptUrl = coalesceString(input.context.post_conversion_receipt_url);
    if (existingReceiptUrl) return existingReceiptUrl;

    const sourceAmount = coalesceString(input.sourceAmount, input.context.post_conversion_source_amount);
    const destinationAmount = coalesceString(input.destinationAmount, input.context.post_conversion_amount, input.context.final_amount);
    const hash = coalesceString(input.hash, input.context.post_conversion_hash);
    if (!sourceAmount || !destinationAmount || !hash) return '';
    const operationId = coalesceString(input.operation.id);
    const language = rampContextLanguage(input.context);

    const receiptUrl = await PaymentReceiptService.sendReceipt({
      type: 'conversion',
      sessionId: coalesceString(input.operation.source_session_id, input.context.session_id),
      userId: coalesceString(input.operation.user_id, input.context.user_id),
      language,
      provider: coalesceString(input.context.external_provider) || undefined,
      providerUserId: coalesceString(input.context.external_provider_user_id) || undefined,
      counterpartyLabel: 'sua conta TalkToStellar',
      sourceAmount,
      sourceAssetCode: input.sourceAsset.code,
      destinationAmount,
      destinationAssetCode: input.destinationAsset.code,
      hash,
      status: 'completed',
      contextMessage: rampText(language, 'Conversão automática depois do PIX concluída.', 'Automatic conversion after PIX completed.'),
      externalDeliveryText: [
        rampText(language, 'Conversão final depois do PIX concluída.', 'Final conversion after PIX completed.'),
        `${rampText(language, 'Convertido', 'Converted')}: ${formatDisplayAmount(sourceAmount, input.sourceAsset.code)}`,
        `${rampText(language, 'Recebido final', 'Final received')}: ${formatDisplayAmount(destinationAmount, input.destinationAsset.code)}`,
        `${rampText(language, 'Status', 'Status')}: ${rampText(language, 'concluído', 'completed')}`,
      ].join('\n'),
      dedupeKey: operationId ? `pix-post-conversion:${operationId}` : undefined,
    });

    if (receiptUrl && operationId) {
      await OperationRepository.update(operationId, {
        context: JSON.stringify({
          ...input.context,
          post_conversion_receipt_url: receiptUrl,
        }),
      } as any).catch((error) => {
        console.warn('[ramp] Could not persist completed post-PIX conversion receipt URL:', debugErrorMessage(error));
      });
    }

    return receiptUrl;
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

  private static async completeSandboxOnRampWithLedgerFallback(
    record: SandboxMockOnRampOrder,
    destinationAmountTesouro: string,
    reason: string,
  ): Promise<SandboxMockOnRampOrder | null> {
    if (!this.sandboxLedgerFallbackAllowed()) return null;
    console.warn(`[ramp] Completing sandbox PIX on-ramp through ledger fallback: ${reason}`);
    return this.completeSandboxOnRampWithLedgerSettlement(record, destinationAmountTesouro, reason);
  }

  private static async completeProviderOnRampWithSandboxLedgerFallback(input: {
    transaction: OnRampTransaction;
    operationId?: string;
    reason: string;
  }): Promise<SandboxMockOnRampOrder | null> {
    if (!input.operationId || !this.sandboxLedgerFallbackAllowed()) return null;

    const operation = await OperationRepository.findById(input.operationId).catch(() => null);
    if (!operation) return null;

    const context = parseOperationContext(operation.context);
    if (context.direction !== 'onramp') return null;

    const orderId = coalesceString(input.transaction.id, context.anchor_order_id, context.order_id);
    const storedOrderId = coalesceString(context.anchor_order_id, context.order_id);
    if (storedOrderId && orderId && storedOrderId !== orderId) return null;

    const amount = coalesceString(
      context.source_amount_brl,
      context.amount_brl,
      input.transaction.fromAmount,
      operation.amount,
    );
    if (!amount || parseHumanAmountNumber(amount) <= 0) return null;

    const finalAsset = resolveRampFinalAsset(
      context.target_asset,
      context.final_asset,
      context.final_asset_code,
      input.transaction.toCurrency,
      this.getTesouroIdentifier(),
    );
    const destinationAmount = toStellarAmount(coalesceString(
      context.destination_amount_anchor,
      context.anchor_amount,
      context.destination_amount,
      input.transaction.toAmount,
      estimateTesouroFromBrl(amount),
    ));
    const finalIsTesouro = sameIssuedAsset(finalAsset, { code: 'TESOURO', issuer: this.getTesouroIssuer() });
    const finalAmount = coalesceString(context.final_amount) || (finalIsTesouro ? destinationAmount : '');
    const postConversionAsset = coalesceString(context.post_conversion_asset_code, context.post_conversion_asset)
      ? resolveRampFinalAsset(context.post_conversion_asset_code, context.post_conversion_asset, context.post_conversion_asset_issuer)
      : undefined;
    const hasPostConversion = Boolean(postConversionAsset && !sameIssuedAsset(postConversionAsset, finalAsset));

    const transaction = {
      ...input.transaction,
      id: orderId,
      status: 'pending' as any,
      fromAmount: amount,
      fromCurrency: 'BRL',
      toAmount: finalAmount,
      toCurrency: assetIdentifier(finalAsset),
      stellarAddress: coalesceString(operation.source_public_key, context.public_key, input.transaction.stellarAddress),
      paymentInstructions: input.transaction.paymentInstructions || context.payment_instructions || {},
      sandbox_mock: true,
      upstream_error: input.reason,
      anchorAsset: this.getTesouroIdentifier(),
      anchorAmount: destinationAmount,
      finalAsset,
      finalAmount: finalAmount || undefined,
      desired_final_amount: coalesceString(context.desired_final_amount) || undefined,
      desired_final_asset_code: coalesceString(context.desired_final_asset_code, context.desired_final_asset) || undefined,
      post_conversion: hasPostConversion ? {
        required: true,
        status: 'pending',
        source_asset_code: finalAsset.code,
        source_asset_issuer: finalAsset.issuer,
        destination_asset_code: postConversionAsset?.code,
        destination_asset_issuer: postConversionAsset?.issuer,
      } : undefined,
    } as OnRampTransaction & { sandbox_mock: boolean; upstream_error?: string };

    const record: SandboxMockOnRampOrder = {
      transaction,
      userId: operation.user_id,
      sessionId: coalesceString(operation.source_session_id, context.session_id),
      publicKey: transaction.stellarAddress,
      sourceAmountBrl: amount,
      destinationAmount,
      finalAssetCode: finalAsset.code,
      finalAssetIssuer: finalAsset.issuer,
      finalAmount: finalAmount || undefined,
      desiredFinalAmount: coalesceString(context.desired_final_amount) || undefined,
      desiredFinalAssetCode: normalizeAssetCode(coalesceString(context.desired_final_asset_code, context.desired_final_asset, finalAsset.code)) || undefined,
      postConversionAssetCode: hasPostConversion ? postConversionAsset?.code : undefined,
      postConversionAssetIssuer: hasPostConversion ? postConversionAsset?.issuer : undefined,
      operationId: input.operationId,
      upstreamError: input.reason,
      operationContext: {
        ...context,
        sandbox_mock: true,
        upstream_error: input.reason,
        anchor_order_id: orderId,
        payment_instructions: transaction.paymentInstructions,
        destination_amount_anchor: destinationAmount,
        final_amount: finalAmount || undefined,
        source_amount_brl: amount,
        final_asset_code: finalAsset.code,
        final_asset_issuer: finalAsset.issuer,
        post_conversion_asset_code: hasPostConversion ? postConversionAsset?.code : undefined,
        post_conversion_asset_issuer: hasPostConversion ? postConversionAsset?.issuer : undefined,
      },
    };

    this.sandboxMockOnRampOrders.set(orderId, record);
    return this.completeSandboxOnRampWithLedgerFallback(record, destinationAmount, input.reason);
  }

  private static resolveSandboxPostConversionAsset(record: SandboxMockOnRampOrder): { code: string; issuer?: string } | null {
    const code = coalesceString(record.postConversionAssetCode, record.operationContext?.post_conversion_asset_code);
    if (!code) return null;
    const asset = resolveRampFinalAsset(code, record.postConversionAssetIssuer, record.operationContext?.post_conversion_asset_issuer);
    const currentFinalAsset = resolveRampFinalAsset(record.finalAssetCode || 'TESOURO', record.finalAssetIssuer);
    return sameIssuedAsset(asset, currentFinalAsset) ? null : asset;
  }

  private static setSandboxPostConversionPending(input: {
    record: SandboxMockOnRampOrder;
    sourceAsset: { code: string; issuer?: string };
    sourceAmount: string;
  }): void {
    const postAsset = this.resolveSandboxPostConversionAsset(input.record);
    if (!postAsset) return;

    const sourceAmount = toStellarAmount(input.sourceAmount);
    (input.record.transaction as any).post_conversion = {
      required: true,
      status: 'pending',
      source_asset_code: input.sourceAsset.code,
      source_asset_issuer: input.sourceAsset.issuer,
      source_amount: sourceAmount,
      destination_asset_code: postAsset.code,
      destination_asset_issuer: postAsset.issuer,
    };
  }

  private static scheduleSandboxPostOnRampConversion(input: {
    record: SandboxMockOnRampOrder;
    sourceAsset: { code: string; issuer?: string };
    sourceAmount: string;
  }): void {
    const postAsset = this.resolveSandboxPostConversionAsset(input.record);
    if (!postAsset) return;

    const run = async () => {
      const converted = await this.applySandboxPostOnRampConversion(input);
      if (converted.transaction.status === 'failed') return;
      await this.sendSandboxPostConversionReceipt(converted);
    };

    setTimeout(() => {
      run().catch((error) => {
        console.warn('[ramp] Could not finish sandbox post-PIX conversion in background:', debugErrorMessage(error));
      });
    }, 0);
  }

  private static async sendSandboxPostConversionReceipt(record: SandboxMockOnRampOrder): Promise<string> {
    const existing = coalesceString(record.postConversionReceiptUrl, record.operationContext?.post_conversion_receipt_url);
    if (existing) {
      this.attachSandboxPostConversionReceipt(record, existing);
      return existing;
    }

    const postConversion = (record.transaction as OnRampTransaction & { post_conversion?: Record<string, unknown> }).post_conversion || {};
    const sourceAssetCode = normalizeAssetCode(coalesceString(
      postConversion.source_asset_code,
      record.operationContext?.post_conversion_source_asset_code,
    ));
    const sourceAmount = coalesceString(
      postConversion.source_amount,
      record.postConversionSourceAmount,
      record.operationContext?.post_conversion_source_amount,
    );
    const destinationAssetCode = normalizeAssetCode(coalesceString(
      postConversion.destination_asset_code,
      record.postConversionAssetCode,
      record.operationContext?.post_conversion_asset_code,
      record.finalAssetCode,
    ));
    const destinationAmount = coalesceString(
      postConversion.destination_amount,
      record.postConversionAmount,
      record.operationContext?.post_conversion_amount,
      record.finalAmount,
    );
    const hash = coalesceString(
      postConversion.hash,
      record.postConversionHash,
      record.operationContext?.post_conversion_hash,
    );

    if (!sourceAssetCode || !sourceAmount || !destinationAssetCode || !destinationAmount || !hash) return '';
    const language = rampContextLanguage(record.operationContext);

    const receiptUrl = await PaymentReceiptService.sendReceipt({
      type: 'conversion',
      sessionId: record.sessionId,
      userId: record.userId,
      language,
      provider: coalesceString(record.operationContext?.external_provider) || undefined,
      providerUserId: coalesceString(record.operationContext?.external_provider_user_id) || undefined,
      counterpartyLabel: 'sua conta TalkToStellar',
      sourceAmount,
      sourceAssetCode,
      destinationAmount,
      destinationAssetCode,
      hash,
      status: 'completed',
      contextMessage: rampText(language, 'Conversão automática depois do PIX concluída.', 'Automatic conversion after PIX completed.'),
      externalDeliveryText: [
        rampText(language, 'Conversão final depois do PIX concluída.', 'Final conversion after PIX completed.'),
        `${rampText(language, 'Convertido', 'Converted')}: ${formatDisplayAmount(sourceAmount, sourceAssetCode)}`,
        `${rampText(language, 'Recebido final', 'Final received')}: ${formatDisplayAmount(destinationAmount, destinationAssetCode)}`,
        `${rampText(language, 'Status', 'Status')}: ${rampText(language, 'concluído', 'completed')}`,
      ].join('\n'),
      dedupeKey: record.operationId ? `pix-post-conversion:${record.operationId}` : undefined,
    });

    if (receiptUrl) {
      this.attachSandboxPostConversionReceipt(record, receiptUrl);
      await this.persistSandboxOnRampContext(record, {
        post_conversion_receipt_url: receiptUrl,
      });
    }

    return receiptUrl;
  }

  private static attachSandboxPostConversionReceipt(record: SandboxMockOnRampOrder, receiptUrl: string): void {
    if (!receiptUrl) return;
    record.postConversionReceiptUrl = receiptUrl;
    const tx = record.transaction as OnRampTransaction & Record<string, unknown>;
    tx.post_conversion_receipt_url = receiptUrl;
    tx.receiptUrl = receiptUrl;
    tx.receipt_url = receiptUrl;
    tx.post_conversion = {
      ...((tx.post_conversion as Record<string, unknown> | undefined) || {}),
      receipt_url: receiptUrl,
    };
  }

  private static async markSandboxPostConversionFailed(
    record: SandboxMockOnRampOrder,
    message: string,
    sourceAsset?: { code: string; issuer?: string },
    sourceAmount?: string,
  ): Promise<SandboxMockOnRampOrder> {
    const postAsset = this.resolveSandboxPostConversionAsset(record);
    record.postConversionError = message;
    (record.transaction as any).post_conversion = {
      required: true,
      status: 'failed',
      source_asset_code: sourceAsset?.code,
      source_asset_issuer: sourceAsset?.issuer,
      source_amount: sourceAmount,
      destination_asset_code: postAsset?.code,
      destination_asset_issuer: postAsset?.issuer,
      error: message,
    };
    await this.persistSandboxOnRampContext(record, {
      post_conversion_status: 'failed',
      post_conversion_error: message,
    });
    return record;
  }

  private static async applySandboxPostOnRampConversion(input: {
    record: SandboxMockOnRampOrder;
    sourceAsset: { code: string; issuer?: string };
    sourceAmount: string;
  }): Promise<SandboxMockOnRampOrder> {
    const { record, sourceAsset } = input;
    const sourceAmount = toStellarAmount(input.sourceAmount);
    const postAsset = this.resolveSandboxPostConversionAsset(record);
    if (!postAsset) return record;

    if (!record.vaultSecretId) {
      return this.markSandboxPostConversionFailed(
        record,
        'Não consegui converter o saldo depois do PIX porque a chave da conta não está disponível. Entre novamente e tente gerar um novo PIX.',
        sourceAsset,
        sourceAmount,
      );
    }

    const postTrustline = await this.ensureIssuedAssetTrustline({
      sessionId: record.sessionId,
      sessionToken: '',
      userId: record.userId,
      publicKey: record.publicKey,
      vaultSecretId: record.vaultSecretId,
    }, postAsset);
    if (!postTrustline.success) {
      return this.markSandboxPostConversionFailed(
        record,
        postTrustline.error || `Não consegui preparar ${postAsset.code} para a conversão depois do PIX.`,
        sourceAsset,
        sourceAmount,
      );
    }

    const secret = await new VaultService(supabase).getSecret(record.vaultSecretId);
    const converted = await StellarService.submitStrictSendPaymentFromSecret({
      sourceSecret: secret,
      destination: record.publicKey,
      sourceAsset,
      sourceAmount,
      destinationAsset: postAsset,
      memoText: 'PIX POST CONVERT',
    });

    if (!converted.success) {
      return this.markSandboxPostConversionFailed(
        record,
        converted.error || `Não consegui converter ${sourceAsset.code} para ${postAsset.code} depois do PIX.`,
        sourceAsset,
        sourceAmount,
      );
    }

    const destinationAmount = toStellarAmount(converted.destinationAmount || '0');
    record.postConversionHash = converted.hash;
    record.postConversionSourceAmount = sourceAmount;
    record.postConversionAmount = destinationAmount;
    record.finalAssetCode = postAsset.code;
    record.finalAssetIssuer = postAsset.issuer;
    record.finalAmount = destinationAmount;
    (record.transaction as any).toAmount = destinationAmount;
    (record.transaction as any).toCurrency = assetIdentifier(postAsset);
    (record.transaction as any).finalAmount = destinationAmount;
    (record.transaction as any).finalAsset = postAsset;
    (record.transaction as any).post_conversion = {
      required: true,
      status: 'completed',
      source_asset_code: sourceAsset.code,
      source_asset_issuer: sourceAsset.issuer,
      source_amount: sourceAmount,
      destination_asset_code: postAsset.code,
      destination_asset_issuer: postAsset.issuer,
      destination_amount: destinationAmount,
      hash: converted.hash,
    };

    await this.persistSandboxOnRampContext(record, {
      post_conversion_status: 'completed',
      post_conversion_hash: converted.hash,
      post_conversion_source_asset_code: sourceAsset.code,
      post_conversion_source_asset_issuer: sourceAsset.issuer,
      post_conversion_source_amount: sourceAmount,
      post_conversion_asset_code: postAsset.code,
      post_conversion_asset_issuer: postAsset.issuer,
      post_conversion_amount: destinationAmount,
      target_asset: assetIdentifier(postAsset),
      final_asset: assetIdentifier(postAsset),
      final_asset_code: postAsset.code,
      final_asset_issuer: postAsset.issuer,
      final_amount: destinationAmount,
    });

    return record;
  }

  private static async hydrateSandboxPostConversionWalletSecret(record: SandboxMockOnRampOrder): Promise<void> {
    if (record.vaultSecretId || !record.sessionId) return;
    try {
      const walletRepository = new WalletRepository(supabase);
      const wallet = await walletRepository.getWalletBySession(record.sessionId);
      let vaultSecretId = coalesceString(wallet?.vault_secret_id);
      if (!vaultSecretId && record.publicKey) {
        const walletByPublicKey = await this.getWalletByPublicKeySafe(
          walletRepository,
          record.publicKey,
          'sandbox-post-conversion-wallet-secret',
        );
        vaultSecretId = coalesceString(walletByPublicKey?.vault_secret_id);
      }
      if (vaultSecretId) record.vaultSecretId = vaultSecretId;
    } catch (error) {
      console.warn('[ramp] Could not hydrate wallet secret for sandbox post-PIX conversion:', debugErrorMessage(error));
    }
  }

  private static async finishSandboxPostOnRampConversionIfPending(record: SandboxMockOnRampOrder): Promise<SandboxMockOnRampOrder> {
    const postAsset = this.resolveSandboxPostConversionAsset(record);
    if (!postAsset) return record;

    const txPostConversion = ((record.transaction as OnRampTransaction & { post_conversion?: Record<string, unknown> }).post_conversion || {});
    const status = coalesceString(txPostConversion.status, record.operationContext?.post_conversion_status).toLowerCase();
    const existingHash = coalesceString(txPostConversion.hash, record.postConversionHash, record.operationContext?.post_conversion_hash);
    if (status === 'failed') return record;
    if (status === 'completed' || existingHash) {
      await this.sendSandboxPostConversionReceipt(record);
      return record;
    }

    const sourceAmount = coalesceString(
      txPostConversion.source_amount,
      record.postConversionSourceAmount,
      record.operationContext?.post_conversion_source_amount,
      record.finalAmount,
      record.transaction.toAmount,
    );
    if (!sourceAmount || Number(sourceAmount) <= 0) return record;

    const sourceAsset = resolveRampFinalAsset(
      coalesceString(
        txPostConversion.source_asset_code,
        record.operationContext?.post_conversion_source_asset_code,
        record.finalAssetCode,
      ),
      coalesceString(
        txPostConversion.source_asset_issuer,
        record.operationContext?.post_conversion_source_asset_issuer,
        record.finalAssetIssuer,
      ),
    );

    const lockKey = coalesceString(record.operationId, record.transaction.id);
    const existingLock = this.sandboxPostConversionLocks.get(lockKey);
    if (existingLock) return existingLock;

    const run = (async () => {
      await this.hydrateSandboxPostConversionWalletSecret(record);
      const converted = await this.applySandboxPostOnRampConversion({
        record,
        sourceAsset,
        sourceAmount,
      });
      const convertedPostConversion = (converted.transaction as OnRampTransaction & { post_conversion?: Record<string, unknown> }).post_conversion || {};
      if (coalesceString(convertedPostConversion.status).toLowerCase() === 'completed') {
        await this.sendSandboxPostConversionReceipt(converted);
      }
      return converted;
    })();

    this.sandboxPostConversionLocks.set(lockKey, run);
    try {
      return await run;
    } finally {
      this.sandboxPostConversionLocks.delete(lockKey);
    }
  }

  private static async settleSandboxOnRampFinalAsset(input: {
    record: SandboxMockOnRampOrder;
    sourceSecret: string;
    destinationAmountTesouro: string;
  }): Promise<SandboxMockOnRampOrder> {
    const { record, sourceSecret, destinationAmountTesouro } = input;
    const finalAsset = resolveRampFinalAsset(record.finalAssetCode || 'TESOURO', record.finalAssetIssuer);
    const tesouroAsset = { code: 'TESOURO', issuer: this.getTesouroIssuer() };
    const platformFee = await this.platformFeePaymentForAsset({
      amount: record.operationContext?.talktostellar_transaction_fee_amount,
      asset: tesouroAsset,
    });
    if (platformFee.error && platformFee.treasuryPublicKey && Number(platformFee.amount) > 0) {
      const fallback = await this.completeSandboxOnRampWithLedgerFallback(
        record,
        destinationAmountTesouro,
        `Platform fee treasury was not ready: ${platformFee.error}`,
      );
      if (fallback) return fallback;
      return this.failSandboxOnRamp(record, `Não consegui preparar a carteira admin para receber a taxa do app: ${platformFee.error}`);
    }
    const platformFeeContext = platformFee.payment
      ? {
          platform_fee_settlement_status: 'completed',
          platform_fee_settlement_amount: platformFee.amount,
          platform_fee_settlement_asset_code: platformFee.asset.code,
          platform_fee_settlement_asset_issuer: platformFee.asset.issuer,
          platform_fee_treasury_public_key: platformFee.treasuryPublicKey,
        }
      : platformFee.treasuryPublicKey && Number(platformFee.amount) > 0
        ? {
            platform_fee_settlement_status: 'skipped',
            platform_fee_settlement_amount: platformFee.amount,
            platform_fee_settlement_asset_code: platformFee.asset.code,
            platform_fee_settlement_error: platformFee.error || 'Platform fee payment was not created.',
            platform_fee_treasury_public_key: platformFee.treasuryPublicKey,
          }
        : {};

    if (sameIssuedAsset(finalAsset, tesouroAsset)) {
      await this.hydrateSandboxPostConversionWalletSecret(record);
      try {
        const tesouroTrustline = await this.ensureIssuedAssetTrustline({
          sessionId: record.sessionId,
          sessionToken: '',
          userId: record.userId,
          publicKey: record.publicKey,
          vaultSecretId: record.vaultSecretId,
        }, tesouroAsset);
        if (!tesouroTrustline.success) {
          const fallback = await this.completeSandboxOnRampWithLedgerFallback(
            record,
            destinationAmountTesouro,
            `User TESOURO trustline was not ready: ${tesouroTrustline.error || 'unknown error'}`,
          );
          if (fallback) return fallback;
          return this.failSandboxOnRamp(
            record,
            'Não consegui preparar sua conta para receber reais agora. Entre novamente e gere um novo PIX.',
          );
        }
      } catch (error) {
        logger.warn(`[ramp] Could not ensure TESOURO trustline before sandbox delivery: ${debugErrorMessage(error)}`);
        const fallback = await this.completeSandboxOnRampWithLedgerFallback(
          record,
          destinationAmountTesouro,
          `Could not ensure user TESOURO trustline: ${debugErrorMessage(error)}`,
        );
        if (fallback) return fallback;
        return this.failSandboxOnRamp(
          record,
          'Não consegui preparar sua conta para receber reais agora. Entre novamente e gere um novo PIX.',
        );
      }

      const balancesBefore = await StellarService.getAccountBalance(record.publicKey);
      const userDeliveryPayment = {
        destination: record.publicKey,
        amount: destinationAmountTesouro,
        assetCode: 'TESOURO',
        assetIssuer: this.getTesouroIssuer(),
      };
      const directTesouroResult = platformFee.payment
        ? await StellarService.submitAssetPaymentsFromSecret({
            sourceSecret,
            payments: [userDeliveryPayment, platformFee.payment],
            memoText: 'PIX ONRAMP SANDBOX',
          })
        : await StellarService.submitAssetPaymentFromSecret({
            sourceSecret,
            ...userDeliveryPayment,
            memoText: 'PIX ONRAMP SANDBOX',
          });

      if (directTesouroResult.success) {
        let balancesAfter = await StellarService.getAccountBalance(record.publicKey);
        let deliveredDelta = balanceDeltaAmount(balancesBefore, balancesAfter, tesouroAsset);
        const expectedDelta = Number(destinationAmountTesouro);
        for (const delayMs of sandboxSettlementBalancePollDelays()) {
          if (Number.isFinite(deliveredDelta) && deliveredDelta + 0.0000001 >= expectedDelta) break;
          await sleep(delayMs);
          balancesAfter = await StellarService.getAccountBalance(record.publicKey);
          deliveredDelta = balanceDeltaAmount(balancesBefore, balancesAfter, tesouroAsset);
        }

        if (!Number.isFinite(deliveredDelta) || deliveredDelta + 0.0000001 < expectedDelta) {
          const fallback = await this.completeSandboxOnRampWithLedgerFallback(
            record,
            destinationAmountTesouro,
            `Sandbox TESOURO delivery hash ${directTesouroResult.hash || 'unknown'} did not appear in balance polling. Detected delta: ${Number.isFinite(deliveredDelta) ? deliveredDelta.toFixed(7).replace(/\.?0+$/, '') : 'unknown'}.`,
          );
          if (fallback) return fallback;
          return this.failSandboxOnRamp(
            record,
            `Sandbox TESOURO delivery was submitted but wallet balance did not increase by ${destinationAmountTesouro}. ` +
              `Detected delta: ${Number.isFinite(deliveredDelta) ? deliveredDelta.toFixed(7).replace(/\.?0+$/, '') : 'unknown'}.`,
          );
        }

        record.finalAmount = destinationAmountTesouro;
        record.deliverySourceAmount = record.sourceAmountBrl;
        (record.transaction as any).toAmount = destinationAmountTesouro;
        (record.transaction as any).toCurrency = this.getTesouroIdentifier();
        (record.transaction as any).finalAmount = destinationAmountTesouro;
        (record.transaction as any).auto_conversion = { required: false };
        const postConversionInput = {
          record,
          sourceAsset: tesouroAsset,
          sourceAmount: destinationAmountTesouro,
        };
        this.setSandboxPostConversionPending(postConversionInput);
        const postAsset = this.resolveSandboxPostConversionAsset(record);
        const completed = await this.completeSandboxOnRamp(record, directTesouroResult.hash, {
          delivery_source_amount: record.sourceAmountBrl,
          platform_fee_settlement_hash: platformFee.payment ? directTesouroResult.hash : undefined,
          ...platformFeeContext,
          post_conversion_status: postAsset ? 'pending' : undefined,
          post_conversion_source_asset_code: postAsset ? tesouroAsset.code : undefined,
          post_conversion_source_asset_issuer: postAsset ? tesouroAsset.issuer : undefined,
          post_conversion_source_amount: postAsset ? destinationAmountTesouro : undefined,
        });
        this.scheduleSandboxPostOnRampConversion(postConversionInput);
        return completed;
      }

      const treasuryTesouroBalance = await this.getSandboxTesouroTreasuryBalance();
      const liquidityDetail = treasuryTesouroBalance !== undefined
        ? ` Sandbox TESOURO treasury balance is ${treasuryTesouroBalance}; this order needs ${destinationAmountTesouro}.`
        : '';
      const fallback = await this.completeSandboxOnRampWithLedgerFallback(
        record,
        destinationAmountTesouro,
        `Sandbox TESOURO delivery failed: ${directTesouroResult.error || 'unknown error'}.${liquidityDetail}`,
      );
      if (fallback) return fallback;
      return this.failSandboxOnRamp(
        record,
        `Sandbox TESOURO delivery failed: ${directTesouroResult.error || 'unknown error'}.${liquidityDetail}`,
      );
    }

    const finalTrustline = await this.ensureIssuedAssetTrustline({
      sessionId: record.sessionId,
      sessionToken: '',
      userId: record.userId,
      publicKey: record.publicKey,
      vaultSecretId: record.vaultSecretId,
    }, finalAsset);
    if (!finalTrustline.success) {
      const fallback = await this.completeSandboxOnRampWithLedgerFallback(
        record,
        destinationAmountTesouro,
        `Final ${finalAsset.code} trustline was not ready: ${finalTrustline.error || 'unknown error'}`,
      );
      if (fallback) return fallback;
      return this.failSandboxOnRamp(record, finalTrustline.error || `Could not create ${finalAsset.code} trustline before final PIX settlement.`);
    }

    const desiredFinalAmount = record.desiredFinalAmount ? toStellarAmount(record.desiredFinalAmount) : '';
    const desiredFinalAssetCode = normalizeAssetCode(record.desiredFinalAssetCode || record.finalAssetCode);

    if (desiredFinalAmount && desiredFinalAssetCode === normalizeAssetCode(finalAsset.code)) {
      const sourceMax = toStellarAmount(Math.max(
        Number(destinationAmountTesouro) * 1.2,
        Number(destinationAmountTesouro) + 1,
      ));
      const exactFinalConversion = await StellarService.submitStrictReceivePaymentFromSecret({
        sourceSecret,
        destination: record.publicKey,
        sourceAsset: tesouroAsset,
        destinationAsset: finalAsset,
        destinationAmount: desiredFinalAmount,
        sourceMax,
        memoText: `PIX ONRAMP ${finalAsset.code}`,
        additionalSourcePayments: platformFee.payment ? [platformFee.payment] : undefined,
      });

      if (exactFinalConversion.success) {
        record.finalAmount = desiredFinalAmount;
        record.finalConversionHash = exactFinalConversion.hash;
        record.finalConversionSourceAmount = exactFinalConversion.sourceAmount || destinationAmountTesouro;
        (record.transaction as any).toAmount = desiredFinalAmount;
        (record.transaction as any).toCurrency = assetIdentifier(finalAsset);
        (record.transaction as any).finalAmount = desiredFinalAmount;
        (record.transaction as any).auto_conversion = {
          required: true,
          status: 'completed',
          source_asset_code: 'TESOURO',
          source_amount: record.finalConversionSourceAmount,
          destination_asset_code: finalAsset.code,
          destination_asset_issuer: finalAsset.issuer,
          destination_amount: desiredFinalAmount,
          hash: exactFinalConversion.hash,
          mode: 'strict_receive_exact_final_asset',
        };
        const postConversionInput = {
          record,
          sourceAsset: finalAsset,
          sourceAmount: desiredFinalAmount,
        };
        this.setSandboxPostConversionPending(postConversionInput);
        const postAsset = this.resolveSandboxPostConversionAsset(record);
        const completed = await this.completeSandboxOnRamp(record, exactFinalConversion.hash, {
          final_conversion_status: 'completed',
          final_conversion_hash: exactFinalConversion.hash,
          final_conversion_source_amount: record.finalConversionSourceAmount,
          final_conversion_mode: 'strict_receive_exact_final_asset',
          final_amount: desiredFinalAmount,
          platform_fee_settlement_hash: platformFee.payment ? exactFinalConversion.hash : undefined,
          ...platformFeeContext,
          post_conversion_status: postAsset ? 'pending' : undefined,
          post_conversion_source_asset_code: postAsset ? finalAsset.code : undefined,
          post_conversion_source_asset_issuer: postAsset ? finalAsset.issuer : undefined,
          post_conversion_source_amount: postAsset ? desiredFinalAmount : undefined,
        });
        this.scheduleSandboxPostOnRampConversion(postConversionInput);
        return completed;
      }

      record.finalConversionError = `Exact ${finalAsset.code} delivery failed: ${exactFinalConversion.error || 'unknown error'}`;
      const fallback = await this.completeSandboxOnRampWithLedgerFallback(
        record,
        destinationAmountTesouro,
        record.finalConversionError,
      );
      if (fallback) return fallback;
    }

    const converted = await StellarService.submitStrictSendPaymentFromSecret({
      sourceSecret,
      destination: record.publicKey,
      sourceAsset: tesouroAsset,
      sourceAmount: destinationAmountTesouro,
      destinationAsset: finalAsset,
      memoText: 'PIX ONRAMP CONVERT',
      additionalSourcePayments: platformFee.payment ? [platformFee.payment] : undefined,
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
      const postConversionInput = {
        record,
        sourceAsset: finalAsset,
        sourceAmount: record.finalAmount,
      };
      this.setSandboxPostConversionPending(postConversionInput);
      const postAsset = this.resolveSandboxPostConversionAsset(record);
      const completed = await this.completeSandboxOnRamp(record, converted.hash, {
        final_conversion_status: 'completed',
        final_conversion_hash: converted.hash,
        final_conversion_source_amount: destinationAmountTesouro,
        platform_fee_settlement_hash: platformFee.payment ? converted.hash : undefined,
        ...platformFeeContext,
        post_conversion_status: postAsset ? 'pending' : undefined,
        post_conversion_source_asset_code: postAsset ? finalAsset.code : undefined,
        post_conversion_source_asset_issuer: postAsset ? finalAsset.issuer : undefined,
        post_conversion_source_amount: postAsset ? record.finalAmount : undefined,
      });
      this.scheduleSandboxPostOnRampConversion(postConversionInput);
      return completed;
    }

    record.finalConversionError = converted.error || `Could not convert TESOURO to ${finalAsset.code}.`;

    (record.transaction as any).auto_conversion = {
      required: true,
      status: 'failed',
      source_asset_code: 'TESOURO',
      source_amount: destinationAmountTesouro,
      destination_asset_code: finalAsset.code,
      destination_asset_issuer: finalAsset.issuer,
      error: record.finalConversionError,
    };
    const fallback = await this.completeSandboxOnRampWithLedgerFallback(
      record,
      destinationAmountTesouro,
      record.finalConversionError,
    );
    if (fallback) return fallback;
    return this.failSandboxOnRamp(record, record.finalConversionError);
  }

  private static async completeSandboxOnRampWithLedgerSettlement(
    record: SandboxMockOnRampOrder,
    destinationAmountTesouro: string,
    reason: string,
  ): Promise<SandboxMockOnRampOrder> {
    const finalAsset = resolveRampFinalAsset(record.finalAssetCode || 'TESOURO', record.finalAssetIssuer);
    const tesouroAsset = { code: 'TESOURO', issuer: this.getTesouroIssuer() };
    const pseudoHash = `sandbox-ledger-${String(record.transaction.id || crypto.randomUUID()).replace(/^sandbox-pix-/, '').slice(0, 18)}`;
    if (sameIssuedAsset(finalAsset, tesouroAsset)) {
      record.finalAmount = destinationAmountTesouro;
      record.deliverySourceAmount = record.sourceAmountBrl;
      (record.transaction as any).toAmount = destinationAmountTesouro;
      (record.transaction as any).toCurrency = this.getTesouroIdentifier();
      (record.transaction as any).finalAmount = destinationAmountTesouro;
      (record.transaction as any).sandbox_ledger_settlement = true;
      (record.transaction as any).auto_conversion = {
        required: false,
        status: 'completed',
        source_asset_code: 'TESOURO',
        destination_asset_code: 'TESOURO',
        destination_asset_issuer: tesouroAsset.issuer,
        destination_amount: destinationAmountTesouro,
        mode: 'sandbox_anchor_only',
        reason,
      };

      return this.completeSandboxOnRamp(record, pseudoHash, {
        delivery_source_amount: record.sourceAmountBrl,
        destination_amount_anchor: destinationAmountTesouro,
        final_amount: destinationAmountTesouro,
        final_conversion_status: 'not_required',
        final_settlement_mode: 'sandbox_anchor_only',
        sandbox_ledger_settlement: true,
        settlement_note: `${reason} TESOURO on-ramp was recorded in sandbox ledger mode.`,
      });
    }

    record.deliverySourceAmount = record.sourceAmountBrl;
    record.finalConversionSourceAmount = destinationAmountTesouro;
    const rawDesiredFinalAmount = coalesceString(record.desiredFinalAmount, record.operationContext?.desired_final_amount);
    const desiredFinalAmount = rawDesiredFinalAmount ? toStellarAmount(rawDesiredFinalAmount) : '';
    const desiredFinalAssetCode = normalizeAssetCode(coalesceString(
      record.desiredFinalAssetCode,
      record.operationContext?.desired_final_asset_code,
      record.finalAssetCode,
    ));
    const exactFinalAmount = desiredFinalAmount && desiredFinalAssetCode === normalizeAssetCode(finalAsset.code)
      ? desiredFinalAmount
      : '';
    if (exactFinalAmount) {
      record.finalAmount = exactFinalAmount;
      record.finalConversionHash = pseudoHash;
      (record.transaction as any).toAmount = exactFinalAmount;
      (record.transaction as any).toCurrency = assetIdentifier(finalAsset);
      (record.transaction as any).finalAmount = exactFinalAmount;
    }
    (record.transaction as any).sandbox_ledger_settlement = true;
    (record.transaction as any).auto_conversion = {
      required: true,
      status: exactFinalAmount ? 'completed' : 'pending',
      source_asset_code: 'TESOURO',
      source_amount: destinationAmountTesouro,
      destination_asset_code: finalAsset.code,
      destination_asset_issuer: finalAsset.issuer,
      destination_amount: exactFinalAmount || undefined,
      hash: exactFinalAmount ? pseudoHash : undefined,
      mode: 'sandbox_anchor_only',
      reason,
    };
    const postConversionInput = exactFinalAmount
      ? {
          record,
          sourceAsset: finalAsset,
          sourceAmount: exactFinalAmount,
        }
      : null;
    if (postConversionInput) this.setSandboxPostConversionPending(postConversionInput);
    const postAsset = this.resolveSandboxPostConversionAsset(record);

    const completed = await this.completeSandboxOnRamp(record, pseudoHash, {
      delivery_source_amount: record.sourceAmountBrl,
      destination_amount_anchor: destinationAmountTesouro,
      final_amount: exactFinalAmount || undefined,
      final_conversion_status: exactFinalAmount ? 'completed' : 'pending',
      final_conversion_hash: exactFinalAmount ? pseudoHash : undefined,
      final_conversion_source_amount: destinationAmountTesouro,
      final_conversion_mode: 'sandbox_anchor_only',
      final_settlement_mode: 'sandbox_anchor_only',
      sandbox_ledger_settlement: true,
      post_conversion_status: postAsset ? 'pending' : undefined,
      post_conversion_source_asset_code: postAsset ? finalAsset.code : undefined,
      post_conversion_source_asset_issuer: postAsset ? finalAsset.issuer : undefined,
      post_conversion_source_amount: postAsset ? exactFinalAmount : undefined,
      settlement_note: exactFinalAmount
        ? `${reason} Exact ${finalAsset.code} receive amount was recorded in sandbox ledger mode.`
        : `${reason} Final ${finalAsset.code} conversion remains pending because no exact sandbox receive amount was available.`,
    });
    if (postConversionInput) this.scheduleSandboxPostOnRampConversion(postConversionInput);
    return completed;
  }

  private static async deliverSandboxOnRamp(orderId: string, operationId?: string, context?: SessionWalletContext, trustedInternal = false): Promise<SandboxMockOnRampOrder | null> {
    const record = await this.hydrateSandboxOnRampFromOperation(orderId, operationId);
    if (!record) return null;
    if (context) {
      this.assertSandboxOnRampOwner(record, context);
    } else if (!trustedInternal) {
      throw apiError('TalkToStellar session is required to confirm this PIX order.', 401);
    }
    if (record.transaction.status === 'completed') return record;
    if (context?.vaultSecretId && !record.vaultSecretId) {
      record.vaultSecretId = context.vaultSecretId;
    }

    record.transaction.status = 'processing' as any;
    record.transaction.updatedAt = new Date().toISOString();
    await this.updateRampOperationStatus(record.operationId, 'PROCESSING');

    const finalAsset = resolveRampFinalAsset(record.finalAssetCode || 'TESOURO', record.finalAssetIssuer);
    const sourceSecret = coalesceString(process.env.TESOURO_DISTRIBUTOR_SECRET);
    if (!sourceSecret) {
      if (this.sandboxLedgerSettlementEnabled()) {
        return this.completeSandboxOnRampWithLedgerSettlement(
          record,
          toStellarAmount(record.destinationAmount),
          'TESOURO_DISTRIBUTOR_SECRET is not configured; sandbox PIX completed in explicit ledger simulation mode.',
        );
      }
      console.warn('[ramp] Refusing to complete PIX on-ramp without TESOURO_DISTRIBUTOR_SECRET; real TESOURO settlement is required.');
      return this.failSandboxOnRamp(
        record,
        'PIX de entrada ainda não está configurado para creditar saldo real neste ambiente. Tente novamente em alguns segundos.',
      );
    }

    const destinationAmount = toStellarAmount(record.destinationAmount);
    return this.settleSandboxOnRampFinalAsset({ record, sourceSecret, destinationAmountTesouro: destinationAmount });
  }

  private static async ensureSandboxCollectorTrustline(asset: { code: string; issuer?: string }): Promise<{ publicKey: string; success: boolean; error?: string }> {
    const publicKey = coalesceString(process.env.TESOURO_DISTRIBUTOR_PUBLIC);
    const secret = coalesceString(process.env.TESOURO_DISTRIBUTOR_SECRET);
    if (!publicKey || !secret) {
      return {
        publicKey,
        success: false,
        error: 'Sandbox PIX settlement is not configured in this test environment.',
      };
    }

    const code = normalizeAssetCode(asset.code || 'TESOURO');
    if (code === 'XLM') {
      return { publicKey, success: true };
    }

    const trustline = await StellarService.ensureTrustlineFromSecret({
      sourceSecret: secret,
      assetCode: code,
      assetIssuer: asset.issuer || getAssetIssuer(code) || '',
    });

    return { publicKey, success: trustline.success, error: trustline.error };
  }

  private static async ensurePlatformFeeTreasuryTrustline(asset: { code: string; issuer?: string }): Promise<{ success: boolean; error?: string }> {
    const code = normalizeAssetCode(asset.code);
    if (!PlatformFeeService.getTreasuryPublicKey() || code === 'XLM') {
      return { success: true };
    }

    const treasurySecret = coalesceString(
      process.env.TALKTOSTELLAR_FEE_TREASURY_SECRET_KEY,
      process.env.TTS_FEE_TREASURY_SECRET_KEY,
    );
    if (!treasurySecret) {
      return { success: true };
    }

    const trustline = await StellarService.ensureTrustlineFromSecret({
      sourceSecret: treasurySecret,
      assetCode: code,
      assetIssuer: asset.issuer || getAssetIssuer(code) || '',
    });
    return { success: trustline.success, error: trustline.error };
  }

  private static async platformFeePaymentForAsset(input: {
    amount?: unknown;
    asset: { code: string; issuer?: string };
    sourcePublicKey?: string;
  }): Promise<{
    enabled: boolean;
    payment?: { destination: string; amount: string; assetCode: string; assetIssuer?: string };
    amount: string;
    asset: { code: string; issuer?: string };
    treasuryPublicKey?: string;
    error?: string;
  }> {
    const treasuryPublicKey = PlatformFeeService.getTreasuryPublicKey();
    const feeAmount = parseHumanAmountNumber(input.amount);
    if (!treasuryPublicKey || !Number.isFinite(feeAmount) || feeAmount <= 0) {
      return {
        enabled: false,
        amount: '0',
        asset: input.asset,
        treasuryPublicKey,
      };
    }
    if (input.sourcePublicKey && treasuryPublicKey === input.sourcePublicKey) {
      return {
        enabled: false,
        amount: '0',
        asset: input.asset,
        treasuryPublicKey,
        error: 'Treasury matches source account.',
      };
    }

    const code = normalizeAssetCode(input.asset.code) === 'BRL' ? 'TESOURO' : normalizeAssetCode(input.asset.code);
    const asset = code === 'TESOURO'
      ? { code: 'TESOURO', issuer: input.asset.issuer || this.getTesouroIssuer() }
      : { code, issuer: input.asset.issuer || getAssetIssuer(code) || undefined };
    const amount = toStellarAmount(feeAmount);
    const trustline = await this.ensurePlatformFeeTreasuryTrustline(asset);
    if (!trustline.success) {
      return {
        enabled: false,
        amount,
        asset,
        treasuryPublicKey,
        error: trustline.error || `Treasury cannot receive ${asset.code}.`,
      };
    }

    return {
      enabled: true,
      amount,
      asset,
      treasuryPublicKey,
      payment: {
        destination: treasuryPublicKey,
        amount,
        assetCode: asset.code,
        assetIssuer: asset.issuer,
      },
    };
  }

  private static createSandboxOffRampFallback(input: {
    context: SessionWalletContext;
    customerId: string;
    quoteId: string;
    amount: string;
    sourceAmount?: string;
    sourceAssetCode?: string;
    sourceAssetIssuer?: string;
    targetBrl?: string;
    destinationBrl?: string;
    externalBankAccount?: Record<string, unknown>;
    fiatAccountId?: string;
    upstreamError?: string;
  }): OffRampTransaction {
    const orderId = `sandbox-offramp-${crypto.randomUUID()}`;
    const now = new Date().toISOString();
    const destinationPixKey = pixKeyFromExternalBankAccount(input.externalBankAccount);
    const sourceAsset = input.sourceAssetCode
      ? {
          code: normalizeAssetCode(input.sourceAssetCode),
          issuer: input.sourceAssetIssuer || getAssetIssuer(normalizeAssetCode(input.sourceAssetCode)) || undefined,
        }
      : { code: 'TESOURO', issuer: this.getTesouroIssuer() };
    const debitAmount = toStellarAmount(input.sourceAmount || input.amount);
    const transaction = {
      id: orderId,
      customerId: input.customerId,
      quoteId: input.quoteId,
      status: 'pending' as const,
      fromAmount: debitAmount,
      fromCurrency: assetIdentifier(sourceAsset),
      toAmount: input.destinationBrl || input.targetBrl || '',
      toCurrency: 'BRL',
      stellarAddress: input.context.publicKey,
      fiatAccount: {
        id: input.fiatAccountId || `sandbox-pix-${crypto.randomUUID()}`,
        type: 'pix',
        label: destinationPixKey ? `PIX ${destinationPixKey}` : 'PIX',
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
      sourceAmount: input.sourceAmount ? normalizeAmount(input.sourceAmount, 'source_amount') : undefined,
      sourceAssetCode: input.sourceAssetCode ? normalizeAssetCode(input.sourceAssetCode) : undefined,
      sourceAssetIssuer: input.sourceAssetIssuer,
      targetBrl: input.targetBrl,
      destinationBrl: input.destinationBrl || input.targetBrl,
      externalBankAccount: input.externalBankAccount,
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

	    const sourceAsset = record.sourceAssetCode
	      ? resolveConfiguredAsset(record.sourceAssetCode, record.sourceAssetIssuer)
	      : { code: 'TESOURO', issuer: this.getTesouroIssuer() };
	    const debitAmount = toStellarAmount(record.sourceAmount || record.amountTesouro);
	    const operationId = record.operationId || input.operationId;
	    const operation = operationId ? await OperationRepository.findById(operationId).catch(() => null) : null;
	    const operationContext = parseOperationContext(operation?.context);
	    const platformFee = await this.platformFeePaymentForAsset({
	      amount: coalesceString(
	        operationContext.talktostellar_transaction_fee_amount,
	        operationContext.platform_fee_amount,
	        operationContext.app_fee_amount,
	      ),
	      asset: {
	        code: coalesceString(operationContext.talktostellar_transaction_fee_asset_code, sourceAsset.code),
	        issuer: coalesceString(operationContext.talktostellar_transaction_fee_asset_issuer, sourceAsset.issuer),
	      },
	      sourcePublicKey: input.context.publicKey,
	    });
	    if (
	      platformFee.error &&
	      platformFee.treasuryPublicKey &&
	      parseHumanAmountNumber(platformFee.amount) > 0
	    ) {
	      record.transaction.status = 'failed' as any;
	      record.transaction.updatedAt = new Date().toISOString();
	      record.submitError = platformFee.error;
	      await this.updateRampOperationStatus(operationId, 'FAILED');
	      return { success: false, order_id: input.orderId, error: platformFee.error };
	    }
	    const feeUsesSourceAsset = Boolean(platformFee.payment && sameIssuedAsset(platformFee.asset, sourceAsset));
	    const platformFeeAmount = feeUsesSourceAsset ? parseHumanAmountNumber(platformFee.amount) : 0;
	    const collectorAmount = toStellarAmount(Math.max(0, parseHumanAmountNumber(debitAmount) - platformFeeAmount));
	    if (parseHumanAmountNumber(collectorAmount) <= 0) {
	      record.transaction.status = 'failed' as any;
	      record.transaction.updatedAt = new Date().toISOString();
	      record.submitError = 'Valor insuficiente para liquidar o PIX depois da taxa.';
	      await this.updateRampOperationStatus(operationId, 'FAILED');
	      return { success: false, order_id: input.orderId, error: record.submitError };
	    }
	    const currentBalances = normalizeBalances(await StellarService.getAccountBalance(input.context.publicKey));
	    assertSufficientBalance(currentBalances, sourceAsset, debitAmount);
	    const collector = await this.ensureSandboxCollectorTrustline(sourceAsset);
    if (!collector.success || !collector.publicKey) {
      record.transaction.status = 'failed' as any;
      record.transaction.updatedAt = new Date().toISOString();
      record.submitError = `${collector.error || `Could not prepare sandbox ${sourceAsset.code} collector.`} ` +
        'Configure TESOURO_DISTRIBUTOR_SECRET and TESOURO_DISTRIBUTOR_PUBLIC to debit the wallet; refusing to mark PIX off-ramp as completed without a real balance movement.';
	      await this.updateRampOperationStatus(operationId, 'FAILED');
	      return { success: false, order_id: input.orderId, error: record.submitError };
	    }

	    record.transaction.status = 'processing' as any;
	    record.transaction.updatedAt = new Date().toISOString();
	    await this.updateRampOperationStatus(operationId, 'PROCESSING');

	    const secret = await new VaultService(supabase).getSecret(input.context.vaultSecretId);
	    const result = feeUsesSourceAsset && platformFee.payment
	      ? await StellarService.submitAssetPaymentsFromSecret({
	          sourceSecret: secret,
	          payments: [
	            {
	              destination: collector.publicKey,
	              amount: collectorAmount,
	              assetCode: sourceAsset.code,
	              assetIssuer: sourceAsset.issuer,
	            },
	            platformFee.payment,
	          ],
	          memoText: 'PIX OFFRAMP SANDBOX',
	        })
	      : await StellarService.submitAssetPaymentFromSecret({
	          sourceSecret: secret,
	          destination: collector.publicKey,
	          amount: debitAmount,
	          assetCode: sourceAsset.code,
	          assetIssuer: sourceAsset.issuer,
	          memoText: 'PIX OFFRAMP SANDBOX',
	        });

    if (!result.success) {
      record.transaction.status = 'failed' as any;
      record.transaction.updatedAt = new Date().toISOString();
      record.submitError = result.error || 'Sandbox off-ramp payment failed.';
	      await this.updateRampOperationStatus(operationId, 'FAILED');
	      return { ...result, order_id: input.orderId };
	    }

    let balancesAfter = normalizeBalances(await StellarService.getAccountBalance(input.context.publicKey));
    let debitedDelta = -balanceDeltaAmount(currentBalances, balancesAfter, sourceAsset);
    const expectedDebit = Number(debitAmount);
    for (const delayMs of sandboxSettlementBalancePollDelays()) {
      if (Number.isFinite(debitedDelta) && debitedDelta + 0.0000001 >= expectedDebit) break;
      await sleep(delayMs);
      balancesAfter = normalizeBalances(await StellarService.getAccountBalance(input.context.publicKey));
      debitedDelta = -balanceDeltaAmount(currentBalances, balancesAfter, sourceAsset);
    }

    if (!Number.isFinite(debitedDelta) || debitedDelta + 0.0000001 < expectedDebit) {
      record.transaction.status = 'failed' as any;
      record.transaction.updatedAt = new Date().toISOString();
      record.submitError = `Sandbox off-ramp transaction was submitted but wallet balance did not decrease by ${debitAmount}. ` +
        `Detected debit: ${Number.isFinite(debitedDelta) ? debitedDelta.toFixed(7).replace(/\.?0+$/, '') : 'unknown'}.`;
	      await this.updateRampOperationStatus(operationId, 'FAILED');
	      return { success: false, order_id: input.orderId, error: record.submitError, hash: result.hash };
	    }

    record.transaction.status = 'completed' as any;
    record.transaction.updatedAt = new Date().toISOString();
    record.submitHash = result.hash;
    record.transaction.stellarTxHash = result.hash;
    record.transaction.toAmount = record.destinationBrl || record.targetBrl || record.transaction.toAmount;
    record.transaction.toCurrency = 'BRL';
	    if (operationId) {
	      await OperationRepository.update(operationId, {
	        context: JSON.stringify({
	          ...operationContext,
	          platform_fee_settlement_status: feeUsesSourceAsset ? 'completed' : 'skipped',
	          platform_fee_settlement_hash: feeUsesSourceAsset ? result.hash || '' : undefined,
	          platform_fee_settlement_amount: feeUsesSourceAsset ? platformFee.amount : undefined,
	          platform_fee_settlement_asset_code: feeUsesSourceAsset ? platformFee.asset.code : undefined,
	          platform_fee_settlement_asset_issuer: feeUsesSourceAsset ? platformFee.asset.issuer : undefined,
	          platform_fee_treasury_public_key: feeUsesSourceAsset ? platformFee.treasuryPublicKey : undefined,
	          collector_settlement_amount: feeUsesSourceAsset ? collectorAmount : debitAmount,
	          collector_settlement_asset_code: sourceAsset.code,
	          collector_settlement_asset_issuer: sourceAsset.issuer,
	          submit_hash: result.hash || '',
	        }),
	      } as any).catch((error) => {
	        console.warn('[ramp] Could not persist PIX off-ramp fee settlement context:', debugErrorMessage(error));
	      });
	    }
	    await this.updateRampOperationStatus(operationId, 'COMPLETED');
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
    // 1x1 PNG data URL accepted by the controlled KYC flow.
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

  private static buildSandboxPixAccount(bankAccountId: string, email?: string, pixKeyInput?: string, pixKeyTypeInput?: string): any {
    const fallbackPixKey = email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : crypto.randomUUID();
    const pixKey = coalesceString(pixKeyInput, fallbackPixKey);
    const pixKeyType = pixKeyTypeFromValue(pixKey, pixKeyTypeInput || (pixKey === email ? 'email' : ''));
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
    skipBankAccount?: boolean;
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
    let resolvedBankAccountId = input.bankAccountId;

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

    if (input.skipBankAccount) {
      steps.bank_account = {
        status: 'active',
        bankAccountId: input.bankAccountId,
        source: 'organization_account',
      };
    } else {
      try {
        steps.bank_account = await anchor.createBankAccountForCustomer(
          input.customerId,
          this.buildSandboxPixAccount(input.bankAccountId, input.email),
        );
        resolvedBankAccountId = coalesceString(
          (steps.bank_account as any)?.bankAccountId,
          (steps.bank_account as any)?.id,
          input.bankAccountId,
        );
      } catch (error) {
        if (isDuplicateResourceError(error)) {
          steps.bank_account = 'already_registered';
        } else if (input.kycUrl && typeof anchor.createBankAccountWithPresignedUrl === 'function') {
          const pixAccount = this.buildSandboxPixAccount(input.bankAccountId, input.email);
          try {
            steps.bank_account = await anchor.createBankAccountWithPresignedUrl({
              presignedUrl: input.kycUrl,
              bankAccountId: pixAccount.bankAccountId,
              account: pixAccount.account,
              skipAutoApproval: false,
              label: pixAccount.label,
            });
            resolvedBankAccountId = coalesceString(
              (steps.bank_account as any)?.bankAccountId,
              (steps.bank_account as any)?.id,
              input.bankAccountId,
            );
          } catch (fallbackError) {
            steps.bank_account = isDuplicateResourceError(fallbackError)
              ? 'already_registered'
              : { error: debugErrorMessage(fallbackError) };
          }
        } else {
          steps.bank_account = { error: debugErrorMessage(error) };
        }
      }
    }

    if (onboardingBankAccountReady(steps.bank_account)) {
      this.programmaticOnboardingCache.set(cacheKey, { cryptoWalletId });
    } else {
      console.warn('[ramp] PIX bank account onboarding did not complete; not caching failed setup:', debugErrorMessage((steps.bank_account as any)?.error || 'bank account not ready'));
    }
    return { bankAccountId: resolvedBankAccountId, cryptoWalletId, steps };
  }

  static async createCustomerForSession(input: CustomerForSessionInput): Promise<{
    customer: Customer;
    customer_id: string;
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

    const organizationBankAccountId = await this.getActiveEtherfuseOrganizationBankAccountId();
    const useOrganizationBankAccount = Boolean(organizationBankAccountId);
    const useRegionalSandboxFallback = !useOrganizationBankAccount && this.sandboxPixFallbackEnabled();
    const preparedProxy = useOrganizationBankAccount
      ? { bankAccountId: organizationBankAccountId as string, kycUrl: undefined }
      : useRegionalSandboxFallback
        ? { bankAccountId: customer.bankAccountId || crypto.randomUUID(), kycUrl: undefined }
      : await this.prepareEtherfusePixProxy({
          customerId: customer.id,
          publicKey: context.publicKey,
          bankAccountId: customer.bankAccountId,
          email: coalesceString(input.email, context.email) || undefined,
        });
    const programmatic = useRegionalSandboxFallback
      ? {
          bankAccountId: preparedProxy.bankAccountId,
          cryptoWalletId: undefined,
          steps: {
            bank_account: {
              status: 'skipped',
              source: 'regional_sandbox_fallback',
              reason: 'no_active_brl_pix_organization_account',
            },
          },
        }
      : await this.runSandboxProgrammaticOnboarding({
          customerId: customer.id,
          publicKey: context.publicKey,
          bankAccountId: preparedProxy.bankAccountId,
          email: coalesceString(input.email, context.email) || undefined,
          kycUrl: preparedProxy.kycUrl,
          skipBankAccount: useOrganizationBankAccount,
        });
    customer = { ...customer, bankAccountId: programmatic.bankAccountId };

    return {
      customer,
      customer_id: customer.id,
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
    if (!customerId) throw apiError('Conta PIX não encontrada para esta tentativa. Gere uma nova estimativa e tente novamente.', 400);

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
    if (!customerId) throw apiError('Conta PIX não encontrada para esta tentativa. Gere uma nova estimativa e tente novamente.', 400);

    const accounts = await this.getEtherfuseClient().getFiatAccounts(customerId);
    return { customer_id: customerId, accounts };
  }

  static async getQuoteForSession(input: QuoteForSessionInput): Promise<{
    quote: Quote;
    direction: 'onramp' | 'offramp';
    from_currency: string;
    to_currency: string;
    customer?: Customer;
    customer_id?: string;
    bank_account_id?: string;
    kyc_url?: string;
    programmatic_onboarding?: Record<string, unknown>;
    final_asset?: { code: string; issuer?: string; identifier: string };
    anchor_asset?: { code: 'TESOURO'; issuer: string; identifier: string };
  }> {
    const context = await this.resolveSessionWallet(input);
    let customerId = coalesceString(input.customer_id, input.customerId);
    let preparedCustomer: Customer | undefined;
    let preparedKycUrl: string | undefined;
    let preparedProgrammatic: Record<string, unknown> | undefined;
    if (!customerId) {
      const customerResult = await this.createCustomerForSession({
        session_id: context.sessionId,
        session_token: context.sessionToken,
        email: context.email,
        country: 'BR',
      });
      customerId = customerResult.customer.id;
      preparedCustomer = customerResult.customer;
      preparedKycUrl = customerResult.kyc_url;
      preparedProgrammatic = customerResult.programmatic_onboarding;
    }
    if (!customerId) {
      throw apiError('Não consegui preparar a conta PIX para cotação. Entre novamente e tente gerar o PIX outra vez.', 409);
    }

    const direction = input.direction === 'offramp' ? 'offramp' : 'onramp';
    const finalAsset = direction === 'onramp'
      ? resolveRampFinalAsset(input.final_asset, input.finalAsset, input.final_asset_code, input.finalAssetCode, input.to_currency, input.toCurrency, 'TESOURO')
      : undefined;
    const desiredFinalAmount = coalesceString(input.desired_final_amount, input.desiredFinalAmount)
      ? normalizeAmount(coalesceString(input.desired_final_amount, input.desiredFinalAmount), 'desired_final_amount')
      : '';
    const desiredFinalAssetCode = desiredFinalAmount
      ? normalizeAssetCode(coalesceString(input.desired_final_asset, input.desiredFinalAsset, finalAsset?.code))
      : '';
    const rawAmount = coalesceString(input.amount, input.from_amount);
    let amount = rawAmount
      ? normalizeAmount(rawAmount)
      : desiredFinalAmount
        ? desiredFinalAmount
        : normalizeAmount(rawAmount);
    const exactFinalFundingPlan = direction === 'onramp'
      ? await this.resolveOnRampSourceAmountForExactFinalAsset({
          publicKey: context.publicKey,
          finalAsset,
          desiredFinalAmount,
          desiredFinalAssetCode,
          sourceAmountBrl: amount,
        })
      : null;
    if (exactFinalFundingPlan?.sourceAmountBrl) {
      amount = exactFinalFundingPlan.sourceAmountBrl;
    }
    const fromCurrency = coalesceString(input.from_currency, input.fromCurrency) ||
      (direction === 'offramp' ? this.getTesouroIdentifier() : 'BRL');
    const toCurrency = coalesceString(input.to_currency, input.toCurrency) ||
      (direction === 'offramp' ? 'BRL' : this.getTesouroIdentifier());
    const anchorToCurrency = direction === 'onramp' ? this.getTesouroIdentifier() : toCurrency;

    const providerQuote = await this.getEtherfuseClient().getQuote({
      customerId,
      stellarAddress: context.publicKey,
      fromCurrency,
      toCurrency: anchorToCurrency,
      fromAmount: amount,
    });
    const quote = direction === 'onramp'
      ? this.decorateOnRampQuoteForFinalAsset({
          quote: providerQuote,
          sourceAmountBrl: amount,
          finalAsset,
          desiredFinalAmount,
          desiredFinalAssetCode,
          desiredFinalConversionSourceAmount: exactFinalFundingPlan?.finalConversionSourceAmount,
        })
      : providerQuote;

    return {
      quote,
      direction,
      from_currency: fromCurrency,
      to_currency: anchorToCurrency,
      customer_id: customerId,
      ...(preparedCustomer ? { customer: preparedCustomer } : {}),
      ...(preparedCustomer?.bankAccountId ? { bank_account_id: preparedCustomer.bankAccountId } : {}),
      ...(preparedKycUrl ? { kyc_url: preparedKycUrl } : {}),
      ...(preparedProgrammatic ? { programmatic_onboarding: preparedProgrammatic } : {}),
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

    const secret = await new VaultService(supabase).getSecret(context.vaultSecretId);
    const result = await TrustlineService.ensureTrustline(context.publicKey, secret, context.userId, {
      code,
      issuer,
    });

    if (!result.success) {
      return {
        success: false,
        existing: false,
        asset_code: code,
        asset_issuer: issuer,
        error: result.error,
      };
    }

    if (!result.existing) {
      for (let attempt = 0; attempt < 5; attempt += 1) {
        await sleep(700);
        const refreshedBalances = await StellarService.getAccountBalance(context.publicKey);
        const refreshed = refreshedBalances.some((balance) => (
          balance?.asset_type !== 'native' &&
          String(balance?.asset_code || '').toUpperCase() === code &&
          String(balance?.asset_issuer || '') === issuer
        ));
        if (refreshed) break;
      }
    }

    return {
      success: true,
      existing: result.existing,
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
    customer?: Customer;
    customer_id?: string;
    quote?: Quote;
    quote_refreshed?: boolean;
  }> {
    const context = await this.resolveSessionWallet(input);
    let customerId = coalesceString(input.customer_id, input.customerId);
    let preparedCustomer: Customer | undefined;
    let quoteId = coalesceString(input.quote_id, input.quoteId);
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
    const postConversionAsset = coalesceString(
      input.post_conversion_asset,
      input.postConversionAsset,
      input.post_conversion_asset_code,
      input.postConversionAssetCode,
    )
      ? resolveRampFinalAsset(
          input.post_conversion_asset,
          input.postConversionAsset,
          input.post_conversion_asset_code,
          input.postConversionAssetCode,
        )
      : undefined;
    const anchorToCurrency = this.getTesouroIdentifier();
    const targetAsset = parseIssuedAssetIdentifier(anchorToCurrency);
    const intentId = normalizeRampIntentId(input);
    const desiredFinalAmount = coalesceString(input.desired_final_amount, input.desiredFinalAmount)
      ? normalizeAmount(coalesceString(input.desired_final_amount, input.desiredFinalAmount), 'desired_final_amount')
      : '';
    const desiredFinalAssetCode = desiredFinalAmount
      ? normalizeAssetCode(coalesceString(input.desired_final_asset, input.desiredFinalAsset, finalAsset.code))
      : '';
    const rawAmount = coalesceString(input.amount);
    let amount = rawAmount
      ? normalizeAmount(rawAmount)
      : desiredFinalAmount
        ? desiredFinalAmount
        : normalizeAmount(rawAmount);
    const exactFinalFundingPlan = await this.resolveOnRampSourceAmountForExactFinalAsset({
      publicKey: context.publicKey,
      finalAsset,
      desiredFinalAmount,
      desiredFinalAssetCode,
      sourceAmountBrl: amount,
    });
    if (exactFinalFundingPlan?.sourceAmountBrl) {
      amount = exactFinalFundingPlan.sourceAmountBrl;
    }
    const autoPayAfterRamp = Boolean(input.auto_pay_after_ramp || input.autoPayAfterRamp);
    const autoPayRecipient = coalesceString(input.auto_pay_recipient, input.autoPayRecipient);
    const autoPayRecipientKey = coalesceString(input.auto_pay_recipient_key, input.autoPayRecipientKey);
    const autoPayRecipientPublicKey = coalesceString(input.auto_pay_recipient_public_key, input.autoPayRecipientPublicKey);
    const autoPayAmount = coalesceString(input.auto_pay_amount, input.autoPayAmount);
    const autoPayAssetCode = normalizeAssetCode(coalesceString(input.auto_pay_asset_code, input.autoPayAssetCode, finalAsset.code));
    const autoPayDestinationAssetCode = normalizeAssetCode(coalesceString(
      input.auto_pay_destination_asset_code,
      input.autoPayDestinationAssetCode,
      autoPayAssetCode,
    ));
    const autoPayDedupeKey = coalesceString(input.auto_pay_dedupe_key, input.autoPayDedupeKey);
    const externalProvider = externalChannelProvider(input);
    const externalProviderUserId = externalChannelProviderUserId(input);
    const language = rampInputLanguage(input);

    const existingIntent = await this.findActiveRampOperationByIntent({
      userId: context.userId,
      type: 'PIX_ONRAMP',
      intentId,
    });
    if (existingIntent) {
      throw apiError('Esta operação PIX já foi criada. Use o link aberto ou gere uma nova solicitação no chat.', 409);
    }

    if (!customerId) {
      const customerResult = await this.createCustomerForSession({
        session_id: context.sessionId,
        session_token: context.sessionToken,
        email: context.email,
        country: 'BR',
      });
      customerId = customerResult.customer.id;
      preparedCustomer = customerResult.customer;
    }
    if (!customerId) {
      throw apiError('Não consegui preparar a conta PIX para criar a ordem. Entre novamente e tente gerar o PIX outra vez.', 409);
    }

    const trustline = await this.ensureIssuedAssetTrustline(context, {
      code: targetAsset.code || 'TESOURO',
      issuer: targetAsset.issuer || getAssetIssuer(targetAsset.code || 'TESOURO'),
    });
    if (trustline && !trustline.success) {
      throw apiError(trustline.error || `Could not create ${targetAsset.code || 'asset'} trustline before on-ramp.`, 409);
    }
    let finalTrustline: TrustlineResult | undefined;
    if (!sameIssuedAsset(finalAsset, targetAsset)) {
      finalTrustline = await this.ensureIssuedAssetTrustline(context, finalAsset);
      if (!finalTrustline.success) {
        throw apiError(finalTrustline.error || `Could not create ${finalAsset.code} trustline before final PIX settlement.`, 409);
      }
    }
    if (postConversionAsset && !sameIssuedAsset(postConversionAsset, finalAsset)) {
      const postConversionTrustline = await this.ensureIssuedAssetTrustline(context, postConversionAsset);
      if (!postConversionTrustline.success) {
        throw apiError(postConversionTrustline.error || `Could not create ${postConversionAsset.code} trustline before post-PIX conversion.`, 409);
      }
    }

    const anchor = this.getEtherfuseClient();
    const organizationBankAccountId = await this.getActiveEtherfuseOrganizationBankAccountId();
    let usingOrganizationBankAccount = Boolean(organizationBankAccountId);
    const usingRegionalSandboxFallback = !usingOrganizationBankAccount && this.sandboxPixFallbackEnabled();
    if (
      usingRegionalSandboxFallback &&
      !coalesceString(process.env.TESOURO_DISTRIBUTOR_SECRET) &&
      !this.sandboxLedgerSettlementEnabled()
    ) {
      throw apiError(
        'PIX de entrada ainda não está configurado para creditar saldo real neste ambiente. Tente novamente em alguns segundos.',
        409,
        'tesouro_settlement_not_configured',
      );
    }
    let bankAccountId = organizationBankAccountId ||
      coalesceString(input.bank_account_id, input.bankAccountId, preparedCustomer?.bankAccountId) ||
      (usingRegionalSandboxFallback ? crypto.randomUUID() : undefined) ||
      undefined;
    let cryptoWalletId: string | undefined;
    let kycUrl: string | undefined;

    if (!bankAccountId && !usingRegionalSandboxFallback) {
      try {
        const accounts = await anchor.getFiatAccounts(customerId);
        const pixAccount = accounts.find((account) => String(account.type || '').toUpperCase() === 'PIX') || accounts[0];
        bankAccountId = pixAccount?.id || undefined;
      } catch (error) {
        console.warn('[ramp] Could not reuse existing PIX account before on-ramp:', debugErrorMessage(error));
      }
    }

    const preparedProxy = usingOrganizationBankAccount && bankAccountId
      ? { bankAccountId, kycUrl: undefined }
      : usingRegionalSandboxFallback && bankAccountId
        ? { bankAccountId, kycUrl: undefined }
      : await this.prepareEtherfusePixProxy({
          customerId,
          publicKey: context.publicKey,
          bankAccountId,
          email: context.email,
        });
    bankAccountId = preparedProxy.bankAccountId;
    kycUrl = preparedProxy.kycUrl;

    const programmatic = usingRegionalSandboxFallback
      ? {
          bankAccountId,
          cryptoWalletId: undefined,
          steps: {
            bank_account: {
              status: 'skipped',
              source: 'regional_sandbox_fallback',
              reason: 'no_active_brl_pix_organization_account',
            },
          },
        }
      : await this.runSandboxProgrammaticOnboarding({
          customerId,
          publicKey: context.publicKey,
          bankAccountId,
          email: context.email,
          kycUrl,
          skipBankAccount: usingOrganizationBankAccount,
        });
    bankAccountId = programmatic.bankAccountId;
    cryptoWalletId = programmatic.cryptoWalletId;

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
      desiredFinalAmount: desiredFinalAmount || undefined,
      desiredFinalAssetCode: desiredFinalAssetCode || undefined,
      postConversionAsset,
      quote: orderQuote,
      upstreamError: debugErrorMessage(error),
    });

    let transaction: OnRampTransaction | undefined;
    if (usingRegionalSandboxFallback) {
      transaction = createSandboxFallback({
        reason: 'no_active_brl_pix_organization_account',
      });
    }

    if (
      !transaction &&
      !usingOrganizationBankAccount &&
      this.getRuntimeInfo().sandbox &&
      !onboardingBankAccountReady(programmatic.steps.bank_account)
    ) {
      if (this.sandboxPixFallbackEnabled()) {
        transaction = createSandboxFallback(programmatic.steps.bank_account);
      } else {
        throw this.missingProxySetupError(
          'A conta PIX ainda não está pronta para gerar esta ordem. Tente novamente em alguns segundos.',
          kycUrl,
          bankAccountId,
          programmatic.steps,
          customerId,
        );
      }
    }

    if (!transaction) {
      try {
        transaction = await createOrderWithQuoteRetry();
      } catch (error) {
        if (this.sandboxPixFallbackEnabled() && this.isExpiredEtherfuseQuoteError(error)) {
          transaction = createSandboxFallback(error);
        } else if (!this.isMissingEtherfuseProxyError(error)) {
          throw error;
        } else if (usingOrganizationBankAccount) {
          if (this.sandboxPixFallbackEnabled()) {
            transaction = createSandboxFallback(error);
          } else {
            throw this.missingProxySetupError(
              'A conta PIX ainda não está pronta para gerar esta ordem. Tente novamente em alguns segundos.',
              kycUrl,
              bankAccountId,
              programmatic.steps,
              customerId,
            );
          }
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
          usingOrganizationBankAccount = false;

          if (
            this.getRuntimeInfo().sandbox &&
            !onboardingBankAccountReady(retryProgrammatic.steps.bank_account)
          ) {
            if (this.sandboxPixFallbackEnabled()) {
              transaction = createSandboxFallback(retryProgrammatic.steps.bank_account);
            } else {
              throw this.missingProxySetupError(
                'A conta PIX ainda não está pronta para gerar esta ordem. Tente novamente em alguns segundos.',
                kycUrl,
                bankAccountId,
                retryProgrammatic.steps,
                customerId,
              );
            }
          }

          if (!transaction) {
            try {
              transaction = await createOrderWithQuoteRetry();
            } catch (retryError) {
              let lastRetryError = retryError;
              if (this.isMissingEtherfuseProxyError(retryError)) {
                for (const delayMs of [1200, 2500, 4000, 6500, 9000]) {
                  await sleep(delayMs);
                  try {
                    await refreshQuoteForOrder(`retry_after_pix_account_propagation_${delayMs}`);
                    transaction = await createOrderWithQuoteRetry();
                    lastRetryError = undefined;
                    break;
                  } catch (propagationError) {
                    lastRetryError = propagationError;
                    const canContinueWaiting = this.isMissingEtherfuseProxyError(propagationError) ||
                      this.isExpiredEtherfuseQuoteError(propagationError);
                    if (!canContinueWaiting) throw propagationError;
                  }
                }
              }

              if (!transaction) {
                const retryCanUseSandbox = this.isMissingEtherfuseProxyError(lastRetryError) ||
                  this.isExpiredEtherfuseQuoteError(lastRetryError);
                if (this.sandboxPixFallbackEnabled() && retryCanUseSandbox) {
                  transaction = createSandboxFallback(lastRetryError);
                } else if (this.isMissingEtherfuseProxyError(lastRetryError)) {
                  throw this.missingProxySetupError(
                    'Ainda estou preparando seu PIX. Aguarde alguns segundos e tente gerar o PIX novamente.',
                    kycUrl,
                    bankAccountId,
                    retryProgrammatic.steps,
                    customerId,
                  );
                } else {
                  throw lastRetryError;
                }
              }
            }
          }
        }
      }
    }

    if (!transaction) {
      throw apiError('Não consegui gerar o PIX nesta tentativa. Gere uma nova estimativa e tente novamente.', 409);
    }

    const finalIsTesouro = sameIssuedAsset(finalAsset, targetAsset);
    const desiredMatchesFinalAsset = Boolean(
      desiredFinalAmount &&
      (
        desiredFinalAssetCode === normalizeAssetCode(finalAsset.code) ||
        (finalIsTesouro && desiredFinalAssetCode === 'BRL')
      )
    );
    const brlFeeBridge = this.estimateOnRampBrlFeeBridge(
      amount,
      orderQuote as Record<string, unknown> | undefined,
      finalIsTesouro && desiredMatchesFinalAsset
        ? desiredFinalAmount
        : desiredMatchesFinalAsset
          ? exactFinalFundingPlan?.finalConversionSourceAmount
          : undefined,
    );
    const operationFinalAmount = desiredMatchesFinalAsset
      ? desiredFinalAmount
      : finalIsTesouro
        ? brlFeeBridge.netAmount
        : undefined;
    const destinationAmountAnchor = finalIsTesouro
      ? operationFinalAmount
      : brlFeeBridge.netAmount;

    if (finalIsTesouro && operationFinalAmount) {
      const userFacingTransaction = transaction as OnRampTransaction & Record<string, unknown>;
      userFacingTransaction.toAmount = operationFinalAmount;
      userFacingTransaction.finalAmount = operationFinalAmount;
      userFacingTransaction.destinationAmount = operationFinalAmount;
      userFacingTransaction.userFacingToAmount = operationFinalAmount;
      userFacingTransaction.userFacingToCurrency = 'BRL';
      userFacingTransaction.finalAssetCode = 'TESOURO';
      userFacingTransaction.finalAssetIssuer = targetAsset.issuer;
      userFacingTransaction.finalSettlementMode = 'stellar_asset';
    }

    const operationContext = {
      provider: 'etherfuse',
      rail: 'pix',
      direction: 'onramp',
      session_id: context.sessionId,
      user_id: context.userId,
      public_key: context.publicKey,
      language: language || undefined,
      external_provider: externalProvider || undefined,
      external_provider_user_id: externalProviderUserId || undefined,
      external_source: coalesceString(input.source) || undefined,
      intent_id: intentId || undefined,
      customer_id: customerId,
      quote_id: quoteId,
      quote_refresh_reason: quoteRefreshReason,
      anchor_order_id: transaction.id,
      target_asset: assetIdentifier(finalAsset),
      anchor_asset: anchorToCurrency,
      crypto_wallet_id: cryptoWalletId,
      source_amount_brl: amount,
      destination_amount_anchor: destinationAmountAnchor,
      final_amount: operationFinalAmount,
      final_asset_code: finalAsset.code,
      final_asset_issuer: finalAsset.issuer,
      final_asset_kind: 'stellar-asset',
      final_settlement_mode: 'stellar_asset',
      provider_onramp_fee_amount: brlFeeBridge.providerFeeAmount,
      talktostellar_transaction_fee_amount: brlFeeBridge.talkToStellarFeeAmount,
      total_fee_amount: brlFeeBridge.totalFeeAmount,
      fee_currency: 'BRL',
      desired_final_amount: desiredFinalAmount || undefined,
      desired_final_asset_code: desiredFinalAssetCode || undefined,
      desired_final_conversion_source_amount: exactFinalFundingPlan?.finalConversionSourceAmount || undefined,
      post_conversion_asset_code: postConversionAsset && !sameIssuedAsset(postConversionAsset, finalAsset) ? postConversionAsset.code : undefined,
      post_conversion_asset_issuer: postConversionAsset && !sameIssuedAsset(postConversionAsset, finalAsset) ? postConversionAsset.issuer : undefined,
      auto_pay_after_ramp: autoPayAfterRamp || undefined,
      auto_pay_recipient: autoPayRecipient || undefined,
      auto_pay_recipient_key: autoPayAfterRamp ? autoPayRecipientKey || undefined : undefined,
      auto_pay_recipient_public_key: autoPayAfterRamp ? autoPayRecipientPublicKey || undefined : undefined,
      auto_pay_amount: autoPayAmount || undefined,
      auto_pay_asset_code: autoPayAfterRamp ? autoPayAssetCode : undefined,
      auto_pay_destination_asset_code: autoPayAfterRamp ? autoPayDestinationAssetCode : undefined,
      auto_pay_dedupe_key: autoPayAfterRamp ? autoPayDedupeKey || undefined : undefined,
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

    const decoratedOrderQuote = orderQuote
      ? this.decorateOnRampQuoteForFinalAsset({
          quote: orderQuote,
          sourceAmountBrl: amount,
          finalAsset,
          desiredFinalAmount,
          desiredFinalAssetCode,
          desiredFinalConversionSourceAmount: exactFinalFundingPlan?.finalConversionSourceAmount,
        })
      : undefined;

    return {
      transaction,
      operation_id: operationId,
      trustline,
      final_trustline: finalTrustline,
      customer_id: customerId,
      ...(preparedCustomer ? { customer: preparedCustomer } : {}),
      quote: decoratedOrderQuote,
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
      const postConverted = await this.maybeApplyPostOnRampConversionForOperation({
        transaction,
        operation: operation as unknown as Record<string, unknown>,
        operationId,
        context,
        currentAsset: finalAsset,
        currentAmount: coalesceString(context.destination_amount_anchor, transaction.toAmount),
      });
      if (postConverted) return postConverted;

      const receiptUrl = await this.sendCompletedOnRampReceiptForOperation({
        transaction,
        operation: operation as unknown as Record<string, unknown>,
        context,
        finalAsset,
        destinationAmount: coalesceString(context.destination_amount_anchor, transaction.toAmount),
      });
      return receiptUrl
        ? ({ ...transaction, receiptUrl, receipt_url: receiptUrl } as OnRampTransaction & { receiptUrl?: string; receipt_url?: string })
        : transaction;
    }

    const existingHash = coalesceString(context.final_conversion_hash);
    if (existingHash) {
      const existingFinalAmount = coalesceString(context.final_amount);
      const baseConvertedTransaction = {
        ...transaction,
        ...(existingFinalAmount ? {
          toAmount: existingFinalAmount,
          toCurrency: assetIdentifier(finalAsset),
          finalAmount: existingFinalAmount,
        } : {}),
        finalAsset,
        auto_conversion: {
          required: true,
          status: 'completed',
          source_asset_code: 'TESOURO',
          source_amount: coalesceString(context.destination_amount_anchor, transaction.toAmount),
          destination_asset_code: finalAsset.code,
          destination_asset_issuer: finalAsset.issuer,
          destination_amount: existingFinalAmount || undefined,
          hash: existingHash,
        },
      } as OnRampTransaction;
      const postConverted = await this.maybeApplyPostOnRampConversionForOperation({
        transaction: baseConvertedTransaction,
        operation: operation as unknown as Record<string, unknown>,
        operationId,
        context,
        currentAsset: finalAsset,
        currentAmount: existingFinalAmount,
        currentHash: existingHash,
      });
      if (postConverted) return postConverted;

      const receiptUrl = await this.sendCompletedOnRampReceiptForOperation({
        transaction: baseConvertedTransaction,
        operation: operation as unknown as Record<string, unknown>,
        context,
        finalAsset,
        destinationAmount: existingFinalAmount,
        hash: existingHash,
      });
      return {
        ...baseConvertedTransaction,
        ...(receiptUrl ? { receiptUrl, receipt_url: receiptUrl } : {}),
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
      const desiredFinalAmount = coalesceString(context.desired_final_amount);
      const desiredFinalAssetCode = normalizeAssetCode(coalesceString(context.desired_final_asset_code, context.desired_final_asset, finalAsset.code));
      const exactFinalBrl = finalAsset.code === 'BRL'
        ? (desiredFinalAmount && desiredFinalAssetCode === 'BRL'
            ? desiredFinalAmount
            : coalesceString(context.final_amount, context.source_amount_brl, transaction.fromAmount))
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
      const baseConvertedTransaction = {
        ...transaction,
        ...(finalAmount ? {
          toAmount: finalAmount,
          toCurrency: assetIdentifier(finalAsset),
          finalAmount,
        } : {}),
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
      const postConverted = await this.maybeApplyPostOnRampConversionForOperation({
        transaction: baseConvertedTransaction,
        operation: operation as unknown as Record<string, unknown>,
        operationId,
        context: updatedContext,
        currentAsset: finalAsset,
        currentAmount: finalAmount,
        currentHash: result.hash,
      });
      if (postConverted) return postConverted;

      const receiptUrl = await this.sendCompletedOnRampReceiptForOperation({
        transaction: baseConvertedTransaction,
        operation: operation as unknown as Record<string, unknown>,
        context: updatedContext,
        finalAsset,
        destinationAmount: finalAmount,
        hash: result.hash,
      });

      return {
        ...baseConvertedTransaction,
        ...(receiptUrl ? { receiptUrl, receipt_url: receiptUrl } : {}),
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

  private static async maybeApplyPostOnRampConversionForOperation(input: {
    transaction: OnRampTransaction;
    operation: Record<string, unknown>;
    operationId: string;
    context: Record<string, unknown>;
    currentAsset: { code: string; issuer?: string };
    currentAmount: string;
    currentHash?: string;
  }): Promise<OnRampTransaction | null> {
    const postAssetCode = coalesceString(input.context.post_conversion_asset_code, input.context.post_conversion_asset);
    if (!postAssetCode) return null;

    const postAsset = resolveRampFinalAsset(postAssetCode, input.context.post_conversion_asset_issuer);
    if (sameIssuedAsset(postAsset, input.currentAsset)) return null;

    const existingHash = coalesceString(input.context.post_conversion_hash);
    if (existingHash) {
      const existingAmount = coalesceString(input.context.post_conversion_amount, input.context.final_amount);
      const sourceAmount = coalesceString(input.context.post_conversion_source_amount, input.currentAmount);
      const receiptUrl = await this.sendCompletedPostOnRampConversionReceiptForOperation({
        operation: input.operation,
        context: input.context,
        sourceAsset: input.currentAsset,
        sourceAmount,
        destinationAsset: postAsset,
        destinationAmount: existingAmount,
        hash: existingHash,
      });
      return {
        ...input.transaction,
        ...(existingAmount ? {
          toAmount: existingAmount,
          toCurrency: assetIdentifier(postAsset),
          finalAmount: existingAmount,
        } : {}),
        ...(receiptUrl ? { receiptUrl, receipt_url: receiptUrl } : {}),
        finalAsset: postAsset,
        post_conversion: {
          required: true,
          status: 'completed',
          source_asset_code: input.currentAsset.code,
          source_asset_issuer: input.currentAsset.issuer,
          source_amount: sourceAmount,
          destination_asset_code: postAsset.code,
          destination_asset_issuer: postAsset.issuer,
          destination_amount: existingAmount || undefined,
          hash: existingHash,
        },
      } as OnRampTransaction;
    }

    try {
      const sessionId = coalesceString(input.operation.source_session_id, input.context.session_id);
      const wallet = sessionId ? await new WalletRepository(supabase).getWalletBySession(sessionId) : null;
      const publicKey = coalesceString(input.operation.source_public_key, wallet?.public_key, input.transaction.stellarAddress);
      const vaultSecretId = coalesceString(wallet?.vault_secret_id);
      const userId = coalesceString(input.operation.user_id, input.context.user_id, sessionId);
      const sourceAmount = toStellarAmount(input.currentAmount);
      if (!publicKey || !vaultSecretId || !sourceAmount || Number(sourceAmount) <= 0) {
        throw new Error('Wallet private key or source amount is not available for post-PIX conversion.');
      }

      const postTrustline = await this.ensureIssuedAssetTrustline({
        sessionId,
        sessionToken: '',
        userId,
        publicKey,
        vaultSecretId,
      }, postAsset);
      if (!postTrustline.success) {
        throw new Error(postTrustline.error || `Could not create ${postAsset.code} trustline for post-PIX conversion.`);
      }

      const secret = await new VaultService(supabase).getSecret(vaultSecretId);
      const xdr = await StellarService.buildStrictSendConversionXdr({
        sourcePublicKey: publicKey,
        destination: publicKey,
        sourceAmount,
        sourceAsset: input.currentAsset,
        destAsset: postAsset,
        memoText: 'PIX POST CONVERT',
      });
      const result = await StellarService.signAndSubmitXdr(userId, secret, xdr, {
        user_id: userId,
        type: 'PATH_PAYMENT_STRICT_SEND' as any,
        destination_key: publicKey,
        asset_code: postAsset.code,
        amount: Number(sourceAmount),
        context: JSON.stringify({
          provider: 'etherfuse',
          rail: 'pix',
          direction: 'onramp_post_conversion',
          anchor_order_id: input.transaction.id,
          source_asset_code: input.currentAsset.code,
          source_asset_issuer: input.currentAsset.issuer,
          source_amount: sourceAmount,
          destination_asset_code: postAsset.code,
          destination_asset_issuer: postAsset.issuer,
        }),
        source_public_key: publicKey,
        source_session_id: sessionId,
        destination_session_id: sessionId,
      } as any);
      if (!result.success) {
        throw new Error(result.error || 'Could not submit post-PIX conversion.');
      }

      const details = result.hash ? await StellarService.getSubmittedPaymentDetails(result.hash) : null;
      const postAmount = toStellarAmount(details?.destinationAmount || '0');
      const updatedContext = {
        ...input.context,
        post_conversion_status: 'completed',
        post_conversion_hash: result.hash,
        post_conversion_source_asset_code: input.currentAsset.code,
        post_conversion_source_asset_issuer: input.currentAsset.issuer,
        post_conversion_source_amount: sourceAmount,
        post_conversion_asset_code: postAsset.code,
        post_conversion_asset_issuer: postAsset.issuer,
        post_conversion_amount: postAmount,
        target_asset: assetIdentifier(postAsset),
        final_asset: assetIdentifier(postAsset),
        final_asset_code: postAsset.code,
        final_asset_issuer: postAsset.issuer,
        final_amount: postAmount,
      };
      await OperationRepository.update(input.operationId, { context: JSON.stringify(updatedContext) } as any);
      const receiptUrl = await this.sendCompletedPostOnRampConversionReceiptForOperation({
        operation: input.operation,
        context: updatedContext,
        sourceAsset: input.currentAsset,
        sourceAmount,
        destinationAsset: postAsset,
        destinationAmount: postAmount,
        hash: result.hash,
      });

      return {
        ...input.transaction,
        ...(postAmount ? {
          toAmount: postAmount,
          toCurrency: assetIdentifier(postAsset),
          finalAmount: postAmount,
        } : {}),
        ...(receiptUrl ? { receiptUrl, receipt_url: receiptUrl } : {}),
        finalAsset: postAsset,
        post_conversion: {
          required: true,
          status: 'completed',
          source_asset_code: input.currentAsset.code,
          source_asset_issuer: input.currentAsset.issuer,
          source_amount: sourceAmount,
          destination_asset_code: postAsset.code,
          destination_asset_issuer: postAsset.issuer,
          destination_amount: postAmount || undefined,
          hash: result.hash,
        },
      } as OnRampTransaction;
    } catch (error) {
      const message = debugErrorMessage(error);
      const updatedContext = {
        ...input.context,
        post_conversion_status: 'failed',
        post_conversion_error: message,
      };
      await OperationRepository.update(input.operationId, { context: JSON.stringify(updatedContext) } as any).catch(() => undefined);
      return {
        ...input.transaction,
        post_conversion: {
          required: true,
          status: 'failed',
          source_asset_code: input.currentAsset.code,
          source_asset_issuer: input.currentAsset.issuer,
          source_amount: input.currentAmount,
          destination_asset_code: postAsset.code,
          destination_asset_issuer: postAsset.issuer,
          error: message,
        },
      } as OnRampTransaction;
    }
  }

  static async getOnRampStatus(input: RampOrderStatusInput): Promise<{
    transaction: OnRampTransaction;
  }> {
    const orderId = coalesceString(input.order_id, input.orderId);
    const operationId = coalesceString(input.operation_id, input.operationId);
    if (!orderId) throw apiError('order_id is required.', 400);
    const trustedInternal = input.trusted_internal === true;
    const context = trustedInternal ? null : await this.resolveSessionWallet(input);
    const mockRecord = await this.hydrateSandboxOnRampFromOperation(orderId, operationId);
    if (mockRecord) {
      if (context) this.assertSandboxOnRampOwner(mockRecord, context);
      const finalMockRecord = await this.finishSandboxPostOnRampConversionIfPending(mockRecord);
      await this.updateRampOperationStatus(
        operationId || finalMockRecord.operationId,
        mapAnchorStatusToOperationStatus(finalMockRecord.transaction.status),
      );
      return { transaction: finalMockRecord.transaction };
    }

    if (orderId.startsWith('sandbox-pix-')) {
      throw apiError('Sandbox on-ramp order not found. Generate a new PIX checkout or pass the operation_id returned when the checkout was created.', 404);
    }

    if (context) await this.requireRampOperationOwner(operationId, context, orderId, 'onramp');
    const transaction = await this.getEtherfuseClient().getOnRampTransaction(orderId);
    if (!transaction) throw apiError('On-ramp order not found.', 404);

    if (['failed', 'expired', 'cancelled', 'canceled', 'refunded'].includes(String(transaction.status || '').toLowerCase())) {
      const fallback = await this.completeProviderOnRampWithSandboxLedgerFallback({
        transaction,
        operationId,
        reason: `Provider sandbox on-ramp returned ${transaction.status || 'failed'}.`,
      });
      if (fallback) return { transaction: fallback.transaction };
    }

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
    const requestedAmount = normalizeAmount(input.amount);
    const sourceAsset = normalizeRampUserAsset(input.source_asset_code, input.sourceAssetCode, 'BRL');
    const sourceAmount = coalesceString(input.source_amount, input.sourceAmount);
    const amount = sourceAmount ? normalizeAmount(sourceAmount, 'source_amount') : requestedAmount;
    const targetBrl = coalesceString(input.target_brl, input.targetBrl);
    const intentId = normalizeRampIntentId(input);
    const language = rampInputLanguage(input);
    const rawExternalBankAccount = input.external_bank_account || input.externalBankAccount;
    const pixDestination = pixDestinationFromRampInput(input as Record<string, unknown>, rawExternalBankAccount);
    const externalBankAccount = pixDestination.externalBankAccount;
    const providerFiatAccountId = providerFiatAccountIdFromExternalBankAccount(externalBankAccount);
    const dynamicPixKey = pixDestination.pixKey;
    const dynamicPixKeyType = pixDestination.pixKeyType;
    const userFacingExternalBankAccountId = externalBankAccount && typeof externalBankAccount === 'object'
      ? coalesceString((externalBankAccount as Record<string, unknown>).id)
      : '';
    let fiatAccountId = coalesceString(
      providerFiatAccountId,
      input.fiat_account_id,
      input.fiatAccountId,
      input.bank_account_id,
      input.bankAccountId,
    );
    if (
      fiatAccountId &&
      (
        !isUuidLike(fiatAccountId) ||
        (userFacingExternalBankAccountId && fiatAccountId === userFacingExternalBankAccountId && !providerFiatAccountId)
      )
    ) {
      console.warn(`[ramp] Ignoring user-facing PIX destination id for Etherfuse off-ramp order: ${fiatAccountId}`);
      fiatAccountId = '';
    }

    if (!customerId) throw apiError('Conta PIX não encontrada para esta tentativa. Gere uma nova estimativa e tente novamente.', 400);
    if (!quoteId) throw apiError('quote_id is required.', 400);
    const existingIntent = await this.findActiveRampOperationByIntent({
      userId: context.userId,
      type: 'PIX_OFFRAMP',
      intentId,
    });
    if (existingIntent) {
      throw apiError('Esta retirada via PIX já foi criada. Use o link aberto ou gere uma nova solicitação no chat.', 409);
    }

    if (!fiatAccountId && dynamicPixKey && this.getRuntimeInfo().sandbox) {
      try {
        const createdPixAccount = await this.getEtherfuseClient().createBankAccountForCustomer(
          customerId,
          this.buildSandboxPixAccount(crypto.randomUUID(), context.email, dynamicPixKey, dynamicPixKeyType),
        );
        fiatAccountId = coalesceString(createdPixAccount.bankAccountId, (createdPixAccount as any).id);
      } catch (error) {
        console.warn(`[ramp] Could not register dynamic PIX destination with Etherfuse sandbox: ${debugErrorMessage(error)}`);
      }
    }

    if (!fiatAccountId && dynamicPixKey && !this.getRuntimeInfo().sandbox) {
      throw apiError('Não consegui validar essa chave PIX para retirada agora. Tente novamente ou use uma chave PIX já cadastrada.', 409);
    }

    if (!fiatAccountId && !dynamicPixKey) {
      const accounts = await this.getEtherfuseClient().getFiatAccounts(customerId);
      const providerAccount = accounts.find((account) => isUuidLike(account.id));
      fiatAccountId = providerAccount?.id || '';
    }
    let transaction: OffRampTransaction;
    const forceSandboxMock = this.getRuntimeInfo().sandbox && Boolean(
      input.force_sandbox_mock ||
      input.forceSandboxMock ||
      dynamicPixKey ||
      !isBrlSettlementAsset(sourceAsset)
    );
    if (!fiatAccountId || forceSandboxMock) {
      if (!this.sandboxPixFallbackEnabled()) {
        throw apiError('Nenhuma conta PIX de retirada foi encontrada. Configure a chave PIX da conta e tente novamente.', 409);
      }
      fiatAccountId = fiatAccountId || crypto.randomUUID();
      transaction = this.createSandboxOffRampFallback({
        context,
        customerId,
        quoteId,
        amount,
        sourceAmount,
        sourceAssetCode: sourceAsset.code,
        sourceAssetIssuer: sourceAsset.issuer,
        targetBrl,
        destinationBrl: targetBrl,
        fiatAccountId,
        externalBankAccount,
        upstreamError: forceSandboxMock
          ? 'Controlled test route forced local withdrawal settlement.'
          : 'No PIX fiat account is available in the current payment mode; using local settlement.',
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
          sourceAmount,
          sourceAssetCode: sourceAsset.code,
          sourceAssetIssuer: sourceAsset.issuer,
          targetBrl,
          destinationBrl: targetBrl,
          fiatAccountId,
          externalBankAccount,
          upstreamError: debugErrorMessage(error),
        });
      }
    }

    const brlExactFeeBridge = targetBrl && isBrlSettlementAsset(sourceAsset)
      ? this.estimateOnRampBrlFeeBridge(sourceAmount || amount, null, targetBrl)
      : null;
    const crossAssetTalkToStellarFee = !brlExactFeeBridge && PlatformFeeService.isUsdcBrlTransaction(sourceAsset.code, 'BRL')
      ? PlatformFeeService.calculateSpread({
          sourceAmount: sourceAmount || amount,
          sourceAssetCode: sourceAsset.code,
          destinationAssetCode: 'BRL',
          mode: 'deduct_from_source',
        })
      : null;
    const talkToStellarFeeAmount = brlExactFeeBridge?.talkToStellarFeeAmount || crossAssetTalkToStellarFee?.feeAmount || '';
    const talkToStellarFeeAssetCode = brlExactFeeBridge
      ? 'TESOURO'
      : crossAssetTalkToStellarFee?.feeAssetCode || '';
    const talkToStellarFeeAssetIssuer = talkToStellarFeeAssetCode === 'TESOURO'
      ? this.getTesouroIssuer()
      : sourceAsset.issuer;

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
        language: language || undefined,
        intent_id: intentId || undefined,
        customer_id: customerId,
        quote_id: quoteId,
        anchor_order_id: transaction.id,
        fiat_account_id: fiatAccountId,
        source_amount: sourceAmount || amount,
        source_asset_code: sourceAsset.code,
        source_asset_issuer: sourceAsset.issuer,
        talktostellar_transaction_fee_amount: talkToStellarFeeAmount || undefined,
        talktostellar_transaction_fee_asset_code: talkToStellarFeeAssetCode || undefined,
        talktostellar_transaction_fee_asset_issuer: talkToStellarFeeAssetIssuer || undefined,
        target_brl: targetBrl,
        external_bank_account: externalBankAccount || undefined,
        sandbox_mock: Boolean((transaction as OffRampTransaction & { sandbox_mock?: boolean }).sandbox_mock),
        upstream_error: (transaction as OffRampTransaction & { upstream_error?: string }).upstream_error,
      },
    });
    const mockRecord = this.sandboxMockOffRampOrders.get(transaction.id);
    if (mockRecord) mockRecord.operationId = operationId;

    return { transaction, operation_id: operationId };
  }

  static async previewOffRampForSession(input: PreviewOffRampForSessionInput): Promise<{
    success: true;
    preview: true;
    sandbox: boolean;
    customer: Customer;
    quote: Quote;
    amount_tesouro: string;
    source_amount: string;
    source_asset_code: string;
    source_asset_issuer?: string;
    target_brl: string;
    destination_amount: string;
    destination_asset_code: 'BRL';
  }> {
    const context = await this.resolveSessionWallet(input);
    const sourceAsset = normalizeRampUserAsset(
      input.source_asset_code,
      input.sourceAssetCode,
      input.asset_code,
      input.assetCode,
      input.amount_currency,
      input.amountCurrency,
      'BRL',
    );
    const requestedTargetBrl = coalesceString(
      input.fiat_amount,
      input.fiatAmount,
      input.target_brl,
      input.targetBrl,
      input.to_amount,
      input.toAmount,
    );
    const sourcePlan = await this.resolveOffRampSourceForTarget({
      publicKey: context.publicKey,
      sourceAsset,
      requestedSourceAmount: coalesceString(
        input.source_amount,
        input.sourceAmount,
        requestedTargetBrl ? '' : input.amount,
      ),
      requestedTargetBrl,
    });
    const requestedSourceAmount = sourcePlan.sourceAmount;
    const targetBrl = sourcePlan.targetBrl;
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

    let amount = targetBrl
      ? isBrlSettlementAsset(sourceAsset)
        ? requestedSourceAmount
        : toStellarAmount(Number(targetBrl))
      : requestedSourceAmount;
    let quoteResult = await this.getQuoteForSession({
      session_id: context.sessionId,
      session_token: context.sessionToken,
      customer_id: customerResult.customer.id,
      direction: 'offramp',
      amount,
      from_currency: this.getTesouroIdentifier(),
      to_currency: 'BRL',
    });

    const decoratedQuote: Quote & Record<string, unknown> = { ...quoteResult.quote };
    if (targetBrl && isBrlSettlementAsset(sourceAsset)) {
      const brlFeeBridge = this.estimateOnRampBrlFeeBridge(requestedSourceAmount, null, targetBrl);
      decoratedQuote.fromAmount = requestedSourceAmount;
      decoratedQuote.toAmount = targetBrl;
      decoratedQuote.fromCurrency = sourceAsset.identifier || sourceAsset.code;
      decoratedQuote.toCurrency = 'BRL';
      decoratedQuote.destinationAmountAfterFee = targetBrl;
      decoratedQuote.anchorProviderFeeAmount = brlFeeBridge.providerFeeAmount;
      decoratedQuote.anchorProviderFeeCurrency = 'BRL';
      decoratedQuote.talkToStellarFeeAmount = brlFeeBridge.talkToStellarFeeAmount;
      decoratedQuote.talkToStellarFeeCurrency = 'BRL';
      decoratedQuote.totalFeeAmount = brlFeeBridge.totalFeeAmount;
      decoratedQuote.totalFeeCurrency = 'BRL';
    } else if (PlatformFeeService.isUsdcBrlTransaction(sourceAsset.code, 'BRL')) {
      const talkToStellarFee = PlatformFeeService.calculateSpread({
        sourceAmount: requestedSourceAmount,
        sourceAssetCode: sourceAsset.code,
        destinationAssetCode: 'BRL',
        mode: 'deduct_from_source',
      });
      decoratedQuote.talkToStellarFeeAmount = talkToStellarFee.feeAmount;
      decoratedQuote.talkToStellarFeeCurrency = talkToStellarFee.feeAssetCode;
    }

    return {
      success: true,
      preview: true,
      sandbox: this.getRuntimeInfo().sandbox,
      customer: customerResult.customer as Customer,
      quote: decoratedQuote,
      amount_tesouro: amount,
      source_amount: requestedSourceAmount,
      source_asset_code: sourceAsset.code,
      source_asset_issuer: sourceAsset.issuer,
      target_brl: targetBrl,
      destination_amount: targetBrl || quoteResult.quote.toAmount,
      destination_asset_code: 'BRL',
    };
  }

  static async getOffRampStatus(input: RampOrderStatusInput): Promise<{
    transaction: OffRampTransaction;
    ready_to_sign: boolean;
  }> {
    const orderId = coalesceString(input.order_id, input.orderId);
    const operationId = coalesceString(input.operation_id, input.operationId);
    if (!orderId) throw apiError('order_id is required.', 400);
    const trustedInternal = input.trusted_internal === true;
    const context = trustedInternal ? null : await this.resolveSessionWallet(input);
    const mockRecord = this.sandboxMockOffRampOrders.get(orderId);
    if (mockRecord) {
      if (context) this.assertSandboxOffRampOwner(mockRecord, context);
      await this.updateRampOperationStatus(
        operationId || mockRecord.operationId,
        mapAnchorStatusToOperationStatus(mockRecord.transaction.status),
      );
      return {
        transaction: mockRecord.transaction,
        ready_to_sign: Boolean(mockRecord.transaction.signableTransaction),
      };
    }

    if (context) await this.requireRampOperationOwner(operationId, context, orderId, 'offramp');
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
    receipt_url?: string;
  }> {
    const context = await this.resolveSessionWallet(input);
    this.requireWalletPin(input, context);
    const orderId = coalesceString(input.order_id, input.orderId);
    if (!orderId) throw apiError('order_id is required.', 400);
    const mockRecord = this.sandboxMockOffRampOrders.get(orderId);
    let result: { success: boolean; hash?: string; error?: string; order_id: string };
    let transaction: OffRampTransaction | undefined = mockRecord?.transaction;
    if (mockRecord) {
      result = await this.submitSandboxOffRamp({
        context,
        orderId,
        operationId: coalesceString(input.operation_id, input.operationId),
      });
    } else {
      if (!context.vaultSecretId) {
        throw apiError('Wallet private key is not available in Vault; cannot sign off-ramp transaction.', 409);
      }

      transaction = await this.getEtherfuseClient().getOffRampTransaction(orderId) || undefined;
      if (!transaction) {
        throw apiError('Retirada PIX não encontrada. Gere uma nova solicitação e tente novamente.', 404);
      }
      const unsignedXdr = coalesceString(input.unsigned_xdr, input.unsignedXdr, transaction?.signableTransaction);
      if (!unsignedXdr) {
        throw apiError('A retirada PIX ainda não está pronta para confirmar. Aguarde alguns segundos e tente novamente.', 409);
      }

      const secret = await new VaultService(supabase).getSecret(context.vaultSecretId);
      const submitResult = await StellarService.signAndSubmitXdr(context.userId, secret, unsignedXdr, {
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
      result = { ...submitResult, order_id: orderId };

      if (result.success) {
        await this.updateRampOperationStatus(coalesceString(input.operation_id, input.operationId), 'PROCESSING');
      }
    }

    let receiptUrl = '';
    if (result.success && !Boolean(input.skip_receipt || input.skipReceipt)) {
      try {
        const operationId = coalesceString(input.operation_id, input.operationId, mockRecord?.operationId);
        const operation = operationId ? await OperationRepository.findById(operationId).catch(() => null) : null;
        const operationContext = parseOperationContext(operation?.context);
        const externalBank = (input.external_bank_account || input.externalBankAccount || operationContext.external_bank_account || mockRecord?.externalBankAccount || {}) as Record<string, unknown>;
        const bankLabel = coalesceString(
          externalBank.label,
          externalBank.institution,
          'Seu PIX',
        );
        const sourceAmount = coalesceString(
          operationContext.source_amount,
          mockRecord?.sourceAmount,
          transaction?.fromAmount,
        );
        const sourceAssetCode = normalizeAssetCode(coalesceString(
          operationContext.source_asset_code,
          mockRecord?.sourceAssetCode,
          'TESOURO',
        ));
        const sourceAsset = sourceAssetCode === 'TESOURO'
          ? { code: 'TESOURO', issuer: this.getTesouroIssuer() }
          : resolveConfiguredAsset(sourceAssetCode, coalesceString(operationContext.source_asset_issuer, mockRecord?.sourceAssetIssuer));
        const destinationAmount = coalesceString(
          operationContext.target_brl,
          mockRecord?.destinationBrl,
          transaction?.toAmount,
        );
        const fee = receiptBrlFeeFromContext(
          operationContext,
          sourceAmount || transaction?.fromAmount,
          destinationAmount,
        );
        const language = rampContextLanguage(operationContext) || rampInputLanguage(input);

        receiptUrl = await PaymentReceiptService.sendReceipt({
          type: 'payment_sent',
          sessionId: context.sessionId,
          userId: context.userId,
          language,
          provider: externalChannelProvider(input) || undefined,
          providerUserId: externalChannelProviderUserId(input) || undefined,
          counterpartyLabel: bankLabel,
          sourceAmount: sourceAmount || transaction?.fromAmount || '',
          sourceAssetCode: sourceAsset.code,
          destinationAmount: destinationAmount || '',
          destinationAssetCode: 'BRL',
          hash: result.hash || orderId,
          status: 'completed',
          contextMessage: rampText(language, 'PIX enviado à chave.', 'PIX sent to the key.'),
          feeDisplay: fee.feeDisplay || null,
          feeBrl: fee.feeBrl || null,
          quote: operationContext || null,
        });

        if (receiptUrl && operationId) {
          await OperationRepository.update(operationId, {
            context: JSON.stringify({
              ...operationContext,
              receipt_url: receiptUrl,
              submit_hash: result.hash || '',
              destination_amount: destinationAmount || '',
              destination_asset_code: 'BRL',
            }),
          } as any).catch((error) => {
            console.warn('[ramp] Could not persist PIX off-ramp receipt URL:', debugErrorMessage(error));
          });
        }
      } catch (error) {
        console.warn('[ramp] Could not send PIX off-ramp receipt:', debugErrorMessage(error));
      }
    }

    return { ...result, order_id: orderId, ...(receiptUrl ? { receipt_url: receiptUrl } : {}) };
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
    if (!this.getRuntimeInfo().sandbox) {
      throw apiError('PIX confirmation is unavailable in the current payment mode.', 403);
    }

    const context = await this.resolveSessionWallet(input);
    if (input.trusted_internal !== true) {
      this.requireWalletPin(input, context);
    }

    const orderId = coalesceString(input.order_id, input.orderId);
    const operationId = coalesceString(input.operation_id, input.operationId);
    if (!orderId) throw apiError('order_id is required.', 400);

    const mockRecord = await this.deliverSandboxOnRamp(orderId, operationId, context, input.trusted_internal === true);
    if (mockRecord) {
      let autoPayStatus = '';
      let autoPayResult: Record<string, unknown> | null = null;
      if (
        mockRecord.transaction.status === 'completed' &&
        Boolean(mockRecord.operationContext?.auto_pay_after_ramp)
      ) {
        autoPayStatus = 'processing';
        try {
          autoPayResult = await this.submitAutoPayAfterRamp(mockRecord, input, context);
          autoPayStatus = autoPayResult?.success ? 'completed' : 'failed';
        } catch (error) {
          autoPayStatus = 'failed';
          const message = debugErrorMessage(error);
          const code = publicErrorCode(error);
          const statusCode = Number((error as { statusCode?: unknown; status?: unknown } | null)?.statusCode || (error as { status?: unknown } | null)?.status || 0);
          autoPayResult = {
            success: false,
            error: message,
            message,
            code,
            ...(Number.isFinite(statusCode) && statusCode > 0 ? { status_code: statusCode } : {}),
          };
          await this.persistSandboxOnRampContext(mockRecord, {
            auto_pay_status: 'failed',
            auto_pay_error: message,
            auto_pay_error_code: code,
            auto_pay_result: autoPayResult,
            auto_pay_failed_at: new Date().toISOString(),
          }).catch((persistError) => {
            console.warn('[ramp] Could not persist PIX-funded auto-pay failure:', debugErrorMessage(persistError));
          });
          console.warn('[ramp] Could not complete PIX-funded auto-pay after ramp:', message);
        }
      }
      return {
        order_id: orderId,
        upstream_status: mockRecord.transaction.status === 'completed' ? 200 : 500,
        success: mockRecord.transaction.status === 'completed',
        transaction: mockRecord.transaction,
        ...(autoPayStatus ? { auto_pay_status: autoPayStatus } : {}),
        ...(autoPayResult ? { auto_pay_result: autoPayResult } : {}),
        ...(mockRecord.deliveryHash ? { delivery_hash: mockRecord.deliveryHash } : {}),
        ...(mockRecord.deliverySourceAmount ? { delivery_source_amount: mockRecord.deliverySourceAmount } : {}),
        ...(mockRecord.receiptUrl ? { receipt_url: mockRecord.receiptUrl } : {}),
        ...(mockRecord.deliveryError ? { error: mockRecord.deliveryError } : {}),
        sandbox_mock: true,
      } as any;
    }

    const status = await this.getEtherfuseClient().simulateFiatReceived(orderId);
    if (status < 200 || status >= 300) {
      const fallbackTransaction = await this.getEtherfuseClient().getOnRampTransaction(orderId).catch(() => null);
      if (fallbackTransaction) {
        const fallback = await this.completeProviderOnRampWithSandboxLedgerFallback({
          transaction: fallbackTransaction,
          operationId,
          reason: `Provider sandbox fiat simulation returned HTTP ${status}.`,
        });
        if (fallback) {
          return {
            order_id: orderId,
            upstream_status: 200,
            success: true,
            transaction: fallback.transaction,
            ...(fallback.deliveryHash ? { delivery_hash: fallback.deliveryHash } : {}),
            ...(fallback.receiptUrl ? { receipt_url: fallback.receiptUrl } : {}),
            sandbox_mock: true,
          } as any;
        }
      }
    }
    return { order_id: orderId, upstream_status: status, success: status >= 200 && status < 300 };
  }

  private static async submitAutoPayAfterRamp(
    record: SandboxMockOnRampOrder,
    input: any,
    context: SessionWalletContext,
  ): Promise<Record<string, unknown> | null> {
    const operationContext = record.operationContext || {};
    if (!operationContext.auto_pay_after_ramp) return null;

    const amount = coalesceString(
      operationContext.auto_pay_amount,
      record.finalAmount,
      (record.transaction as OnRampTransaction & { finalAmount?: string }).finalAmount,
      record.transaction.toAmount,
    );
    const sourceAssetCode = normalizeAssetCode(coalesceString(
      operationContext.auto_pay_asset_code,
      record.finalAssetCode,
      record.transaction.toCurrency,
    ));
    const destinationAssetCode = normalizeAssetCode(coalesceString(
      operationContext.auto_pay_destination_asset_code,
      operationContext.auto_pay_destination_asset,
      sourceAssetCode,
    ));
    const recipient = coalesceString(operationContext.auto_pay_recipient);
    const recipientKey = coalesceString(
      operationContext.auto_pay_recipient_key,
      operationContext.auto_pay_recipient_email,
      operationContext.auto_pay_recipient_pix_key,
    );
    const recipientPublicKey = coalesceString(operationContext.auto_pay_recipient_public_key);

    if (!amount || !sourceAssetCode || !recipient) {
      throw apiError('Auto-pay after PIX is missing amount, asset, or recipient.', 400);
    }

    const explicitDedupeKey = coalesceString(operationContext.auto_pay_dedupe_key);
    const autoPayDedupeKey = explicitDedupeKey || [
      context.sessionId,
      context.userId,
      recipient,
      amount,
      sourceAssetCode,
      destinationAssetCode || sourceAssetCode,
      coalesceString(operationContext.external_provider, input.provider, input.external_provider),
      coalesceString(operationContext.external_provider_user_id, input.provider_user_id, input.external_provider_user_id),
    ].map((part) => String(part || '').trim().toLowerCase()).join(':');
    const receiptDedupeKey = explicitDedupeKey
      ? `pix-funded-autopay:${explicitDedupeKey}`
      : `pix-funded-autopay:${stableHex(autoPayDedupeKey).slice(0, 24)}`;
    const lockKey = `${context.userId}:${receiptDedupeKey}`;
    const autoPayResultContext = operationContext.auto_pay_result && typeof operationContext.auto_pay_result === 'object'
      ? operationContext.auto_pay_result as Record<string, unknown>
      : {};
    const existingReceiptUrl = coalesceString(
      operationContext.auto_pay_receipt_url,
      operationContext.auto_pay_transfer_receipt_url,
      autoPayResultContext.receipt_url,
    );
    if (coalesceString(operationContext.auto_pay_status) === 'completed' || existingReceiptUrl) {
      return {
        success: true,
        skipped_duplicate: true,
        receipt_url: existingReceiptUrl || undefined,
        transaction_hash: coalesceString(operationContext.auto_pay_transfer_hash) || undefined,
      };
    }

    const alreadyCompleted = await this.findCompletedAutoPayByDedupeKey(context.userId, autoPayDedupeKey);
    if (alreadyCompleted) {
      await this.persistSandboxOnRampContext(record, {
        auto_pay_status: 'completed',
        auto_pay_skipped_duplicate: true,
        auto_pay_duplicate_of_operation_id: alreadyCompleted.operation_id,
        auto_pay_receipt_url: alreadyCompleted.receipt_url || undefined,
        auto_pay_transfer_hash: alreadyCompleted.transaction_hash || undefined,
        auto_pay_dedupe_key: autoPayDedupeKey,
      });
      return {
        success: true,
        skipped_duplicate: true,
        receipt_url: alreadyCompleted.receipt_url || undefined,
        transaction_hash: alreadyCompleted.transaction_hash || undefined,
      };
    }

    const existingLock = this.sandboxAutoPayLocks.get(lockKey);
    if (existingLock) return existingLock;

    const runAutoPay = (async () => {
      await this.persistSandboxOnRampContext(record, {
        auto_pay_status: 'processing',
        auto_pay_started_at: new Date().toISOString(),
        auto_pay_dedupe_key: autoPayDedupeKey,
      });
      const result = await this.submitPixFundedTransferForSession({
        session_id: context.sessionId,
        session_token: context.sessionToken,
        pin: coalesceString(input.pin, input.wallet_pin, input.walletPin),
        wallet_pin: coalesceString(input.wallet_pin, input.pin, input.walletPin),
        walletPin: coalesceString(input.walletPin, input.wallet_pin, input.pin),
        amount,
        asset_code: sourceAssetCode,
        source_asset_code: sourceAssetCode,
        destination_asset_code: destinationAssetCode || sourceAssetCode,
        recipient,
        recipient_name: recipient,
        recipient_key: recipientKey || undefined,
        recipient_public_key: recipientPublicKey || undefined,
        order_id: coalesceString(input.order_id, input.orderId, record.transaction.id),
        operation_id: coalesceString(input.operation_id, input.operationId, record.operationId),
        language: coalesceString(operationContext.language, input.language),
        provider: coalesceString(operationContext.external_provider, input.provider, input.external_provider),
        provider_user_id: coalesceString(operationContext.external_provider_user_id, input.provider_user_id, input.external_provider_user_id),
        source: coalesceString(operationContext.external_source, input.source),
        dedupe_key: receiptDedupeKey,
      } as any);
      await this.persistSandboxOnRampContext(record, {
        auto_pay_status: result?.success ? 'completed' : 'failed',
        auto_pay_completed_at: result?.success ? new Date().toISOString() : undefined,
        auto_pay_receipt_url: coalesceString(result?.receipt_url) || undefined,
        auto_pay_transfer_hash: coalesceString(result?.transaction_hash) || undefined,
        auto_pay_result: result || undefined,
        auto_pay_dedupe_key: autoPayDedupeKey,
      });
      return result || null;
    })();

    this.sandboxAutoPayLocks.set(lockKey, runAutoPay);
    try {
      return await runAutoPay;
    } finally {
      this.sandboxAutoPayLocks.delete(lockKey);
    }
  }

  private static async findCompletedAutoPayByDedupeKey(
    userId: string,
    autoPayDedupeKey: string,
  ): Promise<{ operation_id?: string; receipt_url?: string; transaction_hash?: string } | null> {
    if (!userId || !autoPayDedupeKey) return null;

    try {
      const { data, error } = await supabase
        .from('operations')
        .select('id, context, created_at')
        .eq('user_id', userId)
        .eq('type', 'PIX_ONRAMP')
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) {
        console.warn('[ramp] Could not check duplicate auto-pay operations:', error.message);
        return null;
      }

      for (const row of (data || []) as Array<Record<string, unknown>>) {
        const context = parseOperationContext(row.context);
        if (coalesceString(context.auto_pay_dedupe_key) !== autoPayDedupeKey) continue;
        const autoPayResult = context.auto_pay_result && typeof context.auto_pay_result === 'object'
          ? context.auto_pay_result as Record<string, unknown>
          : {};
        const receiptUrl = coalesceString(
          context.auto_pay_receipt_url,
          context.auto_pay_transfer_receipt_url,
          autoPayResult.receipt_url,
        );
        const transactionHash = coalesceString(
          context.auto_pay_transfer_hash,
          autoPayResult.transaction_hash,
        );
        if (coalesceString(context.auto_pay_status) !== 'completed' && !receiptUrl && !transactionHash) continue;
        return {
          operation_id: coalesceString(row.id),
          receipt_url: receiptUrl || undefined,
          transaction_hash: transactionHash || undefined,
        };
      }
    } catch (error) {
      console.warn('[ramp] Could not check duplicate auto-pay operations:', debugErrorMessage(error));
    }

    return null;
  }

  private static async findSandboxLedgerAdjustmentOperations(
    context: SessionWalletContext,
  ): Promise<Array<Record<string, any>>> {
    const byId = new Map<string, Record<string, any>>();
    const addRows = (rows: unknown) => {
      for (const row of Array.isArray(rows) ? rows : []) {
        const id = coalesceString((row as any)?.id);
        if (id) byId.set(id, row as Record<string, any>);
      }
    };

    try {
      addRows(await OperationRepository.findByUserId(context.userId));
    } catch (error) {
      console.warn('[ramp] Could not load sandbox ledger operations by user:', debugErrorMessage(error));
    }

    const scopedQueries: Array<{ column: string; value: string }> = [
      { column: 'source_public_key', value: context.publicKey },
      { column: 'source_session_id', value: context.sessionId },
    ].filter((item) => Boolean(item.value));

    for (const query of scopedQueries) {
      try {
        const { data, error } = await supabase
          .from('operations')
          .select('*')
          .eq(query.column, query.value)
          .order('created_at', { ascending: false })
          .limit(500);

        if (error) {
          console.warn(`[ramp] Could not load sandbox ledger operations by ${query.column}:`, error.message);
          continue;
        }
        addRows(data);
      } catch (error) {
        console.warn(`[ramp] Could not load sandbox ledger operations by ${query.column}:`, debugErrorMessage(error));
      }
    }

    return Array.from(byId.values());
  }

  private static async getSandboxLedgerBalanceAdjustments(
    context: SessionWalletContext,
  ): Promise<NormalizedWalletBalance[]> {
    if (!this.getRuntimeInfo().sandbox) return [];
    if (!this.sandboxLedgerFallbackAllowed()) return [];

    const operations = await this.findSandboxLedgerAdjustmentOperations(context);

    const totals = new Map<string, { asset_code: string; asset_issuer?: string; amount: number }>();
    const tesouroAsset = { code: 'TESOURO', issuer: this.getTesouroIssuer() };

    for (const operation of operations || []) {
      if (String(operation?.type || '').toUpperCase() !== 'PIX_ONRAMP') continue;
      if (!['COMPLETED', 'SUCCESS'].includes(String(operation?.status || '').toUpperCase())) continue;

      const sourcePublicKey = coalesceString((operation as any).source_public_key);
      const sourceSessionId = coalesceString((operation as any).source_session_id);
      const operationContext = parseOperationContext(operation?.context);
      if (operationContext.sandbox_ledger_settlement !== true) continue;
      if (coalesceString(operationContext.final_settlement_mode) !== 'sandbox_anchor_only') continue;
      if (operationContext.auto_pay_after_ramp === true) continue;

      const contextPublicKey = coalesceString(operationContext.public_key, operationContext.wallet_public_key, operationContext.source_public_key);
      const contextSessionId = coalesceString(operationContext.session_id, operationContext.source_session_id);
      const contextUserId = coalesceString(operationContext.user_id);
      if (sourcePublicKey && sourcePublicKey !== context.publicKey) continue;
      if (!sourcePublicKey && contextPublicKey && contextPublicKey !== context.publicKey) continue;
      if (!sourcePublicKey && !contextPublicKey && sourceSessionId && sourceSessionId !== context.sessionId) continue;
      if (!sourcePublicKey && !contextPublicKey && !sourceSessionId && contextSessionId && contextSessionId !== context.sessionId) continue;
      if (!sourcePublicKey && !contextPublicKey && !sourceSessionId && !contextSessionId && contextUserId && contextUserId !== context.userId) continue;

      const finalAsset = resolveRampFinalAsset(
        operationContext.final_asset,
        operationContext.target_asset,
        operationContext.final_asset_code,
        operation?.asset_code,
        'TESOURO',
      );

      if (!sameIssuedAsset(finalAsset, tesouroAsset)) continue;

      const amount = parseHumanAmountNumber(coalesceString(
        operationContext.final_amount,
        operationContext.destination_amount_anchor,
        operation?.amount,
      ));
      if (!Number.isFinite(amount) || amount <= 0) continue;

      const key = `${finalAsset.code}:${finalAsset.issuer || ''}`;
      const existing = totals.get(key);
      totals.set(key, {
        asset_code: finalAsset.code,
        asset_issuer: finalAsset.issuer,
        amount: (existing?.amount || 0) + amount,
      });
    }

    return Array.from(totals.values()).map((row) => ({
      asset_code: row.asset_code,
      asset_issuer: row.asset_issuer,
      balance: formatDecimalAmount(row.amount),
    }));
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
    const normalizedBalances = normalizeBalances(balances);
    const sandboxLedgerAdjustments = await this.getSandboxLedgerBalanceAdjustments(context);
    return {
      public_key: context.publicKey,
      balances: mergeBalanceAdjustments(normalizedBalances, sandboxLedgerAdjustments),
    };
  }

  static async getDefindexYieldStatus(networkOverride?: string): Promise<{
    success: true;
    runtime: ReturnType<typeof DefindexYieldService.getRuntimeInfo>;
    vaults: Array<Record<string, unknown>>;
  }> {
    const runtime = DefindexYieldService.getRuntimeInfo(networkOverride);
    logDefindex('info', 'status_start', {
      network: runtime.network,
      configured: runtime.configured,
      api_key_configured: runtime.api_key_configured,
      execution_enabled: runtime.execution_enabled,
      vault_count: runtime.vaults.length,
    });
    const vaults = await Promise.all(runtime.vaults.map(async (vault) => {
      const enriched: Record<string, unknown> = {
        ...vault,
        display_asset_code: userFacingAssetCode(vault.asset_code),
      };
      if (!runtime.api_key_configured) return enriched;
      try {
        const compatibility = await DefindexYieldService.getVaultAssetCompatibility(vault);
        enriched.vault_asset = compatibility.info;
        enriched.asset_compatible = compatibility.compatible;
        enriched.hardcoded_asset_override = Boolean(compatibility.hardcoded_asset_override);
        enriched.requires_wallet_asset_conversion = Boolean(compatibility.requires_wallet_asset_conversion);
        if (compatibility.wallet_source_asset) enriched.wallet_source_asset = compatibility.wallet_source_asset;
        if (compatibility.vault_deposit_asset) enriched.vault_deposit_asset = compatibility.vault_deposit_asset;
        if (!compatibility.compatible) {
          enriched.unavailable_reason = 'Vault asset does not match the configured wallet asset for this environment.';
          logDefindex('warn', 'status_vault_asset_incompatible', {
            asset_code: vault.asset_code,
            vault_address: maskLogValue(vault.vault_address),
            network: vault.network,
            vault_asset_issuer: maskLogValue(compatibility.info.asset_issuer),
            configured_issuer: maskLogValue(compatibility.configured_issuer),
            vault_asset_contract: maskLogValue(compatibility.info.asset_contract),
            configured_contract: maskLogValue(compatibility.configured_contract),
          });
        } else if (compatibility.requires_wallet_asset_conversion) {
          enriched.execution_available = true;
          enriched.conversion_note = 'This testnet vault uses a distinct asset issuance and requires conversion before execution.';
          logDefindex('info', 'status_vault_asset_conversion_required', {
            asset_code: vault.asset_code,
            vault_address: maskLogValue(vault.vault_address),
            network: vault.network,
            vault_asset_issuer: maskLogValue(compatibility.info.asset_issuer),
            configured_issuer: maskLogValue(compatibility.configured_issuer),
            execution_available: enriched.execution_available,
          });
        } else {
          enriched.execution_available = true;
        }
      } catch (error) {
        logDefindex('warn', 'status_vault_asset_check_failed', {
          asset_code: vault.asset_code,
          vault_address: maskLogValue(vault.vault_address),
          network: vault.network,
          ...defindexErrorFields(error),
        });
      }
      try {
        const apy = await DefindexYieldService.getVaultAPY(vault.vault_address, runtime.network);
        enriched.apy = apy;
        enriched.apy_percent = coalesceString(apy?.apyPercent, apy?.apy_percent, apy?.apy);
        enriched.apy_period = coalesceString(apy?.period, apy?.calculationPeriod);
      } catch (error) {
        logDefindex('warn', 'status_vault_apy_failed', {
          asset_code: vault.asset_code,
          vault_address: maskLogValue(vault.vault_address),
          network: vault.network,
          ...defindexErrorFields(error),
        });
        enriched.apy_error = debugErrorMessage(error);
      }
      return enriched;
    }));
    const availableVaults = vaults;
    logDefindex('info', 'status_success', {
      network: runtime.network,
      configured: runtime.configured,
      returned_vault_count: availableVaults.length,
      filtered_vault_count: vaults.length - availableVaults.length,
      vault_assets: availableVaults.map((vault) => String(vault.asset_code || '')).filter(Boolean).join(','),
    });
    return { success: true, runtime, vaults: availableVaults };
  }

  static async getDefindexYieldBalanceForSession(input: RampSessionInput & {
    asset_code?: string;
    assetCode?: string;
    vault_address?: string;
    vaultAddress?: string;
    network?: string;
  }): Promise<{
    success: true;
    public_key: string;
    vault: Record<string, unknown>;
    balance: unknown;
    balance_source?: string;
    provider_unavailable?: boolean;
  }> {
    const context = await this.resolveSessionWallet(input);
    const assetCode = coalesceString(input.asset_code, input.assetCode);
    const requestedVault = coalesceString(input.vault_address, input.vaultAddress);
    const networkOverride = coalesceString(input.network) || undefined;
    logDefindex('info', 'balance_start', {
      request_id: defindexRequestId(input),
      session_id: maskLogValue(context.sessionId),
      user_id: maskLogValue(context.userId),
      public_key: maskLogValue(context.publicKey),
      asset_code: assetCode || 'USDC',
      requested_vault: maskLogValue(requestedVault),
    });
    const vault = DefindexYieldService.requireVault(
      assetCode,
      requestedVault,
      networkOverride,
    );
    let balance: unknown;
    try {
      balance = await DefindexYieldService.getVaultBalance(vault.vault_address, context.publicKey, vault.network);
    } catch (error) {
      logDefindex('warn', 'balance_failed', {
        request_id: defindexRequestId(input),
        session_id: maskLogValue(context.sessionId),
        user_id: maskLogValue(context.userId),
        public_key: maskLogValue(context.publicKey),
        asset_code: vault.asset_code,
        vault_address: maskLogValue(vault.vault_address),
        network: vault.network,
        ...defindexErrorFields(error),
      });
      const fallback = await this.getDefindexOperationPositionFallback(context, vault);
      if (fallback) {
        logDefindex('info', 'balance_operation_history_fallback', {
          request_id: defindexRequestId(input),
          session_id: maskLogValue(context.sessionId),
          user_id: maskLogValue(context.userId),
          public_key: maskLogValue(context.publicKey),
          asset_code: vault.asset_code,
          vault_address: maskLogValue(vault.vault_address),
          operation_count: fallback.operationCount,
          amount: fallback.amount,
        });
        return {
          success: true,
          public_key: context.publicKey,
          vault: {
            ...vault,
            display_asset_code: userFacingAssetCode(vault.asset_code),
          },
          balance: {
            amount_decimal: fallback.amount,
            source: 'operation_history_fallback',
          },
          balance_source: 'operation_history_fallback',
          provider_unavailable: true,
        };
      }
      throw error;
    }
    const amountDecimal = extractDefindexBalanceAmountDecimal(balance);
    logDefindex('info', 'balance_success', {
      request_id: defindexRequestId(input),
      session_id: maskLogValue(context.sessionId),
      user_id: maskLogValue(context.userId),
      public_key: maskLogValue(context.publicKey),
      asset_code: vault.asset_code,
      vault_address: maskLogValue(vault.vault_address),
      network: vault.network,
      amount_decimal: amountDecimal,
    });
    return {
      success: true,
      public_key: context.publicKey,
      vault: {
        ...vault,
        display_asset_code: userFacingAssetCode(vault.asset_code),
      },
      balance: balance && typeof balance === 'object' && !Array.isArray(balance)
        ? {
          ...(balance as Record<string, unknown>),
          amount_decimal: amountDecimal,
        }
        : {
          amount_decimal: amountDecimal,
          raw: balance,
      },
    };
  }

  static async getDefindexYieldHistoryForSession(input: RampSessionInput & {
    asset_code?: string;
    assetCode?: string;
    vault_address?: string;
    vaultAddress?: string;
  }): Promise<{
    success: true;
    public_key: string;
    vault: Record<string, unknown>;
    points: Array<{
      date: string;
      amount: string;
      delta: string;
      action: 'deposit' | 'withdraw';
      operation_id: string;
    }>;
    source: 'operation_history';
  }> {
    const context = await this.resolveSessionWallet(input);
    const assetCode = coalesceString(input.asset_code, input.assetCode);
    const requestedVault = coalesceString(input.vault_address, input.vaultAddress);
    const vault = DefindexYieldService.requireVault(assetCode, requestedVault);
    let operations: Awaited<ReturnType<typeof OperationRepository.findByUserId>>;

    try {
      operations = await OperationRepository.findByUserId(context.userId);
    } catch (error) {
      logDefindex('warn', 'history_operation_load_failed', {
        request_id: defindexRequestId(input),
        session_id: maskLogValue(context.sessionId),
        user_id: maskLogValue(context.userId),
        public_key: maskLogValue(context.publicKey),
        asset_code: vault.asset_code,
        vault_address: maskLogValue(vault.vault_address),
        ...defindexErrorFields(error),
      });
      operations = [];
    }

    const relevant = (operations || [])
      .filter((operation) => {
        const type = String(operation?.type || '').toUpperCase();
        if (!type.startsWith('DEFINDEX_YIELD_')) return false;
        const status = String(operation?.status || '').toUpperCase();
        if (!['COMPLETED', 'SUCCESS'].includes(status)) return false;
        if (normalizeAssetCode(operation?.asset_code) !== normalizeAssetCode(vault.asset_code)) return false;
        if (operation?.source_public_key && String(operation.source_public_key) !== context.publicKey) return false;
        if (!operation?.source_public_key && operation?.source_session_id && String(operation.source_session_id) !== context.sessionId) return false;

        const operationContext = parseOperationContext(operation?.context);
        const operationVault = coalesceString(operationContext.vault_address, operationContext.vaultAddress);
        return !operationVault || operationVault === vault.vault_address;
      })
      .sort((a, b) => Date.parse(String(a.created_at || '')) - Date.parse(String(b.created_at || '')));

    let running = 0;
    const points = relevant.flatMap((operation) => {
      const rawAmount = parseHumanAmountNumber(operation?.amount);
      if (!Number.isFinite(rawAmount) || rawAmount <= 0) return [];
      const type = String(operation?.type || '').toUpperCase();
      const action = type.includes('WITHDRAW') ? 'withdraw' as const : 'deposit' as const;
      const delta = action === 'withdraw' ? -rawAmount : rawAmount;
      running = Math.max(0, running + delta);
      return [{
        date: String(operation.created_at || operation.updated_at || new Date().toISOString()),
        amount: formatDecimalAmount(running),
        delta: delta < 0 ? `-${formatDecimalAmount(Math.abs(delta))}` : formatDecimalAmount(delta),
        action,
        operation_id: String(operation.id || ''),
      }];
    });

    return {
      success: true,
      public_key: context.publicKey,
      vault: {
        ...vault,
        display_asset_code: userFacingAssetCode(vault.asset_code),
      },
      points,
      source: 'operation_history',
    };
  }

  private static async getDefindexOperationPositionFallback(
    context: SessionWalletContext,
    vault: ReturnType<typeof DefindexYieldService.requireVault>,
  ): Promise<{ amount: string; operationCount: number } | null> {
    let operations: Awaited<ReturnType<typeof OperationRepository.findByUserId>>;
    try {
      operations = await OperationRepository.findByUserId(context.userId);
    } catch (error) {
      logDefindex('warn', 'balance_operation_history_fallback_failed', {
        session_id: maskLogValue(context.sessionId),
        user_id: maskLogValue(context.userId),
        public_key: maskLogValue(context.publicKey),
        asset_code: vault.asset_code,
        vault_address: maskLogValue(vault.vault_address),
        ...defindexErrorFields(error),
      });
      return null;
    }

    let total = 0;
    let operationCount = 0;
    for (const operation of operations || []) {
      const type = String(operation?.type || '').toUpperCase();
      if (!type.startsWith('DEFINDEX_YIELD_')) continue;
      const status = String(operation?.status || '').toUpperCase();
      if (!['COMPLETED', 'SUCCESS'].includes(status)) continue;
      if (normalizeAssetCode(operation?.asset_code) !== normalizeAssetCode(vault.asset_code)) continue;
      if (operation?.source_public_key && String(operation.source_public_key) !== context.publicKey) continue;
      if (!operation?.source_public_key && operation?.source_session_id && String(operation.source_session_id) !== context.sessionId) continue;

      const operationContext = parseOperationContext(operation?.context);
      const operationVault = coalesceString(operationContext.vault_address, operationContext.vaultAddress);
      if (operationVault && operationVault !== vault.vault_address) continue;

      const amount = parseHumanAmountNumber(operation?.amount);
      if (!Number.isFinite(amount) || amount <= 0) continue;
      operationCount += 1;
      total += type.includes('WITHDRAW') ? -amount : amount;
    }

    if (operationCount <= 0) return null;
    return {
      amount: formatDecimalAmount(Math.max(0, total)),
      operationCount,
    };
  }

  private static async getDefindexDepositAssetReadiness(input: {
    requestId?: string;
    context: SessionWalletContext;
    action: DefindexYieldAction;
    amount: string;
    walletSourceAsset?: { code: string; issuer?: string };
    vault: ReturnType<typeof DefindexYieldService.requireVault>;
    compatibility: Awaited<ReturnType<typeof DefindexYieldService.getVaultAssetCompatibility>>;
  }): Promise<{
    requiresConversion: boolean;
    conversionReady: boolean;
    executionBlockedCode?: 'yield_asset_conversion_required' | 'yield_asset_conversion_unavailable' | 'yield_account_setup_required' | 'insufficient_balance';
    executionBlockedReason?: string;
    setupRequired?: boolean;
    trustline?: TrustlineResult;
    conversionQuote?: Record<string, unknown>;
    vaultDepositAsset?: { code: string; issuer?: string; contract?: string };
    walletSourceAsset?: { code: string; issuer?: string };
  }> {
    const vaultDepositAsset = input.compatibility.vault_deposit_asset;
    const walletSourceAsset = input.walletSourceAsset || input.compatibility.wallet_source_asset;
    const sourceDiffersFromVault = Boolean(vaultDepositAsset && walletSourceAsset && !sameIssuedAsset(walletSourceAsset, vaultDepositAsset));
    const requiresConversion = input.action === 'deposit' &&
      Boolean(vaultDepositAsset) &&
      Boolean(walletSourceAsset) &&
      sourceDiffersFromVault;

    if (!requiresConversion || !vaultDepositAsset || !walletSourceAsset) {
      return {
        requiresConversion: false,
        conversionReady: false,
        vaultDepositAsset,
        walletSourceAsset,
      };
    }

    let trustline: TrustlineResult | undefined;
    if (normalizeAssetCode(vaultDepositAsset.code) !== 'XLM') {
      try {
        trustline = await this.ensureIssuedAssetTrustline(input.context, {
          code: vaultDepositAsset.code,
          issuer: vaultDepositAsset.issuer,
        });
        logDefindex('info', 'prepare_vault_asset_trustline_checked', {
          request_id: input.requestId,
          session_id: maskLogValue(input.context.sessionId),
          user_id: maskLogValue(input.context.userId),
          public_key: maskLogValue(input.context.publicKey),
          asset_code: vaultDepositAsset.code,
          asset_issuer: maskLogValue(vaultDepositAsset.issuer),
          existing: trustline.existing,
          success: trustline.success,
        });
      } catch (error) {
        logDefindex('warn', 'prepare_vault_asset_trustline_failed', {
          request_id: input.requestId,
          session_id: maskLogValue(input.context.sessionId),
          user_id: maskLogValue(input.context.userId),
          public_key: maskLogValue(input.context.publicKey),
          asset_code: vaultDepositAsset.code,
          asset_issuer: maskLogValue(vaultDepositAsset.issuer),
          ...defindexErrorFields(error),
        });
        return {
          requiresConversion: true,
          conversionReady: false,
          executionBlockedCode: 'yield_account_setup_required',
          executionBlockedReason: 'Aplicação preparada. Não precisa criar outra conta; ainda falta ativar a moeda usada por esta aplicação nesta conta. Tente novamente em alguns segundos.',
          setupRequired: true,
          vaultDepositAsset,
          walletSourceAsset,
        };
      }
    }

    if (trustline && !trustline.success) {
      return {
        requiresConversion: true,
        conversionReady: false,
        executionBlockedCode: 'yield_account_setup_required',
        executionBlockedReason: 'Aplicação preparada. Não precisa criar outra conta; ainda falta ativar a moeda usada por esta aplicação nesta conta. Tente novamente em alguns segundos.',
        setupRequired: true,
        trustline,
        vaultDepositAsset,
        walletSourceAsset,
      };
    }

    const balances = await StellarService.getAccountBalance(input.context.publicKey);
    const sourceAmount = formatDecimalAmount(parseHumanAmountNumber(input.amount));
    const sourceAvailable = rawIssuedBalanceAmount(balances, walletSourceAsset);
    if (sourceAvailable + 0.0000001 < parseHumanAmountNumber(sourceAmount)) {
      return {
        requiresConversion: true,
        conversionReady: false,
        executionBlockedCode: 'insufficient_balance',
        executionBlockedReason: 'Aplicação preparada, mas o saldo disponível não é suficiente para converter e confirmar este valor.',
        setupRequired: false,
        trustline,
        vaultDepositAsset,
        walletSourceAsset,
        conversionQuote: {
          conversion_mode: 'strict_receive_vault_amount',
          source_asset: walletSourceAsset,
          destination_asset: vaultDepositAsset,
          requested_vault_amount: sourceAmount,
          source_available: formatDecimalAmount(sourceAvailable),
        },
      };
    }

    try {
      const quote = await StellarService.quotePathPayment({
        sourcePublicKey: input.context.publicKey,
        destination: input.context.publicKey,
        sourceAsset: walletSourceAsset,
        destAsset: vaultDepositAsset,
        destAmount: sourceAmount,
      });
      const conversionQuote = {
        conversion_mode: 'strict_receive_vault_amount',
        source_asset: walletSourceAsset,
        destination_asset: vaultDepositAsset,
        requested_vault_amount: sourceAmount,
        source_amount: quote.sourceAmount,
        source_max: quote.sourceMax,
        path_source_amount: quote.pathSourceAmount,
        path_source_max: quote.pathSourceMax,
        destination_amount: quote.destinationAmount,
        source_available: formatDecimalAmount(sourceAvailable),
        route_sane: true,
        path: quote.path,
      };
      const sameCodeSanity = defindexSameCodeConversionSane({
        requestedDestinationAmount: sourceAmount,
        quotedSourceAmount: quote.sourceAmount,
        quotedSourceMax: quote.sourceMax,
      });

      if (
        parseHumanAmountNumber(quote.destinationAmount) <= 0 ||
        !sameCodeSanity.sane ||
        sourceAvailable + 0.0000001 < sameCodeSanity.sourceMax
      ) {
        logDefindex('warn', 'prepare_vault_asset_conversion_unsafe', {
          request_id: input.requestId,
          session_id: maskLogValue(input.context.sessionId),
          user_id: maskLogValue(input.context.userId),
          public_key: maskLogValue(input.context.publicKey),
          asset_code: input.vault.asset_code,
          vault_address: maskLogValue(input.vault.vault_address),
          source_amount: quote.sourceAmount,
          source_max: quote.sourceMax,
          destination_amount: quote.destinationAmount,
          source_available: formatDecimalAmount(sourceAvailable),
          source_max_allowed: sameCodeSanity.maxAllowed,
          premium_pct: sameCodeSanity.premiumPct,
        });
        return {
          requiresConversion: true,
          conversionReady: false,
          executionBlockedCode: 'yield_asset_conversion_unavailable',
          executionBlockedReason: sourceAvailable + 0.0000001 < sameCodeSanity.sourceMax
            ? 'Aplicação preparada, mas o saldo disponível não cobre a margem de segurança para converter e confirmar este valor.'
            : 'Aplicação preparada. A rota de teste entre as duas emissões desta moeda está distorcida agora, então a confirmação foi bloqueada para evitar perda no valor convertido.',
          setupRequired: false,
          trustline,
          vaultDepositAsset,
          walletSourceAsset,
          conversionQuote: {
            ...conversionQuote,
            route_sane: false,
            premium_pct: sameCodeSanity.premiumPct,
            source_max_allowed: sameCodeSanity.maxAllowed,
          },
        };
      }

      return {
        requiresConversion: true,
        conversionReady: true,
        trustline,
        vaultDepositAsset,
        walletSourceAsset,
        conversionQuote,
      };
    } catch (error) {
      logDefindex('warn', 'prepare_vault_asset_conversion_quote_failed', {
        request_id: input.requestId,
        session_id: maskLogValue(input.context.sessionId),
        user_id: maskLogValue(input.context.userId),
        public_key: maskLogValue(input.context.publicKey),
        asset_code: input.vault.asset_code,
        vault_address: maskLogValue(input.vault.vault_address),
        source_amount: sourceAmount,
        ...defindexErrorFields(error),
      });
      return {
        requiresConversion: true,
        conversionReady: false,
        executionBlockedCode: 'yield_asset_conversion_unavailable',
        executionBlockedReason: 'Aplicação preparada. A rota para converter o saldo escolhido para esta aplicação não está disponível agora.',
        setupRequired: false,
        trustline,
        vaultDepositAsset,
        walletSourceAsset,
      };
    }
  }

  private static resolveDefindexSourceAsset(input: {
    sourceAssetCode?: unknown;
    sourceAssetIssuer?: unknown;
    fallbackAssetCode?: unknown;
  }): { code: string; issuer?: string } {
    const code = normalizeAssetCode(coalesceString(input.sourceAssetCode, input.fallbackAssetCode, 'USDC'));
    return resolveConfiguredAsset(code, input.sourceAssetIssuer);
  }

  private static async buildDefindexVaultAction(input: {
    action: DefindexYieldAction;
    vault: ReturnType<typeof DefindexYieldService.requireVault>;
    publicKey: string;
    amount: string;
    invest?: boolean;
    slippageBps: number;
  }): Promise<{ amount: string; amountUnits: number; prepared: { xdr: string; raw: any } }> {
    const amountUnits = DefindexYieldService.amountToContractUnits(input.amount);
    const prepared = await DefindexYieldService.buildVaultAction({
      action: input.action,
      vaultAddress: input.vault.vault_address,
      caller: input.publicKey,
      amountUnits,
      network: input.vault.network,
      invest: input.invest !== false,
      slippageBps: Number.isFinite(input.slippageBps) ? input.slippageBps : 100,
    });
    return { amount: input.amount, amountUnits, prepared };
  }

  private static async getDefindexDirectDepositReadiness(input: {
    requestId?: string;
    context: SessionWalletContext;
    action: DefindexYieldAction;
    amount: string;
    sourceAsset: { code: string; issuer?: string };
    vault: ReturnType<typeof DefindexYieldService.requireVault>;
  }): Promise<{
    executionBlockedCode?: 'insufficient_balance';
    executionBlockedReason?: string;
    sourceAvailable?: string;
    sourceTotal?: string;
    reserved?: string;
    checked?: boolean;
    sufficient?: boolean;
  }> {
    if (input.action !== 'deposit') {
      return {};
    }

    const sourceCode = normalizeAssetCode(input.sourceAsset.code);
    const requested = parseHumanAmountNumber(input.amount);

    if (sourceCode === 'XLM') {
      const account = await StellarService.loadAccount(input.context.publicKey);
      const xlm = accountSpendableXlmAmount(account);
      const sufficient = xlm.spendable + 0.0000001 >= requested;

      logDefindex(sufficient ? 'info' : 'warn', 'prepare_direct_xlm_balance_checked', {
        request_id: input.requestId,
        session_id: maskLogValue(input.context.sessionId),
        user_id: maskLogValue(input.context.userId),
        public_key: maskLogValue(input.context.publicKey),
        asset_code: input.vault.asset_code,
        vault_address: maskLogValue(input.vault.vault_address),
        requested_amount: input.amount,
        xlm_total: formatDecimalAmount(xlm.total),
        xlm_reserved: formatDecimalAmount(xlm.reserve),
        xlm_spendable: formatDecimalAmount(xlm.spendable),
        sufficient,
      });

      if (!sufficient) {
        return {
          checked: true,
          sufficient: false,
          executionBlockedCode: 'insufficient_balance',
          executionBlockedReason:
            `Aplicação preparada, mas XLM precisa manter reserva de rede. ` +
            `Disponivel para aplicar: ${formatDisplayAmount(formatDecimalAmount(xlm.spendable), 'XLM')}. ` +
            `Saldo total: ${formatDisplayAmount(formatDecimalAmount(xlm.total), 'XLM')}. ` +
            `Reserva estimada: ${formatDisplayAmount(formatDecimalAmount(xlm.reserve), 'XLM')}.`,
          sourceAvailable: formatDecimalAmount(xlm.spendable),
          sourceTotal: formatDecimalAmount(xlm.total),
          reserved: formatDecimalAmount(xlm.reserve),
        };
      }

      return {
        checked: true,
        sufficient: true,
        sourceAvailable: formatDecimalAmount(xlm.spendable),
        sourceTotal: formatDecimalAmount(xlm.total),
        reserved: formatDecimalAmount(xlm.reserve),
      };
    }

    try {
      const balances = await StellarService.getAccountBalance(input.context.publicKey);
      const available = rawIssuedBalanceAmount(balances, input.sourceAsset);
      const sufficient = available + 0.0000001 >= requested;

      logDefindex(sufficient ? 'info' : 'warn', 'prepare_direct_asset_balance_checked', {
        request_id: input.requestId,
        session_id: maskLogValue(input.context.sessionId),
        user_id: maskLogValue(input.context.userId),
        public_key: maskLogValue(input.context.publicKey),
        asset_code: input.vault.asset_code,
        source_asset_code: input.sourceAsset.code,
        source_asset_issuer: maskLogValue(input.sourceAsset.issuer),
        vault_address: maskLogValue(input.vault.vault_address),
        requested_amount: input.amount,
        source_available: formatDecimalAmount(available),
        sufficient,
      });

      if (!sufficient) {
        return {
          checked: true,
          sufficient: false,
          executionBlockedCode: 'insufficient_balance',
          executionBlockedReason:
            `Aplicação preparada, mas o saldo disponível em ${userFacingAssetCode(sourceCode)} não cobre este valor. ` +
            `Disponivel: ${formatDisplayAmount(formatDecimalAmount(available), userFacingAssetCode(sourceCode))}. ` +
            `Solicitado: ${formatDisplayAmount(formatDecimalAmount(requested), userFacingAssetCode(sourceCode))}.`,
          sourceAvailable: formatDecimalAmount(available),
        };
      }

      return {
        checked: true,
        sufficient: true,
        sourceAvailable: formatDecimalAmount(available),
      };
    } catch (error) {
      logDefindex('warn', 'prepare_direct_asset_balance_check_unavailable', {
        request_id: input.requestId,
        session_id: maskLogValue(input.context.sessionId),
        user_id: maskLogValue(input.context.userId),
        public_key: maskLogValue(input.context.publicKey),
        asset_code: input.vault.asset_code,
        source_asset_code: input.sourceAsset.code,
        source_asset_issuer: maskLogValue(input.sourceAsset.issuer),
        vault_address: maskLogValue(input.vault.vault_address),
        ...defindexErrorFields(error),
      });
      return { checked: false };
    }
  }

  static async prepareDefindexYieldForSession(input: RampSessionInput & {
    action?: string;
    amount?: string;
    asset_code?: string;
    assetCode?: string;
    source_asset_code?: string;
    sourceAssetCode?: string;
    source_asset_issuer?: string;
    sourceAssetIssuer?: string;
    vault_address?: string;
    vaultAddress?: string;
    invest?: boolean;
    slippage_bps?: string | number;
    slippageBps?: string | number;
    network?: string;
  }): Promise<{
    success: true;
    prepared: true;
    public_key: string;
    action: DefindexYieldAction;
    amount: string;
    amount_units: number;
    vault: Record<string, unknown>;
    review_only?: boolean;
    execution_ready?: boolean;
    execution_blocked_reason?: string;
    execution_blocked_code?: string;
    setup_required?: boolean;
    conversion_required?: boolean;
    asset_conversion?: Record<string, unknown>;
    trustline?: TrustlineResult;
    xdr?: string;
    raw?: unknown;
  }> {
    const networkOverride = coalesceString(input.network) || undefined;
    const runtime = DefindexYieldService.getRuntimeInfo(networkOverride);
    const context = await this.resolveSessionWallet(input);
    const action: DefindexYieldAction = String(input.action || 'deposit').trim().toLowerCase() === 'withdraw'
      ? 'withdraw'
      : 'deposit';
    const amount = normalizeAmount(input.amount, 'amount');
    const assetCode = coalesceString(input.asset_code, input.assetCode);
    const sourceAsset = this.resolveDefindexSourceAsset({
      sourceAssetCode: coalesceString(input.source_asset_code, input.sourceAssetCode),
      sourceAssetIssuer: coalesceString(input.source_asset_issuer, input.sourceAssetIssuer),
      fallbackAssetCode: assetCode || 'USDC',
    });
    const requestedVault = coalesceString(input.vault_address, input.vaultAddress);
    logDefindex('info', 'prepare_start', {
      request_id: defindexRequestId(input),
      session_id: maskLogValue(context.sessionId),
      user_id: maskLogValue(context.userId),
      public_key: maskLogValue(context.publicKey),
      action,
      amount,
      asset_code: assetCode || 'USDC',
      source_asset_code: sourceAsset.code,
      source_asset_issuer: maskLogValue(sourceAsset.issuer),
      requested_vault: maskLogValue(requestedVault),
      network: runtime.network,
      execution_enabled: runtime.execution_enabled,
      execution_requested: runtime.execution_requested,
      compliance_approved: runtime.compliance_approved,
    });
    const vault = DefindexYieldService.requireVault(
      assetCode,
      requestedVault,
      networkOverride,
    );
    const amountUnits = DefindexYieldService.amountToContractUnits(amount);
    const slippageBps = Number(coalesceString(input.slippage_bps, input.slippageBps, 100));
    const reviewResponse = {
      success: true as const,
      prepared: true as const,
      public_key: context.publicKey,
      action,
      amount,
      amount_units: amountUnits,
      vault: {
        ...vault,
        display_asset_code: userFacingAssetCode(vault.asset_code),
      },
    };
    if (!runtime.execution_enabled) {
      logDefindex('info', 'prepare_review_only', {
        request_id: defindexRequestId(input),
        session_id: maskLogValue(context.sessionId),
        user_id: maskLogValue(context.userId),
        public_key: maskLogValue(context.publicKey),
        action,
        amount,
        amount_units: amountUnits,
        asset_code: vault.asset_code,
        vault_address: maskLogValue(vault.vault_address),
        network: vault.network,
        blocked_reason: runtime.execution_blocked_reason,
      });
      return {
        ...reviewResponse,
        review_only: true,
        execution_ready: false,
        execution_blocked_reason: runtime.execution_blocked_reason ||
          'Defindex execution is disabled for this environment.',
        execution_blocked_code: 'yield_execution_disabled',
        setup_required: false,
      };
    }
    let compatibility: Awaited<ReturnType<typeof DefindexYieldService.getVaultAssetCompatibility>>;
    try {
      compatibility = await DefindexYieldService.getVaultAssetCompatibility(vault);
    } catch (error) {
      logDefindex('warn', 'prepare_vault_asset_compatibility_unavailable', {
        request_id: defindexRequestId(input),
        session_id: maskLogValue(context.sessionId),
        user_id: maskLogValue(context.userId),
        public_key: maskLogValue(context.publicKey),
        action,
        amount,
        amount_units: amountUnits,
        asset_code: vault.asset_code,
        vault_address: maskLogValue(vault.vault_address),
        network: vault.network,
        ...defindexErrorFields(error),
      });
      return {
        ...reviewResponse,
        review_only: true,
        execution_ready: false,
        execution_blocked_reason: 'Aplicação preparada, mas a confirmação de investimento está indisponível agora. Tente novamente em alguns segundos.',
        execution_blocked_code: 'yield_execution_unavailable',
        setup_required: false,
      };
    }
    if (!compatibility.compatible) {
      const reason = 'Aplicação preparada. Esta opção de teste usa uma moeda diferente da moeda que aparece no saldo da conta. Escolha outra opção ou aguarde uma opção compatível antes de confirmar.';
      logDefindex('warn', 'prepare_vault_asset_incompatible', {
        request_id: defindexRequestId(input),
        session_id: maskLogValue(context.sessionId),
        user_id: maskLogValue(context.userId),
        public_key: maskLogValue(context.publicKey),
        action,
        amount,
        amount_units: amountUnits,
        asset_code: vault.asset_code,
        vault_address: maskLogValue(vault.vault_address),
        network: vault.network,
        vault_asset_issuer: maskLogValue(compatibility.info.asset_issuer),
        configured_issuer: maskLogValue(compatibility.configured_issuer),
        vault_asset_contract: maskLogValue(compatibility.info.asset_contract),
        configured_contract: maskLogValue(compatibility.configured_contract),
      });
      return {
        ...reviewResponse,
        review_only: true,
        execution_ready: false,
        execution_blocked_reason: reason,
        execution_blocked_code: 'yield_asset_incompatible',
        setup_required: false,
      };
    }
    const reviewWithVaultAsset = {
      ...reviewResponse,
      vault: {
        ...reviewResponse.vault,
        vault_asset: compatibility.info,
        hardcoded_asset_override: Boolean(compatibility.hardcoded_asset_override),
        requires_wallet_asset_conversion: Boolean(compatibility.requires_wallet_asset_conversion),
        wallet_source_asset: sourceAsset,
        ...(compatibility.vault_deposit_asset ? { vault_deposit_asset: compatibility.vault_deposit_asset } : {}),
      },
    };
    const depositReadiness = await this.getDefindexDepositAssetReadiness({
      requestId: defindexRequestId(input),
      context,
      action,
      amount,
      walletSourceAsset: sourceAsset,
      vault,
      compatibility,
    });
    if (depositReadiness.requiresConversion && depositReadiness.executionBlockedCode) {
      logDefindex('warn', 'prepare_vault_asset_conversion_blocked', {
        request_id: defindexRequestId(input),
        session_id: maskLogValue(context.sessionId),
        user_id: maskLogValue(context.userId),
        public_key: maskLogValue(context.publicKey),
        action,
        amount,
        amount_units: amountUnits,
        asset_code: vault.asset_code,
        vault_address: maskLogValue(vault.vault_address),
        network: vault.network,
        blocked_code: depositReadiness.executionBlockedCode,
      });
      return {
        ...reviewWithVaultAsset,
        review_only: true,
        execution_ready: false,
        execution_blocked_reason: depositReadiness.executionBlockedReason,
        execution_blocked_code: depositReadiness.executionBlockedCode,
        setup_required: Boolean(depositReadiness.setupRequired),
        conversion_required: true,
        ...(depositReadiness.trustline ? { trustline: depositReadiness.trustline } : {}),
        ...(depositReadiness.conversionQuote ? { asset_conversion: depositReadiness.conversionQuote } : {}),
      };
    }
    if (depositReadiness.requiresConversion && depositReadiness.conversionReady) {
      logDefindex('info', 'prepare_vault_asset_conversion_ready', {
        request_id: defindexRequestId(input),
        session_id: maskLogValue(context.sessionId),
        user_id: maskLogValue(context.userId),
        public_key: maskLogValue(context.publicKey),
        action,
        amount,
        amount_units: amountUnits,
        asset_code: vault.asset_code,
        vault_address: maskLogValue(vault.vault_address),
        network: vault.network,
      });
      return {
        ...reviewWithVaultAsset,
        review_only: false,
        execution_ready: true,
        conversion_required: true,
        ...(depositReadiness.trustline ? { trustline: depositReadiness.trustline } : {}),
        ...(depositReadiness.conversionQuote ? { asset_conversion: depositReadiness.conversionQuote } : {}),
      };
    }
    const directDepositReadiness = await this.getDefindexDirectDepositReadiness({
      requestId: defindexRequestId(input),
      context,
      action,
      amount,
      sourceAsset,
      vault,
    });
    if (directDepositReadiness.executionBlockedCode) {
      return {
        ...reviewWithVaultAsset,
        review_only: true,
        execution_ready: false,
        execution_blocked_reason: directDepositReadiness.executionBlockedReason,
        execution_blocked_code: directDepositReadiness.executionBlockedCode,
        setup_required: false,
        asset_conversion: {
          conversion_mode: 'direct_deposit_balance_check',
          source_asset: sourceAsset,
          requested_amount: amount,
          source_available: directDepositReadiness.sourceAvailable,
          source_total: directDepositReadiness.sourceTotal,
          reserved: directDepositReadiness.reserved,
        },
      };
    }
    let prepared: { xdr: string; raw: any };
    try {
      const built = await this.buildDefindexVaultAction({
        action,
        vault,
        publicKey: context.publicKey,
        amount,
        invest: input.invest !== false,
        slippageBps: Number.isFinite(slippageBps) ? slippageBps : 100,
      });
      prepared = built.prepared;
    } catch (error) {
      const classified = classifyDefindexBuildFailure(error);
      const hasVerifiedInsufficientBalance =
        classified.code === 'insufficient_balance' &&
        directDepositReadiness.checked &&
        directDepositReadiness.sufficient === false;
      const block = classified.code === 'insufficient_balance' && !hasVerifiedInsufficientBalance
        ? {
            code: 'yield_execution_unavailable' as const,
            reason: 'Aplicação preparada, mas a confirmação de investimento está indisponível agora. Tente novamente em alguns segundos.',
            setupRequired: false,
          }
        : classified;
      logDefindex('warn', 'prepare_build_failed', {
        request_id: defindexRequestId(input),
        session_id: maskLogValue(context.sessionId),
        user_id: maskLogValue(context.userId),
        public_key: maskLogValue(context.publicKey),
        action,
        amount,
        amount_units: amountUnits,
        asset_code: vault.asset_code,
        vault_address: maskLogValue(vault.vault_address),
        network: vault.network,
        slippage_bps: Number.isFinite(slippageBps) ? slippageBps : 100,
        blocked_code: block.code,
        setup_required: block.setupRequired,
        direct_balance_checked: directDepositReadiness.checked,
        direct_balance_sufficient: directDepositReadiness.sufficient,
        ...defindexErrorFields(error),
      });
      return {
        ...reviewWithVaultAsset,
        review_only: true,
        execution_ready: false,
        execution_blocked_reason: block.reason,
        execution_blocked_code: block.code,
        setup_required: block.setupRequired,
      };
    }
    logDefindex('info', 'prepare_success', {
      request_id: defindexRequestId(input),
      session_id: maskLogValue(context.sessionId),
      user_id: maskLogValue(context.userId),
      public_key: maskLogValue(context.publicKey),
      action,
      amount,
      amount_units: amountUnits,
      asset_code: vault.asset_code,
      vault_address: maskLogValue(vault.vault_address),
      network: vault.network,
      has_xdr: Boolean(prepared.xdr),
    });
    return {
      ...reviewWithVaultAsset,
      review_only: false,
      execution_ready: true,
      ...(depositReadiness.requiresConversion ? { conversion_required: false } : {}),
      xdr: prepared.xdr,
      raw: prepared.raw,
    };
  }

  static async executeDefindexYieldForSession(input: RampSessionInput & {
    action?: string;
    amount?: string;
    asset_code?: string;
    assetCode?: string;
    source_asset_code?: string;
    sourceAssetCode?: string;
    source_asset_issuer?: string;
    sourceAssetIssuer?: string;
    vault_address?: string;
    vaultAddress?: string;
    invest?: boolean;
    slippage_bps?: string | number;
    slippageBps?: string | number;
    unsigned_xdr?: string;
    unsignedXdr?: string;
    network?: string;
  }): Promise<{
    success: boolean;
    submitted: boolean;
    public_key: string;
    action: DefindexYieldAction;
    amount: string;
    amount_units: number;
    vault: Record<string, unknown>;
    hash?: string;
    raw?: unknown;
  }> {
    const networkOverride = coalesceString(input.network) || undefined;
    const runtime = DefindexYieldService.getRuntimeInfo(networkOverride);
    logDefindex('info', 'execute_start', {
      request_id: defindexRequestId(input),
      action: String(input.action || 'deposit').trim().toLowerCase() === 'withdraw' ? 'withdraw' : 'deposit',
      amount: coalesceString(input.amount),
      asset_code: coalesceString(input.asset_code, input.assetCode, 'USDC'),
      requested_vault: maskLogValue(coalesceString(input.vault_address, input.vaultAddress)),
      network: runtime.network,
      execution_enabled: runtime.execution_enabled,
      execution_requested: runtime.execution_requested,
      compliance_approved: runtime.compliance_approved,
      has_pin: Boolean(coalesceString(input.pin, input.wallet_pin, input.walletPin, input.wallet_code, input.walletCode, input.passcode)),
      has_unsigned_xdr: Boolean(coalesceString(input.unsigned_xdr, input.unsignedXdr)),
    });
    if (!runtime.execution_enabled) {
      logDefindex('warn', 'execute_blocked', {
        request_id: defindexRequestId(input),
        network: runtime.network,
        execution_requested: runtime.execution_requested,
        compliance_approved: runtime.compliance_approved,
        blocked_reason: runtime.execution_blocked_reason,
      });
      throw apiError(
        runtime.execution_blocked_reason ||
          'Confirmação de aplicação desativada neste ambiente.',
        403,
        'yield_execution_disabled',
      );
    }
    const context = await this.resolveSessionWallet(input);
    const walletPin = this.requireWalletPin(input, context);
    if (!walletPin) throw apiError('PIN da conta é obrigatório para confirmar esta operação.', 400, 'missing_pin');
    if (!context.vaultSecretId) {
      logDefindex('warn', 'execute_missing_signing_material', {
        request_id: defindexRequestId(input),
        session_id: maskLogValue(context.sessionId),
        user_id: maskLogValue(context.userId),
        public_key: maskLogValue(context.publicKey),
      });
      throw apiError('Esta conta ainda não está pronta para assinar esta operação.', 409, 'account_signing_unavailable');
    }
    let prepared = await this.prepareDefindexYieldForSession(input);
    const action = prepared.action;
    let amount = prepared.amount;
    let amountUnits = prepared.amount_units;
    const vault = DefindexYieldService.requireVault(
      coalesceString(input.asset_code, input.assetCode),
      coalesceString(input.vault_address, input.vaultAddress),
      networkOverride,
    );
    let secret: string | undefined;
    const readSigningSecret = async (): Promise<string> => {
      if (secret) return secret;
      try {
        secret = await new VaultService(supabase).getSecret(context.vaultSecretId!);
      } catch (error) {
        logDefindex('warn', 'execute_secret_read_failed', {
          request_id: defindexRequestId(input),
          session_id: maskLogValue(context.sessionId),
          user_id: maskLogValue(context.userId),
          public_key: maskLogValue(context.publicKey),
          vault_secret_id: maskLogValue(context.vaultSecretId),
          ...defindexErrorFields(error),
        });
        throw apiError('Esta conta ainda não está pronta para assinar esta operação.', 409, 'account_signing_unavailable');
      }
      if (!/^S[A-Z2-7]{55}$/.test(secret)) {
        logDefindex('warn', 'execute_secret_invalid_format', {
          request_id: defindexRequestId(input),
          session_id: maskLogValue(context.sessionId),
          user_id: maskLogValue(context.userId),
          public_key: maskLogValue(context.publicKey),
          vault_secret_id: maskLogValue(context.vaultSecretId),
        });
        throw apiError('Esta conta ainda não está pronta para assinar esta operação.', 409, 'account_signing_unavailable');
      }
      return secret;
    };
    if ((prepared as any).conversion_required && prepared.execution_ready && !prepared.xdr) {
      const conversion = (prepared as any).asset_conversion || {};
      const sourceAsset = conversion.source_asset;
      const destinationAsset = conversion.destination_asset;
      const destinationAmount = coalesceString(conversion.destination_amount);
      const sourceAmount = coalesceString(conversion.source_amount, amount);
      const sourceMax = coalesceString(conversion.source_max, conversion.path_source_max);
      const destinationMin = coalesceString(conversion.destination_min);
      if (!sourceAsset || !destinationAsset || !destinationAmount || (!destinationMin && !sourceMax)) {
        throw apiError('A confirmação precisa ser preparada novamente.', 409, 'review_not_prepared');
      }
      const unsafeRatio = unsafeSameSymbolConversionRatio({
        sourceAsset,
        destinationAsset,
        sourceAmount,
        destinationAmount,
      });
      if (unsafeRatio !== null) {
        logDefindex('warn', 'execute_vault_asset_conversion_unsafe', {
          request_id: defindexRequestId(input),
          session_id: maskLogValue(context.sessionId),
          user_id: maskLogValue(context.userId),
          public_key: maskLogValue(context.publicKey),
          action,
          amount,
          asset_code: vault.asset_code,
          vault_address: maskLogValue(vault.vault_address),
          source_amount: sourceAmount,
          destination_amount: destinationAmount,
          same_symbol_ratio: unsafeRatio,
        });
        throw apiError(
          'A conversão automática entre duas emissões desta moeda está distorcida neste testnet. A confirmação foi bloqueada para evitar perda de valor.',
          409,
          'yield_asset_conversion_unavailable',
        );
      }
      const signingSecret = await readSigningSecret();
      logDefindex('info', 'execute_vault_asset_conversion_start', {
        request_id: defindexRequestId(input),
        session_id: maskLogValue(context.sessionId),
        user_id: maskLogValue(context.userId),
        public_key: maskLogValue(context.publicKey),
        action,
        amount,
        asset_code: vault.asset_code,
        vault_address: maskLogValue(vault.vault_address),
        conversion_mode: coalesceString(conversion.conversion_mode, 'strict_receive'),
        source_amount: sourceAmount,
        destination_amount: destinationAmount,
        destination_min: destinationMin,
        source_max: sourceMax,
      });
      const converted = destinationMin
        ? await StellarService.submitStrictSendPaymentFromSecret({
            sourceSecret: signingSecret,
            destination: context.publicKey,
            sourceAsset,
            sourceAmount,
            destinationAsset,
            memoText: 'TTS DEF',
          })
        : await StellarService.submitStrictReceivePaymentFromSecret({
            sourceSecret: signingSecret,
            destination: context.publicKey,
            sourceAsset,
            destinationAsset,
            destinationAmount,
            sourceMax,
            memoText: 'TTS DEF',
          });
      if (!converted.success) {
        logDefindex('warn', 'execute_vault_asset_conversion_failed', {
          request_id: defindexRequestId(input),
          session_id: maskLogValue(context.sessionId),
          user_id: maskLogValue(context.userId),
          public_key: maskLogValue(context.publicKey),
          action,
          amount,
          asset_code: vault.asset_code,
          vault_address: maskLogValue(vault.vault_address),
          error: converted.error,
        });
        throw apiError('Não foi possível converter o saldo para a moeda usada nesta aplicação agora. Tente novamente mais tarde.', 409, 'yield_asset_conversion_unavailable');
      }
      logDefindex('info', 'execute_vault_asset_conversion_success', {
        request_id: defindexRequestId(input),
        session_id: maskLogValue(context.sessionId),
        user_id: maskLogValue(context.userId),
        public_key: maskLogValue(context.publicKey),
        action,
        amount,
        asset_code: vault.asset_code,
        vault_address: maskLogValue(vault.vault_address),
        hash: maskLogValue(converted.hash, 10, 8),
        source_amount: (converted as any).sourceAmount || sourceAmount,
        destination_amount: (converted as any).destinationAmount || destinationAmount,
      });
      await sleep(Math.max(250, Number(process.env.DEFINDEX_CONVERSION_SETTLE_MS || 1500)));
      const convertedVaultAmount = normalizeAmount((converted as any).destinationAmount || destinationAmount, 'amount');
      const builtAfterConversion = await this.buildDefindexVaultAction({
        action,
        vault,
        publicKey: context.publicKey,
        amount: convertedVaultAmount,
        invest: input.invest !== false,
        slippageBps: Number(coalesceString(input.slippage_bps, input.slippageBps, 100)),
      });
      amount = builtAfterConversion.amount;
      amountUnits = builtAfterConversion.amountUnits;
      prepared = {
        ...prepared,
        amount,
        amount_units: amountUnits,
        xdr: builtAfterConversion.prepared.xdr,
        raw: builtAfterConversion.prepared.raw,
      };
    }
    if (!prepared.execution_ready || !prepared.xdr) {
      const blockedCode = coalesceString((prepared as any).execution_blocked_code, 'yield_execution_unavailable');
      const blockedReason = coalesceString(
        prepared.execution_blocked_reason,
        'A confirmação por PIN ainda não está disponível para esta aplicação.',
      );
      logDefindex('warn', 'execute_review_not_ready', {
        request_id: defindexRequestId(input),
        session_id: maskLogValue(context.sessionId),
        user_id: maskLogValue(context.userId),
        public_key: maskLogValue(context.publicKey),
        action,
        amount,
        amount_units: amountUnits,
        asset_code: vault.asset_code,
        vault_address: maskLogValue(vault.vault_address),
        network: vault.network,
        execution_ready: prepared.execution_ready,
        blocked_code: blockedCode,
        setup_required: (prepared as any).setup_required,
      });
      throw apiError(blockedReason, 409, blockedCode);
    }
    const signingSecret = await readSigningSecret();

    let signedXdr: string;
    try {
      signedXdr = DefindexYieldService.signXdr(prepared.xdr, signingSecret);
    } catch (error) {
      logDefindex('warn', 'execute_sign_failed', {
        request_id: defindexRequestId(input),
        session_id: maskLogValue(context.sessionId),
        user_id: maskLogValue(context.userId),
        public_key: maskLogValue(context.publicKey),
        action,
        amount,
        amount_units: amountUnits,
        asset_code: vault.asset_code,
        vault_address: maskLogValue(vault.vault_address),
        network: vault.network,
        ...defindexErrorFields(error),
      });
      throw apiError('A confirmação não está pronta. Prepare a operação novamente antes de confirmar.', 409, 'review_not_prepared');
    }

    let sent: { hash: string; raw: any };
    try {
      logDefindex('info', 'execute_submit_start', {
        request_id: defindexRequestId(input),
        session_id: maskLogValue(context.sessionId),
        user_id: maskLogValue(context.userId),
        public_key: maskLogValue(context.publicKey),
        action,
        amount,
        amount_units: amountUnits,
        asset_code: vault.asset_code,
        vault_address: maskLogValue(vault.vault_address),
        network: vault.network,
      });
      sent = await DefindexYieldService.sendVaultTransaction({
        vaultAddress: vault.vault_address,
        signedXdr,
        network: vault.network,
      });
    } catch (error) {
      logDefindex('warn', 'execute_submit_failed', {
        request_id: defindexRequestId(input),
        session_id: maskLogValue(context.sessionId),
        user_id: maskLogValue(context.userId),
        public_key: maskLogValue(context.publicKey),
        action,
        amount,
        amount_units: amountUnits,
        asset_code: vault.asset_code,
        vault_address: maskLogValue(vault.vault_address),
        network: vault.network,
        ...defindexErrorFields(error),
      });
      throw apiError('Falha de envio da transação externa.', 502, 'execution_unavailable');
    }
    logDefindex('info', 'execute_submit_success', {
      request_id: defindexRequestId(input),
      session_id: maskLogValue(context.sessionId),
      user_id: maskLogValue(context.userId),
      public_key: maskLogValue(context.publicKey),
      action,
      amount,
      amount_units: amountUnits,
      asset_code: vault.asset_code,
      vault_address: maskLogValue(vault.vault_address),
      network: vault.network,
      hash: maskLogValue(sent.hash, 10, 8),
    });
    await OperationRepository.create({
      user_id: context.userId,
      type: `DEFINDEX_YIELD_${action.toUpperCase()}`,
      status: 'COMPLETED',
      amount: Number(amount),
      asset_code: vault.asset_code,
      stellar_transaction_hash: sent.hash || undefined,
      source_public_key: context.publicKey,
      source_session_id: context.sessionId,
      context: JSON.stringify({
        provider: 'defindex',
        action,
        amount,
        amount_units: amountUnits,
        vault_address: vault.vault_address,
        vault_asset_code: vault.asset_code,
        vault_asset_issuer: vault.asset_issuer,
        network: vault.network,
        raw_result: sent.raw,
      }),
    } as any).catch((error) => {
      logDefindex('warn', 'execute_operation_persist_failed', {
        request_id: defindexRequestId(input),
        session_id: maskLogValue(context.sessionId),
        user_id: maskLogValue(context.userId),
        public_key: maskLogValue(context.publicKey),
        action,
        amount,
        amount_units: amountUnits,
        asset_code: vault.asset_code,
        vault_address: maskLogValue(vault.vault_address),
        network: vault.network,
        hash: maskLogValue(sent.hash, 10, 8),
        ...defindexErrorFields(error),
      });
      return null;
    });
    return {
      success: true,
      submitted: true,
      public_key: context.publicKey,
      action,
      amount,
      amount_units: amountUnits,
      vault: {
        ...vault,
        display_asset_code: userFacingAssetCode(vault.asset_code),
      },
      hash: sent.hash || undefined,
      raw: sent.raw,
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
    desired_final_amount?: string;
    desiredFinalAmount?: string;
    desired_final_asset?: string;
    desiredFinalAsset?: string;
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
      throw apiError('This PIX shortcut is unavailable in the current payment mode.', 403);
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
      intent_id: normalizeRampIntentId(input),
      customer_id: customerResult.customer.id,
      quote_id: quoteResult.quote.id,
      amount,
      expected_to_amount: quoteResult.quote.toAmount,
      to_currency: quoteResult.quote.toCurrency,
      final_asset: assetIdentifier(finalAsset),
      desired_final_amount: coalesceString(input.desired_final_amount, input.desiredFinalAmount) || undefined,
      desired_final_asset: coalesceString(input.desired_final_asset, input.desiredFinalAsset, finalAsset.code) || undefined,
      bank_account_id: customerResult.customer.bankAccountId,
    });

    const simulation = await this.simulateFiatReceivedForSession({
      session_id: context.sessionId,
      session_token: context.sessionToken,
      order_id: orderResult.transaction.id,
      trusted_internal: true,
    });

    let finalTransaction: OnRampTransaction | undefined = orderResult.transaction;
    for (let attempt = 0; attempt < 6; attempt += 1) {
      await sleep(1500);
      const statusResult = await this.getOnRampStatus({
        session_id: context.sessionId,
        session_token: context.sessionToken,
        order_id: orderResult.transaction.id,
        operation_id: orderResult.operation_id,
      });
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
    amount_currency?: string;
    amountCurrency?: string;
    asset_code?: string;
    assetCode?: string;
    source_asset_code?: string;
    sourceAssetCode?: string;
    source_amount?: string;
    sourceAmount?: string;
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
    destination_pix_key?: string;
    destinationPixKey?: string;
    pix_key?: string;
    pixKey?: string;
    pix_key_type?: string;
    pixKeyType?: string;
    external_bank_account?: Record<string, unknown>;
    externalBankAccount?: Record<string, unknown>;
  }): Promise<{
    success: boolean;
    temporary: true;
    sandbox: boolean;
    ready_to_sign: boolean;
    submitted: boolean;
    wallet_public_key: string;
    amount_tesouro: string;
    source_amount: string;
    source_asset_code: string;
    source_asset_issuer?: string;
    target_brl?: string;
    destination_amount?: string;
    destination_asset_code?: string;
    receipt_url?: string;
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
      throw apiError('This PIX withdrawal shortcut is unavailable in the current payment mode.', 403);
    }

    const context = await this.resolveSessionWallet(input);
    const walletPin = this.requireWalletPin(input, context);
    const sourceAsset = normalizeRampUserAsset(
      input.source_asset_code,
      input.sourceAssetCode,
      input.asset_code,
      input.assetCode,
      input.amount_currency,
      input.amountCurrency,
      'BRL',
    );
    const requestedTargetBrl = coalesceString(
      input.fiat_amount,
      input.fiatAmount,
      input.target_brl,
      input.targetBrl,
      input.to_amount,
      input.toAmount,
    );
    const sourcePlan = await this.resolveOffRampSourceForTarget({
      publicKey: context.publicKey,
      sourceAsset,
      requestedSourceAmount: coalesceString(
        input.source_amount,
        input.sourceAmount,
        requestedTargetBrl ? '' : input.amount,
      ),
      requestedTargetBrl,
    });
    const requestedSourceAmount = sourcePlan.sourceAmount;
    let amount = requestedSourceAmount;
    const targetBrl = sourcePlan.targetBrl;
    const beforeRaw = await StellarService.getAccountBalance(context.publicKey);
    const balancesBefore = normalizeBalances(beforeRaw);
    assertSufficientBalance(balancesBefore, sourceAsset, requestedSourceAmount);
    const rawExternalBankAccount = input.external_bank_account || input.externalBankAccount;
    const pixDestination = pixDestinationFromRampInput(input as Record<string, unknown>, rawExternalBankAccount);
    const externalBankAccount = pixDestination.externalBankAccount;
    const hasDynamicPixDestination = Boolean(pixDestination.pixKey);

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
    if (!fiatAccountId && !hasDynamicPixDestination) {
      const accounts = await this.getEtherfuseClient().getFiatAccounts(customerResult.customer.id);
      fiatAccountId = accounts[0]?.id || '';
    }
    if (!fiatAccountId && !hasDynamicPixDestination && !this.sandboxPixFallbackEnabled()) {
      throw apiError('Nenhuma conta PIX de retirada foi encontrada para esta operação. Configure a chave PIX da conta e tente novamente.', 409);
    }

    if (targetBrl) {
      amount = isBrlSettlementAsset(sourceAsset)
        ? requestedSourceAmount
        : toStellarAmount(Number(targetBrl));
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
    const orderResult = await this.createOffRampForSession({
      session_id: context.sessionId,
      session_token: context.sessionToken,
      intent_id: normalizeRampIntentId(input),
      customer_id: customerResult.customer.id,
      quote_id: quoteResult.quote.id,
      amount,
      source_amount: requestedSourceAmount,
      source_asset_code: sourceAsset.code,
      source_asset_issuer: sourceAsset.issuer,
      target_brl: targetBrl,
      destination_pix_key: pixDestination.pixKey || undefined,
      pix_key_type: pixDestination.pixKey ? pixDestination.pixKeyType : undefined,
      fiat_account_id: fiatAccountId || undefined,
      external_bank_account: externalBankAccount,
      force_sandbox_mock: true,
    });

    let statusResult = await this.getOffRampStatus({
      session_id: context.sessionId,
      session_token: context.sessionToken,
      order_id: orderResult.transaction.id,
      operation_id: orderResult.operation_id,
    });
    for (let attempt = 0; attempt < 6 && !statusResult.ready_to_sign; attempt += 1) {
      await sleep(1500);
      statusResult = await this.getOffRampStatus({
        session_id: context.sessionId,
        session_token: context.sessionToken,
        order_id: orderResult.transaction.id,
        operation_id: orderResult.operation_id,
      });
    }

    let submitResult: { success: boolean; hash?: string; error?: string; order_id: string } | undefined;
    let finalTransaction = statusResult.transaction;
    if (!statusResult.ready_to_sign) {
      throw apiError('A retirada PIX ainda não está pronta para confirmar. Tente novamente em alguns segundos.', 409);
    }
    if (statusResult.ready_to_sign) {
      submitResult = await this.submitOffRampForSession({
        session_id: context.sessionId,
        session_token: context.sessionToken,
        order_id: orderResult.transaction.id,
        operation_id: orderResult.operation_id,
        external_bank_account: externalBankAccount,
        pin: walletPin,
        wallet_pin: walletPin,
        skip_receipt: true,
      });
      if (!submitResult.success) {
        throw apiError(submitResult.error || 'Não consegui concluir a retirada PIX agora. Tente novamente em alguns segundos.', 409);
      }

      for (let attempt = 0; attempt < 6; attempt += 1) {
        await sleep(1500);
        const nextStatus = await this.getOffRampStatus({
          session_id: context.sessionId,
          session_token: context.sessionToken,
          order_id: orderResult.transaction.id,
          operation_id: orderResult.operation_id,
        });
        finalTransaction = nextStatus.transaction;
        if (isTerminalRampStatus(finalTransaction.status)) {
          break;
        }
      }
    }
    if (isFailedRampStatus(finalTransaction?.status || '')) {
      throw apiError('A retirada PIX falhou antes de confirmar o débito. Gere uma nova estimativa e tente novamente.', 409);
    }

    const afterRaw = await StellarService.getAccountBalance(context.publicKey);
    const balancesAfter = normalizeBalances(afterRaw);
    const destinationAmount = targetBrl || coalesceString(quoteResult.quote.toAmount, sourcePlan.estimatedTargetBrl, requestedSourceAmount);
    const destinationAssetCode = 'BRL';
    const receiptQuote: Record<string, unknown> = {
      ...(quoteResult.quote as unknown as Record<string, unknown>),
      direction: 'offramp',
      source_amount: requestedSourceAmount,
      sourceAmount: requestedSourceAmount,
      source_asset_code: sourceAsset.code,
      target_brl: destinationAmount,
      destination_amount: destinationAmount,
      destinationAssetCode,
    };
    if (targetBrl && isBrlSettlementAsset(sourceAsset)) {
      const brlFeeBridge = this.estimateOnRampBrlFeeBridge(requestedSourceAmount, null, targetBrl);
      receiptQuote.anchorProviderFeeAmount = brlFeeBridge.providerFeeAmount;
      receiptQuote.anchor_provider_fee_amount = brlFeeBridge.providerFeeAmount;
      receiptQuote.talkToStellarFeeAmount = brlFeeBridge.talkToStellarFeeAmount;
      receiptQuote.talktostellar_transaction_fee_amount = brlFeeBridge.talkToStellarFeeAmount;
      receiptQuote.totalFeeAmount = brlFeeBridge.totalFeeAmount;
      receiptQuote.total_fee_amount = brlFeeBridge.totalFeeAmount;
      receiptQuote.total_fee_brl = brlFeeBridge.totalFeeAmount;
    }
    const receiptFee = receiptBrlFeeFromContext(
      receiptQuote,
      requestedSourceAmount,
      destinationAmount,
    );
    const externalBank = (externalBankAccount || {}) as Record<string, unknown>;
    const bankLabel = coalesceString(
      externalBank.label,
      externalBank.institution,
      'Seu PIX',
    );
    let receiptUrl = '';
    if (submitResult?.success) {
      try {
        receiptUrl = await PaymentReceiptService.sendReceipt({
          type: 'payment_sent',
          sessionId: context.sessionId,
          userId: context.userId,
          provider: externalChannelProvider(input) || undefined,
          providerUserId: externalChannelProviderUserId(input) || undefined,
          counterpartyLabel: bankLabel,
          sourceAmount: requestedSourceAmount,
          sourceAssetCode: sourceAsset.code,
          destinationAmount,
          destinationAssetCode,
          hash: submitResult.hash || orderResult.transaction.id,
          status: 'completed',
          contextMessage: 'PIX enviado à chave.',
          feeDisplay: receiptFee.feeDisplay || null,
          feeBrl: receiptFee.feeBrl || null,
          quote: receiptQuote,
        });
        if (receiptUrl && orderResult.operation_id) {
          const operation = await OperationRepository.findById(orderResult.operation_id).catch(() => null);
          const previousContext = parseOperationContext(operation?.context);
          await OperationRepository.update(orderResult.operation_id, {
            context: JSON.stringify({
              ...previousContext,
              receipt_url: receiptUrl,
              submit_hash: submitResult.hash || '',
              destination_amount: destinationAmount,
              destination_asset_code: destinationAssetCode,
            }),
          } as any).catch((error) => {
            console.warn('[ramp] Could not persist PIX off-ramp receipt URL:', debugErrorMessage(error));
          });
        }
      } catch (error) {
        console.warn('[ramp] Could not send PIX off-ramp receipt:', debugErrorMessage(error));
      }
    }

    return {
      success: true,
      temporary: true,
      sandbox: true,
      ready_to_sign: statusResult.ready_to_sign,
      submitted: Boolean(submitResult?.success),
      wallet_public_key: context.publicKey,
      amount_tesouro: amount,
      source_amount: requestedSourceAmount,
      source_asset_code: sourceAsset.code,
      source_asset_issuer: sourceAsset.issuer,
      target_brl: destinationAmount,
      destination_amount: destinationAmount,
      destination_asset_code: destinationAssetCode,
      ...(receiptUrl ? { receipt_url: receiptUrl } : {}),
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

  private static async resolveTransferRecipientReference(reference: string, options: {
    displayName?: string;
    pixKey?: string;
  } = {}): Promise<{
    publicKey: string;
    displayName: string;
    pixKey?: string;
    recipientKey?: string;
    sessionId?: string;
    userId?: string;
    vaultSecretId?: string;
  } | null> {
    const rawReference = coalesceString(reference);
    if (!rawReference) return null;

    const displayName = coalesceString(options.displayName) || rawReference;
    const fallbackPixKey = coalesceString(options.pixKey) || rawReference;
    const normalizedReference = rawReference.trim().toLowerCase();
    const emailReference = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedReference) ? normalizedReference : '';
    const numericReference = rawReference.replace(/\D+/g, '');
    const isValidPublicKey = (value: unknown) => /^G[A-Z2-7]{55}$/i.test(coalesceString(value));
    const walletRepository = new WalletRepository(supabase);

    const buildRecipient = async (publicKey: string, details: {
      name?: string;
      pixKey?: string;
      sessionId?: string;
      userId?: string;
      vaultSecretId?: string;
    } = {}) => {
      if (!isValidPublicKey(publicKey)) return null;
      const wallet = await walletRepository.getWalletByPublicKey(publicKey).catch(() => null);
      return {
        publicKey,
        displayName: coalesceString(details.name) || displayName,
        pixKey: coalesceString(details.pixKey, fallbackPixKey) || undefined,
        recipientKey: coalesceString(details.pixKey, fallbackPixKey) || undefined,
        sessionId: coalesceString(details.sessionId, wallet?.session_id) || undefined,
        userId: coalesceString(details.userId, (wallet as any)?.user_id) || undefined,
        vaultSecretId: coalesceString(details.vaultSecretId, wallet?.vault_secret_id) || undefined,
      };
    };

    if (isValidPublicKey(rawReference)) {
      return buildRecipient(rawReference, { pixKey: fallbackPixKey });
    }

    try {
      const { data: walletByPix, error } = await supabase
        .from('wallets')
        .select('*')
        .ilike('pix_key', normalizedReference)
        .limit(1)
        .maybeSingle();

      if (!error && isValidPublicKey(walletByPix?.public_key)) {
        return buildRecipient(String(walletByPix.public_key), {
          name: coalesceString(walletByPix.name, displayName),
          pixKey: coalesceString(walletByPix.pix_key, fallbackPixKey),
          sessionId: coalesceString(walletByPix.session_id),
          userId: coalesceString((walletByPix as any).user_id),
          vaultSecretId: coalesceString(walletByPix.vault_secret_id),
        });
      }
    } catch {
      // Optional account-reference lookup. Contact resolution still has explicit
      // saved-contact/public-key fallbacks below.
    }

    const sessionRows: any[] = [];
    const sessionLookups = [
      ...(emailReference ? [
        { column: 'email', value: emailReference, ilike: false },
        { column: 'user_id', value: emailReference, ilike: false },
      ] : []),
      ...(numericReference.length >= 8 ? [
        { column: 'phone_number', value: `%${numericReference.slice(-11)}%`, ilike: true },
        { column: 'phone_number', value: `%${numericReference.slice(-10)}%`, ilike: true },
      ] : []),
    ];

    for (const lookup of sessionLookups) {
      try {
        let query = supabase
          .from('agent_sessions')
          .select('session_id, user_id, email, phone_number');
        query = lookup.ilike
          ? query.ilike(lookup.column, lookup.value)
          : query.eq(lookup.column, lookup.value);
        const { data, error } = await query
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (!error && data) sessionRows.push(data);
      } catch {
        // Ignore optional lookup failures and continue with other identifiers.
      }
    }

    for (const row of sessionRows) {
      const sessionId = coalesceString(row?.session_id);
      if (!sessionId) continue;
      const wallet = await walletRepository.getWalletBySession(sessionId).catch(() => null);
      if (!wallet?.public_key) continue;
      return buildRecipient(wallet.public_key, {
        name: coalesceString((wallet as any).name, displayName, row?.email, row?.user_id),
        pixKey: coalesceString((wallet as any).pix_key, fallbackPixKey),
        sessionId,
        userId: coalesceString(row?.user_id),
        vaultSecretId: coalesceString(wallet.vault_secret_id),
      });
    }

    if (emailReference) {
      try {
        const { data: userByEmail, error } = await supabase
          .from('users')
          .select('id, email, stellar_public_key')
          .ilike('email', emailReference)
          .limit(1)
          .maybeSingle();

        if (!error && isValidPublicKey((userByEmail as any)?.stellar_public_key)) {
          return buildRecipient(String((userByEmail as any).stellar_public_key), {
            name: coalesceString(displayName, (userByEmail as any).email),
            pixKey: fallbackPixKey,
            userId: coalesceString((userByEmail as any).id),
          });
        }
      } catch {
        // Continue to external-account lookup.
      }
    }

    try {
      const { data: mappings, error } = await supabase
        .from('external_accounts')
        .select('session_id, user_id, provider_user_id, data')
        .limit(200);

      if (!error) {
        for (const mapping of mappings || []) {
          const mappingUserId = coalesceString((mapping as any)?.user_id).toLowerCase();
          const mappingProviderUserId = coalesceString((mapping as any)?.provider_user_id).toLowerCase();
          const data = (mapping as any)?.data || {};
          const dataEmail = coalesceString(data?.email).toLowerCase();
          const dataPhone = coalesceString(data?.phone_number, data?.phone, data?.whatsapp).replace(/\D+/g, '');
          const emailMatches = Boolean(emailReference && [mappingUserId, dataEmail].includes(emailReference));
          const phoneMatches = Boolean(numericReference.length >= 8 && (
            mappingProviderUserId.replace(/\D+/g, '').endsWith(numericReference.slice(-8)) ||
            dataPhone.endsWith(numericReference.slice(-8))
          ));
          if (!emailMatches && !phoneMatches) continue;

          const sessionId = coalesceString((mapping as any)?.session_id);
          if (!sessionId) continue;
          const wallet = await walletRepository.getWalletBySession(sessionId).catch(() => null);
          if (!wallet?.public_key) continue;
          return buildRecipient(wallet.public_key, {
            name: coalesceString(data?.name, displayName, data?.email, (mapping as any)?.user_id),
            pixKey: fallbackPixKey,
            sessionId,
            userId: coalesceString((mapping as any)?.user_id),
            vaultSecretId: coalesceString(wallet.vault_secret_id),
          });
        }
      }
    } catch {
      // No external-account mapping available.
    }

    return null;
  }

  private static async resolveTransferRecipient(userId: string, recipientQuery: string, options: {
    preferredName?: string;
    preferredKey?: string;
    preferredPublicKey?: string;
  } = {}): Promise<{
    publicKey: string;
    displayName: string;
    pixKey?: string;
    recipientKey?: string;
    sessionId?: string;
    userId?: string;
    vaultSecretId?: string;
  }> {
    const query = coalesceString(recipientQuery);
    if (!query) throw apiError('recipient is required for PIX-funded transfer.', 400);
    const preferredName = coalesceString(options.preferredName);
    const preferredKey = coalesceString(options.preferredKey);
    const preferredPublicKey = coalesceString(options.preferredPublicKey);

    const normalizeLookup = (value: unknown) => String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\w\s@.+-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
    const normalizePhone = (value: unknown) => String(value || '').replace(/\D+/g, '');
    const normalizedQuery = normalizeLookup(query);
    const queryPhone = normalizePhone(query);
    const normalizedPreferredKey = normalizeLookup(preferredKey);
    const preferredKeyPhone = normalizePhone(preferredKey);
    const requestedPublicKey = /^G[A-Z2-7]{55}$/i.test(query) ? query : preferredPublicKey;
    const isValidPublicKey = (value: unknown) => /^G[A-Z2-7]{55}$/i.test(coalesceString(value));
    const contactDestinationPublicKey = (item: any) => coalesceString(
      item?.stellar_public_key,
      item?.public_key,
      item?.destination_public_key,
    );

    const contactsResult = await supabase
      .from('contacts')
      .select('id, contact_name, stellar_public_key, pix_key, phone_number')
      .eq('owner_id', userId);
    if (contactsResult.error) throw apiError(`Could not resolve transfer recipient: ${contactsResult.error.message}`, 500);

    const contacts = (contactsResult.data || []) as any[];
    const aliasMatch = query.toLowerCase().match(/^(?:contato|contact)\s*(\d{1,3})$/);
    let contact = requestedPublicKey
      ? contacts.find((item) => contactDestinationPublicKey(item) === requestedPublicKey)
      : null;

    if (!contact && aliasMatch) {
      const index = Number(aliasMatch[1]);
      if (Number.isFinite(index) && index >= 1 && index <= contacts.length) contact = contacts[index - 1];
    }

    if (!contact && (queryPhone.length >= 8 || preferredKeyPhone.length >= 8)) {
      contact = contacts.find((item) => {
        const phone = normalizePhone(item?.phone_number);
        const pixKey = normalizePhone(item?.pix_key);
        return Boolean(
          (queryPhone.length >= 8 && (phone === queryPhone || pixKey === queryPhone)) ||
          (preferredKeyPhone.length >= 8 && (phone === preferredKeyPhone || pixKey === preferredKeyPhone))
        );
      });
    }

    if (!contact) {
      contact = contacts.find((item) => {
        const normalizedName = normalizeLookup(item?.contact_name);
        if (normalizedName === normalizedQuery) return true;
        const normalizedPix = normalizeLookup(item?.pix_key);
        const normalizedPhone = normalizeLookup(item?.phone_number);
        return Boolean(
          (normalizedPix && normalizedPix === normalizedQuery) ||
          (normalizedPreferredKey && normalizedPix && normalizedPix === normalizedPreferredKey) ||
          (normalizedPreferredKey && normalizedPhone && normalizedPhone === normalizedPreferredKey)
        );
      });
    }

    if (!contact && isValidPublicKey(requestedPublicKey)) {
      const walletRepository = new WalletRepository(supabase);
      const destinationWallet = await walletRepository.getWalletByPublicKey(requestedPublicKey).catch(() => null);
      return {
        publicKey: requestedPublicKey,
        displayName: preferredName || (/^G[A-Z2-7]{55}$/i.test(query) ? `Contato ${requestedPublicKey.slice(0, 6)}` : query),
        pixKey: preferredKey || undefined,
        recipientKey: preferredKey || undefined,
        sessionId: coalesceString(destinationWallet?.session_id) || undefined,
        userId: coalesceString((destinationWallet as any)?.user_id) || undefined,
        vaultSecretId: coalesceString(destinationWallet?.vault_secret_id) || undefined,
      };
    }

    if (!contact) {
      const directReferenceCandidates = Array.from(new Set([
        preferredKey,
        preferredPublicKey,
        query,
      ].map((value) => coalesceString(value)).filter(Boolean)));

      for (const reference of directReferenceCandidates) {
        const resolvedByReference = await this.resolveTransferRecipientReference(reference, {
          displayName: preferredName || query,
          pixKey: preferredKey || query,
        });
        if (resolvedByReference?.publicKey) return resolvedByReference;
      }

      throw apiError(`Recipient "${query}" was not found as an active TalkToStellar account. Ask them to finish signup or check the phone, email, or key before creating a PIX-funded transfer.`, 404);
    }

    const contactPublicKey = contactDestinationPublicKey(contact);
    if (preferredPublicKey && contactPublicKey && contactPublicKey !== preferredPublicKey) {
      throw apiError('Recipient data does not match the saved contact. Open contacts and choose the recipient again.', 409);
    }
    const effectivePublicKey = contactPublicKey || preferredPublicKey;
    if (isValidPublicKey(effectivePublicKey)) {
      const walletRepository = new WalletRepository(supabase);
      const destinationWallet = await walletRepository.getWalletByPublicKey(effectivePublicKey).catch(() => null);
      return {
        publicKey: effectivePublicKey,
        displayName: coalesceString(contact?.contact_name) || query,
        pixKey: coalesceString(contact?.pix_key) || preferredKey || undefined,
        recipientKey: coalesceString(contact?.pix_key) || preferredKey || undefined,
        sessionId: coalesceString(destinationWallet?.session_id) || undefined,
        userId: coalesceString((destinationWallet as any)?.user_id) || undefined,
        vaultSecretId: coalesceString(destinationWallet?.vault_secret_id) || undefined,
      };
    }

    const contactDisplayName = coalesceString(contact?.contact_name) || preferredName || query;
    const contactPixKey = coalesceString(contact?.pix_key, contact?.phone_number, preferredKey);
    const referenceCandidates = Array.from(new Set([
      preferredKey,
      contact?.pix_key,
      contact?.phone_number,
      query,
    ].map((value) => coalesceString(value)).filter(Boolean)));

    for (const reference of referenceCandidates) {
      if (normalizeLookup(reference) === normalizeLookup(contactDisplayName)) continue;
      const resolvedByReference = await this.resolveTransferRecipientReference(reference, {
        displayName: contactDisplayName,
        pixKey: contactPixKey || reference,
      });
      if (resolvedByReference?.publicKey) return resolvedByReference;
    }

    throw apiError(`Saved contact "${coalesceString(contact?.contact_name) || query}" does not have a Stellar destination yet. Choose another contact.`, 409);
  }

  private static async upsertRecentContactFromPayment(input: {
    ownerId: string;
    sourcePublicKey?: string;
    destinationPublicKey: string;
    contactName?: string;
    transferKey?: string;
  }): Promise<void> {
    const ownerId = coalesceString(input.ownerId);
    const destinationPublicKey = coalesceString(input.destinationPublicKey);
    const sourcePublicKey = coalesceString(input.sourcePublicKey);
    if (!ownerId || !/^G[A-Z2-7]{55}$/i.test(destinationPublicKey)) return;
    if (sourcePublicKey && sourcePublicKey === destinationPublicKey) return;

    const requestedName = coalesceString(input.contactName);
    const contactName = /^G[A-Z2-7]{55}$/i.test(requestedName)
      ? `Contato ${destinationPublicKey.slice(0, 6)}`
      : requestedName || `Contato ${destinationPublicKey.slice(0, 6)}`;
    const transferKey = coalesceString(input.transferKey).toLowerCase();
    const pixKey = transferKey && !/^G[A-Z2-7]{55}$/i.test(transferKey) ? transferKey : null;

    const { data: existingContact, error: lookupError } = await supabase
      .from('contacts')
      .select('id, contact_name, pix_key')
      .eq('owner_id', ownerId)
      .eq('stellar_public_key', destinationPublicKey)
      .limit(1)
      .maybeSingle();

    if (lookupError) throw lookupError;

    if (existingContact?.id) {
      const nextName = coalesceString(existingContact.contact_name) || contactName;
      const nextPixKey = coalesceString(existingContact.pix_key) || pixKey;
      const shouldUpdate =
        nextName !== coalesceString(existingContact.contact_name) ||
        coalesceString(nextPixKey) !== coalesceString(existingContact.pix_key);
      if (!shouldUpdate) return;

      const { error } = await supabase
        .from('contacts')
        .update({
          contact_name: nextName,
          pix_key: nextPixKey,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingContact.id);
      if (error) throw error;
      return;
    }

    const { error } = await supabase
      .from('contacts')
      .insert({
        owner_id: ownerId,
        contact_name: contactName,
        stellar_public_key: destinationPublicKey,
        pix_key: pixKey,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    if (error) throw error;
  }

  static async resolvePixFundedTransferRecipientForSession(input: PixFundedTransferInput): Promise<Record<string, unknown>> {
    const context = await this.resolveSessionWallet(input);
    const recipient = await this.resolveTransferRecipient(
      context.userId,
      coalesceString(input.recipient, input.recipient_query, input.recipientQuery, input.recipient_public_key, input.recipientPublicKey),
      {
        preferredName: coalesceString(input.recipient_name, input.recipientName),
        preferredKey: coalesceString(input.recipient_key, input.recipientKey, input.recipient_email, input.recipientEmail),
        preferredPublicKey: coalesceString(input.recipient_public_key, input.recipientPublicKey),
      }
    );

    return {
      success: true,
      recipient: {
        contact_name: recipient.displayName,
        recipient_name: recipient.displayName,
        recipient_public_key: recipient.publicKey,
        recipient_key: recipient.recipientKey || recipient.pixKey || '',
        recipient_pix_key: recipient.pixKey || '',
        session_id: recipient.sessionId || null,
      },
    };
  }

  private static async estimateCrossAssetDestinationAmount(input: {
    sourceAmount: string;
    sourceAssetCode: string;
    destinationAssetCode: string;
  }): Promise<string> {
    const sourceAmount = Number(String(input.sourceAmount || '').replace(',', '.'));
    if (!Number.isFinite(sourceAmount) || sourceAmount <= 0) return '';
    const sourceAssetCode = userFacingAssetCode(input.sourceAssetCode);
    const destinationAssetCode = userFacingAssetCode(input.destinationAssetCode);
    if (!sourceAssetCode || !destinationAssetCode || sourceAssetCode === destinationAssetCode) return '';

    try {
      const matrix = await ConversionRateMatrixService.buildMatrix({
        assets: [sourceAssetCode, destinationAssetCode, 'BRL', 'USDC'],
        sampleAmount: sourceAmount,
      });
      const cell = matrix.matrix?.[sourceAssetCode]?.[destinationAssetCode];
      const rate = Number(cell?.rate || 0);
      if (!Number.isFinite(rate) || rate <= 0) return '';
      return (sourceAmount * rate).toFixed(7);
    } catch (error) {
      logger.warn(`[ramp] Could not estimate ${sourceAssetCode}->${destinationAssetCode} PIX transfer destination amount: ${debugErrorMessage(error)}`);
      return '';
    }
  }

  private static pixFundedTransferSenderLabel(context: SessionWalletContext, input?: RampSessionInput): string {
    const email = coalesceString(context.email);
    if (email) return email;

    const externalProviderUserId = input ? externalChannelProviderUserId(input) : '';
    if (externalProviderUserId) return externalProviderUserId;

    const userId = coalesceString(context.userId);
    if (userId && userId !== context.sessionId) return userId;

    const publicKey = coalesceString(context.publicKey);
    if (/^G[A-Z2-7]{55}$/i.test(publicKey)) {
      return `${publicKey.slice(0, 7)}...${publicKey.slice(-7)}`;
    }

    return 'TalkToStellar account';
  }

  static async submitPixFundedTransferForSession(input: PixFundedTransferInput): Promise<Record<string, unknown>> {
    if (!this.getRuntimeInfo().sandbox) {
      throw apiError('PIX-funded transfer automation is unavailable in the current payment mode.', 403);
    }

    const context = await this.resolveSessionWallet(input);
    this.requireWalletPin(input, context);
    const ledgerFallback = this.sandboxLedgerFallbackAllowed();
    if (!context.vaultSecretId && !ledgerFallback) {
      throw apiError('Source wallet secret is unavailable for the current TalkToStellar session.', 409);
    }

    const amount = normalizeAmount(input.amount, 'amount');
    const sourceAsset = normalizeRampUserAsset(input.source_asset_code, input.sourceAssetCode, input.asset_code, input.assetCode, 'BRL');
    const language = rampInputLanguage(input);
    const destinationAsset = normalizeRampUserAsset(
      input.destination_asset_code,
      input.destinationAssetCode,
      input.asset_code,
      input.assetCode,
      sourceAsset.code
    );
    const crossAssetTransfer = !sameIssuedAsset(sourceAsset, destinationAsset);
    if (sourceAsset.code !== 'XLM' && !sourceAsset.issuer) {
      throw apiError(`${sourceAsset.code} is not configured for PIX-funded transfer.`, 400);
    }
    if (destinationAsset.code !== 'XLM' && !destinationAsset.issuer) {
      throw apiError(`${destinationAsset.code} is not configured for PIX-funded transfer.`, 400);
    }

    const recipient = await this.resolveTransferRecipient(
      context.userId,
      coalesceString(input.recipient, input.recipient_query, input.recipientQuery, input.recipient_public_key, input.recipientPublicKey),
      {
        preferredName: coalesceString(input.recipient_name, input.recipientName),
        preferredKey: coalesceString(input.recipient_key, input.recipientKey, input.recipient_email, input.recipientEmail),
        preferredPublicKey: coalesceString(input.recipient_public_key, input.recipientPublicKey),
      }
    );
    if (destinationAsset.code !== 'XLM' && destinationAsset.issuer && recipient.vaultSecretId) {
      try {
        const destinationSecret = await new VaultService(supabase).getSecret(recipient.vaultSecretId);
        const trustline = await StellarService.ensureTrustlineFromSecret({
          sourceSecret: destinationSecret,
          assetCode: destinationAsset.code,
          assetIssuer: destinationAsset.issuer,
        });
        if (!trustline.success && !ledgerFallback) {
          throw apiError(`Could not activate ${destinationAsset.code} for recipient: ${trustline.error || 'unknown trustline error'}`, 409);
        }
        if (!trustline.success) {
          console.warn(`[ramp] Continuing sandbox PIX-funded transfer without recipient trustline: ${trustline.error || 'unknown trustline error'}`);
        }
      } catch (error) {
        if (!ledgerFallback) throw error;
        console.warn('[ramp] Continuing sandbox PIX-funded transfer without recipient trustline setup:', debugErrorMessage(error));
      }
    }

    let result: { success: boolean; hash?: string; error?: string; destinationAmount?: string; destinationMin?: string };
    let sandboxLedgerTransfer = false;
    if (context.vaultSecretId) {
      try {
        const sourceSecret = await new VaultService(supabase).getSecret(context.vaultSecretId);
        result = crossAssetTransfer
          ? await StellarService.submitStrictSendPaymentFromSecret({
              sourceSecret,
              destination: recipient.publicKey,
              sourceAsset,
              sourceAmount: toStellarAmount(amount),
              destinationAsset,
              memoText: 'PIX funded',
            })
          : await StellarService.submitAssetPaymentFromSecret({
              sourceSecret,
              destination: recipient.publicKey,
              amount: toStellarAmount(amount),
              assetCode: sourceAsset.code,
              assetIssuer: sourceAsset.issuer,
              memoText: 'PIX funded',
            });
      } catch (error) {
        result = { success: false, error: debugErrorMessage(error) };
      }
    } else {
      result = { success: false, error: 'Source wallet secret is unavailable for the current TalkToStellar session.' };
    }

    if (!result.success) {
      if (!ledgerFallback) {
        throw apiError(result.error || 'Could not submit PIX-funded transfer.', 400);
      }
      sandboxLedgerTransfer = true;
      result = {
        success: true,
        hash: `sandbox-ledger-transfer-${crypto.randomUUID().slice(0, 18)}`,
      };
    }

    const estimatedDestinationAmount = crossAssetTransfer && !result.destinationAmount
      ? await this.estimateCrossAssetDestinationAmount({
          sourceAmount: amount,
          sourceAssetCode: userFacingAssetCode(sourceAsset.code),
          destinationAssetCode: userFacingAssetCode(destinationAsset.code),
        })
      : '';
    const destinationAmount = crossAssetTransfer
      ? normalizeAmount(result.destinationAmount || estimatedDestinationAmount || amount, 'destination_amount')
      : amount;
    const route = {
      selected: crossAssetTransfer
        ? `${userFacingAssetCode(sourceAsset.code)} -> ${userFacingAssetCode(destinationAsset.code)}`
        : rampText(language, `${userFacingAssetCode(sourceAsset.code)} direto`, `${userFacingAssetCode(sourceAsset.code)} direct`),
      criteria: rampText(language, 'menor custo após a conversão do PIX', 'lowest cost after PIX conversion'),
      reason: crossAssetTransfer
        ? rampText(
            language,
            `O saldo foi usado em ${userFacingAssetCode(sourceAsset.code)} e entregue em ${userFacingAssetCode(destinationAsset.code)} para ${recipient.displayName}.`,
            `The balance was used in ${userFacingAssetCode(sourceAsset.code)} and delivered in ${userFacingAssetCode(destinationAsset.code)} to ${recipient.displayName}.`
          )
        : rampText(
            language,
            `O saldo final já estava em ${userFacingAssetCode(sourceAsset.code)}; enviar direto evita conversão extra antes de chegar em ${recipient.displayName}.`,
            `The final balance was already in ${userFacingAssetCode(sourceAsset.code)}; sending directly avoids an extra conversion before it reaches ${recipient.displayName}.`
          ),
    };
    const routeContext = rampText(
      language,
      'Escolhemos a melhor rota para essa conversão.',
      'We chose the best route for this conversion.'
    );
    const displayAmount = formatDisplayAmount(destinationAmount, destinationAsset.code);
    const explicitReceiptDedupeKey = coalesceString(input.dedupe_key, input.dedupeKey);
    const externalDeliveryText = [
      rampText(language, 'PIX confirmado e transferencia enviada.', 'PIX confirmed and transfer sent.'),
      `${rampText(language, 'Valor', 'Amount')}: ${displayAmount}`,
      `${rampText(language, 'Destino', 'Destination')}: ${recipient.displayName}`,
      `${rampText(language, 'Status', 'Status')}: ${rampText(language, 'concluído', 'completed')}`,
    ].join('\n');
    let receiptUrl = '';
    try {
      receiptUrl = await PaymentReceiptService.sendReceipt({
        type: 'payment_sent',
        sessionId: context.sessionId,
        userId: context.userId,
        language,
        provider: externalChannelProvider(input) || undefined,
        providerUserId: externalChannelProviderUserId(input) || undefined,
        counterpartyLabel: recipient.displayName,
        sourceAmount: amount,
        sourceAssetCode: userFacingAssetCode(sourceAsset.code),
        destinationAmount,
        destinationAssetCode: userFacingAssetCode(destinationAsset.code),
        hash: result.hash || null,
        status: 'completed',
        contextMessage: routeContext,
        externalDeliveryText,
        dedupeKey: explicitReceiptDedupeKey || undefined,
      });
    } catch (error) {
      console.warn('[ramp] Could not send PIX-funded transfer receipt:', debugErrorMessage(error));
    }

    if (recipient.sessionId) {
      try {
        let recipientSessionUserId = '';
        try {
          const recipientSession = await new AgentRepository(supabase).getSession(recipient.sessionId);
          recipientSessionUserId = coalesceString(recipientSession?.user_id);
        } catch (sessionError) {
          console.warn('[ramp] Could not load recipient session for PIX-funded transfer receipt:', debugErrorMessage(sessionError));
        }
        const senderLabel = this.pixFundedTransferSenderLabel(context, input);
        await PaymentReceiptService.sendReceipt({
          type: 'payment_received',
          sessionId: recipient.sessionId,
          userId: recipientSessionUserId || coalesceString(recipient.userId) || recipient.sessionId,
          counterpartyLabel: senderLabel,
          counterpartyKey: senderLabel,
          sourceAmount: amount,
          sourceAssetCode: userFacingAssetCode(sourceAsset.code),
          destinationAmount,
          destinationAssetCode: userFacingAssetCode(destinationAsset.code),
          hash: result.hash || null,
          status: 'completed',
          contextMessage: routeContext,
          dedupeKey: explicitReceiptDedupeKey ? `${explicitReceiptDedupeKey}:recipient` : undefined,
        });
      } catch (error) {
        console.warn('[ramp] Could not send recipient PIX-funded transfer receipt:', debugErrorMessage(error));
      }
    }

    await this.upsertRecentContactFromPayment({
      ownerId: context.userId,
      sourcePublicKey: context.publicKey,
      destinationPublicKey: recipient.publicKey,
      contactName: recipient.displayName,
      transferKey: recipient.recipientKey || recipient.pixKey,
    }).catch((error) => {
      console.warn('[ramp] Could not auto-save PIX-funded transfer contact:', debugErrorMessage(error));
    });

    return {
      success: true,
      sandbox: true,
      order_id: coalesceString(input.order_id, input.orderId) || undefined,
      operation_id: coalesceString(input.operation_id, input.operationId) || undefined,
      source_public_key: context.publicKey,
      recipient_public_key: recipient.publicKey,
      recipient_name: recipient.displayName,
      recipient_key: recipient.recipientKey || recipient.pixKey,
      recipient_pix_key: recipient.pixKey,
      amount: destinationAmount,
      asset_code: userFacingAssetCode(destinationAsset.code),
      asset_issuer: destinationAsset.issuer,
      source_amount: amount,
      source_asset_code: userFacingAssetCode(sourceAsset.code),
      source_asset_issuer: sourceAsset.issuer,
      destination_amount: destinationAmount,
      destination_asset_code: userFacingAssetCode(destinationAsset.code),
      destination_asset_issuer: destinationAsset.issuer,
      transaction_hash: result.hash,
      sandbox_ledger_transfer: sandboxLedgerTransfer,
      receipt_url: receiptUrl,
      route_summary: routeContext,
      route,
      message: `PIX confirmado e transferencia de ${displayAmount} enviada para ${recipient.displayName}.`,
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
      throw apiError('PIX funding is unavailable for the selected destination asset. Use the default PIX route.', 400);
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
	      console.error('Erro ao iniciar PIX:', message);
	      throw apiError(`Não consegui iniciar o PIX agora: ${message}`, error?.statusCode || 500);
    }
  }

  static async checkDepositStatus(operationId: string): Promise<{
    status: string;
    message: string;
    transaction?: OnRampTransaction | OffRampTransaction;
  }> {
    try {
      const operation = await OperationRepository.findById(operationId);
      if (!operation) throw apiError('Operação não encontrada em nosso sistema.', 404);

      const context = operation.context ? JSON.parse(operation.context) : {};
      const orderId = coalesceString(context.anchor_order_id, context.order_id);
      if (!orderId) {
	        throw apiError('ID do pedido PIX não encontrado no registro da operação.', 400);
      }

      const direction = coalesceString(context.direction) || 'onramp';
      const transaction = direction === 'offramp'
        ? await this.getEtherfuseClient().getOffRampTransaction(orderId)
        : await this.getEtherfuseClient().getOnRampTransaction(orderId);

	      if (!transaction) throw apiError('Pedido PIX não encontrado.', 404);

      const ourStatus = mapAnchorStatusToOperationStatus(transaction.status);
      if (operation.status !== ourStatus) {
        await this.updateRampOperationStatus(operationId, ourStatus);
      }

	      const message = ourStatus === 'COMPLETED'
	        ? 'Ramp PIX concluído com sucesso.'
	        : `Status atual do PIX: ${transaction.status}.`;

      return { status: ourStatus, message, transaction };
    } catch (error: any) {
      const message = error?.message || String(error);
	      console.error('Erro ao verificar status do PIX:', message);
	      throw apiError(`Falha ao consultar status do PIX: ${message}`, error?.statusCode || 500);
    }
  }
}
