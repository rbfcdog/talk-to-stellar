import { supabase } from '../../config/supabase';

export class OperationService {
  static async getOperationHistory(userId: string): Promise<any[]> {
    console.log(`Fetching operation history for user_id: ${userId}`);

    const { data, error } = await supabase
      .from('operations') 
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      throw new Error(`Database error: ${error.message}`);
    }

    return data || [];
  }
}