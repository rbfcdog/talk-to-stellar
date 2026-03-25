import { supabase } from '../../config/supabase';
import { Operation } from '../../types';

export class OperationRepository {
  static async create(opData: Omit<Operation, 'id' | 'created_at' | 'updated_at'>): Promise<Operation> {
    const { data, error } = await supabase
      .from('operations')
      .insert([opData])
      .select()
      .single();

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
}
