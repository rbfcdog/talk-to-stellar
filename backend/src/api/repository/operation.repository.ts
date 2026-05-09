import { supabase } from '../../config/supabase';
import { Operation } from '../../types';

export class OperationRepository {
  static async create(opData: Omit<Operation, 'id' | 'created_at' | 'updated_at'>): Promise<Operation> {
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
      const { destination_session_id, source_public_key, source_session_id, amount_usdc, amount_brl, ...compatibleOpData } = opData as any;
      const retry = await supabase
        .from('operations')
        .insert([compatibleOpData])
        .select()
        .single();

      data = retry.data;
      error = retry.error;
    }

    if (error) {
      console.error('Supabase error creating operation:', error.message);
      throw new Error(`Failed to create operation record in database: ${error.message}`);
    }
    return data;
  }

  static async update(id: string, updates: Partial<Operation>): Promise<Operation> {
    const { data, error } = await supabase
      .from('operations')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Supabase error updating operation:', error.message);
      throw new Error('Failed to update operation record.');
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
        console.error('Supabase error finding operations:', error.message);
        throw new Error('Failed to retrieve user operations.');
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
      console.error('Supabase error finding operation by id:', error.message);
      throw new Error('Failed to retrieve operation record.');
    }
    return data;
  }

  static async findByContactId(userId: string, contactId: string, periodDays: number = 30): Promise<any[]> {
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
      console.error('Supabase error finding contact operations:', error.message);
      throw new Error('Failed to retrieve contact payment history.');
    }
    return data || [];
  }

  static async getContactSummary(userId: string, contactId: string, periodDays: number = 30): Promise<any> {
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
      console.error('Supabase error getting contact summary:', error.message);
    }
    return data || { payment_count: 0, total_amount: '0', total_usdc: '0' };
  }

  static async getSpendingSummary(userId: string, periodDays: number = 30, groupBy: 'category' | 'asset' = 'category'): Promise<any[]> {
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
      console.error('Supabase error getting spending summary:', error.message);
      throw new Error('Failed to retrieve spending summary.');
    }
    return data || [];
  }

  static async updateWithContactInfo(id: string, contactId: string | null, category: string = 'other', memo: string = ''): Promise<Operation> {
    const updates: any = { category };
    if (contactId) updates.contact_id = contactId;
    if (memo) updates.memo = memo;

    return this.update(id, updates);
  }
}
