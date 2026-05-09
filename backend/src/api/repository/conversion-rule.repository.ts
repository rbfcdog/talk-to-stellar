import { supabase } from '../../config/supabase';

export interface ConversionRule {
  id: string;
  wallet_id: number;
  session_id: string;
  from_asset_code: string;
  to_asset_code: string;
  trigger_type: 'on_receive' | 'on_threshold';
  min_amount: number;
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export class ConversionRuleRepository {
  static async create(rule: Omit<ConversionRule, 'id' | 'created_at' | 'updated_at'>): Promise<ConversionRule> {
    const { data, error } = await supabase
      .from('conversion_rules')
      .insert([rule])
      .select()
      .single();

    if (error) {
      console.error('Supabase error creating conversion rule:', error.message);
      throw new Error(`Failed to create conversion rule: ${error.message}`);
    }
    return data;
  }

  static async update(id: string, updates: Partial<ConversionRule>): Promise<ConversionRule> {
    const { data, error } = await supabase
      .from('conversion_rules')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('Supabase error updating conversion rule:', error.message);
      throw new Error('Failed to update conversion rule.');
    }
    return data;
  }

  static async delete(id: string): Promise<void> {
    const { error } = await supabase
      .from('conversion_rules')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Supabase error deleting conversion rule:', error.message);
      throw new Error('Failed to delete conversion rule.');
    }
  }

  static async findByWalletId(walletId: number, enabledOnly: boolean = true): Promise<ConversionRule[]> {
    let query = supabase
      .from('conversion_rules')
      .select('*')
      .eq('wallet_id', walletId);

    if (enabledOnly) {
      query = query.eq('enabled', true);
    }

    const { data, error } = await query.order('created_at', { ascending: false });

    if (error) {
      console.error('Supabase error finding conversion rules:', error.message);
      throw new Error('Failed to retrieve conversion rules.');
    }
    return data || [];
  }

  static async findBySessionId(sessionId: string, enabledOnly: boolean = true): Promise<ConversionRule[]> {
    let query = supabase
      .from('conversion_rules')
      .select('*')
      .eq('session_id', sessionId);

    if (enabledOnly) {
      query = query.eq('enabled', true);
    }

    const { data, error } = await query.order('created_at', { ascending: false });

    if (error) {
      console.error('Supabase error finding conversion rules:', error.message);
      throw new Error('Failed to retrieve conversion rules.');
    }
    return data || [];
  }

  static async findByAssetPair(walletId: number, fromAsset: string, toAsset: string): Promise<ConversionRule | null> {
    const { data, error } = await supabase
      .from('conversion_rules')
      .select('*')
      .eq('wallet_id', walletId)
      .eq('from_asset_code', fromAsset)
      .eq('to_asset_code', toAsset)
      .eq('enabled', true)
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('Supabase error finding conversion rule:', error.message);
      throw new Error('Failed to retrieve conversion rule.');
    }
    return data || null;
  }

  static async toggleEnabled(id: string, enabled: boolean): Promise<ConversionRule> {
    return this.update(id, { enabled });
  }
}
