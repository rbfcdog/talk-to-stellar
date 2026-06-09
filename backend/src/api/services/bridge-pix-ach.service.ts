/**
 * Bridge PIX → USDC → ACH Atomic Flow Service
 *
 * Orchestrates a single-operation flow:
 *   User sends BRL via PIX → auto-converted to USDC on Stellar → ACH to US bank.
 *
 * Uses Bridge.xyz (Stripe) for PIX rails and ACH rails.
 * State is persisted in Supabase between PIX deposit and ACH completion.
 */

import { v4 as uuidv4 } from 'uuid';
import { getBridgeService } from '../../integrations/bridge';
import type { BridgeVirtualAccount, BridgeTransfer } from '../../integrations/bridge';
import { supabase } from '../../config/supabase';
import { logger } from '../../utils/logger';

// ── Types ──────────────────────────────────────────────────────────

export type PixAchOrderState =
  | 'awaiting_pix'     // PIX deposit instructions created, waiting for user payment
  | 'pix_received'     // PIX payment received by Bridge, converting to USDC
  | 'converting_ach'   // ACH off-ramp transfer created, pending completion
  | 'completed'        // ACH transfer completed, funds in US bank
  | 'failed'           // Any step failed
  | 'expired';         // PIX was never sent within the window

export interface USBankInput {
  firstName: string;
  lastName: string;
  routingNumber: string;
  accountNumber: string;
  accountType: 'checking' | 'savings';
  streetLine1: string;
  city: string;
  state: string;
  postalCode: string;
}

export interface PixToAchInput {
  sessionId: string;
  userId: string;
  bridgeCustomerId: string;
  stellarAddress: string;
  /** USD amount the user wants to receive in their bank */
  amountUsd: string;
  /** Estimated BRL amount the user needs to send (based on quote) */
  estimatedBrl: string;
  /** External account ID for the US bank (from registerUsBankAccount) */
  externalAccountId: string;
}

export interface PixToAchOrder {
  id: string;
  sessionId: string;
  userId: string;
  bridgeCustomerId: string;
  stellarAddress: string;
  amountUsd: string;
  estimatedBrl: string;
  state: PixAchOrderState;
  externalAccountId?: string;
  pixVirtualAccountId?: string;
  pixKey?: string;
  achTransferId?: string;
  receiptUrl?: string;
  errorMessage?: string;
  developerFeeUsd?: string;
  bridgeFeeUsd?: string;
  netAmountUsd?: string;
  destinationBankLast4?: string;
  createdAt: string;
  updatedAt: string;
}

// ── Service ────────────────────────────────────────────────────────

export class BridgePixAchService {
  private bridge = getBridgeService();

  // ── Step 1: Register US Bank account (one-time per user) ─────────

  async registerUsBankAccount(
    bridgeCustomerId: string,
    input: USBankInput,
  ): Promise<string> {
    logger.info(`[bridge-pix-ach] registering US bank for customer=${bridgeCustomerId} bank=****${input.accountNumber.slice(-4)}`);

    const external = await this.bridge.addUsBankAccount(bridgeCustomerId, input);

    logger.info(`[bridge-pix-ach] US bank registered id=${external.id}`);
    return external.id;
  }

  // ── Step 2: Create PIX → ACH order ───────────────────────────────

