/**
 * Repository for wallet management via Supabase
 */

import { SupabaseClient } from '@supabase/supabase-js';

export interface WalletInfo {
  session_id: string;
  public_key: string;
  vault_secret_id?: string;
  name?: string;
  pix_key?: string;
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

  private isMissingColumnError(error: any, column: string): boolean {
    const message = String(error?.message || '').toLowerCase();
    return (
      message.includes('column') &&
      message.includes(column.toLowerCase()) &&
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
      vault_secret_id: walletInfo.vault_secret_id,
      name: walletInfo.name,
      pix_key: walletInfo.pix_key,
      balance: walletInfo.balance || [],
      sequence: walletInfo.sequence,
      account_data: walletInfo.account_data,
      last_synced: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const walletDataWithoutName = {
      session_id: walletInfo.session_id,
      public_key: walletInfo.public_key,
      vault_secret_id: walletInfo.vault_secret_id,
      pix_key: walletInfo.pix_key,
      balance: walletInfo.balance || [],
      sequence: walletInfo.sequence,
      account_data: walletInfo.account_data,
      last_synced: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const walletDataWithoutNameOrPix = {
      session_id: walletInfo.session_id,
      public_key: walletInfo.public_key,
      vault_secret_id: walletInfo.vault_secret_id,
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

      if (error && this.isMissingColumnError(error, 'name')) {
        const retry = await this.supabase
          .from('wallets')
          .update(walletDataWithoutName)
          .eq('session_id', walletInfo.session_id);
        error = retry.error;
      }

      if (error && this.isMissingColumnError(error, 'pix_key')) {
        const retry = await this.supabase
          .from('wallets')
          .update(walletDataWithoutNameOrPix)
          .eq('session_id', walletInfo.session_id);
        error = retry.error;
      }
    } else {
      const result = await this.supabase
        .from('wallets')
        .insert(walletData);
      error = result.error;

      if (error && this.isMissingColumnError(error, 'name')) {
        const retry = await this.supabase
          .from('wallets')
          .insert(walletDataWithoutName);
        error = retry.error;
      }

      if (error && this.isMissingColumnError(error, 'pix_key')) {
        const retry = await this.supabase
          .from('wallets')
          .insert(walletDataWithoutNameOrPix);
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

  /**
   * Get wallet by ID
   */
  async getWalletById(id: number): Promise<any> {
    const { data, error } = await this.supabase
      .from('wallets')
      .select('*')
      .eq('id', id)
      .single();

    if (error && error.code !== 'PGRST116') {
      throw new Error(`Failed to get wallet: ${error.message}`);
    }
    return data || null;
  }

  /**
   * Update last balance alert timestamp
   */
  async updateLastBalanceAlert(walletId: number): Promise<void> {
    const { error } = await this.supabase
      .from('wallets')
      .update({ last_balance_alert_at: new Date().toISOString() })
      .eq('id', walletId);

    if (error) {
      throw new Error(`Failed to update last balance alert: ${error.message}`);
    }
  }

  /**
   * Set alert threshold for a wallet
   */
  async setAlertThreshold(walletId: number, thresholdUsdc: number): Promise<void> {
    const { error } = await this.supabase
      .from('wallets')
      .update({ alert_threshold_usdc: thresholdUsdc })
      .eq('id', walletId);

    if (error) {
      throw new Error(`Failed to set alert threshold: ${error.message}`);
    }
  }
}
