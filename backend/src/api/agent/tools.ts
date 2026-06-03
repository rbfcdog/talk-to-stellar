/**
 * TalkToStellar Account Tools
 * Functions that the LLM can call to perform TalkToStellar account operations
 */

import { z } from "zod";
import { getStellarService } from "../services/core/stellar.service";
import { StellarService as ApiStellarService } from "../services/stellar.service";
import { UserService } from "../services/user.service";
import { PinResetService } from "../services/core/pin-reset.service";
import { logger } from "../../utils/logger";
import { buildCapabilityHelpMessage } from "./capability-help";
import { supabase } from "../../config/supabase";
import { WalletRepository } from "../repository/core/wallet.repository";
import VaultService from "../services/core/vault.service";
import ExternalService from "../services/core/external.service";
import { assetMatchesConfiguredIssuer, getAssetIssuer, getStellarNetworkName, getUserFacingAssetCodes, isInitialUsdcConversionEnabled, normalizeAssetCode, resolveConfiguredAsset, userFacingAssetCode } from "../../config/assets";
import { ContactSeedService, repairLegacyStarterContactKey } from "../services/contact-seed.service";
import { BalanceAlertService } from "../services/balance-alert.service";
import { AutoConversionService } from "../services/auto-conversion.service";
import { DEFAULT_NETWORK_FEE_XLM, buildUnifiedFeeDisplay, formatCustomerAssetAmount, formatNetworkFeeForCustomer } from "../../utils/fee-display";
import { TransferNotificationService } from "../services/transfer-notification.service";
import { PaymentReceiptService, PaymentReceiptInput } from "../services/payment-receipt.service";
import { attachQuoteExpiry, quoteTtlSeconds } from "../services/quote-expiry.service";
import { ActivityFeedService } from "../services/activity-feed.service";
import { FinancialInsightsService } from "../services/financial-insights.service";
import { SmartContactsService } from "../services/smart-contacts.service";
import { PaymentReplayService } from "../services/payment-replay.service";
import { EconomyEngineService } from "../services/economy-engine.service";
import { PlatformFeeService } from "../services/platform-fee.service";
import { InvoiceService } from "../services/invoice.service";
import { GlobalProfileService } from "../services/global-profile.service";
import { BrlReferenceRateService } from "../services/brl-reference-rate.service";
import { brlUsdQuoteService } from "../services/brl-usd-quote.service";
import { internationalTransferService } from "../services/international-transfer.service";
import { mainnetWalletService } from "../services/mainnet-wallet.service";
import { AnchorService } from "../services/anchor.service";
import { ConversionRateMatrixService } from "../services/conversion-rate-matrix.service";
import { timingSafeEqualString } from "../../utils/password";
import { safeRedactedJson } from "../../utils/redaction";
import { hashWalletPin } from "../../utils/pin-hash";
import { publicErrorMessage } from "../../utils/public-error";
import { parseHumanAmountNumber } from "../../utils/amount";

const stellarService = getStellarService();
const walletRepo = new WalletRepository(supabase);
const vaultService = new VaultService(supabase);
const SAVINGS_TTS_FEE_PCT = 0.003;
const SAVINGS_TRADITIONAL_BANK_FEE_PCT = 0.035;
const SAVINGS_WISE_REFERENCE_FEE_PCT = 0.018;

function getAssetCode(value: any): string {
  if (value?.asset_type === 'native') return 'XLM';
  return String(value?.asset_code || value?.asset || 'UNKNOWN').toUpperCase();
}

function normalizeBalanceLine(value: any) {
  const asset = getAssetCode(value);
  return {
    asset,
    asset_code: asset,
    asset_type: value?.asset_type || (asset === 'XLM' ? 'native' : 'credit_alphanum4'),
    asset_issuer: value?.asset_issuer || value?.issuer,
    balance: String(value?.balance || '0.0000000'),
  };
}

function normalizeAssetInput(code: any, issuer: any) {
  return resolveConfiguredAsset(code || 'XLM', issuer);
}

function balanceMatchesConfiguredAsset(balance: any, assetCode: string): boolean {
  const code = normalizeAssetCode(balance?.asset || balance?.asset_code || balance?.code);
  const expectedAsset = resolveConfiguredAsset(assetCode);
  const expectedCode = normalizeAssetCode(expectedAsset.code);
  if (code !== expectedCode) return false;
  if (expectedCode === 'XLM') return true;
  return assetMatchesConfiguredIssuer(expectedCode, balance?.asset_issuer);
}

function numericBalance(value: unknown): number {
  const parsed = Number(String(value || '0').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : 0;
}

async function maybeRepairInitialFundingSweep(input: any, publicKey: string, balances: any[]): Promise<{
  account?: any;
  attempted: boolean;
  completed: boolean;
  error?: string;
}> {
  if (!isInitialUsdcConversionEnabled()) {
    return { attempted: false, completed: false };
  }

  const usdcBalance = balances.find((item: any) => balanceMatchesConfiguredAsset(item, 'USDC'));
  if (numericBalance(usdcBalance?.balance) > 0.0000001) {
    return { attempted: false, completed: false };
  }

  const nativeBalance = balances.find((item: any) => getAssetCode(item) === 'XLM');
  const xlmBalance = numericBalance(nativeBalance?.balance);
  if (xlmBalance <= 2) {
    return { attempted: false, completed: false };
  }

  try {
    let wallet = null as Awaited<ReturnType<WalletRepository['getWalletBySession']>> | null;
    const inputSessionId = String(input.session_id || input.sessionId || '').trim();
    if (inputSessionId) {
      wallet = await walletRepo.getWalletBySession(inputSessionId);
    }
    if (!wallet) {
      wallet = await walletRepo.getWalletByPublicKey(publicKey);
    }

    const sessionId = String(wallet?.session_id || inputSessionId || '').trim();
    const vaultSecretId = String(wallet?.vault_secret_id || '').trim();
    if (!sessionId || !vaultSecretId) {
      return {
        attempted: true,
        completed: false,
        error: 'Conta sem chave disponível para preparar o saldo inicial automaticamente.',
      };
    }

    const userId = await resolveToolUserId({ ...input, session_id: sessionId });
    const secretKey = await vaultService.getSecret(vaultSecretId);
    await ContactSeedService.createDefaultTrustlines(publicKey, secretKey, userId, sessionId);

    const freshAccount = await stellarService.getAccount(publicKey);
    await walletRepo.updateBalance(sessionId, freshAccount.balances, freshAccount.sequence);

    const converted = freshAccount.balances.some((item: any) => (
      balanceMatchesConfiguredAsset(item, 'USDC') && numericBalance(item.balance) > 0.0000001
    ));

    return {
      account: freshAccount,
      attempted: true,
      completed: converted,
      error: converted ? undefined : 'Conversão inicial ainda não gerou saldo USDC.',
    };
  } catch (error) {
    return {
      attempted: true,
      completed: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function isHorizonNotFound(error: any): boolean {
  const status = error?.response?.status;
  const message = String(error?.message || error || '').toLowerCase();
  return status === 404 || message === 'not found' || message.includes('not found');
}

function accountPreparationMessage(): string {
  return 'Sua conta foi criada e ainda está sincronizando. Tente novamente em alguns segundos.';
}

async function getAccountWithTestnetRepair(input: any, publicKey: string): Promise<{
  account: any;
  account_repair: {
    attempted: boolean;
    completed: boolean;
    error?: string;
  };
}> {
  try {
    return {
      account: await stellarService.getAccount(publicKey),
      account_repair: { attempted: false, completed: false },
    };
  } catch (error) {
    if (!isHorizonNotFound(error)) throw error;

    try {
      logger.warn(`[stellar-account-repair] account ${publicKey} not found; attempting testnet funding repair`);
      await ApiStellarService.ensureTestnetAccountFunded(publicKey);
      const account = await stellarService.getAccount(publicKey);

      const sessionId = String(input?.session_id || input?.sessionId || '').trim();
      if (sessionId) {
        await walletRepo.updateBalance(sessionId, account.balances, account.sequence).catch((updateError) => {
          logger.warn(`[stellar-account-repair] failed to sync repaired wallet ${sessionId}: ${updateError instanceof Error ? updateError.message : String(updateError)}`);
        });
      }

      return {
        account,
        account_repair: { attempted: true, completed: true },
      };
    } catch (repairError) {
      return {
        account: null,
        account_repair: {
          attempted: true,
          completed: false,
          error: repairError instanceof Error ? repairError.message : String(repairError),
        },
      };
    }
  }
}

function formatRouteChain(input: {
  sourceAssetCode?: string;
  destinationAssetCode?: string;
  path?: Array<{ code?: string; asset_code?: string; type?: string; asset_type?: string }>;
}): string {
  const sourceCode = String(input.sourceAssetCode || '').trim().toUpperCase();
  const destinationCode = String(input.destinationAssetCode || '').trim().toUpperCase();
  const hops = Array.isArray(input.path)
    ? input.path
        .map((item) => String(item?.code || item?.asset_code || '').trim().toUpperCase())
        .filter(Boolean)
    : [];

  const route = [sourceCode, ...hops, destinationCode].filter(Boolean);
  const compact = route.filter((asset, index) => index === 0 || asset !== route[index - 1]);
  return compact.join(' -> ');
}

function formatQuotePath(path: Array<{ code?: string; type?: string }>, sourceAssetCode?: string, destinationAssetCode?: string): string {
  if (!Array.isArray(path) || path.length === 0 || !sourceAssetCode || !destinationAssetCode) {
    return 'rota direta';
  }

  const route = formatRouteChain({
    sourceAssetCode,
    destinationAssetCode,
    path,
  });
  return route || `rota otimizada em ${path.length + 1} etapas`;
}

function toAmountNumber(value: unknown): number {
  const parsed = Number(String(value || '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatPercent(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '0,00%';
  return `${value.toFixed(4).replace('.', ',')}%`;
}

async function buildTransparentFeeBreakdown(input: {
  networkFeeXlm?: string;
  platformFeeAmount?: string | null;
  platformFeeAssetCode?: string | null;
  sourceAssetCode?: string;
  destinationAssetCode?: string;
}): Promise<{
  network_fee_display: string;
  platform_fee_display: string;
  total_fee_display: string;
  estimated_fee_usdc: string | null;
  estimated_fee_brl: string | null;
}> {
  const networkFee = await formatNetworkFeeForCustomer(input.networkFeeXlm || DEFAULT_NETWORK_FEE_XLM);
  const unifiedFee = buildUnifiedFeeDisplay({
    networkFee,
    platformFeeAmount: input.platformFeeAmount || null,
    platformFeeAssetCode: input.platformFeeAssetCode || null,
    sourceAssetCode: input.sourceAssetCode,
    destinationAssetCode: input.destinationAssetCode,
  });

  const platformFeeAmount = String(input.platformFeeAmount || '').trim();
  const platformFeeAssetCode = String(input.platformFeeAssetCode || '').trim().toUpperCase();
  const platformFeeDisplay =
    platformFeeAmount && platformFeeAssetCode
      ? formatCustomerAssetAmount(platformFeeAmount, platformFeeAssetCode)
      : 'R$ 0,00 / US$ 0,00';

  return {
    network_fee_display: networkFee.display || 'R$ 0,00 / US$ 0,00',
    platform_fee_display: platformFeeDisplay,
    total_fee_display: unifiedFee.display || 'R$ 0,00 / US$ 0,00',
    estimated_fee_usdc: unifiedFee.fee_usdc || null,
    estimated_fee_brl: unifiedFee.fee_brl || null,
  };
}

function buildSavingsEstimate(input: {
  sourceAmount?: unknown;
  sourceAssetCode?: unknown;
  quote?: any;
  estimatedFeeBrl?: unknown;
}) {
  const grossAmountBrl = EconomyEngineService.estimateAmountInBrl({
    amount: input.sourceAmount,
    assetCode: input.sourceAssetCode,
    quote: input.quote || {},
  });
  const actualFeeBrl = Math.max(0, toAmountNumber(input.estimatedFeeBrl));
  const savings = EconomyEngineService.calculateForOperation({
    grossAmount: grossAmountBrl,
    actualFee: actualFeeBrl,
  });

  return {
    gross_amount_brl: grossAmountBrl.toFixed(8),
    actual_fee_brl: actualFeeBrl.toFixed(8),
    estimated_traditional_fee_brl: savings.estimatedTraditionalFee.toFixed(8),
    estimated_savings_brl: savings.estimatedSavings.toFixed(8),
    savings_percentage_over_traditional_fee: Number(savings.savingsPercentage.toFixed(4)),
    comparison_method: savings.comparisonMethod,
  };
}

function normalizeToolLanguage(value: unknown): 'pt-BR' | 'en' {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'en' || normalized.startsWith('en-') || normalized.includes('english') || normalized.includes('ingles')) {
    return 'en';
  }
  return 'pt-BR';
}

function isWeakPaymentRecipientName(value: unknown): boolean {
  const normalized = String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
  return !normalized || /^(o|a|ao|aos|as|para|pra|pro|destinatario|recipient)$/.test(normalized);
}

function paymentRecipientFallbackLabel(input: any, destination: string): string {
  const contact = input?.destination_contact || {};
  const candidates = [
    contact.email,
    contact.pix_key,
    contact.phone_number,
    contact.cpf,
    input?.recipient_key,
    input?.recipientKey,
    input?.destination_key,
    input?.destinationKey,
    input?.recipient_email,
    input?.recipientEmail,
    input?.destination_email,
    input?.destinationEmail,
  ]
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .filter((value) => !/^G[A-Z2-7]{55}$/i.test(value));

  return candidates[0] || String(destination || '').trim();
}

async function executeSetLanguage(input: Record<string, any>): Promise<string> {
  const language = normalizeToolLanguage(input.language || input.lang || input.locale);
  return JSON.stringify({
    success: true,
    language,
    session_id: String(input.session_id || '').trim() || null,
    message: language === 'en'
      ? 'Done. I will answer in English.'
      : 'Pronto. Vou responder em português.',
  });
}

function normalizeYieldAssetInput(value: unknown): string {
  const raw = String(value || 'USDC').trim().toUpperCase();
  if (!raw || raw === 'USD' || raw === 'DOLLAR' || raw === 'DOLLARS' || raw === 'US$') return 'USDC';
  if (raw === 'BRL' || raw === 'REAL' || raw === 'REAIS' || raw === 'R$') return 'TESOURO';
  return normalizeAssetCode(raw);
}

function formatYieldAssetName(assetCode: unknown, language: 'pt-BR' | 'en' = 'pt-BR'): string {
  const displayCode = userFacingAssetCode(normalizeYieldAssetInput(assetCode));
  if (displayCode === 'BRL') return language === 'en' ? 'reais' : 'reais';
  if (displayCode === 'EUR') return language === 'en' ? 'euros' : 'euros';
  if (displayCode === 'USDC') return language === 'en' ? 'dollars' : 'dólares';
  if (displayCode === 'CETES') return language === 'en' ? 'Mexico test option' : 'opção México em teste';
  return displayCode;
}

function formatYieldAction(action: unknown): 'deposit' | 'withdraw' {
  const normalized = String(action || '').trim().toLowerCase();
  if (['withdraw', 'redeem', 'resgatar', 'retirar', 'sacar', 'saque'].includes(normalized)) {
    return 'withdraw';
  }
  return 'deposit';
}

function yieldActionLabel(action: 'deposit' | 'withdraw', language: 'pt-BR' | 'en' = 'pt-BR'): string {
  if (language === 'en') return action === 'withdraw' ? 'withdraw' : 'apply';
  return action === 'withdraw' ? 'retirar' : 'aplicar';
}

function sanitizeYieldToolError(error: unknown, language: 'pt-BR' | 'en' = 'pt-BR'): string {
  const raw = error instanceof Error ? error.message : String(error || '');
  const fallback = language === 'en'
    ? 'This application is not available right now. Try again in a few seconds.'
    : 'Esta aplicação não está disponível agora. Tente novamente em alguns segundos.';
  if (!raw.trim()) return fallback;
  if (/session|wallet|login|unauthor|auth|token|pin/i.test(raw)) {
    return language === 'en'
      ? 'Sign in and confirm your PIN before continuing.'
      : 'Entre na sua conta e confirme seu PIN antes de continuar.';
  }
  if (/defindex.*desativad|execução defindex|execucao defindex|defindex_enable_execution|defindex_compliance_approved|compliance approval|yield.*execution.*(disabled|requires)|execution.*yield.*disabled/i.test(raw)) {
    return language === 'en'
      ? 'Confirmation is view-only in this environment.'
      : 'A confirmação está apenas para consulta neste ambiente.';
  }
  if (/defindex|vault|xdr|horizon|stellar|issuer|trustline|private key|secret|api key|network|contract/i.test(raw)) {
    return fallback;
  }
  return raw
    .replace(/Defindex/gi, language === 'en' ? 'application service' : 'serviço de aplicação')
    .replace(/vault/gi, 'option')
    .replace(/wallet/gi, language === 'en' ? 'account' : 'conta')
    .replace(/asset/gi, language === 'en' ? 'currency' : 'moeda')
    .replace(/XDR/gi, 'operation');
}

function frontendAssetCode(assetCode: unknown): string {
  return userFacingAssetCode(normalizeYieldAssetInput(assetCode));
}

function buildFrontendInterfaceUrl(input: {
  path: string;
  params?: Record<string, unknown>;
}): string {
  const url = new URL(input.path, savingsFrontendBaseUrl());
  for (const [key, value] of Object.entries(input.params || {})) {
    const text = String(value ?? '').trim();
    if (text) url.searchParams.set(key, text);
  }
  return url.toString();
}

function normalizeToolSessionScope(value: unknown): 'whatsapp' | 'telegram' | '' {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return '';
  if (normalized.includes('telegram')) return 'telegram';
  if (normalized.includes('whatsapp') || normalized.includes('evolution') || normalized === 'phone') return 'whatsapp';
  return '';
}

async function shortenYieldUrl(rawUrl: string, purpose: string, sessionId?: string): Promise<string> {
  if (!sessionId) return rawUrl;
  try {
    return await new ExternalService(supabase as any).shortenPublicUrl({
      url: rawUrl, purpose, sessionId, expiresInHours: 24,
    });
  } catch {
    const withSession = new URL(rawUrl);
    withSession.searchParams.set('session_id', sessionId);
    return withSession.toString();
  }
}

function buildYieldFrontendUrl(input: {
  action?: 'deposit' | 'withdraw';
  amount?: unknown;
  assetCode?: unknown;
  language?: 'pt-BR' | 'en';
  sessionScope?: unknown;
}): string {
  const sessionScope = normalizeToolSessionScope(input.sessionScope);
  return buildFrontendInterfaceUrl({
    path: '/rendimentos',
    params: {
      view: 'application',
      action: input.action || 'deposit',
      amount: input.amount,
      asset: frontendAssetCode(input.assetCode || 'USDC'),
      advanced: '1',
      from: 'chat',
      session_scope: sessionScope,
      lang: input.language || 'pt-BR',
    },
  });
}

function buildConversionFrontendUrl(input: {
  sourceAmount?: unknown;
  sourceAssetCode?: unknown;
  destAssetCode?: unknown;
  language?: 'pt-BR' | 'en';
}): string {
  return buildFrontendInterfaceUrl({
    path: '/convert',
    params: {
      amount: input.sourceAmount,
      source_asset: frontendAssetCode(input.sourceAssetCode || 'BRL'),
      dest_asset: frontendAssetCode(input.destAssetCode || 'USDC'),
      from: 'chat',
      lang: input.language || 'pt-BR',
    },
  });
}

function normalizeMoneyInterfaceAction(value: unknown): 'bring' | 'keep' | 'send_out' {
  const normalized = String(value || '').trim().toLowerCase();
  if (['keep', 'hold', 'yield', 'earn', 'rendimento', 'manter', 'guardar', 'render'].includes(normalized)) return 'keep';
  if (['send_out', 'send-out', 'sendout', 'withdraw', 'cash_out', 'cash-out', 'mandar', 'retirar', 'sacar', 'mandar embora'].includes(normalized)) return 'send_out';
  return 'bring';
}

function buildMoneyInterfaceUrl(input: {
  action?: unknown;
  amount?: unknown;
  assetCode?: unknown;
  destinationPixKey?: unknown;
  language?: 'pt-BR' | 'en';
  sessionScope?: unknown;
}): string {
  const action = normalizeMoneyInterfaceAction(input.action);
  const asset = frontendAssetCode(input.assetCode || 'BRL');
  const amount = String(input.amount || '').trim();
  const language = input.language || 'pt-BR';
  const sessionScope = normalizeToolSessionScope(input.sessionScope);

  if (action === 'keep') {
    return buildYieldFrontendUrl({ action: 'deposit', amount, assetCode: asset, language, sessionScope });
  }

  if (action === 'send_out') {
    return buildFrontendInterfaceUrl({
      path: '/pix-off',
      params: {
        mode: 'offramp',
        asset,
        source_asset: asset,
        amount,
        source_amount: amount,
        destination_pix_key: input.destinationPixKey,
        from: 'chat',
        session_scope: sessionScope,
        autostart: amount ? '1' : '',
        lang: language,
      },
    });
  }

  return buildFrontendInterfaceUrl({
    path: '/pix-on',
    params: {
      mode: 'onramp',
      asset: 'BRL',
      target_asset: asset !== 'BRL' ? asset : '',
      amount,
      currency: 'BRL',
      from: 'chat',
      session_scope: sessionScope,
      autostart: amount ? '1' : '',
      lang: language,
    },
  });
}

function isCrossAssetPair(sourceAssetCode?: unknown, destinationAssetCode?: unknown): boolean {
  const source = String(sourceAssetCode || '').trim().toUpperCase().replace(/^USD$/, 'USDC');
  const destination = String(destinationAssetCode || '').trim().toUpperCase().replace(/^USD$/, 'USDC');
  return Boolean(source && destination && source !== destination);
}

function normalizePairQuoteAsset(value: unknown): string {
  const raw = String(value || '').trim().toUpperCase();
  if (!raw) return '';
  if (raw === 'USD' || raw === 'DOLLAR' || raw === 'DOLLARS' || raw === 'US$') return 'USDC';
  if (raw === 'REAL' || raw === 'REAIS' || raw === 'R$' || raw === 'TESOURO') return 'BRL';
  return userFacingAssetCode(normalizeAssetCode(raw));
}

function pairQuoteAmountInfo(value: unknown): { amount: string; provided: boolean } {
  const amount = parseHumanAmountNumber(value);
  if (Number.isFinite(amount) && amount > 0) {
    return { amount: amount.toFixed(7).replace(/\.?0+$/, ''), provided: true };
  }
  return { amount: '1', provided: false };
}

type PairQuoteMode = 'market_price' | 'send_exact';

function normalizePairQuoteMode(value: unknown, amountWasProvided: boolean): PairQuoteMode {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'market_price' || normalized === 'price' || normalized === 'buy' || normalized === 'receive_exact') {
    return 'market_price';
  }
  if (normalized === 'send_exact' || normalized === 'sell' || normalized === 'convert') {
    return 'send_exact';
  }
  return amountWasProvided ? 'send_exact' : 'market_price';
}

function pairQuoteBoolean(value: unknown): boolean {
  return value === true || String(value || '').trim().toLowerCase() === 'true';
}

function displayPairQuoteAmount(value: unknown, assetCode: unknown): string {
  const amount = parseHumanAmountNumber(value);
  const code = normalizePairQuoteAsset(assetCode);
  if (!Number.isFinite(amount)) return formatCustomerAssetAmount(String(value || '0'), code);
  if (code === 'BRL') return `R$ ${amount.toFixed(2)}`;
  if (code === 'USDC') return `US$ ${amount.toFixed(2)}`;
  return formatCustomerAssetAmount(
    amount > 0 ? amount.toFixed(7).replace(/\.?0+$/, '') : String(value || '0'),
    code
  );
}

async function quoteRequiredSourceForTarget(input: {
  sourceAssetCode: string;
  destAssetCode: string;
  destAmount: string;
}): Promise<{
  source_amount: string;
  destination_amount: string;
  source_asset_code: string;
  destination_asset_code: string;
  path: Array<{ code: string; issuer?: string; type?: string }>;
  method: string;
  network_fee_xlm?: string;
  platform_fee?: any;
}> {
  const sourceAsset = resolveConfiguredAsset(input.sourceAssetCode);
  const destAsset = resolveConfiguredAsset(input.destAssetCode);
  const quote = await ApiStellarService.quotePathPayment({
    sourcePublicKey: '',
    destination: '',
    sourceAsset,
    destAsset,
    destAmount: input.destAmount,
  });
  return {
    source_amount: String(quote.sourceAmount),
    destination_amount: String(quote.destinationAmount),
    source_asset_code: normalizePairQuoteAsset(quote.sourceAsset?.code || input.sourceAssetCode),
    destination_asset_code: normalizePairQuoteAsset(quote.destinationAsset?.code || input.destAssetCode),
    path: quote.path || [],
    method: 'stellar_strict_receive_best_source_amount',
    network_fee_xlm: quote.networkFeeXlm,
    platform_fee: quote.platformFee || null,
  };
}

function formatNoPathFallbackMessage(errorMessage: string): string {
  const raw = String(errorMessage || '').trim();
  const normalized = raw.toLowerCase();
  const mentionsQuoteExpired =
    /(quote|cotacao|cotação).*(expired|expirad)|not active:\s*expired/.test(normalized);
  if (mentionsQuoteExpired) {
    return 'A estimativa expirou. Gere uma nova estimativa para continuar.';
  }

  const mentionsNoPath =
    normalized.includes('não foi encontrado caminho') ||
    normalized.includes('nenhum caminho encontrado') ||
    normalized.includes('sem rota de liquidez') ||
    normalized.includes('no path') ||
    normalized.includes('path not found') ||
    normalized.includes('liquidez');
  const mentionsInternalRoutingDetail =
    normalized.includes('source_issuer') ||
    normalized.includes('dest_issuer') ||
    normalized.includes('issuer=') ||
    normalized.includes('_issuer') ||
    normalized.includes('trustline') ||
    normalized.includes('horizon') ||
    normalized.includes('path payment') ||
    normalized.includes('strictsend') ||
    normalized.includes('strict send') ||
    normalized.includes('xdr') ||
    normalized.includes('dex');

  if (mentionsNoPath || mentionsInternalRoutingDetail) {
    return 'Não consegui encontrar uma rota segura para essa conversão agora. Tente novamente em alguns segundos ou escolha outro valor.';
  }

  return raw || 'Não consegui concluir a conversão agora. Tente novamente em alguns segundos.';
}

function formatBrl(value: number): string {
  const displayValue = Number.isFinite(value) && value > 0 && value < 0.01 ? 0.01 : value;
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(displayValue) ? displayValue : 0);
}

function normalizeCurrencySpacing(value: string): string {
  return String(value || '').replace(/\u00a0/g, ' ');
}

function formatBrlInteger(value: number): string {
  return normalizeCurrencySpacing(new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(Number.isFinite(value) ? value : 0));
}

function formatUsd(value: number): string {
  return normalizeCurrencySpacing(new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0));
}

function parseSavingsBrlAmount(value: unknown): number {
  const parsed = parseHumanAmountNumber(value);
  if (Number.isFinite(parsed) && parsed > 0) return parsed;
  return 0;
}

function roundMoney(value: number): number {
  return Number((Number.isFinite(value) ? value : 0).toFixed(2));
}

function shortStellarHash(value: unknown): string {
  const hash = String(value || '').trim();
  if (!hash) return 'hash indisponível';
  if (hash.length <= 14) return hash;
  return `${hash.slice(0, 6)}...${hash.slice(-4)}`;
}

function formatSavingsDate(date = new Date()): string {
  const dateLabel = normalizeCurrencySpacing(new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'America/Sao_Paulo',
  }).format(date)).replace(/\./g, '');
  const timeLabel = new Intl.DateTimeFormat('pt-BR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'America/Sao_Paulo',
  }).format(date);
  return `${dateLabel} · ${timeLabel}`;
}

type RealConversionPreview = {
  brlAmount: number;
  brlPerUsdc: number;
  usdcPerBrl: number;
  grossUsdc: number;
  receiveUsdc: number;
  talkToStellarFeeBrl: number;
  talkToStellarFeeUsdc: number;
  stellarNetworkFeeBrl: number;
  stellarNetworkFeeUsdc: number;
  totalFeeBrl: number;
  totalFeeUsdc: number;
  totalFeePct: number;
  bankFeeBrl: number;
  wiseFeeBrl: number;
  savingsBrl: number;
  annualSavingsBrl: number;
  quoteSource: string;
  observedAt: string;
  networkFeeDisplay: string;
  spreadCollectionActive: boolean;
};

async function buildRealConversionPreview(brlAmount: number): Promise<RealConversionPreview> {
  const gross = Math.max(0, Number(brlAmount || 0));
  if (gross <= 0) throw new Error('brl_amount must be positive');

  const grossQuote = await BrlReferenceRateService.quoteBrlToUsdc(gross.toFixed(7));
  const brlPerUsdc = toNumber(grossQuote.brlPerUsdc);
  if (brlPerUsdc <= 0) {
    throw new Error('Cotação BRL/USDC indisponível agora.');
  }
  const usdcPerBrl = brlPerUsdc > 0 ? 1 / brlPerUsdc : 0;
  const grossUsdc = toNumber(grossQuote.destinationAmount);

  const spread = PlatformFeeService.calculateSpread({
    sourceAmount: gross.toFixed(7),
    sourceAssetCode: 'BRL',
    destinationAssetCode: 'USDC',
    mode: 'deduct_from_source',
  });
  const spreadEstimateBrl = toNumber(spread.feeAmount);
  const talkToStellarFeeBrl = spread.enabled ? spreadEstimateBrl : 0;
  const netBrl = Math.max(0, gross - talkToStellarFeeBrl);
  let receiveUsdc = Math.max(0, netBrl * usdcPerBrl);
  if (netBrl > 0) {
    try {
      const netQuote = await BrlReferenceRateService.quoteBrlToUsdc(netBrl.toFixed(7));
      receiveUsdc = toNumber(netQuote.destinationAmount) || receiveUsdc;
    } catch {
      // Keep the rate derived from the gross transaction quote.
    }
  }

  const networkFee = await formatNetworkFeeForCustomer(DEFAULT_NETWORK_FEE_XLM);
  const stellarNetworkFeeBrl = toNumber(networkFee.fee_brl);
  const stellarNetworkFeeUsdc = toNumber(networkFee.fee_usdc);
  const talkToStellarFeeUsdc = talkToStellarFeeBrl * usdcPerBrl;
  const totalFeeBrl = talkToStellarFeeBrl + stellarNetworkFeeBrl;
  const totalFeeUsdc = talkToStellarFeeUsdc + stellarNetworkFeeUsdc;
  const bankFeeBrl = gross * SAVINGS_TRADITIONAL_BANK_FEE_PCT;
  const wiseFeeBrl = gross * SAVINGS_WISE_REFERENCE_FEE_PCT;
  const savingsBrl = Math.max(0, bankFeeBrl - totalFeeBrl);

  try {
    await supabase
      .from('currency_rate_history')
      .insert({
        base_currency: 'USD',
        quote_currency: 'BRL',
        rate: brlPerUsdc,
        source: grossQuote.source,
        observed_at: grossQuote.fetchedAt || new Date().toISOString(),
        metadata: {
          symbol: 'USD/BRL',
          usdc_per_brl: usdcPerBrl.toFixed(8),
          preview_amount_brl: gross,
        },
      });
  } catch (persistError) {
    logger.warn(`[savings-preview] could not persist USD/BRL quote: ${persistError instanceof Error ? persistError.message : String(persistError)}`);
  }

  return {
    brlAmount: roundMoney(gross),
    brlPerUsdc,
    usdcPerBrl,
    grossUsdc: roundMoney(grossUsdc),
    receiveUsdc: roundMoney(receiveUsdc),
    talkToStellarFeeBrl: roundMoney(talkToStellarFeeBrl),
    talkToStellarFeeUsdc: Number(talkToStellarFeeUsdc.toFixed(8)),
    stellarNetworkFeeBrl: Number(stellarNetworkFeeBrl.toFixed(8)),
    stellarNetworkFeeUsdc: Number(stellarNetworkFeeUsdc.toFixed(8)),
    totalFeeBrl: roundMoney(totalFeeBrl),
    totalFeeUsdc: Number(totalFeeUsdc.toFixed(8)),
    totalFeePct: gross > 0 ? Number(((totalFeeBrl / gross) * 100).toFixed(6)) : 0,
    bankFeeBrl: roundMoney(bankFeeBrl),
    wiseFeeBrl: roundMoney(wiseFeeBrl),
    savingsBrl: roundMoney(savingsBrl),
    annualSavingsBrl: roundMoney(savingsBrl * 12),
    quoteSource: grossQuote.source,
    observedAt: grossQuote.fetchedAt || new Date().toISOString(),
    networkFeeDisplay: networkFee.display,
    spreadCollectionActive: Boolean(spread.enabled),
  };
}

async function fetchBrlUsdcQuote(): Promise<{
  source: string;
  symbol: string;
  brlPerUsdc: string;
  usdcPerBrl: string;
  fetchedAt: string;
}> {
  const quote = await BrlReferenceRateService.getReferenceRate();
  const brlPerUsdc = toNumber(quote.brlPerUsdc);
  const usdcPerBrl = brlPerUsdc > 0 ? 1 / brlPerUsdc : 0;
  return {
    source: quote.source,
    symbol: quote.symbol,
    brlPerUsdc: brlPerUsdc.toFixed(8),
    usdcPerBrl: usdcPerBrl.toFixed(8),
    fetchedAt: quote.fetchedAt,
  };
}

/**
 * Tool definitions for OpenAI function calling
 */
