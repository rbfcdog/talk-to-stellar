import { supabase } from '../../config/supabase';
import { User } from '../../types';
import { logger } from '../../utils/logger';

function throwRepositoryError(operation: string, detail: string, publicMessage: string): never {
  logger.error(`[user-repository] ${operation}: ${detail}`);
  throw new Error(publicMessage);
}

export class UserRepository {
  static async create(userData: Omit<User, 'id' | 'created_at' | 'updated_at'>): Promise<User> {
    const { data, error } = await supabase
      .from('users')
      .insert([userData])
      .select()
      .single();

    if (error) {
      throwRepositoryError('failed to create user', error.message, 'Failed to create user record in database.');
    }
    return data;
  }

  static async findById(id: string): Promise<User | null> {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null;
      }
      throwRepositoryError('failed to find user by ID', error.message, 'Failed to retrieve user by ID.');
    }
    return data;
  }

  static async findByPublicKey(publicKey: string): Promise<User | null> {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('stellar_public_key', publicKey)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        return null;
      }
      throwRepositoryError('failed to find user by public key', error.message, 'Failed to retrieve user by public key.');
    }
    return data;
  }

  static async findByEmail(email: string): Promise<User | null> {
    const { data, error } = await supabase
      .from('users')
      .select('*')
      .eq('email', email)
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        // Record not found
        return null;
      }
      throwRepositoryError('failed to find user by email', error.message, 'Failed to retrieve user by email.');
    }
    return data;
  }
}
