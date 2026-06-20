/**
 * SEP-7 Payment Link Service
 *
 * Generates web+stellar:pay?... URIs per the SEP-7 spec.
 * Wraps them in short https://... URLs for easy WhatsApp sharing.
 *
 * SEP-7 spec: https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0007.md
 */

import { v4 as uuidv4 } from 'uuid';
import { supabase } from '../../config/supabase';
import { logger } from '../../utils/logger';
import { CreatePaymentLinkInput, Sep7PaymentLink } from './types';

const USDC_ISSUER_MAINNET = 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN';
const APP_BASE_URL = process.env.NEXT_PUBLIC_BACKEND_URL || process.env.APP_URL || 'https://talktostellar.com';

function isMainnet() {
  const n = (process.env.STELLAR_NETWORK || 'testnet').toLowerCase();
  return n === 'mainnet' || n === 'public';
}

export const PaymentLinksService = {
  buildSep7Uri(input: CreatePaymentLinkInput): string {
    const params = new URLSearchParams();
    params.set('destination', input.stellar_address);
    if (input.amount) params.set('amount', input.amount);
    if (input.asset_code && input.asset_code !== 'XLM') {
      params.set('asset_code', input.asset_code);
      const issuer = input.asset_issuer || (input.asset_code === 'USDC' ? USDC_ISSUER_MAINNET : '');
      if (issuer) params.set('asset_issuer', issuer);
    }
    if (input.memo) params.set('memo', input.memo);
    if (input.memo_type) params.set('memo_type', input.memo_type);
    if (input.label) params.set('label', input.label);
    if (input.message) params.set('msg', input.message);
    if (!isMainnet()) params.set('network_passphrase', 'Test SDF Network ; September 2015');
    return `web+stellar:pay?${params.toString()}`;
  },

  async create(input: CreatePaymentLinkInput): Promise<Sep7PaymentLink> {
    const id = uuidv4().replace(/-/g, '').slice(0, 12);
    const uri = this.buildSep7Uri(input);
    const shortUrl = `${APP_BASE_URL}/pay/${id}`;
    const expiresAt = input.expires_in_hours
      ? new Date(Date.now() + input.expires_in_hours * 3600_000).toISOString()
      : undefined;

    const row = {
      id,
      stellar_address: input.stellar_address,
      amount: input.amount || null,
      asset_code: input.asset_code || 'USDC',
      asset_issuer: input.asset_issuer || USDC_ISSUER_MAINNET,
      memo: input.memo || null,
      memo_type: input.memo_type || null,
      label: input.label || null,
      message: input.message || null,
      uri,
      short_url: shortUrl,
      expires_at: expiresAt || null,
      times_used: 0,
      created_at: new Date().toISOString(),
    };

    try {
      await supabase.from('payment_links').insert(row);
    } catch (e: any) {
      logger.warn(`[payment-links] DB insert failed: ${e.message}`);
    }

    return row as Sep7PaymentLink;
  },

  async get(id: string): Promise<Sep7PaymentLink | null> {
    const { data } = await supabase
      .from('payment_links')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    return data as Sep7PaymentLink | null;
  },

  async recordUse(id: string): Promise<void> {
    try {
      await supabase.rpc('increment_payment_link_use', { link_id: id });
    } catch {
      // Non-critical — best effort
    }
  },

  async list(stellarAddress: string, limit = 20): Promise<Sep7PaymentLink[]> {
    const { data } = await supabase
      .from('payment_links')
      .select('*')
      .eq('stellar_address', stellarAddress)
      .order('created_at', { ascending: false })
      .limit(limit);
    return (data || []) as Sep7PaymentLink[];
  },

  async delete(id: string): Promise<void> {
    await supabase.from('payment_links').delete().eq('id', id);
  },
};
