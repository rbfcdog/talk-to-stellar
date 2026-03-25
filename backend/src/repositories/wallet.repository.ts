/**
 * Repository for wallet management via Supabase
 */

import { SupabaseClient } from '@supabase/supabase-js';

export interface WalletInfo {
  session_id: string;
  public_key: string;
  name?: string;
  balance?: Array<{
    balance: string;
    asset_type: string;
    asset_code?: string;
    asset_issuer?: string;
  }>;
  sequence?: string;
  account_data?: any;
}

export class WalletRepository {
  constructor(private supabase: SupabaseClient) {}

  private isMissingNameColumnError(error: any): boolean {
    const message = String(error?.message || '').toLowerCase();
    return (
      message.includes('column') &&
      message.includes('name') &&
      (message.includes('does not exist') || message.includes('could not find'))
    );
  }

  /**
   * Save or update wallet information
   */
  async saveWallet(walletInfo: WalletInfo): Promise<void> {
    // First try to get existing wallet
    const { data: existing } = await this.supabase
      .from('wallets')
      .select('id')
      .eq('session_id', walletInfo.session_id)
      .single();

    const walletData = {
      session_id: walletInfo.session_id,
      public_key: walletInfo.public_key,
      name: walletInfo.name,
      balance: walletInfo.balance || [],
      sequence: walletInfo.sequence,
      account_data: walletInfo.account_data,
      last_synced: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const walletDataWithoutName = {
      session_id: walletInfo.session_id,
      public_key: walletInfo.public_key,
      balance: walletInfo.balance || [],
      sequence: walletInfo.sequence,
      account_data: walletInfo.account_data,
      last_synced: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    let error;
    if (existing) {
      // Update existing wallet
      const result = await this.supabase
        .from('wallets')
        .update(walletData)
        .eq('session_id', walletInfo.session_id);
      error = result.error;

      if (error && this.isMissingNameColumnError(error)) {
        const retry = await this.supabase
          .from('wallets')
          .update(walletDataWithoutName)
          .eq('session_id', walletInfo.session_id);
        error = retry.error;
      }
    } else {
      // Insert new wallet
      const result = await this.supabase
        .from('wallets')
        .insert(walletData);
      error = result.error;

      if (error && this.isMissingNameColumnError(error)) {
        const retry = await this.supabase
          .from('wallets')
          .insert(walletDataWithoutName);
        error = retry.error;
      }
    }

    if (error) {
      throw new Error(`Failed to save wallet: ${error.message || JSON.stringify(error)}`);
    }
  }

  /**
   * Get wallet by session ID
   */
  async getWalletBySession(sessionId: string): Promise<WalletInfo | null> {
    const { data, error } = await this.supabase
      .from('wallets')
      .select('*')
      .eq('session_id', sessionId)
      .single();

    if (error && error.code !== 'PGRST116') {
      throw new Error(`Failed to get wallet: ${error.message || JSON.stringify(error)}`);
    }
    return data || null;
  }

  /**
   * Get wallet by public key
   */
  async getWalletByPublicKey(publicKey: string): Promise<WalletInfo | null> {
    const { data, error } = await this.supabase
      .from('wallets')
      .select('*')
      .eq('public_key', publicKey)
      .single();

    if (error && error.code !== 'PGRST116') {
      throw new Error(`Failed to get wallet by public key: ${error.message || JSON.stringify(error)}`);
    }
    return data || null;
  }

  /**
   * Update wallet balance
   */
  async updateBalance(sessionId: string, balance: any[], sequence?: string): Promise<void> {
    const { error } = await this.supabase
      .from('wallets')
      .update({
        balance,
        sequence,
        last_synced: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('session_id', sessionId);

    if (error) {
      throw new Error(`Failed to update balance: ${error.message || JSON.stringify(error)}`);
    }
  }

  /**
   * Delete wallet
   */
  async deleteWallet(sessionId: string): Promise<void> {
    const { error } = await this.supabase
      .from('wallets')
      .delete()
      .eq('session_id', sessionId);

    if (error) {
      throw new Error(`Failed to delete wallet: ${error.message || JSON.stringify(error)}`);
    }
  }
}
