import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { supabase } from '../../config/supabase';
import { AgentRepository } from '../../repositories/agent.repository';
import { WalletRepository } from '../../repositories/wallet.repository';
import { ExternalRepository } from '../../repositories/external.repository';
import { ContactRepository } from '../../api/repository/contact.repository';
import { VaultService } from '../../services/vault.service';
import { StellarService } from '../services/stellar.service';
import { TransferNotificationService } from '../services/transfer-notification.service';
import { ContactSeedService } from '../services/contact-seed.service';
import { logger } from '../../utils/logger';
import { getAssetIssuer, normalizeAssetCode } from '../../config/assets';
import { formatCustomerAssetAmount, formatNetworkFeeForCustomer } from '../../utils/fee-display';
import { Keypair } from '@stellar/stellar-sdk';
import { v4 as uuidv4 } from 'uuid';
import { isSessionExpired } from '../../utils/session-expiry';

function getJwtSecret() {
  return process.env.JWT_SECRET || 'dev-secret-change-me';
}

const agentRepo = new AgentRepository(supabase);
const walletRepo = new WalletRepository(supabase);
const externalRepo = new ExternalRepository(supabase);
const vaultService = new VaultService(supabase);

type IdentityCollision = {
  field: 'email' | 'phone_number' | 'cpf';
  value: string;
  sessionId?: string;
  userId?: string;
};

function normalizePhoneForCompare(value?: string): string {
  return String(value || '').replace(/\D+/g, '');
}

function normalizeEmailForCompare(value?: string): string {
  return String(value || '').trim().toLowerCase();
}

function isUniqueViolation(error: any): boolean {
  const code = String(error?.code || '').trim();
  const message = String(error?.message || '').toLowerCase();
  return (
    code === '23505' ||
    message.includes('duplicate key') ||
    message.includes('unique constraint') ||
    message.includes('already exists')
  );
}

async function detectIdentityCollision(input: {
  email?: string;
  phoneNumber?: string;
  cpf?: string;
  allowedSessionIds?: string[];
  allowedUserIds?: string[];
}): Promise<IdentityCollision | null> {
  const normalizedEmail = normalizeEmailForCompare(input.email);
  const normalizedPhone = normalizePhoneForCompare(input.phoneNumber);
  const normalizedCpf = String(input.cpf || '').replace(/\D+/g, '');
  const allowedSessionIds = new Set((input.allowedSessionIds || []).map((value) => String(value || '').trim()).filter(Boolean));
  const allowedUserIds = new Set((input.allowedUserIds || []).map((value) => String(value || '').trim()).filter(Boolean));

  const isAllowed = (sessionId?: string, userId?: string) => {
    const sid = String(sessionId || '').trim();
    const uid = String(userId || '').trim();
    return (sid && allowedSessionIds.has(sid)) || (uid && allowedUserIds.has(uid));
  };

  if (normalizedEmail) {
    const { data, error } = await supabase
      .from('agent_sessions')
      .select('session_id, user_id, email')
      .eq('email', normalizedEmail)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    const sessionId = String((data as any)?.session_id || '').trim();
    const userId = String((data as any)?.user_id || '').trim();
    if ((sessionId || userId) && !isAllowed(sessionId, userId)) {
      return { field: 'email', value: normalizedEmail, sessionId, userId };
    }
  }

  if (normalizedPhone) {
    const { data, error } = await supabase
      .from('agent_sessions')
      .select('session_id, user_id, phone_number')
      .eq('phone_number', normalizedPhone)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) throw error;
    const sessionId = String((data as any)?.session_id || '').trim();
    const userId = String((data as any)?.user_id || '').trim();
    if ((sessionId || userId) && !isAllowed(sessionId, userId)) {
      return { field: 'phone_number', value: normalizedPhone, sessionId, userId };
    }
  }

  if (normalizedCpf) {
    const { data, error } = await supabase
      .from('external_accounts')
      .select('session_id, user_id, data')
      .not('data', 'is', null)
      .order('id', { ascending: false })
      .limit(200);

    if (error) throw error;

    for (const row of data || []) {
      const rowCpf = String((row as any)?.data?.cpf || '').replace(/\D+/g, '');
      if (!rowCpf || rowCpf !== normalizedCpf) continue;
      const sessionId = String((row as any)?.session_id || '').trim();
      const userId = String((row as any)?.user_id || '').trim();
      if (!isAllowed(sessionId, userId)) {
        return { field: 'cpf', value: normalizedCpf, sessionId, userId };
      }
    }
  }

  return null;
}

function isValidStellarPublicKey(value?: string) {
  if (!value) return false;
  try {
    Keypair.fromPublicKey(value.trim());
    return true;
  } catch {
    return false;
  }
}

function resolveAssetIssuer(assetCode: string, provided?: string): string | undefined {
  const normalized = normalizeAssetCode(assetCode);
  if (normalized === 'XLM') return undefined;
  return getAssetIssuer(normalized, provided);
}

