export interface PasskeyWalletRecord {
  id: string;
  user_id?: string;
  email?: string;
  contract_id: string;       // Soroban smart wallet contract address
  key_id_base64: string;     // WebAuthn credential ID (base64url)
  network: string;           // testnet | mainnet
  label?: string;
  funded: boolean;
  created_at: string;
}

export interface PasskeyWalletCreateInput {
  user_id?: string;
  email?: string;
  contract_id: string;
  key_id_base64: string;
  network: string;
  label?: string;
}
