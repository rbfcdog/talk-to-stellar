import { Request, Response } from 'express';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { supabase } from '../../config/supabase';
import { AgentRepository } from '../../repositories/agent.repository';
import { WalletRepository } from '../../repositories/wallet.repository';
import { VaultService } from '../../services/vault.service';
import ExternalService from '../../services/external.service';
import { StellarService } from '../services/stellar.service';
import { PaymentReceiptService } from '../services/payment-receipt.service';
import { getAssetIssuer, normalizeAssetCode } from '../../config/assets';
import { logger } from '../../utils/logger';
import { isSessionExpired } from '../../utils/session-expiry';
import { buildOperationFingerprint } from '../../services/idempotency.service';

const agentRepo = new AgentRepository(supabase);
const walletRepo = new WalletRepository(supabase);
const vaultService = new VaultService(supabase);
const externalService = new ExternalService(supabase);

function getJwtSecret() {
  return process.env.JWT_SECRET || 'dev-secret-change-me';
}

function hashToken(token: string) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function hashPin(pin: string) {
  return crypto
    .pbkdf2Sync(pin, process.env.PIN_SALT || 'salt', 100000, 64, 'sha256')
    .toString('hex');
}

function verifySessionToken(session: any, providedToken: string) {
  const stored = String(session?.session_token || '').trim();
  return Boolean(stored && providedToken && stored === String(providedToken).trim());
}

async function tokenAlreadyClaimed(tokenHash: string) {
  const { data, error } = await supabase
    .from('payment_confirmations')
    .select('id, status')
    .eq('token_hash', tokenHash)
    .limit(1);

  if (error) {
    const message = String(error.message || '').toLowerCase();
    if (message.includes('payment_confirmations') || message.includes('schema cache')) {
      return false;
    }
    throw error;
  }

  return Array.isArray(data) && data.length > 0;
}

async function claimToken(input: {
  tokenHash: string;
  senderSessionId: string;
  senderUserId: string;
  destination: string;
  destinationName?: string;
  amount: string;
  assetCode: string;
  details?: any;
}) {
  const operationFingerprint = buildOperationFingerprint({
    sourceSessionId: input.senderSessionId,
    sourceUserId: input.senderUserId,
    destination: input.destination,
    amount: input.amount,
    assetCode: input.assetCode,
    tokenHash: input.tokenHash,
    operationType: 'CLAIM_PAYMENT_LINK',
  });
  const { error } = await supabase
    .from('payment_confirmations')
    .insert({
      token_hash: input.tokenHash,
      session_id: input.senderSessionId,
      user_id: input.senderUserId,
      destination: input.destination,
      destination_name: input.destinationName || null,
      amount: input.amount,
      asset_code: input.assetCode,
      status: 'pending',
      operation_fingerprint: operationFingerprint,
      details: input.details || null,
    });

  if (error) {
    if (String(error.code || '') === '23505') return false;
    throw error;
  }

  return true;
}

async function updateClaimStatus(tokenHash: string, status: 'completed' | 'failed', paymentHash?: string, details?: any) {
  const { error } = await supabase
    .from('payment_confirmations')
    .update({
      status,
      payment_hash: paymentHash || null,
      completed_at: new Date().toISOString(),
      details: details || null,
    })
    .eq('token_hash', tokenHash);

  if (error) {
    logger.warn(`[pay-link] could not update claim status: ${error.message}`);
  }
}

