/**
 * Agent state types for LangGraph workflow
 */

export interface SessionData {
  session_token: string;
  user_id: string;
  email: string;
  public_key?: string;
  phone_number?: string;
  pix_key?: string;
  password_hash?: string;
  session_password_hash?: string;
  email_verified?: boolean;
  email_verified_at?: string;
  email_verification_source?: string;
  created_at: string;
  last_activity: string;
}

export interface AgentState {
  // Session context
  session_id: string;
  session_data: SessionData | null;
  
  // Message flow
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  current_input: string;
  
  // Intent and action tracking
  detected_intent: IntentType;
  action_type: ActionType;
  action_params: Record<string, any>;
  
  // Wallet creation tracking
  wallet_info?: {
    publicKey: string;
    secretKey?: string;
    email?: string;
    phoneNumber?: string;
    createdAt: string;
  };
  waiting_for_wallet_input?: boolean;
  
  // Payment tracking (if applicable)
  pending_payment?: {
    xdr?: string;
    destination: string;
    amount: string;
    asset_code: string;
    destination_name?: string;
    destination_contact?: {
      id?: string;
      owner_id?: string;
      contact_name?: string;
      stellar_public_key?: string;
      public_key?: string;
      created_at?: string;
      updated_at?: string;
    };
    memo?: string;
  };

  pending_conversion?: {
    source_asset_code: string;
    source_asset_issuer?: string;
    source_amount?: string;
    dest_asset_code: string;
    dest_asset_issuer?: string;
    dest_amount: string;
    quote?: any;
  };

  pending_pix_ramp?: {
    direction: 'onramp' | 'offramp';
    flow?: 'fund_wallet' | 'fund_and_pay';
    amount_currency?: 'BRL' | 'USDC';
    asset_code: 'BRL' | 'USDC';
    recipient_query?: string;
    created_at?: string;
  };
  
  // Response
  response_message: string;
  success: boolean;
  error?: string;
}

export enum IntentType {
  LOGIN = "login",
  ONBOARD = "onboard",
  WALLET = "wallet",
  WALLET_LOGOUT = "wallet_logout",
  RESET_PIN = "reset_pin",
  CONTACTS = "contacts",
  PAYMENT = "payment",
  PAYMENT_LINK = "payment_link",
  BALANCE = "balance",
  HISTORY = "history",
  FINANCIAL_MEMORY = "financial_memory",
  CONVERSION = "conversion",
  PRICE_QUOTE = "price_quote",
  PIX = "pix",
  YIELD = "yield",
  GENERAL = "general",
}

export enum ActionType {
  LOGIN_USER = "login_user",
  CREATE_ACCOUNT = "create_account",
  CREATE_WALLET = "create_wallet",
  LOGOUT_WALLET = "logout_wallet",
  RESET_PIN = "reset_pin",
  LIST_CONTACTS = "list_contacts",
  ADD_CONTACT = "add_contact",
  GET_BALANCE = "get_account_balance",
  GET_HISTORY = "get_operations_history",
  GET_FINANCIAL_MEMORY = "get_financial_memory",
  CONVERT_ASSETS = "convert_assets",
  GET_PRICE_QUOTE = "get_price_quote",
  MANAGE_YIELD = "manage_yield",
  LOOKUP_CONTACT = "lookup_contact",
  BUILD_PAYMENT = "build_payment_xdr",
  CREATE_PAYMENT_LINK = "create_payment_link",
  SIGN_PAYMENT = "sign_and_submit_xdr",
  BUILD_PATH_PAYMENT = "build_path_payment_xdr",
  INITIATE_PIX = "initiate_pix_deposit",
  CHECK_PIX = "check_deposit_status",
  NONE = "none",
}

export interface AgentResponse {
  message: string;
  task: string;
  params: Record<string, any>;
  success: boolean;
}
