import { Request, Response } from 'express';
import { Keypair } from '@stellar/stellar-sdk';
import { supabase } from '../../config/supabase';
import { AgentRepository } from '../repository/core/agent.repository';
import { WalletRepository } from '../repository/core/wallet.repository';
import { VaultService } from '../services/core/vault.service';
import PasskeyService from '../services/core/passkey.service';
import { StellarService } from '../services/stellar.service';
import { PaymentReceiptService } from '../services/payment-receipt.service';
import { getAssetIssuer, getUserFacingAssetCodes, normalizeAssetCode, settlementAssetCode, userFacingAssetCode } from '../../config/assets';
import { DEFAULT_NETWORK_FEE_XLM, formatNetworkFeeForCustomer } from '../../utils/fee-display';
import { isSessionExpired } from '../../utils/session-expiry';
import { buildOperationFingerprint } from '../services/core/idempotency.service';
import { verifyWalletPinAgainstAny } from '../../utils/pin-hash';

const agentRepo = new AgentRepository(supabase);
const walletRepo = new WalletRepository(supabase);
const vaultService = new VaultService(supabase);

function isValidStellarPublicKey(value?: string) {
  if (!value || !/^G[A-Z2-7]{55}$/.test(String(value).trim())) return false;
  try {
    Keypair.fromPublicKey(String(value).trim());
    return true;
  } catch {
    return false;
  }
}