export const toolDefinitions = [
  {
    name: "set_language",
    description: "Switch the assistant language between Brazilian Portuguese and English when the user asks to change language.",
    parameters: {
      type: "object",
      properties: {
        language: {
          type: "string",
          enum: ["pt-BR", "en"],
          description: "Target language. Use en for English and pt-BR for Brazilian Portuguese.",
        },
        session_id: {
          type: "string",
          description: "Current chat session ID, when available.",
        },
      },
      required: ["language"],
    },
  },
  {
    name: "get_intent_help",
    description: "Mostra todos os comandos e funcionalidades disponíveis no TalkToStellar com explicações completas em pt-BR. Use somente quando o usuário pedir ajuda, lista de comandos, funcionalidades, o que pode fazer, menu, ou equivalente. Nunca use para pedidos acionáveis como envio/pagamento/transferência com valor e destinatário, PIX, saldo, conversão, PIN, contatos, histórico, perfil ou rendimentos.",
    parameters: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "get_product_context",
    description: "Retorna contexto codado para a LLM explicar funcionalidades, ativos, saldos e rendimentos do TalkToStellar. Use quando o usuário pedir explicação, tiver dúvida sobre o app, perguntar o que é cada ativo, ou pedir detalhes sobre rendimentos/aplicações. Não use get_intent_help para perguntas sobre ativos.",
    parameters: {
      type: "object",
      properties: {
        topic: {
          type: "string",
          enum: ["all", "features", "assets", "rendimentos", "fees", "security"],
          description: "Área que o usuário quer entender. Use all quando não estiver claro.",
        },
        language: {
          type: "string",
          enum: ["pt-BR", "en"],
          description: "Response language for the user-facing message.",
        },
      },
      required: [],
    },
  },
  {
    name: "get_brl_usdc_quote",
    description: "Get the current BRL-USDC quote from the configured TESOURO settlement asset. Returns both BRL per 1 USDC and USDC per 1 BRL.",
    parameters: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "get_pair_quote",
    description: "Consulta a cotação atual pela melhor rota entre quaisquer dois ativos configurados do TalkToStellar. Use market_price para preço/cotação/custo de um ativo em outro, como 'cotação XLM/BRL' ou 'quanto custa 100 XLM em reais': calcula quanto do ativo de preço é necessário para receber o ativo cotado. Use send_exact para simular venda/conversão, como 'converter 100 XLM para BRL': calcula quanto destino chega ao enviar origem. Retorna câmbio efetivo, valor estimado, status e rota. Não executa transação e não pede PIN.",
    parameters: {
      type: "object",
      properties: {
        source_asset_code: {
          type: "string",
          enum: ["BRL", "USDC", "CETES", "XLM"],
          description: "Ativo/moeda de origem. Use USDC quando o usuário falar USD, dólar, dólares ou US$; use BRL para real/reais/R$.",
        },
        dest_asset_code: {
          type: "string",
          enum: ["BRL", "USDC", "CETES", "XLM"],
          description: "Ativo/moeda de destino/recebimento. Use USDC para dólar/USD e BRL para real/reais.",
        },
        source_amount: {
          type: "string",
          description: "Valor informado pelo usuário. Em send_exact, é o valor de origem enviado. Em market_price, é o valor do ativo cotado que o usuário quer receber/comprar. Se o usuário só pedir a cotação, use 1.",
        },
        amount_was_provided: {
          type: "boolean",
          description: "True quando o usuário informou explicitamente um valor. False quando source_amount foi preenchido como 1 apenas para cotação unitária.",
        },
        quote_mode: {
          type: "string",
          enum: ["market_price", "send_exact", ""],
          description: "market_price para preço/cotação/custo de receber/comprar source_asset_code em dest_asset_code; send_exact para converter/vender/enviar source_asset_code e receber dest_asset_code.",
        },
        language: {
          type: "string",
          enum: ["pt-BR", "en"],
          description: "Idioma da resposta.",
        },
      },
      required: ["source_asset_code", "dest_asset_code"],
    },
  },
  {
    name: "get_all_pair_quotes",
    description: "Mostra a matriz completa de cotações atuais pela melhor rota entre todos os ativos configurados do TalkToStellar. Use quando o usuário pedir todas as cotações, todas as taxas, tabela de câmbio, matriz de conversão, preços de todos os ativos, ou algo como 'uero ver todas as cotacoes aqui'. Retorna os 16 pares de BRL, USDC, CETES e XLM. Não executa transação e não pede PIN.",
    parameters: {
      type: "object",
      properties: {
        language: {
          type: "string",
          enum: ["pt-BR", "en"],
          description: "Idioma da resposta.",
        },
      },
      required: [],
    },
  },
  {
    name: "get_explanations",
    description: "Returns detailed explanations about TalkToStellar features, assets, earnings, PIX, and how things work. Call this when the user asks 'explain', 'how does this work', 'what is', or wants to understand a concept. For 'quais sao os assets', 'explique os ativos/moedas', or asset questions, call this with topic='assets' instead of returning the generic help menu.",
    parameters: {
      type: "object",
      properties: {
        topic: {
          type: "string",
          description: "Specific topic to explain: 'all', 'pix', 'assets', 'earnings', 'account', 'conversion', 'payments', 'security'",
        },
        language: {
          type: "string",
          enum: ["pt-BR", "en"],
          description: "Language for the explanation",
        },
      },
      required: [],
    },
  },
  {
    name: "get_yield_options",
    description: "List available user-facing application options. Use this for questions about applying money or current supported currencies. Do not present this as guaranteed return, investment advice, fixed income, savings account, or bank deposit.",
    parameters: {
      type: "object",
      properties: {
        language: {
          type: "string",
          enum: ["pt-BR", "en"],
          description: "Response language for the user-facing message.",
        },
      },
      required: [],
    },
  },
  {
    name: "open_asset_interface",
    description: "Return the frontend interface URL for the user's money action: bring money in, apply money, or send money out to PIX. Use for broad multi-asset navigation intents such as trazer, aplicar, mandar embora, add money, apply, or withdraw to PIX.",
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["bring", "keep", "send_out"],
          description: "bring opens PIX add-money, keep opens application, send_out opens PIX withdrawal.",
        },
        amount: {
          type: "string",
          description: "Optional amount to prefill.",
        },
        asset_code: {
          type: "string",
          description: "User-facing currency. Use BRL, USDC/USD, CETES on testnet, or EURC only on public/mainnet.",
        },
        destination_pix_key: {
          type: "string",
          description: "Optional PIX key typed by the user for send_out. Never invent it.",
        },
        session_id: {
          type: "string",
          description: "Current chat session ID, when available.",
        },
        language: {
          type: "string",
          enum: ["pt-BR", "en"],
          description: "Response language for the user-facing message.",
        },
      },
      required: ["action"],
    },
  },
  {
    name: "open_conversion_interface",
    description: "Return the frontend URL for the asset conversion interface, prefilled from chat. Use when the user wants to explore or set up conversion between balances before confirming with PIN.",
    parameters: {
      type: "object",
      properties: {
        source_amount: {
          type: "string",
          description: "Optional source amount to prefill.",
        },
        source_asset_code: {
          type: "string",
          description: "Source currency, such as BRL, USDC, USD, CETES, XLM, or another configured asset. On testnet, CETES replaces EUR/EURC.",
        },
        dest_asset_code: {
          type: "string",
          description: "Destination currency, such as BRL, USDC, USD, CETES, XLM, or another configured asset. On testnet, CETES replaces EUR/EURC.",
        },
        language: {
          type: "string",
          enum: ["pt-BR", "en"],
          description: "Response language for the user-facing message.",
        },
      },
      required: [],
    },
  },
  {
    name: "get_yield_balance",
    description: "Check how much the signed-in user currently has in an application option. Use for questions about current position in an option.",
    parameters: {
      type: "object",
      properties: {
        session_id: {
          type: "string",
          description: "Current chat session ID. Required to resolve the user's account.",
        },
        asset_code: {
          type: "string",
          description: "User-facing currency requested for application, such as USDC, CETES, XLM, BRL, or USD. On testnet, CETES replaces EUR/EURC.",
        },
        language: {
          type: "string",
          enum: ["pt-BR", "en"],
          description: "Response language for the user-facing message.",
        },
      },
      required: ["session_id"],
    },
  },
  {
    name: "prepare_yield_action",
    description: "Prepare an action for confirmation without submitting money movement. Use before any confirmation for entry into or exit from the selected option.",
    parameters: {
      type: "object",
      properties: {
        session_id: {
          type: "string",
          description: "Current chat session ID. Required to resolve the user's account.",
        },
        action: {
          type: "string",
          enum: ["deposit", "withdraw"],
          description: "deposit means prepare entry into an option; withdraw means prepare exit from an option.",
        },
        amount: {
          type: "string",
          description: "Human amount to prepare.",
        },
        asset_code: {
          type: "string",
          description: "User-facing currency requested for application, such as USDC, CETES, XLM, BRL, or USD. On testnet, CETES replaces EUR/EURC.",
        },
        slippage_bps: {
          type: "number",
          description: "Advanced safety margin in basis points. Default 100.",
        },
        language: {
          type: "string",
          enum: ["pt-BR", "en"],
          description: "Response language for the user-facing message.",
        },
      },
      required: ["session_id", "action", "amount"],
    },
  },
  {
    name: "confirm_yield_action",
    description: "Confirm and submit a prepared action only if backend execution is enabled. Only use after the user clearly confirms and provides PIN; otherwise call prepare_yield_action first.",
    parameters: {
      type: "object",
      properties: {
        session_id: {
          type: "string",
          description: "Current chat session ID. Required to resolve the user's account.",
        },
        action: {
          type: "string",
          enum: ["deposit", "withdraw"],
          description: "deposit means entry into an option; withdraw means exit from an option.",
        },
        amount: {
          type: "string",
          description: "Human amount to confirm.",
        },
        asset_code: {
          type: "string",
          description: "User-facing currency requested for rendimentos, such as USDC, CETES, XLM, BRL, or USD. On testnet, CETES replaces EUR/EURC.",
        },
        pin: {
          type: "string",
          description: "User PIN. Never repeat this back in chat.",
        },
        slippage_bps: {
          type: "number",
          description: "Advanced safety margin in basis points. Default 100.",
        },
        language: {
          type: "string",
          enum: ["pt-BR", "en"],
          description: "Response language for the user-facing message.",
        },
      },
      required: ["session_id", "action", "amount", "pin"],
    },
  },
  {
    name: "create_brl_usd_quote",
    description: "Create a BRL to USD international account delivery quote. Use for cross-border USD account delivery planning; does not move money.",
    parameters: {
      type: "object",
      properties: {
        brl_amount: {
          type: "string",
          description: "BRL amount the user/institution wants to fund via Pix.",
        },
        user_id: {
          type: "string",
          description: "Current user ID when available.",
        },
        institution_id: {
          type: "string",
          description: "Institution/entity ID when this is a B2B transfer.",
        },
      },
      required: ["brl_amount"],
    },
  },
  {
    name: "create_usd_bank_transfer_intent",
    description: "Create a BRL-funded international USD bank account transfer intent from an existing quote. This only creates the tracked transfer; Pix funding, Stellar settlement and payout instruction happen in later steps.",
    parameters: {
      type: "object",
      properties: {
        quote_id: { type: "string", description: "Quote ID returned by create_brl_usd_quote." },
        user_id: { type: "string", description: "Current user ID when available." },
        institution_id: { type: "string", description: "Institution/entity ID when applicable." },
        sender_legal_name: { type: "string", description: "Legal sender or account owner name." },
        sender_entity_name: { type: "string", description: "Institution/entity legal name when applicable." },
        sender_email: { type: "string", description: "Sender email when known." },
        recipient_legal_name: { type: "string", description: "Recipient legal name." },
        account_holder_name: { type: "string", description: "USD bank account holder name." },
        account_holder_type: { type: "string", enum: ["individual", "business"], description: "USD bank account holder type." },
        bank_name: { type: "string", description: "Destination bank/account provider name." },
        routing_number: { type: "string", description: "US routing number when using ACH-compatible account details." },
        account_number: { type: "string", description: "Destination account number. Do not repeat it back in chat." },
        account_type: { type: "string", enum: ["checking", "savings"], description: "US account type." },
        swift_bic: { type: "string", description: "SWIFT/BIC when provided." },
        iban: { type: "string", description: "IBAN when provided." },
        country: { type: "string", description: "Destination bank account country." },
        provider_label: { type: "string", enum: ["wise", "mercury", "revolut", "other"], description: "Optional account provider label. Do not make the product Wise-specific." },
      },
      required: ["quote_id", "account_holder_name", "account_holder_type", "country"],
    },
  },
  {
    name: "send_receipt_image",
    description: "Gera o link do comprovante da última operação concluída do usuário. Não envia imagem/anexo no chat.",
    parameters: {
      type: "object",
      properties: {
        session_id: { type: "string", description: "Sessão atual do usuário." },
        user_id: { type: "string", description: "Usuário atual." },
        provider: { type: "string", description: "Canal atual, por exemplo web ou telegram." },
        provider_user_id: { type: "string", description: "ID do usuário no canal externo, quando houver." },
      },
      required: ["session_id"],
    },
  },
  {
    name: "create_wallet",
    description: "Create or connect a TalkToStellar account. Keep technical account identifiers hidden from the user.",
    parameters: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Account display name",
        },
        email: {
          type: "string",
          description: "User's email address",
        },
        phone_number: {
          type: "string",
          description: "User's phone number",
        },
        public_key: {
          type: "string",
          description: "Internal account identifier to link when already resolved by the backend. Do not ask the user for this.",
        },
        secret_key: {
          type: "string",
          description: "Existing import credential for account import/login",
        },
      },
      required: [],
    },
  },
  {
    name: "get_balance",
    description: "Get the user-facing balance summary. Returns R$, US$, CETES/EUR when configured, and XLM. Never expose account identifiers in chat.",
    parameters: {
      type: "object",
      properties: {
        session_id: {
          type: "string",
          description: "Current chat session ID. Used to resolve the account automatically.",
        },
        public_key: {
          type: "string",
          description: "Internal account identifier. Prefer session_id and do not ask the user for this.",
        },
      },
      required: [],
    },
  },
  {
    name: "get_mainnet_status",
    description: "Show guarded Stellar Mainnet configuration status. Use only when the user explicitly asks about mainnet.",
    parameters: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "attach_mainnet_wallet",
    description: "Attach a user's external Stellar Mainnet public key in read-only mode. Never ask for or store a Mainnet secret key.",
    parameters: {
      type: "object",
      properties: {
        session_id: { type: "string", description: "Current authenticated session ID." },
        user_id: { type: "string", description: "Current user ID when available." },
        public_key: { type: "string", description: "Stellar Mainnet public key beginning with G. Secret keys are not allowed." },
        label: { type: "string", description: "Optional label for the wallet." },
      },
      required: ["session_id", "public_key"],
    },
  },
  {
    name: "get_mainnet_balance",
    description: "Read the attached Stellar Mainnet wallet balance. Use only for explicit mainnet balance requests and clearly say this is real Mainnet read-only data.",
    parameters: {
      type: "object",
      properties: {
        session_id: { type: "string", description: "Current authenticated session ID." },
        user_id: { type: "string", description: "Current user ID when available." },
        public_key: { type: "string", description: "Optional Stellar Mainnet public key. Prefer the attached wallet when available." },
      },
      required: ["session_id"],
    },
  },
  {
    name: "preview_mainnet_payment",
    description: "Validate and preview a guarded Mainnet payment request without submitting it unless backend Mainnet mutation gates are explicitly configured.",
    parameters: {
      type: "object",
      properties: {
        session_id: { type: "string", description: "Current authenticated session ID." },
        user_id: { type: "string", description: "Current user ID when available." },
        destination: { type: "string", description: "Destination Stellar Mainnet public key." },
        amount: { type: "string", description: "Amount to preview." },
        asset_code: { type: "string", description: "Asset code, default USDC." },
        memo: { type: "string", description: "Optional memo." },
      },
      required: ["session_id", "destination", "amount"],
    },
  },
  {
    name: "build_payment",
    description: "Internal low-level helper to build a payment payload. Do not use for normal user chat payment requests; use prepare_payment_confirmation so the user gets a frontend confirmation link.",
    parameters: {
      type: "object",
      properties: {
        source_public_key: {
          type: "string",
          description: "Internal sender account identifier",
        },
        destination: {
          type: "string",
          description: "Internal destination account identifier",
        },
        amount: {
          type: "string",
          description: "Amount to send (e.g., '10.5')",
        },
        asset_code: {
          type: "string",
          description: "Asset code to send. For user-facing flows use BRL, USDC or CETES on testnet; EURC is public/mainnet only.",
        },
        asset_issuer: {
          type: "string",
          description: "Internal asset configuration. Do not expose to the user.",
        },
        memo: {
          type: "string",
          description: "Optional memo for the transaction",
        },
      },
      required: ["source_public_key", "destination", "amount"],
    },
  },
  {
    name: "quote_asset_transfer",
    description: "Preview a real cross-currency transfer or account conversion using live quote data, including source amount, source/origin asset, destination amount, destination asset, customer-facing fee, and route. For requests like 'enviar 200 BRL para receber em USDC', source_asset_code must be BRL and dest_asset_code must be USDC. For user-facing conversions, follow this with prepare_conversion_confirmation so the user gets a frontend confirmation link.",
    parameters: {
      type: "object",
      properties: {
        source_public_key: {
          type: "string",
          description: "Internal sender account identifier",
        },
        destination: {
          type: "string",
          description: "Internal destination account identifier. Use the sender account for internal conversion.",
        },
        dest_amount: {
          type: "string",
          description: "Amount the destination should receive",
        },
        source_amount: {
          type: "string",
          description: "Amount of source asset to spend. If provided, quote uses strict-send semantics.",
        },
        dest_asset_code: {
          type: "string",
          description: "Destination asset code for user-facing flows, e.g. USDC, BRL or CETES on testnet",
        },
        dest_asset_issuer: {
          type: "string",
          description: "Internal destination asset configuration. Do not expose to the user.",
        },
        source_asset_code: {
          type: "string",
          description: "Source asset code for user-facing flows, e.g. USDC, BRL or CETES on testnet",
        },
        source_asset_issuer: {
          type: "string",
          description: "Internal source asset configuration. Do not expose to the user.",
        },
      },
      required: ["source_public_key", "destination", "dest_amount", "dest_asset_code", "source_asset_code"],
    },
  },
  {
    name: "get_best_route",
    description: "Calcula e explica a melhor rota de envio/conversão para um par de moedas usando estimativa atual. Sempre informe explicitamente source_asset_code como moeda de origem/gasto e dest_asset_code como moeda de destino/recebimento. Ex.: 'transferir 200 BRL para Carlos receber em USDC' => source_asset_code=BRL, dest_asset_code=USDC, source_amount=200. Retorna taxa estimada, critério de otimização e validade da estimativa sem expor detalhes internos.",
    parameters: {
      type: "object",
      properties: {
        source_public_key: {
          type: "string",
          description: "Identificador interno da conta de origem.",
        },
        destination: {
          type: "string",
          description: "Identificador interno da conta de destino. Para conversão interna, use a mesma conta da origem.",
        },
        source_amount: {
          type: "string",
          description: "Quanto gastar da moeda de origem (strict-send).",
        },
        dest_amount: {
          type: "string",
          description: "Quanto o destino deve receber (strict-receive).",
        },
        source_asset_code: {
          type: "string",
          description: "Moeda de origem (BRL, USDC ou CETES em testnet).",
        },
        source_asset_issuer: {
          type: "string",
          description: "Configuração interna da moeda de origem. Não exponha ao usuário.",
        },
        dest_asset_code: {
          type: "string",
          description: "Moeda de destino (BRL, USDC ou CETES em testnet).",
        },
        dest_asset_issuer: {
          type: "string",
          description: "Configuração interna da moeda de destino. Não exponha ao usuário.",
        },
      },
      required: ["source_public_key", "destination", "source_asset_code", "dest_asset_code"],
    },
  },
  {
    name: "convert_assets",
    description: "Convert balances inside the user's own TalkToStellar account. Always set source_asset_code to the asset being spent and dest_asset_code to the asset being received. In user-facing chat only discuss R$ and US$.",
    parameters: {
      type: "object",
      properties: {
        session_id: {
          type: "string",
          description: "Current chat session ID",
        },
        user_id: {
          type: "string",
          description: "Current user ID",
        },
        dest_amount: {
          type: "string",
          description: "Amount of destination asset to receive",
        },
        source_amount: {
          type: "string",
          description: "Amount of source asset to spend. If provided, conversion uses strict-send semantics.",
        },
        dest_asset_code: {
          type: "string",
          description: "Destination asset code, e.g. USDC, BRL or CETES on testnet",
        },
        dest_asset_issuer: {
          type: "string",
          description: "Internal destination asset configuration. Do not expose to the user.",
        },
        source_asset_code: {
          type: "string",
          description: "Source asset code, e.g. USDC, BRL or CETES on testnet",
        },
        source_asset_issuer: {
          type: "string",
          description: "Internal source asset configuration. Do not expose to the user.",
        },
      },
      required: ["session_id", "user_id", "dest_amount", "dest_asset_code", "source_asset_code"],
    },
  },
  {
    name: "ensure_trustline",
    description: "Internal setup helper for account asset support. Do not mention this setup step to the user unless a failure blocks the flow.",
    parameters: {
      type: "object",
      properties: {
        session_id: {
          type: "string",
          description: "Current chat session ID",
        },
        user_id: {
          type: "string",
          description: "Current user ID",
        },
        public_key: {
          type: "string",
          description: "Internal account identifier",
        },
        asset_code: {
          type: "string",
          description: "Asset code, e.g. USDC, BRL or CETES on testnet",
        },
        asset_issuer: {
          type: "string",
          description: "Internal asset configuration",
        },
      },
      required: ["session_id", "user_id", "public_key", "asset_code"],
    },
  },
  {
    name: "prepare_payment_confirmation",
    description: "Create a one-time frontend payment confirmation link for a confirmed recipient and amount. Use for normal user chat requests to send, pay, transfer, or move a concrete amount/asset to a saved contact, person, email, phone, CPF, transfer key, or external wallet after resolving the recipient. For cross-asset transfers, amount/asset_code are the destination amount/asset the recipient receives, and source_amount/source_asset_code must identify the origin amount/asset the sender spends. Use this for normal user chat payment requests instead of build_payment.",
    parameters: {
      type: "object",
      properties: {
        amount: {
          type: "string",
          description: "Amount to send (e.g. '10.5')",
        },
        asset_code: {
          type: "string",
          description: "Asset code the recipient receives. For user-facing flows use BRL, USDC or CETES on testnet; EURC is public/mainnet only.",
        },
        asset_issuer: {
          type: "string",
          description: "Internal asset configuration. Do not expose to the user.",
        },
        source_amount: {
          type: "string",
          description: "Origin/source amount the sender spends for a cross-asset transfer. Example: 200 in 'send 200 BRL so Carlos receives USDC'.",
        },
        source_asset_code: {
          type: "string",
          description: "Origin/source asset the sender spends (BRL, USDC or CETES on testnet). Must not be confused with destination_asset_code.",
        },
        source_asset_issuer: {
          type: "string",
          description: "Internal source asset configuration. Do not expose to the user.",
        },
        destination_amount: {
          type: "string",
          description: "Destination amount the recipient receives after conversion. Usually comes from quote.destinationAmount.",
        },
        destination_asset_code: {
          type: "string",
          description: "Destination asset the recipient receives (BRL, USDC or CETES on testnet).",
        },
        destination_asset_issuer: {
          type: "string",
          description: "Internal destination asset configuration. Do not expose to the user.",
        },
        destination: {
          type: "string",
          description: "Internal recipient account identifier",
        },
        destination_name: {
          type: "string",
          description: "Recipient display name",
        },
        session_id: {
          type: "string",
          description: "Current chat session ID",
        },
        owner_id: {
          type: "string",
          description: "Current user ID / owner ID",
        },
        quote: {
          type: "object",
          description: "Optional quote details returned by quote_asset_transfer, used to show estimated fee before confirmation.",
        },
        provider: {
          type: "string",
          description: "External channel provider when the confirmation originated from WhatsApp or Telegram.",
        },
        provider_user_id: {
          type: "string",
          description: "External channel user ID for sending completion feedback after confirmation.",
        },
        source: {
          type: "string",
          description: "External source channel when available.",
        },
        return_to: {
          type: "string",
          description: "Internal frontend path to return to after confirmation, for example /transactions, /rendimentos, or /pix-ramp.",
        },
        return_source: {
          type: "string",
          description: "Frontend screen that originated this confirmation, for example pix, rendimentos, convert, transactions, or chat.",
        },
      },
      required: ["amount", "destination", "session_id", "owner_id"],
    },
  },
  {
    name: "prepare_conversion_confirmation",
    description: "Create a one-time frontend conversion confirmation link for an account self-conversion. source_asset_code is the origin asset being spent; dest_asset_code is the destination asset being received. Use this for normal user chat conversion requests after quoting.",
    parameters: {
      type: "object",
      properties: {
        session_id: {
          type: "string",
          description: "Current chat session ID",
        },
        owner_id: {
          type: "string",
          description: "Current user ID",
        },
        source_amount: {
          type: "string",
          description: "Exact source amount to spend (strict-send).",
        },
        source_asset_code: {
          type: "string",
          description: "Source asset code (USDC, BRL or CETES on testnet).",
        },
        source_asset_issuer: {
          type: "string",
          description: "Internal source asset configuration. Do not expose to the user.",
        },
        dest_amount: {
          type: "string",
          description: "Destination amount expected from quote.",
        },
        dest_asset_code: {
          type: "string",
          description: "Destination asset code (USDC, BRL or CETES on testnet).",
        },
        dest_asset_issuer: {
          type: "string",
          description: "Internal destination asset configuration. Do not expose to the user.",
        },
        quote: {
          type: "object",
          description: "Optional quote details to embed in token context.",
        },
        provider: {
          type: "string",
          description: "External channel provider when the confirmation originated from WhatsApp or Telegram.",
        },
        provider_user_id: {
          type: "string",
          description: "External channel user ID for sending completion feedback after confirmation.",
        },
        source: {
          type: "string",
          description: "External source channel when available.",
        },
        return_to: {
          type: "string",
          description: "Internal frontend path to return to after confirmation, for example /rendimentos.",
        },
        return_source: {
          type: "string",
          description: "Frontend screen that originated this confirmation, for example rendimentos, convert, pix, or chat.",
        },
      },
      required: ["session_id", "owner_id", "dest_amount", "source_asset_code", "dest_asset_code"],
    },
  },
  {
    name: "submit_transaction",
    description: "Internal helper to submit a signed payment payload. Do not use for normal chat replies.",
    parameters: {
      type: "object",
      properties: {
        signed_xdr: {
          type: "string",
          description: "Signed transaction in XDR format",
        },
      },
      required: ["signed_xdr"],
    },
  },
  {
    name: "get_transaction_history",
    description: "Get recent user-facing payment history for an account, including R$ and US$ values when available. Do not expose technical network details.",
    parameters: {
      type: "object",
      properties: {
        session_id: {
          type: "string",
          description: "Current chat session ID. Used to resolve the account automatically.",
        },
        public_key: {
          type: "string",
          description: "Internal account identifier. Prefer session_id and do not ask the user for this.",
        },
        limit: {
          type: "number",
          description: "Maximum number of transactions to return (default 10)",
        },
      },
      required: [],
    },
  },
  {
    name: "get_financial_memory",
    description: "Retrieve contextual financial memory and conversational analytics from payment logs: repeat-payment candidates, recipient insights, monthly received totals, fee totals, top payer, average quote rates, and estimated savings vs traditional providers.",
    parameters: {
      type: "object",
      properties: {
        session_id: {
          type: "string",
          description: "Current chat session ID.",
        },
        user_id: {
          type: "string",
          description: "Current user ID.",
        },
        mode: {
          type: "string",
          description: "recent_payments, repeat_payment, nickname_set, nickname_lookup, monthly_conversion, average_quote, monthly_received, monthly_fees, top_payer, traditional_savings, recipient_insights, risk_alert, treasury_advice, or summary.",
        },
        contact_name: {
          type: "string",
          description: "Optional counterparty/contact name to match for repeat payments.",
        },
        nickname: {
          type: "string",
          description: "Apelido da transação para salvar ou consultar.",
        },
      },
      required: [],
    },
  },
  {
    name: "get_activity_feed",
    description: "Lista o feed inteligente de atividade financeira (pagamentos, conversões, cobranças, economia em taxas, lembretes).",
    parameters: {
      type: "object",
      properties: {
        session_id: { type: "string", description: "Sessão atual do usuário." },
        user_id: { type: "string", description: "Usuário atual (opcional)." },
        limit: { type: "number", description: "Quantidade máxima de itens no feed." },
      },
      required: [],
    },
  },
  {
    name: "get_financial_insights",
    description: "Gera e retorna insights financeiros automáticos: economia estimada, média de cotação, volume convertido e destaques do mês.",
    parameters: {
      type: "object",
      properties: {
        session_id: { type: "string", description: "Sessão atual do usuário." },
        user_id: { type: "string", description: "Usuário atual (opcional)." },
        limit: { type: "number", description: "Quantidade máxima de insights retornados." },
      },
      required: [],
    },
  },
  {
    name: "resolve_smart_contact",
    description: "Resolve um contato financeiro usando contexto conversacional (nome amigável, apelido, função ou tags).",
    parameters: {
      type: "object",
      properties: {
        session_id: { type: "string", description: "Sessão atual do usuário." },
        user_id: { type: "string", description: "Usuário atual (opcional)." },
        query: { type: "string", description: "Texto do usuário para localizar contato." },
      },
      required: ["query"],
    },
  },
  {
    name: "find_payment_replay_candidate",
    description: "Encontra um pagamento anterior e gera confirmação segura para repetir com um toque.",
    parameters: {
      type: "object",
      properties: {
        session_id: { type: "string", description: "Sessão atual do usuário." },
        user_id: { type: "string", description: "Usuário atual (opcional)." },
        query_context: { type: "string", description: "Mensagem original para contexto do replay." },
      },
      required: [],
    },
  },
  {
    name: "get_savings_estimate",
    description: "Mostra economia estimada do mês comparada a métodos tradicionais (média de mercado).",
    parameters: {
      type: "object",
      properties: {
        session_id: { type: "string", description: "Sessão atual do usuário." },
        user_id: { type: "string", description: "Usuário atual (opcional)." },
      },
      required: [],
    },
  },
  {
    name: "get_savings_identity",
    description: "Responde determinísticamente quanto o usuário economizou hoje, no mês, no lifetime, quanto teria pago por métodos tradicionais, e a operação de maior economia.",
    parameters: {
      type: "object",
      properties: {
        session_id: { type: "string", description: "Sessão atual do usuário." },
        user_id: { type: "string", description: "Usuário atual (opcional)." },
        period: { type: "string", description: "today, month ou lifetime." },
        view: { type: "string", description: "summary, traditional_cost ou biggest_operation." },
      },
      required: [],
    },
  },
  {
    name: "get_savings_comparison",
    description: "Compara o custo efetivo do usuário no TalkToStellar com o custo estimado em bancos/provedores tradicionais. Resposta financeira e informativa, sem aconselhamento.",
    parameters: {
      type: "object",
      properties: {
        session_id: { type: "string", description: "Sessão atual do usuário." },
        user_id: { type: "string", description: "Usuário atual (opcional)." },
        period: { type: "string", description: "today, month ou lifetime." },
      },
      required: [],
    },
  },
  {
    name: "get_conversion_preview",
    description: "Estimativa BRL -> USDC usando a configuração atual da conta, taxa TalkToStellar ativa, custo de rede e comparação simples com banco comum. Use antes de falar de custo, câmbio, valor final ou economia.",
    parameters: {
      type: "object",
      properties: {
        brl_amount: {
          type: "string",
          description: "Valor em reais para cotar. Deve vir estruturado da mensagem do usuário ou de outro tool.",
        },
      },
      required: ["brl_amount"],
    },
  },
  {
    name: "show_savings_calculator",
    description: "Mostra no WhatsApp uma simulação de custo/economia quando o usuário pergunta quanto custa enviar, quanto vai pagar, se vale a pena, ou compara com banco/Wise. Usa get_conversion_preview e informações da conta; não use câmbio fixo.",
    parameters: {
      type: "object",
      properties: {
        brl_amount: {
          type: "string",
          description: "Valor em reais a simular. Extraia da mensagem do usuário; se não houver, peça o valor antes.",
        },
      },
      required: ["brl_amount"],
    },
  },
  {
    name: "send_receipt_with_savings",
    description: "Monta o comprovante conversacional com economia somente para operações concluídas com BRL enviado e USD/USDC recebido positivos. Não use para XLM, CETES, pagamentos no mesmo ativo ou operações sem BRL/USD; nesses casos use o comprovante normal.",
    parameters: {
      type: "object",
      properties: {
        brl_sent: { type: "string", description: "Valor bruto enviado em BRL." },
        usd_received: { type: "string", description: "Valor entregue/recebido em USD ou USDC." },
        fee_charged: { type: "string", description: "Taxa paga em BRL." },
        stellar_hash: { type: "string", description: "Hash ou evidência da transação Stellar." },
        recipient_name: { type: "string", description: "Nome do destinatário ou contraparte." },
        session_id: { type: "string", description: "Sessão atual para criar links curtos de histórico e comprovante." },
        user_id: { type: "string", description: "Usuário atual, quando disponível." },
      },
      required: ["brl_sent", "usd_received", "fee_charged", "stellar_hash", "recipient_name"],
    },
  },
  {
    name: "show_annual_savings_summary",
    description: "Mostra resumo anual de economia no WhatsApp quando o usuário pergunta quanto economizou, histórico de economia ou resumo do ano. Usa histórico da conta e compara as taxas pagas com uma transferência bancária comum.",
    parameters: {
      type: "object",
      properties: {
        session_id: { type: "string", description: "Sessão atual do usuário." },
        user_id: { type: "string", description: "Usuário atual, quando disponível." },
        public_key: { type: "string", description: "Conta interna atual; prefira session_id quando disponível." },
      },
      required: [],
    },
  },
  {
    name: "create_invoice",
    description: "Cria cobrança/invoice simples com link de pagamento compartilhável.",
    parameters: {
      type: "object",
      properties: {
        session_id: { type: "string", description: "Sessão atual do usuário." },
        user_id: { type: "string", description: "Usuário atual (opcional)." },
        recipient_name: { type: "string", description: "Nome do cliente/destinatário." },
        title: { type: "string", description: "Título da cobrança." },
        description: { type: "string", description: "Descrição da cobrança." },
        amount: { type: "string", description: "Valor da cobrança." },
        currency: { type: "string", description: "Moeda da cobrança (USD/BRL)." },
        due_date: { type: "string", description: "Vencimento em ISO date." },
      },
      required: ["recipient_name", "amount"],
    },
  },
  {
    name: "get_or_create_global_profile",
    description: "Cria ou retorna o link global público do usuário para receber pagamentos.",
    parameters: {
      type: "object",
      properties: {
        session_id: { type: "string", description: "Sessão atual do usuário." },
        user_id: { type: "string", description: "Usuário atual (opcional)." },
        username: { type: "string", description: "Sugestão de username." },
        display_name: { type: "string", description: "Nome público." },
        bio: { type: "string", description: "Bio curta do perfil." },
      },
      required: [],
    },
  },
  {
    name: "add_contact",
    description: "Add a new contact with their TalkToStellar transfer key, email, phone, CPF, or resolved account identifier.",
    parameters: {
      type: "object",
      properties: {
        session_id: {
          type: "string",
          description: "Current chat session ID. Used to resolve current user automatically.",
        },
        user_id: {
          type: "string",
          description: "Your user ID",
        },
        contact_name: {
          type: "string",
          description: "IGNORADO — o nome é sempre resolvido do banco de dados. Não preencher.",
        },
        public_key: {
          type: "string",
          description: "Internal contact account identifier when already resolved. Do not ask the user for this.",
        },
        pix_key: {
          type: "string",
          description: "Contact's TalkToStellar transfer key",
        },
        contact_key: {
          type: "string",
          description: "Generic contact key: transfer key, email, phone, CPF or resolved account reference",
        },
      },
      required: [],
    },
  },
  {
    name: "list_contacts",
    description: "Get all saved contacts for the user",
    parameters: {
      type: "object",
      properties: {
        session_id: {
          type: "string",
          description: "Current chat session ID. Used to resolve current user automatically.",
        },
        user_id: {
          type: "string",
          description: "Your user ID",
        },
      },
      required: [],
    },
  },
  {
    name: "list_wallets_and_contacts",
    description: "List all accounts with account name and related contacts",
    parameters: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "restart_onboarding",
    description: "Restart the onboarding process and set/reset the PIN. Passkey setup must be completed through an authenticated frontend session.",
    parameters: {
      type: "object",
      properties: {
        session_id: {
          type: "string",
          description: "Current chat session ID",
        },
        user_id: {
          type: "string",
          description: "Current user ID (can be empty if new user)",
        },
        email: {
          type: "string",
          description: "User's email (optional)",
        },
        phone_number: {
          type: "string",
          description: "User's phone number (optional)",
        },
        pin: {
          type: "string",
          description: "4-8 digit PIN to set/reset",
        },
        request_passkey: {
          type: "boolean",
          description: "Whether user asked about passkey setup. The tool must not enroll passkeys directly.",
        },
      },
      required: ["session_id", "pin"],
    },
  },
  {
    name: "reset_pin",
    description: "Request a PIN reset. Sends a temporary confirmation link (valid 15 minutes) to the email linked to the current account.",
    parameters: {
      type: "object",
      properties: {
        session_id: {
          type: "string",
          description: "Current chat session ID",
        },
        session_token: {
          type: "string",
          description: "Current authenticated session token injected by the backend.",
        },
        user_id: {
          type: "string",
          description: "Current user ID (optional; will be resolved automatically from session when missing)",
        },
        language: {
          type: "string",
          enum: ["pt-BR", "en"],
          description: "Response language",
        },
      },
      required: ["session_id"],
    },
  },
  {
    name: "logout_session",
    description: "Logout da sessão atual do usuário, encerrando o contexto ativo da conta no chat.",
    parameters: {
      type: "object",
      properties: {
        session_id: {
          type: "string",
          description: "Current chat session ID",
        },
        provider: {
          type: "string",
          description: "Optional external channel provider to disconnect, such as whatsapp or telegram.",
        },
        provider_user_id: {
          type: "string",
          description: "Optional external channel user id to disconnect for the provider.",
        },
      },
      required: ["session_id"],
    },
  },
];

