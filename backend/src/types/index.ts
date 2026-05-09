export interface User {
  id: string;
  email: string;
  phone_number?: string;
  stellar_public_key: string;
  created_at: string;
  updated_at: string;
}

export interface Contact {
  id: string;
  owner_id: string;
  contact_name: string;
  stellar_public_key: string;
  created_at: string;
  updated_at: string;
}

export interface Operation {
  id: string;
  user_id: string;
  type: string;
  status: string;
  amount?: number;
  asset_code?: string;
  context?: string;
  stellar_transaction_hash?: string;
  destination_key?: string;
  source_public_key?: string;
  source_session_id?: string;
  destination_session_id?: string;
  created_at: string;
  updated_at: string;
}
