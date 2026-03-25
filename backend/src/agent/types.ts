/**
 * Agent state types for LangGraph workflow
 */

export interface SessionData {
  session_token: string;
  user_id: string;
  email: string;
  public_key?: string;
  phone_number?: string;
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
    memo?: string;
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
  CONTACTS = "contacts",
  PAYMENT = "payment",
  BALANCE = "balance",
  HISTORY = "history",
  PIX = "pix",
  GENERAL = "general",
}

export enum ActionType {
  LOGIN_USER = "login_user",
  CREATE_ACCOUNT = "create_account",
  CREATE_WALLET = "create_wallet",
  LOGOUT_WALLET = "logout_wallet",
  LIST_CONTACTS = "list_contacts",
  ADD_CONTACT = "add_contact",
  GET_BALANCE = "get_account_balance",
  GET_HISTORY = "get_operations_history",
  LOOKUP_CONTACT = "lookup_contact",
  BUILD_PAYMENT = "build_payment_xdr",
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
