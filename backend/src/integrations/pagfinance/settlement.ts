/**
 * PagFinance cash-in settlement.
 *
 * Shared by the webhook receiver and the poll-recovery path in the session
 * API. Mutual exclusion between the two triggers is the conditional status
 * claim in the database (PENDING → CREDITING) — never an in-memory lock — so
 * duplicate webhook deliveries and concurrent polls credit exactly once.
 */

import { supabase } from '../../config/supabase';
import { OperationRepository } from '../../api/repository/operation.repository';
import { getStellarNetworkName } from '../../config/assets';
import { creditUsdcToUser, resolveCreditDestination } from './credit';
import { logger } from '../../utils/logger';

const INTENT_ID_SAFE = /^[A-Za-z0-9:_-]{4,120}$/;

export async function findOperationByPagfinanceIntentId(intentId: string): Promise<any | null> {
  if (!INTENT_ID_SAFE.test(intentId)) return null;
  const { data } = await supabase
    .from('operations')
    .select('*')
    .eq('type', 'PIX_ONRAMP')
    .like('context', `%"pagfinance_intent_id":"${intentId}"%`)
    .order('created_at', { ascending: false })
    .limit(1);
  return data?.[0] ?? null;
}

/**
 * Atomically claim the operation for crediting. Returns false when another
 * delivery/poll already claimed it (0 rows matched the conditional update).
 */
export async function claimOperationForCredit(
  operationId: string,
  fromStatuses: string[] = ['PENDING'],
): Promise<boolean> {
  const { data, error } = await supabase
    .from('operations')
    .update({ status: 'CREDITING' })
    .eq('id', operationId)
    .in('status', fromStatuses)
    .select('id');
  if (error) {
    logger.error(`[pagfinance-settlement] claim failed for ${operationId}: ${error.message}`);
    return false;
  }
  return (data?.length ?? 0) > 0;
}

function parseContext(operation: any): Record<string, any> {
  try {
    return JSON.parse(String(operation?.context || '{}'));
  } catch {
    return {};
  }
}

async function sessionEmail(sessionId: string | undefined): Promise<string | undefined> {
  if (!sessionId) return undefined;
  const { data } = await supabase
    .from('agent_sessions')
    .select('email')
    .eq('session_id', sessionId)
    .maybeSingle();
  const email = String(data?.email || '').trim();
  return email || undefined;
}

async function markFailed(operation: any, context: Record<string, any>, reason: string): Promise<void> {
  logger.error(`[pagfinance-settlement] operation ${operation.id} failed: ${reason}`);
  await OperationRepository.update(operation.id, {
    status: 'FAILED',
    context: JSON.stringify({ ...context, credit_error: reason }),
  } as any);
}

async function sendCompletionReceipt(operation: any, context: Record<string, any>, hash: string): Promise<void> {
  try {
    // Lazy import: the receipt service pulls chat/notification deps that the
    // webhook hot path (and tests) should not need to load up front.
    const { PaymentReceiptService } = await import('../../api/services/receipts/payment-receipt.service');
    await PaymentReceiptService.sendReceipt({
      type: 'payment_received',
      sessionId: String(operation.source_session_id || ''),
      userId: String(operation.user_id || ''),
      language: context.language ?? null,
      provider: context.external_provider ?? null,
      providerUserId: context.external_provider_user_id ?? null,
      counterpartyLabel: 'PIX',
      sourceAmount: String(context.source_amount_brl ?? operation.amount ?? ''),
      sourceAssetCode: 'BRL',
      destinationAmount: String(context.usdc_net ?? ''),
      destinationAssetCode: 'USDC',
      feeUsdc: context.usdc_fee != null ? String(context.usdc_fee) : null,
      hash,
      completedAt: context.completed_at ?? null,
      dedupeKey: `pix-onramp:${operation.id}`,
    });
  } catch (error: any) {
    logger.warn(`[pagfinance-settlement] receipt/notification failed for ${operation.id}: ${error?.message || error}`);
  }
}

export interface SettleInput {
  transactionId?: string;
  completedAt?: string;
  expectedWallet?: string;
  expectedValueCents?: number;
  trigger: 'webhook' | 'poll' | 'replay';
}

/**
 * Credit a CLAIMED operation (status must already be CREDITING). Validates
 * the webhook payload against what we recorded at intent time, resolves the
 * destination for the active network, pays USDC, and finalizes the operation.
 */
export async function settleCashinOperation(operation: any, input: SettleInput): Promise<void> {
  const context = parseContext(operation);

  if (input.expectedWallet && input.expectedWallet !== String(operation.source_public_key || '')) {
    await markFailed(
      operation,
      context,
      `webhook walletAddress ${input.expectedWallet} does not match operation source ${operation.source_public_key}`,
    );
    return;
  }
  if (
    input.expectedValueCents != null &&
    context.value_cents != null &&
    Number(input.expectedValueCents) !== Number(context.value_cents)
  ) {
    await markFailed(
      operation,
      context,
      `webhook valueCents ${input.expectedValueCents} does not match recorded ${context.value_cents}`,
    );
    return;
  }

  const usdcNet = String(context.usdc_net ?? '');
  if (!(Number(usdcNet) > 0)) {
    await markFailed(operation, context, 'operation context has no positive usdc_net to credit');
    return;
  }

  const network = getStellarNetworkName();
  const destination = await resolveCreditDestination({
    network,
    sourcePublicKey: String(operation.source_public_key || ''),
    sessionId: operation.source_session_id ? String(operation.source_session_id) : undefined,
    userId: operation.user_id ? String(operation.user_id) : undefined,
    email: network === 'PUBLIC' ? await sessionEmail(operation.source_session_id) : undefined,
  });
  if (!destination.success) {
    await markFailed(operation, context, destination.error);
    return;
  }

  const credit = await creditUsdcToUser({
    destinationPublicKey: destination.destination.publicKey,
    usdcNet,
    usdcFee: String(context.usdc_fee ?? '0'),
    userId: String(operation.user_id || ''),
    memoText: 'PIX PAGFINANCE',
  });
  if (!credit.success || !credit.hash) {
    await markFailed(operation, context, credit.error || 'credit submission failed');
    return;
  }

  const completedAt = input.completedAt || new Date().toISOString();
  const finalContext = {
    ...context,
    final_amount: Number(usdcNet),
    credited_usdc: Number(usdcNet),
    credit_hash: credit.hash,
    credit_destination: destination.destination.publicKey,
    credit_destination_source: destination.destination.source,
    transaction_id: input.transactionId ?? context.transaction_id ?? null,
    completed_at: completedAt,
    settled_by: input.trigger,
  };
  await OperationRepository.update(operation.id, {
    status: 'COMPLETED',
    stellar_transaction_hash: credit.hash,
    context: JSON.stringify(finalContext),
  } as any);
  logger.info(
    `[pagfinance-settlement] operation ${operation.id} credited ${usdcNet} USDC to ${destination.destination.publicKey} (${input.trigger}, tx ${credit.hash})`,
  );

  void sendCompletionReceipt(operation, finalContext, credit.hash);
}