function toAmount(value: unknown): number {
  const parsed = Number(String(value ?? '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatAmount(value: number): string {
  return value.toFixed(7).replace(/\.?0+$/, '');
}

function getBalance(account: any, assetCode: string, assetIssuer?: string): number {
  const code = normalizeAssetCode(assetCode);
  const balance = (account?.balances || []).find((item: any) => {
    if (code === 'XLM') return String(item?.asset_type || '').toLowerCase() === 'native';
    return (
      String(item?.asset_type || '').toLowerCase() !== 'native' &&
      String(item?.asset_code || '').toUpperCase() === code &&
      String(item?.asset_issuer || '').trim() === String(assetIssuer || '').trim()
    );
  });
  return toAmount(balance?.balance || '0');
}

async function loadAccountIfExists(publicKey: string): Promise<{ exists: boolean; account?: any }> {
  try {
    return { exists: true, account: await StellarService.loadAccount(publicKey) };
  } catch (error: any) {
    if (Number(error?.response?.status || 0) === 404) return { exists: false };
    throw error;
  }
}

function hasTrustline(account: any, assetCode: string, assetIssuer?: string): boolean {
  const code = normalizeAssetCode(assetCode);
  if (code === 'XLM') return true;
  return (account?.balances || []).some((item: any) =>
    String(item?.asset_type || '').toLowerCase() !== 'native' &&
    String(item?.asset_code || '').toUpperCase() === code &&
    String(item?.asset_issuer || '').trim() === String(assetIssuer || '').trim()
  );
}

async function saveExternalWalletAsContact(input: {
  ownerId: string;
  sourcePublicKey: string;
  destinationPublicKey: string;
  contactName?: string;
}) {
  const ownerId = String(input.ownerId || '').trim();
  const sourcePublicKey = String(input.sourcePublicKey || '').trim();
  const destinationPublicKey = String(input.destinationPublicKey || '').trim();
  if (!ownerId || !isValidStellarPublicKey(destinationPublicKey)) return;
  if (sourcePublicKey && sourcePublicKey === destinationPublicKey) return;

  const { data: existing, error: lookupError } = await supabase
    .from('contacts')
    .select('id, contact_name')
    .eq('owner_id', ownerId)
    .eq('stellar_public_key', destinationPublicKey)
    .limit(1)
    .maybeSingle();

  if (lookupError) throw new Error(lookupError.message);
  if (existing?.id) return;

  const requestedName = String(input.contactName || '').trim();
  const contactName = requestedName && !isValidStellarPublicKey(requestedName)
    ? requestedName
    : `Carteira ${destinationPublicKey.slice(0, 6)}`;

  const { error } = await supabase
    .from('contacts')
    .insert({
      owner_id: ownerId,
      contact_name: contactName,
      stellar_public_key: destinationPublicKey,
      pix_key: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

  if (error) throw new Error(error.message);
}

async function logExternalPayment(input: {
  sessionId: string;
  userId: string;
  sourcePublicKey: string;
  destination: string;
  amount: string;
  asset: string;
  assetIssuer?: string;
  feeXlm: string;
  hash?: string;
  status: 'success' | 'failed';
  error?: string;
  executionId?: string;
}) {
  const fingerprint = buildOperationFingerprint({
    sourceSessionId: input.sessionId,
    sourceUserId: input.userId,
    destination: input.destination,
    amount: input.amount,
    assetCode: input.asset,
    tokenHash: input.executionId,
    operationType: 'EXTERNAL_WALLET_PAYMENT',
  });

  const { error } = await supabase
    .from('payment_logs')
    .upsert({
      session_id: input.sessionId,
      user_id: input.userId,
      source_public_key: input.sourcePublicKey,
      destination_public_key: input.destination,
      source_amount: input.amount,
      source_asset_code: input.asset,
      source_asset_issuer: input.assetIssuer || null,
      destination_amount: input.amount,
      destination_asset_code: input.asset,
      destination_asset_issuer: input.assetIssuer || null,
      fee_xlm: input.feeXlm,
      payment_hash: input.hash || null,
      operation_fingerprint: fingerprint,
      operation_type: 'EXTERNAL_WALLET_PAYMENT',
      status: input.status,
      error_message: input.error || null,
      memo: 'external_wallet',
      metadata: {
        destination_type: 'external_wallet',
        execution_id: input.executionId || null,
      },
      created_at: new Date().toISOString(),
      completed_at: input.status === 'success' ? new Date().toISOString() : null,
    }, { onConflict: 'operation_fingerprint' });

  if (error) {
    console.warn(`[send-to-wallet] failed to log payment: ${error.message}`);
  }
}

export default class SendWalletController {
  static async sendToWallet(req: Request, res: Response) {
    const sessionId = String(req.body?.session_id || '').trim();
    const destination = String(req.body?.destination || '').trim();
    const amountRaw = String(req.body?.amount || '').replace(',', '.').trim();
    const asset = settlementAssetCode(req.body?.asset || 'USDC');
    const assetIssuer = getAssetIssuer(asset, req.body?.asset_issuer);
    const preview = Boolean(req.body?.preview);
    const executionId = String(req.body?.execution_id || req.headers['idempotency-key'] || '').trim();

    try {
      if (!sessionId) return res.status(400).json({ success: false, error: 'Sessão obrigatória.' });
      if (!isValidStellarPublicKey(destination)) return res.status(400).json({ success: false, error: 'Endereço inválido' });
      const allowedAssets = Array.from(new Set(['XLM', ...getUserFacingAssetCodes().map((code) => settlementAssetCode(code))]));
      if (!allowedAssets.includes(asset)) {
        return res.status(400).json({ success: false, error: `Ativo inválido. Use ${allowedAssets.map((code) => userFacingAssetCode(code)).join(', ')}.` });
      }
      if (asset !== 'XLM' && !assetIssuer) return res.status(400).json({ success: false, error: `${asset}_ISSUER não está configurado no backend.` });

      const [session, wallet] = await Promise.all([
        agentRepo.getSession(sessionId),
        walletRepo.getWalletBySession(sessionId),
      ]);
      if (!session?.user_id || !wallet?.public_key || !wallet?.vault_secret_id) {
        return res.status(401).json({ success: false, error: 'Sessão inválida. Entre novamente.' });
      }
      if (isSessionExpired(session)) {
        return res.status(401).json({ success: false, error: 'Sua sessão expirou. Entre novamente.' });
      }
      if (destination === wallet.public_key) {
        return res.status(400).json({ success: false, error: 'Você não pode enviar para a própria carteira.' });
      }

      const senderAccount = await StellarService.loadAccount(wallet.public_key);
      const availableRaw = getBalance(senderAccount, asset, assetIssuer);
      const reserve = asset === 'XLM' ? 1.5 : 0;
      const available = Math.max(0, availableRaw - reserve);
      const fee = await formatNetworkFeeForCustomer(DEFAULT_NETWORK_FEE_XLM);
      const destinationState = await loadAccountIfExists(destination);
      const destinationMissing = !destinationState.exists;

      if (preview) {
        return res.status(200).json({
          success: true,
          user_id: String(session.user_id),
          source_public_key: wallet.public_key,
          available_balance: formatAmount(available),
          asset,
          estimated_fee_xlm: DEFAULT_NETWORK_FEE_XLM,
          estimated_fee_display: fee.display,
          destination_exists: destinationState.exists,
          destination_warning: destinationMissing
            ? 'Esta conta ainda não existe na rede. O envio criará a conta mas requer mínimo de 1 XLM.'
            : null,
          destination_accepts_asset: destinationState.exists ? hasTrustline(destinationState.account, asset, assetIssuer) : asset === 'XLM',
        });
      }

      const amount = toAmount(amountRaw);
      if (!Number.isFinite(amount) || amount <= 0) return res.status(400).json({ success: false, error: 'Informe um valor maior que zero.' });
      if (amount > available + 0.0000001) return res.status(400).json({ success: false, error: `Saldo insuficiente. Saldo disponível: ${formatAmount(available)} ${asset}.` });
      if (destinationMissing && asset !== 'XLM') {
        return res.status(400).json({ success: false, error: 'Esta conta ainda não existe na rede. Envie XLM primeiro para criar a conta.' });
      }
      if (destinationMissing && amount < 1) {
        return res.status(400).json({ success: false, error: 'Esta conta ainda não existe na rede. O envio criará a conta mas requer mínimo de 1 XLM.' });
      }
      if (asset !== 'XLM' && destinationState.exists && !hasTrustline(destinationState.account, asset, assetIssuer)) {
        return res.status(400).json({
          success: false,
          error: `A carteira de destino não aceita ${userFacingAssetCode(asset)}. Tente enviar XLM ou peça ao destinatário para configurar a conta.`,
        });
      }

      if (executionId) {
        const fingerprint = buildOperationFingerprint({
          sourceSessionId: sessionId,
          sourceUserId: String(session.user_id),
          destination,
          amount: amountRaw,
          assetCode: asset,
          tokenHash: executionId,
          operationType: 'EXTERNAL_WALLET_PAYMENT',
        });
        const { data: existingLog } = await supabase
          .from('payment_logs')
          .select('payment_hash, destination_amount, destination_asset_code, destination_public_key, completed_at')
          .eq('operation_fingerprint', fingerprint)
          .eq('status', 'success')
          .limit(1)
          .maybeSingle();

        if (existingLog?.payment_hash) {
          return res.status(200).json({
            success: true,
            tx_hash: existingLog.payment_hash,
            amount: String((existingLog as any).destination_amount || amountRaw),
            asset: String((existingLog as any).destination_asset_code || asset),
            destination: String((existingLog as any).destination_public_key || destination),
            completed_at: String((existingLog as any).completed_at || new Date().toISOString()),
            receipt_url: PaymentReceiptService.buildHostedReceiptUrl(existingLog.payment_hash),
          });
        }
      }

      const hasPasskey = Boolean(req.body?.passkey_challenge_id || req.body?.passkey_credential);
      if (hasPasskey) {
        await PasskeyService.verifyLoginAuthentication(
          String(session.user_id),
          String(req.body?.passkey_challenge_id || ''),
          req.body?.passkey_credential
        );
      } else {
        const pin = String(req.body?.pin || '').trim();
        if (!pin || !verifyWalletPinAgainstAny(pin, [(session as any).session_password_hash, (session as any).password_hash]).valid) {
          return res.status(401).json({ success: false, error: 'Autenticação obrigatória. Confirme com Passkey ou PIN.' });
        }
      }

      const secret = await vaultService.getSecret(String(wallet.vault_secret_id));
      const xdr = destinationMissing
        ? await StellarService.buildCreateAccountXdr({
            sourcePublicKey: wallet.public_key,
            destination,
            startingBalance: amountRaw,
            memoText: 'TalkToStellar external',
          })
        : await StellarService.buildPaymentXdr({
            sourcePublicKey: wallet.public_key,
            destination,
            amount: amountRaw,
            assetCode: asset === 'XLM' ? undefined : asset,
            assetIssuer: asset === 'XLM' ? undefined : assetIssuer,
            memoText: 'TalkToStellar external',
          });

      const submitted = await StellarService.signAndSubmitXdr(String(session.user_id), secret, xdr, {
        user_id: String(session.user_id),
        type: destinationMissing ? 'EXTERNAL_WALLET_CREATE_ACCOUNT' : 'EXTERNAL_WALLET_PAYMENT',
        destination_key: destination,
        source_public_key: wallet.public_key,
        source_session_id: sessionId,
        amount,
        asset_code: asset,
        context: `External wallet payment to ${destination}`,
      });

      if (!submitted.success) {
        await logExternalPayment({
          sessionId,
          userId: String(session.user_id),
          sourcePublicKey: wallet.public_key,
          destination,
          amount: amountRaw,
          asset,
          assetIssuer,
          feeXlm: DEFAULT_NETWORK_FEE_XLM,
          status: 'failed',
          error: submitted.error || 'Falha ao enviar pagamento.',
          executionId,
        });
        return res.status(400).json({ success: false, error: submitted.error || 'Falha ao enviar pagamento.' });
      }

      const completedAt = new Date().toISOString();
      await logExternalPayment({
        sessionId,
        userId: String(session.user_id),
        sourcePublicKey: wallet.public_key,
        destination,
        amount: amountRaw,
        asset,
        assetIssuer,
        feeXlm: DEFAULT_NETWORK_FEE_XLM,
        hash: submitted.hash,
        status: 'success',
        executionId,
      });

      await saveExternalWalletAsContact({
        ownerId: String(session.user_id),
        sourcePublicKey: wallet.public_key,
        destinationPublicKey: destination,
        contactName: String(req.body?.destination_name || req.body?.contact_name || '').trim() || undefined,
      }).catch((error) => {
        console.warn(`[send-to-wallet] could not auto-save destination contact: ${error instanceof Error ? error.message : String(error)}`);
      });

      const receiptUrl = await PaymentReceiptService.sendReceipt({
        type: 'payment_sent',
        sessionId,
        userId: String(session.user_id),
        counterpartyLabel: 'carteira externa',
        sourceAmount: amountRaw,
        sourceAssetCode: asset,
        destinationAmount: amountRaw,
        destinationAssetCode: asset,
        feeXlm: DEFAULT_NETWORK_FEE_XLM,
        hash: submitted.hash,
        completedAt,
        contextMessage: 'Envio para carteira externa',
      });

      return res.status(200).json({
        success: true,
        tx_hash: submitted.hash,
        amount: amountRaw,
        asset,
        destination,
        completed_at: completedAt,
        receipt_url: receiptUrl || PaymentReceiptService.buildHostedReceiptUrl(submitted.hash),
      });
    } catch (error: any) {
      return res.status(500).json({ success: false, error: error?.message || String(error) });
    }
  }
}
