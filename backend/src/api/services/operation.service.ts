import { supabase } from '../../config/supabase';
import { Operation } from '../../types';
import { logger } from '../../utils/logger';

export class OperationService {
  static async getOperationHistory(userId: string): Promise<Operation[]> {
    logger.debug(`[operation-service] fetching operation history for user ${userId}`);
    const { data, error } = await supabase
      .from('operations')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      logger.error(`[operation-service] failed to retrieve operation history: ${error.message}`);
      throw new Error('Failed to retrieve operation history.');
    }

    return data || [];
  }
}