async function ensureRecipientTrustline(input: {
  publicKey: string;
  wallet: any;
  userId: string;
  assetCode: string;
  assetIssuer?: string;
}) {
  if (input.assetCode === 'XLM') return;
  if (!input.assetIssuer) {
    throw new Error(`${input.assetCode}_ISSUER não está configurado no backend.`);
  }

  const balances = await StellarService.getAccountBalance(input.publicKey);
  const hasTrustline = balances.some((balance: any) =>
    String(balance.asset_code || '').toUpperCase() === input.assetCode &&
    String(balance.asset_issuer || '') === input.assetIssuer
  );
  if (hasTrustline) return;

  if (!input.wallet?.vault_secret_id) {
    throw new Error(`Sua conta ainda não pode receber ${input.assetCode}. Ative a conta antes de receber.`);
  }

  const secret = await vaultService.getSecret(String(input.wallet.vault_secret_id));
  const xdr = await StellarService.buildTrustlineXdr({
    sourcePublicKey: input.publicKey,
    assetCode: input.assetCode,
    assetIssuer: input.assetIssuer,
  });
  const result = await StellarService.signAndSubmitXdr(input.userId, secret, xdr, {
    user_id: input.userId,
    type: 'TRUSTLINE',
    asset_code: input.assetCode,
    source_public_key: input.publicKey,
    context: `Auto trustline before claim-link ${input.assetCode} payment`,
  });

  if (!result.success) {
    throw new Error(`Não consegui ativar recebimento em ${input.assetCode}: ${result.error || 'erro desconhecido'}`);
  }
}

