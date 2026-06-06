import { supabase } from '../../config/supabase';
import { Operation } from '../../types';
import { logger } from '../../utils/logger';

type ContactPaymentSummary = {
  payment_count: number;
  total_amount: string;
  total_usdc: string;
};

type SpendingSummary = {
  category?: string;
  asset_code?: string;
  transaction_count: number;
  total_amount: string;
  total_usdc: string;
  total_brl: string;
};

type OperationContactUpdate = Partial<Operation> & {
  contact_id?: string;
  category?: string;
  memo?: string;
};

type OperationInsert = Omit<Operation, 'id' | 'created_at' | 'updated_at'> & {
  amount_usdc?: number | string;
  amount_brl?: number | string;
};

function throwRepositoryError(operation: string, detail: string, publicMessage: string): never {
  logger.error(`[operation-repository] ${operation}: ${detail}`);
  throw new Error(publicMessage);
}

export class OperationRepository {
  static async create(opData: OperationInsert): Promise<Operation> {
    let { data, error } = await supabase
      .from('operations')
      .insert([opData])
      .select()
      .single();

    const missingWalletColumn =
      error &&
      ['destination_session_id', 'source_public_key', 'source_session_id', 'amount_usdc', 'amount_brl'].some((column) =>
        String(error?.message || '').includes(`Could not find the '${column}' column`)
      );

    if (missingWalletColumn) {
      const { destination_session_id, source_public_key, source_session_id, amount_usdc, amount_brl, ...compatibleOpData } = opData;
      const retry = await supabase
        .from('operations')
        .insert([compatibleOpData])
        .select()
        .single();

      data = retry.data;
      error = retry.error;
    }

    if (error) {
      throwRepositoryError('failed to create operation', error.message, 'Failed to create operation record in database.');
    }
    return data;
  }

  static async update(id: string, updates: Partial<Operation>): Promise<Operation> {
    let { data, error } = await supabase
      .from('operations')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      const duplicateStellarHash =
        updates.stellar_transaction_hash &&
        String(error.message || '').includes('ux_operations_stellar_tx_hash');

      if (duplicateStellarHash) {
        const compatibleUpdates: Partial<Operation> = { ...updates };
        delete compatibleUpdates.stellar_transaction_hash;
        const retry = await supabase
          .from('operations')
          .update(compatibleUpdates)
          .eq('id', id)
          .select()
          .single();

        if (!retry.error && retry.data) {
          logger.warn(`[operation-repository] operation ${id} completed with an already-recorded Stellar hash; status was updated without duplicating the hash.`);
          return retry.data;
        }

        const current = await this.findById(id);
        if (current) {
          logger.warn(`[operation-repository] operation ${id} hit duplicate Stellar hash and could not be updated, but the submitted transaction should remain valid.`);
          return current;
        }
      }

      throwRepositoryError('failed to update operation', error.message, 'Failed to update operation record.');
    }
    return data;
  }

  static async findByUserId(userId: string): Promise<Operation[]> {
    const { data, error } = await supabase
      .from('operations')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      throwRepositoryError('failed to find operations by user ID', error.message, 'Failed to retrieve user operations.');
    }
    return data || [];
  }

  static async findById(id: string): Promise<Operation | null> {
    const { data, error } = await supabase
      .from('operations')
      .select('*')
      .eq('id', id)
      .single();
    
    if (error) {
      if (error.code === 'PGRST116') {
        return null; // Record not found
      }
      throwRepositoryError('failed to find operation by ID', error.message, 'Failed to retrieve operation record.');
    }
    return data;
  }

  static async findByContactId(userId: string, contactId: string, periodDays: number = 30): Promise<Operation[]> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - periodDays);

    const { data, error } = await supabase
      .from('operations')
      .select('*')
      .eq('user_id', userId)
      .eq('contact_id', contactId)
      .eq('status', 'success')
      .gte('created_at', startDate.toISOString())
      .order('created_at', { ascending: false });

    if (error) {
      throwRepositoryError('failed to find operations by contact ID', error.message, 'Failed to retrieve contact payment history.');
    }
    return data || [];
  }

  static async getContactSummary(userId: string, contactId: string, periodDays: number = 30): Promise<ContactPaymentSummary> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - periodDays);

    const { data, error } = await supabase
      .from('contact_payment_summary')
      .select('*')
      .eq('user_id', userId)
      .eq('contact_id', contactId)
      .gte('created_at', startDate.toISOString())
      .single();

    if (error && error.code !== 'PGRST116') {
      logger.error(`[operation-repository] failed to get contact summary: ${error.message}`);
    }
    return data || { payment_count: 0, total_amount: '0', total_usdc: '0' };
  }

  static async getSpendingSummary(userId: string, periodDays: number = 30, groupBy: 'category' | 'asset' = 'category'): Promise<SpendingSummary[]> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - periodDays);

    const selectFields = groupBy === 'category'
      ? 'category, transaction_count, total_amount, total_usdc, total_brl'
      : 'asset_code, transaction_count, total_amount, total_usdc, total_brl';

    const { data, error } = await supabase
      .from('spending_summary')
      .select(selectFields)
      .eq('user_id', userId)
      .gte('created_at', startDate.toISOString())
      .order(groupBy === 'category' ? 'total_usdc' : 'total_amount', { ascending: false });

    if (error) {
      throwRepositoryError('failed to get spending summary', error.message, 'Failed to retrieve spending summary.');
    }
    return data || [];
  }

  static async updateWithContactInfo(id: string, contactId: string | null, category: string = 'other', memo: string = ''): Promise<Operation> {
    const updates: OperationContactUpdate = { category };
    if (contactId) updates.contact_id = contactId;
    if (memo) updates.memo = memo;

    return this.update(id, updates);
  }
}