  async createPixToAchOrder(input: PixToAchInput): Promise<PixToAchOrder> {
    logger.info(`[bridge-pix-ach] creating order session=${input.sessionId} amount_usd=$${input.amountUsd} est_brl=R$${input.estimatedBrl}`);

    // Step A: Create PIX virtual account → USDC on Stellar
    const va = await this.bridge.createPixOnRamp(
      input.bridgeCustomerId,
      input.stellarAddress,
    );

    logger.info(`[bridge-pix-ach] PIX virtual account created id=${va.id} pix_key=${va.source_deposit_instructions?.pix_key}`);

    const order: PixToAchOrder = {
      id: uuidv4(),
      sessionId: input.sessionId,
      userId: input.userId,
      bridgeCustomerId: input.bridgeCustomerId,
      stellarAddress: input.stellarAddress,
      externalAccountId: input.externalAccountId,
      amountUsd: input.amountUsd,
      estimatedBrl: input.estimatedBrl,
      state: 'awaiting_pix',
      pixVirtualAccountId: va.id,
      pixKey: va.source_deposit_instructions?.pix_key || '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Persist state in Supabase
    await this.saveOrder(order);

    return order;
  }

  // ── Step 3: Handle PIX deposit received (webhook trigger) ────────

  async onPixDepositReceived(virtualAccountId: string): Promise<PixToAchOrder | null> {
    logger.info(`[bridge-pix-ach] PIX deposit received va=${virtualAccountId}`);

    const order = await this.findOrderByVA(virtualAccountId);
    if (!order) {
      logger.warn(`[bridge-pix-ach] no order found for va=${virtualAccountId}`);
      return null;
    }

    if (order.state !== 'awaiting_pix') {
      logger.warn(`[bridge-pix-ach] order ${order.id} in unexpected state: ${order.state}`);
      return order;
    }

    // Transition to pix_received
    order.state = 'pix_received';
    order.updatedAt = new Date().toISOString();
    await this.saveOrder(order);

    // Step C: Create ACH off-ramp transfer
    try {
      const transfer = await this.bridge.createAchOffRamp(
        order.bridgeCustomerId,
        order.stellarAddress,
        order.amountUsd,
        order.externalAccountId || '',
        `TTS-${order.id.slice(0, 8)}`,
      );

      order.state = 'converting_ach';
      order.achTransferId = transfer.id;
      order.developerFeeUsd = transfer.receipt?.developer_fee || '0';
      order.bridgeFeeUsd = transfer.receipt?.exchange_fee || '0';
      order.netAmountUsd = transfer.receipt?.final_amount || order.amountUsd;
      order.updatedAt = new Date().toISOString();

      logger.info(`[bridge-pix-ach] ACH transfer created id=${transfer.id} net=$${order.netAmountUsd}`);

      await this.saveOrder(order);

      return order;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(`[bridge-pix-ach] ACH transfer creation failed: ${message}`);

      order.state = 'failed';
      order.errorMessage = `ACH off-ramp failed: ${message}`;
      order.updatedAt = new Date().toISOString();
      await this.saveOrder(order);

      return order;
    }
  }

  // ── Step 4: Handle ACH completed (webhook trigger) ───────────────

  async onAchCompleted(transferId: string): Promise<PixToAchOrder | null> {
    logger.info(`[bridge-pix-ach] ACH transfer completed id=${transferId}`);

    const order = await this.findOrderByTransfer(transferId);
    if (!order) {
      logger.warn(`[bridge-pix-ach] no order found for transfer=${transferId}`);
      return null;
    }

    if (order.state !== 'converting_ach') {
      logger.warn(`[bridge-pix-ach] order ${order.id} in unexpected state: ${order.state}`);
      return order;
    }

    order.state = 'completed';
    order.updatedAt = new Date().toISOString();
    await this.saveOrder(order);

    logger.info(`[bridge-pix-ach] order ${order.id} completed. $${order.amountUsd} → bank ****${order.destinationBankLast4 || '?'}`);

    return order;
  }

  // ── Step 4b: Handle ACH failed ───────────────────────────────────

  async onAchFailed(transferId: string, errorMessage?: string): Promise<PixToAchOrder | null> {
    logger.warn(`[bridge-pix-ach] ACH transfer failed id=${transferId} error=${errorMessage}`);

    const order = await this.findOrderByTransfer(transferId);
    if (!order) return null;

    order.state = 'failed';
    order.errorMessage = errorMessage || 'ACH transfer failed';
    order.updatedAt = new Date().toISOString();
    await this.saveOrder(order);

    return order;
  }

  // ── Query orders ─────────────────────────────────────────────────

  async getOrder(orderId: string): Promise<PixToAchOrder | null> {
    const { data, error } = await supabase
      .from('bridge_pix_ach_orders')
      .select('*')
      .eq('id', orderId)
      .maybeSingle();

    if (error || !data) return null;
    return this.rowToOrder(data);
  }

  async getOrdersBySession(sessionId: string): Promise<PixToAchOrder[]> {
    const { data, error } = await supabase
      .from('bridge_pix_ach_orders')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: false })
      .limit(20);