async function notifySenderClaimCompleted(input: {
  senderSessionId: string;
  senderUserId: string;
  recipientLabel?: string;
  sourceAmount: string;
  sourceAssetCode: string;
  destinationAmount: string;
  destinationAssetCode: string;
  feeXlm?: string | null;
  hash?: string | null;
  settlementMs?: number | null;
  quote?: any;
}) {
  try {
    await PaymentReceiptService.sendReceipt({
      type: 'claim_redeemed',
      sessionId: input.senderSessionId,
      userId: input.senderUserId,
      counterpartyLabel: String(input.recipientLabel || '').trim() || 'destinatário',
      sourceAmount: input.sourceAmount,
      sourceAssetCode: input.sourceAssetCode,
      destinationAmount: input.destinationAmount,
      destinationAssetCode: input.destinationAssetCode,
      feeXlm: input.feeXlm || undefined,
      hash: input.hash || undefined,
      settlementMs: input.settlementMs || undefined,
      quote: input.quote,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.warn(`[pay-link] failed to send sender claim notification: ${message}`);
  }
}

export default class PayLinkController {
  static async create(req: Request, res: Response) {
    try {
      const sessionId = String(req.body?.session_id || '').trim();
      const sessionToken = String(req.body?.session_token || '').trim();
      const pin = String(req.body?.pin || '').trim();
      const amount = String(req.body?.amount || '').replace(',', '.').trim();
      const recipientName = String(req.body?.recipient_name || '').trim();
      const assetCode = normalizeAssetCode(req.body?.asset_code || 'USDC');
      const assetIssuer = getAssetIssuer(assetCode, req.body?.asset_issuer);
      const destinationAssetCode = normalizeAssetCode(req.body?.destination_asset_code || req.body?.receive_asset_code || assetCode);
      const destinationAssetIssuer = getAssetIssuer(destinationAssetCode, req.body?.destination_asset_issuer || req.body?.receive_asset_issuer);

      if (!sessionId || !sessionToken || !pin || !amount) {
        return res.status(400).json({ success: false, message: 'session_id, session_token, pin e amount são obrigatórios.' });
      }
      if (!/^\d{4,8}$/.test(pin)) {
        return res.status(400).json({ success: false, message: 'PIN deve conter de 4 a 8 dígitos numéricos.' });
      }
      if (!Number.isFinite(Number(amount)) || Number(amount) <= 0) {
        return res.status(400).json({ success: false, message: 'Informe um valor maior que zero.' });
      }
      if (assetCode !== 'XLM' && !assetIssuer) {
        return res.status(400).json({ success: false, message: `${assetCode}_ISSUER não está configurado no backend.` });
      }
      if (destinationAssetCode !== 'XLM' && !destinationAssetIssuer) {
        return res.status(400).json({ success: false, message: `${destinationAssetCode}_ISSUER não está configurado no backend.` });
      }

      const session = await agentRepo.getSession(sessionId);
      if (!session?.user_id || !verifySessionToken(session, sessionToken)) {
        return res.status(401).json({ success: false, message: 'Sessão inválida. Entre novamente.' });
      }

      const expectedPinHash = String((session as any).session_password_hash || (session as any).password_hash || '').trim();
      if (!expectedPinHash || expectedPinHash !== hashPin(pin)) {
        return res.status(401).json({ success: false, message: 'PIN inválido.' });
      }

      const wallet = await walletRepo.getWalletBySession(sessionId);
      if (!wallet?.public_key || !wallet?.vault_secret_id) {
        return res.status(400).json({ success: false, message: 'Conta do remetente não encontrada.' });
      }

      const { token, url } = await externalService.createClaimPaymentUrl({
        amount,
        recipient_name: recipientName || undefined,
        sender_name: String((session as any).email || (session as any).user_id || 'Alguém'),
        session_id: sessionId,
        owner_id: String(session.user_id),
        asset_code: assetCode,
        asset_issuer: assetIssuer,
        destination_asset_code: destinationAssetCode,
        destination_asset_issuer: destinationAssetIssuer,
      });

      const transferLabel = destinationAssetCode === assetCode
        ? `${amount} ${assetCode}`
        : `${amount} ${assetCode}, com recebimento em ${destinationAssetCode}`;

      return res.status(201).json({
        success: true,
        token,
        url,
        message: recipientName
          ? `${String((session as any).email || 'Alguém')} criou um link de ${transferLabel} para ${recipientName}.`
          : `${String((session as any).email || 'Alguém')} criou um link de ${transferLabel} para você. Entre ou crie sua conta global para receber.`,
      });
    } catch (error: any) {
      return res.status(500).json({ success: false, message: error?.message || String(error) });
    }
  }

  static async claim(req: Request, res: Response) {
    const token = String(req.body?.token || '').trim();
    const recipientSessionId = String(req.body?.session_id || '').trim();
    const recipientSessionToken = String(req.body?.session_token || '').trim();
    const recipientPin = String(req.body?.pin || '').trim();

    try {
      if (!token || !recipientSessionId || !recipientSessionToken) {
        return res.status(401).json({ success: false, loginRequired: true, message: 'Para receber, entre ou crie sua conta global.' });
      }
      if (!/^\d{4,8}$/.test(recipientPin)) {
        return res.status(400).json({ success: false, message: 'Digite o PIN da sua conta para receber este pagamento.' });
      }

      let payload: any;
      try {
        payload = jwt.verify(token, getJwtSecret());
      } catch {
        return res.status(400).json({ success: false, message: 'Link inválido ou expirado.' });
      }

      if (String(payload?.sub || '') !== 'external_payment_claim') {
        return res.status(400).json({ success: false, message: 'Este link não é um link de recebimento.' });
      }

      const tokenHash = hashToken(token);
      if (await tokenAlreadyClaimed(tokenHash)) {
        return res.status(400).json({ success: false, message: 'Este link já foi resgatado.' });
      }

      const senderSessionId = String(payload.session_id || '').trim();
      const senderUserId = String(payload.owner_id || '').trim();
      const amount = String(payload.amount || '').trim();
      const sourceAssetCode = normalizeAssetCode(payload.source_asset_code || payload.asset_code || 'USDC');
      const sourceAssetIssuer = getAssetIssuer(sourceAssetCode, payload.source_asset_issuer || payload.asset_issuer);
      const destinationAssetCode = normalizeAssetCode(payload.destination_asset_code || sourceAssetCode);
      const destinationAssetIssuer = getAssetIssuer(destinationAssetCode, payload.destination_asset_issuer);

      if (!senderSessionId || !senderUserId || !amount) {
        return res.status(400).json({ success: false, message: 'Link sem dados de pagamento.' });
      }
      if (sourceAssetCode !== 'XLM' && !sourceAssetIssuer) {
        return res.status(400).json({ success: false, message: `${sourceAssetCode}_ISSUER não está configurado no backend.` });
      }
      if (destinationAssetCode !== 'XLM' && !destinationAssetIssuer) {
        return res.status(400).json({ success: false, message: `${destinationAssetCode}_ISSUER não está configurado no backend.` });
      }

      const [senderSession, recipientSession] = await Promise.all([
        agentRepo.getSession(senderSessionId),
        agentRepo.getSession(recipientSessionId),
      ]);
      if (!senderSession?.user_id) {
        return res.status(400).json({ success: false, message: 'Conta do remetente não encontrada.' });
      }
      if (!recipientSession?.user_id || !verifySessionToken(recipientSession, recipientSessionToken)) {
        return res.status(401).json({ success: false, loginRequired: true, message: 'Entre na sua conta global para receber.' });
      }
      if (isSessionExpired(recipientSession)) {
        return res.status(401).json({ success: false, loginRequired: true, message: 'Sua sessão expirou. Entre novamente para receber.' });
      }

      const recipientPinHash = String((recipientSession as any).session_password_hash || (recipientSession as any).password_hash || '').trim();
      if (!recipientPinHash || recipientPinHash !== hashPin(recipientPin)) {
        return res.status(401).json({ success: false, message: 'PIN inválido para esta conta.' });
      }

      const [senderWallet, recipientWallet] = await Promise.all([
        walletRepo.getWalletBySession(senderSessionId),
        walletRepo.getWalletBySession(recipientSessionId),
      ]);
      if (!senderWallet?.public_key || !senderWallet?.vault_secret_id) {
        return res.status(400).json({ success: false, message: 'Conta do remetente não encontrada.' });
      }
      if (!recipientWallet?.public_key) {
        return res.status(400).json({ success: false, message: 'Conta do destinatário não encontrada.' });
      }
      if (senderWallet.public_key === recipientWallet.public_key) {
        return res.status(400).json({ success: false, message: 'Você não pode receber um link criado pela mesma conta.' });
      }

      await ensureRecipientTrustline({
        publicKey: recipientWallet.public_key,
        wallet: recipientWallet,
        userId: String(recipientSession.user_id),
        assetCode: destinationAssetCode,
        assetIssuer: destinationAssetIssuer,
      });

      const claimed = await claimToken({
        tokenHash,
        senderSessionId,
        senderUserId: String(senderSession.user_id),
        destination: recipientWallet.public_key,
        destinationName: String((recipientSession as any).email || recipientSession.user_id || '').trim(),
        amount,
        assetCode: sourceAssetCode,
        details: {
          recipient_session_id: recipientSessionId,
          recipient_user_id: recipientSession.user_id,
          recipient_name: payload.recipient_name || null,
          sender_name: payload.sender_name || null,
          source_asset_code: sourceAssetCode,
          source_asset_issuer: sourceAssetIssuer || null,
          destination_asset_code: destinationAssetCode,
          destination_asset_issuer: destinationAssetIssuer || null,
        },
      });
      if (!claimed) {
        return res.status(400).json({ success: false, message: 'Este link já foi resgatado.' });
      }

      const senderSecret = await vaultService.getSecret(String(senderWallet.vault_secret_id));
      const isCrossAsset = sourceAssetCode !== destinationAssetCode ||
        String(sourceAssetIssuer || '') !== String(destinationAssetIssuer || '');
      const xdr = isCrossAsset
        ? await StellarService.buildStrictSendConversionXdr({
            sourcePublicKey: senderWallet.public_key,
            destination: recipientWallet.public_key,
            sourceAmount: amount,
            sourceAsset: { code: sourceAssetCode, issuer: sourceAssetIssuer },
            destAsset: { code: destinationAssetCode, issuer: destinationAssetIssuer },
          })
        : await StellarService.buildPaymentXdr({
            sourcePublicKey: senderWallet.public_key,
            destination: recipientWallet.public_key,
            amount,
            assetCode: sourceAssetCode === 'XLM' ? undefined : sourceAssetCode,
            assetIssuer: sourceAssetCode === 'XLM' ? undefined : sourceAssetIssuer,
            memoText: 'TalkToStellar claim link',
          });

      const submitStartedAt = Date.now();
      const result = await StellarService.signAndSubmitXdr(String(senderSession.user_id), senderSecret, xdr, {
        user_id: String(senderSession.user_id),
        type: isCrossAsset ? 'PATH_PAYMENT_STRICT_SEND' : 'PAYMENT',
        destination_key: recipientWallet.public_key,
        asset_code: destinationAssetCode,
        amount: parseFloat(amount),
        context: isCrossAsset
          ? `Pay-anyone claim link redeemed by ${recipientSession.user_id}; sender pays ${amount} ${sourceAssetCode}; recipient receives ${destinationAssetCode}`
          : `Pay-anyone claim link redeemed by ${recipientSession.user_id}`,
        source_public_key: senderWallet.public_key,
        source_session_id: senderSessionId,
        destination_session_id: recipientSessionId,
      });

      if (!result.success) {
        await updateClaimStatus(tokenHash, 'failed', undefined, { error: result.error || 'Could not submit payment' });
        return res.status(400).json({ success: false, message: result.error || 'Não foi possível enviar o pagamento.' });
      }

      const settlementMs = Date.now() - submitStartedAt;
      const transferDetails = result.hash
        ? await StellarService.getSubmittedPaymentDetails(result.hash)
        : null;

      await updateClaimStatus(tokenHash, 'completed', result.hash, {
        recipient_session_id: recipientSessionId,
        recipient_user_id: recipientSession.user_id,
        transferDetails,
      });

      await PaymentReceiptService.sendReceipt({
        type: 'payment_received',
        sessionId: recipientSessionId,
        userId: String(recipientSession.user_id),
        counterpartyLabel: String(payload.sender_name || (senderSession as any).email || senderSession.user_id || 'TalkToStellar'),
        sourceAmount: String(transferDetails?.sourceAmount || amount),
        sourceAssetCode: String(transferDetails?.sourceAssetCode || sourceAssetCode),
        destinationAmount: String(transferDetails?.destinationAmount || amount),
        destinationAssetCode: String(transferDetails?.destinationAssetCode || destinationAssetCode),
        feeXlm: String(transferDetails?.feeXlm || ''),
        hash: result.hash,
        settlementMs,
      });

      await notifySenderClaimCompleted({
        senderSessionId,
        senderUserId: String(senderSession.user_id),
        recipientLabel: String((recipientSession as any).email || payload.recipient_name || recipientSession.user_id || '').trim(),
        sourceAmount: String(transferDetails?.sourceAmount || amount),
        sourceAssetCode: String(transferDetails?.sourceAssetCode || sourceAssetCode),
        destinationAmount: String(transferDetails?.destinationAmount || amount),
        destinationAssetCode: String(transferDetails?.destinationAssetCode || destinationAssetCode),
        feeXlm: String(transferDetails?.feeXlm || ''),
        hash: result.hash,
        settlementMs,
      });

      return res.status(200).json({
        success: true,
        claimed: true,
        amount,
        assetCode: sourceAssetCode,
        sourceAssetCode,
        destinationAssetCode,
        operationId: PaymentReceiptService.toPublicOperationId(result.hash),
        transferDetails,
      });
    } catch (error: any) {
      logger.error(`[pay-link] claim failed: ${error?.message || String(error)}`);
      return res.status(500).json({ success: false, message: error?.message || String(error) });
    }
  }
}
