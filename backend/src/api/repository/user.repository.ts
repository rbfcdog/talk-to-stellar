import { supabase } from '../../config/supabase';
import { User } from '../../types';

export class UserRepository {
  static async create(userData: Omit<User, 'id' | 'created_at' | 'updated_at'>): Promise<User> {
    const { data, error } = await supabase
      .from('users')
      .insert([userData])
      .select()
      .single();

    if (error) {
      console.error('Supabase error creating user:', error.message);
      throw new Error('Failed to create user record in database.');
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
      console.error('Supabase error finding user by ID:', error.message);
      throw new Error('Failed to retrieve user by ID.');
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
      console.error('Supabase error finding user by public key:', error.message);
      throw new Error('Failed to retrieve user by public key.');
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
      console.error('Supabase error finding user by email:', error.message);
      throw new Error('Failed to retrieve user by email.');
    }
    return data;
  }
}