    if (error || !data) return [];
    return data.map((r: any) => this.rowToOrder(r));
  }

  // ── Expire stale orders ──────────────────────────────────────────

  async expireStaleOrders(maxAgeMs: number = 30 * 60 * 1000): Promise<number> {
    const cutoff = new Date(Date.now() - maxAgeMs).toISOString();
    const { count, error } = await supabase
      .from('bridge_pix_ach_orders')
      .update({ state: 'expired', updated_at: new Date().toISOString() })
      .eq('state', 'awaiting_pix')
      .lt('created_at', cutoff);

    const expired = (count as any) || 0;
    if (expired > 0) {
      logger.info(`[bridge-pix-ach] expired ${expired} stale orders`);
    }
    if (error && !String(error?.message || '').includes('does not exist')) {
      logger.warn(`[bridge-pix-ach] expire error: ${error.message}`);
    }
    return expired;
  }

  // ── Private helpers ──────────────────────────────────────────────

  private async findOrderByVA(vaId: string): Promise<PixToAchOrder | null> {
    const { data, error } = await supabase
      .from('bridge_pix_ach_orders')
      .select('*')
      .eq('pix_virtual_account_id', vaId)
      .eq('state', 'awaiting_pix')
      .maybeSingle();

    if (error || !data) return null;
    return this.rowToOrder(data);
  }

  private async findOrderByTransfer(transferId: string): Promise<PixToAchOrder | null> {
    const { data, error } = await supabase
      .from('bridge_pix_ach_orders')
      .select('*')
      .eq('ach_transfer_id', transferId)
      .eq('state', 'converting_ach')
      .maybeSingle();

    if (error || !data) return null;
    return this.rowToOrder(data);
  }

  private async saveOrder(order: PixToAchOrder): Promise<void> {
    const { error } = await supabase
      .from('bridge_pix_ach_orders')
      .upsert({
        id: order.id,
        session_id: order.sessionId,
        user_id: order.userId,
        bridge_customer_id: order.bridgeCustomerId,
        stellar_address: order.stellarAddress,
        external_account_id: order.externalAccountId || null,
        amount_usd: order.amountUsd,
        estimated_brl: order.estimatedBrl,
        state: order.state,
        pix_virtual_account_id: order.pixVirtualAccountId || null,
        pix_key: order.pixKey || null,
        ach_transfer_id: order.achTransferId || null,
        receipt_url: order.receiptUrl || null,
        error_message: order.errorMessage || null,
        developer_fee_usd: order.developerFeeUsd || null,
        bridge_fee_usd: order.bridgeFeeUsd || null,
        net_amount_usd: order.netAmountUsd || null,
        destination_bank_last4: order.destinationBankLast4 || null,
        created_at: order.createdAt,
        updated_at: order.updatedAt,
      }, { onConflict: 'id' });

    if (error) {
      const message = String(error?.message || '').toLowerCase();
      if (!message.includes('does not exist') && !message.includes('relation') && !message.includes('schema cache')) {
        throw error;
      }
      // Table may not exist yet — log and continue
      logger.warn(`[bridge-pix-ach] could not persist order (table may not exist): ${error.message}`);
    }
  }

  private rowToOrder(row: any): PixToAchOrder {
    return {
      id: row.id,
      sessionId: row.session_id,
      userId: row.user_id,
      bridgeCustomerId: row.bridge_customer_id,
      stellarAddress: row.stellar_address,
      externalAccountId: row.external_account_id,
      amountUsd: row.amount_usd,
      estimatedBrl: row.estimated_brl,
      state: row.state,
      pixVirtualAccountId: row.pix_virtual_account_id,
      pixKey: row.pix_key,
      achTransferId: row.ach_transfer_id,
      receiptUrl: row.receipt_url,
      errorMessage: row.error_message,
      developerFeeUsd: row.developer_fee_usd,
      bridgeFeeUsd: row.bridge_fee_usd,
      netAmountUsd: row.net_amount_usd,
      destinationBankLast4: row.destination_bank_last4,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}
