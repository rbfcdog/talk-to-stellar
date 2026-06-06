import { supabase } from '../../config/supabase';
import { Contact } from '../../types';
import { logger } from '../../utils/logger';

function throwRepositoryError(operation: string, detail: string, publicMessage: string): never {
  logger.error(`[contact-repository] ${operation}: ${detail}`);
  throw new Error(publicMessage);
}

export class ContactRepository {
  static async create(contactData: Omit<Contact, 'id' | 'created_at' | 'updated_at'>): Promise<Contact> {
    const { data, error } = await supabase
      .from('contacts')
      .insert([contactData])
      .select()
      .single();

    if (error) {
      throwRepositoryError('failed to create contact', error.message, 'Failed to create contact record in database.');
    }
    return data;
  }

  static async findByOwnerId(ownerId: string): Promise<Contact[]> {
    const { data, error } = await supabase
      .from('contacts')
      .select('*')
      .eq('owner_id', ownerId)
      .order('created_at', { ascending: false });
    
    if (error) {
      throwRepositoryError('failed to find contacts by owner ID', error.message, 'Failed to retrieve user contacts.');
    }
    return data || [];
  }

  static async findByNameForOwner(ownerId: string, contactName: string): Promise<Contact | null> {
    // Try exact match first (case-insensitive)
    const { data, error } = await supabase
      .from('contacts')
      .select('*')
      .eq('owner_id', ownerId)
      .ilike('contact_name', contactName)
      .maybeSingle();

    if (error) {
      throwRepositoryError('failed to find contact by name for owner', error.message, 'Failed to retrieve contact by name.');
    }

    return data || null;
  }

  static async findByPixKey(pixKey: string, ownerId?: string): Promise<Contact | null> {
    let query = supabase
      .from('contacts')
      .select('*')
      .ilike('pix_key', String(pixKey || '').trim().toLowerCase())
      .limit(1);

    if (ownerId) {
      query = query.eq('owner_id', ownerId);
    }

    const { data, error } = await query.maybeSingle();

    if (error) {
      throwRepositoryError('failed to find contact by transfer key', error.message, 'Failed to retrieve contact by transfer key.');
    }

    return data || null;
  }
}