/**
 * Execute a tool function
 */
export async function executeTool(
  toolName: string,
  toolInput: Record<string, any>
): Promise<string> {
  try {
    logger.info(`Tool call: ${toolName} ${safeRedactedJson(toolInput || {})}`);
    switch (toolName) {
      case "set_language":
        return await executeSetLanguage(toolInput);
      case "get_intent_help":
        return executeGetIntentHelp();
      case "get_product_context":
        return executeGetProductContext(toolInput);
      case "get_brl_usdc_quote":
        return await executeGetBrlUsdcQuote();
      case "get_pair_quote":
        return await executeGetPairQuote(toolInput);
      case "get_all_pair_quotes":
        return await executeGetAllPairQuotes(toolInput);
      case "get_explanations":
        return await executeGetExplanations(toolInput);
      case "get_yield_options":
        return await executeGetYieldOptions(toolInput);
      case "open_asset_interface":
        return await executeOpenAssetInterface(toolInput);
      case "open_conversion_interface":
        return await executeOpenConversionInterface(toolInput);
      case "get_yield_balance":
        return await executeGetYieldBalance(toolInput);
      case "prepare_yield_action":
        return await executePrepareYieldAction(toolInput);
      case "confirm_yield_action":
        return await executeConfirmYieldAction(toolInput);
      case "create_brl_usd_quote":
        return await executeCreateBrlUsdQuote(toolInput);
      case "create_usd_bank_transfer_intent":
        return await executeCreateUsdBankTransferIntent(toolInput);
      case "send_receipt_image":
        return await executeSendReceiptImage(toolInput);
      case "create_wallet":
        return await executeCreateWallet(toolInput);
      case "get_balance":
        return await executeGetBalance(toolInput);
      case "get_mainnet_status":
        return await executeGetMainnetStatus();
      case "attach_mainnet_wallet":
        return await executeAttachMainnetWallet(toolInput);
      case "get_mainnet_balance":
        return await executeGetMainnetBalance(toolInput);
      case "preview_mainnet_payment":
        return await executePreviewMainnetPayment(toolInput);
      case "get_account":
        return await executeGetAccount(toolInput);
      case "get_saldo_tecnico":
        return await executeGetSaldoTecnico(toolInput);
      case "build_payment":
        return await executeBuildPayment(toolInput);
      case "quote_asset_transfer":
        return await executeQuoteAssetTransfer(toolInput);
      case "get_best_route":
        return await executeGetBestRoute(toolInput);
      case "convert_assets":
        return await executeConvertAssets(toolInput);
      case "ensure_trustline":
        return await executeEnsureTrustline(toolInput);
      case "prepare_payment_confirmation":
        return await executePreparePaymentConfirmation(toolInput);
      case "prepare_conversion_confirmation":
        return await executePrepareConversionConfirmation(toolInput);
      case "submit_transaction":
        return await executeSubmitTransaction(toolInput);
      case "get_transaction_history":
        return await executeGetHistory(toolInput);
      case "get_financial_memory":
        return await executeGetFinancialMemory(toolInput);
      case "get_activity_feed":
        return await executeGetActivityFeed(toolInput);
      case "get_financial_insights":
        return await executeGetFinancialInsights(toolInput);
      case "resolve_smart_contact":
        return await executeResolveSmartContact(toolInput);
      case "find_payment_replay_candidate":
        return await executeFindPaymentReplayCandidate(toolInput);
      case "get_savings_estimate":
        return await executeGetSavingsEstimate(toolInput);
      case "get_savings_identity":
        return await executeGetSavingsIdentity(toolInput);
      case "get_savings_comparison":
        return await executeGetSavingsComparison(toolInput);
      case "get_conversion_preview":
        return await executeGetConversionPreview(toolInput);
      case "show_savings_calculator":
        return await executeShowSavingsCalculator(toolInput);
      case "send_receipt_with_savings":
        return await executeSendReceiptWithSavings(toolInput);
      case "show_annual_savings_summary":
        return await executeShowAnnualSavingsSummary(toolInput);
      case "create_invoice":
        return await executeCreateInvoice(toolInput);
      case "get_or_create_global_profile":
        return await executeGetOrCreateGlobalProfile(toolInput);
      case "add_contact":
        return await executeAddContact(toolInput);
      case "list_contacts":
        return await executeListContacts(toolInput);
      case "list_wallets_and_contacts":
        return await executeListWalletsAndContacts();
      case "restart_onboarding":
        return await executeRestartOnboarding(toolInput);
      case "reset_pin":
        return await executeResetPin(toolInput);
      case "logout_session":
        return await executeLogoutSession(toolInput);
      case "set_alert_threshold":
        return await executeSetAlertThreshold(toolInput);
      case "get_conversion_rules":
        return await executeGetConversionRules(toolInput);
      case "disable_conversion_rule":
        return await executeDisableConversionRule(toolInput);
      default:
        return JSON.stringify({
          success: false,
          error: `Unknown tool: ${toolName}`,
        });
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Tool execution error in ${toolName}: ${errorMessage}`);
    return JSON.stringify({
      success: false,
      error: errorMessage,
    });
  }
}

async function executeGetExplanations(input: any): Promise<string> {
  const language = normalizeToolLanguage(input.language || input.lang || input.locale);
  const topic = String(input.topic || 'all').trim().toLowerCase();
  const isEn = language === 'en';

  const explanations: Record<string, { pt: string; en: string }> = {
    pix: {
      pt: `PIX é a forma mais rápida de movimentar dinheiro na sua conta TalkToStellar. Você pode:
TRAZER DINHEIRO (entrada): via PIX, o valor cai em reais e é convertido para US$ automaticamente pela melhor rota disponível. Basta abrir o link, escanear o QR e confirmar com PIN.
RETIRAR DINHEIRO (saída): converte seu saldo em US$ para reais e envia direto para seu PIX. O valor chega em segundos na sua conta bancária.
PAGAR ALGUÉM: depois de colocar dinheiro via PIX, você pode pagar um contato salvo automaticamente. Tudo com taxa transparente, mostrada antes da confirmação.`,
      en: `PIX is the fastest way to move money in your TalkToStellar account. You can:
BRING MONEY IN: via PIX, the amount arrives in reais and is converted to US$ automatically through the best available route. Just open the link, scan the QR code and confirm with PIN.
WITHDRAW MONEY: converts your US$ balance to reais and sends it directly to your PIX. The amount arrives in seconds to your bank account.
PAY SOMEONE: after depositing via PIX, you can automatically pay a saved contact. Everything with transparent fees, shown before confirmation.`,
    },
    assets: {
      pt: `Assets são as moedas que podem aparecer na sua conta TalkToStellar:
1. R$ / BRL: reais. É o dinheiro usado para PIX de entrada e saída. Quando você traz ou retira por PIX, a experiência aparece em reais.
2. USDC / US$: dólar digital. É o saldo em dólares usado para guardar, converter e enviar valores internacionais dentro do app.
3. CETES: opção México em teste. Neste ambiente, aparece como uma moeda/opção configurada para conversão e posições.
4. XLM: saldo técnico visível da conta. Ele pode aparecer no saldo e em conversões quando disponível, mas não precisa ser entendido para usar PIX, enviar ou converter.

Na prática: você escolhe a moeda de origem e destino, o app calcula a rota disponível, mostra valor e taxas antes do PIN, e nada é confirmado sem sua autorização.
Ambiente testnet: valores e rotas podem variar e servem para teste técnico.`,
      en: `Assets are the currencies that can appear in your TalkToStellar account:
1. R$ / BRL: Brazilian reais. Used for PIX money in and out. When you add or withdraw through PIX, the experience appears in reais.
2. USDC / US$: digital dollars. The dollar balance used to hold, convert, and send international value in the app.
3. CETES: Mexico test option. In this environment, it appears as a configured currency/option for conversions and positions.
4. XLM: visible technical account balance. It can appear in balances and conversions when available, but you do not need to understand it to use PIX, send, or convert.

In practice: you choose source and destination currency, the app calculates the available route, shows amount and fees before PIN, and nothing is confirmed without your authorization.
Testnet environment: values and routes can vary and are for technical testing.`,
    },
    earnings: {
      pt: `Rendimentos são opções para seu dinheiro render enquanto está na conta. Funciona assim:
1. Você escolhe uma opção disponível (USDC, CETES ou XLM)
2. Define o valor que quer aplicar
3. Confirma com seu PIN
4. Seu saldo fica aplicado e você acompanha a posição e a taxa estimada
5. Pode retirar quando quiser
As taxas são estimadas e variam conforme o ambiente. Em testnet, são valores simulados. Nada sai sem PIN.`,
      en: `Earnings are options for your money to yield while in the account. Here's how it works:
1. Choose an available option (USDC, CETES or XLM)
2. Set the amount you want to apply
3. Confirm with your PIN
4. Your balance gets applied and you track the position and estimated rate
5. You can withdraw whenever you want
Rates are estimated and vary by environment. On testnet, they are simulated values. Nothing moves without PIN.`,
    },
    account: {
      pt: `Sua conta TalkToStellar é uma conta digital que conecta reais (via PIX) com dólar digital (USDC). Você pode:
- Ver saldo em R$, US$, CETES e XLM
- Adicionar dinheiro via PIX
- Converter entre moedas
- Enviar para contatos salvos
- Aplicar em rendimentos
- Retirar para seu PIX
Tudo com confirmação por PIN e taxas transparentes mostradas antes de cada operação.`,
      en: `Your TalkToStellar account is a digital account that connects reais (via PIX) with digital dollars (USDC). You can:
- Check balance in R$, US$, CETES and XLM
- Add money via PIX
- Convert between currencies
- Send to saved contacts
- Apply to earnings
- Withdraw to your PIX
Everything with PIN confirmation and transparent fees shown before each operation.`,
    },
    conversion: {
      pt: `A conversão entre moedas no TalkToStellar usa a rota mais otimizada disponível. Quando você pede uma conversão:
1. O sistema busca o melhor caminho entre as moedas
2. Mostra a taxa, o valor de origem e o valor de destino
3. Você confirma com PIN
A conversão é instantânea e as taxas são sempre mostradas antes. Você pode converter entre R$, US$, CETES e as moedas disponíveis.`,
      en: `Currency conversion on TalkToStellar uses the most optimized available route. When you request a conversion:
1. The system finds the best path between currencies
2. Shows the rate, source amount and destination amount
3. You confirm with PIN
Conversion is instant and fees are always shown before. You can convert between R$, US$, CETES and available currencies.`,
    },
    payments: {
      pt: `Para enviar dinheiro no TalkToStellar:
1. Escolha um contato salvo (ou adicione um novo)
2. Informe o valor e a moeda
3. O sistema mostra a taxa e o valor total
4. Confirme com PIN
O destinatário recebe na hora. Você também pode criar links de pagamento para cobrar alguém sem precisar de contato prévio.`,
      en: `To send money on TalkToStellar:
1. Choose a saved contact (or add a new one)
2. Enter the amount and currency
3. The system shows the fee and total amount
4. Confirm with PIN
The recipient receives it instantly. You can also create payment links to charge someone without needing a prior contact.`,
    },
    security: {
      pt: `Sua segurança no TalkToStellar:
- Toda operação financeira exige PIN de 4 a 8 dígitos
- O PIN é seu e só você sabe. Ninguém do time tem acesso
- Você pode redefinir o PIN a qualquer momento
- A conta pode ser acessada com biometria (Passkey)
- Todas as transações são registradas e auditáveis`,
      en: `Your security on TalkToStellar:
- Every financial operation requires a 4 to 8 digit PIN
- The PIN is yours and only you know it. No team member has access
- You can reset your PIN at any time
- Account can be accessed with biometrics (Passkey)
- All transactions are recorded and auditable`,
    },
  };

  const allTopics = Object.entries(explanations)
    .map(([key, value]) => `## ${key.toUpperCase()}\n${isEn ? value.en : value.pt}`)
    .join('\n\n---\n\n');

  const msg = topic === 'all'
    ? allTopics
    : explanations[topic]
      ? (isEn ? explanations[topic].en : explanations[topic].pt)
      : `Tópico "${topic}" não encontrado. Tópicos disponíveis: ${Object.keys(explanations).join(', ')} ou "all".`;

  return JSON.stringify({ success: true, topic: topic === 'all' ? 'all' : topic, message: msg });
}

function executeGetIntentHelp(): string {
  const commands = [
    {
      command: "contatos",
      intent: "contacts",
      description: "Lista ou salva destinatários da conta e ajuda a escolher quem recebe.",
      examples: ["listar contatos", "adiciona Ana pelo email ana@example.com"],
    },
    {
      command: "saldo",
      intent: "balance",
      description: "Mostra o saldo disponível em R$, US$, CETES, XLM e moedas configuradas.",
      examples: ["ver saldo", "qual meu saldo em xlm?"],
    },
    {
      command: "enviar",
      intent: "payment",
      description: "Cria um link seguro para enviar dinheiro a um contato da forma mais otimizada.",
      examples: ["mandar 50 dólares para Juliana Lima da forma mais otimizada"],
    },
    {
      command: "converter",
      intent: "conversion",
      description: "Abre a conversão entre reais, dólares, CETES, XLM e moedas configuradas pela rota mais otimizada.",
      examples: ["converter 10 usdc para brl", "quero converter dinheiro"],
    },
    {
      command: "rota",
      intent: "price_quote",
      description: "Abre ou calcula uma cotação; conversões e envios usam a melhor rota disponível antes do PIN.",
      examples: ["melhor estimativa para converter reais"],
    },
    {
      command: "rendimentos",
      intent: "yield",
      description: "Mostra opções de aplicação, posição atual e retirada.",
      examples: ["quero aplicar 100 dólares", "ver rendimentos atuais"],
    },
    {
      command: "melhor rota",
      intent: "best_route",
      description: "Toda conversão ou envio usa a melhor rota disponível dentro da transação.",
      examples: ["converter 300 reais para dólar", "enviar 50 USDC para BRL"],
    },
    {
      command: "PIX",
      intent: "pix",
      description: "Coloca dinheiro via PIX, retira saldo para a chave PIX informada ou paga um contato depois do PIX.",
      examples: ["colocar 100 reais via PIX", "retirar 80 cetes para meu PIX user@example.com"],
    },
    {
      command: "histórico",
      intent: "history",
      description: "Mostra pagamentos e operações recentes.",
      examples: ["ver histórico", "últimas transações"],
    },
    {
      command: "perfil",
      intent: "general",
      description: "Mostra o perfil da conta, dados públicos e saldos relacionados.",
      examples: ["ver meu perfil", "abrir perfil da conta"],
    },
    {
      command: "comparativo de economia",
      intent: "savings_comparison",
      description: "Compara o que você pagou aqui vs estimativa de bancos/métodos tradicionais.",
      examples: ["quanto economizei vs bancos?", "savings comparison month"],
    },
    {
      command: "apelido de transação",
      intent: "transaction_nickname",
      description: "Salva e consulta pagamentos por apelido para achar rápido depois.",
      examples: ["apelido da transação: pagamento logo setembro", "qual foi o valor de pagamento logo setembro?"],
    },
    {
      command: "link de pagamento",
      intent: "payment_link",
      description: "Cria um link para receber ou cobrar sem escolher contato antes.",
      examples: ["criar link de pagamento de 20 dólares"],
    },
    {
      command: "PIN",
      intent: "reset_pin",
      description: "Gera um link para redefinir o PIN quando você esquecer ou quiser trocar.",
      examples: ["esqueci meu PIN", "redefinir PIN"],
    },
  ];

  return JSON.stringify({
    success: true,
    commands,
    explainable: true,
    explanation_hint: "Também posso explicar como cada funcionalidade funciona, o que significa cada ativo e como consultar rendimentos/posições.",
    message: buildCapabilityHelpMessage(),
  });
}

function executeGetProductContext(input: any): string {
  const language = normalizeToolLanguage(input.language || input.lang || input.locale);
  const topic = String(input.topic || 'all').trim().toLowerCase() || 'all';
  const isPt = language !== 'en';
  const payload = {
    success: true,
    topic,
    guidance: isPt
      ? 'Use estas informações como contexto. Responda de forma direta, sem prometer retorno, sem recomendação personalizada e sem termos técnicos desnecessários.'
      : 'Use this as context. Answer directly without promising returns, personalized advice, or unnecessary technical terms.',
    features: [
      {
        key: 'contacts',
        name: isPt ? 'Contatos' : 'Contacts',
        explanation: isPt
          ? 'Lista, salva e escolhe destinatários para pagamentos. Quando o usuário pede contatos, mostre os contatos salvos em vez de abrir um menu genérico.'
          : 'Lists, saves, and selects recipients for payments. When the user asks for contacts, show saved contacts instead of a generic menu.',
      },
      {
        key: 'balance',
        name: isPt ? 'Saldo' : 'Balance',
        explanation: isPt
          ? 'Mostra saldos disponíveis em R$, US$, CETES, XLM e moedas configuradas. XLM aparece como saldo da conta quando disponível.'
          : 'Shows available balances in R$, US$, CETES, XLM, and configured assets. XLM appears as account balance when available.',
      },
      {
        key: 'pix',
        name: 'PIX',
        explanation: isPt
          ? 'Permite trazer dinheiro por PIX, retirar para uma chave PIX digitada na hora ou pagar alguém usando PIX. A tela mostra valores e taxas antes do PIN.'
          : 'Lets the user add money through PIX, withdraw to a PIX key, or pay someone using PIX. The page shows amounts and fees before PIN.',
      },
      {
        key: 'conversion',
        name: isPt ? 'Conversão' : 'Conversion',
        explanation: isPt
          ? 'Troca entre R$, US$, CETES, XLM e moedas configuradas. Se o usuário não informar valor e moedas, abra a tela de conversão para escolher; se informar tudo, prepare a confirmação.'
          : 'Converts between R$, US$, CETES, XLM, and configured assets. If the user does not provide amount and assets, open the conversion picker; if they provide all details, prepare confirmation.',
      },
      {
        key: 'payments',
        name: isPt ? 'Enviar dinheiro' : 'Send money',
        explanation: isPt
          ? 'Envia para contato salvo ou carteira externa com revisão antes de confirmar. Não invente destinatários; use contato salvo ou chave informada.'
          : 'Sends to saved contacts or external wallets with review before confirmation. Do not invent recipients; use saved contacts or provided destination keys.',
      },
      {
        key: 'payment_link',
        name: isPt ? 'Link de recebimento' : 'Receive link',
        explanation: isPt
          ? 'Cria link para alguém pagar ou para o usuário receber sem escolher contato antes.'
          : 'Creates a link so someone can pay or the user can receive without choosing a contact first.',
      },
      {
        key: 'rendimentos',
        name: isPt ? 'Rendimentos e posições' : 'Earnings and positions',
        explanation: isPt
          ? 'Mostra opções configuradas, posição atual e telas para aplicar ou retirar. Dados de testnet são estimados e servem para acompanhamento técnico; confirmação sempre exige PIN.'
          : 'Shows configured options, current position, and pages to apply or withdraw. Testnet data is estimated and used for technical tracking; confirmation always requires PIN.',
      },
      {
        key: 'history',
        name: isPt ? 'Histórico' : 'History',
        explanation: isPt
          ? 'Mostra entradas, saídas, conversões, PIX, comprovantes e apelidos de transações.'
          : 'Shows deposits, withdrawals, conversions, PIX, receipts, and transaction nicknames.',
      },
      {
        key: 'profile',
        name: isPt ? 'Perfil e acesso' : 'Profile and access',
        explanation: isPt
          ? 'Abre o perfil global, links públicos, login, PIN e biometria quando disponível.'
          : 'Opens the global profile, public links, login, PIN, and biometrics when available.',
      },
    ],
    assets: [
      {
        code: 'BRL',
        label: isPt ? 'Reais' : 'Brazilian reais',
        explanation: isPt
          ? 'Reais aparecem como R$ no app. São usados para PIX de entrada e saída, e podem ser convertidos para outras moedas antes da confirmação por PIN.'
          : 'Reais appear as R$ in the app. They are used for PIX in and out, and can be converted to other currencies before PIN confirmation.',
      },
      {
        code: 'USDC',
        label: isPt ? 'Dólares' : 'Dollars',
        explanation: isPt
          ? 'USDC aparece como US$. É o saldo em dólares usado para guardar, converter e enviar valores internacionais dentro da conta.'
          : 'USDC appears as US$. It is the dollar balance used to hold, convert, and send international value inside the account.',
      },
      {
        code: 'CETES',
        label: isPt ? 'Opção México em teste' : 'Mexico test option',
        explanation: isPt
          ? 'CETES é uma opção configurada no ambiente de teste. Pode aparecer em conversões e posições quando estiver disponível para a conta.'
          : 'CETES is an option configured in the test environment. It can appear in conversions and positions when available for the account.',
      },
      {
        code: 'XLM',
        label: 'XLM',
        explanation: isPt
          ? 'XLM é um saldo técnico visível da conta. Pode aparecer no saldo e em conversões quando disponível, mas o usuário não precisa lidar com detalhes técnicos para usar o app.'
          : 'XLM is a visible technical account balance. It can appear in balances and conversions when available, but users do not need technical details to use the app.',
      },
    ],
    rendimentos: {
      user_copy: isPt
        ? 'Você pode ver posições atuais, aplicar saldo disponível ou preparar retirada. Nada é confirmado sem PIN.'
        : 'You can view current positions, apply available balance, or prepare withdrawal. Nothing is confirmed without PIN.',
      limitations: isPt
        ? 'Ambiente testnet: valores e taxas exibidos são estimados e podem mudar.'
        : 'Testnet environment: displayed values and rates are estimated and can change.',
    },
  };

  return JSON.stringify(payload);
}

async function executeGetBrlUsdcQuote(): Promise<string> {
  try {
    const quote = await fetchBrlUsdcQuote();
    const observedAt = quote.fetchedAt || new Date().toISOString();

    try {
      await supabase
        .from('currency_rate_history')
        .insert({
          base_currency: 'USD',
          quote_currency: 'BRL',
          rate: Number(quote.brlPerUsdc),
          source: quote.source,
          observed_at: observedAt,
          metadata: {
            symbol: quote.symbol,
            usdc_per_brl: quote.usdcPerBrl,
          },
        });
    } catch (persistError) {
      logger.warn(`[fx-rate] could not persist USD/BRL quote: ${persistError instanceof Error ? persistError.message : String(persistError)}`);
    }

    return JSON.stringify({
      success: true,
      source: quote.source,
      symbol: quote.symbol,
      brl_per_usdc: quote.brlPerUsdc,
      usdc_per_brl: quote.usdcPerBrl,
      fetched_at: quote.fetchedAt,
      message:
        `Cotação atual do BRL da sua conta: ` +
        `1 US$ = R$ ${quote.brlPerUsdc} | ` +
        `1 R$ = US$ ${quote.usdcPerBrl}.`,
    });
  } catch (error) {
    const errorMessage = formatNoPathFallbackMessage(error instanceof Error ? error.message : String(error));
    return JSON.stringify({
      success: false,
      error: errorMessage,
    });
  }
}

async function executeGetPairQuote(input: any): Promise<string> {
  try {
    const sourceAssetCode = normalizePairQuoteAsset(input.source_asset_code || input.sourceAssetCode || input.from_asset_code || input.fromAssetCode);
    const destAssetCode = normalizePairQuoteAsset(input.dest_asset_code || input.destAssetCode || input.destination_asset_code || input.destinationAssetCode || input.to_asset_code || input.toAssetCode);
    const amountInfo = pairQuoteAmountInfo(input.source_amount || input.sourceAmount || input.amount);
    const sourceAmount = amountInfo.amount;
    const amountWasProvided = pairQuoteBoolean(input.amount_was_provided || input.amountWasProvided) || amountInfo.provided;
    const quoteMode = normalizePairQuoteMode(input.quote_mode || input.quoteMode || input.mode, amountWasProvided);
    const language = normalizeToolLanguage(input.language || input.lang || input.locale);

    if (!sourceAssetCode || !destAssetCode) {
      return JSON.stringify({
        success: false,
        error: language === 'en'
          ? 'Tell me the source and destination currencies, for example: quote XLM to USDC.'
          : 'Me diga a moeda de origem e destino, por exemplo: cotação XLM para USDC.',
      });
    }

    if (quoteMode === 'market_price') {
      try {
        const targetQuote = await quoteRequiredSourceForTarget({
          sourceAssetCode: destAssetCode,
          destAssetCode: sourceAssetCode,
          destAmount: sourceAmount,
        });
        const requiredAmount = parseHumanAmountNumber(targetQuote.source_amount);
        const targetAmount = parseHumanAmountNumber(targetQuote.destination_amount || sourceAmount);
        const pricePerUnit = targetAmount > 0 ? requiredAmount / targetAmount : 0;
        const inverse = requiredAmount > 0 ? targetAmount / requiredAmount : 0;
        const targetDisplay = displayPairQuoteAmount(targetQuote.destination_amount || sourceAmount, sourceAssetCode);
        const requiredDisplay = displayPairQuoteAmount(targetQuote.source_amount, destAssetCode);
        const priceDisplay = pricePerUnit > 0 ? displayPairQuoteAmount(pricePerUnit.toFixed(10), destAssetCode) : '';
        const inverseDisplay = inverse > 0 ? displayPairQuoteAmount(inverse.toFixed(10), sourceAssetCode) : '';
        const message = language === 'en'
          ? [
              `Current price by best route: to receive ${targetDisplay}, you need approximately ${requiredDisplay}.`,
              priceDisplay ? `Exchange: 1 ${sourceAssetCode} costs about ${priceDisplay}.` : '',
              inverseDisplay ? `Inverse: 1 ${destAssetCode} buys about ${inverseDisplay}.` : '',
              'Mode: exact target quote. This is the same direction used when PIX must deliver a final asset amount.',
              'This is only a quote. Nothing is executed without opening confirmation and entering PIN.',
            ].filter(Boolean).join('\n')
          : [
              `Preço atual pela melhor rota: para receber ${targetDisplay}, precisa de aproximadamente ${requiredDisplay}.`,
              priceDisplay ? `Câmbio: 1 ${sourceAssetCode} custa cerca de ${priceDisplay}.` : '',
              inverseDisplay ? `Inverso: 1 ${destAssetCode} compra cerca de ${inverseDisplay}.` : '',
              'Modo: cotação por alvo exato. É o mesmo sentido usado quando o PIX precisa entregar um valor final em outro ativo.',
              'Isso é só cotação. Nada é executado sem abrir a confirmação e digitar o PIN.',
            ].filter(Boolean).join('\n');

        return JSON.stringify({
          success: true,
          quote_mode: 'market_price',
          network: getStellarNetworkName(),
          source_asset_code: sourceAssetCode,
          dest_asset_code: destAssetCode,
          target_asset_code: sourceAssetCode,
          price_asset_code: destAssetCode,
          target_amount: targetQuote.destination_amount || sourceAmount,
          required_amount: targetQuote.source_amount,
          rate: pricePerUnit,
          inverse_rate: inverse,
          route_status: 'available',
          route_source: 'stellar_horizon_strict_receive_paths',
          route_method: targetQuote.method,
          route_path: targetQuote.path,
          observed_at: new Date().toISOString(),
          message,
        });
      } catch (marketError) {
        logger.warn(`[pair-quote] exact-target quote failed; falling back to send quote: ${marketError instanceof Error ? marketError.message : String(marketError)}`);
      }
    }

    const matrixPayload = await ConversionRateMatrixService.buildMatrix({
      assets: ['BRL', 'USDC', 'CETES', 'XLM'],
      sampleAmount: sourceAmount,
    });
    const cell = matrixPayload.matrix?.[sourceAssetCode]?.[destAssetCode];

    if (!cell || cell.status === 'unavailable' || !cell.rate || !cell.destination_amount) {
      return JSON.stringify({
        success: false,
        source_asset_code: sourceAssetCode,
        dest_asset_code: destAssetCode,
        error: language === 'en'
          ? `No safe route is available for ${sourceAssetCode} to ${destAssetCode} right now.`
          : `Não encontrei uma rota segura de ${sourceAssetCode} para ${destAssetCode} agora.`,
        route_cell: cell || null,
        all_pairs_summary: matrixPayload.summary,
      });
    }

    const sourceDisplay = displayPairQuoteAmount(cell.sample_source_amount, sourceAssetCode);
    const destinationDisplay = displayPairQuoteAmount(cell.destination_amount, destAssetCode);
    const oneUnitDestination = Number(cell.rate || 0);
    const inverse = Number(cell.inverse_rate || 0);
    const rateDisplay = Number.isFinite(oneUnitDestination) && oneUnitDestination > 0
      ? displayPairQuoteAmount(oneUnitDestination.toFixed(10), destAssetCode)
      : '';
    const inverseDisplay = Number.isFinite(inverse) && inverse > 0
      ? displayPairQuoteAmount(inverse.toFixed(10), sourceAssetCode)
      : '';
    const routeKind = cell.status === 'synthetic' && cell.bridge_asset_code
      ? (language === 'en' ? `best route via ${cell.bridge_asset_code}` : `melhor rota via ${cell.bridge_asset_code}`)
      : cell.status === 'same_asset'
          ? (language === 'en' ? 'same-currency route' : 'mesma moeda')
          : (language === 'en' ? 'direct best route' : 'melhor rota direta');
    const message = language === 'en'
      ? [
          `Current send quote by best route: ${sourceDisplay} -> approximately ${destinationDisplay}.`,
          rateDisplay ? `Exchange: 1 ${sourceAssetCode} ≈ ${rateDisplay}.` : '',
          inverseDisplay ? `Inverse: 1 ${destAssetCode} ≈ ${inverseDisplay}.` : '',
          `Route: ${routeKind}.`,
          'This is only a quote. Nothing is executed without opening confirmation and entering PIN.',
        ].filter(Boolean).join('\n')
      : [
          `Cotação de envio pela melhor rota: ${sourceDisplay} -> aproximadamente ${destinationDisplay}.`,
          rateDisplay ? `Câmbio: 1 ${sourceAssetCode} ≈ ${rateDisplay}.` : '',
          inverseDisplay ? `Inverso: 1 ${destAssetCode} ≈ ${inverseDisplay}.` : '',
          `Rota: ${routeKind}.`,
          'Isso é só cotação. Nada é executado sem abrir a confirmação e digitar o PIN.',
        ].filter(Boolean).join('\n');

    return JSON.stringify({
      success: true,
      quote_mode: 'send_exact',
      network: matrixPayload.network,
      source_asset_code: sourceAssetCode,
      dest_asset_code: destAssetCode,
      source_amount: cell.sample_source_amount,
      destination_amount: cell.destination_amount,
      rate: cell.rate,
      inverse_rate: cell.inverse_rate,
      route_status: cell.status,
      route_source: cell.source,
      route_method: cell.method,
      route_path: cell.path,
      bridge_asset_code: cell.bridge_asset_code || null,
      observed_at: cell.observed_at,
      all_pairs_summary: matrixPayload.summary,
      message,
    });
  } catch (error) {
    const language = normalizeToolLanguage(input.language || input.lang || input.locale);
    return JSON.stringify({
      success: false,
      error: publicErrorMessage(
        error,
        language === 'en'
          ? 'I could not load this quote right now. Try again in a few seconds.'
          : 'Não consegui carregar essa cotação agora. Tente novamente em alguns segundos.'
      ),
    });
  }
}

function allPairQuoteRouteLabel(cell: any, language: 'pt-BR' | 'en'): string {
  if (cell?.status === 'synthetic' && cell?.bridge_asset_code) {
    return language === 'en' ? `via ${cell.bridge_asset_code}` : `via ${cell.bridge_asset_code}`;
  }
  if (cell?.status === 'same_asset') {
    return language === 'en' ? 'same asset' : 'mesmo ativo';
  }
  if (cell?.status === 'available') {
    return language === 'en' ? 'best route' : 'melhor rota';
  }
  return language === 'en' ? 'unavailable' : 'indisponível';
}

async function executeGetAllPairQuotes(input: any): Promise<string> {
  const language = normalizeToolLanguage(input.language || input.lang || input.locale);
  const assets = ['BRL', 'USDC', 'CETES', 'XLM'];

  try {
    const matrixPayload = await ConversionRateMatrixService.buildMatrix({
      assets,
      sampleAmount: '100',
    });

    const visibleCells = assets.flatMap((sourceAssetCode) => (
      assets.map((destAssetCode) => matrixPayload.matrix?.[sourceAssetCode]?.[destAssetCode]).filter(Boolean)
    ));
    const lines = visibleCells.map((cell: any) => {
      if (!cell?.rate || cell?.status === 'unavailable') {
        return `${cell?.source_asset_code || '-'} -> ${cell?.destination_asset_code || '-'}: ${language === 'en' ? 'unavailable' : 'indisponível'}`;
      }

      const sourceDisplay = displayPairQuoteAmount('1', cell.source_asset_code);
      const destinationDisplay = displayPairQuoteAmount(cell.rate, cell.destination_asset_code);
      return `${sourceDisplay} -> ${destinationDisplay} (${allPairQuoteRouteLabel(cell, language)})`;
    });

    const message = language === 'en'
      ? [
          `Current quotes by best route (${matrixPayload.network.toLowerCase()}):`,
          ...lines,
          `Generated at: ${matrixPayload.generated_at}.`,
          'These are dynamic estimates for the configured assets. Nothing is executed without opening confirmation and entering PIN.',
        ].join('\n')
      : [
          `Cotações atuais pela melhor rota (${matrixPayload.network.toLowerCase()}):`,
          ...lines,
          `Gerado em: ${matrixPayload.generated_at}.`,
          'Essas são estimativas dinâmicas para os ativos configurados. Nada é executado sem abrir a confirmação e digitar o PIN.',
        ].join('\n');

    return JSON.stringify({
      success: true,
      network: matrixPayload.network,
      assets,
      generated_at: matrixPayload.generated_at,
      summary: matrixPayload.summary,
      pairs: visibleCells,
      message,
    });
  } catch (error) {
    return JSON.stringify({
      success: false,
      error: publicErrorMessage(
        error,
        language === 'en'
          ? 'I could not load all quotes right now. Try again in a few seconds.'
          : 'Não consegui carregar todas as cotações agora. Tente novamente em alguns segundos.'
      ),
    });
  }
}

function yieldCurrencyCode(assetCode: unknown): string {
  const display = userFacingAssetCode(normalizeYieldAssetInput(assetCode));
  return display === 'USDC' ? 'USD' : display;
}

function extractYieldBalanceAmount(value: any): string {
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  const candidates = [
    value?.balance,
    value?.amount,
    value?.total,
    value?.underlying_balance,
    value?.underlyingBalance,
    value?.asset_balance,
    value?.assetBalance,
    value?.shares,
  ];
  const found = candidates.find((candidate) => String(candidate || '').trim());
  return String(found || '0');
}

async function executeGetYieldOptions(input: any): Promise<string> {
  const language = normalizeToolLanguage(input.language || input.lang || input.locale);
  try {
    const status = await AnchorService.getDefindexYieldStatus();
    const sessionId = String(input.session_id || '').trim() || undefined;
    const sessionScope = normalizeToolSessionScope(input.session_scope || input.sessionScope || input.source || input.provider || input.external_source || input.external_provider);
    const rawUrl = buildYieldFrontendUrl({ language, sessionScope });
    const frontendUrl = await shortenYieldUrl(rawUrl, 'rendimentos', sessionId);
    const options = (Array.isArray(status.vaults) ? status.vaults : []).map((option: any) => {
      const internalAssetCode = normalizeYieldAssetInput(option.asset_code || option.display_asset_code);
      const currency = yieldCurrencyCode(internalAssetCode);
      return {
        currency,
        name: formatYieldAssetName(internalAssetCode, language),
        available: !option.apy_error && option.execution_available !== false,
      };
    });
    const availableOptions = options.filter((option) => option.available);

    const configured = Boolean((status as any)?.runtime?.configured);
    const confirmationAvailable = Boolean((status as any)?.runtime?.execution_enabled);
    const isTestnet = String((status as any)?.runtime?.network || '').toLowerCase() === 'testnet';
    const disclosure = language === 'en'
      ? (isTestnet ? 'Testnet environment.' : 'Application environment.')
      : (isTestnet ? 'Ambiente testnet.' : 'Ambiente de aplicação.');
    const message = language === 'en'
      ? options.length
        ? `Earnings options: ${availableOptions.map((option) => option.name).join(', ') || 'none available right now'}.\n${disclosure}\n\nOpen earnings:\n${frontendUrl}`
        : `Earnings options are not configured yet.\n${disclosure}\n\nOpen earnings:\n${frontendUrl}`
      : options.length
        ? `Opções de rendimentos: ${availableOptions.map((option) => option.name).join(', ') || 'nenhuma disponível agora'}.\n${disclosure}\n\nAbrir rendimentos:\n${frontendUrl}`
        : `As opções de rendimentos ainda não foram configuradas.\n${disclosure}\n\nAbrir rendimentos:\n${frontendUrl}`;

    return JSON.stringify({
      success: true,
      configured,
      confirmation_available: confirmationAvailable,
      disclosure,
      options,
      frontend_url: frontendUrl,
      message,
    });
  } catch (error) {
    return JSON.stringify({
      success: false,
      error: sanitizeYieldToolError(error, language),
    });
  }
}

async function executeOpenAssetInterface(input: any): Promise<string> {
  const language = normalizeToolLanguage(input.language || input.lang || input.locale);
  try {
    const action = normalizeMoneyInterfaceAction(input.action || input.intent || input.mode);
    const assetCode = normalizeYieldAssetInput(input.asset_code || input.assetCode || input.currency || 'BRL');
    const sessionId = String(input.session_id || '').trim() || undefined;
    const sessionScope = normalizeToolSessionScope(input.session_scope || input.sessionScope || input.source || input.provider || input.external_source || input.external_provider);
    const rawUrl = buildMoneyInterfaceUrl({
      action,
      amount: input.amount,
      assetCode,
      destinationPixKey: input.destination_pix_key || input.destinationPixKey || input.pix_key || input.pixKey,
      language,
      sessionScope,
    });
    const purpose = action === 'keep' ? 'rendimentos' : action === 'send_out' ? 'pix_offramp' : 'pix_onramp';
    const frontendUrl = await shortenYieldUrl(rawUrl, purpose, sessionId);
    const displayAsset = frontendAssetCode(assetCode);
	    const actionLabel = language === 'en'
	      ? action === 'bring'
	        ? 'Add money'
	        : action === 'send_out'
	          ? 'Send to PIX'
              : 'Apply money'
	      : action === 'bring'
	        ? 'Trazer dinheiro'
	        : action === 'send_out'
	          ? 'Mandar para PIX'
	          : 'Abrir rendimentos';

    return JSON.stringify({
      success: true,
      action,
      asset_code: displayAsset,
      amount: String(input.amount || '').trim() || null,
      frontend_url: frontendUrl,
      message: language === 'en'
        ? `${actionLabel} is ready for ${displayAsset}.\n\nOpen:\n${frontendUrl}`
        : `${actionLabel} para ${displayAsset}.\n\nAbrir:\n${frontendUrl}`,
    });
  } catch (error) {
    return JSON.stringify({
      success: false,
      error: sanitizeYieldToolError(error, language),
    });
  }
}

async function executeOpenConversionInterface(input: any): Promise<string> {
  const language = normalizeToolLanguage(input.language || input.lang || input.locale);
  try {
    const hasSourceAsset = Boolean(String(input.source_asset_code || input.sourceAssetCode || input.from_asset || input.fromAsset || '').trim());
    const hasDestAsset = Boolean(String(input.dest_asset_code || input.destAssetCode || input.to_asset || input.toAsset || '').trim());
    const sourceAsset = normalizeYieldAssetInput(input.source_asset_code || input.sourceAssetCode || input.from_asset || input.fromAsset || 'BRL');
    const destAsset = normalizeYieldAssetInput(input.dest_asset_code || input.destAssetCode || input.to_asset || input.toAsset || 'USDC');
    const sourceAmount = String(input.source_amount || input.sourceAmount || input.amount || '').trim();
    const hasCompletePrefill = Boolean(sourceAmount && hasSourceAsset && hasDestAsset);
    const sessionId = String(input.session_id || '').trim() || undefined;
    const rawUrl = buildConversionFrontendUrl({
      sourceAmount,
      sourceAssetCode: sourceAsset,
      destAssetCode: destAsset,
      language,
    });
    const frontendUrl = await shortenYieldUrl(rawUrl, 'convert', sessionId);
    const sourceDisplay = frontendAssetCode(sourceAsset);
    const destDisplay = frontendAssetCode(destAsset);

    return JSON.stringify({
      success: true,
      action: hasCompletePrefill ? 'conversion_confirmation_prefill' : 'conversion_picker',
      source_amount: sourceAmount || null,
      source_asset_code: sourceDisplay,
      dest_asset_code: destDisplay,
      frontend_url: frontendUrl,
      message: language === 'en'
        ? hasCompletePrefill
          ? `Conversion is ready to review: ${sourceAmount} ${sourceDisplay} to ${destDisplay}.\n\nOpen:\n${frontendUrl}`
          : `Open the conversion screen to choose amount and assets.\n\nOpen:\n${frontendUrl}`
        : hasCompletePrefill
          ? `Conversão pronta para revisar: ${sourceAmount} ${sourceDisplay} para ${destDisplay}.\n\nAbra:\n${frontendUrl}`
          : `Abra a tela de conversão para escolher valor e moedas.\n\nAbra:\n${frontendUrl}`,
    });
  } catch (error) {
    return JSON.stringify({
      success: false,
      error: sanitizeYieldToolError(error, language),
    });
  }
}

async function executeGetYieldBalance(input: any): Promise<string> {
  const language = normalizeToolLanguage(input.language || input.lang || input.locale);
  try {
    const assetCode = normalizeYieldAssetInput(input.asset_code || input.assetCode || input.currency || 'USDC');
    const sessionId = String(input.session_id || '').trim() || undefined;
    const sessionScope = normalizeToolSessionScope(input.session_scope || input.sessionScope || input.source || input.provider || input.external_source || input.external_provider);
    const rawUrl = buildYieldFrontendUrl({ assetCode, language, sessionScope });
    const frontendUrl = await shortenYieldUrl(rawUrl, 'rendimentos', sessionId);
    const result: any = await AnchorService.getDefindexYieldBalanceForSession({
      ...input,
      asset_code: assetCode,
    });
    const currency = yieldCurrencyCode(result?.vault?.asset_code || assetCode);
    const amount = extractYieldBalanceAmount(result?.balance);
    const name = formatYieldAssetName(result?.vault?.asset_code || assetCode, language);

    return JSON.stringify({
      success: true,
      currency,
      amount,
      balance: amount,
	      frontend_url: frontendUrl,
	      message: language === 'en'
	        ? `Current position: ${amount} ${name}.\n\nOpen:\n${frontendUrl}`
	        : `Posição atual: ${amount} ${name}.\n\nAbrir:\n${frontendUrl}`,
    });
  } catch (error) {
    return JSON.stringify({
      success: false,
      error: sanitizeYieldToolError(error, language),
    });
  }
}

async function executePrepareYieldAction(input: any): Promise<string> {
  const language = normalizeToolLanguage(input.language || input.lang || input.locale);
  try {
    const action = formatYieldAction(input.action);
    const assetCode = normalizeYieldAssetInput(input.asset_code || input.assetCode || input.currency || 'USDC');
    const result: any = await AnchorService.prepareDefindexYieldForSession({
      ...input,
      action,
      asset_code: assetCode,
    });
    const currency = yieldCurrencyCode(result?.vault?.asset_code || assetCode);
    const amount = String(result?.amount || input.amount || '').trim();
    const name = formatYieldAssetName(result?.vault?.asset_code || assetCode, language);
    const actionText = yieldActionLabel(action, language);
    const sessionId = String(input.session_id || '').trim() || undefined;
    const sessionScope = normalizeToolSessionScope(input.session_scope || input.sessionScope || input.source || input.provider || input.external_source || input.external_provider);
    const rawUrl = buildYieldFrontendUrl({ action, amount, assetCode: result?.vault?.asset_code || assetCode, language, sessionScope });
    const frontendUrl = await shortenYieldUrl(rawUrl, 'rendimentos', sessionId);

    return JSON.stringify({
      success: true,
      prepared: true,
      confirmation_required: true,
      confirmation_available: Boolean((await AnchorService.getDefindexYieldStatus()).runtime.execution_enabled),
      action,
      currency,
      amount,
      frontend_url: frontendUrl,
      review: {
        action: actionText,
        amount,
        currency,
        name,
      },
	      message: language === 'en'
		        ? `Ready to confirm: ${actionText} ${amount} ${name}. Check amount and operation before PIN.\n\nOpen:\n${frontendUrl}`
		        : `Pronto para confirmar: ${actionText} ${amount} ${name}. Confira valor e operação antes do PIN.\n\nAbrir:\n${frontendUrl}`,
    });
  } catch (error) {
    return JSON.stringify({
      success: false,
      error: sanitizeYieldToolError(error, language),
    });
  }
}

async function executeConfirmYieldAction(input: any): Promise<string> {
  const language = normalizeToolLanguage(input.language || input.lang || input.locale);
  try {
    const action = formatYieldAction(input.action);
    const assetCode = normalizeYieldAssetInput(input.asset_code || input.assetCode || input.currency || 'USDC');
    const result: any = await AnchorService.executeDefindexYieldForSession({
      ...input,
      action,
      asset_code: assetCode,
      wallet_pin: input.wallet_pin || input.walletPin || input.pin,
    });
    if (!result?.success) {
      throw new Error(result?.error || 'Application confirmation was not accepted.');
    }
    const currency = yieldCurrencyCode(result?.vault?.asset_code || assetCode);
    const amount = String(result?.amount || input.amount || '').trim();
    const name = formatYieldAssetName(result?.vault?.asset_code || assetCode, language);
    const sessionId = String(input.session_id || '').trim() || undefined;
    const sessionScope = normalizeToolSessionScope(input.session_scope || input.sessionScope || input.source || input.provider || input.external_source || input.external_provider);
    const rawUrl = buildYieldFrontendUrl({ action, amount, assetCode: result?.vault?.asset_code || assetCode, language, sessionScope });
    const frontendUrl = await shortenYieldUrl(rawUrl, 'rendimentos', sessionId);

    return JSON.stringify({
      success: Boolean(result?.success),
      submitted: Boolean(result?.submitted),
      action,
      currency,
      amount,
	      frontend_url: frontendUrl,
	      message: language === 'en'
	        ? `Application submitted for ${amount} ${name}. Your balances will update shortly.\n\nOpen:\n${frontendUrl}`
	        : `Aplicação enviada para ${amount} ${name}. Seus saldos serão atualizados em instantes.\n\nAbrir:\n${frontendUrl}`,
    });
  } catch (error) {
    return JSON.stringify({
      success: false,
      error: sanitizeYieldToolError(error, language),
    });
  }
}

async function buildMonthlySavingsSummaryForBalance(input: any, ownPublicKey?: string): Promise<{
  total_savings_brl: number;
  total_sent_brl: number;
  transfer_count: number;
  comparison: string;
  message: string;
} | null> {
  const sessionId = String(input?.session_id || input?.sessionId || '').trim();
  let userId = String(input?.user_id || input?.userId || '').trim();
  if (!userId) {
    try {
      userId = await resolveToolUserId(input);
    } catch {
      userId = '';
    }
  }
  if (!userId && !sessionId) return null;

  const { start } = monthDateRange();
  try {
    let query = supabase
      .from('payment_logs')
      .select('*')
      .eq('status', 'success')
      .gte('completed_at', start.toISOString())
      .order('completed_at', { ascending: false })
      .limit(500);

    if (sessionId) query = query.eq('session_id', sessionId);
    else query = query.eq('user_id', userId);

    const { data, error } = await query;
    if (error) {
      logger.warn(`[balance-savings] payment_logs unavailable: ${error.message}`);
      return null;
    }

    const rows = (Array.isArray(data) ? data : [])
      .map((row) => savingsSummaryFromPaymentLog(row, ownPublicKey))
      .filter(Boolean)
      .filter((row: any) => row.direction !== 'received') as Array<{
        grossBrl: number;
        savings: number;
      }>;

    const totalSavings = rows.reduce((sum, row) => sum + row.savings, 0);
    const totalSent = rows.reduce((sum, row) => sum + row.grossBrl, 0);
    return {
      total_savings_brl: roundMoney(totalSavings),
      total_sent_brl: roundMoney(totalSent),
      transfer_count: rows.length,
      comparison: 'traditional_bank_3_5pct',
      message: `Economia acumulada este mês: ${normalizeCurrencySpacing(formatBrl(totalSavings))} vs banco tradicional.`,
    };
  } catch (error) {
    logger.warn(`[balance-savings] failed to calculate monthly savings: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

async function executeGetMainnetStatus(): Promise<string> {
  try {
    const status = mainnetWalletService.getStatus();
    const controls = (status as any).controls || {};
    const readiness = (status as any).readiness || {};
    return JSON.stringify({
      success: true,
      status,
      message: [
        'Mainnet esta disponivel como camada separada e protegida.',
        `Runtime principal: ${controls.runtime_network || 'TESTNET'}.`,
        `Modo de envio Mainnet: ${controls.mutations_available ? 'guardado com aprovacao manual' : 'somente leitura / preview'}.`,
        `Bloqueios: ${Array.isArray(readiness.blockers) && readiness.blockers.length ? readiness.blockers.length : 0}.`,
        'Para configurar no navegador, abra /mainnet e anexe apenas a public key G... da carteira Mainnet. Nunca envie secret key.',
      ].join('\n'),
    });
  } catch (error) {
    return JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function executeAttachMainnetWallet(input: any): Promise<string> {
  try {
    const sessionId = String(input.session_id || input.sessionId || '').trim();
    const userId = await resolveToolUserId({ ...input, session_id: sessionId });
    const result = await mainnetWalletService.attachWallet({
      sessionId,
      userId,
      publicKey: String(input.public_key || input.publicKey || '').trim(),
      label: String(input.label || '').trim() || undefined,
    });

    return JSON.stringify({
      ...result,
      message:
        'Carteira Mainnet anexada em modo somente leitura. ' +
        'Eu consigo consultar saldo e historico publico, mas nao guardo secret key nem envio transacoes reais por padrao.',
    });
  } catch (error) {
    return JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function executeGetMainnetBalance(input: any): Promise<string> {
  try {
    const sessionId = String(input.session_id || input.sessionId || '').trim();
    const userId = await resolveToolUserId({ ...input, session_id: sessionId });
    const balance = await mainnetWalletService.getBalance({
      sessionId,
      userId,
      publicKey: String(input.public_key || input.publicKey || '').trim() || undefined,
    });
    const balances = Array.isArray((balance as any).balances) ? (balance as any).balances : [];
    const balanceLines = balances.length
      ? balances.map((item: any) => `${item.asset_code}: ${item.balance}`).join('\n')
      : ((balance as any).funded ? 'Sem linhas de saldo encontradas.' : 'Conta ainda nao funded na Mainnet.');

    return JSON.stringify({
      success: true,
      balance,
      message: [
        'Saldo Stellar Mainnet (rede publica, valor real, leitura somente).',
        balanceLines,
        `Explorer: ${(balance as any).explorer_url || '-'}`,
      ].join('\n'),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return JSON.stringify({
      success: false,
      error: message.includes('mainnet_public_key')
        ? 'Nenhuma carteira Mainnet foi anexada. Abra /mainnet ou envie uma public key G... para configurar em modo somente leitura.'
        : message,
    });
  }
}

async function executePreviewMainnetPayment(input: any): Promise<string> {
  try {
    const sessionId = String(input.session_id || input.sessionId || '').trim();
    const userId = await resolveToolUserId({ ...input, session_id: sessionId });
    const preview = await mainnetWalletService.createPaymentPreview({
      sessionId,
      userId,
      destination: String(input.destination || input.destination_public_key || input.destinationPublicKey || '').trim(),
      amount: String(input.amount || '').trim(),
      assetCode: String(input.asset_code || input.assetCode || 'USDC').trim(),
      memo: String(input.memo || '').trim(),
    });

    return JSON.stringify({
      success: true,
      preview,
      message:
        `${(preview as any).amount} ${(preview as any).asset_code} para ${(preview as any).destination_public_key} validado como preview Mainnet. ` +
        `${(preview as any).can_submit ? 'Envio real exige aprovacao manual e signer configurado.' : 'Envio real esta desativado; nada foi submetido.'}`,
    });
  } catch (error) {
    return JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function executeCreateBrlUsdQuote(input: any): Promise<string> {
  try {
    const quote = await brlUsdQuoteService.createQuote({
      brl_amount: input.brl_amount || input.amount || input.amount_brl,
      user_id: input.user_id || input.userId,
      institution_id: input.institution_id || input.institutionId,
    });

    return JSON.stringify({
      success: true,
      quote,
      message:
        `Cotação criada para entrega internacional em conta USD: ` +
        `R$ ${quote.brl_amount} estimados para US$ ${quote.estimated_usd_amount}. ` +
        `Taxa total estimada: R$ ${quote.total_fee.amount_brl_equivalent}. ` +
        `A cotação vence em ${quote.expires_at}.`,
    });
  } catch (error) {
    return JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function executeCreateUsdBankTransferIntent(input: any): Promise<string> {
  try {
    const transfer = await internationalTransferService.createTransfer({
      quote_id: String(input.quote_id || input.quoteId || '').trim(),
      user_id: input.user_id || input.userId,
      institution_id: input.institution_id || input.institutionId,
      sender_identity: {
        legal_name: input.sender_legal_name || input.senderLegalName,
        entity_name: input.sender_entity_name || input.senderEntityName,
        email: input.sender_email || input.senderEmail,
        country: input.sender_country || input.senderCountry || 'BR',
        type: input.sender_entity_name || input.senderEntityName ? 'institution' : 'individual',
      },
      recipient_identity: {
        legal_name: input.recipient_legal_name || input.recipientLegalName || input.account_holder_name || input.accountHolderName,
        country: input.recipient_country || input.recipientCountry || input.country,
        type: input.account_holder_type || input.accountHolderType,
      },
      payout_destination: {
        accountHolderName: String(input.account_holder_name || input.accountHolderName || '').trim(),
        accountHolderType: (input.account_holder_type || input.accountHolderType || 'individual') === 'business' ? 'business' : 'individual',
        bankName: input.bank_name || input.bankName,
        routingNumber: input.routing_number || input.routingNumber,
        accountNumber: input.account_number || input.accountNumber,
        accountType: input.account_type || input.accountType,
        swiftBic: input.swift_bic || input.swiftBic,
        iban: input.iban,
        country: String(input.country || '').trim(),
        providerLabel: input.provider_label || input.providerLabel || 'other',
      },
      same_name_payout_required: input.same_name_payout_required ?? input.sameNamePayoutRequired,
    });

    return JSON.stringify({
      success: true,
      transfer,
      message:
        `Transferência internacional criada com status ${transfer.status}. ` +
        `Próximo passo: criar a intenção PIX em /api/transfers/${transfer.transfer_id}/pix-intent. ` +
        `Conta destino modelada como conta bancária USD internacional.`,
    });
  } catch (error) {
    return JSON.stringify({
      success: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function executeLogoutSession(input: any): Promise<string> {
  try {
    const sessionId = String(input.session_id || '').trim();
    const provider = String(input.provider || '').trim().toLowerCase();
    const providerUserId = String(input.provider_user_id || input.providerUserId || '').trim();
    if (!sessionId) {
      return JSON.stringify({
        success: false,
        error: "session_id é obrigatório",
      });
    }

    const { data: sessionBeforeLogout } = await supabase
      .from('agent_sessions')
      .select('user_id')
      .eq('session_id', sessionId)
      .maybeSingle();

    void TransferNotificationService.notifySessionLogout({
      sessionId,
      userId: String((sessionBeforeLogout as any)?.user_id || ''),
      provider: provider || undefined,
      providerUserId: providerUserId || undefined,
    });

    // Mark only the current chat context as logged out. Do not clear the shared
    // agent_sessions wallet fields because WhatsApp, Telegram, and browser tabs
    // can be linked to the same account session.
    await supabase
      .from('agent_states')
      .update({
        action_params: { force_logged_out: true },
        pending_payment: null,
        updated_at: new Date().toISOString(),
      })
      .eq('session_id', sessionId);

    if (provider && providerUserId) {
      const { error: unlinkError } = await supabase
        .from('external_accounts')
        .update({
          session_id: null,
          user_id: null,
          updated_at: new Date().toISOString(),
        })
        .eq('provider', provider)
        .eq('provider_user_id', providerUserId)
        .eq('session_id', sessionId);

      if (unlinkError) {
        const message = String(unlinkError.message || '').toLowerCase();
        if (!message.includes('external_accounts') && !message.includes('schema cache') && !message.includes('does not exist')) {
          throw new Error(unlinkError.message || 'Falha ao desvincular sessão externa');
        }
      }
    }

    return JSON.stringify({
      success: true,
      message: "Sessão encerrada com sucesso. Você pode entrar novamente quando quiser.",
    });
  } catch (error) {
    return JSON.stringify({
      success: false,
      error: publicErrorMessage(error, 'Não consegui encerrar a sessão agora. Tente novamente em alguns segundos.'),
    });
  }
}

async function executeSetAlertThreshold(input: any): Promise<string> {
  const walletId = Number(input.wallet_id || input.walletId);
  const threshold = Number(input.threshold_usdc || input.thresholdUsdc || input.threshold);
  const success = await BalanceAlertService.setAlertThreshold(walletId, threshold);
  return JSON.stringify({
    success,
    wallet_id: walletId,
    threshold_usdc: threshold,
  });
}

async function executeGetConversionRules(input: any): Promise<string> {
  const walletId = Number(input.wallet_id || input.walletId);
  const rules = await AutoConversionService.getWalletConversionRules(walletId);
  return JSON.stringify({
    success: true,
    wallet_id: walletId,
    rules: (rules || []).map((rule: any) => ({
      id: rule.id,
      from_asset: rule.from_asset_code,
      to_asset: rule.to_asset_code,
      min_amount: rule.min_amount,
      trigger: rule.trigger_type,
      enabled: rule.enabled,
    })),
  });
}

async function executeDisableConversionRule(input: any): Promise<string> {
  const ruleId = String(input.rule_id || input.ruleId || '').trim();
  const success = await AutoConversionService.disableConversionRule(ruleId);
  return JSON.stringify({
    success,
    rule_id: ruleId,
  });
}

/**
 * Tool: Create Account
 */
async function executeCreateWallet(input: any): Promise<string> {
  try {
    logger.debug("Tool: Creating account");
    const result = await UserService.onboardUser({
      name: input.name,
      email: input.email,
      phoneNumber: input.phone_number,
      publicKey: input.public_key,
      secretKey: input.secret_key,
    });
    return JSON.stringify({
      success: true,
      user_id: result.userId,
      message: input.secret_key
        ? "Account imported successfully!"
        : "Account linked successfully!",
    });
  } catch (error) {
    return JSON.stringify({
      success: false,
      error: publicErrorMessage(error, 'Não consegui criar a conta agora. Tente novamente em alguns segundos.'),
    });
  }
}

/**
 * Tool: Get Balance
 */
async function executeGetBalance(input: any): Promise<string> {
  try {
    const publicKey = await resolveToolPublicKey(input);
    logger.debug(`Tool: Getting balance for ${publicKey}`);
    const accountLookup = await getAccountWithTestnetRepair(input, publicKey);
    if (!accountLookup.account) {
      return JSON.stringify({
        success: false,
        code: 'account_preparing',
        error: accountPreparationMessage(),
      });
    }
    let account = accountLookup.account;

    const defaultVisibleAssets = getStellarNetworkName() === 'TESTNET'
      ? ['BRL', 'USDC', 'CETES', 'XLM']
      : ['BRL', 'USDC', 'EUR', 'XLM'];
    const visibleAssets = [...defaultVisibleAssets, ...getUserFacingAssetCodes()]
      .map((asset) => userFacingAssetCode(asset))
      .filter((asset, index, all) => asset && all.indexOf(asset) === index);
    let balances = account.balances.map(normalizeBalanceLine);

    const initialFundingRepair = await maybeRepairInitialFundingSweep(input, publicKey, balances);
    if (initialFundingRepair.account) {
      account = initialFundingRepair.account;
      balances = account.balances.map(normalizeBalanceLine);
    }

    const filteredBalances = visibleAssets.map((asset) => {
      const matched = balances.find((balance: any) => balanceMatchesConfiguredAsset(balance, asset));
      return matched
        ? { ...matched, asset, asset_code: asset }
        : {
            asset,
            asset_code: asset,
            balance: '0.0000000',
          };
    });
    const monthlySavings = await buildMonthlySavingsSummaryForBalance(input, publicKey);
    return JSON.stringify({
      success: true,
      balance: filteredBalances[0]?.balance || "0.0000000",
      asset: filteredBalances[0]?.asset || "BRL",
      balances: filteredBalances,
      monthly_savings: monthlySavings,
      account_ready: true,
      initial_balance_prepared: Boolean(initialFundingRepair.attempted && initialFundingRepair.completed),
      message: initialFundingRepair.attempted && initialFundingRepair.completed
        ? 'Saldo pronto.'
        : accountLookup.account_repair.attempted && accountLookup.account_repair.completed
          ? 'Conta pronta.'
        : `User-facing balances retrieved: ${filteredBalances.length} asset(s)`,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return JSON.stringify({
      success: false,
      error: errorMessage,
    });
  }
}

/**
 * Tool: Get Account
 */
async function executeGetAccount(input: any): Promise<string> {
  try {
    const publicKey = await resolveToolPublicKey(input);
    logger.debug(`Tool: Getting account details for ${publicKey}`);
    const accountLookup = await getAccountWithTestnetRepair(input, publicKey);
    if (!accountLookup.account) {
      return JSON.stringify({
        success: false,
        error: accountPreparationMessage(),
        account_repair: accountLookup.account_repair,
      });
    }
    const account = accountLookup.account;
    const balances = account.balances.map((b: any) => ({
      asset: getAssetCode(b),
      balance: b.balance,
      type: b.asset_type,
      asset_issuer: b.asset_issuer,
    }));
    return JSON.stringify({
      success: true,
      account_id: account.id,
      sequence: account.sequence,
      balances,
      technical_balances: balances,
      account_repair: accountLookup.account_repair,
      message: "Account details retrieved",
    });
  } catch (error) {
    return JSON.stringify({
      success: false,
      error: publicErrorMessage(error, 'Não consegui consultar sua conta agora. Tente novamente em alguns segundos.'),
    });
  }
}

async function executeGetSaldoTecnico(input: any): Promise<string> {
  try {
    const publicKey = await resolveToolPublicKey(input);
    logger.debug(`Tool: Getting technical balances for ${publicKey}`);
    const accountLookup = await getAccountWithTestnetRepair(input, publicKey);
    if (!accountLookup.account) {
      return JSON.stringify({
        success: false,
        error: accountPreparationMessage(),
        account_repair: accountLookup.account_repair,
      });
    }
    const account = accountLookup.account;

    const mappedBalances = account.balances.map((balance: any) => ({
      asset: getAssetCode(balance),
      balance: String(balance.balance || '0.0000000'),
      type: balance.asset_type,
      asset_issuer: balance.asset_issuer,
    }));

    const technicalAssets = ['XLM', ...getUserFacingAssetCodes()]
      .filter((assetCode, index, all) => all.indexOf(assetCode) === index)
      .map((assetCode) => {
        const existing = mappedBalances.find((balance: any) => balanceMatchesConfiguredAsset(balance, assetCode));
        if (existing) return existing;
        return {
          asset: assetCode,
          balance: '0.0000000',
          type: assetCode === 'XLM' ? 'native' : 'credit_alphanum4',
          asset_issuer: assetCode === 'XLM' ? undefined : getAssetIssuer(assetCode),
        };
      });

    return JSON.stringify({
      success: true,
      public_key: publicKey,
      account_id: account.id,
      sequence: account.sequence,
      balances: technicalAssets,
      account_repair: accountLookup.account_repair,
      message: "Technical balances retrieved",
    });
  } catch (error) {
    return JSON.stringify({
      success: false,
      error: publicErrorMessage(error, 'Não consegui consultar sua conta agora. Tente novamente em alguns segundos.'),
    });
  }
}

/**
 * Tool: Build Payment
 */
async function executeBuildPayment(input: any): Promise<string> {
  try {
    logger.debug(`Tool: Building payment from ${input.source_public_key} to ${input.destination}`);
    const assetCode = input.asset_code || input.assetCode || "XLM";
    const xdr = await stellarService.buildPayment(
      input.source_public_key,
      {
        destination: input.destination,
        amount: input.amount,
        asset_code: assetCode,
        asset_issuer: input.asset_issuer || input.assetIssuer,
      },
      input.memo
    );
    return JSON.stringify({
      success: true,
      xdr,
      asset_code: assetCode,
      message: `Payment transaction built: ${input.amount} ${assetCode} to ${input.destination}. Must be signed and submitted.`,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return JSON.stringify({
      success: false,
      error: errorMessage,
    });
  }
}

/**
 * Tool: Quote Asset Transfer
 */
async function executeQuoteAssetTransfer(input: any): Promise<string> {
  try {
    const sourceAmount = input.source_amount || input.sourceAmount;
    const quote = sourceAmount
      ? await ApiStellarService.quoteStrictSendConversion({
          sourcePublicKey: String(input.source_public_key || input.sourcePublicKey || ''),
          destination: String(input.destination || ''),
          sourceAmount: String(sourceAmount),
          destAsset: normalizeAssetInput(input.dest_asset_code || input.destAssetCode, input.dest_asset_issuer || input.destAssetIssuer),
          sourceAsset: normalizeAssetInput(input.source_asset_code || input.sourceAssetCode, input.source_asset_issuer || input.sourceAssetIssuer),
        })
      : await ApiStellarService.quotePathPayment({
          sourcePublicKey: String(input.source_public_key || input.sourcePublicKey || ''),
          destination: String(input.destination || ''),
          destAmount: String(input.dest_amount || input.destAmount || input.amount || ''),
          destAsset: normalizeAssetInput(input.dest_asset_code || input.destAssetCode, input.dest_asset_issuer || input.destAssetIssuer),
          sourceAsset: normalizeAssetInput(input.source_asset_code || input.sourceAssetCode, input.source_asset_issuer || input.sourceAssetIssuer),
        });
    const feeBreakdown = await buildTransparentFeeBreakdown({
      networkFeeXlm: quote.networkFeeXlm,
      platformFeeAmount: quote.platformFee?.feeAmount || null,
      platformFeeAssetCode: quote.platformFee?.feeAssetCode || null,
      sourceAssetCode: quote.sourceAsset?.code,
      destinationAssetCode: quote.destinationAsset?.code,
    });
    const expiringQuote = attachQuoteExpiry({
      ...quote,
      fee_display: feeBreakdown.total_fee_display,
      fee_usdc: feeBreakdown.estimated_fee_usdc,
      fee_brl: feeBreakdown.estimated_fee_brl,
    });
    const sourceLabel = formatCustomerAssetAmount(expiringQuote.sourceAmount, expiringQuote.sourceAsset.code);
    const destinationLabel = formatCustomerAssetAmount(expiringQuote.destinationAmount, expiringQuote.destinationAsset.code);
    const sourceNumeric = toAmountNumber(expiringQuote.sourceAmount);
    const destinationNumeric = toAmountNumber(expiringQuote.destinationAmount);
    const effectiveRate = sourceNumeric > 0 && destinationNumeric > 0 ? destinationNumeric / sourceNumeric : 0;
    const crossAsset = isCrossAssetPair(expiringQuote.sourceAsset?.code, expiringQuote.destinationAsset?.code);
    const savingsEstimate = crossAsset
      ? buildSavingsEstimate({
          sourceAmount: expiringQuote.sourceAmount,
          sourceAssetCode: expiringQuote.sourceAsset?.code,
          quote: expiringQuote,
          estimatedFeeBrl: feeBreakdown.estimated_fee_brl,
        })
      : null;

    return JSON.stringify({
      success: true,
      quote: expiringQuote,
      optimization_criteria: sourceAmount
        ? 'maximizar recebimento no destino para o valor de envio informado'
        : 'minimizar gasto na origem para o valor de recebimento informado',
      route: {
        chain: formatRouteChain({
          sourceAssetCode: quote.sourceAsset?.code,
          destinationAssetCode: quote.destinationAsset?.code,
          path: quote.path,
        }),
        hops_count: Array.isArray(quote.path) ? quote.path.length : 0,
      },
      fee_breakdown: feeBreakdown,
      savings_estimate: savingsEstimate,
      effective_rate: {
        destination_per_source: Number.isFinite(effectiveRate) ? effectiveRate.toFixed(8) : null,
        label: Number.isFinite(effectiveRate) && effectiveRate > 0
          ? `1 ${quote.sourceAsset?.code} = ${effectiveRate.toFixed(8)} ${quote.destinationAsset?.code}`
          : null,
      },
      quote_expires_at: expiringQuote.quote_expires_at,
      quote_ttl_seconds: expiringQuote.quote_ttl_seconds,
      message:
        (sourceAmount
          ? `Estimativa antes de confirmar: ${sourceLabel} deve entregar aproximadamente ${destinationLabel}. `
          : `Estimativa antes de confirmar: para receber ${destinationLabel}, será usado ${sourceLabel}. `) +
        `Rota mais otimizada: ${formatQuotePath(quote.path, quote.sourceAsset?.code, quote.destinationAsset?.code)}. ` +
        `Taxa total estimada: ${feeBreakdown.total_fee_display}. ` +
        `${savingsEstimate ? `Rota mais barata encontrada: economia estimada de ${formatBrl(Number(savingsEstimate.estimated_savings_brl || 0))} vs métodos tradicionais (${formatPercent(Number(savingsEstimate.savings_percentage_over_traditional_fee || 0))}). ` : ''}` +
        `Estimativa válida por ${expiringQuote.quote_ttl_seconds} segundos.`,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return JSON.stringify({
      success: false,
      error: formatNoPathFallbackMessage(errorMessage),
    });
  }
}

async function executeGetBestRoute(input: any): Promise<string> {
  try {
    const sourceAmount = String(input.source_amount || input.sourceAmount || '').trim();
    const destinationAmount = String(input.dest_amount || input.destAmount || '').trim();
    if (!sourceAmount && !destinationAmount) {
      return JSON.stringify({
        success: false,
        error: "Informe source_amount (quanto gastar) ou dest_amount (quanto receber) para calcular a melhor rota.",
      });
    }

    const sourceAsset = normalizeAssetInput(
      input.source_asset_code || input.sourceAssetCode,
      input.source_asset_issuer || input.sourceAssetIssuer
    );
    const destinationAsset = normalizeAssetInput(
      input.dest_asset_code || input.destAssetCode,
      input.dest_asset_issuer || input.destAssetIssuer
    );

    const quoteInputBase = {
      sourcePublicKey: String(input.source_public_key || input.sourcePublicKey || '').trim(),
      destination: String(input.destination || '').trim(),
      sourceAsset,
      destAsset: destinationAsset,
    };

    const usesStrictSend = Boolean(sourceAmount);
    const quote = usesStrictSend
      ? await ApiStellarService.quoteStrictSendConversion({
          ...quoteInputBase,
          sourceAmount,
        })
      : await ApiStellarService.quotePathPayment({
          ...quoteInputBase,
          destAmount: destinationAmount,
        });

    const feeBreakdown = await buildTransparentFeeBreakdown({
      networkFeeXlm: quote.networkFeeXlm,
      platformFeeAmount: quote.platformFee?.feeAmount || null,
      platformFeeAssetCode: quote.platformFee?.feeAssetCode || null,
      sourceAssetCode: quote.sourceAsset?.code,
      destinationAssetCode: quote.destinationAsset?.code,
    });
    const expiringQuote = attachQuoteExpiry({
      ...quote,
      fee_display: feeBreakdown.total_fee_display,
      fee_usdc: feeBreakdown.estimated_fee_usdc,
      fee_brl: feeBreakdown.estimated_fee_brl,
    });

    const routeChain = formatRouteChain({
      sourceAssetCode: quote.sourceAsset?.code,
      destinationAssetCode: quote.destinationAsset?.code,
      path: quote.path,
    });
    const criteria = usesStrictSend
      ? "maximizar recebimento no destino para o valor de envio informado"
      : "minimizar gasto na origem para o valor de recebimento informado";
    const sourceNumeric = toAmountNumber(quote.sourceAmount);
    const destinationNumeric = toAmountNumber(quote.destinationAmount);
    const destinationPerSource = sourceNumeric > 0 && destinationNumeric > 0 ? destinationNumeric / sourceNumeric : 0;
    const sourcePerDestination = sourceNumeric > 0 && destinationNumeric > 0 ? sourceNumeric / destinationNumeric : 0;
    const totalFeeBrl = toAmountNumber(feeBreakdown.estimated_fee_brl);
    const totalFeeUsdc = toAmountNumber(feeBreakdown.estimated_fee_usdc);
    const feePctOverSource = sourceNumeric > 0 && totalFeeUsdc > 0 ? (totalFeeUsdc / sourceNumeric) * 100 : 0;
    const crossAsset = isCrossAssetPair(quote.sourceAsset?.code, quote.destinationAsset?.code);
    const savingsEstimate = crossAsset
      ? buildSavingsEstimate({
          sourceAmount: quote.sourceAmount,
          sourceAssetCode: quote.sourceAsset?.code,
          quote,
          estimatedFeeBrl: feeBreakdown.estimated_fee_brl,
        })
      : null;

    return JSON.stringify({
      success: true,
      mode: usesStrictSend ? "strict_send" : "strict_receive",
      optimization_criteria: criteria,
      route: {
        path_hops: quote.path || [],
        chain: routeChain || formatQuotePath(quote.path, quote.sourceAsset?.code, quote.destinationAsset?.code),
        hops_count: Array.isArray(quote.path) ? quote.path.length : 0,
      },
      source: {
        amount: quote.sourceAmount,
        asset_code: quote.sourceAsset?.code,
        asset_issuer: quote.sourceAsset?.issuer || null,
      },
      destination: {
        amount: quote.destinationAmount,
        asset_code: quote.destinationAsset?.code,
        asset_issuer: quote.destinationAsset?.issuer || null,
      },
      fee_breakdown: {
        ...feeBreakdown,
        fee_pct_over_source_estimate: feePctOverSource > 0 ? formatPercent(feePctOverSource) : '0,00%',
      },
      savings_estimate: savingsEstimate,
      effective_rate: {
        destination_per_source: destinationPerSource > 0 ? destinationPerSource.toFixed(8) : null,
        source_per_destination: sourcePerDestination > 0 ? sourcePerDestination.toFixed(8) : null,
        label: destinationPerSource > 0
          ? `1 ${quote.sourceAsset?.code} = ${destinationPerSource.toFixed(8)} ${quote.destinationAsset?.code}`
          : null,
      },
      total_fee_estimate: {
        brl: totalFeeBrl > 0 ? totalFeeBrl.toFixed(8) : '0',
        usdc: totalFeeUsdc > 0 ? totalFeeUsdc.toFixed(8) : '0',
      },
      quote: expiringQuote,
      quote_expires_at: expiringQuote.quote_expires_at,
      quote_ttl_seconds: expiringQuote.quote_ttl_seconds,
      message:
        `Rota mais otimizada agora: ${routeChain || formatQuotePath(quote.path, quote.sourceAsset?.code, quote.destinationAsset?.code)}. ` +
        `Critério: ${criteria}. ` +
        `Taxa total estimada: ${feeBreakdown.total_fee_display}. ` +
        `${savingsEstimate ? `Rota mais barata encontrada: economia estimada de ${formatBrl(Number(savingsEstimate.estimated_savings_brl || 0))} vs métodos tradicionais (${formatPercent(Number(savingsEstimate.savings_percentage_over_traditional_fee || 0))}). ` : ''}` +
        `Estimativa válida por ${expiringQuote.quote_ttl_seconds} segundos.`,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return JSON.stringify({
      success: false,
      error: formatNoPathFallbackMessage(errorMessage),
    });
  }
}

/**
 * Tool: Convert Assets Internally
 */
async function executeConvertAssets(input: any): Promise<string> {
  try {
    const sessionId = String(input.session_id || input.sessionId || '');
    const userId = String(input.user_id || input.userId || '');
    const wallet = await walletRepo.getWalletBySession(sessionId);

    if (!wallet?.public_key || !wallet?.vault_secret_id) {
      throw new Error('Wallet signing configuration not found for this session.');
    }

    const quoteInput = {
      sourcePublicKey: wallet.public_key,
      destination: wallet.public_key,
      destAmount: String(input.dest_amount || input.destAmount || input.amount || ''),
      sourceAmount: String(input.source_amount || input.sourceAmount || ''),
      destAsset: normalizeAssetInput(input.dest_asset_code || input.destAssetCode, input.dest_asset_issuer || input.destAssetIssuer),
      sourceAsset: normalizeAssetInput(input.source_asset_code || input.sourceAssetCode, input.source_asset_issuer || input.sourceAssetIssuer),
    };

    const usesStrictSend = Boolean(quoteInput.sourceAmount);
    const quote = usesStrictSend
      ? await ApiStellarService.quoteStrictSendConversion({
          sourcePublicKey: quoteInput.sourcePublicKey,
          destination: quoteInput.destination,
          sourceAmount: quoteInput.sourceAmount,
          destAsset: quoteInput.destAsset,
          sourceAsset: quoteInput.sourceAsset,
        })
      : await ApiStellarService.quotePathPayment(quoteInput);
    const unsignedXdr = usesStrictSend
      ? await ApiStellarService.buildStrictSendConversionXdr({
          sourcePublicKey: quoteInput.sourcePublicKey,
          destination: quoteInput.destination,
          sourceAmount: quoteInput.sourceAmount,
          destAsset: quoteInput.destAsset,
          sourceAsset: quoteInput.sourceAsset,
        })
      : await ApiStellarService.buildPathPaymentXdr(quoteInput);
      const operationType = usesStrictSend ? 'PATH_PAYMENT_STRICT_SEND' : 'PATH_PAYMENT_STRICT_RECEIVE';
    const secretKey = await vaultService.getSecret(String(wallet.vault_secret_id));
    const result = await ApiStellarService.signAndSubmitXdr(
      userId,
      secretKey,
      unsignedXdr,
      {
        user_id: userId,
          type: operationType,
        destination_key: wallet.public_key,
        asset_code: quote.destinationAsset.code,
        amount: Number(quote.destinationAmount),
        context:
            `Conversão interna real: ${quote.sourceAmount} ${quote.sourceAsset.code} ` +
            `para ${quote.destinationAmount} ${quote.destinationAsset.code}.`,
        source_public_key: wallet.public_key,
        source_session_id: wallet.session_id,
        destination_session_id: wallet.session_id,
      }
    );

    if (!result.success) {
      return JSON.stringify({
        success: false,
        quote,
        error: result.error || 'Could not submit conversion',
      });
    }

    const submittedDetails = result.hash
      ? await ApiStellarService.getSubmittedPaymentDetails(result.hash)
      : null;
    const sourceAmount = submittedDetails?.sourceAmount || quote.sourceAmount;
    const sourceAssetCode = submittedDetails?.sourceAssetCode || quote.sourceAsset.code;
    const destinationAmount = submittedDetails?.destinationAmount || quote.destinationAmount;
    const destinationAssetCode = submittedDetails?.destinationAssetCode || quote.destinationAsset.code;
    const feeDisplay = await formatNetworkFeeForCustomer(submittedDetails?.feeXlm || quote.networkFeeXlm);
    const unifiedFee = buildUnifiedFeeDisplay({
      networkFee: feeDisplay,
      platformFeeAmount: quote.platformFee?.feeAmount || null,
      platformFeeAssetCode: quote.platformFee?.feeAssetCode || null,
      sourceAssetCode: sourceAssetCode,
      destinationAssetCode: destinationAssetCode,
    });
    const feeLine = submittedDetails?.feeXlm || quote.networkFeeXlm
      ? ` Taxa total: ${unifiedFee.display}.`
      : ` Taxa total: R$ 0,00 / US$ 0,00.`;
    const sourceLabel = formatCustomerAssetAmount(sourceAmount, sourceAssetCode);
    const destinationLabel = formatCustomerAssetAmount(destinationAmount, destinationAssetCode);

    return JSON.stringify({
      success: true,
      hash: result.hash,
      quote: {
        ...quote,
        fee_display: unifiedFee.display,
        fee_usdc: unifiedFee.fee_usdc,
        fee_brl: unifiedFee.fee_brl,
      },
      transferDetails: submittedDetails ? {
        ...submittedDetails,
        feeDisplay: unifiedFee.display,
        feeUsdc: unifiedFee.fee_usdc,
        feeBrl: unifiedFee.fee_brl,
        platformFeeDisplay: null,
        totalFeeDisplay: unifiedFee.display,
      } : submittedDetails,
      operation_type: operationType,
      message:
        `${sourceLabel} convertidos para ${destinationLabel} em poucos segundos.` +
        `${feeLine} Recibo disponível no seu histórico.`,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return JSON.stringify({
      success: false,
      error: formatNoPathFallbackMessage(errorMessage),
    });
  }
}

async function executeEnsureTrustline(input: any): Promise<string> {
  try {
    const sessionId = String(input.session_id || input.sessionId || '').trim();
    const userId = String(input.user_id || input.userId || '').trim();
    const requestedPublicKey = String(input.public_key || input.publicKey || '').trim();
    const asset = normalizeAssetInput(input.asset_code || input.assetCode || input.asset, input.asset_issuer || input.assetIssuer);

    if (asset.code === 'XLM') {
      return JSON.stringify({ success: true, asset_code: 'XLM' });
    }

    if (!asset.issuer) {
      throw new Error(`${asset.code}_ISSUER não está configurado no backend.`);
    }

    const wallet = sessionId
      ? await walletRepo.getWalletBySession(sessionId)
      : await walletRepo.getWalletByPublicKey(requestedPublicKey);

    if (!wallet?.public_key || !wallet?.vault_secret_id) {
      throw new Error('Wallet signing configuration not found for this session.');
    }

    const publicKey = requestedPublicKey || wallet.public_key;
    if (wallet.public_key !== publicKey) {
      throw new Error('A chave pública informada não pertence à sessão atual.');
    }

    const balances = await ApiStellarService.getAccountBalance(publicKey);
    const hasTrustline = balances.some((balance: any) =>
      String(balance.asset_code || '').toUpperCase() === asset.code &&
      String(balance.asset_issuer || '') === asset.issuer
    );

    if (hasTrustline) {
      return JSON.stringify({
        success: true,
        asset_code: asset.code,
        asset_issuer: asset.issuer,
        message: `Trustline de ${asset.code} já está ativa.`,
      });
    }

    const trustlineXdr = await ApiStellarService.buildTrustlineXdr({
      sourcePublicKey: publicKey,
      assetCode: asset.code,
      assetIssuer: asset.issuer,
    });
    const secretKey = await vaultService.getSecret(String(wallet.vault_secret_id));
    const result = await ApiStellarService.signAndSubmitXdr(
      userId,
      secretKey,
      trustlineXdr,
      {
        user_id: userId,
        type: 'TRUSTLINE',
        asset_code: asset.code,
        source_public_key: publicKey,
        source_session_id: wallet.session_id,
        context: `Trustline ${asset.code}`,
      }
    );

    if (!result.success) {
      return JSON.stringify({
        success: false,
        asset_code: asset.code,
        asset_issuer: asset.issuer,
        error: result.error || `Could not create ${asset.code} trustline`,
      });
    }

    return JSON.stringify({
      success: true,
      asset_code: asset.code,
      asset_issuer: asset.issuer,
      hash: result.hash,
      message: `Trustline de ${asset.code} criada.`,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return JSON.stringify({
      success: false,
      error: errorMessage,
    });
  }
}

/**
 * Tool: Prepare Payment Confirmation
 */
async function executePreparePaymentConfirmation(input: any): Promise<string> {
  try {
    logger.debug(`Tool: Preparing payment confirmation for ${input.amount} to ${input.destination}`);
    const externalService = new ExternalService(supabase as any);

    // Accept several possible parameter names for the recipient public key
    const destinationCandidate =
      input.destination ||
      input.public_key_recipient ||
      input.recipient_public_key ||
      input.public_key ||
      input.recipient ||
      undefined;

    let normalizedDestination = destinationCandidate ? String(destinationCandidate).trim() : '';
    normalizedDestination = repairLegacyStarterContactKey(normalizedDestination);
    const quote = input.quote && typeof input.quote === 'object' ? input.quote : null;
    const contextMessage = String(input.memo || input.context_message || '').replace(/\s+/g, ' ').trim().slice(0, 120);
    const destinationAmount = input.destination_amount || input.destinationAmount || quote?.destinationAmount;
    const normalizedAmount = destinationAmount
      ? String(destinationAmount).trim()
      : (input.amount ? String(input.amount).trim() : '');

    // Resolve a friendly name for the destination when possible
    let destinationName: string | undefined = input.destination_name ? String(input.destination_name).trim() : undefined;
    if (!destinationName && input.destination_contact && (input.destination_contact.contact_name || input.destination_contact.name)) {
      destinationName = input.destination_contact.contact_name || input.destination_contact.name;
    }

    if (normalizedDestination && !/^G[A-Z2-7]{55}$/i.test(normalizedDestination)) {
      const resolvedByPix = await resolveContactPublicKeyByPixKey(normalizedDestination);
      if (resolvedByPix.publicKey) {
        normalizedDestination = resolvedByPix.publicKey;
        destinationName = destinationName || resolvedByPix.name || normalizedDestination;
      }
    }

    if (!destinationName && normalizedDestination) {
      try {
        const { data: contactRows, error } = await supabase
          .from('contacts')
          .select('contact_name, stellar_public_key, pix_key')
          .eq('stellar_public_key', normalizedDestination)
          .limit(1);
        if (!error && contactRows && contactRows.length > 0) {
          destinationName = contactRows[0].contact_name || undefined;
        }
      } catch (err) {
        // ignore lookup failures
      }
    }
    if (isWeakPaymentRecipientName(destinationName)) {
      destinationName = paymentRecipientFallbackLabel(input, normalizedDestination) || destinationName;
    }

    const assetCode = normalizeAssetCode(
      input.destination_asset_code ||
      input.destinationAssetCode ||
      quote?.destinationAsset?.code ||
      input.asset_code ||
      input.asset ||
      input.currency ||
      'XLM'
    );
    const asset = normalizeAssetInput(
      assetCode,
      input.destination_asset_issuer ||
      input.destinationAssetIssuer ||
      quote?.destinationAsset?.issuer ||
      input.asset_issuer ||
      input.assetIssuer
    );
    const sourceAssetCodeForFee = String(quote?.sourceAsset?.code || input.source_asset_code || input.sourceAssetCode || asset.code).trim().toUpperCase();
    const destinationAssetCodeForFee = String(quote?.destinationAsset?.code || asset.code).trim().toUpperCase();
    const platformFee = quote?.platformFee || PlatformFeeService.calculateSpread({
      sourceAmount: normalizedAmount,
      sourceAssetCode: sourceAssetCodeForFee,
      destinationAssetCode: destinationAssetCodeForFee,
      mode: 'add_on_top',
    });
    const estimatedNetworkFeeXlm = quote?.networkFeeXlm || input.estimated_fee_xlm || DEFAULT_NETWORK_FEE_XLM;
    const networkFee = await formatNetworkFeeForCustomer(estimatedNetworkFeeXlm);
    const unifiedFee = buildUnifiedFeeDisplay({
      networkFee,
      platformFeeAmount: platformFee?.feeAmount || null,
      platformFeeAssetCode: platformFee?.feeAssetCode || null,
      sourceAssetCode: sourceAssetCodeForFee,
      destinationAssetCode: destinationAssetCodeForFee,
    });
    const routeChain = quote
      ? formatRouteChain({
          sourceAssetCode: quote?.sourceAsset?.code || input.source_asset_code || input.sourceAssetCode,
          destinationAssetCode: quote?.destinationAsset?.code || asset.code,
          path: quote?.path || [],
        })
      : '';
    const crossAsset = isCrossAssetPair(sourceAssetCodeForFee, destinationAssetCodeForFee);
    const savingsEstimate = crossAsset
      ? buildSavingsEstimate({
          sourceAmount: input.source_amount || input.sourceAmount || quote?.sourceAmount || normalizedAmount,
          sourceAssetCode: sourceAssetCodeForFee,
          quote,
          estimatedFeeBrl: unifiedFee.fee_brl || null,
        })
      : null;

    const { url } = await externalService.createPaymentConfirmUrl({
      amount: normalizedAmount,
      asset_code: asset.code,
      asset_issuer: asset.issuer,
      destination: normalizedDestination,
      destination_name: destinationName,
      destination_contact: input.destination_contact || undefined,
      session_id: String(input.session_id),
      owner_id: String(input.owner_id),
    }, {
      estimated_fee_display: unifiedFee.display,
      estimated_fee_usdc: unifiedFee.fee_usdc || null,
      estimated_fee_brl: unifiedFee.fee_brl || null,
      estimated_platform_fee: null,
      estimated_platform_fee_amount: null,
      estimated_platform_fee_asset_code: null,
      estimated_spread_fee: null,
      route_chain: crossAsset ? (routeChain || null) : null,
      optimization_criteria: String(input.optimization_criteria || '').trim() || null,
      savings_estimate: savingsEstimate,
      quote: quote || null,
      quote_issued_at: quote?.quote_issued_at || null,
      quote_expires_at: quote?.quote_expires_at || null,
      quote_ttl_seconds: quote?.quote_ttl_seconds || quoteTtlSeconds(),
      source_amount: input.source_amount || input.sourceAmount || quote?.sourceAmount || null,
      source_asset_code: input.source_asset_code || input.sourceAssetCode || quote?.sourceAsset?.code || null,
      source_asset_issuer: input.source_asset_issuer || input.sourceAssetIssuer || quote?.sourceAsset?.issuer || null,
      destination_amount: input.destination_amount || input.destinationAmount || quote?.destinationAmount || normalizedAmount,
      destination_asset_code: input.destination_asset_code || input.destinationAssetCode || quote?.destinationAsset?.code || asset.code,
      destination_asset_issuer: input.destination_asset_issuer || input.destinationAssetIssuer || quote?.destinationAsset?.issuer || asset.issuer || null,
      transaction_context_message: contextMessage || null,
      memo: contextMessage || null,
      language: input.language || input.lang || input.locale || null,
      provider: String(input.provider || input.external_provider || '').trim() || null,
      provider_user_id: String(input.provider_user_id || input.providerUserId || input.external_provider_user_id || '').trim() || null,
      source: String(input.source || input.external_source || input.provider || input.external_provider || '').trim() || null,
      return_to: String(input.return_to || input.returnTo || '').trim() || null,
      return_source: String(input.return_source || input.returnSource || input.from || '').trim() || null,
    });

    return JSON.stringify({
      success: true,
      url,
      asset: asset.code,
      route_chain: crossAsset ? (routeChain || null) : null,
      savings_estimate: savingsEstimate,
      estimated_fee_display: unifiedFee.display,
      estimated_platform_fee: null,
      message:
        `Gerei o link de confirmação da forma mais otimizada para enviar ${normalizedAmount} ${asset.code} para ${destinationName || normalizedDestination}. ` +
        `${contextMessage ? `Mensagem do pagamento: "${contextMessage}". ` : ''}` +
        `Abra para revisar e confirmar com PIN:\n\n${url}`,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return JSON.stringify({
      success: false,
      error: errorMessage,
    });
  }
}

async function executePrepareConversionConfirmation(input: any): Promise<string> {
  try {
    logger.debug(`Tool: Preparing conversion confirmation for session ${input.session_id}`);
    const externalService = new ExternalService(supabase as any);

    const sourceAsset = normalizeAssetInput(
      input.source_asset_code || input.sourceAssetCode || 'XLM',
      input.source_asset_issuer || input.sourceAssetIssuer
    );
    const destAsset = normalizeAssetInput(
      input.dest_asset_code || input.destAssetCode || 'XLM',
      input.dest_asset_issuer || input.destAssetIssuer
    );

    const sourceAmount = String(input.source_amount || input.sourceAmount || '').trim() || undefined;
    const destAmount = String(input.dest_amount || input.destAmount || input.amount || '').trim();
    const networkFee = await formatNetworkFeeForCustomer(input.quote?.networkFeeXlm || DEFAULT_NETWORK_FEE_XLM);
    const unifiedFee = buildUnifiedFeeDisplay({
      networkFee,
      platformFeeAmount: input.quote?.platformFee?.feeAmount || null,
      platformFeeAssetCode: input.quote?.platformFee?.feeAssetCode || null,
      sourceAssetCode: sourceAsset.code,
      destinationAssetCode: destAsset.code,
    });
    const routeChain = formatRouteChain({
      sourceAssetCode: input.quote?.sourceAsset?.code || sourceAsset.code,
      destinationAssetCode: input.quote?.destinationAsset?.code || destAsset.code,
      path: input.quote?.path || [],
    });
    const crossAsset = isCrossAssetPair(sourceAsset.code, destAsset.code);
    const savingsEstimate = crossAsset
      ? buildSavingsEstimate({
          sourceAmount: sourceAmount || input.quote?.sourceAmount || destAmount,
          sourceAssetCode: sourceAsset.code,
          quote: input.quote || null,
          estimatedFeeBrl: unifiedFee.fee_brl || null,
        })
      : null;

    const { url } = await externalService.createConversionConfirmUrlWithContext({
      session_id: String(input.session_id || input.sessionId || '').trim(),
      owner_id: String(input.owner_id || input.ownerId || '').trim(),
      source_amount: sourceAmount,
      source_asset_code: sourceAsset.code,
      source_asset_issuer: sourceAsset.issuer,
      dest_amount: destAmount,
      dest_asset_code: destAsset.code,
      dest_asset_issuer: destAsset.issuer,
      quote: input.quote || null,
    }, {
      estimated_fee_display: unifiedFee.display,
      estimated_fee_usdc: unifiedFee.fee_usdc || null,
      estimated_fee_brl: unifiedFee.fee_brl || null,
      estimated_platform_fee: null,
      estimated_spread_fee: null,
      route_chain: crossAsset ? (routeChain || null) : null,
      optimization_criteria: String(input.optimization_criteria || '').trim() || null,
      savings_estimate: savingsEstimate,
      quote_issued_at: input.quote?.quote_issued_at || null,
      quote_expires_at: input.quote?.quote_expires_at || null,
      quote_ttl_seconds: input.quote?.quote_ttl_seconds || quoteTtlSeconds(),
      provider: String(input.provider || input.external_provider || '').trim() || null,
      provider_user_id: String(input.provider_user_id || input.providerUserId || input.external_provider_user_id || '').trim() || null,
      source: String(input.source || input.external_source || input.provider || input.external_provider || '').trim() || null,
      return_to: String(input.return_to || input.returnTo || '').trim() || null,
      return_source: String(input.return_source || input.returnSource || input.from || '').trim() || null,
    });

    return JSON.stringify({
      success: true,
      url,
      route_chain: crossAsset ? (routeChain || null) : null,
      savings_estimate: savingsEstimate,
      estimated_fee_display: unifiedFee.display,
      estimated_platform_fee: null,
      estimated_spread_fee: null,
      quote_expires_at: input.quote?.quote_expires_at || null,
      quote_ttl_seconds: input.quote?.quote_ttl_seconds || quoteTtlSeconds(),
      message:
        `Antes de confirmar: conversão preparada da forma mais otimizada, com taxa estimada total ${unifiedFee.display || 'indisponível'}. ` +
        `${savingsEstimate ? `Economia estimada vs métodos tradicionais: ${formatBrl(Number(savingsEstimate.estimated_savings_brl || 0))}. ` : ''}` +
        `${crossAsset && routeChain ? `Rota mais otimizada: ${routeChain}. ` : ''}` +
        `Estimativa válida por ${input.quote?.quote_ttl_seconds || quoteTtlSeconds()} segundos. ` +
        `Para confirmar a conversão, abra:\n\n${url}`,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return JSON.stringify({
      success: false,
      error: formatNoPathFallbackMessage(errorMessage),
    });
  }
}

/**
 * Tool: Submit Transaction
 */
async function executeSubmitTransaction(input: any): Promise<string> {
  try {
    logger.debug("Tool: Submitting signed transaction");
    const txHash = await stellarService.submitTransaction(input.signed_xdr);
    return JSON.stringify({
      success: true,
      transaction_hash: txHash,
      message: 'Operação enviada com sucesso.',
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return JSON.stringify({
      success: false,
      error: errorMessage,
    });
  }
}

/**
 * Tool: Get History
 */
async function executeGetHistory(input: any): Promise<string> {
  try {
    const publicKey = await resolveToolPublicKey(input);
    logger.debug(`Tool: Getting transaction history for ${publicKey}`);
    const operations = await stellarService.getOperationHistory(
      publicKey,
      input.limit || 10
    );

    const formattedOps = await Promise.all(operations.map(async (op: any) => {
      const asset = getAssetCode(op);
      const amount = op.amount || op.starting_balance || op.source_amount || op.amount_in || op.amount_out;
      const from = op.from || op.source_account || op.funder || op.account;
      const to = op.to || op.account || op.into;
      const direction = to === publicKey ? 'received' : from === publicKey ? 'sent' : 'related';
      const counterpartyKey = direction === 'received' ? from : to;
      const counterpartyLabel = await TransferNotificationService.resolveHumanLabel({
        publicKey: String(counterpartyKey || '').trim() || undefined,
      });

      return {
        id: op.id,
        type: op.type,
        date: op.created_at,
        counterparty: counterpartyLabel || 'contato não identificado',
        direction,
        asset: asset === 'XLM' ? undefined : asset,
        amount: amount ? String(amount) : undefined,
      };
    }));
    return JSON.stringify({
      success: true,
      transaction_count: operations.length,
      transactions: formattedOps,
      message: `Found ${operations.length} payment records`,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return JSON.stringify({
      success: false,
      error: errorMessage,
    });
  }
}

async function executeGetFinancialMemory(input: any): Promise<string> {
  try {
    const userId = await resolveToolUserId(input);
    const sessionId = String(input.session_id || input.sessionId || '').trim();
    const mode = String(input.mode || 'summary').trim().toLowerCase();
    const contactName = String(input.contact_name || input.contactName || '').trim();
    let ownPublicKey = '';
    try {
      ownPublicKey = await resolveToolPublicKey(input);
    } catch {
      ownPublicKey = '';
    }

    let query = supabase
      .from('payment_logs')
      .select('*')
      .eq('user_id', userId)
      .order('completed_at', { ascending: false })
      .limit(100);

    if (sessionId) {
      query = query.eq('session_id', sessionId);
    }

    const { data, error } = await query;
    if (error) {
      throw new Error(error.message || 'Falha ao carregar memória financeira');
    }

    const rows = Array.isArray(data) ? data : [];
    const successful = rows.filter((row: any) => isSuccessfulPaymentRow(row));
    const nicknameInput = String(input.nickname || input.memo || '').trim().slice(0, 80);
    const allowNicknameSet = Boolean(input.allow_nickname_set || input.allowNicknameSet);

    if (mode === 'nickname_set') {
      if (!allowNicknameSet) {
        return JSON.stringify({
          success: false,
          mode,
          message: 'Para nomear uma transação, responda imediatamente após a confirmação do pagamento.',
        });
      }

      const nickname = nicknameInput;
      if (!nickname) {
        return JSON.stringify({
          success: false,
          mode,
          message: 'Me diga qual apelido você quer usar para a transação.',
        });
      }

      const target = successful[0];
      if (!target?.id) {
        return JSON.stringify({
          success: false,
          mode,
          message: 'Ainda não encontrei uma transação concluída para salvar esse apelido.',
        });
      }

      const { error: updateError } = await supabase
        .from('payment_logs')
        .update({
          memo: nickname,
        })
        .eq('id', target.id)
        .eq('user_id', userId);

      if (updateError) {
        throw new Error(updateError.message || 'Falha ao salvar apelido da transação.');
      }

      const amountLabel = formatCustomerAssetAmount(
        String(target.destination_amount || target.source_amount || '0'),
        String(target.destination_asset_code || target.source_asset_code || 'USDC')
      );

      return JSON.stringify({
        success: true,
        mode,
        nickname,
        payment_hash: target.payment_hash || null,
        operation_id: target.id,
        message: `Apelido salvo: "${nickname}" para a transação de ${amountLabel}. Para consultar depois, pergunte: "qual foi o valor de ${nickname}?"`,
      });
    }

    if (mode === 'nickname_lookup') {
      const nickname = nicknameInput || String(input.contact_name || '').trim().slice(0, 80);
      if (!nickname) {
        return JSON.stringify({
          success: false,
          mode,
          message: 'Me diga o apelido da transação que você quer consultar.',
        });
      }

      const normalizedNickname = normalizeMemoryText(nickname);
      const { data: directRows, error: directError } = await supabase
        .from('payment_logs')
        .select('*')
        .eq('user_id', userId)
        .eq('status', 'success')
        .ilike('memo', `%${nickname}%`)
        .order('completed_at', { ascending: false })
        .limit(5);

      if (directError) {
        throw new Error(directError.message || 'Falha ao consultar apelido da transação.');
      }

      const direct = Array.isArray(directRows) ? directRows : [];
      const byExact = direct.find((row: any) => normalizeMemoryText(String(row?.memo || '')) === normalizedNickname);
      const byContains = byExact
        ? null
        : direct.find((row: any) => normalizeMemoryText(String(row?.memo || '')).includes(normalizedNickname));
      const target = byExact || byContains;

      if (!target) {
        return JSON.stringify({
          success: false,
          mode,
          nickname,
          message: `Não encontrei transação com o apelido "${nickname}".`,
        });
      }

      const valueLabel = formatCustomerAssetAmount(
        String(target.destination_amount || target.source_amount || '0'),
        String(target.destination_asset_code || target.source_asset_code || 'USDC')
      );
      const completedAt = target.completed_at || target.created_at;
      const whenLabel = completedAt
        ? new Date(String(completedAt)).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
        : 'horário indisponível';

      return JSON.stringify({
        success: true,
        mode,
        nickname: String(target.memo || nickname),
        payment_hash: target.payment_hash || null,
        operation_type: target.operation_type || null,
        value: valueLabel,
        completed_at: completedAt || null,
        message: `A transação "${String(target.memo || nickname)}" foi de ${valueLabel} (${whenLabel}).`,
      });
    }

    const normalizedContact = normalizeMemoryText(contactName);
    const recentPayments = successful
      .filter((row: any) => !isConversionOperation(row))
      .map((row: any) => summarizePaymentLog(row));
    const matchingPayments = normalizedContact
      ? recentPayments.filter((payment) => normalizeMemoryText(`${payment.counterparty} ${payment.destinationPublicKey}`).includes(normalizedContact))
      : recentPayments;
    const lastPayment = matchingPayments[0] || recentPayments[0] || null;

    const { start: monthStart, end: monthEnd } = monthDateRange();
    const monthlyConversions = successful.filter((row: any) => {
      const operation = String(row.operation_type || '').toUpperCase();
      const completedAt = Date.parse(String(row.completed_at || row.created_at || ''));
      return operation.includes('CONVERSION') && Number.isFinite(completedAt) && completedAt >= monthStart.getTime();
    });
    const conversionSummary = summarizeConversions(monthlyConversions);
    const recipientInsights = summarizeRecipientInsights(successful, ownPublicKey);

    const monthlyRows = successful.filter((row: any) => {
      const ms = paymentCompletedAtMs(row);
      return ms >= monthStart.getTime() && ms < monthEnd.getTime();
    });

    const monthlyReceivedRows = monthlyRows.filter((row: any) => inferDirection(row, ownPublicKey) === 'received');
    const monthlyReceivedTotal = monthlyReceivedRows.reduce((sum, row) => sum + toNumber(row.destination_amount || row.source_amount), 0);
    const monthlyReceivedAsset = String(monthlyReceivedRows[0]?.destination_asset_code || monthlyReceivedRows[0]?.source_asset_code || 'USDC').toUpperCase();
    const monthlyReceivedLabel = formatCustomerAssetAmount(String(monthlyReceivedTotal.toFixed(2)), monthlyReceivedAsset);

    const monthlyFeeXlm = monthlyRows.reduce((sum, row) => sum + toNumber(row.fee_xlm), 0);
    const monthlyFeeDisplay = (await formatNetworkFeeForCustomer(monthlyFeeXlm.toFixed(7))).display || null;

    const topPayerMap = new Map<string, { label: string; count: number; total: number; asset: string }>();
    for (const row of monthlyReceivedRows) {
      const label = inferCounterpartyLabel(row, 'received');
      const key = normalizeMemoryText(label) || String(row?.source_public_key || '');
      const current = topPayerMap.get(key) || {
        label,
        count: 0,
        total: 0,
        asset: String(row?.destination_asset_code || row?.source_asset_code || 'USDC').toUpperCase(),
      };
      current.count += 1;
      current.total += toNumber(row.destination_amount || row.source_amount);
      topPayerMap.set(key, current);
    }
    const topPayer = Array.from(topPayerMap.values()).sort((a, b) => b.total - a.total)[0];
    const topPayerPayload = topPayer
      ? {
          ...topPayer,
          totalLabel: formatCustomerAssetAmount(String(topPayer.total.toFixed(2)), topPayer.asset || 'USDC'),
        }
      : null;

    let actualFeeEstimate = 0;
    let traditionalFeeEstimate = 0;
    let estimatedSavings = 0;
    for (const row of successful) {
      const direction = inferDirection(row, ownPublicKey);
      if (direction !== 'sent') continue;
      const metadata = row?.metadata || {};
      const savedSavings = metadata?.savings || {};
      const grossBrl = toNumber(savedSavings.gross_amount_brl || metadata.gross_amount_brl);
      const rowActualFee = toNumber(savedSavings.actual_fee || metadata.actual_fee_brl || metadata.fee_brl || row.fee_brl || row.fee_usdc || row.fee_xlm);
      const rowTraditionalFee = toNumber(savedSavings.estimated_traditional_fee) ||
        (grossBrl > 0 ? grossBrl * EconomyEngineService.traditionalFeePct() : 0);
      const rowSavings = toNumber(savedSavings.estimated_savings) ||
        Math.max(0, rowTraditionalFee - rowActualFee);
      actualFeeEstimate += rowActualFee;
      traditionalFeeEstimate += rowTraditionalFee;
      estimatedSavings += rowSavings;
    }
    const savingsDisplay = new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(estimatedSavings);
    const walletFiat = await getWalletFiatBalances(sessionId);
    const fxChange = await getUsdBrlMonthlyChange();
    const behavior = classifyTreasuryBehavior(successful, ownPublicKey);
    const brlInUsd = fxChange.latestRate && walletFiat.brl > 0 ? walletFiat.brl / fxChange.latestRate : 0;
    const totalUsdEquivalent = walletFiat.usd + brlInUsd;
    const usdRatio = totalUsdEquivalent > 0 ? walletFiat.usd / totalUsdEquivalent : 0;
    const riskThresholdPct = Number(process.env.TREASURY_RISK_THRESHOLD_PCT || 2.5);
    const hasFxRisk = Number.isFinite(fxChange.changePct as any) && (fxChange.changePct as number) >= riskThresholdPct && walletFiat.brl > 0;

    if (sessionId && userId) {
      await supabase
        .from('treasury_profiles')
        .upsert({
          session_id: sessionId,
          user_id: userId,
          target_usd_ratio: Number((behavior.receivesMostlyUsd && behavior.spendsMostlyBrl ? 0.65 : 0.5).toFixed(2)),
          risk_threshold_pct: riskThresholdPct,
          metadata: {
            latest_usd_brl: fxChange.latestRate,
            month_change_pct: fxChange.changePct,
            usd_ratio: usdRatio,
            receives_usd_count: behavior.receivesUsdCount,
            spends_brl_count: behavior.spendsBrlCount,
          },
          updated_at: new Date().toISOString(),
        }, { onConflict: 'session_id' });
    }

    if (mode === 'monthly_received') {
      return JSON.stringify({
        success: true,
        mode,
        count: monthlyReceivedRows.length,
        received_total: monthlyReceivedTotal,
        received_asset: monthlyReceivedAsset,
        received_label: monthlyReceivedLabel,
        message: `Neste mês você recebeu ${monthlyReceivedLabel} em ${monthlyReceivedRows.length} operação(ões).`,
      });
    }

    if (mode === 'monthly_fees') {
      return JSON.stringify({
        success: true,
        mode,
        total_fee_xlm: monthlyFeeXlm,
        total_fee_display: monthlyFeeDisplay,
        message: monthlyFeeDisplay
          ? `Neste mês você pagou ${monthlyFeeDisplay} em taxas de rede.`
          : 'Neste mês as taxas de rede estão indisponíveis.',
      });
    }

    if (mode === 'top_payer') {
      return JSON.stringify({
        success: true,
        mode,
        top_payer: topPayerPayload,
        message: topPayerPayload
          ? `${topPayerPayload.label} é quem mais te paga: ${topPayerPayload.count} recebimento(s), total ${topPayerPayload.totalLabel}.`
          : 'Ainda não encontrei recebimentos suficientes para identificar quem mais te paga.',
      });
    }

    if (mode === 'traditional_savings') {
      return JSON.stringify({
        success: true,
        mode,
        actual_fee_estimate: actualFeeEstimate,
        traditional_fee_estimate: traditionalFeeEstimate,
        estimated_savings: estimatedSavings,
        savings_display: savingsDisplay,
        message: `Economia estimada em relação a métodos tradicionais: ${savingsDisplay} no período.`,
      });
    }

    if (mode === 'recipient_insights') {
      const recipients = recipientInsights.slice(0, 12);
      return JSON.stringify({
        success: true,
        mode,
        recipients,
        message: recipients.length
          ? `Sugestões contextuais prontas para uso: ${recipients.slice(0, 3).map((item) => item.label).join(', ')}.`
          : 'Ainda não há histórico suficiente para sugerir favoritos e recorrências.',
      });
    }

    if (mode === 'risk_alert') {
      const message = hasFxRisk
        ? `Seu saldo em reais perdeu ${Number(fxChange.changePct || 0).toFixed(1)}% frente ao dólar neste mês. Deseja proteger parte do saldo?`
        : `Risco cambial controlado no momento. Variação do dólar no mês: ${fxChange.changePct ? Number(fxChange.changePct).toFixed(1) : '0.0'}%.`;

      if (sessionId && userId) {
        await supabase.from('treasury_recommendations').insert({
          session_id: sessionId,
          user_id: userId,
          recommendation_type: 'risk_alert',
          risk_score: hasFxRisk ? Math.min(100, Math.max(0, Number(fxChange.changePct || 0) * 10)) : 20,
          suggested_action: hasFxRisk ? 'protect_partial_balance' : 'hold',
          payload: {
            change_pct: fxChange.changePct,
            latest_rate: fxChange.latestRate,
            brl_balance: walletFiat.brl,
            usd_balance: walletFiat.usd,
            usd_ratio: usdRatio,
          },
        });
      }

      return JSON.stringify({
        success: true,
        mode,
        fx_change_pct: fxChange.changePct,
        latest_rate: fxChange.latestRate,
        brl_balance: walletFiat.brl,
        usd_balance: walletFiat.usd,
        usd_ratio: usdRatio,
        message,
      });
    }

    if (mode === 'treasury_advice') {
      const suggestions: string[] = [];
      if (behavior.receivesMostlyUsd && behavior.spendsMostlyBrl) {
        suggestions.push('Você costuma receber em dólar e gastar em reais. Posso otimizar conversões automaticamente.');
      }
      if (hasFxRisk && usdRatio < 0.55) {
        suggestions.push('Sugestão: proteger 20% a 35% do saldo em reais em dólar para reduzir volatilidade.');
      } else if (!hasFxRisk && usdRatio > 0.75) {
        suggestions.push('Sugestão: manter maior parte em dólar e converter apenas o necessário para gastos em reais.');
      } else {
        suggestions.push('Sugestão: manter uma alocação equilibrada entre R$ e US$ conforme seu fluxo de gastos.');
      }
      suggestions.push(`Melhor momento (agora): USD/BRL em ${fxChange.latestRate ? fxChange.latestRate.toFixed(2) : 'indisponível'}.`);

      if (sessionId && userId) {
        await supabase.from('treasury_recommendations').insert({
          session_id: sessionId,
          user_id: userId,
          recommendation_type: 'treasury_advice',
          risk_score: hasFxRisk ? 70 : 35,
          suggested_action: hasFxRisk ? 'convert_brl_to_usd_partial' : 'hold_or_gradual_convert',
          payload: {
            change_pct: fxChange.changePct,
            latest_rate: fxChange.latestRate,
            brl_balance: walletFiat.brl,
            usd_balance: walletFiat.usd,
            usd_ratio: usdRatio,
            behavior,
            suggestions,
          },
        });
      }

      return JSON.stringify({
        success: true,
        mode,
        behavior,
        fx_change_pct: fxChange.changePct,
        latest_rate: fxChange.latestRate,
        brl_balance: walletFiat.brl,
        usd_balance: walletFiat.usd,
        usd_ratio: usdRatio,
        suggestions,
        message: suggestions.join(' '),
      });
    }

    return JSON.stringify({
      success: true,
      mode,
      user_id: userId,
      recent_payments: recentPayments.slice(0, 10),
      last_payment: lastPayment,
      monthly_conversion: conversionSummary,
      recipient_insights: recipientInsights.slice(0, 12),
      monthly_received: {
        count: monthlyReceivedRows.length,
        total: monthlyReceivedTotal,
        asset: monthlyReceivedAsset,
        label: monthlyReceivedLabel,
      },
      monthly_fees: {
        total_fee_xlm: monthlyFeeXlm,
        total_fee_display: monthlyFeeDisplay,
      },
      top_payer: topPayerPayload,
      traditional_savings: {
        actual_fee_estimate: actualFeeEstimate,
        traditional_fee_estimate: traditionalFeeEstimate,
        estimated_savings: estimatedSavings,
        savings_display: savingsDisplay,
      },
      treasury: {
        fx_change_pct: fxChange.changePct,
        latest_usd_brl: fxChange.latestRate,
        brl_balance: walletFiat.brl,
        usd_balance: walletFiat.usd,
        usd_ratio: usdRatio,
        has_fx_risk: hasFxRisk,
      },
      message: buildFinancialMemoryMessage(mode, lastPayment, conversionSummary, recentPayments),
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return JSON.stringify({
      success: false,
      error: errorMessage,
    });
  }
}

async function executeGetActivityFeed(input: any): Promise<string> {
  try {
    const feed = await ActivityFeedService.listFeed({
      sessionId: input.session_id || input.sessionId,
      userId: input.user_id || input.userId,
      limit: input.limit,
    });

    return JSON.stringify({
      success: true,
      feed,
      count: feed.length,
      message: feed.length
        ? `Feed atualizado com ${feed.length} evento(s) financeiro(s).`
        : 'Ainda não há atividades financeiras para mostrar.',
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return JSON.stringify({ success: false, error: errorMessage });
  }
}

async function executeGetFinancialInsights(input: any): Promise<string> {
  try {
    const insights = await FinancialInsightsService.listLatestInsights({
      sessionId: input.session_id || input.sessionId,
      userId: input.user_id || input.userId,
      limit: input.limit,
    });

    return JSON.stringify({
      success: true,
      insights,
      count: insights.length,
      message: insights[0]?.description || 'Insights financeiros atualizados.',
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return JSON.stringify({ success: false, error: errorMessage });
  }
}

async function executeResolveSmartContact(input: any): Promise<string> {
  try {
    const query = String(input.query || input.contact_name || input.contactName || '').trim();
    const contact = await SmartContactsService.resolveByContext({
      sessionId: input.session_id || input.sessionId,
      userId: input.user_id || input.userId,
      query,
    });

    return JSON.stringify({
      success: true,
      contact,
      found: Boolean(contact),
      message: contact
        ? `Contato encontrado: ${contact.display_name || contact.contact_name}.`
        : 'Não encontrei um contato salvo com esse contexto.',
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return JSON.stringify({ success: false, error: errorMessage });
  }
}

async function executeFindPaymentReplayCandidate(input: any): Promise<string> {
  try {
    const replay = await PaymentReplayService.findReplayCandidate({
      sessionId: input.session_id || input.sessionId,
      userId: input.user_id || input.userId,
      queryContext: input.query_context || input.queryContext || input.message || '',
    });

    return JSON.stringify({
      success: true,
      replay,
      ...replay,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return JSON.stringify({ success: false, error: errorMessage });
  }
}

async function executeGetSavingsEstimate(input: any): Promise<string> {
  try {
    const result = await EconomyEngineService.calculateMonthly({
      sessionId: input.session_id || input.sessionId,
      userId: input.user_id || input.userId,
    });

    return JSON.stringify({
      success: true,
      ...result,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return JSON.stringify({ success: false, error: errorMessage });
  }
}

async function executeGetSavingsIdentity(input: any): Promise<string> {
  try {
    const view = String(input.view || 'summary').trim();
    const rawPeriod = String(input.period || 'month').trim();
    const period = ['today', 'month', 'lifetime'].includes(rawPeriod) ? rawPeriod as any : 'month';
    const identity = await EconomyEngineService.calculateIdentity({
      sessionId: input.session_id || input.sessionId,
      userId: input.user_id || input.userId,
      period,
    });

    let message = identity.message;
    if (view === 'traditional_cost') {
      message =
        `Em métodos tradicionais, essas operações teriam custado aproximadamente ` +
        `${formatBrl(identity.estimatedTraditionalFee)}. No TalkToStellar, o custo efetivo estimado foi ` +
        `${formatBrl(identity.actualFee)}. Economia estimada: ${formatBrl(identity.estimatedSavings)}.`;
    }

    if (view === 'biggest_operation') {
      const biggest = identity.biggestSavingsOperation;
      message = biggest
        ? `Sua operação com maior economia gerou aproximadamente ${formatBrl(biggest.estimatedSavings)} de economia em relação a métodos tradicionais.`
        : 'Ainda não encontrei uma operação concluída com economia estimada.';
    }

    return JSON.stringify({
      success: true,
      ...identity,
      view,
      message,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return JSON.stringify({ success: false, error: errorMessage });
  }
}

async function executeGetSavingsComparison(input: any): Promise<string> {
  try {
    const rawPeriod = String(input.period || 'month').trim();
    const period = ['today', 'month', 'lifetime'].includes(rawPeriod) ? rawPeriod as any : 'month';
    const identity = await EconomyEngineService.calculateIdentity({
      sessionId: input.session_id || input.sessionId,
      userId: input.user_id || input.userId,
      period,
    });

    const message =
      `Comparativo financeiro (${period}): em bancos/métodos tradicionais, o custo estimado seria ` +
      `${formatBrl(identity.estimatedTraditionalFee)}. No TalkToStellar, o custo efetivo estimado foi ` +
      `${formatBrl(identity.actualFee)}. Economia estimada: ${formatBrl(identity.estimatedSavings)}. ` +
      `Percentual de economia sobre o custo tradicional: ${identity.savingsPercentage.toFixed(1)}%. ` +
      `Estimativa informativa baseada em médias de mercado.`;

    return JSON.stringify({
      success: true,
      period,
      comparison_method: identity.comparisonMethod,
      operation_count: identity.operationCount,
      estimated_traditional_fee: identity.estimatedTraditionalFee,
      actual_fee: identity.actualFee,
      estimated_savings: identity.estimatedSavings,
      savings_percentage: identity.savingsPercentage,
      effective_savings_rate: identity.effectiveSavingsRate,
      message,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return JSON.stringify({ success: false, error: errorMessage });
  }
}

function savingsFrontendBaseUrl(): string {
  const raw = String(
    process.env.FRONTEND_URL ||
    process.env.PUBLIC_APP_URL ||
    process.env.PAYMENT_CONFIRM_BASE ||
    process.env.CREATE_ACCOUNT_BASE ||
    'http://localhost:3000'
  ).trim();
  const withProtocol = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
  return withProtocol.replace(/\/$/, '');
}

async function createSavingsShortLink(input: {
  path: string;
  purpose: string;
  sessionId?: string;
  userId?: string;
  expiresInHours?: number;
}): Promise<string> {
  const base = savingsFrontendBaseUrl();
  const url = new URL(input.path, base);
  const sessionId = String(input.sessionId || '').trim();
  const userId = String(input.userId || '').trim();
  if (sessionId && !url.searchParams.has('session_id')) url.searchParams.set('session_id', sessionId);
  if (userId && !url.searchParams.has('user_id')) url.searchParams.set('user_id', userId);

  try {
    const externalService = new ExternalService(supabase as any);
    return await externalService.shortenPublicUrl({
      url: url.toString(),
      purpose: input.purpose,
      sessionId: sessionId || undefined,
      userId: userId || undefined,
      expiresInHours: input.expiresInHours || 24 * 7,
    });
  } catch (error) {
    logger.warn(`[savings-tools] failed to shorten ${input.purpose}: ${error instanceof Error ? error.message : String(error)}`);
    return url.toString();
  }
}

async function executeShowSavingsCalculator(input: any): Promise<string> {
  const brlAmount = parseSavingsBrlAmount(input.brl_amount || input.amount || input.valor);
  if (!brlAmount) {
    return JSON.stringify({
      success: false,
      needs_amount: true,
      message: 'Qual valor em reais você quer simular? Exemplo: "quanto custa enviar 5000 reais".',
    });
  }

  let preview: RealConversionPreview;
  try {
    preview = await buildRealConversionPreview(brlAmount);
  } catch (error) {
    return JSON.stringify({
      success: false,
      error: publicErrorMessage(error, 'Não consegui carregar a estimativa agora. Tente novamente em alguns segundos.'),
      message: 'Não consegui carregar a estimativa agora. Tente novamente em alguns segundos.',
    });
  }
  const message = [
    `💸 *Simulação de envio: ${formatBrlInteger(preview.brlAmount)}*`,
    '',
    `✅ Você recebe líquido: *${formatUsd(preview.receiveUsdc)}*`,
    `💱 Dólar agora: *R$ ${preview.brlPerUsdc.toFixed(4).replace('.', ',')}*`,
    `📉 Taxa TalkToStellar: ${normalizeCurrencySpacing(formatBrl(preview.talkToStellarFeeBrl))}`,
    `🔗 Custo da rede: ${normalizeCurrencySpacing(formatBrl(preview.stellarNetworkFeeBrl))}`,
    `💳 Taxa total: ${normalizeCurrencySpacing(formatBrl(preview.totalFeeBrl))}`,
    '',
    '━━━━━━━━━━━━━━',
    `🏦 Banco comum poderia cobrar: ${normalizeCurrencySpacing(formatBrl(preview.bankFeeBrl))}`,
    `🔵 Wise cobraria: ${normalizeCurrencySpacing(formatBrl(preview.wiseFeeBrl))}`,
    `*Você economiza: ${normalizeCurrencySpacing(formatBrl(preview.savingsBrl))}*`,
    '━━━━━━━━━━━━━━',
    '',
    `📅 Em 12 envios assim: *${formatBrlInteger(preview.annualSavingsBrl)} economizados no ano*`,
    '',
    'Quer enviar agora? É só confirmar 👇',
  ].join('\n');

  return JSON.stringify({
    success: true,
    brl_amount: preview.brlAmount,
    usd_received: preview.receiveUsdc,
    gross_usd_before_fees: preview.grossUsdc,
    brl_per_usdc: preview.brlPerUsdc,
    usdc_per_brl: preview.usdcPerBrl,
    quote_source: preview.quoteSource,
    quote_observed_at: preview.observedAt,
    talktostellar_fee_brl: preview.talkToStellarFeeBrl,
    talktostellar_fee_usdc: preview.talkToStellarFeeUsdc,
    stellar_network_fee_brl: preview.stellarNetworkFeeBrl,
    stellar_network_fee_usdc: preview.stellarNetworkFeeUsdc,
    total_fee_brl: preview.totalFeeBrl,
    total_fee_usdc: preview.totalFeeUsdc,
    total_fee_pct: preview.totalFeePct,
    spread_collection_active: preview.spreadCollectionActive,
    traditional_bank_fee_brl: preview.bankFeeBrl,
    traditional_bank_fee_pct: SAVINGS_TRADITIONAL_BANK_FEE_PCT,
    wise_reference_fee_brl: preview.wiseFeeBrl,
    wise_reference_fee_pct: SAVINGS_WISE_REFERENCE_FEE_PCT,
    savings_brl: preview.savingsBrl,
    annual_savings_brl: preview.annualSavingsBrl,
    message,
  });
}

async function executeGetConversionPreview(input: any): Promise<string> {
  const brlAmount = parseSavingsBrlAmount(input.brl_amount || input.amount || input.valor);
  if (!brlAmount) {
    return JSON.stringify({
      success: false,
      needs_amount: true,
      message: 'Qual valor em reais você quer cotar?',
    });
  }

  try {
    const preview = await buildRealConversionPreview(brlAmount);
    return JSON.stringify({
      success: true,
      input: {
        brl_amount: preview.brlAmount,
      },
      quote: {
        brl_per_usdc: preview.brlPerUsdc,
        usdc_per_brl: preview.usdcPerBrl,
        source: preview.quoteSource,
        observed_at: preview.observedAt,
      },
      output: {
        gross_receive_usdc: preview.grossUsdc,
        receive_usdc: preview.receiveUsdc,
      },
      fees: {
        talktostellar_fee_brl: preview.talkToStellarFeeBrl,
        talktostellar_fee_usdc: preview.talkToStellarFeeUsdc,
        network_fee_brl: preview.stellarNetworkFeeBrl,
        network_fee_usdc: preview.stellarNetworkFeeUsdc,
        total_fee_brl: preview.totalFeeBrl,
        total_fee_usdc: preview.totalFeeUsdc,
        total_fee_pct: preview.totalFeePct,
        network_fee_display: preview.networkFeeDisplay,
        spread_collection_active: preview.spreadCollectionActive,
      },
      comparison: {
        traditional_fee_pct: SAVINGS_TRADITIONAL_BANK_FEE_PCT * 100,
        traditional_fee_brl: preview.bankFeeBrl,
        wise_reference_fee_brl: preview.wiseFeeBrl,
        savings_brl: preview.savingsBrl,
      },
      message:
        `Estimativa: ${formatBrlInteger(preview.brlAmount)} -> ${formatUsd(preview.receiveUsdc)} líquido. ` +
        `Dólar agora: R$ ${preview.brlPerUsdc.toFixed(4).replace('.', ',')}. ` +
        `Taxa total: ${normalizeCurrencySpacing(formatBrl(preview.totalFeeBrl))}.`,
    });
  } catch (error) {
    return JSON.stringify({
      success: false,
      error: publicErrorMessage(error, 'Não consegui carregar a estimativa agora. Tente novamente em alguns segundos.'),
    });
  }
}

async function loadSavingsReceiptPaymentLog(input: any, stellarHash: string, sessionId: string, userId: string): Promise<any | null> {
  try {
    if (stellarHash) {
      const { data, error } = await supabase
        .from('payment_logs')
        .select('*')
        .eq('payment_hash', stellarHash)
        .eq('status', 'success')
        .order('completed_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!error && data) return data;
      if (error) logger.warn(`[savings-receipt] payment_hash lookup failed: ${error.message}`);
    }

    let query = supabase
      .from('payment_logs')
      .select('*')
      .eq('status', 'success')
      .order('completed_at', { ascending: false })
      .limit(1);

    if (sessionId) query = query.eq('session_id', sessionId);
    else if (userId) query = query.eq('user_id', userId);
    else return null;

    const { data, error } = await query.maybeSingle();
    if (error) {
      logger.warn(`[savings-receipt] latest payment lookup failed: ${error.message}`);
      return null;
    }
    return data || null;
  } catch (error) {
    logger.warn(`[savings-receipt] payment log lookup failed: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

function firstPositiveNumber(values: unknown[]): number {
  for (const value of values) {
    const n = toNumber(value);
    if (n > 0) return n;
  }
  return 0;
}

function extractRealRecipientName(row: any, input: any): string {
  const metadata = row?.metadata || {};
  const contact = metadata?.destination_contact || row?.destination_contact || {};
  return String(
    metadata?.destination_name ||
    contact?.contact_name ||
    contact?.name ||
    row?.destination_name ||
    input.recipient_name ||
    input.destination_name ||
    input.counterparty ||
    'destinatário'
  ).trim();
}

async function buildReceiptFeeBreakdown(row: any, input: any): Promise<{
  totalFeeBrl: number;
  networkFeeBrl: number;
  talkToStellarFeeBrl: number;
  onRampFeeBrl: number;
  offRampFeeBrl: number;
  feeLines: string[];
}> {
  const metadata = row?.metadata || {};
  const transferDetails = metadata?.transferDetails || {};
  const feeBreakdown = metadata?.fee_breakdown || metadata?.route_metrics || {};
  const networkFee = await formatNetworkFeeForCustomer(String(transferDetails?.feeXlm || row?.fee_xlm || input.fee_xlm || ''));
  const networkFeeBrl = firstPositiveNumber([
    metadata?.network_fee_brl,
    transferDetails?.networkFeeBrl,
    networkFee.fee_brl,
  ]);
  const onRampFeeBrl = firstPositiveNumber([
    feeBreakdown?.on_ramp_fee_brl,
    feeBreakdown?.provider_on_ramp_fee_brl_equivalent,
    metadata?.on_ramp_fee_brl,
  ]);
  const offRampFeeBrl = firstPositiveNumber([
    feeBreakdown?.off_ramp_fee_brl,
    feeBreakdown?.provider_off_ramp_fee_brl_equivalent,
    metadata?.off_ramp_fee_brl,
  ]);
  const explicitTotalFee = firstPositiveNumber([
    metadata?.actual_fee_brl,
    metadata?.savings?.actual_fee,
    row?.actual_fee,
    row?.fee_brl,
    transferDetails?.feeBrl,
    input.fee_charged,
    input.fee_brl,
    input.fee,
  ]);
  const explicitPlatformFee = firstPositiveNumber([
    metadata?.platform_fee_brl,
    metadata?.savings?.platform_fee_brl,
    feeBreakdown?.talktostellar_transaction_fee_brl,
    feeBreakdown?.platform_fee_brl,
  ]);
  const talkToStellarFeeBrl = explicitPlatformFee || Math.max(0, explicitTotalFee - networkFeeBrl - onRampFeeBrl - offRampFeeBrl);
  const componentTotal = networkFeeBrl + talkToStellarFeeBrl + onRampFeeBrl + offRampFeeBrl;
  const totalFeeBrl = explicitTotalFee || componentTotal;
  const feeLines = [
    `- TalkToStellar: ${normalizeCurrencySpacing(formatBrl(talkToStellarFeeBrl))}`,
    `- Rede: ${normalizeCurrencySpacing(formatBrl(networkFeeBrl))}`,
    onRampFeeBrl > 0 ? `- Entrada PIX: ${normalizeCurrencySpacing(formatBrl(onRampFeeBrl))}` : '',
    offRampFeeBrl > 0 ? `- Retirada PIX: ${normalizeCurrencySpacing(formatBrl(offRampFeeBrl))}` : '',
  ].filter(Boolean);

  return {
    totalFeeBrl: roundMoney(totalFeeBrl),
    networkFeeBrl: roundMoney(networkFeeBrl),
    talkToStellarFeeBrl: roundMoney(talkToStellarFeeBrl),
    onRampFeeBrl: roundMoney(onRampFeeBrl),
    offRampFeeBrl: roundMoney(offRampFeeBrl),
    feeLines,
  };
}

async function executeSendReceiptWithSavings(input: any): Promise<string> {
  let stellarHash = String(input.stellar_hash || input.hash || input.payment_hash || '').trim();
  const sessionId = String(input.session_id || input.sessionId || '').trim();
  let userId = String(input.user_id || input.userId || '').trim();

  if (!userId) {
    try {
      userId = await resolveToolUserId(input);
    } catch {
      userId = '';
    }
  }

  const paymentLog = await loadSavingsReceiptPaymentLog(input, stellarHash, sessionId, userId);
  const metadata = paymentLog?.metadata || {};
  const transferDetails = metadata?.transferDetails || {};
  if (!stellarHash) {
    stellarHash = String(paymentLog?.payment_hash || '').trim();
  }

  const sourceAmount = firstPositiveNumber([
    input.brl_sent,
    input.brl_amount,
    input.source_amount,
    metadata?.savings?.gross_amount_brl,
    metadata?.gross_amount_brl,
    paymentLog?.source_asset_code === 'BRL' || paymentLog?.source_asset_code === 'TESOURO' ? paymentLog?.source_amount : '',
  ]);
  const sourceAsset = String(
    input.source_asset_code ||
    input.sourceAssetCode ||
    paymentLog?.source_asset_code ||
    metadata?.source_asset_code ||
    transferDetails?.sourceAssetCode ||
    'BRL'
  ).toUpperCase().replace(/^USD$/, 'USDC');
  const sourceIsUsd = sourceAsset === 'USDC';
  const sourceIsBrl = sourceAsset === 'BRL' || sourceAsset === 'TESOURO';
  const brlSent = sourceAmount > 0
    ? (sourceIsBrl ? sourceAmount : sourceIsUsd ? estimateBrlForSavingsSummary({
      amount: sourceAmount,
      assetCode: sourceAsset,
      quote: metadata?.quote || transferDetails?.quote,
    }) : 0)
    : firstPositiveNumber([metadata?.savings?.gross_amount_brl, metadata?.gross_amount_brl]);
  const destinationAsset = String(
    input.destination_asset_code ||
    input.destinationAssetCode ||
    paymentLog?.destination_asset_code ||
    metadata?.destination_asset_code ||
    transferDetails?.destinationAssetCode ||
    'USDC'
  ).toUpperCase().replace(/^USD$/, 'USDC');
  const destinationIsUsd = destinationAsset === 'USDC';
  const usdReceived = firstPositiveNumber([
    input.usd_received,
    input.usdc_received,
    destinationIsUsd ? input.destination_amount : '',
    destinationAsset === 'USDC' ? paymentLog?.destination_amount : '',
    transferDetails?.destinationAssetCode === 'USDC' ? transferDetails?.destinationAmount : '',
  ]) || 0;
  const recipientName = extractRealRecipientName(paymentLog, input);
  const feeBreakdown = await buildReceiptFeeBreakdown(paymentLog, input);
  const feeCharged = feeBreakdown.totalFeeBrl;
  if (brlSent <= 0 || usdReceived <= 0) {
    const sourceAmount = String(
      input.source_amount ||
      transferDetails?.sourceAmount ||
      paymentLog?.source_amount ||
      input.amount ||
      paymentLog?.amount ||
      ''
    ).trim();
    const sourceAssetCode = String(
      input.source_asset_code ||
      transferDetails?.sourceAssetCode ||
      paymentLog?.source_asset_code ||
      input.asset_code ||
      paymentLog?.asset_code ||
      ''
    ).trim().toUpperCase();
    const destinationAmount = String(
      input.destination_amount ||
      transferDetails?.destinationAmount ||
      paymentLog?.destination_amount ||
      sourceAmount
    ).trim();
    const destinationAssetCode = String(
      input.destination_asset_code ||
      transferDetails?.destinationAssetCode ||
      paymentLog?.destination_asset_code ||
      sourceAssetCode
    ).trim().toUpperCase();

    if (destinationAmount && destinationAssetCode) {
      const receiptInput: PaymentReceiptInput = {
        type: 'payment_sent',
        sessionId,
        userId,
        counterpartyLabel: recipientName,
        sourceAmount: sourceAmount || destinationAmount,
        sourceAssetCode: sourceAssetCode || destinationAssetCode,
        destinationAmount,
        destinationAssetCode,
        feeDisplay: String(input.fee_display || transferDetails?.feeDisplay || paymentLog?.fee_display || '').trim() || null,
        feeXlm: String(input.fee_xlm || transferDetails?.feeXlm || paymentLog?.fee_xlm || '').trim() || null,
        hash: stellarHash || null,
        completedAt: String(input.completed_at || input.completedAt || paymentLog?.completed_at || paymentLog?.created_at || new Date().toISOString()),
        status: 'Confirmado',
      };
      const receiptUrl = sessionId && userId
        ? await PaymentReceiptService.createReceiptLink(receiptInput).catch(() => '')
        : '';
      const receiptText = await PaymentReceiptService.buildReceiptText(receiptInput);
      const message = receiptUrl ? `${receiptText}\nComprovante: ${receiptUrl}` : receiptText;
      return JSON.stringify({
        success: true,
        source: paymentLog ? 'payment_logs' : 'tool_input',
        receipt_url: receiptUrl,
        message,
      });
    }

    return JSON.stringify({
      success: false,
      error: 'Este comprovante não tem dados suficientes de BRL e USDC para calcular economia. Use o comprovante normal da operação.',
    });
  }
  const bankFee = roundMoney(brlSent * SAVINGS_TRADITIONAL_BANK_FEE_PCT);
  const savings = roundMoney(Math.max(0, bankFee - feeCharged));
  const completedAt = String(input.completed_at || input.completedAt || paymentLog?.completed_at || paymentLog?.created_at || new Date().toISOString());
  const parsedCompletedAt = new Date(completedAt);
  const dateLine = formatSavingsDate(Number.isFinite(parsedCompletedAt.getTime()) ? parsedCompletedAt : new Date());
  const historyLink = await createSavingsShortLink({
    path: '/transactions',
    purpose: 'savings_history',
    sessionId,
    userId,
  });

  let receiptLink = '';
  if (sessionId && userId) {
    try {
      receiptLink = await PaymentReceiptService.createReceiptLink({
        type: 'payment_sent',
        sessionId,
        userId,
        counterpartyLabel: recipientName,
        sourceAmount: String(brlSent),
        sourceAssetCode: 'BRL',
        destinationAmount: String(usdReceived),
        destinationAssetCode: 'USDC',
        feeBrl: String(feeCharged),
        feeDisplay: normalizeCurrencySpacing(formatBrl(feeCharged)),
        hash: stellarHash || null,
        savings: {
          estimatedSavings: savings,
          savingsPercentage: bankFee > 0 ? (savings / bankFee) * 100 : 0,
          comparisonMethod: 'traditional_bank_3_5pct',
        },
        completedAt,
        status: 'Confirmado',
      });
    } catch (error) {
      logger.warn(`[savings-tools] failed to create receipt image link: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (!receiptLink) {
    receiptLink = await createSavingsShortLink({
      path: `/receipt/${encodeURIComponent(stellarHash || PaymentReceiptService.toPublicOperationId(`${sessionId}:${Date.now()}`) || 'pendente')}`,
      purpose: 'savings_receipt',
      sessionId,
      userId,
    });
  }

  const message = [
    '✅ *Transferência concluída*',
    dateLine,
    '',
    `👤 Destinatário: *${recipientName}*`,
    `💵 Entregue: *${formatUsd(usdReceived)}*`,
    `📤 Enviado: ${normalizeCurrencySpacing(formatBrl(brlSent))}`,
    `💳 Taxa paga: ${normalizeCurrencySpacing(formatBrl(feeCharged))}`,
    'Detalhe da taxa:',
    ...feeBreakdown.feeLines,
    '',
    '━━━━━━━━━━━━━━',
    `💰 *Você economizou ${normalizeCurrencySpacing(formatBrl(savings))}*`,
    `vs banco que cobraria ${normalizeCurrencySpacing(formatBrl(bankFee))}`,
    '━━━━━━━━━━━━━━',
    '',
    `📊 Ver histórico: ${historyLink}`,
    `📄 Comprovante PDF: ${receiptLink}`,
  ].join('\n');

  return JSON.stringify({
    success: true,
    brl_sent: brlSent,
    usd_received: usdReceived,
    fee_charged: feeCharged,
    fee_breakdown: {
      talktostellar_fee_brl: feeBreakdown.talkToStellarFeeBrl,
      stellar_network_fee_brl: feeBreakdown.networkFeeBrl,
      etherfuse_on_ramp_fee_brl: feeBreakdown.onRampFeeBrl,
      etherfuse_off_ramp_fee_brl: feeBreakdown.offRampFeeBrl,
    },
    traditional_bank_fee_brl: bankFee,
    savings_brl: savings,
    completed_at: completedAt,
    recipient_name: recipientName,
    technical_reference: stellarHash ? shortStellarHash(stellarHash) : null,
    source: paymentLog ? 'payment_logs' : 'tool_input',
    history_url: historyLink,
    receipt_url: receiptLink,
    message,
  });
}

function estimateBrlForSavingsSummary(input: {
  amount: unknown;
  assetCode: unknown;
  quote?: any;
}): number {
  const amount = toNumber(input.amount);
  if (amount <= 0) return 0;
  const assetCode = String(input.assetCode || '').trim().toUpperCase().replace(/^USD$/, 'USDC');
  if (assetCode === 'BRL' || assetCode === 'TESOURO') return amount;

  const quote = input.quote || {};
  const sourceAmount = toNumber(quote.sourceAmount);
  const sourceAsset = String(quote.sourceAsset?.code || '').trim().toUpperCase().replace(/^USD$/, 'USDC');
  const destinationAmount = toNumber(quote.destinationAmount);
  const destinationAsset = String(quote.destinationAsset?.code || '').trim().toUpperCase().replace(/^USD$/, 'USDC');
  if ((sourceAsset === 'BRL' || sourceAsset === 'TESOURO') && destinationAmount > 0 && sourceAmount > 0) return sourceAmount;
  if ((destinationAsset === 'BRL' || destinationAsset === 'TESOURO') && destinationAmount > 0) return destinationAmount;
  return 0;
}

function savingsSummaryFromPaymentLog(row: any, ownPublicKey?: string) {
  const metadata = row?.metadata || {};
  const savedSavings = metadata?.savings || {};
  const quote = metadata?.quote || row?.quote || null;
  const sourceAmount = row?.source_amount || metadata?.source_amount || metadata?.transferDetails?.sourceAmount || row?.destination_amount;
  const sourceAssetCode = row?.source_asset_code || metadata?.source_asset_code || metadata?.transferDetails?.sourceAssetCode || row?.destination_asset_code || 'USDC';
  const grossBrl = toNumber(savedSavings.gross_amount_brl || metadata.gross_amount_brl) ||
    estimateBrlForSavingsSummary({ amount: sourceAmount, assetCode: sourceAssetCode, quote });
  if (grossBrl <= 0) return null;

  const actualFee = toNumber(savedSavings.actual_fee || metadata.actual_fee_brl || metadata.fee_brl || row.actual_fee || row.fee_brl);
  const bankFee = grossBrl * SAVINGS_TRADITIONAL_BANK_FEE_PCT;
  const savings = Math.max(0, bankFee - actualFee);
  const usdReceived = toNumber(row?.destination_amount || metadata?.destination_amount || metadata?.transferDetails?.destinationAmount) ||
    0;
  const completedAt = String(row?.completed_at || row?.created_at || new Date().toISOString());
  const direction = inferDirection(row, ownPublicKey);

  return {
    grossBrl,
    actualFee,
    bankFee,
    savings,
    usdReceived,
    completedAt,
    direction,
  };
}

function savingsSummaryFromOperation(op: any, ownPublicKey?: string) {
  const asset = getAssetCode(op);
  const amount = op.amount || op.starting_balance || op.source_amount || op.amount_in || op.amount_out;
  const grossBrl = estimateBrlForSavingsSummary({ amount, assetCode: asset });
  if (grossBrl <= 0) return null;
  const from = String(op.from || op.source_account || op.funder || '').trim();
  const to = String(op.to || op.account || op.into || '').trim();
  const direction = ownPublicKey && from === ownPublicKey ? 'sent' : ownPublicKey && to === ownPublicKey ? 'received' : 'sent';
  const actualFee = toNumber(op.fee_brl || op.fee_charged_brl || op.transaction_fee_brl);
  const bankFee = grossBrl * SAVINGS_TRADITIONAL_BANK_FEE_PCT;
  const savings = Math.max(0, bankFee - actualFee);

  return {
    grossBrl,
    actualFee,
    bankFee,
    savings,
    usdReceived: asset === 'USDC' || asset === 'USD' ? toNumber(amount) : 0,
    completedAt: String(op.created_at || new Date().toISOString()),
    direction,
  };
}

function formatSavingsTransferLine(item: {
  grossBrl: number;
  usdReceived: number;
  savings: number;
  completedAt: string;
}): string {
  const date = new Date(item.completedAt);
  const dateLabel = Number.isFinite(date.getTime())
    ? normalizeCurrencySpacing(new Intl.DateTimeFormat('pt-BR', {
        day: '2-digit',
        month: 'short',
        timeZone: 'America/Sao_Paulo',
      }).format(date)).replace(/\./g, '')
    : 'data';
  return `- ${dateLabel} · ${formatBrlInteger(item.grossBrl)} → ${formatUsd(item.usdReceived).replace(/,00$/, '')} · economizou ${formatBrlInteger(item.savings)}`;
}

async function loadSavingsPaymentLogs(input: any, userId: string, sessionId: string): Promise<any[]> {
  if (!userId && !sessionId) return [];
  try {
    let query = supabase
      .from('payment_logs')
      .select('*')
      .eq('status', 'success')
      .order('completed_at', { ascending: false })
      .limit(200);

    if (sessionId) query = query.eq('session_id', sessionId);
    else if (userId) query = query.eq('user_id', userId);

    const { data, error } = await query;
    if (error) {
      logger.warn(`[savings-summary] payment_logs unavailable: ${error.message}`);
      return [];
    }
    return Array.isArray(data) ? data : [];
  } catch (error) {
    logger.warn(`[savings-summary] payment_logs lookup failed: ${error instanceof Error ? error.message : String(error)}`);
    return [];
  }
}

async function executeShowAnnualSavingsSummary(input: any): Promise<string> {
  const sessionId = String(input.session_id || input.sessionId || '').trim();
  let userId = String(input.user_id || input.userId || '').trim();
  if (!userId) {
    try {
      userId = await resolveToolUserId(input);
    } catch {
      userId = '';
    }
  }

  let ownPublicKey = '';
  try {
    ownPublicKey = await resolveToolPublicKey(input);
  } catch {
    ownPublicKey = '';
  }

  const currentYear = new Date().getFullYear();
  let operations: any[] = [];
  if (ownPublicKey) {
    try {
      operations = await stellarService.getOperationHistory(ownPublicKey, 100);
    } catch (error) {
      logger.warn(`[savings-summary] getOperationHistory failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const logs = await loadSavingsPaymentLogs(input, userId, sessionId);
  const sourceRows = logs.length
    ? logs.map((row) => savingsSummaryFromPaymentLog(row, ownPublicKey))
    : operations.map((op) => savingsSummaryFromOperation(op, ownPublicKey));
  const rows = sourceRows
    .filter(Boolean)
    .filter((row: any) => row.direction !== 'received')
    .filter((row: any) => {
      const date = new Date(row.completedAt);
      return Number.isFinite(date.getTime()) && date.getFullYear() === currentYear;
    }) as Array<{
      grossBrl: number;
      actualFee: number;
      bankFee: number;
      savings: number;
      usdReceived: number;
      completedAt: string;
    }>;

  const transferCount = rows.length;
  const totalSent = rows.reduce((sum, row) => sum + row.grossBrl, 0);
  const totalFee = rows.reduce((sum, row) => sum + row.actualFee, 0);
  const totalSavings = rows.reduce((sum, row) => sum + row.savings, 0);
  const avgFeePct = totalSent > 0 ? (totalFee / totalSent) * 100 : SAVINGS_TTS_FEE_PCT * 100;
  const projection = transferCount > 0 ? (totalSavings / transferCount) * 12 : 0;
  const latestLines = rows
    .sort((a, b) => Date.parse(b.completedAt) - Date.parse(a.completedAt))
    .slice(0, 3)
    .map(formatSavingsTransferLine);

  const message = [
    `📊 *Seu resumo de economia — ${currentYear}*`,
    '',
    `Transferências realizadas: ${transferCount}`,
    `Total enviado: ${formatBrlInteger(totalSent)}`,
    '',
    `💰 *Total economizado: ${formatBrlInteger(totalSavings)}*`,
    'comparado com uma transferência bancária comum',
    '',
    `Taxas pagas no ano: ${normalizeCurrencySpacing(formatBrl(totalFee))}`,
    `Projeção até dezembro: ≈ ${formatBrlInteger(projection)}`,
    '',
    '━━━━━━━━━━━━━━',
    'Últimas transferências:',
    ...(latestLines.length ? latestLines : ['- Ainda não encontrei transferências concluídas neste ano.']),
    '━━━━━━━━━━━━━━',
    '',
    'Quer fazer uma nova transferência? 👇',
  ].join('\n');

  return JSON.stringify({
    success: true,
    year: currentYear,
    transfer_count: transferCount,
    total_sent_brl: totalSent,
    total_fee_brl: totalFee,
    total_savings_brl: totalSavings,
    average_fee_pct: avgFeePct,
    projected_savings_brl: projection,
    reference_rate_brl_per_usd: null,
    reference_rate_source: 'transaction_values_only',
    source: logs.length ? 'payment_logs' : 'getOperationHistory',
    message,
  });
}

function paymentLogToReceiptInput(row: any, input: any): PaymentReceiptInput {
  const metadata = row?.metadata || {};
  const transferDetails = metadata?.transferDetails || {};
  const operationType = String(row?.operation_type || '').toUpperCase();
  const destinationName = String(
    metadata?.destination_name ||
    metadata?.destination_contact?.contact_name ||
    row?.destination_name ||
    row?.destination_public_key ||
    'destinatário'
  ).trim();
  const type = operationType.includes('CONVERSION') ? 'conversion' : 'payment_sent';
  const feeDisplay = String(
    transferDetails?.feeDisplay ||
    metadata?.fee_display ||
    ''
  ).trim();
  const savings = metadata?.savings
    ? {
        estimatedSavings: metadata.savings.estimated_savings,
        savingsPercentage: metadata.savings.savings_percentage,
        comparisonMethod: metadata.savings.comparison_method,
      }
    : null;

  return {
    type,
    sessionId: String(input.session_id || input.sessionId || row?.session_id || ''),
    userId: String(input.user_id || input.userId || row?.user_id || ''),
    provider: input.provider || input.external_provider || null,
    providerUserId: input.provider_user_id || input.providerUserId || null,
    counterpartyLabel: destinationName,
    sourceAmount: String(transferDetails?.sourceAmount || row?.source_amount || ''),
    sourceAssetCode: String(transferDetails?.sourceAssetCode || row?.source_asset_code || ''),
    destinationAmount: String(transferDetails?.destinationAmount || row?.destination_amount || ''),
    destinationAssetCode: String(transferDetails?.destinationAssetCode || row?.destination_asset_code || ''),
    feeXlm: String(transferDetails?.feeXlm || row?.fee_xlm || ''),
    feeDisplay,
    feeBrl: String(transferDetails?.feeBrl || metadata?.fee_brl || metadata?.actual_fee_brl || ''),
    feeUsdc: String(transferDetails?.feeUsdc || metadata?.fee_usdc || ''),
    hash: String(row?.payment_hash || ''),
    quote: metadata?.quote || null,
    savings,
    completedAt: String(row?.completed_at || row?.created_at || ''),
    status: 'Confirmado',
  };
}

async function executeSendReceiptImage(input: any): Promise<string> {
  try {
    const sessionId = String(input.session_id || input.sessionId || '').trim();
    const userId = await resolveToolUserId(input);
    let query = supabase
      .from('payment_logs')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'success')
      .order('completed_at', { ascending: false })
      .limit(1);

    if (sessionId) {
      query = query.eq('session_id', sessionId);
    }

    const { data, error } = await query;
    if (error) {
      throw new Error(error.message || 'Falha ao buscar o último comprovante.');
    }

    const row = Array.isArray(data) ? data[0] : null;
    if (!row) {
      return JSON.stringify({
        success: false,
        error: 'Ainda não encontrei uma transação concluída para gerar o comprovante.',
      });
    }

    const receiptInput = paymentLogToReceiptInput(row, { ...input, user_id: userId, session_id: sessionId || row.session_id });
    const operationId = PaymentReceiptService.toPublicOperationId(receiptInput.hash);
    const receiptUrl = await PaymentReceiptService.createReceiptLink(receiptInput);

    return JSON.stringify({
      success: true,
      operation_id: operationId,
      receipt_url: receiptUrl,
      message: receiptUrl ? `Comprovante disponível: ${receiptUrl}` : 'Comprovante registrado no histórico.',
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return JSON.stringify({ success: false, error: errorMessage });
  }
}

async function executeCreateInvoice(input: any): Promise<string> {
  try {
    const invoice = await InvoiceService.create({
      sessionId: input.session_id || input.sessionId,
      userId: input.user_id || input.userId,
      recipientName: String(input.recipient_name || input.recipientName || input.recipient || '').trim(),
      title: input.title,
      description: input.description,
      amount: String(input.amount || '').trim(),
      currency: input.currency,
      dueDate: input.due_date || input.dueDate,
    });

    return JSON.stringify({
      success: true,
      invoice,
      message: invoice.summary || 'Cobrança criada com link pronto para envio.',
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return JSON.stringify({ success: false, error: errorMessage });
  }
}

async function executeGetOrCreateGlobalProfile(input: any): Promise<string> {
  try {
    const profile = await GlobalProfileService.getOrCreate({
      sessionId: input.session_id || input.sessionId,
      userId: input.user_id || input.userId,
      usernameHint: input.username,
      displayName: input.display_name || input.displayName,
      bio: input.bio,
    });

    return JSON.stringify({
      success: true,
      profile,
      message: `Seu link global para receber: ${profile.public_link}`,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return JSON.stringify({ success: false, error: errorMessage });
  }
}

function normalizeMemoryText(value: string): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s@.+-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function summarizePaymentLog(row: any) {
  const metadata = row?.metadata || {};
  const counterparty = String(
    metadata.destination_name ||
    metadata.recipient_name ||
    row.destination_name ||
    row.destination_public_key ||
    'destinatário'
  ).trim();

  return {
    id: row.id,
    counterparty,
    destinationPublicKey: row.destination_public_key,
    sourceAmount: row.source_amount,
    sourceAssetCode: row.source_asset_code,
    destinationAmount: row.destination_amount,
    destinationAssetCode: row.destination_asset_code,
    feeXlm: row.fee_xlm,
    hash: row.payment_hash,
    operationType: row.operation_type,
    completedAt: row.completed_at || row.created_at,
  };
}

function toNumber(value: any): number {
  const parsed = Number(String(value ?? '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : 0;
}

function monthDateRange(): { start: Date; end: Date } {
  const start = new Date();
  start.setDate(1);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setMonth(end.getMonth() + 1);
  return { start, end };
}

function isSuccessfulPaymentRow(row: any): boolean {
  return String(row?.status || '').toLowerCase() === 'success';
}

function isConversionOperation(row: any): boolean {
  return String(row?.operation_type || '').toUpperCase().includes('CONVERSION');
}

function paymentCompletedAtMs(row: any): number {
  const raw = String(row?.completed_at || row?.created_at || '');
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

function inferDirection(row: any, ownPublicKey?: string): 'sent' | 'received' | 'unknown' {
  const ownKey = String(ownPublicKey || '').trim();
  const src = String(row?.source_public_key || '').trim();
  const dst = String(row?.destination_public_key || '').trim();
  if (ownKey) {
    if (src && src === ownKey) return 'sent';
    if (dst && dst === ownKey) return 'received';
  }
  const op = String(row?.operation_type || '').toUpperCase();
  if (op.includes('RECEIVE')) return 'received';
  if (op.includes('PAYMENT') || op.includes('PATH_PAYMENT')) return 'sent';
  return 'unknown';
}

function inferCounterpartyLabel(row: any, direction: 'sent' | 'received' | 'unknown'): string {
  const metadata = row?.metadata || {};
  const byMetadata = direction === 'received'
    ? String(metadata.sender_name || metadata.source_name || '').trim()
    : String(metadata.destination_name || metadata.recipient_name || '').trim();
  if (byMetadata) return byMetadata;
  const byRow = String(row?.destination_name || '').trim();
  if (byRow) return byRow;
  const fallback = direction === 'received'
    ? String(row?.source_public_key || '').trim()
    : String(row?.destination_public_key || '').trim();
  return fallback || 'contato';
}

function summarizeRecipientInsights(rows: any[], ownPublicKey?: string) {
  const stats = new Map<string, {
    key: string;
    label: string;
    txCount: number;
    totalSent: number;
    lastAt: number;
    lastAmount: number;
    lastAsset: string;
    intervals: number[];
    previousAt?: number;
  }>();

  for (const row of rows) {
    if (!isSuccessfulPaymentRow(row) || isConversionOperation(row)) continue;
    const direction = inferDirection(row, ownPublicKey);
    if (direction !== 'sent') continue;
    const counterpartyKey = String(row?.destination_public_key || '').trim();
    if (!counterpartyKey) continue;
    const label = inferCounterpartyLabel(row, direction);
    const completedAt = paymentCompletedAtMs(row);
    const amount = toNumber(row?.destination_amount || row?.source_amount);
    const asset = String(row?.destination_asset_code || row?.source_asset_code || '').toUpperCase() || 'USDC';

    const current = stats.get(counterpartyKey) || {
      key: counterpartyKey,
      label,
      txCount: 0,
      totalSent: 0,
      lastAt: 0,
      lastAmount: 0,
      lastAsset: asset,
      intervals: [],
      previousAt: undefined,
    };

    current.txCount += 1;
    current.totalSent += amount > 0 ? amount : 0;
    if (completedAt > current.lastAt) {
      current.lastAt = completedAt;
      current.lastAmount = amount;
      current.lastAsset = asset;
      current.label = label || current.label;
    }

    if (current.previousAt && completedAt > 0) {
      const gapDays = Math.abs(completedAt - current.previousAt) / (1000 * 60 * 60 * 24);
      if (Number.isFinite(gapDays) && gapDays > 0) current.intervals.push(gapDays);
    }
    current.previousAt = completedAt || current.previousAt;
    stats.set(counterpartyKey, current);
  }

  return Array.from(stats.values())
    .sort((a, b) => b.txCount - a.txCount || b.lastAt - a.lastAt)
    .map((item, index) => {
      const avgGap = item.intervals.length
        ? item.intervals.reduce((sum, val) => sum + val, 0) / item.intervals.length
        : null;
      const isRecurring = item.txCount >= 3 && !!avgGap && avgGap <= 45;
      const isFavorite = index < 3 || item.txCount >= 4;
      return {
        counterpartyKey: item.key,
        label: item.label,
        txCount: item.txCount,
        totalSent: item.totalSent,
        lastAt: item.lastAt ? new Date(item.lastAt).toISOString() : null,
        lastAmount: item.lastAmount,
        lastAsset: item.lastAsset,
        favorite: isFavorite,
        recurring: isRecurring,
        averageIntervalDays: avgGap ? Number(avgGap.toFixed(1)) : null,
        suggestedAmount: item.lastAmount > 0 ? item.lastAmount : null,
      };
    });
}

async function getWalletFiatBalances(sessionId?: string): Promise<{ brl: number; usd: number }> {
  const sid = String(sessionId || '').trim();
  if (!sid) return { brl: 0, usd: 0 };

  const { data: walletRow, error } = await supabase
    .from('wallets')
    .select('balance')
    .eq('session_id', sid)
    .limit(1)
    .maybeSingle();

  if (error) return { brl: 0, usd: 0 };

  const balances = Array.isArray((walletRow as any)?.balance) ? (walletRow as any).balance : [];
  let brl = 0;
  let usd = 0;
  for (const row of balances) {
    const code = String(row?.asset_code || row?.asset || '').toUpperCase();
    const value = toNumber(row?.balance || row?.amount);
    if (code === 'BRL' || code === 'TESOURO') brl = value;
    if (code === 'USDC' || code === 'USD') usd = value;
  }
  return { brl, usd };
}

async function getUsdBrlMonthlyChange(): Promise<{
  latestRate: number | null;
  monthStartRate: number | null;
  changePct: number | null;
  observedAt?: string | null;
}> {
  const { start: monthStart } = monthDateRange();
  const latestResp = await supabase
    .from('currency_rate_history')
    .select('rate, observed_at')
    .eq('base_currency', 'USD')
    .eq('quote_currency', 'BRL')
    .eq('source', 'transaction_values')
    .order('observed_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const monthResp = await supabase
    .from('currency_rate_history')
    .select('rate, observed_at')
    .eq('base_currency', 'USD')
    .eq('quote_currency', 'BRL')
    .eq('source', 'transaction_values')
    .gte('observed_at', monthStart.toISOString())
    .order('observed_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  const latestRate = toNumber((latestResp.data as any)?.rate);
  const monthStartRate = toNumber((monthResp.data as any)?.rate);
  if (!latestRate || !monthStartRate) {
    return { latestRate: latestRate || null, monthStartRate: monthStartRate || null, changePct: null, observedAt: (latestResp.data as any)?.observed_at || null };
  }
  const changePct = ((latestRate - monthStartRate) / monthStartRate) * 100;
  return {
    latestRate,
    monthStartRate,
    changePct,
    observedAt: (latestResp.data as any)?.observed_at || null,
  };
}

function classifyTreasuryBehavior(rows: any[], ownPublicKey?: string): {
  receivesMostlyUsd: boolean;
  spendsMostlyBrl: boolean;
  receivesUsdCount: number;
  spendsBrlCount: number;
} {
  let receivesUsdCount = 0;
  let receivesTotal = 0;
  let spendsBrlCount = 0;
  let spendsTotal = 0;
  for (const row of rows) {
    if (!isSuccessfulPaymentRow(row) || isConversionOperation(row)) continue;
    const direction = inferDirection(row, ownPublicKey);
    const srcAsset = String(row?.source_asset_code || '').toUpperCase();
    const dstAsset = String(row?.destination_asset_code || '').toUpperCase();
    if (direction === 'received') {
      receivesTotal += 1;
      if (srcAsset === 'USDC' || srcAsset === 'USD' || dstAsset === 'USDC' || dstAsset === 'USD') receivesUsdCount += 1;
    }
    if (direction === 'sent') {
      spendsTotal += 1;
      if (srcAsset === 'BRL' || srcAsset === 'TESOURO' || dstAsset === 'BRL' || dstAsset === 'TESOURO') spendsBrlCount += 1;
    }
  }
  return {
    receivesMostlyUsd: receivesTotal > 0 ? receivesUsdCount / receivesTotal >= 0.6 : false,
    spendsMostlyBrl: spendsTotal > 0 ? spendsBrlCount / spendsTotal >= 0.6 : false,
    receivesUsdCount,
    spendsBrlCount,
  };
}

function summarizeConversions(rows: any[]) {
  const totals: Record<string, number> = {};
  const rates: number[] = [];
  for (const row of rows) {
    const sourceAmount = Number(String(row.source_amount || '').replace(',', '.'));
    const destinationAmount = Number(String(row.destination_amount || '').replace(',', '.'));
    const sourceAsset = String(row.source_asset_code || '').toUpperCase();
    const destAsset = String(row.destination_asset_code || '').toUpperCase();
    if (Number.isFinite(sourceAmount) && sourceAsset) {
      totals[`spent_${sourceAsset}`] = (totals[`spent_${sourceAsset}`] || 0) + sourceAmount;
    }
    if (Number.isFinite(destinationAmount) && destAsset) {
      totals[`received_${destAsset}`] = (totals[`received_${destAsset}`] || 0) + destinationAmount;
    }
    if (Number.isFinite(sourceAmount) && sourceAmount > 0 && Number.isFinite(destinationAmount) && destinationAmount > 0) {
      rates.push(destinationAmount / sourceAmount);
    }
  }
  const averageRate = rates.length ? rates.reduce((sum, rate) => sum + rate, 0) / rates.length : null;
  return {
    count: rows.length,
    totals,
    averageRate,
  };
}

function buildFinancialMemoryMessage(mode: string, lastPayment: any, conversionSummary: any, recentPayments: any[]) {
  if (mode === 'repeat_payment') {
    if (!lastPayment) return 'Não encontrei pagamento anterior compatível para repetir.';
    return `Último pagamento compatível: ${formatCustomerAssetAmount(lastPayment.destinationAmount, lastPayment.destinationAssetCode)} para ${lastPayment.counterparty}.`;
  }

  if (mode === 'monthly_conversion' || mode === 'average_quote') {
    if (!conversionSummary.count) return 'Não encontrei conversões confirmadas neste mês.';
    const totals = Object.entries(conversionSummary.totals)
      .map(([key, value]) => `${key}: ${Number(value).toFixed(2)}`)
      .join(', ');
    const avg = conversionSummary.averageRate ? ` Média de cotação: ${conversionSummary.averageRate.toFixed(6)}.` : '';
    return `Neste mês: ${conversionSummary.count} conversão(ões). ${totals || 'Sem totais disponíveis.'}.${avg}`;
  }

  if (!recentPayments.length && !conversionSummary.count) {
    return 'Ainda não encontrei memória financeira suficiente para responder isso.';
  }

  return [
    recentPayments[0]
      ? `Último pagamento: ${formatCustomerAssetAmount(recentPayments[0].destinationAmount, recentPayments[0].destinationAssetCode)} para ${recentPayments[0].counterparty}.`
      : '',
    conversionSummary.count
      ? `Conversões neste mês: ${conversionSummary.count}.`
      : '',
  ].filter(Boolean).join(' ');
}

/**
 * Tool: Add Contact
 */
function normalizeDigits(value: string): string {
  return String(value || '').replace(/\D+/g, '');
}

async function resolveWalletBySessionId(sessionId: string, fallbackName?: string): Promise<{ publicKey?: string; name?: string; pixKey?: string }> {
  const normalizedSessionId = String(sessionId || '').trim();
  if (!normalizedSessionId) return {};

  const { data: walletBySession, error: walletSessionError } = await supabase
    .from('wallets')
    .select('public_key, name, pix_key')
    .eq('session_id', normalizedSessionId)
    .limit(1)
    .maybeSingle();

  if (walletSessionError) {
    throw new Error(walletSessionError.message || 'Failed to lookup wallet by session');
  }

  if (!walletBySession?.public_key) {
    return {};
  }

  return {
    publicKey: walletBySession.public_key,
    name: walletBySession.name || fallbackName || undefined,
    pixKey: walletBySession.pix_key || undefined,
  };
}

async function resolveToolUserId(input: any): Promise<string> {
  const directUserId = String(input.user_id || input.userId || input.owner_id || '').trim();
  if (directUserId) return directUserId;

  const sessionId = String(input.session_id || input.sessionId || '').trim();
  if (!sessionId) {
    throw new Error('Não consegui identificar sua conta nesta sessão. Informe session_id ou faça login novamente.');
  }

  const { data: sessionRow, error: sessionError } = await supabase
    .from('agent_sessions')
    .select('user_id, email')
    .eq('session_id', sessionId)
    .limit(1)
    .maybeSingle();

  if (sessionError) {
    throw new Error(sessionError.message || 'Falha ao identificar usuário da sessão');
  }

  const userId = String(sessionRow?.user_id || sessionRow?.email || '').trim();
  if (!userId) {
    throw new Error('Não consegui identificar sua conta nesta sessão. Faça login novamente.');
  }

  return userId;
}

async function resolveToolPublicKey(input: any): Promise<string> {
  const directPublicKey = String(input.public_key || input.publicKey || '').trim();
  if (directPublicKey) return directPublicKey;

  const sessionId = String(input.session_id || input.sessionId || '').trim();
  if (!sessionId) {
    throw new Error('Não consegui identificar a wallet nesta sessão. Faça login novamente.');
  }

  const { data: sessionRow, error: sessionError } = await supabase
    .from('agent_sessions')
    .select('public_key')
    .eq('session_id', sessionId)
    .limit(1)
    .maybeSingle();

  if (sessionError) {
    throw new Error(sessionError.message || 'Falha ao carregar sessão');
  }

  const sessionPublicKey = String(sessionRow?.public_key || '').trim();
  if (sessionPublicKey) return sessionPublicKey;

  const { data: walletRow, error: walletError } = await supabase
    .from('wallets')
    .select('public_key')
    .eq('session_id', sessionId)
    .limit(1)
    .maybeSingle();

  if (walletError) {
    throw new Error(walletError.message || 'Falha ao localizar wallet da sessão');
  }

  const walletPublicKey = String(walletRow?.public_key || '').trim();
  if (!walletPublicKey) {
    throw new Error('Wallet não encontrada para esta sessão. Faça login novamente.');
  }

  await supabase
    .from('agent_sessions')
    .update({ public_key: walletPublicKey, last_activity: new Date().toISOString() })
    .eq('session_id', sessionId);

  return walletPublicKey;
}

async function resolveContactPublicKeyByPixKey(contactRef: string): Promise<{ publicKey?: string; name?: string; pixKey?: string }> {
  const rawRef = String(contactRef || '').trim();
  const normalizedRef = rawRef.toLowerCase();
  if (!normalizedRef) return {};

  const isPublicKey = /^G[A-Z2-7]{55}$/i.test(rawRef);
  const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawRef);
  const numericRef = normalizeDigits(rawRef);

  if (isPublicKey) {
    const normalizedPublicKey = rawRef.toUpperCase();

    const { data: walletByPublicKey, error: walletPublicError } = await supabase
      .from('wallets')
      .select('public_key, name, pix_key')
      .eq('public_key', normalizedPublicKey)
      .limit(1)
      .maybeSingle();

    if (walletPublicError) {
      throw new Error(walletPublicError.message || 'Failed to lookup wallet by public key');
    }

    if (walletByPublicKey?.public_key) {
      return {
        publicKey: String(walletByPublicKey.public_key),
        name: walletByPublicKey.name || undefined,
        pixKey: walletByPublicKey.pix_key || undefined,
      };
    }

    const { data: contactByPublicKey, error: contactPublicError } = await supabase
      .from('contacts')
      .select('contact_name, stellar_public_key, pix_key')
      .eq('stellar_public_key', normalizedPublicKey)
      .limit(1)
      .maybeSingle();

    if (contactPublicError) {
      throw new Error(contactPublicError.message || 'Failed to lookup contact by public key');
    }

    if (contactByPublicKey?.stellar_public_key) {
      return {
        publicKey: String(contactByPublicKey.stellar_public_key),
        name: contactByPublicKey.contact_name || undefined,
        pixKey: contactByPublicKey.pix_key || undefined,
      };
    }

    return { publicKey: normalizedPublicKey };
  }

  const { data: walletByPix, error: walletPixError } = await supabase
    .from('wallets')
    .select('public_key, name, pix_key, session_id')
    .ilike('pix_key', normalizedRef)
    .limit(1)
    .maybeSingle();

  if (walletPixError) {
    throw new Error(walletPixError.message || 'Failed to lookup wallet transfer key');
  }

  if (walletByPix?.public_key) {
    return {
      publicKey: String(walletByPix.public_key),
      name: walletByPix.name || undefined,
      pixKey: walletByPix.pix_key || normalizedRef,
    };
  }

  const { data: contactByPix, error: contactPixError } = await supabase
    .from('contacts')
    .select('contact_name, stellar_public_key, pix_key')
    .ilike('pix_key', normalizedRef)
    .limit(1)
    .maybeSingle();

  if (contactPixError) {
    throw new Error(contactPixError.message || 'Failed to lookup contact transfer key');
  }

  if (contactByPix?.stellar_public_key) {
    return {
      publicKey: contactByPix.stellar_public_key,
      name: contactByPix.contact_name || undefined,
      pixKey: contactByPix.pix_key || normalizedRef,
    };
  }

  const { data: walletByPublicKey, error: walletPublicError } = await supabase
    .from('wallets')
    .select('public_key, name, pix_key, session_id')
    .eq('public_key', rawRef.toUpperCase())
    .limit(1)
    .maybeSingle();

  if (walletPublicError) {
    throw new Error(walletPublicError.message || 'Failed to lookup wallet by public key');
  }

  if (walletByPublicKey?.public_key) {
    return {
      publicKey: String(walletByPublicKey.public_key),
      name: walletByPublicKey.name || undefined,
      pixKey: walletByPublicKey.pix_key || undefined,
    };
  }

  const { data: contactByPublicKey, error: contactPublicError } = await supabase
    .from('contacts')
    .select('contact_name, stellar_public_key, pix_key')
    .eq('stellar_public_key', rawRef.toUpperCase())
    .limit(1)
    .maybeSingle();

  if (contactPublicError) {
    throw new Error(contactPublicError.message || 'Failed to lookup contact by public key');
  }

  if (contactByPublicKey?.stellar_public_key) {
    return {
      publicKey: contactByPublicKey.stellar_public_key,
      name: contactByPublicKey.contact_name || undefined,
      pixKey: contactByPublicKey.pix_key || undefined,
    };
  }

  if (isEmail) {
    const { data: sessionsByEmail, error: sessionEmailError } = await supabase
      .from('agent_sessions')
      .select('session_id, user_id, email')
      .ilike('email', normalizedRef)
      .order('updated_at', { ascending: false })
      .limit(5);

    if (sessionEmailError) {
      throw new Error(sessionEmailError.message || 'Failed to lookup user by email');
    }

    const { data: sessionsByUserId, error: sessionUserIdError } = await supabase
      .from('agent_sessions')
      .select('session_id, user_id, email')
      .ilike('user_id', normalizedRef)
      .order('updated_at', { ascending: false })
      .limit(5);

    if (sessionUserIdError) {
      throw new Error(sessionUserIdError.message || 'Failed to lookup user by user_id');
    }

    const sessionCandidates = [...(sessionsByEmail || []), ...(sessionsByUserId || [])];
    const seenSessionIds = new Set<string>();
    for (const sessionCandidate of sessionCandidates) {
      const candidateSessionId = String(sessionCandidate?.session_id || '').trim();
      if (!candidateSessionId || seenSessionIds.has(candidateSessionId)) continue;
      seenSessionIds.add(candidateSessionId);

      const resolved = await resolveWalletBySessionId(
        candidateSessionId,
        sessionCandidate?.user_id || sessionCandidate?.email || normalizedRef
      );
      if (resolved.publicKey) {
        logger.info(`[add_contact] resolved email ${normalizedRef} via agent_sessions session_id=${candidateSessionId}`);
        return resolved;
      }
    }

    const { data: userByEmail, error: userEmailError } = await supabase
      .from('users')
      .select('id, email, stellar_public_key')
      .ilike('email', normalizedRef)
      .limit(1)
      .maybeSingle();

    if (userEmailError) {
      const message = String(userEmailError.message || '').toLowerCase();
      if (!message.includes('users') && !message.includes('does not exist') && !message.includes('schema cache')) {
        throw new Error(userEmailError.message || 'Failed to lookup user by email');
      }
    }

    const userPublicKey = String((userByEmail as any)?.stellar_public_key || '').trim();
    if (/^G[A-Z2-7]{55}$/i.test(userPublicKey)) {
      logger.info(`[add_contact] resolved email ${normalizedRef} via users.email`);
      return {
        publicKey: userPublicKey,
        name: String((userByEmail as any)?.email || normalizedRef),
        pixKey: normalizedRef,
      };
    }

    const { data: externalByUserId, error: externalUserIdError } = await supabase
      .from('external_accounts')
      .select('session_id, user_id, data')
      .ilike('user_id', normalizedRef)
      .order('created_at', { ascending: false })
      .limit(5);

    if (externalUserIdError) {
      throw new Error(externalUserIdError.message || 'Failed to lookup external account by user_id');
    }

    for (const externalCandidate of externalByUserId || []) {
      const resolved = await resolveWalletBySessionId(
        String(externalCandidate?.session_id || ''),
        String(externalCandidate?.user_id || normalizedRef)
      );
      if (resolved.publicKey) {
        logger.info(`[add_contact] resolved email ${normalizedRef} via external_accounts.user_id`);
        return resolved;
      }
    }

    const { data: externalRows, error: externalRowsError } = await supabase
      .from('external_accounts')
      .select('session_id, user_id, data')
      .order('created_at', { ascending: false })
      .limit(100);

    if (externalRowsError) {
      throw new Error(externalRowsError.message || 'Failed to lookup external account data');
    }

    for (const row of externalRows || []) {
      const dataEmail = String((row as any)?.data?.email || '').trim().toLowerCase();
      if (dataEmail !== normalizedRef) continue;

      const resolved = await resolveWalletBySessionId(
        String((row as any)?.session_id || ''),
        String((row as any)?.user_id || dataEmail)
      );
      if (resolved.publicKey) {
        logger.info(`[add_contact] resolved email ${normalizedRef} via external_accounts.data.email`);
        return resolved;
      }
    }

    const { data: paymentLogRows, error: paymentLogError } = await supabase
      .from('payment_logs')
      .select('source_public_key, destination_public_key, created_at')
      .ilike('user_id', normalizedRef)
      .order('created_at', { ascending: false })
      .limit(10);

    if (paymentLogError) {
      const message = String(paymentLogError.message || '').toLowerCase();
      if (!message.includes('payment_logs') && !message.includes('does not exist') && !message.includes('schema cache')) {
        throw new Error(paymentLogError.message || 'Failed to lookup payment logs by user_id');
      }
    }

    for (const row of paymentLogRows || []) {
      const publicKey =
        String((row as any)?.source_public_key || '').trim() ||
        String((row as any)?.destination_public_key || '').trim();
      if (/^G[A-Z2-7]{55}$/i.test(publicKey)) {
        logger.info(`[add_contact] resolved email ${normalizedRef} via payment_logs.user_id`);
        return {
          publicKey,
          name: normalizedRef,
          pixKey: undefined,
        };
      }
    }

    const { data: operationRows, error: operationError } = await supabase
      .from('operations')
      .select('source_public_key, destination_key, created_at')
      .ilike('user_id', normalizedRef)
      .order('created_at', { ascending: false })
      .limit(10);

    if (operationError) {
      const message = String(operationError.message || '').toLowerCase();
      if (!message.includes('operations') && !message.includes('does not exist') && !message.includes('schema cache')) {
        throw new Error(operationError.message || 'Failed to lookup operations by user_id');
      }
    }

    for (const row of operationRows || []) {
      const publicKey =
        String((row as any)?.source_public_key || '').trim() ||
        String((row as any)?.destination_key || '').trim();
      if (/^G[A-Z2-7]{55}$/i.test(publicKey)) {
        logger.info(`[add_contact] resolved email ${normalizedRef} via operations.user_id`);
        return {
          publicKey,
          name: normalizedRef,
          pixKey: undefined,
        };
      }
    }

    logger.warn(`[add_contact] could not resolve email ${normalizedRef} to a wallet`);
  }

  if (numericRef.length >= 8) {
    const candidates = Array.from(
      new Set([
        numericRef,
        numericRef.slice(-11),
        numericRef.slice(-10),
        numericRef.slice(-9),
        numericRef.slice(-8),
      ].filter((value) => value.length >= 8))
    );

    for (const candidate of candidates) {
      const { data: contactByPhone, error: contactPhoneError } = await supabase
        .from('contacts')
        .select('contact_name, stellar_public_key, pix_key, phone_number')
        .ilike('phone_number', `%${candidate}%`)
        .limit(1)
        .maybeSingle();

      if (contactPhoneError) {
        throw new Error(contactPhoneError.message || 'Failed to lookup contact by phone');
      }

      if (contactByPhone?.stellar_public_key) {
        return {
          publicKey: contactByPhone.stellar_public_key,
          name: contactByPhone.contact_name || undefined,
          pixKey: contactByPhone.pix_key || undefined,
        };
      }

      const { data: sessionByPhone, error: sessionPhoneError } = await supabase
        .from('agent_sessions')
        .select('session_id, user_id, email, phone_number')
        .ilike('phone_number', `%${candidate}%`)
        .limit(1)
        .maybeSingle();

      if (sessionPhoneError) {
        throw new Error(sessionPhoneError.message || 'Failed to lookup user by phone');
      }

      if (sessionByPhone?.session_id) {
        const { data: walletBySession, error: walletSessionError } = await supabase
          .from('wallets')
          .select('public_key, name, pix_key')
          .eq('session_id', sessionByPhone.session_id)
          .limit(1)
          .maybeSingle();

        if (walletSessionError) {
          throw new Error(walletSessionError.message || 'Failed to lookup wallet by session phone');
        }

        if (walletBySession?.public_key) {
          return {
            publicKey: walletBySession.public_key,
            name: walletBySession.name || sessionByPhone.user_id || sessionByPhone.email || undefined,
            pixKey: walletBySession.pix_key || undefined,
          };
        }
      }
    }
  }

  return {};
}

async function resolveContactProfileByPublicKey(publicKey: string): Promise<{
  public_key: string;
  name?: string;
  pix_key?: string;
  email?: string;
  phone_number?: string;
  cpf?: string;
  user_id?: string;
}> {
  const normalizedPublicKey = String(publicKey || '').trim();
  if (!normalizedPublicKey) {
    return { public_key: normalizedPublicKey };
  }

  let profile: any = { public_key: normalizedPublicKey };

  const { data: walletRow, error: walletError } = await supabase
    .from('wallets')
    .select('session_id, public_key, name, pix_key')
    .eq('public_key', normalizedPublicKey)
    .limit(1)
    .maybeSingle();

  if (walletError) {
    throw new Error(walletError.message || 'Failed to lookup wallet profile');
  }

  if (walletRow) {
    profile = {
      ...profile,
      name: walletRow.name || undefined,
      pix_key: walletRow.pix_key || undefined,
    };
  }

  const sessionId = String(walletRow?.session_id || '').trim();
  if (sessionId) {
    const { data: sessionRow, error: sessionError } = await supabase
      .from('agent_sessions')
      .select('user_id, email, phone_number')
      .eq('session_id', sessionId)
      .limit(1)
      .maybeSingle();

    if (sessionError) {
      throw new Error(sessionError.message || 'Failed to lookup session profile');
    }

    if (sessionRow) {
      profile = {
        ...profile,
        user_id: sessionRow.user_id || undefined,
        email: sessionRow.email || undefined,
        phone_number: sessionRow.phone_number || undefined,
      };
    }

    const { data: externalRows, error: externalError } = await supabase
      .from('external_accounts')
      .select('data')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: false })
      .limit(10);

    if (externalError) {
      const message = String(externalError.message || '').toLowerCase();
      if (!message.includes('external_accounts') && !message.includes('does not exist') && !message.includes('schema cache')) {
        throw new Error(externalError.message || 'Failed to lookup external account profile');
      }
    } else {
      for (const row of externalRows || []) {
        const data = (row as any)?.data || {};
        if (!profile.email && data?.email) profile.email = String(data.email).trim();
        if (!profile.phone_number && data?.phone_number) profile.phone_number = String(data.phone_number).trim();
        if (!profile.cpf && data?.cpf) profile.cpf = String(data.cpf).trim();
      }
    }
  }

  return profile;
}

async function executeAddContact(input: any): Promise<string> {
  try {
    logger.debug(`Tool: Adding contact ${input.contact_name}`);
    const ownerId = await resolveToolUserId(input);
    const contactKey = String(input.public_key || input.stellar_public_key || input.pix_key || input.contact_key || '').trim();
    const isPublicKey = /^G[A-Z2-7]{55}$/i.test(contactKey);
    const pixKeyInput = String(input.pix_key || (!isPublicKey ? contactKey : '') || '').trim().toLowerCase();
    const resolved = pixKeyInput ? await resolveContactPublicKeyByPixKey(pixKeyInput) : {};
    const publicKey = isPublicKey ? contactKey : String(resolved.publicKey || '').trim();

    if (!publicKey) {
      throw new Error('Informe uma chave válida (pública, transferência, e-mail ou telefone) já cadastrada.');
    }

    const requestedName = String(input.contact_name || input.name || '').trim();
    const contactName = String(requestedName || resolved.name || `Contato ${publicKey.slice(0, 6)}`).trim();

    const { data, error } = await supabase
      .from("contacts")
      .upsert({
        owner_id: ownerId,
        contact_name: contactName,
        stellar_public_key: publicKey,
        pix_key: pixKeyInput || resolved.pixKey || null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'owner_id,contact_name' })
      .select()
      .single();

    if (error) {
      throw new Error(error.message);
    }
    const profile = await resolveContactProfileByPublicKey(publicKey);
    const preferredIdentifier = String(profile.email || '').trim().toLowerCase()
      || String(profile.phone_number || '').replace(/\D+/g, '')
      || String(profile.cpf || '').replace(/\D+/g, '')
      || (String(profile.pix_key || '').includes('@talktostellar') ? '' : String(profile.pix_key || '').trim());
    const profileLines = [
      `Nome: ${contactName}`,
      `Chave: ${preferredIdentifier || 'indisponível'}`,
      profile.email ? `E-mail: ${profile.email}` : null,
      profile.phone_number ? `Telefone: ${profile.phone_number}` : null,
      profile.cpf ? `CPF: ${profile.cpf}` : null,
    ].filter(Boolean);

    const safeContact = {
      ...data,
      stellar_public_key: undefined,
      public_key: undefined,
    };
    const safeProfile = {
      ...profile,
      public_key: undefined,
    };

    return JSON.stringify({
      success: true,
      contact: safeContact,
      contact_profile: safeProfile,
      message: `Contato adicionado com sucesso.\n${profileLines.join('\n')}`,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return JSON.stringify({
      success: false,
      error: errorMessage,
    });
  }
}

/**
 * Tool: List Contacts
 */
async function executeListContacts(input: any): Promise<string> {
  try {
    const ownerId = await resolveToolUserId(input);
    logger.debug(`Tool: Listing contacts from database for user ${ownerId}`);

    const loadContacts = () => supabase
      .from("contacts")
      .select("id, owner_id, contact_name, stellar_public_key, phone_number, pix_key, created_at")
      .order("contact_name", { ascending: true })
      .eq("owner_id", ownerId);

    let { data: contacts, error } = await loadContacts();

    if (error) {
      const errorCode = String((error as any)?.code || '');
      const errorMessage = String((error as any)?.message || '').toLowerCase();
      const contactsTableMissing =
        errorCode === 'PGRST205' ||
        errorCode === '42P01' ||
        errorMessage.includes("could not find the table 'public.contacts'") ||
        errorMessage.includes('relation') && errorMessage.includes('contacts');

      if (contactsTableMissing) {
        return JSON.stringify({
          success: false,
          error: 'A tabela de contatos ainda nao foi criada no banco. Reinicie o backend para aplicar as migracoes ou rode o SQL de bootstrap no Supabase.',
          code: 'CONTACTS_TABLE_MISSING',
        });
      }

      throw new Error(error.message || "Failed to fetch contacts");
    }

    if ((contacts || []).length < 5) {
      try {
        await ContactSeedService.ensureStarterContactsForUser(ownerId);
        const refreshed = await loadContacts();
        if (!refreshed.error) {
          contacts = refreshed.data;
        } else {
          logger.warn(`[executeListContacts] starter contact refresh failed: ${refreshed.error.message || JSON.stringify(refreshed.error)}`);
        }
      } catch (seedError) {
        logger.warn(`[executeListContacts] starter contact seed failed: ${seedError instanceof Error ? seedError.message : String(seedError)}`);
      }
    }
    const publicKeys = (contacts || [])
      .map((contact: any) => String(contact?.stellar_public_key || '').trim())
      .filter(Boolean);

    let paymentRows: any[] = [];
    if (publicKeys.length > 0) {
      const { data: logs, error: logsError } = await supabase
        .from('payment_logs')
        .select('status, operation_type, destination_public_key, destination_amount, destination_asset_code, completed_at, created_at')
        .eq('user_id', ownerId)
        .order('completed_at', { ascending: false })
        .limit(300);
      if (!logsError) {
        paymentRows = Array.isArray(logs) ? logs : [];
      }
    }

    const byDestination = new Map<string, any[]>();
    for (const row of paymentRows) {
      const key = String(row?.destination_public_key || '').trim();
      if (!key) continue;
      if (!byDestination.has(key)) byDestination.set(key, []);
      byDestination.get(key)!.push(row);
    }

    const contactProfiles = await Promise.all((contacts || []).map(async (contact: any) => {
      const contactKey = String(contact?.stellar_public_key || '').trim();
      if (!contactKey) return {};
      try {
        return await resolveContactProfileByPublicKey(contactKey);
      } catch (error) {
        logger.warn(`[executeListContacts] failed to enrich ${contactKey}: ${error instanceof Error ? error.message : String(error)}`);
        return {};
      }
    }));

    const enrichedContacts = (contacts || []).map((contact: any, index: number) => {
      const profile: any = contactProfiles[index] || {};
      const contactKey = String(contact?.stellar_public_key || '').trim();
      const relatedRows = byDestination.get(contactKey) || [];
      const successfulRows = relatedRows.filter((row: any) => isSuccessfulPaymentRow(row) && !isConversionOperation(row));
      const sortedRows = successfulRows
        .slice()
        .sort((a: any, b: any) => paymentCompletedAtMs(b) - paymentCompletedAtMs(a));

      const txCount = successfulRows.length;
      const totalSent = successfulRows.reduce((sum: number, row: any) => sum + toNumber(row.destination_amount), 0);
      const lastRow = sortedRows[0];
      const lastAmount = toNumber(lastRow?.destination_amount);
      const lastAsset = String(lastRow?.destination_asset_code || 'USDC').toUpperCase();
      const lastAt = paymentCompletedAtMs(lastRow);
      const intervals: number[] = [];

      for (let i = 1; i < sortedRows.length; i += 1) {
        const prev = paymentCompletedAtMs(sortedRows[i - 1]);
        const cur = paymentCompletedAtMs(sortedRows[i]);
        const gapDays = Math.abs(prev - cur) / (1000 * 60 * 60 * 24);
        if (Number.isFinite(gapDays) && gapDays > 0) intervals.push(gapDays);
      }

      const avgInterval = intervals.length ? intervals.reduce((sum, val) => sum + val, 0) / intervals.length : null;
      const recurring = txCount >= 3 && !!avgInterval && avgInterval <= 45;
      const favorite = txCount >= 4;
      const label = String(contact.contact_name || contact.name || 'Contato').trim();
      const tags = [favorite ? 'favorito' : null, recurring ? 'recorrente' : null].filter(Boolean);

      return {
        ...contact,
        destination_public_key: contact.stellar_public_key || profile.public_key || null,
        stellar_public_key: undefined,
        public_key: undefined,
        email: contact.email || profile.email || null,
        cpf: contact.cpf || profile.cpf || null,
        contact_profile: {
          ...profile,
          public_key: undefined,
        },
        display_label: tags.length ? `${label} (${tags.join(', ')})` : label,
        favorite,
        recurring,
        history: {
          tx_count: txCount,
          total_sent: totalSent,
          total_sent_label: txCount ? formatCustomerAssetAmount(String(totalSent.toFixed(2)), lastAsset) : null,
          last_amount: txCount ? lastAmount : null,
          last_asset: txCount ? lastAsset : null,
          last_amount_label: txCount ? formatCustomerAssetAmount(String(lastAmount.toFixed(2)), lastAsset) : null,
          last_at: lastAt ? new Date(lastAt).toISOString() : null,
          avg_interval_days: avgInterval ? Number(avgInterval.toFixed(1)) : null,
          suggested_repeat_amount: txCount ? lastAmount : null,
        },
      };
    });

    logger.debug(`executeListContacts: returning ${((enrichedContacts||[]).length)} contacts for user ${ownerId}`);
    logger.debug(`executeListContacts: contacts data=${JSON.stringify(enrichedContacts?.slice(0,50) || [])}`);

    return JSON.stringify({
      success: true,
      contact_count: enrichedContacts?.length || 0,
      contacts: enrichedContacts || [],
      message: `Found ${(enrichedContacts || []).length} contacts`,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return JSON.stringify({
      success: false,
      error: errorMessage,
    });
  }
}

/**
 * Tool: List Accounts and Contacts
 */
async function executeListWalletsAndContacts(): Promise<string> {
  try {
    logger.debug("Tool: Listing all accounts with contacts");

    const { data: wallets, error: walletsError } = await supabase
      .from("wallets")
      .select("*")
      .order("created_at", { ascending: false });

    if (walletsError) {
      throw new Error(walletsError.message);
    }

    if (!wallets || wallets.length === 0) {
      return JSON.stringify({
        success: true,
        account_count: 0,
        accounts: [],
        message: "No accounts found",
      });
    }

    const sessionIds = wallets.map((w: any) => w.session_id).filter(Boolean);

    const { data: sessions, error: sessionsError } = await supabase
      .from("agent_sessions")
      .select("session_id, user_id, email, phone_number")
      .in("session_id", sessionIds);

    if (sessionsError) {
      throw new Error(sessionsError.message);
    }

    const sessionById = new Map<string, any>();
    (sessions || []).forEach((s: any) => sessionById.set(s.session_id, s));

    let contacts: any[] = [];
    const { data: contactsByOwner, error: contactsOwnerError } = await supabase
      .from("contacts")
      .select("*");

    if (!contactsOwnerError) {
      contacts = contactsByOwner || [];
    }

    const formattedWallets = wallets.map((wallet: any, index: number) => {
      const session = sessionById.get(wallet.session_id);
      const walletName = wallet.name ||
        (session?.email ? String(session.email).split("@")[0] : undefined) ||
        `account_${index + 1}`;

      const relatedContacts = contacts.filter((c: any) => {
        if (session?.user_id) {
          return c.owner_id === session.user_id || c.user_id === session.user_id;
        }
        return false;
      }).map((c: any) => ({
        id: c.id,
        name: c.contact_name,
        transfer_key: c.pix_key || c.email || c.phone_number || c.cpf || undefined,
      }));

      return {
        name: walletName,
        user_id: session?.user_id,
        email: session?.email,
        phone_number: session?.phone_number,
        contact_count: relatedContacts.length,
        contacts: relatedContacts,
      };
    });

    return JSON.stringify({
      success: true,
      account_count: formattedWallets.length,
      accounts: formattedWallets,
      message: `Found ${formattedWallets.length} accounts with contacts`,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return JSON.stringify({
      success: false,
      error: errorMessage,
    });
  }
}

/**
 * Tool: Reset PIN
 * Generates a temporary reset link for user to change their PIN
 */
async function executeResetPin(input: any): Promise<string> {
  try {
    logger.debug(`Tool: Resetting PIN for user ${input.user_id}`);

    const sessionId = String(input.session_id || '').trim();
    const sessionToken = String(input.session_token || input.sessionToken || '').trim();
    const requestedUserId = String(input.user_id || '').trim();
    const language = String(input.language || '').trim().toLowerCase().startsWith('en') ? 'en' : 'pt-BR';

    if (!sessionId || !sessionToken) {
      return JSON.stringify({
        success: false,
        error: 'session_id e session_token são obrigatórios para redefinir PIN',
      });
    }

    // Resolve user_id from session context when LLM does not provide it.
    let resolvedUserId = requestedUserId;

    const { data: sessionRow, error: sessionError } = await supabase
      .from('agent_sessions')
      .select('user_id, email, session_token')
      .eq('session_id', sessionId)
      .maybeSingle();

    if (sessionError) {
      throw new Error(`Failed to resolve session context: ${sessionError.message}`);
    }

    const sessionUserId = String(sessionRow?.user_id || '').trim();
    const sessionEmail = String(sessionRow?.email || '').trim();
    const storedSessionToken = String((sessionRow as any)?.session_token || '').trim();

    if (!storedSessionToken || !timingSafeEqualString(storedSessionToken, sessionToken)) {
      return JSON.stringify({
        success: false,
        error: 'Sessão inválida. Faça login novamente para redefinir PIN.',
      });
    }

    if (!resolvedUserId && sessionUserId) {
      resolvedUserId = sessionUserId;
    }

    const emailCandidates = new Set<string>();
    if (resolvedUserId.includes('@')) emailCandidates.add(resolvedUserId);
    if (sessionUserId.includes('@')) emailCandidates.add(sessionUserId);
    if (sessionEmail.includes('@')) emailCandidates.add(sessionEmail);

    // Try to map email -> users.id when table exists, but keep flowing without it.
    if (!resolvedUserId || resolvedUserId.includes('@')) {
      for (const email of emailCandidates) {
        const { data: userRow, error: userError } = await supabase
          .from('users')
          .select('id')
          .eq('email', email)
          .maybeSingle();

        if (userError) {
          const userErrorMessage = String(userError.message || '').toLowerCase();
          const usersTableMissing =
            userErrorMessage.includes("could not find the table 'public.users'") ||
            userErrorMessage.includes('relation "users" does not exist') ||
            userErrorMessage.includes('relation public.users does not exist');

          if (usersTableMissing) {
            logger.warn('reset_pin: users table not available; using session user_id/email fallback');
            break;
          }

          throw new Error(`Failed to resolve user by email: ${userError.message}`);
        }

        const mappedUserId = String(userRow?.id || '').trim();
        if (mappedUserId) {
          resolvedUserId = mappedUserId;
          break;
        }
      }
    }

    if (!resolvedUserId) {
      throw new Error('Nao foi possivel identificar o usuario da sessao para redefinir PIN. Tente se autenticar novamente.');
    }

    // Generate reset token
    const resetEmail = sessionEmail || Array.from(emailCandidates)[0] || '';
    const resetData = await PinResetService.generateResetToken(resolvedUserId, sessionId, {
      email: resetEmail,
      language,
    });

    const emailMessage = resetData.email_sent && resetData.masked_email
      ? (language === 'en'
          ? `We sent an email to ${resetData.masked_email} with the secure link to change your PIN. It is valid for ${resetData.expires_in_minutes} minutes.`
          : `Enviei um e-mail para ${resetData.masked_email} com o link seguro para mudar seu PIN. Ele vale por ${resetData.expires_in_minutes} minutos.`)
      : (language === 'en'
          ? `I generated a secure PIN change link. It is valid for ${resetData.expires_in_minutes} minutes:\n${resetData.reset_url}`
          : `Gerei um link seguro para mudar seu PIN. Ele vale por ${resetData.expires_in_minutes} minutos:\n${resetData.reset_url}`);

    return JSON.stringify({
      success: true,
      reset_url: resetData.reset_url,
      expires_in_minutes: resetData.expires_in_minutes,
      user_id: resolvedUserId,
      email_sent: Boolean(resetData.email_sent),
      masked_email: resetData.masked_email,
      message: emailMessage,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`PIN reset error: ${errorMessage}`);
    return JSON.stringify({
      success: false,
      error: errorMessage,
    });
  }
}

/**
 * Tool: Restart Onboarding
 * Allows user to set/reset PIN and passkey, optionally creating a new wallet
 */
async function executeRestartOnboarding(input: any): Promise<string> {
  try {
    logger.debug(`Tool: Restarting onboarding for session ${input.session_id}`);

    const sessionId = String(input.session_id || '');
    const userId = String(input.user_id || '');
    const pin = String(input.pin || '').trim();
    const requestPasskey = Boolean(input.request_passkey);
    const email = input.email ? String(input.email).trim() : undefined;
    const phoneNumber = input.phone_number ? String(input.phone_number).trim() : undefined;

    // Validate PIN format (4-8 digits)
    if (!pin || pin.length < 4 || pin.length > 8) {
      return JSON.stringify({
        success: false,
        error: 'PIN deve ter entre 4 e 8 dígitos',
      });
    }

    if (!/^\d+$/.test(pin)) {
      return JSON.stringify({
        success: false,
        error: 'PIN deve conter apenas números',
      });
    }

    const pinHash = hashWalletPin(pin);

    // If no user_id provided, create a new user/wallet
    let finalUserId = userId;
    let publicKey: string | undefined;

    if (!userId) {
      try {
        // Create new wallet/user
        const result = await UserService.onboardUser({
          email,
          phoneNumber,
        });
        finalUserId = result.userId;
        publicKey = result.publicKey;

        logger.info(`New user created during onboarding restart: ${finalUserId}`);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return JSON.stringify({
          success: false,
          error: `Failed to create new user: ${errorMessage}`,
        });
      }
    }

    // Save PIN to session
    try {
      const { data: sessionData, error: sessionError } = await supabase
        .from('agent_sessions')
        .select('id')
        .eq('session_id', sessionId)
        .single();

      if (sessionError && sessionError.code !== 'PGRST116') {
        throw sessionError;
      }

      if (sessionData) {
        // Update existing session with PIN
        const { error: updateError } = await supabase
          .from('agent_sessions')
          .update({
            session_password_hash: pinHash,
            user_id: finalUserId,
            updated_at: new Date().toISOString(),
          })
          .eq('session_id', sessionId);

        if (updateError) {
          throw updateError;
        }
      } else {
        // Create new session with PIN
        const { error: insertError } = await supabase
          .from('agent_sessions')
          .insert({
            session_id: sessionId,
            user_id: finalUserId,
            session_password_hash: pinHash,
            email: email || `${finalUserId}@talktosteller.local`,
            phone_number: phoneNumber,
            public_key: publicKey,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });

        if (insertError) {
          throw insertError;
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to save PIN to session: ${errorMessage}`);
      return JSON.stringify({
        success: false,
        error: `Failed to save PIN: ${errorMessage}`,
      });
    }

    // Passkey enrollment is intentionally not performed from the agent/tool layer.
    // It requires an authenticated frontend session so the WebAuthn credential is
    // bound to the account owner, not merely to a user_id supplied in chat.
    const passkeyUrl: string | undefined = undefined;

    // Build response message
    const messages = [
      `PIN definido com sucesso`,
      `Sua conta está segura com o PIN ${pin.replace(/./g, '*')}`,
    ];

    if (requestPasskey && passkeyUrl) {
      messages.push(`Próximo passo: Configure sua Passkey (biometria/face) para maior segurança`);
      messages.push(`Abra este link: ${passkeyUrl}`);
    } else if (requestPasskey && !passkeyUrl) {
      messages.push(`Por segurança, a Passkey deve ser ativada pela página autenticada da sua conta depois do login.`);
    } else {
      messages.push(`Você pode configurar uma Passkey depois se quiser.`);
    }

    return JSON.stringify({
      success: true,
      user_id: finalUserId,
      session_id: sessionId,
      public_key: publicKey,
      passkey_url: passkeyUrl,
      pin_set: true,
      message: messages.join('\n'),
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Onboarding restart error: ${errorMessage}`);
    return JSON.stringify({
      success: false,
      error: errorMessage,
    });
  }
}

/**
 * Convert tool definitions to OpenAI format with proper structure
 */
function convertToolsToOpenAIFormat(definitions: typeof toolDefinitions) {
  return definitions.map((tool: any) => ({
    type: "function" as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }));
}

/**
 * All available tools for export
 */
export const ALL_TOOLS = convertToolsToOpenAIFormat(toolDefinitions);
