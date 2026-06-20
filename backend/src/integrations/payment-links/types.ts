export interface Sep7PaymentLink {
  id: string;
  stellar_address: string;
  amount?: string;
  asset_code?: string;
  asset_issuer?: string;
  memo?: string;
  memo_type?: 'text' | 'id' | 'hash';
  label?: string;
  message?: string;
  network_passphrase?: string;
  uri: string;
  short_url: string;
  created_at: string;
  expires_at?: string;
  times_used: number;
}

export interface CreatePaymentLinkInput {
  stellar_address: string;
  amount?: string;
  asset_code?: string;
  asset_issuer?: string;
  memo?: string;
  memo_type?: 'text' | 'id' | 'hash';
  label?: string;
  message?: string;
  expires_in_hours?: number;
}