async function configureWalletAssetsAndContacts(input: {
  userId: string;
  publicKey: string;
  vaultSecretId?: string | null;
}) {
  if (input.vaultSecretId) {
    try {
      const secretKey = await vaultService.getSecret(String(input.vaultSecretId));
      await ContactSeedService.createDefaultTrustlines(input.publicKey, secretKey, input.userId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn(`[external-finalize] default trustline setup failed for ${input.userId}: ${message}`);
    }
  }

  try {
    await ContactSeedService.ensureStarterContactsForUser(input.userId);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn(`[external-finalize] starter contact setup failed for ${input.userId}: ${message}`);
  }
}

async function upsertRecentContactFromPayment(input: {
  ownerId: string;
  sourcePublicKey: string;
  destinationPublicKey: string;
  destinationName?: string;
  destinationContact?: any;
}) {
  const ownerId = String(input.ownerId || '').trim();
  const destinationPublicKey = String(input.destinationPublicKey || '').trim();
  const sourcePublicKey = String(input.sourcePublicKey || '').trim();
  if (!ownerId || !destinationPublicKey || !isValidStellarPublicKey(destinationPublicKey)) return;
  if (sourcePublicKey && destinationPublicKey === sourcePublicKey) return;

  const explicitName = String(input.destinationContact?.contact_name || input.destinationName || '').trim();
  const contactName = explicitName || `Contato ${destinationPublicKey.slice(0, 6)}`;
  const pixKey = String(input.destinationContact?.pix_key || '').trim().toLowerCase() || null;

  const { data: existingContact, error: existingContactError } = await supabase
    .from('contacts')
    .select('id, contact_name, pix_key')
    .eq('owner_id', ownerId)
    .eq('stellar_public_key', destinationPublicKey)
    .limit(1)
    .maybeSingle();

  if (existingContactError) {
    logger.warn(`[external-finalize] contact lookup failed for owner=${ownerId}: ${existingContactError.message}`);
    return;
  }

  if (existingContact?.id) {
    const nextName = String(existingContact.contact_name || '').trim() || contactName;
    const nextPixKey = String(existingContact.pix_key || '').trim() || pixKey;
    const shouldUpdate =
      nextName !== String(existingContact.contact_name || '').trim() ||
      String(nextPixKey || '') !== String(existingContact.pix_key || '').trim();

    if (shouldUpdate) {
      const { error: updateError } = await supabase
        .from('contacts')
        .update({
          contact_name: nextName,
          pix_key: nextPixKey,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingContact.id);

      if (updateError) {
        logger.warn(`[external-finalize] contact update failed for owner=${ownerId}: ${updateError.message}`);
      }
    }
    return;
  }

  const { error: insertError } = await supabase
    .from('contacts')
    .insert({
      owner_id: ownerId,
      contact_name: contactName,
      stellar_public_key: destinationPublicKey,
      pix_key: pixKey,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

  if (insertError) {
    logger.warn(`[external-finalize] contact insert failed for owner=${ownerId}: ${insertError.message}`);
  }
}

async function sendTelegramPaymentNotification(input: {
  sessionId: string;
  userId: string;
  provider?: string | null;
  providerUserId?: string | null;
  amount: string;
  assetCode: string;
  sourceAmount?: string;
  sourceAssetCode?: string;
  feeXlm?: string;
  destinationName?: string;
  destination: string;
  hash?: string;
}) {
  const destinationLabel = input.destinationName || input.destination;
  const sourceLine = input.sourceAmount && input.sourceAssetCode
    ? `Origem debitada: ${formatCustomerAssetAmount(input.sourceAmount, input.sourceAssetCode)}\n`
    : '';
  const feeDisplay = input.feeXlm ? await formatNetworkFeeForCustomer(input.feeXlm) : null;
  const feeLine = feeDisplay?.display ? `Taxa baixa aplicada: ${feeDisplay.display}\n` : '';
  const text =
    `Pagamento confirmado.\n` +
    `Destino recebeu: ${formatCustomerAssetAmount(input.amount, input.assetCode)}\n` +
    sourceLine +
    feeLine +
    `Destino: ${destinationLabel}\n` +
    `${input.hash ? `Codigo da operacao: ${input.hash}` : ''}`;

  try {
    await agentRepo.saveMessage(input.sessionId, 'assistant', text);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn(`[payment-notify] failed to save payment confirmation message: ${message}`);
  }

  try {
    const botToken = String(process.env.TELEGRAM_BOT_TOKEN || '').trim();
    if (!botToken) {
      logger.warn('[telegram-notify] TELEGRAM_BOT_TOKEN is not configured; payment confirmation saved to chat history only');
      return;
    }

    let providerUserId = String(
      String(input.provider || '').toLowerCase() === 'telegram'
        ? input.providerUserId || ''
        : ''
    ).trim();

    const { data: mappingBySession } = await supabase
      .from('external_accounts')
      .select('provider, provider_user_id')
      .eq('provider', 'telegram')
      .eq('session_id', input.sessionId)
      .limit(1)
      .maybeSingle();

    providerUserId = providerUserId || String(mappingBySession?.provider_user_id || '').trim();

    if (!providerUserId) {
      const { data: mappingByUser } = await supabase
        .from('external_accounts')
        .select('provider, provider_user_id')
        .eq('provider', 'telegram')
        .eq('user_id', input.userId)
        .limit(1)
        .maybeSingle();
      providerUserId = String(mappingByUser?.provider_user_id || '').trim();
    }

    if (!providerUserId) {
      logger.warn(`[telegram-notify] telegram chat mapping not found for session ${input.sessionId}`);
      return;
    }

    const chatId = providerUserId;
    const telegramResponse = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
      }),
    });
    if (!telegramResponse.ok) {
      logger.warn(`[telegram-notify] telegram sendMessage failed with status ${telegramResponse.status}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn(`[telegram-notify] failed to send payment confirmation message: ${message}`);
  }
}

async function sendTelegramConversionNotification(input: {
  sessionId: string;
  userId: string;
  provider?: string | null;
  providerUserId?: string | null;
  sourceAmount: string;
  sourceAssetCode: string;
  destinationAmount: string;
  destinationAssetCode: string;
  feeXlm?: string;
  hash?: string;
}) {
  const feeDisplay = input.feeXlm ? await formatNetworkFeeForCustomer(input.feeXlm) : null;
  const feeLine = feeDisplay?.display ? `Taxa baixa aplicada: ${feeDisplay.display}\n` : '';
  const text =
    `Conversão confirmada.\n` +
    `Origem debitada: ${formatCustomerAssetAmount(input.sourceAmount, input.sourceAssetCode)}\n` +
    `Destino recebeu: ${formatCustomerAssetAmount(input.destinationAmount, input.destinationAssetCode)}\n` +
    feeLine +
    `${input.hash ? `Codigo da operacao: ${input.hash}` : ''}`;

  try {
    await agentRepo.saveMessage(input.sessionId, 'assistant', text);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn(`[conversion-notify] failed to save conversion confirmation message: ${message}`);
  }

  try {
    const botToken = String(process.env.TELEGRAM_BOT_TOKEN || '').trim();
    if (!botToken) {
      logger.warn('[telegram-notify] TELEGRAM_BOT_TOKEN is not configured; conversion confirmation saved to chat history only');
      return;
    }

    let providerUserId = String(
      String(input.provider || '').toLowerCase() === 'telegram'
        ? input.providerUserId || ''
        : ''
    ).trim();

    const { data: mappingBySession } = await supabase
      .from('external_accounts')
      .select('provider, provider_user_id')
      .eq('provider', 'telegram')
      .eq('session_id', input.sessionId)
      .limit(1)
      .maybeSingle();

    providerUserId = providerUserId || String(mappingBySession?.provider_user_id || '').trim();

    if (!providerUserId) {
      const { data: mappingByUser } = await supabase
        .from('external_accounts')
        .select('provider, provider_user_id')
        .eq('provider', 'telegram')
        .eq('user_id', input.userId)
        .limit(1)
        .maybeSingle();
      providerUserId = String(mappingByUser?.provider_user_id || '').trim();
    }

    if (!providerUserId) {
      logger.warn(`[telegram-notify] telegram chat mapping not found for conversion session ${input.sessionId}`);
      return;
    }

    const telegramResponse = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: providerUserId,
        text,
      }),
    });
    if (!telegramResponse.ok) {
      logger.warn(`[telegram-notify] conversion sendMessage failed with status ${telegramResponse.status}`);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn(`[telegram-notify] failed to send conversion confirmation message: ${message}`);
  }
}

async function ensureDestinationCanReceiveAsset(input: {
  destination: string;
  destinationWallet: any;
  assetCode: string;
  assetIssuer?: string;
  userId: string;
}) {
  if (input.assetCode === 'XLM') return;
  if (!input.assetIssuer) {
    throw new Error(`${input.assetCode}_ISSUER não está configurado no backend.`);
  }

  const balances = await StellarService.getAccountBalance(input.destination);
  const hasTrustline = balances.some((balance: any) =>
    String(balance.asset_code || '').toUpperCase() === input.assetCode &&
    String(balance.asset_issuer || '') === input.assetIssuer
  );

  if (hasTrustline) return;

  if (!input.destinationWallet?.vault_secret_id) {
    throw new Error(`O destinatário ainda não pode receber ${input.assetCode}. Ele precisa ativar recebimento em ${input.assetCode} antes dessa transferência.`);
  }

  const destinationSecret = await vaultService.getSecret(String(input.destinationWallet.vault_secret_id));
  const trustlineXdr = await StellarService.buildTrustlineXdr({
    sourcePublicKey: input.destination,
    assetCode: input.assetCode,
    assetIssuer: input.assetIssuer,
  });
  const trustlineResult = await StellarService.signAndSubmitXdr(
    input.userId,
    destinationSecret,
    trustlineXdr,
    {
      user_id: input.userId,
      type: 'TRUSTLINE',
      asset_code: input.assetCode,
      source_public_key: input.destination,
      context: `Auto trustline before incoming ${input.assetCode} payment`,
    }
  );

  if (!trustlineResult.success) {
    throw new Error(`Não consegui ativar recebimento em ${input.assetCode} para o destinatário: ${trustlineResult.error || 'erro desconhecido'}`);
  }
}

async function hashPaymentToken(token: string): Promise<string> {
  return crypto.createHash('sha256').update(token).digest('hex');
}

async function checkPaymentTokenUsed(tokenHash: string): Promise<boolean> {
  try {
    const { data } = await supabase
      .from('payment_confirmations')
      .select('id')
      .eq('token_hash', tokenHash)
      .limit(1);
    return Array.isArray(data) && data.length > 0;
  } catch (err: any) {
    logger.warn(`[payment-idempotency] error checking token usage: ${err?.message || String(err)}`);
    return false; // fail open if DB check fails
  }
}

async function claimPaymentToken(
  tokenHash: string,
  sessionId: string,
  userId: string,
  destination: string,
  amount: string,
  assetCode: string,
  details?: any
): Promise<boolean> {
  try {
    const { error } = await supabase
      .from('payment_confirmations')
      .insert({
        token_hash: tokenHash,
        session_id: sessionId,
        user_id: userId,
        destination,
        amount,
        asset_code: assetCode,
        status: 'pending',
        completed_at: null,
        details,
      });

    if (error) {
      if (String(error.code || '') === '23505') {
        return false;
      }
      logger.warn(`[payment-idempotency] error claiming token: ${error?.message || String(error)}`);
      return false;
    }
    return true;
  } catch (err: any) {
    logger.warn(`[payment-idempotency] error in claimPaymentToken: ${err?.message || String(err)}`);
    return false;
  }
}

async function updatePaymentTokenStatus(
  tokenHash: string,
  paymentHash: string | undefined,
  status: 'completed' | 'failed',
  details?: any
): Promise<void> {
  try {
    const { error } = await supabase
      .from('payment_confirmations')
      .update({
        payment_hash: paymentHash,
        status,
        completed_at: new Date().toISOString(),
        details,
      })
      .eq('token_hash', tokenHash);

    if (error) {
      logger.warn(`[payment-idempotency] error updating token status: ${error?.message || String(error)}`);
    }
  } catch (err: any) {
    logger.warn(`[payment-idempotency] error in updatePaymentTokenStatus: ${err?.message || String(err)}`);
  }
}

async function logPaymentDetails(
  sessionId: string,
  userId: string,
  sourcePublicKey: string,
  destinationPublicKey: string,
  sourceAmount: string,
  sourceAssetCode: string,
  sourceAssetIssuer: string | undefined,
  destinationAmount: string,
  destinationAssetCode: string,
  destinationAssetIssuer: string | undefined,
  feeXlm: string,
  paymentHash: string | undefined,
  operationType: string,
  status: 'pending' | 'success' | 'failed',
  errorMessage?: string,
  routePath?: any,
  metadata?: any
): Promise<void> {
  try {
    const { error } = await supabase
      .from('payment_logs')
      .insert({
        session_id: sessionId,
        user_id: userId,
        source_public_key: sourcePublicKey,
        destination_public_key: destinationPublicKey,
        source_amount: sourceAmount,
        source_asset_code: sourceAssetCode,
        source_asset_issuer: sourceAssetIssuer,
        destination_amount: destinationAmount,
        destination_asset_code: destinationAssetCode,
        destination_asset_issuer: destinationAssetIssuer,
        fee_xlm: feeXlm,
        payment_hash: paymentHash,
        operation_type: operationType,
        status,
        error_message: errorMessage,
        route_path: routePath,
        metadata,
        created_at: new Date().toISOString(),
        completed_at: status === 'success' ? new Date().toISOString() : null,
      });

    if (error) {
      logger.warn(`[payment-logging] error logging payment details: ${error?.message || String(error)}`);
    } else {
      logger.info(`[payment-logging] Payment logged: ${paymentHash || 'pending'} - ${status}`);
    }
  } catch (err: any) {
    logger.error(`[payment-logging] error in logPaymentDetails: ${err?.message || String(err)}`);
  }
}

export default class ExternalFinalizeController {
  // POST /api/external/finalize
  // body: { token, name?, email? }
  static async finalize(req: Request, res: Response) {
    try {
      const { token, name, email, pin } = req.body;
      const rawPhoneNumber = String(req.body?.phone_number || req.body?.phoneNumber || '').trim();
      const rawCpf = String(req.body?.cpf || '').trim();
      const normalizedPhoneNumber = rawPhoneNumber ? rawPhoneNumber.replace(/\D+/g, '') : '';
      const normalizedCpf = rawCpf ? rawCpf.replace(/\D+/g, '') : '';
      const browserId = String(req.body?.browser_id || '').trim();
      // Accept public_key coming from POST body or URL query (confirm link may include it)
      const publicKeyFromBody = String(req.body?.public_key || req.query?.public_key || '').trim() || undefined;
      if (!token) return res.status(400).json({ success: false, message: 'token is required' });

      let payload: any;
      try {
        payload = jwt.verify(token, getJwtSecret());
      } catch (err: any) {
        return res.status(400).json({ success: false, message: 'Invalid or expired token' });
      }

      // Check token idempotency - prevent reuse of payment links
      const tokenHash = await hashPaymentToken(token);
      const tokenWasUsed = await checkPaymentTokenUsed(tokenHash);
      if (tokenWasUsed) {
        logger.warn(`[external-finalize] payment confirmation token reused: ${tokenHash.substring(0, 16)}...`);
        return res.status(400).json({
          success: false,
          message: 'Este link de confirmação já foi utilizado. Solicite uma nova confirmação.'
        });
      }

      const tokenSub = String((payload as any)?.sub || '');
      if (tokenSub === 'external_conversion_confirm') {
        const {
          session_id,
          owner_id,
          source_amount,
          source_asset_code,
          source_asset_issuer,
          dest_amount,
          dest_asset_code,
          dest_asset_issuer,
          quote: tokenQuote,
        } = payload as any;

        if (!session_id || !dest_amount || !source_asset_code || !dest_asset_code) {
          return res.status(400).json({ success: false, message: 'token missing conversion data' });
        }

        const sourceAssetCode = normalizeAssetCode(source_asset_code);
        const destAssetCode = normalizeAssetCode(dest_asset_code);
        const sourceAssetIssuer = resolveAssetIssuer(sourceAssetCode, source_asset_issuer);
        const destAssetIssuer = resolveAssetIssuer(destAssetCode, dest_asset_issuer);

        if (sourceAssetCode !== 'XLM' && !sourceAssetIssuer) {
          return res.status(400).json({
            success: false,
            message: `${sourceAssetCode}_ISSUER não está configurado no backend.`,
          });
        }
        if (destAssetCode !== 'XLM' && !destAssetIssuer) {
          return res.status(400).json({
            success: false,
            message: `${destAssetCode}_ISSUER não está configurado no backend.`,
          });
        }

        const wallet = await walletRepo.getWalletBySession(String(session_id));
        if (!wallet?.public_key || !wallet?.vault_secret_id) {
          return res.status(400).json({ success: false, message: 'wallet not found for conversion confirmation' });
        }

        const session = await agentRepo.getSession(String(session_id));
        if (!session?.user_id) {
          return res.status(400).json({ success: false, message: 'session not found for conversion confirmation' });
        }
        if (isSessionExpired(session)) {
          await agentRepo.clearSession(String(session_id));
          return res.status(401).json({
            success: false,
            message: 'Sua sessão expirou. Entre novamente antes de confirmar a conversão.',
          });
        }

        const providedPin = String(req.body?.pin || '').trim();
        if (!providedPin) {
          return res.status(400).json({
            success: false,
            message: 'PIN é obrigatório para confirmar a conversão.',
          });
        }

        const pinHash = crypto
          .pbkdf2Sync(providedPin, process.env.PIN_SALT || 'salt', 100000, 64, 'sha256')
          .toString('hex');

        const sessionPinHash = String((session as any)?.session_password_hash || (session as any)?.password_hash || '').trim();
        if (!sessionPinHash || pinHash !== sessionPinHash) {
          return res.status(401).json({
            success: false,
            message: 'PIN inválido. Tente novamente.',
          });
        }

        await ensureDestinationCanReceiveAsset({
          destination: wallet.public_key,
          destinationWallet: wallet,
          assetCode: destAssetCode,
          assetIssuer: destAssetIssuer,
          userId: String(session.user_id),
        });

        const usesStrictSend = Boolean(String(source_amount || '').trim());
        const quote = usesStrictSend
          ? await StellarService.quoteStrictSendConversion({
              sourcePublicKey: wallet.public_key,
              destination: wallet.public_key,
              sourceAmount: String(source_amount).trim(),
              sourceAsset: { code: sourceAssetCode, issuer: sourceAssetIssuer },
              destAsset: { code: destAssetCode, issuer: destAssetIssuer },
            })
          : await StellarService.quotePathPayment({
              sourcePublicKey: wallet.public_key,
              destination: wallet.public_key,
              destAmount: String(dest_amount).trim(),
              sourceAsset: { code: sourceAssetCode, issuer: sourceAssetIssuer },
              destAsset: { code: destAssetCode, issuer: destAssetIssuer },
            });

        const tokenClaimed = await claimPaymentToken(
          tokenHash,
          String(session_id),
          String(session.user_id),
          wallet.public_key,
          String(dest_amount),
          destAssetCode,
          {
            type: 'conversion',
            owner_id: owner_id || String(session.user_id),
            source_asset_code: sourceAssetCode,
            source_asset_issuer: sourceAssetIssuer || null,
            source_amount: String(source_amount || ''),
            dest_asset_code: destAssetCode,
            dest_asset_issuer: destAssetIssuer || null,
            dest_amount: String(dest_amount),
            token_quote: tokenQuote || null,
            quote,
            browser_id: browserId || null,
          }
        );

        if (!tokenClaimed) {
          return res.status(400).json({
            success: false,
            message: 'Este link de confirmação já foi utilizado. Solicite uma nova confirmação.',
          });
        }

        await logPaymentDetails(
          String(session_id),
          String(session.user_id),
          wallet.public_key,
          wallet.public_key,
          String(quote.sourceAmount),
          String(quote.sourceAsset.code),
          quote.sourceAsset.code === 'XLM' ? undefined : quote.sourceAsset.issuer,
          String(quote.destinationAmount),
          String(quote.destinationAsset.code),
          quote.destinationAsset.code === 'XLM' ? undefined : quote.destinationAsset.issuer,
          String(quote.networkFeeXlm || '0.001'),
          undefined,
          usesStrictSend ? 'CONVERSION_STRICT_SEND' : 'CONVERSION_STRICT_RECEIVE',
          'pending',
          undefined,
          quote.path,
          {
            token_hash: tokenHash,
            token_quote: tokenQuote || null,
            quote,
          }
        );

        const unsignedXdr = usesStrictSend
          ? await StellarService.buildStrictSendConversionXdr({
              sourcePublicKey: wallet.public_key,
              destination: wallet.public_key,
              sourceAmount: String(source_amount).trim(),
              sourceAsset: { code: sourceAssetCode, issuer: sourceAssetIssuer },
              destAsset: { code: destAssetCode, issuer: destAssetIssuer },
            })
          : await StellarService.buildPathPaymentXdr({
              sourcePublicKey: wallet.public_key,
              destination: wallet.public_key,
              destAmount: String(dest_amount).trim(),
              sourceAsset: { code: sourceAssetCode, issuer: sourceAssetIssuer },
              destAsset: { code: destAssetCode, issuer: destAssetIssuer },
            });

        const secretKey = await vaultService.getSecret(String(wallet.vault_secret_id));
        const operationType = usesStrictSend ? 'PATH_PAYMENT_STRICT_SEND' : 'PATH_PAYMENT_STRICT_RECEIVE';
        const result = await StellarService.signAndSubmitXdr(
          String(session.user_id),
          secretKey,
          unsignedXdr,
          {
            user_id: String(session.user_id),
            type: operationType,
            destination_key: wallet.public_key,
            asset_code: destAssetCode,
            amount: Number(quote.destinationAmount),
            context:
              `Conversão interna confirmada: ${quote.sourceAmount} ${quote.sourceAsset.code} ` +
              `para ${quote.destinationAmount} ${quote.destinationAsset.code}.`,
            source_public_key: wallet.public_key,
            source_session_id: wallet.session_id,
            destination_session_id: wallet.session_id,
          }
        );

        if (!result.success) {
          await updatePaymentTokenStatus(
            tokenHash,
            undefined,
            'failed',
            {
              type: 'conversion',
              quote,
              error: result.error || 'Could not submit conversion',
            }
          );

          await logPaymentDetails(
            String(session_id),
            String(session.user_id),
            wallet.public_key,
            wallet.public_key,
            String(quote.sourceAmount),
            String(quote.sourceAsset.code),
            quote.sourceAsset.code === 'XLM' ? undefined : quote.sourceAsset.issuer,
            String(quote.destinationAmount),
            String(quote.destinationAsset.code),
            quote.destinationAsset.code === 'XLM' ? undefined : quote.destinationAsset.issuer,
            String(quote.networkFeeXlm || '0.001'),
            undefined,
            usesStrictSend ? 'CONVERSION_STRICT_SEND' : 'CONVERSION_STRICT_RECEIVE',
            'failed',
            result.error || 'Could not submit conversion',
            quote.path,
            {
              token_hash: tokenHash,
              type: 'conversion',
              quote,
              error: result.error || 'Could not submit conversion',
            }
          );

          return res.status(400).json({
            success: false,
            message: result.error || 'Could not submit conversion',
          });
        }

        const submittedDetails = result.hash
          ? await StellarService.getSubmittedPaymentDetails(result.hash)
          : null;

        const transferDetails = submittedDetails
          ? {
              ...submittedDetails,
              exact: true,
            }
          : {
              sourceAmount: String(quote.sourceAmount),
              sourceAssetCode: String(quote.sourceAsset.code),
              sourceAssetIssuer: quote.sourceAsset.issuer,
              destinationAmount: String(quote.destinationAmount),
              destinationAssetCode: String(quote.destinationAsset.code),
              destinationAssetIssuer: quote.destinationAsset.issuer,
              feeXlm: '',
              exact: false,
            };
        const feeDisplay = await formatNetworkFeeForCustomer(String(transferDetails.feeXlm || ''));
        const publicTransferDetails = {
          ...transferDetails,
          feeDisplay: feeDisplay.display,
          feeUsdc: feeDisplay.fee_usdc,
          feeBrl: feeDisplay.fee_brl,
        };

        await sendTelegramConversionNotification({
          sessionId: String(session_id),
          userId: String(session.user_id),
          provider: String((payload as any).provider || ''),
          providerUserId: String((payload as any).provider_user_id || ''),
          sourceAmount: String(publicTransferDetails.sourceAmount || quote.sourceAmount),
          sourceAssetCode: String(publicTransferDetails.sourceAssetCode || quote.sourceAsset.code),
          destinationAmount: String(publicTransferDetails.destinationAmount || quote.destinationAmount),
          destinationAssetCode: String(publicTransferDetails.destinationAssetCode || quote.destinationAsset.code),
          feeXlm: String(publicTransferDetails.feeXlm || ''),
          hash: result.hash,
        });

        await logPaymentDetails(
          String(session_id),
          String(session.user_id),
          wallet.public_key,
          wallet.public_key,
          String(publicTransferDetails.sourceAmount || quote.sourceAmount),
          String(publicTransferDetails.sourceAssetCode || quote.sourceAsset.code),
          String(publicTransferDetails.sourceAssetCode || quote.sourceAsset.code).toUpperCase() === 'XLM'
            ? undefined
            : (publicTransferDetails as any).sourceAssetIssuer || quote.sourceAsset.issuer,
          String(publicTransferDetails.destinationAmount || quote.destinationAmount),
          String(publicTransferDetails.destinationAssetCode || quote.destinationAsset.code),
          String(publicTransferDetails.destinationAssetCode || quote.destinationAsset.code).toUpperCase() === 'XLM'
            ? undefined
            : (publicTransferDetails as any).destinationAssetIssuer || quote.destinationAsset.issuer,
          String(publicTransferDetails.feeXlm || ''),
          result.hash,
          usesStrictSend ? 'CONVERSION_STRICT_SEND' : 'CONVERSION_STRICT_RECEIVE',
          'success',
          undefined,
          quote.path,
          {
            token_hash: tokenHash,
            type: 'conversion',
            token_quote: tokenQuote || null,
            quote,
            transferDetails: publicTransferDetails,
          }
        );

        await updatePaymentTokenStatus(
          tokenHash,
          result.hash,
          'completed',
          {
            type: 'conversion',
            quote,
            transferDetails: publicTransferDetails,
          }
        );

        return res.status(200).json({
          success: true,
          conversionConfirmed: true,
          sessionId: String(session_id),
          userId: String(session.user_id),
          sourceAssetCode,
          destAssetCode,
          hash: result.hash,
          transferDetails: publicTransferDetails,
        });
      }

      if (tokenSub === 'external_payment_confirm') {
        const { amount, destination, destination_name, destination_contact, session_id, owner_id } = payload as any;
        const assetCode = normalizeAssetCode((payload as any)?.asset_code || 'XLM');
        const assetIssuer = resolveAssetIssuer(assetCode, (payload as any)?.asset_issuer);
        const requestedSourceAmount = String((payload as any)?.source_amount || '').trim();
        const requestedSourceAssetCode = normalizeAssetCode((payload as any)?.source_asset_code || '');
        const requestedSourceAssetIssuer = requestedSourceAssetCode
          ? resolveAssetIssuer(requestedSourceAssetCode, (payload as any)?.source_asset_issuer)
          : undefined;
        const isStrictSendPayment = Boolean(
          requestedSourceAmount &&
          requestedSourceAssetCode &&
          requestedSourceAssetCode !== assetCode
        );

        if (!amount || !destination || !session_id) {
          return res.status(400).json({ success: false, message: 'token missing payment data' });
        }
        if (assetCode !== 'XLM' && !assetIssuer) {
          return res.status(400).json({
            success: false,
            message: `${assetCode}_ISSUER não está configurado no backend.`,
          });
        }

        const wallet = await walletRepo.getWalletBySession(String(session_id));
        if (!wallet?.public_key || !wallet?.vault_secret_id) {
          return res.status(400).json({ success: false, message: 'wallet not found for payment confirmation' });
        }

        const session = await agentRepo.getSession(String(session_id));
        if (!session?.user_id) {
          return res.status(400).json({ success: false, message: 'session not found for payment confirmation' });
        }
        if (isSessionExpired(session)) {
          await agentRepo.clearSession(String(session_id));
          return res.status(401).json({
            success: false,
            message: 'Sua sessão expirou. Entre novamente antes de confirmar o pagamento.',
          });
        }

        const normalize = (value: string) =>
          value
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[^\w\s]/g, '')
            .replace(/\s+/g, ' ')
            .trim()
            .toLowerCase();

        const candidateOwnerIds = Array.from(
          new Set(
            [String(owner_id || ''), String(session.user_id || '')]
              .map((value) => value.trim())
              .filter(Boolean)
          )
        );

        const resolveContactFromOwners = async (query: string): Promise<string | null> => {
          const normalizedQuery = normalize(query);

          for (const candidateOwnerId of candidateOwnerIds) {
            const directMatch = await ContactRepository.findByNameForOwner(candidateOwnerId, query);
            if (directMatch?.stellar_public_key) {
              return String(directMatch.stellar_public_key).trim();
            }

            const contacts = await ContactRepository.findByOwnerId(candidateOwnerId);
            const pixMatch = contacts.find((contact) =>
              String((contact as any).pix_key || '').trim().toLowerCase() === normalizedQuery
            );

            if (pixMatch?.stellar_public_key) {
              return String(pixMatch.stellar_public_key).trim();
            }

            const exactMatch = contacts.find((contact) => {
              const contactName = normalize(String(contact.contact_name || ''));
              return contactName === normalizedQuery;
            });

            if (exactMatch?.stellar_public_key) {
              return String(exactMatch.stellar_public_key).trim();
            }
          }

          return null;
        };

        type ContactCandidate = {
          contact_name: string;
          stellar_public_key: string;
          score: number;
        };

        const buildCandidateList = (contacts: Array<{ contact_name?: string; stellar_public_key?: string }>, query: string) => {
          const normalizedQuery = normalize(query);
          const queryTokens = normalizedQuery.split(' ').filter(Boolean);

          return contacts
            .map((contact) => {
              const contactName = String(contact.contact_name || '').trim();
              const normalizedName = normalize(contactName);
              const nameTokens = normalizedName.split(' ').filter(Boolean);
              const overlap = queryTokens.filter((token) => nameTokens.includes(token)).length;
              const startsWith = normalizedName.startsWith(normalizedQuery) || normalizedQuery.startsWith(normalizedName);
              const contains = normalizedName.includes(normalizedQuery) || normalizedQuery.includes(normalizedName);
              const score = overlap * 3 + (startsWith ? 2 : 0) + (contains ? 1 : 0);

              return {
                contact_name: contactName,
                stellar_public_key: String(contact.stellar_public_key || ''),
                score,
              } as ContactCandidate;
            })
            .filter((candidate) => candidate.score > 0)
            .sort((a, b) => b.score - a.score || a.contact_name.localeCompare(b.contact_name))
            .slice(0, 5);
        };

        const contactFromToken = destination_contact && typeof destination_contact === 'object'
          ? destination_contact
          : undefined;

        let resolvedDestination = String(
          contactFromToken?.stellar_public_key ||
          contactFromToken?.public_key ||
          destination || ''
        ).trim();

        // If frontend provided an explicit public key in the URL or POST body, prefer it
        if (publicKeyFromBody && typeof publicKeyFromBody === 'string' && isValidStellarPublicKey(publicKeyFromBody)) {
          resolvedDestination = publicKeyFromBody.trim();
        }

        if (!isValidStellarPublicKey(resolvedDestination)) {
          const lookupValue = String(destination_name || destination || '').trim();
          const resolvedFromOwners = lookupValue ? await resolveContactFromOwners(lookupValue) : null;
          if (resolvedFromOwners) {
            resolvedDestination = resolvedFromOwners;
          }
        }

        const isValidPublicKey = isValidStellarPublicKey(resolvedDestination);

        if (!isValidPublicKey) {
          return res.status(400).json({
            success: false,
            message: 'destination must be a valid Stellar public key (provide `public_key` in the confirm link or token).',
            debug: {
              sessionUserId: String(session.user_id),
              providedDestination: destination_name || destination || null,
              hasDestinationContact: Boolean(contactFromToken),
            },
          });
        }

        if (!isValidStellarPublicKey(resolvedDestination) && contactFromToken) {
          const contactKey = String(contactFromToken.stellar_public_key || contactFromToken.public_key || '').trim();
          if (isValidStellarPublicKey(contactKey)) {
            resolvedDestination = contactKey;
          }
        }

        if (!isValidStellarPublicKey(resolvedDestination)) {
          return res.status(400).json({
            success: false,
            message: `destination is invalid: ${destination_contact?.contact_name || destination_name || destination || 'unknown recipient'}`,
            debug: {
              lookupOwnerIds: candidateOwnerIds,
              sessionUserId: String(session.user_id),
              hasDestinationContact: Boolean(contactFromToken),
            },
          });
        }

        const providedPin = String(req.body?.pin || '').trim();
        if (!providedPin) {
          return res.status(400).json({
            success: false,
            message: 'PIN é obrigatório para confirmar o pagamento.',
          });
        }

        const pinHash = crypto
          .pbkdf2Sync(providedPin, process.env.PIN_SALT || 'salt', 100000, 64, 'sha256')
          .toString('hex');

        const sessionPinHash = String((session as any)?.session_password_hash || (session as any)?.password_hash || '').trim();
        if (!sessionPinHash || pinHash !== sessionPinHash) {
          return res.status(401).json({
            success: false,
            message: 'PIN inválido. Tente novamente.',
          });
        }

        const secretKey = await vaultService.getSecret(String(wallet.vault_secret_id));

        // try to lookup destination wallet (if recipient is an existing user in our DB)
        let destinationWallet = null;
        try {
          destinationWallet = await walletRepo.getWalletByPublicKey(resolvedDestination);
        } catch (err) {
          // ignore lookup errors; destination may be external
        }

        await ensureDestinationCanReceiveAsset({
          destination: resolvedDestination,
          destinationWallet,
          assetCode,
          assetIssuer,
          userId: String(session.user_id),
        });

        // Determine actual source asset: if sender has the destination asset, use it directly
        // This avoids unnecessary XLM→USDC conversions when user already has USDC
        let actualSourceAsset: any = isStrictSendPayment
          ? { code: requestedSourceAssetCode, issuer: requestedSourceAssetIssuer }
          : { code: 'XLM' };
        let senderHasDestinationAsset = false;

        if (!isStrictSendPayment && assetCode !== 'XLM') {
          try {
            const senderAccount = await StellarService.loadAccount(wallet.public_key);
            const destAssetBalance = senderAccount.balances.find((b: any) => 
              b.asset_type !== 'native' && 
              b.asset_code === assetCode && 
              b.asset_issuer === assetIssuer
            );
            
            if (destAssetBalance && parseFloat(destAssetBalance.balance) >= parseFloat(amount)) {
              actualSourceAsset = { code: assetCode, issuer: assetIssuer };
              senderHasDestinationAsset = true;
            }
          } catch (err) {
            // If account lookup fails, fall back to XLM source (will be tried later)
            console.warn('[external-finalize] could not check sender asset balance, will attempt XLM source:', err);
          }
        }

        // Build quote and XDR using actual source asset
        const isDirectPayment = assetCode === 'XLM' || senderHasDestinationAsset;
        const quote = isStrictSendPayment
          ? await StellarService.quoteStrictSendConversion({
              sourcePublicKey: wallet.public_key,
              destination: resolvedDestination,
              sourceAmount: requestedSourceAmount,
              sourceAsset: actualSourceAsset,
              destAsset: { code: assetCode, issuer: assetIssuer },
            })
          : isDirectPayment
          ? null
          : await StellarService.quotePathPayment({
              sourcePublicKey: wallet.public_key,
              destination: resolvedDestination,
              destAsset: { code: assetCode, issuer: assetIssuer },
              destAmount: String(amount),
              sourceAsset: actualSourceAsset,
            });

        const tokenClaimed = await claimPaymentToken(
          tokenHash,
          String(session_id),
          String(session.user_id),
          resolvedDestination,
          String(amount),
          assetCode,
          {
            destinationName: destination_contact?.contact_name || destination_name,
            destinationContact: destination_contact || null,
            sourcePublicKey: wallet.public_key,
            sourceAsset: isStrictSendPayment ? actualSourceAsset.code : senderHasDestinationAsset ? assetCode : actualSourceAsset.code,
            sourceAssetIssuer: isStrictSendPayment ? actualSourceAsset.issuer : senderHasDestinationAsset ? assetIssuer : undefined,
            destAsset: assetCode,
            destAssetIssuer: assetIssuer,
            isDirectPayment,
            browserId: browserId || null,
            publicKeyFromBody: publicKeyFromBody || null,
            quote,
          }
        );

        if (!tokenClaimed) {
          return res.status(400).json({
            success: false,
            message: 'Este link de confirmação já foi utilizado. Por favor, solicite um novo pagamento.',
          });
        }

        await logPaymentDetails(
          String(session_id),
          String(session.user_id),
          wallet.public_key,
          resolvedDestination,
          isStrictSendPayment ? requestedSourceAmount : senderHasDestinationAsset ? amount : (quote?.sourceAmount || 'pending'),
          isStrictSendPayment ? actualSourceAsset.code : senderHasDestinationAsset ? assetCode : actualSourceAsset.code,
          isStrictSendPayment ? actualSourceAsset.issuer : senderHasDestinationAsset ? assetIssuer : undefined,
          amount,
          assetCode,
          assetIssuer,
          quote?.networkFeeXlm || '0.001',
          undefined,
          isStrictSendPayment ? 'PATH_PAYMENT_STRICT_SEND' : isDirectPayment ? 'DIRECT_PAYMENT' : 'PATH_PAYMENT',
          'pending',
          undefined,
          quote?.path,
          {
            token_hash: tokenHash,
            destination_name: destination_contact?.contact_name || destination_name,
            destination_contact,
            source_public_key: wallet.public_key,
            destination_public_key: resolvedDestination,
            isDirectPayment,
            source_asset: isStrictSendPayment ? actualSourceAsset.code : senderHasDestinationAsset ? assetCode : actualSourceAsset.code,
            source_asset_issuer: isStrictSendPayment ? actualSourceAsset.issuer : senderHasDestinationAsset ? assetIssuer : undefined,
            destination_asset: assetCode,
            destination_asset_issuer: assetIssuer,
            browser_id: browserId || null,
            public_key_from_body: publicKeyFromBody || null,
            quote,
          }
        );

        const unsignedXdr = isStrictSendPayment
          ? await StellarService.buildStrictSendConversionXdr({
              sourcePublicKey: wallet.public_key,
              destination: resolvedDestination,
              sourceAmount: requestedSourceAmount,
              sourceAsset: actualSourceAsset,
              destAsset: { code: assetCode, issuer: assetIssuer },
            })
          : isDirectPayment
          ? await StellarService.buildPaymentXdr({
              sourcePublicKey: wallet.public_key,
              destination: resolvedDestination,
              amount: String(amount),
              assetCode: senderHasDestinationAsset ? assetCode : 'XLM',
              assetIssuer: senderHasDestinationAsset ? assetIssuer : undefined,
              memoText: `Pagamento para ${destination_contact?.contact_name || destination_name || destination}`,
            })
          : await StellarService.buildPathPaymentXdr({
              sourcePublicKey: wallet.public_key,
              destination: resolvedDestination,
              destAsset: { code: assetCode, issuer: assetIssuer },
              destAmount: String(amount),
              sourceAsset: actualSourceAsset,
            });

        // Log payment attempt with full details
        logger.info(`[external-finalize] Submitting payment: sessionId=${session_id}, userId=${session.user_id}, source=${wallet.public_key}, dest=${resolvedDestination}, destName=${destination_contact?.contact_name || destination_name}, sourceAsset=${isStrictSendPayment ? actualSourceAsset.code : senderHasDestinationAsset ? assetCode : actualSourceAsset.code}, destAsset=${assetCode}, amount=${amount}, isDirectPayment=${isDirectPayment}, isStrictSendPayment=${isStrictSendPayment}`);

        const result = await StellarService.signAndSubmitXdr(
          String(session.user_id),
          secretKey,
          unsignedXdr,
          {
            user_id: String(session.user_id),
            type: isStrictSendPayment ? 'PATH_PAYMENT_STRICT_SEND' : assetCode === 'XLM' ? 'PAYMENT' : 'PATH_PAYMENT_STRICT_RECEIVE',
            destination_key: resolvedDestination,
            asset_code: assetCode,
            amount: parseFloat(String(amount)),
            context: assetCode === 'XLM'
              ? `Pagamento para ${destination_contact?.contact_name || destination_name || destination}`
              : isStrictSendPayment
                ? `Pagamento com envio exato em ${actualSourceAsset.code} para ${destination_contact?.contact_name || destination_name || destination}; destino recebe ${assetCode}`
                : `Pagamento em ${assetCode} para ${destination_contact?.contact_name || destination_name || destination}; origem liquidada em XLM`,
            source_public_key: wallet.public_key,
            source_session_id: wallet.session_id,
            destination_session_id: destinationWallet?.session_id || undefined,
          }
        );

        if (!result.success) {
          await updatePaymentTokenStatus(
            tokenHash,
            undefined,
            'failed',
            {
              destination_name: destination_contact?.contact_name || destination_name,
              destination_contact,
              source_public_key: wallet.public_key,
              destination_public_key: resolvedDestination,
              isDirectPayment,
              source_asset: isStrictSendPayment ? actualSourceAsset.code : senderHasDestinationAsset ? assetCode : actualSourceAsset.code,
              source_asset_issuer: isStrictSendPayment ? actualSourceAsset.issuer : senderHasDestinationAsset ? assetIssuer : undefined,
              destination_asset: assetCode,
              destination_asset_issuer: assetIssuer,
              browser_id: browserId || null,
              public_key_from_body: publicKeyFromBody || null,
              quote,
              error: result.error || 'Could not submit payment',
            }
          );

          await logPaymentDetails(
            String(session_id),
            String(session.user_id),
            wallet.public_key,
            resolvedDestination,
            isStrictSendPayment ? requestedSourceAmount : senderHasDestinationAsset ? amount : (quote?.sourceAmount || 'unknown'),
            isStrictSendPayment ? actualSourceAsset.code : senderHasDestinationAsset ? assetCode : actualSourceAsset.code,
            isStrictSendPayment ? actualSourceAsset.issuer : senderHasDestinationAsset ? assetIssuer : undefined,
            amount,
            assetCode,
            assetIssuer,
            quote?.networkFeeXlm || '0.001',
            undefined,
            isStrictSendPayment ? 'PATH_PAYMENT_STRICT_SEND' : isDirectPayment ? 'DIRECT_PAYMENT' : 'PATH_PAYMENT',
            'failed',
            result.error || 'Could not submit payment',
            quote?.path,
            {
              token_hash: tokenHash,
              destination_name: destination_contact?.contact_name || destination_name,
              destination_contact,
              source_public_key: wallet.public_key,
              destination_public_key: resolvedDestination,
              isDirectPayment,
              source_asset: isStrictSendPayment ? actualSourceAsset.code : senderHasDestinationAsset ? assetCode : actualSourceAsset.code,
              source_asset_issuer: isStrictSendPayment ? actualSourceAsset.issuer : senderHasDestinationAsset ? assetIssuer : undefined,
              destination_asset: assetCode,
              destination_asset_issuer: assetIssuer,
              browser_id: browserId || null,
              public_key_from_body: publicKeyFromBody || null,
              quote,
              error: result.error || 'Could not submit payment',
            }
          );

          logger.error(`[external-finalize] Payment failed: sessionId=${session_id}, error=${result.error}, dest=${resolvedDestination}`);

          return res.status(400).json({
            success: false,
            message: result.error || 'Could not submit payment',
          });
        }

        const submittedPaymentDetails = result.hash
          ? await StellarService.getSubmittedPaymentDetails(result.hash)
          : null;
        const transferDetails = submittedPaymentDetails
          ? {
              ...submittedPaymentDetails,
              exact: true,
            }
          : {
              sourceAmount: assetCode === 'XLM' ? String(amount) : String(quote?.sourceAmount || ''),
              sourceAssetCode: assetCode === 'XLM' ? 'XLM' : String(quote?.sourceAsset?.code || 'XLM'),
              destinationAmount: assetCode === 'XLM' ? String(amount) : String(quote?.destinationAmount || amount),
              destinationAssetCode: assetCode === 'XLM' ? 'XLM' : String(quote?.destinationAsset?.code || assetCode),
              feeXlm: '',
              exact: false,
            };
        const feeDisplay = await formatNetworkFeeForCustomer(String(transferDetails.feeXlm || ''));
        const publicTransferDetails = {
          ...transferDetails,
          feeDisplay: feeDisplay.display,
          feeUsdc: feeDisplay.fee_usdc,
          feeBrl: feeDisplay.fee_brl,
        };

        await sendTelegramPaymentNotification({
          sessionId: String(session_id),
          userId: String(session.user_id),
          provider: String((payload as any).provider || ''),
          providerUserId: String((payload as any).provider_user_id || ''),
          amount: publicTransferDetails.destinationAmount,
          assetCode: publicTransferDetails.destinationAssetCode,
          sourceAmount: publicTransferDetails.sourceAmount,
          sourceAssetCode: publicTransferDetails.sourceAssetCode,
          feeXlm: publicTransferDetails.feeXlm,
          destinationName: destination_contact?.contact_name || destination_name,
          destination: resolvedDestination,
          hash: result.hash,

        });

        // Log successful payment
        await logPaymentDetails(
          String(session_id),
          String(session.user_id),
          wallet.public_key,
          resolvedDestination,
          publicTransferDetails.sourceAmount,
          publicTransferDetails.sourceAssetCode,
          publicTransferDetails.sourceAssetCode === 'XLM' ? undefined : assetIssuer,
          publicTransferDetails.destinationAmount,
          publicTransferDetails.destinationAssetCode,
          assetIssuer,
          publicTransferDetails.feeXlm,
          result.hash,
          isDirectPayment ? 'DIRECT_PAYMENT' : 'PATH_PAYMENT',
          'success',
          undefined,
          quote?.path,
          {
            token_hash: tokenHash,
            destination_name: destination_contact?.contact_name || destination_name,
            destination_contact,
            source_public_key: wallet.public_key,
            destination_public_key: resolvedDestination,
            isDirectPayment,
            source_asset: senderHasDestinationAsset ? assetCode : actualSourceAsset.code,
            source_asset_issuer: senderHasDestinationAsset ? assetIssuer : undefined,
            destination_asset: assetCode,
            destination_asset_issuer: assetIssuer,
            browser_id: browserId || null,
            public_key_from_body: publicKeyFromBody || null,
            quote,
            transferDetails: publicTransferDetails,
          }
        );

        await updatePaymentTokenStatus(
          tokenHash,
          result.hash,
          'completed',
          {
            destination_name: destination_contact?.contact_name || destination_name,
            destination_contact,
            source_public_key: wallet.public_key,
            destination_public_key: resolvedDestination,
            isDirectPayment,
            source_asset: senderHasDestinationAsset ? assetCode : actualSourceAsset.code,
            source_asset_issuer: senderHasDestinationAsset ? assetIssuer : undefined,
            destination_asset: assetCode,
            destination_asset_issuer: assetIssuer,
            browser_id: browserId || null,
            public_key_from_body: publicKeyFromBody || null,
            quote,
            transferDetails: publicTransferDetails,
          }
        );

        await upsertRecentContactFromPayment({
          ownerId: String(session.user_id),
          sourcePublicKey: wallet.public_key,
          destinationPublicKey: resolvedDestination,
          destinationName: destination_contact?.contact_name || destination_name || destination,
          destinationContact: destination_contact,
        });

        if (destinationWallet?.session_id && destinationWallet.session_id !== String(session_id)) {
          await TransferNotificationService.notifyIncomingTransfer({
            recipientSessionId: destinationWallet.session_id,
            senderLabel: String((session as any).email || session.user_id || 'TalkToStellar'),
            amount: publicTransferDetails.destinationAmount,
            assetCode: publicTransferDetails.destinationAssetCode,
            sourceAmount: publicTransferDetails.sourceAmount,
            sourceAssetCode: publicTransferDetails.sourceAssetCode,
            hash: result.hash,
          });
        }

        logger.info(`[external-finalize] Payment successful: sessionId=${session_id}, hash=${result.hash}, source=${wallet.public_key}, dest=${resolvedDestination}, destinationAmount=${publicTransferDetails.destinationAmount}, destinationAsset=${publicTransferDetails.destinationAssetCode}`);
        return res.status(200).json({
          success: true,
          paymentConfirmed: true,
          sessionId: String(session_id),
          userId: String(session.user_id),
          destination: resolvedDestination,
          destinationName: destination_contact?.contact_name || destination_name || destination,
          amount: String(amount),
          assetCode,
          hash: result.hash,
          transferDetails: publicTransferDetails,
        });
      }

      const { provider, provider_user_id } = payload as any;
      if (!provider || !provider_user_id) {
        return res.status(400).json({ success: false, message: 'token missing provider data' });
      }

      const providedPin = String(pin || '').trim();
      if (!providedPin) {
        return res.status(400).json({ success: false, message: 'PIN é obrigatório para criar a conta.' });
      }
      if (!/^\d{4,8}$/.test(providedPin)) {
        return res.status(400).json({ success: false, message: 'PIN deve conter de 4 a 8 dígitos numéricos.' });
      }
      if (normalizedPhoneNumber && (normalizedPhoneNumber.length < 10 || normalizedPhoneNumber.length > 15)) {
        return res.status(400).json({ success: false, message: 'Telefone inválido. Informe DDD + número (com ou sem +55).' });
      }
      if (normalizedCpf && normalizedCpf.length !== 11) {
        return res.status(400).json({ success: false, message: 'CPF inválido. Informe 11 dígitos.' });
      }
      const pinHash = crypto
        .pbkdf2Sync(providedPin, process.env.PIN_SALT || 'salt', 100000, 64, 'sha256')
        .toString('hex');

      // create deterministic user id for external users, or use email if provided
      const userId = email ? String(email) : `external:${provider}:${provider_user_id}`;
      const normalizedEmail = normalizeEmailForCompare(email);

      const existingAccount = await externalRepo.findByProviderAndId(provider, provider_user_id);
      if (existingAccount?.session_id && existingAccount?.user_id) {
        const existingSession = await agentRepo.getSession(String(existingAccount.session_id));
        const existingWallet = await walletRepo.getWalletBySession(String(existingAccount.session_id));
        const collision = await detectIdentityCollision({
          email: normalizedEmail || undefined,
          phoneNumber: normalizedPhoneNumber || undefined,
          cpf: normalizedCpf || undefined,
          allowedSessionIds: [String(existingAccount.session_id)],
          allowedUserIds: [String(existingAccount.user_id)],
        });
        if (collision) {
          const fieldLabel = collision.field === 'phone_number' ? 'telefone' : collision.field.toUpperCase();
          return res.status(409).json({
            success: false,
            message: `Não foi possível concluir: ${fieldLabel} já está vinculado a outra conta.`,
            collision: {
              field: collision.field,
              value: collision.value,
            },
          });
        }

        if (existingSession && existingWallet) {
          await agentRepo.saveSession(String(existingAccount.session_id), {
            ...existingSession,
            email: normalizedEmail || existingSession.email || '',
            phone_number: normalizedPhoneNumber || existingSession.phone_number,
          } as any);

          void configureWalletAssetsAndContacts({
            userId: String(existingAccount.user_id),
            publicKey: existingWallet.public_key,
            vaultSecretId: existingWallet.vault_secret_id,
          });

          await externalRepo.createMapping({
            provider,
            provider_user_id,
            session_id: String(existingAccount.session_id),
            user_id: String(existingAccount.user_id),
            data: {
              name: name || null,
              email: email || null,
              phone_number: normalizedPhoneNumber || null,
              cpf: normalizedCpf || null,
            },
          });

          if (browserId) {
            await externalRepo.createMapping({
              provider: 'web',
              provider_user_id: browserId,
              session_id: String(existingAccount.session_id),
              user_id: String(existingAccount.user_id),
              data: {
                name: name || null,
                email: email || null,
                phone_number: normalizedPhoneNumber || null,
                cpf: normalizedCpf || null,
              },
            });
          }

          void TransferNotificationService.notifySessionWelcome({
            sessionId: String(existingAccount.session_id),
            userId: String(existingAccount.user_id),
            name: name || email || existingSession.email || null,
            provider,
            providerUserId: provider_user_id,
          });

          return res.status(200).json({
            success: true,
            sessionId: existingAccount.session_id,
            sessionToken: existingSession.session_token,
            userId: existingAccount.user_id,
            publicKey: existingWallet.public_key,
            walletName: existingWallet.name || `Wallet for ${existingAccount.user_id}`,
          });
        }
      }

      const newAccountCollision = await detectIdentityCollision({
        email: normalizedEmail || undefined,
        phoneNumber: normalizedPhoneNumber || undefined,
        cpf: normalizedCpf || undefined,
      });
      if (newAccountCollision) {
        const fieldLabel = newAccountCollision.field === 'phone_number'
          ? 'telefone'
          : newAccountCollision.field.toUpperCase();
        return res.status(409).json({
          success: false,
          message: `Não foi possível concluir: ${fieldLabel} já está vinculado a outra conta.`,
          collision: {
            field: newAccountCollision.field,
            value: newAccountCollision.value,
          },
        });
      }

      let publicKey = '';
      let secretKey = '';

      try {
        const generated = await StellarService.createTestAccount();
        secretKey = generated.secret;
      } catch (error: any) {
        const fallback = StellarService.generateStellarKeypair();
        secretKey = fallback.secret;
        console.warn('[external-finalize] friendbot unavailable, using unfunded generated keypair:', error?.message || error);
      }

      publicKey = Keypair.fromSecret(secretKey).publicKey();

      const vaultSecretId = await vaultService.storeSecret(
        secretKey,
        `wallet:${userId}:private-key`,
        `Stellar private key for wallet ${publicKey}`
      );

      const storedSecretKey = await vaultService.getSecret(vaultSecretId);
      const storedKeypair = Keypair.fromSecret(storedSecretKey);
      publicKey = storedKeypair.publicKey();
      secretKey = storedSecretKey;

      const existingWallet = await walletRepo.getWalletByPublicKey(publicKey);
      if (existingWallet) {
        const existingSession = await agentRepo.getSession(existingWallet.session_id);

        if (existingSession) {
          await agentRepo.saveSession(existingWallet.session_id, {
            ...existingSession,
            email: normalizedEmail || existingSession.email || '',
            phone_number: normalizedPhoneNumber || existingSession.phone_number,
          } as any);

          void configureWalletAssetsAndContacts({
            userId,
            publicKey,
            vaultSecretId: existingWallet.vault_secret_id,
          });

          await externalRepo.createMapping({
            provider,
            provider_user_id,
            session_id: existingWallet.session_id,
            user_id: userId,
            data: {
              name: name || null,
              email: email || null,
              phone_number: normalizedPhoneNumber || null,
              cpf: normalizedCpf || null,
            },
          });

          void TransferNotificationService.notifySessionWelcome({
            sessionId: existingWallet.session_id,
            userId,
            name: name || email || existingSession.email || null,
            provider,
            providerUserId: provider_user_id,
          });

          return res.status(200).json({
            success: true,
            sessionId: existingWallet.session_id,
            sessionToken: existingSession.session_token,
            userId,
            publicKey,
            walletName: existingWallet.name || `Wallet for ${userId}`,
          });
        }
      }

      // create session and session token
      const sessionId = uuidv4();
      const sessionToken = uuidv4();
      const pixKey = ContactSeedService.derivePixKey(userId, email, name);

      const now = new Date().toISOString();
      await agentRepo.saveSession(sessionId, {
        user_id: userId,
        email: normalizedEmail || '',
        session_token: sessionToken,
        public_key: publicKey,
        phone_number: normalizedPhoneNumber || undefined,
        pix_key: pixKey,
        password_hash: pinHash,
        session_password_hash: pinHash,
        created_at: now,
        last_activity: now,
      });

      await walletRepo.saveWallet({
        session_id: sessionId,
        public_key: publicKey,
        vault_secret_id: vaultSecretId,
        name: name || `Wallet for ${userId}`,
        pix_key: pixKey,
      } as any);

      void configureWalletAssetsAndContacts({
        userId,
        publicKey,
        vaultSecretId,
      });

      // link external_accounts mapping
      await externalRepo.createMapping({
        provider,
        provider_user_id,
        session_id: sessionId,
        user_id: userId,
        data: {
          name: name || null,
          email: email || null,
          phone_number: normalizedPhoneNumber || null,
          cpf: normalizedCpf || null,
        },
      });

      if (browserId) {
        await externalRepo.createMapping({
          provider: 'web',
          provider_user_id: browserId,
          session_id: sessionId,
          user_id: userId,
          data: {
            name: name || null,
            email: email || null,
            phone_number: normalizedPhoneNumber || null,
            cpf: normalizedCpf || null,
          },
        });
      }

      void TransferNotificationService.notifySessionWelcome({
        sessionId,
        userId,
        name: name || email || null,
        provider,
        providerUserId: provider_user_id,
      });

      return res.status(201).json({ success: true, sessionId, sessionToken, userId, publicKey, walletName: name || `Wallet for ${userId}`, transferKey: pixKey, pixKey });
    } catch (error: any) {
      if (isUniqueViolation(error)) {
        return res.status(409).json({
          success: false,
          message: 'Não foi possível concluir: já existe uma conta com os mesmos dados (email, telefone ou CPF).',
        });
      }
      const message = error?.message || String(error);
      return res.status(500).json({ success: false, message });
    }
  }
}
