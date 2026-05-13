/**
 * Stellar Blockchain Tools for TalkToStellar Agent
 * Functions that the LLM can call to perform blockchain operations
 */

import { z } from "zod";
import { getStellarService } from "../services/stellar.service";
import { StellarService as ApiStellarService } from "../api/services/stellar.service";
import { UserService } from "../api/services/user.service";
import { PinResetService } from "../services/pin-reset.service";
import PasskeyService from "../services/passkey.service";
import { logger } from "../utils/logger";
import { supabase } from "../config/supabase";
import { WalletRepository } from "../repositories/wallet.repository";
import VaultService from "../services/vault.service";
import ExternalService from "../services/external.service";
import { getAssetIssuer, normalizeAssetCode, resolveConfiguredAsset } from "../config/assets";
import { ContactSeedService, repairLegacyStarterContactKey } from "../api/services/contact-seed.service";
import { BalanceAlertService } from "../api/services/balance-alert.service";
import { AutoConversionService } from "../api/services/auto-conversion.service";
import { DEFAULT_NETWORK_FEE_XLM, buildUnifiedFeeDisplay, formatCustomerAssetAmount, formatNetworkFeeForCustomer } from "../utils/fee-display";
import { TransferNotificationService } from "../api/services/transfer-notification.service";
import { PaymentReceiptService, PaymentReceiptInput } from "../api/services/payment-receipt.service";
import { attachQuoteExpiry, quoteTtlSeconds } from "../api/services/quote-expiry.service";
import { ActivityFeedService } from "../api/services/activity-feed.service";
import { FinancialInsightsService } from "../api/services/financial-insights.service";
import { SmartContactsService } from "../api/services/smart-contacts.service";
import { PaymentReplayService } from "../api/services/payment-replay.service";
import { EconomyEngineService } from "../api/services/economy-engine.service";
import { PlatformFeeService } from "../api/services/platform-fee.service";
import { InvoiceService } from "../api/services/invoice.service";
import { GlobalProfileService } from "../api/services/global-profile.service";

const stellarService = getStellarService();
const walletRepo = new WalletRepository(supabase);
const vaultService = new VaultService(supabase);

function getAssetCode(value: any): string {
  if (value?.asset_type === 'native') return 'XLM';
  return String(value?.asset_code || value?.asset || 'UNKNOWN').toUpperCase();
}

function normalizeAssetInput(code: any, issuer: any) {
  return resolveConfiguredAsset(code || 'XLM', issuer);
}

function formatQuotePath(path: Array<{ code?: string; type?: string }>): string {
  if (!Array.isArray(path) || path.length === 0) {
    return 'rota direta';
  }

  return `rota otimizada em ${path.length + 1} etapas`;
}

function formatBrl(value: number): string {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(value) ? value : 0);
}

async function fetchBrlUsdcQuote(): Promise<{
  source: string;
  symbol: string;
  brlPerUsdc: string;
  usdcPerBrl: string;
  fetchedAt: string;
}> {
  const source = String(process.env.BRL_USDC_QUOTE_SOURCE || 'binance').trim().toLowerCase();
  const symbol = String(process.env.BRL_USDC_QUOTE_SYMBOL || 'USDCBRL').trim().toUpperCase();
  const timeoutMs = Number(process.env.BRL_USDC_QUOTE_TIMEOUT_MS || 8000);

  const parsePrice = (rawPrice: unknown) => {
    const price = Number(String(rawPrice || '').trim());
    if (!Number.isFinite(price) || price <= 0) {
      throw new Error('Resposta de cotação inválida da fonte externa.');
    }
    const inverse = 1 / price;
    return {
      brlPerUsdc: price.toFixed(8),
      usdcPerBrl: inverse.toFixed(8),
    };
  };

  const fetchWithTimeout = async (endpoint: string) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Number.isFinite(timeoutMs) ? timeoutMs : 8000);
    try {
      const response = await fetch(endpoint, {
        method: 'GET',
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      });
      const body = await response.text();
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${body.slice(0, 160)}`);
      }
      return JSON.parse(body);
    } finally {
      clearTimeout(timeout);
    }
  };

  const tryBinance = async () => {
    const endpoint = `https://api.binance.com/api/v3/ticker/price?symbol=${encodeURIComponent(symbol)}`;
    const payload = await fetchWithTimeout(endpoint) as { symbol?: string; price?: string };
    const parsed = parsePrice(payload?.price);
    return {
      source: 'binance',
      symbol: String(payload?.symbol || symbol).toUpperCase(),
      ...parsed,
      fetchedAt: new Date().toISOString(),
    };
  };

  const tryAwesomeApi = async () => {
    const payload = await fetchWithTimeout('https://economia.awesomeapi.com.br/json/last/USD-BRL') as {
      USDBRL?: { bid?: string; ask?: string; create_date?: string };
    };
    const parsed = parsePrice(payload?.USDBRL?.bid || payload?.USDBRL?.ask);
    return {
      source: 'awesomeapi',
      symbol: 'USDBRL',
      ...parsed,
      fetchedAt: payload?.USDBRL?.create_date || new Date().toISOString(),
    };
  };

  const tryFrankfurter = async () => {
    const payload = await fetchWithTimeout('https://api.frankfurter.app/latest?from=USD&to=BRL') as {
      rates?: { BRL?: number };
      date?: string;
    };
    const parsed = parsePrice(payload?.rates?.BRL);
    return {
      source: 'frankfurter',
      symbol: 'USDBRL',
      ...parsed,
      fetchedAt: new Date().toISOString(),
    };
  };

  const providers = source === 'binance'
    ? [tryBinance, tryAwesomeApi, tryFrankfurter]
    : source === 'awesomeapi'
      ? [tryAwesomeApi, tryFrankfurter, tryBinance]
      : source === 'frankfurter'
        ? [tryFrankfurter, tryAwesomeApi, tryBinance]
        : [tryBinance, tryAwesomeApi, tryFrankfurter];

  const errors: string[] = [];
  for (const provider of providers) {
    try {
      return await provider();
    } catch (error: any) {
      errors.push(error?.message || String(error));
    }
  }

  throw new Error(`Cotação indisponível nas fontes configuradas: ${errors.join(' | ')}`);
}

/**
 * Tool definitions for OpenAI function calling
 */
export const toolDefinitions = [
  {
    name: "get_intent_help",
    description: "Mostra os principais comandos/intents disponíveis no TalkToStellar com explicações curtas em pt-BR.",
    parameters: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "get_brl_usdc_quote",
    description: "Get the current BRL-USDC market quote in real time from configured external source. Returns both BRL per 1 USDC and USDC per 1 BRL.",
    parameters: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "send_receipt_image",
    description: "Gera a imagem premium do comprovante da última operação concluída do usuário e entrega no canal atual (web chat ou Telegram). Não retorna link de confirmação.",
    parameters: {
      type: "object",
      properties: {
        session_id: { type: "string", description: "Sessão atual do usuário." },
        user_id: { type: "string", description: "Usuário atual." },
        provider: { type: "string", description: "Canal atual, por exemplo web ou telegram." },
        provider_user_id: { type: "string", description: "ID do usuário no canal externo, quando houver." },
      },
      required: ["session_id"],
    },
  },
  {
    name: "create_wallet",
    description: "Create a new Stellar wallet or link an existing public key to the user account",
    parameters: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Wallet display name",
        },
        email: {
          type: "string",
          description: "User's email address",
        },
        phone_number: {
          type: "string",
          description: "User's phone number",
        },
        public_key: {
          type: "string",
          description: "Existing Stellar public key to link",
        },
        secret_key: {
          type: "string",
          description: "Existing Stellar import credential for wallet import/login",
        },
      },
      required: [],
    },
  },
  {
    name: "get_balance",
    description: "Get the user-facing wallet balance summary. Returns BRL and USDC by default, not the full technical asset list. If public_key is missing, resolves from current session.",
    parameters: {
      type: "object",
      properties: {
        session_id: {
          type: "string",
          description: "Current chat session ID. Used to resolve wallet public key automatically.",
        },
        public_key: {
          type: "string",
          description: "Stellar public key to check balance for",
        },
      },
      required: [],
    },
  },
  {
    name: "get_account",
    description: "Get technical account details and the full asset balance list for advanced inspection. If public_key is missing, resolves from current session.",
    parameters: {
      type: "object",
      properties: {
        session_id: {
          type: "string",
          description: "Current chat session ID. Used to resolve wallet public key automatically.",
        },
        public_key: {
          type: "string",
          description: "Stellar public key to look up",
        },
      },
      required: [],
    },
  },
  {
    name: "get_saldo_tecnico",
    description: "Get technical wallet balances focused on XLM, USDC, and BRL (with issuer details). If public_key is missing, resolves from current session.",
    parameters: {
      type: "object",
      properties: {
        session_id: {
          type: "string",
          description: "Current chat session ID. Used to resolve wallet public key automatically.",
        },
        public_key: {
          type: "string",
          description: "Stellar public key to inspect technical balances for",
        },
      },
      required: [],
    },
  },
  {
    name: "build_payment",
    description: "Internal low-level helper to build a Stellar payment XDR. Do not use for normal user chat payment requests; use prepare_payment_confirmation so the user gets a frontend confirmation link.",
    parameters: {
      type: "object",
      properties: {
        source_public_key: {
          type: "string",
          description: "Your Stellar public key (sender)",
        },
        destination: {
          type: "string",
          description: "Destination Stellar public key (receiver)",
        },
        amount: {
          type: "string",
          description: "Amount to send (e.g., '10.5')",
        },
        asset_code: {
          type: "string",
          description: "Asset code to send. Defaults to XLM.",
        },
        asset_issuer: {
          type: "string",
          description: "Issuer public key for non-native assets.",
        },
        memo: {
          type: "string",
          description: "Optional memo for the transaction",
        },
      },
      required: ["source_public_key", "destination", "amount"],
    },
  },
  {
    name: "quote_asset_transfer",
    description: "Preview a real cross-currency transfer or wallet conversion using live quote data, including source amount, destination amount, customer-facing fee, and route. For user-facing conversions, follow this with prepare_conversion_confirmation so the user gets a frontend confirmation link.",
    parameters: {
      type: "object",
      properties: {
        source_public_key: {
          type: "string",
          description: "Sender Stellar public key",
        },
        destination: {
          type: "string",
          description: "Destination Stellar public key. Use the sender public key for internal conversion.",
        },
        dest_amount: {
          type: "string",
          description: "Amount the destination should receive",
        },
        source_amount: {
          type: "string",
          description: "Amount of source asset to spend. If provided, quote uses strict-send semantics.",
        },
        dest_asset_code: {
          type: "string",
          description: "Destination asset code, e.g. XLM, USDC, BRL",
        },
        dest_asset_issuer: {
          type: "string",
          description: "Destination asset issuer public key for non-XLM assets",
        },
        source_asset_code: {
          type: "string",
          description: "Source asset code, e.g. XLM, USDC, BRL",
        },
        source_asset_issuer: {
          type: "string",
          description: "Source asset issuer public key for non-XLM assets",
        },
      },
      required: ["source_public_key", "destination", "dest_amount", "dest_asset_code", "source_asset_code"],
    },
  },
  {
    name: "convert_assets",
    description: "Convert assets inside the user's own wallet using a real Stellar path payment to self. Uses the current session wallet and the configured issuers for XLM, USDC, and BRL.",
    parameters: {
      type: "object",
      properties: {
        session_id: {
          type: "string",
          description: "Current chat session ID",
        },
        user_id: {
          type: "string",
          description: "Current user ID",
        },
        dest_amount: {
          type: "string",
          description: "Amount of destination asset to receive",
        },
        source_amount: {
          type: "string",
          description: "Amount of source asset to spend. If provided, conversion uses strict-send semantics.",
        },
        dest_asset_code: {
          type: "string",
          description: "Destination asset code, e.g. XLM, USDC, BRL",
        },
        dest_asset_issuer: {
          type: "string",
          description: "Destination asset issuer public key for non-XLM assets",
        },
        source_asset_code: {
          type: "string",
          description: "Source asset code, e.g. XLM, USDC, BRL",
        },
        source_asset_issuer: {
          type: "string",
          description: "Source asset issuer public key for non-XLM assets",
        },
      },
      required: ["session_id", "user_id", "dest_amount", "dest_asset_code", "source_asset_code"],
    },
  },
  {
    name: "ensure_trustline",
    description: "Create a trustline for USDC, BRL, or another issued Stellar asset in the current session wallet.",
    parameters: {
      type: "object",
      properties: {
        session_id: {
          type: "string",
          description: "Current chat session ID",
        },
        user_id: {
          type: "string",
          description: "Current user ID",
        },
        public_key: {
          type: "string",
          description: "Wallet public key",
        },
        asset_code: {
          type: "string",
          description: "Asset code, e.g. USDC or BRL",
        },
        asset_issuer: {
          type: "string",
          description: "Issuer public key for non-XLM assets",
        },
      },
      required: ["session_id", "user_id", "public_key", "asset_code"],
    },
  },
  {
    name: "prepare_payment_confirmation",
    description: "Create a one-time frontend payment confirmation link for a confirmed recipient and amount. Use this for normal user chat payment requests instead of build_payment.",
    parameters: {
      type: "object",
      properties: {
        amount: {
          type: "string",
          description: "Amount to send (e.g. '10.5')",
        },
        asset_code: {
          type: "string",
          description: "Asset code to send. Defaults to XLM.",
        },
        asset_issuer: {
          type: "string",
          description: "Issuer public key for non-native assets.",
        },
        destination: {
          type: "string",
          description: "Recipient Stellar public key",
        },
        destination_name: {
          type: "string",
          description: "Recipient display name",
        },
        session_id: {
          type: "string",
          description: "Current chat session ID",
        },
        owner_id: {
          type: "string",
          description: "Current user ID / owner ID",
        },
        quote: {
          type: "object",
          description: "Optional quote details returned by quote_asset_transfer, used to show estimated fee before confirmation.",
        },
      },
      required: ["amount", "destination", "session_id", "owner_id"],
    },
  },
  {
    name: "prepare_conversion_confirmation",
    description: "Create a one-time frontend conversion confirmation link for a wallet self-conversion. Use this for normal user chat conversion requests after quoting.",
    parameters: {
      type: "object",
      properties: {
        session_id: {
          type: "string",
          description: "Current chat session ID",
        },
        owner_id: {
          type: "string",
          description: "Current user ID",
        },
        source_amount: {
          type: "string",
          description: "Exact source amount to spend (strict-send).",
        },
        source_asset_code: {
          type: "string",
          description: "Source asset code (XLM, USDC, BRL).",
        },
        source_asset_issuer: {
          type: "string",
          description: "Source asset issuer for non-native assets.",
        },
        dest_amount: {
          type: "string",
          description: "Destination amount expected from quote.",
        },
        dest_asset_code: {
          type: "string",
          description: "Destination asset code (XLM, USDC, BRL).",
        },
        dest_asset_issuer: {
          type: "string",
          description: "Destination asset issuer for non-native assets.",
        },
        quote: {
          type: "object",
          description: "Optional quote details to embed in token context.",
        },
      },
      required: ["session_id", "owner_id", "dest_amount", "source_asset_code", "dest_asset_code"],
    },
  },
  {
    name: "submit_transaction",
    description: "Submit a signed transaction to the Stellar network",
    parameters: {
      type: "object",
      properties: {
        signed_xdr: {
          type: "string",
          description: "Signed transaction in XDR format",
        },
      },
      required: ["signed_xdr"],
    },
  },
  {
    name: "get_transaction_history",
    description: "Get recent Stellar transaction history for an account, including multi-asset amounts and estimated USDC/BRL values when available",
    parameters: {
      type: "object",
      properties: {
        session_id: {
          type: "string",
          description: "Current chat session ID. Used to resolve wallet public key automatically.",
        },
        public_key: {
          type: "string",
          description: "Stellar public key to get history for",
        },
        limit: {
          type: "number",
          description: "Maximum number of transactions to return (default 10)",
        },
      },
      required: [],
    },
  },
  {
    name: "get_financial_memory",
    description: "Retrieve contextual financial memory and conversational analytics from payment logs: repeat-payment candidates, recipient insights, monthly received totals, fee totals, top payer, average quote rates, and estimated savings vs traditional providers.",
    parameters: {
      type: "object",
      properties: {
        session_id: {
          type: "string",
          description: "Current chat session ID.",
        },
        user_id: {
          type: "string",
          description: "Current user ID.",
        },
        mode: {
          type: "string",
          description: "recent_payments, repeat_payment, monthly_conversion, average_quote, monthly_received, monthly_fees, top_payer, traditional_savings, recipient_insights, risk_alert, treasury_advice, or summary.",
        },
        contact_name: {
          type: "string",
          description: "Optional counterparty/contact name to match for repeat payments.",
        },
      },
      required: [],
    },
  },
  {
    name: "get_activity_feed",
    description: "Lista o feed inteligente de atividade financeira (pagamentos, conversões, cobranças, economia em taxas, lembretes).",
    parameters: {
      type: "object",
      properties: {
        session_id: { type: "string", description: "Sessão atual do usuário." },
        user_id: { type: "string", description: "Usuário atual (opcional)." },
        limit: { type: "number", description: "Quantidade máxima de itens no feed." },
      },
      required: [],
    },
  },
  {
    name: "get_financial_insights",
    description: "Gera e retorna insights financeiros automáticos: economia estimada, média de cotação, volume convertido e destaques do mês.",
    parameters: {
      type: "object",
      properties: {
        session_id: { type: "string", description: "Sessão atual do usuário." },
        user_id: { type: "string", description: "Usuário atual (opcional)." },
        limit: { type: "number", description: "Quantidade máxima de insights retornados." },
      },
      required: [],
    },
  },
  {
    name: "resolve_smart_contact",
    description: "Resolve um contato financeiro usando contexto conversacional (nome amigável, apelido, função ou tags).",
    parameters: {
      type: "object",
      properties: {
        session_id: { type: "string", description: "Sessão atual do usuário." },
        user_id: { type: "string", description: "Usuário atual (opcional)." },
        query: { type: "string", description: "Texto do usuário para localizar contato." },
      },
      required: ["query"],
    },
  },
  {
    name: "find_payment_replay_candidate",
    description: "Encontra um pagamento anterior e gera confirmação segura para repetir com um toque.",
    parameters: {
      type: "object",
      properties: {
        session_id: { type: "string", description: "Sessão atual do usuário." },
        user_id: { type: "string", description: "Usuário atual (opcional)." },
        query_context: { type: "string", description: "Mensagem original para contexto do replay." },
      },
      required: [],
    },
  },
  {
    name: "get_savings_estimate",
    description: "Mostra economia estimada do mês comparada a métodos tradicionais (média de mercado).",
    parameters: {
      type: "object",
      properties: {
        session_id: { type: "string", description: "Sessão atual do usuário." },
        user_id: { type: "string", description: "Usuário atual (opcional)." },
      },
      required: [],
    },
  },
  {
    name: "get_savings_identity",
    description: "Responde determinísticamente quanto o usuário economizou hoje, no mês, no lifetime, quanto teria pago por métodos tradicionais, e a operação de maior economia.",
    parameters: {
      type: "object",
      properties: {
        session_id: { type: "string", description: "Sessão atual do usuário." },
        user_id: { type: "string", description: "Usuário atual (opcional)." },
        period: { type: "string", description: "today, month ou lifetime." },
        view: { type: "string", description: "summary, traditional_cost ou biggest_operation." },
      },
      required: [],
    },
  },
  {
    name: "get_savings_comparison",
    description: "Compara o custo efetivo do usuário no TalkToStellar com o custo estimado em bancos/provedores tradicionais. Resposta financeira e informativa, sem aconselhamento.",
    parameters: {
      type: "object",
      properties: {
        session_id: { type: "string", description: "Sessão atual do usuário." },
        user_id: { type: "string", description: "Usuário atual (opcional)." },
        period: { type: "string", description: "today, month ou lifetime." },
      },
      required: [],
    },
  },
  {
    name: "create_invoice",
    description: "Cria cobrança/invoice simples com link de pagamento compartilhável.",
    parameters: {
      type: "object",
      properties: {
        session_id: { type: "string", description: "Sessão atual do usuário." },
        user_id: { type: "string", description: "Usuário atual (opcional)." },
        recipient_name: { type: "string", description: "Nome do cliente/destinatário." },
        title: { type: "string", description: "Título da cobrança." },
        description: { type: "string", description: "Descrição da cobrança." },
        amount: { type: "string", description: "Valor da cobrança." },
        currency: { type: "string", description: "Moeda da cobrança (USD/BRL)." },
        due_date: { type: "string", description: "Vencimento em ISO date." },
      },
      required: ["recipient_name", "amount"],
    },
  },
  {
    name: "get_or_create_global_profile",
    description: "Cria ou retorna o link global público do usuário para receber pagamentos.",
    parameters: {
      type: "object",
      properties: {
        session_id: { type: "string", description: "Sessão atual do usuário." },
        user_id: { type: "string", description: "Usuário atual (opcional)." },
        username: { type: "string", description: "Sugestão de username." },
        display_name: { type: "string", description: "Nome público." },
        bio: { type: "string", description: "Bio curta do perfil." },
      },
      required: [],
    },
  },
  {
    name: "add_contact",
    description: "Add a new contact with their Stellar public key or TalkToStellar transfer key",
    parameters: {
      type: "object",
      properties: {
        session_id: {
          type: "string",
          description: "Current chat session ID. Used to resolve current user automatically.",
        },
        user_id: {
          type: "string",
          description: "Your user ID",
        },
        contact_name: {
          type: "string",
          description: "Name for the contact",
        },
        public_key: {
          type: "string",
          description: "Contact's Stellar public key",
        },
        pix_key: {
          type: "string",
          description: "Contact's TalkToStellar transfer key",
        },
        contact_key: {
          type: "string",
          description: "Generic contact key: transfer key, email, phone, CPF or public key reference",
        },
      },
      required: [],
    },
  },
  {
    name: "list_contacts",
    description: "Get all saved contacts for the user",
    parameters: {
      type: "object",
      properties: {
        session_id: {
          type: "string",
          description: "Current chat session ID. Used to resolve current user automatically.",
        },
        user_id: {
          type: "string",
          description: "Your user ID",
        },
      },
      required: [],
    },
  },
  {
    name: "list_wallets_and_contacts",
    description: "List all wallets with wallet name and related contacts",
    parameters: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  {
    name: "restart_onboarding",
    description: "Restart the onboarding process. Allows user to set/reset PIN and passkey. Use when user explicitly wants to register or needs to set up security credentials.",
    parameters: {
      type: "object",
      properties: {
        session_id: {
          type: "string",
          description: "Current chat session ID",
        },
        user_id: {
          type: "string",
          description: "Current user ID (can be empty if new user)",
        },
        email: {
          type: "string",
          description: "User's email (optional)",
        },
        phone_number: {
          type: "string",
          description: "User's phone number (optional)",
        },
        pin: {
          type: "string",
          description: "4-8 digit PIN to set/reset",
        },
        request_passkey: {
          type: "boolean",
          description: "Whether user wants to set up a passkey (true/false)",
        },
      },
      required: ["session_id", "pin"],
    },
  },
  {
    name: "reset_pin",
    description: "Request a PIN reset. Generates a temporary link (valid 15 minutes) to change your PIN if you forgot it.",
    parameters: {
      type: "object",
      properties: {
        session_id: {
          type: "string",
          description: "Current chat session ID",
        },
        user_id: {
          type: "string",
          description: "Current user ID (optional; will be resolved automatically from session when missing)",
        },
      },
      required: ["session_id"],
    },
  },
  {
    name: "logout_session",
    description: "Logout da sessão atual do usuário, encerrando o contexto ativo do chat/wallet.",
    parameters: {
      type: "object",
      properties: {
        session_id: {
          type: "string",
          description: "Current chat session ID",
        },
      },
      required: ["session_id"],
    },
  },
];

/**
 * Execute a tool function
 */
export async function executeTool(
  toolName: string,
  toolInput: Record<string, any>
): Promise<string> {
  try {
    logger.info(`Tool call: ${toolName} ${JSON.stringify(toolInput || {})}`);
    switch (toolName) {
      case "get_intent_help":
        return executeGetIntentHelp();
      case "get_brl_usdc_quote":
        return await executeGetBrlUsdcQuote();
      case "send_receipt_image":
        return await executeSendReceiptImage(toolInput);
      case "create_wallet":
        return await executeCreateWallet(toolInput);
      case "get_balance":
        return await executeGetBalance(toolInput);
      case "get_account":
        return await executeGetAccount(toolInput);
      case "get_saldo_tecnico":
        return await executeGetSaldoTecnico(toolInput);
      case "build_payment":
        return await executeBuildPayment(toolInput);
      case "quote_asset_transfer":
        return await executeQuoteAssetTransfer(toolInput);
      case "convert_assets":
        return await executeConvertAssets(toolInput);
      case "ensure_trustline":
        return await executeEnsureTrustline(toolInput);
      case "prepare_payment_confirmation":
        return await executePreparePaymentConfirmation(toolInput);
      case "prepare_conversion_confirmation":
        return await executePrepareConversionConfirmation(toolInput);
      case "submit_transaction":
        return await executeSubmitTransaction(toolInput);
      case "get_transaction_history":
        return await executeGetHistory(toolInput);
      case "get_financial_memory":
        return await executeGetFinancialMemory(toolInput);
      case "get_activity_feed":
        return await executeGetActivityFeed(toolInput);
      case "get_financial_insights":
        return await executeGetFinancialInsights(toolInput);
      case "resolve_smart_contact":
        return await executeResolveSmartContact(toolInput);
      case "find_payment_replay_candidate":
        return await executeFindPaymentReplayCandidate(toolInput);
      case "get_savings_estimate":
        return await executeGetSavingsEstimate(toolInput);
      case "get_savings_identity":
        return await executeGetSavingsIdentity(toolInput);
      case "get_savings_comparison":
        return await executeGetSavingsComparison(toolInput);
      case "create_invoice":
        return await executeCreateInvoice(toolInput);
      case "get_or_create_global_profile":
        return await executeGetOrCreateGlobalProfile(toolInput);
      case "add_contact":
        return await executeAddContact(toolInput);
      case "list_contacts":
        return await executeListContacts(toolInput);
      case "list_wallets_and_contacts":
        return await executeListWalletsAndContacts();
      case "restart_onboarding":
        return await executeRestartOnboarding(toolInput);
      case "reset_pin":
        return await executeResetPin(toolInput);
      case "logout_session":
        return await executeLogoutSession(toolInput);
      case "set_alert_threshold":
        return await executeSetAlertThreshold(toolInput);
      case "get_conversion_rules":
        return await executeGetConversionRules(toolInput);
      case "disable_conversion_rule":
        return await executeDisableConversionRule(toolInput);
      default:
        return JSON.stringify({
          success: false,
          error: `Unknown tool: ${toolName}`,
        });
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Tool execution error in ${toolName}: ${errorMessage}`);
    return JSON.stringify({
      success: false,
      error: errorMessage,
    });
  }
}

function executeGetIntentHelp(): string {
  const commands = [
    {
      command: "saldo",
      intent: "balance",
      description: "Mostra o saldo disponível em R$ e US$.",
      examples: ["ver saldo", "qual meu saldo?"],
    },
    {
      command: "contatos",
      intent: "contacts",
      description: "Lista ou salva destinatários da carteira.",
      examples: ["listar contatos", "adiciona Ana pelo email ana@example.com"],
    },
    {
      command: "enviar",
      intent: "payment",
      description: "Cria um link seguro de confirmação para enviar dinheiro a um contato ou chave pública.",
      examples: ["mandar 50 dólares para Juliana Lima"],
    },
    {
      command: "converter",
      intent: "conversion",
      description: "Cota e cria confirmação para converter saldo entre R$ e US$.",
      examples: ["converter 10 us$ para r$"],
    },
    {
      command: "cotação",
      intent: "price_quote",
      description: "Consulta a cotação atual de dólar/real usada pela experiência.",
      examples: ["cotação do dólar agora"],
    },
    {
      command: "histórico",
      intent: "history",
      description: "Mostra pagamentos e operações recentes.",
      examples: ["ver histórico", "últimas transações"],
    },
    {
      command: "comparativo de economia",
      intent: "savings_comparison",
      description: "Compara o que você pagou aqui vs estimativa de bancos/métodos tradicionais.",
      examples: ["quanto economizei vs bancos?", "savings comparison month"],
    },
    {
      command: "link de pagamento",
      intent: "payment_link",
      description: "Cria um link para alguém receber ou pagar sem escolher um contato antes.",
      examples: ["criar link de pagamento de 20 dólares"],
    },
    {
      command: "PIN",
      intent: "reset_pin",
      description: "Gera um link para redefinir o PIN quando você esquecer ou quiser trocar.",
      examples: ["esqueci meu PIN", "redefinir PIN"],
    },
  ];

  return JSON.stringify({
    success: true,
    commands,
    message: [
      "Guia rápido TalkToStellar (o que você pode fazer agora):",
      "1) saldo: ver dinheiro disponível em R$ e US$.",
      "2) contatos: listar ou salvar destinatários.",
      "3) enviar: fazer pagamento com confirmação segura.",
      "4) converter: trocar R$ e US$ com cotação atual.",
      "5) histórico: revisar operações recentes.",
      "6) link de pagamento: gerar link para cobrar/receber.",
      "7) comparativo de economia: ver quanto já economizou vs métodos tradicionais.",
      "",
      "Comandos disponíveis:",
      ...commands.map((item, index) =>
        `${index + 1}. ${item.command}: ${item.description} Exemplo: "${item.examples[0]}".`
      ),
      "",
      "Exemplos prontos:",
      "- \"enviar 10 dólares para Ana\"",
      "- \"converter 200 reais para dólar\"",
      "- \"criar link de pagamento de 50 dólares\"",
      "- \"quanto economizei vs bancos?\"",
      "",
      "Se preferir, me diga seu objetivo em uma frase e eu te guio passo a passo.",
    ].join("\n"),
  });
}

async function executeGetBrlUsdcQuote(): Promise<string> {
  try {
    const quote = await fetchBrlUsdcQuote();
    const observedAt = quote.fetchedAt || new Date().toISOString();

    try {
      await supabase
        .from('currency_rate_history')
        .insert({
          base_currency: 'USD',
          quote_currency: 'BRL',
          rate: Number(quote.brlPerUsdc),
          source: quote.source,
          observed_at: observedAt,
          metadata: {
            symbol: quote.symbol,
            usdc_per_brl: quote.usdcPerBrl,
          },
        });
    } catch (persistError) {
      logger.warn(`[fx-rate] could not persist USD/BRL quote: ${persistError instanceof Error ? persistError.message : String(persistError)}`);
    }

    return JSON.stringify({
      success: true,
      source: quote.source,
      symbol: quote.symbol,
      brl_per_usdc: quote.brlPerUsdc,
      usdc_per_brl: quote.usdcPerBrl,
      fetched_at: quote.fetchedAt,
      message:
        `Cotação atual (${quote.source.toUpperCase()}): ` +
        `1 US$ = R$ ${quote.brlPerUsdc} | ` +
        `1 R$ = US$ ${quote.usdcPerBrl}.`,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return JSON.stringify({
      success: false,
      error: errorMessage,
    });
  }
}

async function executeLogoutSession(input: any): Promise<string> {
  try {
    const sessionId = String(input.session_id || '').trim();
    if (!sessionId) {
      return JSON.stringify({
        success: false,
        error: "session_id é obrigatório",
      });
    }

    const { data: sessionBeforeLogout } = await supabase
      .from('agent_sessions')
      .select('user_id')
      .eq('session_id', sessionId)
      .maybeSingle();

    // Do not delete agent_sessions row; agent_messages references session_id via FK.
    // Deleting here causes subsequent message persistence to fail in the same request flow.
    const { error } = await supabase
      .from('agent_sessions')
      .update({
        public_key: null,
        session_token: crypto.randomUUID(),
        last_activity: new Date().toISOString(),
      })
      .eq('session_id', sessionId);

    if (error) {
      throw new Error(error.message || 'Falha ao encerrar sessão');
    }

    void TransferNotificationService.notifySessionLogout({
      sessionId,
      userId: String((sessionBeforeLogout as any)?.user_id || ''),
    });

    // Clear runtime state tied to wallet/payment context.
    await supabase
      .from('agent_states')
      .update({
        action_params: { force_logged_out: true },
        pending_payment: null,
        updated_at: new Date().toISOString(),
      })
      .eq('session_id', sessionId);

    const { error: unlinkError } = await supabase
      .from('external_accounts')
      .update({
        session_id: null,
        user_id: null,
        updated_at: new Date().toISOString(),
      })
      .eq('session_id', sessionId);

    if (unlinkError) {
      const message = String(unlinkError.message || '').toLowerCase();
      if (!message.includes('external_accounts') && !message.includes('schema cache') && !message.includes('does not exist')) {
        throw new Error(unlinkError.message || 'Falha ao desvincular sessão externa');
      }
    }

    return JSON.stringify({
      success: true,
      message: "Sessão encerrada com sucesso. Você pode entrar novamente quando quiser.",
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return JSON.stringify({
      success: false,
      error: errorMessage,
    });
  }
}

async function executeSetAlertThreshold(input: any): Promise<string> {
  const walletId = Number(input.wallet_id || input.walletId);
  const threshold = Number(input.threshold_usdc || input.thresholdUsdc || input.threshold);
  const success = await BalanceAlertService.setAlertThreshold(walletId, threshold);
  return JSON.stringify({
    success,
    wallet_id: walletId,
    threshold_usdc: threshold,
  });
}

async function executeGetConversionRules(input: any): Promise<string> {
  const walletId = Number(input.wallet_id || input.walletId);
  const rules = await AutoConversionService.getWalletConversionRules(walletId);
  return JSON.stringify({
    success: true,
    wallet_id: walletId,
    rules: (rules || []).map((rule: any) => ({
      id: rule.id,
      from_asset: rule.from_asset_code,
      to_asset: rule.to_asset_code,
      min_amount: rule.min_amount,
      trigger: rule.trigger_type,
      enabled: rule.enabled,
    })),
  });
}

async function executeDisableConversionRule(input: any): Promise<string> {
  const ruleId = String(input.rule_id || input.ruleId || '').trim();
  const success = await AutoConversionService.disableConversionRule(ruleId);
  return JSON.stringify({
    success,
    rule_id: ruleId,
  });
}

/**
 * Tool: Create Wallet
 */
async function executeCreateWallet(input: any): Promise<string> {
  try {
    logger.debug("Tool: Creating wallet/account");
    const result = await UserService.onboardUser({
      name: input.name,
      email: input.email,
      phoneNumber: input.phone_number,
      publicKey: input.public_key,
      secretKey: input.secret_key,
    });
    return JSON.stringify({
      success: true,
      user_id: result.userId,
      public_key: result.publicKey,
      message: input.secret_key
        ? "Account imported successfully!"
        : "Account linked successfully!",
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return JSON.stringify({
      success: false,
      error: errorMessage,
    });
  }
}

/**
 * Tool: Get Balance
 */
async function executeGetBalance(input: any): Promise<string> {
  try {
    const publicKey = await resolveToolPublicKey(input);
    logger.debug(`Tool: Getting balance for ${publicKey}`);
    const account = await stellarService.getAccount(publicKey);

    const visibleAssets = ['BRL', 'USDC'];
    const balances = account.balances.map((balance: any) => {
      const asset = getAssetCode(balance);
      return {
        asset,
        balance: balance.balance,
        asset_type: balance.asset_type,
        asset_issuer: balance.asset_issuer,
      };
    });

    const filteredBalances = visibleAssets.map((asset) => balances.find((balance: any) => balance.asset === asset) || {
      asset,
      balance: '0.0000000',
      asset_type: asset === 'BRL' || asset === 'USDC' ? 'credit_alphanum4' : 'native',
      asset_issuer: undefined,
    });
    return JSON.stringify({
      success: true,
      public_key: publicKey,
      balance: filteredBalances[0]?.balance || "0.0000000",
      asset: filteredBalances[0]?.asset || "BRL",
      balances: filteredBalances,
      message: `User-facing balances retrieved: ${filteredBalances.length} asset(s)`,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return JSON.stringify({
      success: false,
      error: errorMessage,
    });
  }
}

/**
 * Tool: Get Account
 */
async function executeGetAccount(input: any): Promise<string> {
  try {
    const publicKey = await resolveToolPublicKey(input);
    logger.debug(`Tool: Getting account details for ${publicKey}`);
    const account = await stellarService.getAccount(publicKey);
    const balances = account.balances.map((b: any) => ({
      asset: getAssetCode(b),
      balance: b.balance,
      type: b.asset_type,
      asset_issuer: b.asset_issuer,
    }));
    return JSON.stringify({
      success: true,
      account_id: account.id,
      sequence: account.sequence,
      balances,
      technical_balances: balances,
      message: "Account details retrieved",
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return JSON.stringify({
      success: false,
      error: errorMessage,
    });
  }
}

async function executeGetSaldoTecnico(input: any): Promise<string> {
  try {
    const publicKey = await resolveToolPublicKey(input);
    logger.debug(`Tool: Getting technical balances for ${publicKey}`);
    const account = await stellarService.getAccount(publicKey);

    const mappedBalances = account.balances.map((balance: any) => ({
      asset: getAssetCode(balance),
      balance: String(balance.balance || '0.0000000'),
      type: balance.asset_type,
      asset_issuer: balance.asset_issuer,
    }));

    const balanceByAsset = new Map<string, any>();
    for (const item of mappedBalances) {
      balanceByAsset.set(String(item.asset || '').toUpperCase(), item);
    }

    const technicalAssets = ['XLM', 'USDC', 'BRL'].map((assetCode) => {
      const existing = balanceByAsset.get(assetCode);
      if (existing) return existing;
      return {
        asset: assetCode,
        balance: '0.0000000',
        type: assetCode === 'XLM' ? 'native' : 'credit_alphanum4',
        asset_issuer: assetCode === 'XLM' ? undefined : getAssetIssuer(assetCode),
      };
    });

    return JSON.stringify({
      success: true,
      public_key: publicKey,
      account_id: account.id,
      sequence: account.sequence,
      balances: technicalAssets,
      message: "Technical balances retrieved for XLM, USDC, BRL",
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return JSON.stringify({
      success: false,
      error: errorMessage,
    });
  }
}

/**
 * Tool: Build Payment
 */
async function executeBuildPayment(input: any): Promise<string> {
  try {
    logger.debug(`Tool: Building payment from ${input.source_public_key} to ${input.destination}`);
    const assetCode = input.asset_code || input.assetCode || "XLM";
    const xdr = await stellarService.buildPayment(
      input.source_public_key,
      {
        destination: input.destination,
        amount: input.amount,
        asset_code: assetCode,
        asset_issuer: input.asset_issuer || input.assetIssuer,
      },
      input.memo
    );
    return JSON.stringify({
      success: true,
      xdr,
      asset_code: assetCode,
      message: `Payment transaction built: ${input.amount} ${assetCode} to ${input.destination}. Must be signed and submitted.`,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return JSON.stringify({
      success: false,
      error: errorMessage,
    });
  }
}

/**
 * Tool: Quote Asset Transfer
 */
async function executeQuoteAssetTransfer(input: any): Promise<string> {
  try {
    const sourceAmount = input.source_amount || input.sourceAmount;
    const quote = sourceAmount
      ? await ApiStellarService.quoteStrictSendConversion({
          sourcePublicKey: String(input.source_public_key || input.sourcePublicKey || ''),
          destination: String(input.destination || ''),
          sourceAmount: String(sourceAmount),
          destAsset: normalizeAssetInput(input.dest_asset_code || input.destAssetCode, input.dest_asset_issuer || input.destAssetIssuer),
          sourceAsset: normalizeAssetInput(input.source_asset_code || input.sourceAssetCode, input.source_asset_issuer || input.sourceAssetIssuer),
        })
      : await ApiStellarService.quotePathPayment({
          sourcePublicKey: String(input.source_public_key || input.sourcePublicKey || ''),
          destination: String(input.destination || ''),
          destAmount: String(input.dest_amount || input.destAmount || input.amount || ''),
          destAsset: normalizeAssetInput(input.dest_asset_code || input.destAssetCode, input.dest_asset_issuer || input.destAssetIssuer),
          sourceAsset: normalizeAssetInput(input.source_asset_code || input.sourceAssetCode, input.source_asset_issuer || input.sourceAssetIssuer),
        });
    const feeDisplay = await formatNetworkFeeForCustomer(quote.networkFeeXlm);
    const unifiedFee = buildUnifiedFeeDisplay({
      networkFee: feeDisplay,
      platformFeeAmount: quote.platformFee?.feeAmount || null,
      platformFeeAssetCode: quote.platformFee?.feeAssetCode || null,
      sourceAssetCode: quote.sourceAsset?.code,
      destinationAssetCode: quote.destinationAsset?.code,
    });
    const expiringQuote = attachQuoteExpiry({
      ...quote,
      fee_display: unifiedFee.display,
      fee_usdc: unifiedFee.fee_usdc,
      fee_brl: unifiedFee.fee_brl,
    });
    const sourceLabel = formatCustomerAssetAmount(expiringQuote.sourceAmount, expiringQuote.sourceAsset.code);
    const destinationLabel = formatCustomerAssetAmount(expiringQuote.destinationAmount, expiringQuote.destinationAsset.code);

    return JSON.stringify({
      success: true,
      quote: expiringQuote,
      quote_expires_at: expiringQuote.quote_expires_at,
      quote_ttl_seconds: expiringQuote.quote_ttl_seconds,
      message:
        (sourceAmount
          ? `Cotação antes de confirmar: ${sourceLabel} deve entregar aproximadamente ${destinationLabel}. `
          : `Cotação antes de confirmar: para receber ${destinationLabel}, será usado ${sourceLabel}. `) +
        `Rota usada: ${formatQuotePath(quote.path)}. ` +
        `Taxa estimada total: ${unifiedFee.display}. ` +
        `Cotação válida por ${expiringQuote.quote_ttl_seconds} segundos.`,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return JSON.stringify({
      success: false,
      error: errorMessage,
    });
  }
}

/**
 * Tool: Convert Assets Internally
 */
async function executeConvertAssets(input: any): Promise<string> {
  try {
    const sessionId = String(input.session_id || input.sessionId || '');
    const userId = String(input.user_id || input.userId || '');
    const wallet = await walletRepo.getWalletBySession(sessionId);

    if (!wallet?.public_key || !wallet?.vault_secret_id) {
      throw new Error('Wallet signing configuration not found for this session.');
    }

    const quoteInput = {
      sourcePublicKey: wallet.public_key,
      destination: wallet.public_key,
      destAmount: String(input.dest_amount || input.destAmount || input.amount || ''),
      sourceAmount: String(input.source_amount || input.sourceAmount || ''),
      destAsset: normalizeAssetInput(input.dest_asset_code || input.destAssetCode, input.dest_asset_issuer || input.destAssetIssuer),
      sourceAsset: normalizeAssetInput(input.source_asset_code || input.sourceAssetCode, input.source_asset_issuer || input.sourceAssetIssuer),
    };

    const usesStrictSend = Boolean(quoteInput.sourceAmount);
    const quote = usesStrictSend
      ? await ApiStellarService.quoteStrictSendConversion({
          sourcePublicKey: quoteInput.sourcePublicKey,
          destination: quoteInput.destination,
          sourceAmount: quoteInput.sourceAmount,
          destAsset: quoteInput.destAsset,
          sourceAsset: quoteInput.sourceAsset,
        })
      : await ApiStellarService.quotePathPayment(quoteInput);
    const unsignedXdr = usesStrictSend
      ? await ApiStellarService.buildStrictSendConversionXdr({
          sourcePublicKey: quoteInput.sourcePublicKey,
          destination: quoteInput.destination,
          sourceAmount: quoteInput.sourceAmount,
          destAsset: quoteInput.destAsset,
          sourceAsset: quoteInput.sourceAsset,
        })
      : await ApiStellarService.buildPathPaymentXdr(quoteInput);
      const operationType = usesStrictSend ? 'PATH_PAYMENT_STRICT_SEND' : 'PATH_PAYMENT_STRICT_RECEIVE';
    const secretKey = await vaultService.getSecret(String(wallet.vault_secret_id));
    const result = await ApiStellarService.signAndSubmitXdr(
      userId,
      secretKey,
      unsignedXdr,
      {
        user_id: userId,
          type: operationType,
        destination_key: wallet.public_key,
        asset_code: quote.destinationAsset.code,
        amount: Number(quote.destinationAmount),
        context:
            `Conversão interna real: ${quote.sourceAmount} ${quote.sourceAsset.code} ` +
            `para ${quote.destinationAmount} ${quote.destinationAsset.code}.`,
        source_public_key: wallet.public_key,
        source_session_id: wallet.session_id,
        destination_session_id: wallet.session_id,
      }
    );

    if (!result.success) {
      return JSON.stringify({
        success: false,
        quote,
        error: result.error || 'Could not submit conversion',
      });
    }

    const submittedDetails = result.hash
      ? await ApiStellarService.getSubmittedPaymentDetails(result.hash)
      : null;
    const sourceAmount = submittedDetails?.sourceAmount || quote.sourceAmount;
    const sourceAssetCode = submittedDetails?.sourceAssetCode || quote.sourceAsset.code;
    const destinationAmount = submittedDetails?.destinationAmount || quote.destinationAmount;
    const destinationAssetCode = submittedDetails?.destinationAssetCode || quote.destinationAsset.code;
    const feeDisplay = await formatNetworkFeeForCustomer(submittedDetails?.feeXlm || quote.networkFeeXlm);
    const unifiedFee = buildUnifiedFeeDisplay({
      networkFee: feeDisplay,
      platformFeeAmount: quote.platformFee?.feeAmount || null,
      platformFeeAssetCode: quote.platformFee?.feeAssetCode || null,
      sourceAssetCode: sourceAssetCode,
      destinationAssetCode: destinationAssetCode,
    });
    const feeLine = submittedDetails?.feeXlm || quote.networkFeeXlm
      ? ` Taxa total: ${unifiedFee.display}.`
      : ` Taxa total: R$ 0,00 / US$ 0,00.`;
    const sourceLabel = formatCustomerAssetAmount(sourceAmount, sourceAssetCode);
    const destinationLabel = formatCustomerAssetAmount(destinationAmount, destinationAssetCode);

    return JSON.stringify({
      success: true,
      hash: result.hash,
      quote: {
        ...quote,
        fee_display: unifiedFee.display,
        fee_usdc: unifiedFee.fee_usdc,
        fee_brl: unifiedFee.fee_brl,
      },
      transferDetails: submittedDetails ? {
        ...submittedDetails,
        feeDisplay: unifiedFee.display,
        feeUsdc: unifiedFee.fee_usdc,
        feeBrl: unifiedFee.fee_brl,
        platformFeeDisplay: null,
        totalFeeDisplay: unifiedFee.display,
      } : submittedDetails,
      operation_type: operationType,
      message:
        `${sourceLabel} convertidos para ${destinationLabel} em poucos segundos.` +
        `${feeLine} Recibo disponível no seu histórico.`,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return JSON.stringify({
      success: false,
      error: errorMessage,
    });
  }
}

async function executeEnsureTrustline(input: any): Promise<string> {
  try {
    const sessionId = String(input.session_id || input.sessionId || '').trim();
    const userId = String(input.user_id || input.userId || '').trim();
    const requestedPublicKey = String(input.public_key || input.publicKey || '').trim();
    const asset = normalizeAssetInput(input.asset_code || input.assetCode || input.asset, input.asset_issuer || input.assetIssuer);

    if (asset.code === 'XLM') {
      return JSON.stringify({ success: true, asset_code: 'XLM' });
    }

    if (!asset.issuer) {
      throw new Error(`${asset.code}_ISSUER não está configurado no backend.`);
    }

    const wallet = sessionId
      ? await walletRepo.getWalletBySession(sessionId)
      : await walletRepo.getWalletByPublicKey(requestedPublicKey);

    if (!wallet?.public_key || !wallet?.vault_secret_id) {
      throw new Error('Wallet signing configuration not found for this session.');
    }

    const publicKey = requestedPublicKey || wallet.public_key;
    if (wallet.public_key !== publicKey) {
      throw new Error('A chave pública informada não pertence à sessão atual.');
    }

    const balances = await ApiStellarService.getAccountBalance(publicKey);
    const hasTrustline = balances.some((balance: any) =>
      String(balance.asset_code || '').toUpperCase() === asset.code &&
      String(balance.asset_issuer || '') === asset.issuer
    );

    if (hasTrustline) {
      return JSON.stringify({
        success: true,
        asset_code: asset.code,
        asset_issuer: asset.issuer,
        message: `Trustline de ${asset.code} já está ativa.`,
      });
    }

    const trustlineXdr = await ApiStellarService.buildTrustlineXdr({
      sourcePublicKey: publicKey,
      assetCode: asset.code,
      assetIssuer: asset.issuer,
    });
    const secretKey = await vaultService.getSecret(String(wallet.vault_secret_id));
    const result = await ApiStellarService.signAndSubmitXdr(
      userId,
      secretKey,
      trustlineXdr,
      {
        user_id: userId,
        type: 'TRUSTLINE',
        asset_code: asset.code,
        source_public_key: publicKey,
        source_session_id: wallet.session_id,
        context: `Trustline ${asset.code}`,
      }
    );

    if (!result.success) {
      return JSON.stringify({
        success: false,
        asset_code: asset.code,
        asset_issuer: asset.issuer,
        error: result.error || `Could not create ${asset.code} trustline`,
      });
    }

    return JSON.stringify({
      success: true,
      asset_code: asset.code,
      asset_issuer: asset.issuer,
      hash: result.hash,
      message: `Trustline de ${asset.code} criada.`,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return JSON.stringify({
      success: false,
      error: errorMessage,
    });
  }
}

/**
 * Tool: Prepare Payment Confirmation
 */
async function executePreparePaymentConfirmation(input: any): Promise<string> {
  try {
    logger.debug(`Tool: Preparing payment confirmation for ${input.amount} to ${input.destination}`);
    const externalService = new ExternalService(supabase as any);

    // Accept several possible parameter names for the recipient public key
    const destinationCandidate =
      input.destination ||
      input.public_key_recipient ||
      input.recipient_public_key ||
      input.public_key ||
      input.recipient ||
      undefined;

    let normalizedDestination = destinationCandidate ? String(destinationCandidate).trim() : '';
    normalizedDestination = repairLegacyStarterContactKey(normalizedDestination);
    const quote = input.quote && typeof input.quote === 'object' ? input.quote : null;
    const destinationAmount = input.destination_amount || input.destinationAmount || quote?.destinationAmount;
    const normalizedAmount = destinationAmount
      ? String(destinationAmount).trim()
      : (input.amount ? String(input.amount).trim() : '');

    // Resolve a friendly name for the destination when possible
    let destinationName: string | undefined = input.destination_name ? String(input.destination_name).trim() : undefined;
    if (!destinationName && input.destination_contact && (input.destination_contact.contact_name || input.destination_contact.name)) {
      destinationName = input.destination_contact.contact_name || input.destination_contact.name;
    }

    if (normalizedDestination && !/^G[A-Z2-7]{55}$/i.test(normalizedDestination)) {
      const resolvedByPix = await resolveContactPublicKeyByPixKey(normalizedDestination);
      if (resolvedByPix.publicKey) {
        normalizedDestination = resolvedByPix.publicKey;
        destinationName = destinationName || resolvedByPix.name || normalizedDestination;
      }
    }

    if (!destinationName && normalizedDestination) {
      try {
        const { data: contactRows, error } = await supabase
          .from('contacts')
          .select('contact_name, stellar_public_key, pix_key')
          .eq('stellar_public_key', normalizedDestination)
          .limit(1);
        if (!error && contactRows && contactRows.length > 0) {
          destinationName = contactRows[0].contact_name || undefined;
        }
      } catch (err) {
        // ignore lookup failures
      }
    }

    const assetCode = normalizeAssetCode(
      input.destination_asset_code ||
      input.destinationAssetCode ||
      quote?.destinationAsset?.code ||
      input.asset_code ||
      input.asset ||
      input.currency ||
      'XLM'
    );
    const asset = normalizeAssetInput(
      assetCode,
      input.destination_asset_issuer ||
      input.destinationAssetIssuer ||
      quote?.destinationAsset?.issuer ||
      input.asset_issuer ||
      input.assetIssuer
    );
    const sourceAssetCodeForFee = String(quote?.sourceAsset?.code || input.source_asset_code || input.sourceAssetCode || asset.code).trim().toUpperCase();
    const destinationAssetCodeForFee = String(quote?.destinationAsset?.code || asset.code).trim().toUpperCase();
    const platformFee = quote?.platformFee || PlatformFeeService.calculateSpread({
      sourceAmount: normalizedAmount,
      sourceAssetCode: sourceAssetCodeForFee,
      destinationAssetCode: destinationAssetCodeForFee,
      mode: 'add_on_top',
    });
    const estimatedNetworkFeeXlm = quote?.networkFeeXlm || input.estimated_fee_xlm || DEFAULT_NETWORK_FEE_XLM;
    const networkFee = await formatNetworkFeeForCustomer(estimatedNetworkFeeXlm);
    const unifiedFee = buildUnifiedFeeDisplay({
      networkFee,
      platformFeeAmount: platformFee?.feeAmount || null,
      platformFeeAssetCode: platformFee?.feeAssetCode || null,
      sourceAssetCode: sourceAssetCodeForFee,
      destinationAssetCode: destinationAssetCodeForFee,
    });
    const totalFeeDisplay = unifiedFee.display || 'US$ indisponivel';
    const quoteValidityLine = quote?.quote_expires_at
      ? `Cotação válida por ${quote?.quote_ttl_seconds || quoteTtlSeconds()} segundos. `
      : '';

    const { url } = await externalService.createPaymentConfirmUrl({
      amount: normalizedAmount,
      asset_code: asset.code,
      asset_issuer: asset.issuer,
      destination: normalizedDestination,
      destination_name: destinationName,
      destination_contact: input.destination_contact || undefined,
      session_id: String(input.session_id),
      owner_id: String(input.owner_id),
    }, {
      estimated_fee_display: unifiedFee.display,
      estimated_fee_usdc: unifiedFee.fee_usdc || null,
      estimated_fee_brl: unifiedFee.fee_brl || null,
      estimated_platform_fee: null,
      estimated_platform_fee_amount: null,
      estimated_platform_fee_asset_code: null,
      estimated_spread_fee: null,
      quote: quote || null,
      quote_issued_at: quote?.quote_issued_at || null,
      quote_expires_at: quote?.quote_expires_at || null,
      quote_ttl_seconds: quote?.quote_ttl_seconds || quoteTtlSeconds(),
      source_amount: input.source_amount || input.sourceAmount || quote?.sourceAmount || null,
      source_asset_code: input.source_asset_code || input.sourceAssetCode || quote?.sourceAsset?.code || null,
      source_asset_issuer: input.source_asset_issuer || input.sourceAssetIssuer || quote?.sourceAsset?.issuer || null,
      destination_amount: input.destination_amount || input.destinationAmount || quote?.destinationAmount || normalizedAmount,
      destination_asset_code: input.destination_asset_code || input.destinationAssetCode || quote?.destinationAsset?.code || asset.code,
      destination_asset_issuer: input.destination_asset_issuer || input.destinationAssetIssuer || quote?.destinationAsset?.issuer || asset.issuer || null,
    });

    return JSON.stringify({
      success: true,
      url,
      asset: asset.code,
      estimated_fee_display: unifiedFee.display,
      estimated_platform_fee: null,
      message:
        `Antes de confirmar: taxa estimada total ${totalFeeDisplay}. ` +
        quoteValidityLine +
        `Para confirmar o envio para ${destinationName || normalizedDestination}, abra o link:\n\n${url}`,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return JSON.stringify({
      success: false,
      error: errorMessage,
    });
  }
}

async function executePrepareConversionConfirmation(input: any): Promise<string> {
  try {
    logger.debug(`Tool: Preparing conversion confirmation for session ${input.session_id}`);
    const externalService = new ExternalService(supabase as any);

    const sourceAsset = normalizeAssetInput(
      input.source_asset_code || input.sourceAssetCode || 'XLM',
      input.source_asset_issuer || input.sourceAssetIssuer
    );
    const destAsset = normalizeAssetInput(
      input.dest_asset_code || input.destAssetCode || 'XLM',
      input.dest_asset_issuer || input.destAssetIssuer
    );

    const sourceAmount = String(input.source_amount || input.sourceAmount || '').trim() || undefined;
    const destAmount = String(input.dest_amount || input.destAmount || input.amount || '').trim();
    const networkFee = await formatNetworkFeeForCustomer(input.quote?.networkFeeXlm || DEFAULT_NETWORK_FEE_XLM);
    const unifiedFee = buildUnifiedFeeDisplay({
      networkFee,
      platformFeeAmount: input.quote?.platformFee?.feeAmount || null,
      platformFeeAssetCode: input.quote?.platformFee?.feeAssetCode || null,
      sourceAssetCode: sourceAsset.code,
      destinationAssetCode: destAsset.code,
    });

    const { url } = await externalService.createConversionConfirmUrlWithContext({
      session_id: String(input.session_id || input.sessionId || '').trim(),
      owner_id: String(input.owner_id || input.ownerId || '').trim(),
      source_amount: sourceAmount,
      source_asset_code: sourceAsset.code,
      source_asset_issuer: sourceAsset.issuer,
      dest_amount: destAmount,
      dest_asset_code: destAsset.code,
      dest_asset_issuer: destAsset.issuer,
      quote: input.quote || null,
    }, {
      estimated_fee_display: unifiedFee.display,
      estimated_fee_usdc: unifiedFee.fee_usdc || null,
      estimated_fee_brl: unifiedFee.fee_brl || null,
      estimated_platform_fee: null,
      estimated_spread_fee: null,
      quote_issued_at: input.quote?.quote_issued_at || null,
      quote_expires_at: input.quote?.quote_expires_at || null,
      quote_ttl_seconds: input.quote?.quote_ttl_seconds || quoteTtlSeconds(),
    });

    return JSON.stringify({
      success: true,
      url,
      estimated_fee_display: unifiedFee.display,
      estimated_platform_fee: null,
      estimated_spread_fee: null,
      quote_expires_at: input.quote?.quote_expires_at || null,
      quote_ttl_seconds: input.quote?.quote_ttl_seconds || quoteTtlSeconds(),
      message:
        `Antes de confirmar: taxa estimada total ${unifiedFee.display || 'indisponível'}. ` +
        `Cotação válida por ${input.quote?.quote_ttl_seconds || quoteTtlSeconds()} segundos. ` +
        `Para confirmar a conversão, abra:\n\n${url}`,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return JSON.stringify({
      success: false,
      error: errorMessage,
    });
  }
}

/**
 * Tool: Submit Transaction
 */
async function executeSubmitTransaction(input: any): Promise<string> {
  try {
    logger.debug("Tool: Submitting signed transaction");
    const txHash = await stellarService.submitTransaction(input.signed_xdr);
    return JSON.stringify({
      success: true,
      transaction_hash: txHash,
      message: 'Operação enviada com sucesso.',
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return JSON.stringify({
      success: false,
      error: errorMessage,
    });
  }
}

/**
 * Tool: Get History
 */
async function executeGetHistory(input: any): Promise<string> {
  try {
    const publicKey = await resolveToolPublicKey(input);
    logger.debug(`Tool: Getting transaction history for ${publicKey}`);
    const operations = await stellarService.getOperationHistory(
      publicKey,
      input.limit || 10
    );

    const formattedOps = await Promise.all(operations.map(async (op: any) => {
      const asset = getAssetCode(op);
      const amount = op.amount || op.starting_balance || op.source_amount || op.amount_in || op.amount_out;
      const from = op.from || op.source_account || op.funder || op.account;
      const to = op.to || op.account || op.into;
      const direction = to === publicKey ? 'received' : from === publicKey ? 'sent' : 'related';
      const counterpartyKey = direction === 'received' ? from : to;
      const counterpartyLabel = await TransferNotificationService.resolveHumanLabel({
        publicKey: String(counterpartyKey || '').trim() || undefined,
      });

      return {
        id: op.id,
        type: op.type,
        date: op.created_at,
        counterparty: counterpartyLabel || 'contato não identificado',
        direction,
        asset,
        amount: amount ? String(amount) : undefined,
        asset_issuer: op.asset_issuer,
      };
    }));
    return JSON.stringify({
      success: true,
      public_key: publicKey,
      transaction_count: operations.length,
      transactions: formattedOps,
      message: `Found ${operations.length} transactions`,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return JSON.stringify({
      success: false,
      error: errorMessage,
    });
  }
}

async function executeGetFinancialMemory(input: any): Promise<string> {
  try {
    const userId = await resolveToolUserId(input);
    const sessionId = String(input.session_id || input.sessionId || '').trim();
    const mode = String(input.mode || 'summary').trim().toLowerCase();
    const contactName = String(input.contact_name || input.contactName || '').trim();
    let ownPublicKey = '';
    try {
      ownPublicKey = await resolveToolPublicKey(input);
    } catch {
      ownPublicKey = '';
    }

    let query = supabase
      .from('payment_logs')
      .select('*')
      .eq('user_id', userId)
      .order('completed_at', { ascending: false })
      .limit(100);

    if (sessionId) {
      query = query.eq('session_id', sessionId);
    }

    const { data, error } = await query;
    if (error) {
      throw new Error(error.message || 'Falha ao carregar memória financeira');
    }

    const rows = Array.isArray(data) ? data : [];
    const successful = rows.filter((row: any) => isSuccessfulPaymentRow(row));
    const normalizedContact = normalizeMemoryText(contactName);
    const recentPayments = successful
      .filter((row: any) => !isConversionOperation(row))
      .map((row: any) => summarizePaymentLog(row));
    const matchingPayments = normalizedContact
      ? recentPayments.filter((payment) => normalizeMemoryText(`${payment.counterparty} ${payment.destinationPublicKey}`).includes(normalizedContact))
      : recentPayments;
    const lastPayment = matchingPayments[0] || recentPayments[0] || null;

    const { start: monthStart, end: monthEnd } = monthDateRange();
    const monthlyConversions = successful.filter((row: any) => {
      const operation = String(row.operation_type || '').toUpperCase();
      const completedAt = Date.parse(String(row.completed_at || row.created_at || ''));
      return operation.includes('CONVERSION') && Number.isFinite(completedAt) && completedAt >= monthStart.getTime();
    });
    const conversionSummary = summarizeConversions(monthlyConversions);
    const recipientInsights = summarizeRecipientInsights(successful, ownPublicKey);

    const monthlyRows = successful.filter((row: any) => {
      const ms = paymentCompletedAtMs(row);
      return ms >= monthStart.getTime() && ms < monthEnd.getTime();
    });

    const monthlyReceivedRows = monthlyRows.filter((row: any) => inferDirection(row, ownPublicKey) === 'received');
    const monthlyReceivedTotal = monthlyReceivedRows.reduce((sum, row) => sum + toNumber(row.destination_amount || row.source_amount), 0);
    const monthlyReceivedAsset = String(monthlyReceivedRows[0]?.destination_asset_code || monthlyReceivedRows[0]?.source_asset_code || 'USDC').toUpperCase();
    const monthlyReceivedLabel = formatCustomerAssetAmount(String(monthlyReceivedTotal.toFixed(2)), monthlyReceivedAsset);

    const monthlyFeeXlm = monthlyRows.reduce((sum, row) => sum + toNumber(row.fee_xlm), 0);
    const monthlyFeeDisplay = (await formatNetworkFeeForCustomer(monthlyFeeXlm.toFixed(7))).display || null;

    const topPayerMap = new Map<string, { label: string; count: number; total: number; asset: string }>();
    for (const row of monthlyReceivedRows) {
      const label = inferCounterpartyLabel(row, 'received');
      const key = normalizeMemoryText(label) || String(row?.source_public_key || '');
      const current = topPayerMap.get(key) || {
        label,
        count: 0,
        total: 0,
        asset: String(row?.destination_asset_code || row?.source_asset_code || 'USDC').toUpperCase(),
      };
      current.count += 1;
      current.total += toNumber(row.destination_amount || row.source_amount);
      topPayerMap.set(key, current);
    }
    const topPayer = Array.from(topPayerMap.values()).sort((a, b) => b.total - a.total)[0];
    const topPayerPayload = topPayer
      ? {
          ...topPayer,
          totalLabel: formatCustomerAssetAmount(String(topPayer.total.toFixed(2)), topPayer.asset || 'USDC'),
        }
      : null;

    let actualFeeEstimate = 0;
    let traditionalFeeEstimate = 0;
    let estimatedSavings = 0;
    for (const row of successful) {
      const direction = inferDirection(row, ownPublicKey);
      if (direction !== 'sent') continue;
      const metadata = row?.metadata || {};
      const savedSavings = metadata?.savings || {};
      const grossBrl = toNumber(savedSavings.gross_amount_brl || metadata.gross_amount_brl);
      const rowActualFee = toNumber(savedSavings.actual_fee || metadata.actual_fee_brl || metadata.fee_brl || row.fee_brl || row.fee_usdc || row.fee_xlm);
      const rowTraditionalFee = toNumber(savedSavings.estimated_traditional_fee) ||
        (grossBrl > 0 ? grossBrl * EconomyEngineService.traditionalFeePct() : 0);
      const rowSavings = toNumber(savedSavings.estimated_savings) ||
        Math.max(0, rowTraditionalFee - rowActualFee);
      actualFeeEstimate += rowActualFee;
      traditionalFeeEstimate += rowTraditionalFee;
      estimatedSavings += rowSavings;
    }
    const savingsDisplay = new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(estimatedSavings);
    const walletFiat = await getWalletFiatBalances(sessionId);
    const fxChange = await getUsdBrlMonthlyChange();
    const behavior = classifyTreasuryBehavior(successful, ownPublicKey);
    const brlInUsd = fxChange.latestRate && walletFiat.brl > 0 ? walletFiat.brl / fxChange.latestRate : 0;
    const totalUsdEquivalent = walletFiat.usd + brlInUsd;
    const usdRatio = totalUsdEquivalent > 0 ? walletFiat.usd / totalUsdEquivalent : 0;
    const riskThresholdPct = Number(process.env.TREASURY_RISK_THRESHOLD_PCT || 2.5);
    const hasFxRisk = Number.isFinite(fxChange.changePct as any) && (fxChange.changePct as number) >= riskThresholdPct && walletFiat.brl > 0;

    if (sessionId && userId) {
      await supabase
        .from('treasury_profiles')
        .upsert({
          session_id: sessionId,
          user_id: userId,
          target_usd_ratio: Number((behavior.receivesMostlyUsd && behavior.spendsMostlyBrl ? 0.65 : 0.5).toFixed(2)),
          risk_threshold_pct: riskThresholdPct,
          metadata: {
            latest_usd_brl: fxChange.latestRate,
            month_change_pct: fxChange.changePct,
            usd_ratio: usdRatio,
            receives_usd_count: behavior.receivesUsdCount,
            spends_brl_count: behavior.spendsBrlCount,
          },
          updated_at: new Date().toISOString(),
        }, { onConflict: 'session_id' });
    }

    if (mode === 'monthly_received') {
      return JSON.stringify({
        success: true,
        mode,
        count: monthlyReceivedRows.length,
        received_total: monthlyReceivedTotal,
        received_asset: monthlyReceivedAsset,
        received_label: monthlyReceivedLabel,
        message: `Neste mês você recebeu ${monthlyReceivedLabel} em ${monthlyReceivedRows.length} operação(ões).`,
      });
    }

    if (mode === 'monthly_fees') {
      return JSON.stringify({
        success: true,
        mode,
        total_fee_xlm: monthlyFeeXlm,
        total_fee_display: monthlyFeeDisplay,
        message: monthlyFeeDisplay
          ? `Neste mês você pagou ${monthlyFeeDisplay} em taxas de rede.`
          : 'Neste mês as taxas de rede estão indisponíveis.',
      });
    }

    if (mode === 'top_payer') {
      return JSON.stringify({
        success: true,
        mode,
        top_payer: topPayerPayload,
        message: topPayerPayload
          ? `${topPayerPayload.label} é quem mais te paga: ${topPayerPayload.count} recebimento(s), total ${topPayerPayload.totalLabel}.`
          : 'Ainda não encontrei recebimentos suficientes para identificar quem mais te paga.',
      });
    }

    if (mode === 'traditional_savings') {
      return JSON.stringify({
        success: true,
        mode,
        actual_fee_estimate: actualFeeEstimate,
        traditional_fee_estimate: traditionalFeeEstimate,
        estimated_savings: estimatedSavings,
        savings_display: savingsDisplay,
        message: `Economia estimada em relação a métodos tradicionais: ${savingsDisplay} no período.`,
      });
    }

    if (mode === 'recipient_insights') {
      const recipients = recipientInsights.slice(0, 12);
      return JSON.stringify({
        success: true,
        mode,
        recipients,
        message: recipients.length
          ? `Sugestões contextuais prontas para uso: ${recipients.slice(0, 3).map((item) => item.label).join(', ')}.`
          : 'Ainda não há histórico suficiente para sugerir favoritos e recorrências.',
      });
    }

    if (mode === 'risk_alert') {
      const message = hasFxRisk
        ? `Seu saldo em reais perdeu ${Number(fxChange.changePct || 0).toFixed(1)}% frente ao dólar neste mês. Deseja proteger parte do saldo?`
        : `Risco cambial controlado no momento. Variação do dólar no mês: ${fxChange.changePct ? Number(fxChange.changePct).toFixed(1) : '0.0'}%.`;

      if (sessionId && userId) {
        await supabase.from('treasury_recommendations').insert({
          session_id: sessionId,
          user_id: userId,
          recommendation_type: 'risk_alert',
          risk_score: hasFxRisk ? Math.min(100, Math.max(0, Number(fxChange.changePct || 0) * 10)) : 20,
          suggested_action: hasFxRisk ? 'protect_partial_balance' : 'hold',
          payload: {
            change_pct: fxChange.changePct,
            latest_rate: fxChange.latestRate,
            brl_balance: walletFiat.brl,
            usd_balance: walletFiat.usd,
            usd_ratio: usdRatio,
          },
        });
      }

      return JSON.stringify({
        success: true,
        mode,
        fx_change_pct: fxChange.changePct,
        latest_rate: fxChange.latestRate,
        brl_balance: walletFiat.brl,
        usd_balance: walletFiat.usd,
        usd_ratio: usdRatio,
        message,
      });
    }

    if (mode === 'treasury_advice') {
      const suggestions: string[] = [];
      if (behavior.receivesMostlyUsd && behavior.spendsMostlyBrl) {
        suggestions.push('Você costuma receber em dólar e gastar em reais. Posso otimizar conversões automaticamente.');
      }
      if (hasFxRisk && usdRatio < 0.55) {
        suggestions.push('Sugestão: proteger 20% a 35% do saldo em reais em dólar para reduzir volatilidade.');
      } else if (!hasFxRisk && usdRatio > 0.75) {
        suggestions.push('Sugestão: manter maior parte em dólar e converter apenas o necessário para gastos em reais.');
      } else {
        suggestions.push('Sugestão: manter uma alocação equilibrada entre R$ e US$ conforme seu fluxo de gastos.');
      }
      suggestions.push(`Melhor momento (agora): USD/BRL em ${fxChange.latestRate ? fxChange.latestRate.toFixed(2) : 'indisponível'}.`);

      if (sessionId && userId) {
        await supabase.from('treasury_recommendations').insert({
          session_id: sessionId,
          user_id: userId,
          recommendation_type: 'treasury_advice',
          risk_score: hasFxRisk ? 70 : 35,
          suggested_action: hasFxRisk ? 'convert_brl_to_usd_partial' : 'hold_or_gradual_convert',
          payload: {
            change_pct: fxChange.changePct,
            latest_rate: fxChange.latestRate,
            brl_balance: walletFiat.brl,
            usd_balance: walletFiat.usd,
            usd_ratio: usdRatio,
            behavior,
            suggestions,
          },
        });
      }

      return JSON.stringify({
        success: true,
        mode,
        behavior,
        fx_change_pct: fxChange.changePct,
        latest_rate: fxChange.latestRate,
        brl_balance: walletFiat.brl,
        usd_balance: walletFiat.usd,
        usd_ratio: usdRatio,
        suggestions,
        message: suggestions.join(' '),
      });
    }

    return JSON.stringify({
      success: true,
      mode,
      user_id: userId,
      recent_payments: recentPayments.slice(0, 10),
      last_payment: lastPayment,
      monthly_conversion: conversionSummary,
      recipient_insights: recipientInsights.slice(0, 12),
      monthly_received: {
        count: monthlyReceivedRows.length,
        total: monthlyReceivedTotal,
        asset: monthlyReceivedAsset,
        label: monthlyReceivedLabel,
      },
      monthly_fees: {
        total_fee_xlm: monthlyFeeXlm,
        total_fee_display: monthlyFeeDisplay,
      },
      top_payer: topPayerPayload,
      traditional_savings: {
        actual_fee_estimate: actualFeeEstimate,
        traditional_fee_estimate: traditionalFeeEstimate,
        estimated_savings: estimatedSavings,
        savings_display: savingsDisplay,
      },
      treasury: {
        fx_change_pct: fxChange.changePct,
        latest_usd_brl: fxChange.latestRate,
        brl_balance: walletFiat.brl,
        usd_balance: walletFiat.usd,
        usd_ratio: usdRatio,
        has_fx_risk: hasFxRisk,
      },
      message: buildFinancialMemoryMessage(mode, lastPayment, conversionSummary, recentPayments),
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return JSON.stringify({
      success: false,
      error: errorMessage,
    });
  }
}

async function executeGetActivityFeed(input: any): Promise<string> {
  try {
    const feed = await ActivityFeedService.listFeed({
      sessionId: input.session_id || input.sessionId,
      userId: input.user_id || input.userId,
      limit: input.limit,
    });

    return JSON.stringify({
      success: true,
      feed,
      count: feed.length,
      message: feed.length
        ? `Feed atualizado com ${feed.length} evento(s) financeiro(s).`
        : 'Ainda não há atividades financeiras para mostrar.',
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return JSON.stringify({ success: false, error: errorMessage });
  }
}

async function executeGetFinancialInsights(input: any): Promise<string> {
  try {
    const insights = await FinancialInsightsService.listLatestInsights({
      sessionId: input.session_id || input.sessionId,
      userId: input.user_id || input.userId,
      limit: input.limit,
    });

    return JSON.stringify({
      success: true,
      insights,
      count: insights.length,
      message: insights[0]?.description || 'Insights financeiros atualizados.',
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return JSON.stringify({ success: false, error: errorMessage });
  }
}

async function executeResolveSmartContact(input: any): Promise<string> {
  try {
    const query = String(input.query || input.contact_name || input.contactName || '').trim();
    const contact = await SmartContactsService.resolveByContext({
      sessionId: input.session_id || input.sessionId,
      userId: input.user_id || input.userId,
      query,
    });

    return JSON.stringify({
      success: true,
      contact,
      found: Boolean(contact),
      message: contact
        ? `Contato encontrado: ${contact.display_name || contact.contact_name}.`
        : 'Não encontrei um contato salvo com esse contexto.',
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return JSON.stringify({ success: false, error: errorMessage });
  }
}

async function executeFindPaymentReplayCandidate(input: any): Promise<string> {
  try {
    const replay = await PaymentReplayService.findReplayCandidate({
      sessionId: input.session_id || input.sessionId,
      userId: input.user_id || input.userId,
      queryContext: input.query_context || input.queryContext || input.message || '',
    });

    return JSON.stringify({
      success: true,
      replay,
      ...replay,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return JSON.stringify({ success: false, error: errorMessage });
  }
}

async function executeGetSavingsEstimate(input: any): Promise<string> {
  try {
    const result = await EconomyEngineService.calculateMonthly({
      sessionId: input.session_id || input.sessionId,
      userId: input.user_id || input.userId,
    });

    return JSON.stringify({
      success: true,
      ...result,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return JSON.stringify({ success: false, error: errorMessage });
  }
}

async function executeGetSavingsIdentity(input: any): Promise<string> {
  try {
    const view = String(input.view || 'summary').trim();
    const rawPeriod = String(input.period || 'month').trim();
    const period = ['today', 'month', 'lifetime'].includes(rawPeriod) ? rawPeriod as any : 'month';
    const identity = await EconomyEngineService.calculateIdentity({
      sessionId: input.session_id || input.sessionId,
      userId: input.user_id || input.userId,
      period,
    });

    let message = identity.message;
    if (view === 'traditional_cost') {
      message =
        `Em métodos tradicionais, essas operações teriam custado aproximadamente ` +
        `${formatBrl(identity.estimatedTraditionalFee)}. No TalkToStellar, o custo efetivo estimado foi ` +
        `${formatBrl(identity.actualFee)}. Economia estimada: ${formatBrl(identity.estimatedSavings)}.`;
    }

    if (view === 'biggest_operation') {
      const biggest = identity.biggestSavingsOperation;
      message = biggest
        ? `Sua operação com maior economia gerou aproximadamente ${formatBrl(biggest.estimatedSavings)} de economia em relação a métodos tradicionais.`
        : 'Ainda não encontrei uma operação concluída com economia estimada.';
    }

    return JSON.stringify({
      success: true,
      ...identity,
      view,
      message,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return JSON.stringify({ success: false, error: errorMessage });
  }
}

async function executeGetSavingsComparison(input: any): Promise<string> {
  try {
    const rawPeriod = String(input.period || 'month').trim();
    const period = ['today', 'month', 'lifetime'].includes(rawPeriod) ? rawPeriod as any : 'month';
    const identity = await EconomyEngineService.calculateIdentity({
      sessionId: input.session_id || input.sessionId,
      userId: input.user_id || input.userId,
      period,
    });

    const message =
      `Comparativo financeiro (${period}): em bancos/métodos tradicionais, o custo estimado seria ` +
      `${formatBrl(identity.estimatedTraditionalFee)}. No TalkToStellar, o custo efetivo estimado foi ` +
      `${formatBrl(identity.actualFee)}. Economia estimada: ${formatBrl(identity.estimatedSavings)}. ` +
      `Percentual de economia sobre o custo tradicional: ${identity.savingsPercentage.toFixed(1)}%. ` +
      `Estimativa informativa baseada em médias de mercado.`;

    return JSON.stringify({
      success: true,
      period,
      comparison_method: identity.comparisonMethod,
      operation_count: identity.operationCount,
      estimated_traditional_fee: identity.estimatedTraditionalFee,
      actual_fee: identity.actualFee,
      estimated_savings: identity.estimatedSavings,
      savings_percentage: identity.savingsPercentage,
      effective_savings_rate: identity.effectiveSavingsRate,
      message,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return JSON.stringify({ success: false, error: errorMessage });
  }
}

function paymentLogToReceiptInput(row: any, input: any): PaymentReceiptInput {
  const metadata = row?.metadata || {};
  const transferDetails = metadata?.transferDetails || {};
  const operationType = String(row?.operation_type || '').toUpperCase();
  const destinationName = String(
    metadata?.destination_name ||
    metadata?.destination_contact?.contact_name ||
    row?.destination_name ||
    row?.destination_public_key ||
    'destinatário'
  ).trim();
  const type = operationType.includes('CONVERSION') ? 'conversion' : 'payment_sent';
  const feeDisplay = String(
    transferDetails?.feeDisplay ||
    metadata?.fee_display ||
    ''
  ).trim();
  const savings = metadata?.savings
    ? {
        estimatedSavings: metadata.savings.estimated_savings,
        savingsPercentage: metadata.savings.savings_percentage,
        comparisonMethod: metadata.savings.comparison_method,
      }
    : null;

  return {
    type,
    sessionId: String(input.session_id || input.sessionId || row?.session_id || ''),
    userId: String(input.user_id || input.userId || row?.user_id || ''),
    provider: input.provider || input.external_provider || null,
    providerUserId: input.provider_user_id || input.providerUserId || null,
    counterpartyLabel: destinationName,
    sourceAmount: String(transferDetails?.sourceAmount || row?.source_amount || ''),
    sourceAssetCode: String(transferDetails?.sourceAssetCode || row?.source_asset_code || ''),
    destinationAmount: String(transferDetails?.destinationAmount || row?.destination_amount || ''),
    destinationAssetCode: String(transferDetails?.destinationAssetCode || row?.destination_asset_code || ''),
    feeXlm: String(transferDetails?.feeXlm || row?.fee_xlm || ''),
    feeDisplay,
    feeBrl: String(transferDetails?.feeBrl || metadata?.fee_brl || metadata?.actual_fee_brl || ''),
    feeUsdc: String(transferDetails?.feeUsdc || metadata?.fee_usdc || ''),
    hash: String(row?.payment_hash || ''),
    quote: metadata?.quote || null,
    savings,
    completedAt: String(row?.completed_at || row?.created_at || ''),
    status: 'Confirmado',
  };
}

async function executeSendReceiptImage(input: any): Promise<string> {
  try {
    const sessionId = String(input.session_id || input.sessionId || '').trim();
    const userId = await resolveToolUserId(input);
    let query = supabase
      .from('payment_logs')
      .select('*')
      .eq('user_id', userId)
      .eq('status', 'success')
      .order('completed_at', { ascending: false })
      .limit(1);

    if (sessionId) {
      query = query.eq('session_id', sessionId);
    }

    const { data, error } = await query;
    if (error) {
      throw new Error(error.message || 'Falha ao buscar o último comprovante.');
    }

    const row = Array.isArray(data) ? data[0] : null;
    if (!row) {
      return JSON.stringify({
        success: false,
        error: 'Ainda não encontrei uma transação concluída para gerar o comprovante em imagem.',
      });
    }

    const receiptInput = paymentLogToReceiptInput(row, { ...input, user_id: userId, session_id: sessionId || row.session_id });
    const svg = await PaymentReceiptService.buildReceiptImageSvg(receiptInput);
    const imageDataUrl = `data:image/svg+xml;base64,${Buffer.from(svg, 'utf-8').toString('base64')}`;
    const operationId = PaymentReceiptService.toPublicOperationId(receiptInput.hash);
    const caption = operationId
      ? `Comprovante da operação ${operationId}`
      : 'Comprovante da última operação';

    return JSON.stringify({
      success: true,
      operation_id: operationId,
      image_data_url: imageDataUrl,
      message: 'Imagem do comprovante gerada para visualização no chat web.',
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return JSON.stringify({ success: false, error: errorMessage });
  }
}

async function executeCreateInvoice(input: any): Promise<string> {
  try {
    const invoice = await InvoiceService.create({
      sessionId: input.session_id || input.sessionId,
      userId: input.user_id || input.userId,
      recipientName: String(input.recipient_name || input.recipientName || input.recipient || '').trim(),
      title: input.title,
      description: input.description,
      amount: String(input.amount || '').trim(),
      currency: input.currency,
      dueDate: input.due_date || input.dueDate,
    });

    return JSON.stringify({
      success: true,
      invoice,
      message: invoice.summary || 'Cobrança criada com link pronto para envio.',
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return JSON.stringify({ success: false, error: errorMessage });
  }
}

async function executeGetOrCreateGlobalProfile(input: any): Promise<string> {
  try {
    const profile = await GlobalProfileService.getOrCreate({
      sessionId: input.session_id || input.sessionId,
      userId: input.user_id || input.userId,
      usernameHint: input.username,
      displayName: input.display_name || input.displayName,
      bio: input.bio,
    });

    return JSON.stringify({
      success: true,
      profile,
      message: `Seu link global para receber: ${profile.public_link}`,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return JSON.stringify({ success: false, error: errorMessage });
  }
}

function normalizeMemoryText(value: string): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s@.+-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function summarizePaymentLog(row: any) {
  const metadata = row?.metadata || {};
  const counterparty = String(
    metadata.destination_name ||
    metadata.recipient_name ||
    row.destination_name ||
    row.destination_public_key ||
    'destinatário'
  ).trim();

  return {
    id: row.id,
    counterparty,
    destinationPublicKey: row.destination_public_key,
    sourceAmount: row.source_amount,
    sourceAssetCode: row.source_asset_code,
    destinationAmount: row.destination_amount,
    destinationAssetCode: row.destination_asset_code,
    feeXlm: row.fee_xlm,
    hash: row.payment_hash,
    operationType: row.operation_type,
    completedAt: row.completed_at || row.created_at,
  };
}

function toNumber(value: any): number {
  const parsed = Number(String(value ?? '').replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : 0;
}

function monthDateRange(): { start: Date; end: Date } {
  const start = new Date();
  start.setDate(1);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setMonth(end.getMonth() + 1);
  return { start, end };
}

function isSuccessfulPaymentRow(row: any): boolean {
  return String(row?.status || '').toLowerCase() === 'success';
}

function isConversionOperation(row: any): boolean {
  return String(row?.operation_type || '').toUpperCase().includes('CONVERSION');
}

function paymentCompletedAtMs(row: any): number {
  const raw = String(row?.completed_at || row?.created_at || '');
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

function inferDirection(row: any, ownPublicKey?: string): 'sent' | 'received' | 'unknown' {
  const ownKey = String(ownPublicKey || '').trim();
  const src = String(row?.source_public_key || '').trim();
  const dst = String(row?.destination_public_key || '').trim();
  if (ownKey) {
    if (src && src === ownKey) return 'sent';
    if (dst && dst === ownKey) return 'received';
  }
  const op = String(row?.operation_type || '').toUpperCase();
  if (op.includes('RECEIVE')) return 'received';
  if (op.includes('PAYMENT') || op.includes('PATH_PAYMENT')) return 'sent';
  return 'unknown';
}

function inferCounterpartyLabel(row: any, direction: 'sent' | 'received' | 'unknown'): string {
  const metadata = row?.metadata || {};
  const byMetadata = direction === 'received'
    ? String(metadata.sender_name || metadata.source_name || '').trim()
    : String(metadata.destination_name || metadata.recipient_name || '').trim();
  if (byMetadata) return byMetadata;
  const byRow = String(row?.destination_name || '').trim();
  if (byRow) return byRow;
  const fallback = direction === 'received'
    ? String(row?.source_public_key || '').trim()
    : String(row?.destination_public_key || '').trim();
  return fallback || 'contato';
}

function summarizeRecipientInsights(rows: any[], ownPublicKey?: string) {
  const stats = new Map<string, {
    key: string;
    label: string;
    txCount: number;
    totalSent: number;
    lastAt: number;
    lastAmount: number;
    lastAsset: string;
    intervals: number[];
    previousAt?: number;
  }>();

  for (const row of rows) {
    if (!isSuccessfulPaymentRow(row) || isConversionOperation(row)) continue;
    const direction = inferDirection(row, ownPublicKey);
    if (direction !== 'sent') continue;
    const counterpartyKey = String(row?.destination_public_key || '').trim();
    if (!counterpartyKey) continue;
    const label = inferCounterpartyLabel(row, direction);
    const completedAt = paymentCompletedAtMs(row);
    const amount = toNumber(row?.destination_amount || row?.source_amount);
    const asset = String(row?.destination_asset_code || row?.source_asset_code || '').toUpperCase() || 'USDC';

    const current = stats.get(counterpartyKey) || {
      key: counterpartyKey,
      label,
      txCount: 0,
      totalSent: 0,
      lastAt: 0,
      lastAmount: 0,
      lastAsset: asset,
      intervals: [],
      previousAt: undefined,
    };

    current.txCount += 1;
    current.totalSent += amount > 0 ? amount : 0;
    if (completedAt > current.lastAt) {
      current.lastAt = completedAt;
      current.lastAmount = amount;
      current.lastAsset = asset;
      current.label = label || current.label;
    }

    if (current.previousAt && completedAt > 0) {
      const gapDays = Math.abs(completedAt - current.previousAt) / (1000 * 60 * 60 * 24);
      if (Number.isFinite(gapDays) && gapDays > 0) current.intervals.push(gapDays);
    }
    current.previousAt = completedAt || current.previousAt;
    stats.set(counterpartyKey, current);
  }

  return Array.from(stats.values())
    .sort((a, b) => b.txCount - a.txCount || b.lastAt - a.lastAt)
    .map((item, index) => {
      const avgGap = item.intervals.length
        ? item.intervals.reduce((sum, val) => sum + val, 0) / item.intervals.length
        : null;
      const isRecurring = item.txCount >= 3 && !!avgGap && avgGap <= 45;
      const isFavorite = index < 3 || item.txCount >= 4;
      return {
        counterpartyKey: item.key,
        label: item.label,
        txCount: item.txCount,
        totalSent: item.totalSent,
        lastAt: item.lastAt ? new Date(item.lastAt).toISOString() : null,
        lastAmount: item.lastAmount,
        lastAsset: item.lastAsset,
        favorite: isFavorite,
        recurring: isRecurring,
        averageIntervalDays: avgGap ? Number(avgGap.toFixed(1)) : null,
        suggestedAmount: item.lastAmount > 0 ? item.lastAmount : null,
      };
    });
}

async function getWalletFiatBalances(sessionId?: string): Promise<{ brl: number; usd: number }> {
  const sid = String(sessionId || '').trim();
  if (!sid) return { brl: 0, usd: 0 };

  const { data: walletRow, error } = await supabase
    .from('wallets')
    .select('balance')
    .eq('session_id', sid)
    .limit(1)
    .maybeSingle();

  if (error) return { brl: 0, usd: 0 };

  const balances = Array.isArray((walletRow as any)?.balance) ? (walletRow as any).balance : [];
  let brl = 0;
  let usd = 0;
  for (const row of balances) {
    const code = String(row?.asset_code || row?.asset || '').toUpperCase();
    const value = toNumber(row?.balance || row?.amount);
    if (code === 'BRL') brl = value;
    if (code === 'USDC' || code === 'USD') usd = value;
  }
  return { brl, usd };
}

async function getUsdBrlMonthlyChange(): Promise<{
  latestRate: number | null;
  monthStartRate: number | null;
  changePct: number | null;
  observedAt?: string | null;
}> {
  const { start: monthStart } = monthDateRange();
  const latestResp = await supabase
    .from('currency_rate_history')
    .select('rate, observed_at')
    .eq('base_currency', 'USD')
    .eq('quote_currency', 'BRL')
    .order('observed_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const monthResp = await supabase
    .from('currency_rate_history')
    .select('rate, observed_at')
    .eq('base_currency', 'USD')
    .eq('quote_currency', 'BRL')
    .gte('observed_at', monthStart.toISOString())
    .order('observed_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  const latestRate = toNumber((latestResp.data as any)?.rate);
  const monthStartRate = toNumber((monthResp.data as any)?.rate);
  if (!latestRate || !monthStartRate) {
    return { latestRate: latestRate || null, monthStartRate: monthStartRate || null, changePct: null, observedAt: (latestResp.data as any)?.observed_at || null };
  }
  const changePct = ((latestRate - monthStartRate) / monthStartRate) * 100;
  return {
    latestRate,
    monthStartRate,
    changePct,
    observedAt: (latestResp.data as any)?.observed_at || null,
  };
}

function classifyTreasuryBehavior(rows: any[], ownPublicKey?: string): {
  receivesMostlyUsd: boolean;
  spendsMostlyBrl: boolean;
  receivesUsdCount: number;
  spendsBrlCount: number;
} {
  let receivesUsdCount = 0;
  let receivesTotal = 0;
  let spendsBrlCount = 0;
  let spendsTotal = 0;
  for (const row of rows) {
    if (!isSuccessfulPaymentRow(row) || isConversionOperation(row)) continue;
    const direction = inferDirection(row, ownPublicKey);
    const srcAsset = String(row?.source_asset_code || '').toUpperCase();
    const dstAsset = String(row?.destination_asset_code || '').toUpperCase();
    if (direction === 'received') {
      receivesTotal += 1;
      if (srcAsset === 'USDC' || srcAsset === 'USD' || dstAsset === 'USDC' || dstAsset === 'USD') receivesUsdCount += 1;
    }
    if (direction === 'sent') {
      spendsTotal += 1;
      if (srcAsset === 'BRL' || dstAsset === 'BRL') spendsBrlCount += 1;
    }
  }
  return {
    receivesMostlyUsd: receivesTotal > 0 ? receivesUsdCount / receivesTotal >= 0.6 : false,
    spendsMostlyBrl: spendsTotal > 0 ? spendsBrlCount / spendsTotal >= 0.6 : false,
    receivesUsdCount,
    spendsBrlCount,
  };
}

function summarizeConversions(rows: any[]) {
  const totals: Record<string, number> = {};
  const rates: number[] = [];
  for (const row of rows) {
    const sourceAmount = Number(String(row.source_amount || '').replace(',', '.'));
    const destinationAmount = Number(String(row.destination_amount || '').replace(',', '.'));
    const sourceAsset = String(row.source_asset_code || '').toUpperCase();
    const destAsset = String(row.destination_asset_code || '').toUpperCase();
    if (Number.isFinite(sourceAmount) && sourceAsset) {
      totals[`spent_${sourceAsset}`] = (totals[`spent_${sourceAsset}`] || 0) + sourceAmount;
    }
    if (Number.isFinite(destinationAmount) && destAsset) {
      totals[`received_${destAsset}`] = (totals[`received_${destAsset}`] || 0) + destinationAmount;
    }
    if (Number.isFinite(sourceAmount) && sourceAmount > 0 && Number.isFinite(destinationAmount) && destinationAmount > 0) {
      rates.push(destinationAmount / sourceAmount);
    }
  }
  const averageRate = rates.length ? rates.reduce((sum, rate) => sum + rate, 0) / rates.length : null;
  return {
    count: rows.length,
    totals,
    averageRate,
  };
}

function buildFinancialMemoryMessage(mode: string, lastPayment: any, conversionSummary: any, recentPayments: any[]) {
  if (mode === 'repeat_payment') {
    if (!lastPayment) return 'Não encontrei pagamento anterior compatível para repetir.';
    return `Último pagamento compatível: ${formatCustomerAssetAmount(lastPayment.destinationAmount, lastPayment.destinationAssetCode)} para ${lastPayment.counterparty}.`;
  }

  if (mode === 'monthly_conversion' || mode === 'average_quote') {
    if (!conversionSummary.count) return 'Não encontrei conversões confirmadas neste mês.';
    const totals = Object.entries(conversionSummary.totals)
      .map(([key, value]) => `${key}: ${Number(value).toFixed(2)}`)
      .join(', ');
    const avg = conversionSummary.averageRate ? ` Média de cotação: ${conversionSummary.averageRate.toFixed(6)}.` : '';
    return `Neste mês: ${conversionSummary.count} conversão(ões). ${totals || 'Sem totais disponíveis.'}.${avg}`;
  }

  if (!recentPayments.length && !conversionSummary.count) {
    return 'Ainda não encontrei memória financeira suficiente para responder isso.';
  }

  return [
    recentPayments[0]
      ? `Último pagamento: ${formatCustomerAssetAmount(recentPayments[0].destinationAmount, recentPayments[0].destinationAssetCode)} para ${recentPayments[0].counterparty}.`
      : '',
    conversionSummary.count
      ? `Conversões neste mês: ${conversionSummary.count}.`
      : '',
  ].filter(Boolean).join(' ');
}

/**
 * Tool: Add Contact
 */
function normalizeDigits(value: string): string {
  return String(value || '').replace(/\D+/g, '');
}

async function resolveWalletBySessionId(sessionId: string, fallbackName?: string): Promise<{ publicKey?: string; name?: string; pixKey?: string }> {
  const normalizedSessionId = String(sessionId || '').trim();
  if (!normalizedSessionId) return {};

  const { data: walletBySession, error: walletSessionError } = await supabase
    .from('wallets')
    .select('public_key, name, pix_key')
    .eq('session_id', normalizedSessionId)
    .limit(1)
    .maybeSingle();

  if (walletSessionError) {
    throw new Error(walletSessionError.message || 'Failed to lookup wallet by session');
  }

  if (!walletBySession?.public_key) {
    return {};
  }

  return {
    publicKey: walletBySession.public_key,
    name: walletBySession.name || fallbackName || undefined,
    pixKey: walletBySession.pix_key || undefined,
  };
}

async function resolveToolUserId(input: any): Promise<string> {
  const directUserId = String(input.user_id || input.userId || input.owner_id || '').trim();
  if (directUserId) return directUserId;

  const sessionId = String(input.session_id || input.sessionId || '').trim();
  if (!sessionId) {
    throw new Error('Não consegui identificar sua conta nesta sessão. Informe session_id ou faça login novamente.');
  }

  const { data: sessionRow, error: sessionError } = await supabase
    .from('agent_sessions')
    .select('user_id, email')
    .eq('session_id', sessionId)
    .limit(1)
    .maybeSingle();

  if (sessionError) {
    throw new Error(sessionError.message || 'Falha ao identificar usuário da sessão');
  }

  const userId = String(sessionRow?.user_id || sessionRow?.email || '').trim();
  if (!userId) {
    throw new Error('Não consegui identificar sua conta nesta sessão. Faça login novamente.');
  }

  return userId;
}

async function resolveToolPublicKey(input: any): Promise<string> {
  const directPublicKey = String(input.public_key || input.publicKey || '').trim();
  if (directPublicKey) return directPublicKey;

  const sessionId = String(input.session_id || input.sessionId || '').trim();
  if (!sessionId) {
    throw new Error('Não consegui identificar a wallet nesta sessão. Faça login novamente.');
  }

  const { data: sessionRow, error: sessionError } = await supabase
    .from('agent_sessions')
    .select('public_key')
    .eq('session_id', sessionId)
    .limit(1)
    .maybeSingle();

  if (sessionError) {
    throw new Error(sessionError.message || 'Falha ao carregar sessão');
  }

  const sessionPublicKey = String(sessionRow?.public_key || '').trim();
  if (sessionPublicKey) return sessionPublicKey;

  const { data: walletRow, error: walletError } = await supabase
    .from('wallets')
    .select('public_key')
    .eq('session_id', sessionId)
    .limit(1)
    .maybeSingle();

  if (walletError) {
    throw new Error(walletError.message || 'Falha ao localizar wallet da sessão');
  }

  const walletPublicKey = String(walletRow?.public_key || '').trim();
  if (!walletPublicKey) {
    throw new Error('Wallet não encontrada para esta sessão. Faça login novamente.');
  }

  await supabase
    .from('agent_sessions')
    .update({ public_key: walletPublicKey, last_activity: new Date().toISOString() })
    .eq('session_id', sessionId);

  return walletPublicKey;
}

async function resolveContactPublicKeyByPixKey(contactRef: string): Promise<{ publicKey?: string; name?: string; pixKey?: string }> {
  const rawRef = String(contactRef || '').trim();
  const normalizedRef = rawRef.toLowerCase();
  if (!normalizedRef) return {};

  const isPublicKey = /^G[A-Z2-7]{55}$/i.test(rawRef);
  const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawRef);
  const numericRef = normalizeDigits(rawRef);

  if (isPublicKey) {
    const normalizedPublicKey = rawRef.toUpperCase();

    const { data: walletByPublicKey, error: walletPublicError } = await supabase
      .from('wallets')
      .select('public_key, name, pix_key')
      .eq('public_key', normalizedPublicKey)
      .limit(1)
      .maybeSingle();

    if (walletPublicError) {
      throw new Error(walletPublicError.message || 'Failed to lookup wallet by public key');
    }

    if (walletByPublicKey?.public_key) {
      return {
        publicKey: String(walletByPublicKey.public_key),
        name: walletByPublicKey.name || undefined,
        pixKey: walletByPublicKey.pix_key || undefined,
      };
    }

    const { data: contactByPublicKey, error: contactPublicError } = await supabase
      .from('contacts')
      .select('contact_name, stellar_public_key, pix_key')
      .eq('stellar_public_key', normalizedPublicKey)
      .limit(1)
      .maybeSingle();

    if (contactPublicError) {
      throw new Error(contactPublicError.message || 'Failed to lookup contact by public key');
    }

    if (contactByPublicKey?.stellar_public_key) {
      return {
        publicKey: String(contactByPublicKey.stellar_public_key),
        name: contactByPublicKey.contact_name || undefined,
        pixKey: contactByPublicKey.pix_key || undefined,
      };
    }

    return { publicKey: normalizedPublicKey };
  }

  const { data: walletByPix, error: walletPixError } = await supabase
    .from('wallets')
    .select('public_key, name, pix_key, session_id')
    .ilike('pix_key', normalizedRef)
    .limit(1)
    .maybeSingle();

  if (walletPixError) {
    throw new Error(walletPixError.message || 'Failed to lookup wallet transfer key');
  }

  if (walletByPix?.public_key) {
    return {
      publicKey: String(walletByPix.public_key),
      name: walletByPix.name || undefined,
      pixKey: walletByPix.pix_key || normalizedRef,
    };
  }

  const { data: contactByPix, error: contactPixError } = await supabase
    .from('contacts')
    .select('contact_name, stellar_public_key, pix_key')
    .ilike('pix_key', normalizedRef)
    .limit(1)
    .maybeSingle();

  if (contactPixError) {
    throw new Error(contactPixError.message || 'Failed to lookup contact transfer key');
  }

  if (contactByPix?.stellar_public_key) {
    return {
      publicKey: contactByPix.stellar_public_key,
      name: contactByPix.contact_name || undefined,
      pixKey: contactByPix.pix_key || normalizedRef,
    };
  }

  const { data: walletByPublicKey, error: walletPublicError } = await supabase
    .from('wallets')
    .select('public_key, name, pix_key, session_id')
    .eq('public_key', rawRef.toUpperCase())
    .limit(1)
    .maybeSingle();

  if (walletPublicError) {
    throw new Error(walletPublicError.message || 'Failed to lookup wallet by public key');
  }

  if (walletByPublicKey?.public_key) {
    return {
      publicKey: String(walletByPublicKey.public_key),
      name: walletByPublicKey.name || undefined,
      pixKey: walletByPublicKey.pix_key || undefined,
    };
  }

  const { data: contactByPublicKey, error: contactPublicError } = await supabase
    .from('contacts')
    .select('contact_name, stellar_public_key, pix_key')
    .eq('stellar_public_key', rawRef.toUpperCase())
    .limit(1)
    .maybeSingle();

  if (contactPublicError) {
    throw new Error(contactPublicError.message || 'Failed to lookup contact by public key');
  }

  if (contactByPublicKey?.stellar_public_key) {
    return {
      publicKey: contactByPublicKey.stellar_public_key,
      name: contactByPublicKey.contact_name || undefined,
      pixKey: contactByPublicKey.pix_key || undefined,
    };
  }

  if (isEmail) {
    const { data: sessionsByEmail, error: sessionEmailError } = await supabase
      .from('agent_sessions')
      .select('session_id, user_id, email')
      .ilike('email', normalizedRef)
      .order('updated_at', { ascending: false })
      .limit(5);

    if (sessionEmailError) {
      throw new Error(sessionEmailError.message || 'Failed to lookup user by email');
    }

    const { data: sessionsByUserId, error: sessionUserIdError } = await supabase
      .from('agent_sessions')
      .select('session_id, user_id, email')
      .ilike('user_id', normalizedRef)
      .order('updated_at', { ascending: false })
      .limit(5);

    if (sessionUserIdError) {
      throw new Error(sessionUserIdError.message || 'Failed to lookup user by user_id');
    }

    const sessionCandidates = [...(sessionsByEmail || []), ...(sessionsByUserId || [])];
    const seenSessionIds = new Set<string>();
    for (const sessionCandidate of sessionCandidates) {
      const candidateSessionId = String(sessionCandidate?.session_id || '').trim();
      if (!candidateSessionId || seenSessionIds.has(candidateSessionId)) continue;
      seenSessionIds.add(candidateSessionId);

      const resolved = await resolveWalletBySessionId(
        candidateSessionId,
        sessionCandidate?.user_id || sessionCandidate?.email || normalizedRef
      );
      if (resolved.publicKey) {
        logger.info(`[add_contact] resolved email ${normalizedRef} via agent_sessions session_id=${candidateSessionId}`);
        return resolved;
      }
    }

    const { data: externalByUserId, error: externalUserIdError } = await supabase
      .from('external_accounts')
      .select('session_id, user_id, data')
      .ilike('user_id', normalizedRef)
      .order('created_at', { ascending: false })
      .limit(5);

    if (externalUserIdError) {
      throw new Error(externalUserIdError.message || 'Failed to lookup external account by user_id');
    }

    for (const externalCandidate of externalByUserId || []) {
      const resolved = await resolveWalletBySessionId(
        String(externalCandidate?.session_id || ''),
        String(externalCandidate?.user_id || normalizedRef)
      );
      if (resolved.publicKey) {
        logger.info(`[add_contact] resolved email ${normalizedRef} via external_accounts.user_id`);
        return resolved;
      }
    }

    const { data: externalRows, error: externalRowsError } = await supabase
      .from('external_accounts')
      .select('session_id, user_id, data')
      .order('created_at', { ascending: false })
      .limit(100);

    if (externalRowsError) {
      throw new Error(externalRowsError.message || 'Failed to lookup external account data');
    }

    for (const row of externalRows || []) {
      const dataEmail = String((row as any)?.data?.email || '').trim().toLowerCase();
      if (dataEmail !== normalizedRef) continue;

      const resolved = await resolveWalletBySessionId(
        String((row as any)?.session_id || ''),
        String((row as any)?.user_id || dataEmail)
      );
      if (resolved.publicKey) {
        logger.info(`[add_contact] resolved email ${normalizedRef} via external_accounts.data.email`);
        return resolved;
      }
    }

    const { data: paymentLogRows, error: paymentLogError } = await supabase
      .from('payment_logs')
      .select('source_public_key, destination_public_key, created_at')
      .ilike('user_id', normalizedRef)
      .order('created_at', { ascending: false })
      .limit(10);

    if (paymentLogError) {
      const message = String(paymentLogError.message || '').toLowerCase();
      if (!message.includes('payment_logs') && !message.includes('does not exist') && !message.includes('schema cache')) {
        throw new Error(paymentLogError.message || 'Failed to lookup payment logs by user_id');
      }
    }

    for (const row of paymentLogRows || []) {
      const publicKey =
        String((row as any)?.source_public_key || '').trim() ||
        String((row as any)?.destination_public_key || '').trim();
      if (/^G[A-Z2-7]{55}$/i.test(publicKey)) {
        logger.info(`[add_contact] resolved email ${normalizedRef} via payment_logs.user_id`);
        return {
          publicKey,
          name: normalizedRef,
          pixKey: undefined,
        };
      }
    }

    const { data: operationRows, error: operationError } = await supabase
      .from('operations')
      .select('source_public_key, destination_key, created_at')
      .ilike('user_id', normalizedRef)
      .order('created_at', { ascending: false })
      .limit(10);

    if (operationError) {
      const message = String(operationError.message || '').toLowerCase();
      if (!message.includes('operations') && !message.includes('does not exist') && !message.includes('schema cache')) {
        throw new Error(operationError.message || 'Failed to lookup operations by user_id');
      }
    }

    for (const row of operationRows || []) {
      const publicKey =
        String((row as any)?.source_public_key || '').trim() ||
        String((row as any)?.destination_key || '').trim();
      if (/^G[A-Z2-7]{55}$/i.test(publicKey)) {
        logger.info(`[add_contact] resolved email ${normalizedRef} via operations.user_id`);
        return {
          publicKey,
          name: normalizedRef,
          pixKey: undefined,
        };
      }
    }

    logger.warn(`[add_contact] could not resolve email ${normalizedRef} to a wallet`);
  }

  if (numericRef.length >= 8) {
    const candidates = Array.from(
      new Set([
        numericRef,
        numericRef.slice(-11),
        numericRef.slice(-10),
        numericRef.slice(-9),
        numericRef.slice(-8),
      ].filter((value) => value.length >= 8))
    );

    for (const candidate of candidates) {
      const { data: contactByPhone, error: contactPhoneError } = await supabase
        .from('contacts')
        .select('contact_name, stellar_public_key, pix_key, phone_number')
        .ilike('phone_number', `%${candidate}%`)
        .limit(1)
        .maybeSingle();

      if (contactPhoneError) {
        throw new Error(contactPhoneError.message || 'Failed to lookup contact by phone');
      }

      if (contactByPhone?.stellar_public_key) {
        return {
          publicKey: contactByPhone.stellar_public_key,
          name: contactByPhone.contact_name || undefined,
          pixKey: contactByPhone.pix_key || undefined,
        };
      }

      const { data: sessionByPhone, error: sessionPhoneError } = await supabase
        .from('agent_sessions')
        .select('session_id, user_id, email, phone_number')
        .ilike('phone_number', `%${candidate}%`)
        .limit(1)
        .maybeSingle();

      if (sessionPhoneError) {
        throw new Error(sessionPhoneError.message || 'Failed to lookup user by phone');
      }

      if (sessionByPhone?.session_id) {
        const { data: walletBySession, error: walletSessionError } = await supabase
          .from('wallets')
          .select('public_key, name, pix_key')
          .eq('session_id', sessionByPhone.session_id)
          .limit(1)
          .maybeSingle();

        if (walletSessionError) {
          throw new Error(walletSessionError.message || 'Failed to lookup wallet by session phone');
        }

        if (walletBySession?.public_key) {
          return {
            publicKey: walletBySession.public_key,
            name: walletBySession.name || sessionByPhone.user_id || sessionByPhone.email || undefined,
            pixKey: walletBySession.pix_key || undefined,
          };
        }
      }
    }
  }

  return {};
}

async function resolveContactProfileByPublicKey(publicKey: string): Promise<{
  public_key: string;
  name?: string;
  pix_key?: string;
  email?: string;
  phone_number?: string;
  cpf?: string;
  user_id?: string;
}> {
  const normalizedPublicKey = String(publicKey || '').trim();
  if (!normalizedPublicKey) {
    return { public_key: normalizedPublicKey };
  }

  let profile: any = { public_key: normalizedPublicKey };

  const { data: walletRow, error: walletError } = await supabase
    .from('wallets')
    .select('session_id, public_key, name, pix_key')
    .eq('public_key', normalizedPublicKey)
    .limit(1)
    .maybeSingle();

  if (walletError) {
    throw new Error(walletError.message || 'Failed to lookup wallet profile');
  }

  if (walletRow) {
    profile = {
      ...profile,
      name: walletRow.name || undefined,
      pix_key: walletRow.pix_key || undefined,
    };
  }

  const sessionId = String(walletRow?.session_id || '').trim();
  if (sessionId) {
    const { data: sessionRow, error: sessionError } = await supabase
      .from('agent_sessions')
      .select('user_id, email, phone_number')
      .eq('session_id', sessionId)
      .limit(1)
      .maybeSingle();

    if (sessionError) {
      throw new Error(sessionError.message || 'Failed to lookup session profile');
    }

    if (sessionRow) {
      profile = {
        ...profile,
        user_id: sessionRow.user_id || undefined,
        email: sessionRow.email || undefined,
        phone_number: sessionRow.phone_number || undefined,
      };
    }

    const { data: externalRows, error: externalError } = await supabase
      .from('external_accounts')
      .select('data')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: false })
      .limit(10);

    if (externalError) {
      const message = String(externalError.message || '').toLowerCase();
      if (!message.includes('external_accounts') && !message.includes('does not exist') && !message.includes('schema cache')) {
        throw new Error(externalError.message || 'Failed to lookup external account profile');
      }
    } else {
      for (const row of externalRows || []) {
        const data = (row as any)?.data || {};
        if (!profile.email && data?.email) profile.email = String(data.email).trim();
        if (!profile.phone_number && data?.phone_number) profile.phone_number = String(data.phone_number).trim();
        if (!profile.cpf && data?.cpf) profile.cpf = String(data.cpf).trim();
      }
    }
  }

  return profile;
}

async function executeAddContact(input: any): Promise<string> {
  try {
    logger.debug(`Tool: Adding contact ${input.contact_name}`);
    const ownerId = await resolveToolUserId(input);
    const contactKey = String(input.public_key || input.stellar_public_key || input.pix_key || input.contact_key || '').trim();
    const isPublicKey = /^G[A-Z2-7]{55}$/i.test(contactKey);
    const pixKeyInput = String(input.pix_key || (!isPublicKey ? contactKey : '') || '').trim().toLowerCase();
    const resolved = pixKeyInput ? await resolveContactPublicKeyByPixKey(pixKeyInput) : {};
    const publicKey = isPublicKey ? contactKey : String(resolved.publicKey || '').trim();

    if (!publicKey) {
      throw new Error('Informe uma chave válida (pública, transferência, e-mail ou telefone) já cadastrada.');
    }

    const contactName = String(input.contact_name || resolved.name || `Contato ${publicKey.slice(0, 6)}`).trim();

    const { data, error } = await supabase
      .from("contacts")
      .upsert({
        owner_id: ownerId,
        contact_name: contactName,
        stellar_public_key: publicKey,
        pix_key: pixKeyInput || resolved.pixKey || null,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'owner_id,contact_name' })
      .select()
      .single();

    if (error) {
      throw new Error(error.message);
    }
    const profile = await resolveContactProfileByPublicKey(publicKey);
    const profileLines = [
      `Nome: ${contactName}`,
      `Chave pública: ${publicKey}`,
      profile.pix_key ? `Chave de transferência: ${profile.pix_key}` : null,
      profile.email ? `E-mail: ${profile.email}` : null,
      profile.phone_number ? `Telefone: ${profile.phone_number}` : null,
      profile.cpf ? `CPF: ${profile.cpf}` : null,
    ].filter(Boolean);

    return JSON.stringify({
      success: true,
      contact: data,
      contact_profile: profile,
      message: `Contato adicionado com sucesso.\n${profileLines.join('\n')}`,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return JSON.stringify({
      success: false,
      error: errorMessage,
    });
  }
}

/**
 * Tool: List Contacts
 */
async function executeListContacts(input: any): Promise<string> {
  try {
    const ownerId = await resolveToolUserId(input);
    logger.debug(`Tool: Listing contacts from database for user ${ownerId}`);

    let query = supabase
      .from("contacts")
      .select("id, owner_id, contact_name, stellar_public_key, phone_number, pix_key, created_at")
      .order("contact_name", { ascending: true })
      .eq("owner_id", ownerId);

    const { data: contacts, error } = await query;

    if (error) {
      const errorCode = String((error as any)?.code || '');
      const errorMessage = String((error as any)?.message || '').toLowerCase();
      const contactsTableMissing =
        errorCode === 'PGRST205' ||
        errorCode === '42P01' ||
        errorMessage.includes("could not find the table 'public.contacts'") ||
        errorMessage.includes('relation') && errorMessage.includes('contacts');

      if (contactsTableMissing) {
        return JSON.stringify({
          success: false,
          error: 'A tabela de contatos ainda nao foi criada no banco. Reinicie o backend para aplicar as migracoes ou rode o SQL de bootstrap no Supabase.',
          code: 'CONTACTS_TABLE_MISSING',
        });
      }

      throw new Error(error.message || "Failed to fetch contacts");
    }
    const publicKeys = (contacts || [])
      .map((contact: any) => String(contact?.stellar_public_key || '').trim())
      .filter(Boolean);

    let paymentRows: any[] = [];
    if (publicKeys.length > 0) {
      const { data: logs, error: logsError } = await supabase
        .from('payment_logs')
        .select('status, operation_type, destination_public_key, destination_amount, destination_asset_code, completed_at, created_at')
        .eq('user_id', ownerId)
        .order('completed_at', { ascending: false })
        .limit(300);
      if (!logsError) {
        paymentRows = Array.isArray(logs) ? logs : [];
      }
    }

    const byDestination = new Map<string, any[]>();
    for (const row of paymentRows) {
      const key = String(row?.destination_public_key || '').trim();
      if (!key) continue;
      if (!byDestination.has(key)) byDestination.set(key, []);
      byDestination.get(key)!.push(row);
    }

    const contactProfiles = await Promise.all((contacts || []).map(async (contact: any) => {
      const contactKey = String(contact?.stellar_public_key || '').trim();
      if (!contactKey) return {};
      try {
        return await resolveContactProfileByPublicKey(contactKey);
      } catch (error) {
        logger.warn(`[executeListContacts] failed to enrich ${contactKey}: ${error instanceof Error ? error.message : String(error)}`);
        return {};
      }
    }));

    const enrichedContacts = (contacts || []).map((contact: any, index: number) => {
      const profile: any = contactProfiles[index] || {};
      const contactKey = String(contact?.stellar_public_key || '').trim();
      const relatedRows = byDestination.get(contactKey) || [];
      const successfulRows = relatedRows.filter((row: any) => isSuccessfulPaymentRow(row) && !isConversionOperation(row));
      const sortedRows = successfulRows
        .slice()
        .sort((a: any, b: any) => paymentCompletedAtMs(b) - paymentCompletedAtMs(a));

      const txCount = successfulRows.length;
      const totalSent = successfulRows.reduce((sum: number, row: any) => sum + toNumber(row.destination_amount), 0);
      const lastRow = sortedRows[0];
      const lastAmount = toNumber(lastRow?.destination_amount);
      const lastAsset = String(lastRow?.destination_asset_code || 'USDC').toUpperCase();
      const lastAt = paymentCompletedAtMs(lastRow);
      const intervals: number[] = [];

      for (let i = 1; i < sortedRows.length; i += 1) {
        const prev = paymentCompletedAtMs(sortedRows[i - 1]);
        const cur = paymentCompletedAtMs(sortedRows[i]);
        const gapDays = Math.abs(prev - cur) / (1000 * 60 * 60 * 24);
        if (Number.isFinite(gapDays) && gapDays > 0) intervals.push(gapDays);
      }

      const avgInterval = intervals.length ? intervals.reduce((sum, val) => sum + val, 0) / intervals.length : null;
      const recurring = txCount >= 3 && !!avgInterval && avgInterval <= 45;
      const favorite = txCount >= 4;
      const label = String(contact.contact_name || contact.name || 'Contato').trim();
      const tags = [favorite ? 'favorito' : null, recurring ? 'recorrente' : null].filter(Boolean);

      return {
        ...contact,
        email: contact.email || profile.email || null,
        cpf: contact.cpf || profile.cpf || null,
        contact_profile: profile,
        display_label: tags.length ? `${label} (${tags.join(', ')})` : label,
        favorite,
        recurring,
        history: {
          tx_count: txCount,
          total_sent: totalSent,
          total_sent_label: txCount ? formatCustomerAssetAmount(String(totalSent.toFixed(2)), lastAsset) : null,
          last_amount: txCount ? lastAmount : null,
          last_asset: txCount ? lastAsset : null,
          last_amount_label: txCount ? formatCustomerAssetAmount(String(lastAmount.toFixed(2)), lastAsset) : null,
          last_at: lastAt ? new Date(lastAt).toISOString() : null,
          avg_interval_days: avgInterval ? Number(avgInterval.toFixed(1)) : null,
          suggested_repeat_amount: txCount ? lastAmount : null,
        },
      };
    });

    logger.debug(`executeListContacts: returning ${((enrichedContacts||[]).length)} contacts for user ${ownerId}`);
    logger.debug(`executeListContacts: contacts data=${JSON.stringify(enrichedContacts?.slice(0,50) || [])}`);

    return JSON.stringify({
      success: true,
      contact_count: enrichedContacts?.length || 0,
      contacts: enrichedContacts || [],
      message: `Found ${(enrichedContacts || []).length} contacts`,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return JSON.stringify({
      success: false,
      error: errorMessage,
    });
  }
}

/**
 * Tool: List Wallets and Contacts
 */
async function executeListWalletsAndContacts(): Promise<string> {
  try {
    logger.debug("Tool: Listing all wallets with contacts");

    const { data: wallets, error: walletsError } = await supabase
      .from("wallets")
      .select("*")
      .order("created_at", { ascending: false });

    if (walletsError) {
      throw new Error(walletsError.message);
    }

    if (!wallets || wallets.length === 0) {
      return JSON.stringify({
        success: true,
        wallet_count: 0,
        wallets: [],
        message: "No wallets found",
      });
    }

    const sessionIds = wallets.map((w: any) => w.session_id).filter(Boolean);

    const { data: sessions, error: sessionsError } = await supabase
      .from("agent_sessions")
      .select("session_id, user_id, email, phone_number")
      .in("session_id", sessionIds);

    if (sessionsError) {
      throw new Error(sessionsError.message);
    }

    const sessionById = new Map<string, any>();
    (sessions || []).forEach((s: any) => sessionById.set(s.session_id, s));

    let contacts: any[] = [];
    const { data: contactsByOwner, error: contactsOwnerError } = await supabase
      .from("contacts")
      .select("*");

    if (!contactsOwnerError) {
      contacts = contactsByOwner || [];
    }

    const formattedWallets = wallets.map((wallet: any, index: number) => {
      const session = sessionById.get(wallet.session_id);
      const walletName = wallet.name ||
        (session?.email ? String(session.email).split("@")[0] : undefined) ||
        `wallet_${index + 1}`;

      const relatedContacts = contacts.filter((c: any) => {
        if (session?.user_id) {
          return c.owner_id === session.user_id || c.user_id === session.user_id;
        }
        return false;
      }).map((c: any) => ({
        id: c.id,
        name: c.contact_name,
        public_key: c.stellar_public_key || c.public_key,
      }));

      return {
        name: walletName,
        public_key: wallet.public_key,
        session_id: wallet.session_id,
        user_id: session?.user_id,
        email: session?.email,
        phone_number: session?.phone_number,
        balance: wallet.balance || [],
        contact_count: relatedContacts.length,
        contacts: relatedContacts,
      };
    });

    return JSON.stringify({
      success: true,
      wallet_count: formattedWallets.length,
      wallets: formattedWallets,
      message: `Found ${formattedWallets.length} wallets with contacts`,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return JSON.stringify({
      success: false,
      error: errorMessage,
    });
  }
}

/**
 * Tool: Reset PIN
 * Generates a temporary reset link for user to change their PIN
 */
async function executeResetPin(input: any): Promise<string> {
  try {
    logger.debug(`Tool: Resetting PIN for user ${input.user_id}`);

    const sessionId = String(input.session_id || '').trim();
    const requestedUserId = String(input.user_id || '').trim();

    if (!sessionId) {
      return JSON.stringify({
        success: false,
        error: 'session_id é obrigatório',
      });
    }

    // Resolve user_id from session context when LLM does not provide it.
    let resolvedUserId = requestedUserId;

    const { data: sessionRow, error: sessionError } = await supabase
      .from('agent_sessions')
      .select('user_id, email')
      .eq('session_id', sessionId)
      .maybeSingle();

    if (sessionError) {
      throw new Error(`Failed to resolve session context: ${sessionError.message}`);
    }

    const sessionUserId = String(sessionRow?.user_id || '').trim();
    const sessionEmail = String(sessionRow?.email || '').trim();

    if (!resolvedUserId && sessionUserId) {
      resolvedUserId = sessionUserId;
    }

    const emailCandidates = new Set<string>();
    if (resolvedUserId.includes('@')) emailCandidates.add(resolvedUserId);
    if (sessionUserId.includes('@')) emailCandidates.add(sessionUserId);
    if (sessionEmail.includes('@')) emailCandidates.add(sessionEmail);

    // Try to map email -> users.id when table exists, but keep flowing without it.
    if (!resolvedUserId || resolvedUserId.includes('@')) {
      for (const email of emailCandidates) {
        const { data: userRow, error: userError } = await supabase
          .from('users')
          .select('id')
          .eq('email', email)
          .maybeSingle();

        if (userError) {
          const userErrorMessage = String(userError.message || '').toLowerCase();
          const usersTableMissing =
            userErrorMessage.includes("could not find the table 'public.users'") ||
            userErrorMessage.includes('relation "users" does not exist') ||
            userErrorMessage.includes('relation public.users does not exist');

          if (usersTableMissing) {
            logger.warn('reset_pin: users table not available; using session user_id/email fallback');
            break;
          }

          throw new Error(`Failed to resolve user by email: ${userError.message}`);
        }

        const mappedUserId = String(userRow?.id || '').trim();
        if (mappedUserId) {
          resolvedUserId = mappedUserId;
          break;
        }
      }
    }

    if (!resolvedUserId) {
      throw new Error('Nao foi possivel identificar o usuario da sessao para redefinir PIN. Tente se autenticar novamente.');
    }

    // Generate reset token
    const resetData = await PinResetService.generateResetToken(resolvedUserId, sessionId);

    return JSON.stringify({
      success: true,
      reset_url: resetData.reset_url,
      expires_in_minutes: resetData.expires_in_minutes,
      user_id: resolvedUserId,
      message: `Link de redefinição de PIN gerado! Válido por ${resetData.expires_in_minutes} minutos.\n\nClique aqui para mudar seu PIN:\n${resetData.reset_url}`,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`PIN reset error: ${errorMessage}`);
    return JSON.stringify({
      success: false,
      error: errorMessage,
    });
  }
}

/**
 * Tool: Restart Onboarding
 * Allows user to set/reset PIN and passkey, optionally creating a new wallet
 */
async function executeRestartOnboarding(input: any): Promise<string> {
  try {
    logger.debug(`Tool: Restarting onboarding for session ${input.session_id}`);

    const sessionId = String(input.session_id || '');
    const userId = String(input.user_id || '');
    const pin = String(input.pin || '').trim();
    const requestPasskey = Boolean(input.request_passkey);
    const email = input.email ? String(input.email).trim() : undefined;
    const phoneNumber = input.phone_number ? String(input.phone_number).trim() : undefined;

    // Validate PIN format (4-8 digits)
    if (!pin || pin.length < 4 || pin.length > 8) {
      return JSON.stringify({
        success: false,
        error: 'PIN deve ter entre 4 e 8 dígitos',
      });
    }

    if (!/^\d+$/.test(pin)) {
      return JSON.stringify({
        success: false,
        error: 'PIN deve conter apenas números',
      });
    }

    // Hash the PIN
    const crypto = require('crypto');
    const pinHash = crypto
      .pbkdf2Sync(pin, process.env.PIN_SALT || 'salt', 100000, 64, 'sha256')
      .toString('hex');

    // If no user_id provided, create a new user/wallet
    let finalUserId = userId;
    let publicKey: string | undefined;

    if (!userId) {
      try {
        // Create new wallet/user
        const result = await UserService.onboardUser({
          email,
          phoneNumber,
        });
        finalUserId = result.userId;
        publicKey = result.publicKey;

        logger.info(`New user created during onboarding restart: ${finalUserId}`);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return JSON.stringify({
          success: false,
          error: `Failed to create new user: ${errorMessage}`,
        });
      }
    }

    // Save PIN to session
    try {
      const { data: sessionData, error: sessionError } = await supabase
        .from('agent_sessions')
        .select('id')
        .eq('session_id', sessionId)
        .single();

      if (sessionError && sessionError.code !== 'PGRST116') {
        throw sessionError;
      }

      if (sessionData) {
        // Update existing session with PIN
        const { error: updateError } = await supabase
          .from('agent_sessions')
          .update({
            session_password_hash: pinHash,
            user_id: finalUserId,
            updated_at: new Date().toISOString(),
          })
          .eq('session_id', sessionId);

        if (updateError) {
          throw updateError;
        }
      } else {
        // Create new session with PIN
        const { error: insertError } = await supabase
          .from('agent_sessions')
          .insert({
            session_id: sessionId,
            user_id: finalUserId,
            session_password_hash: pinHash,
            email: email || `${finalUserId}@talktosteller.local`,
            phone_number: phoneNumber,
            public_key: publicKey,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });

        if (insertError) {
          throw insertError;
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Failed to save PIN to session: ${errorMessage}`);
      return JSON.stringify({
        success: false,
        error: `Failed to save PIN: ${errorMessage}`,
      });
    }

    // Generate passkey registration URL if requested
    let passkeyUrl: string | undefined;
    if (requestPasskey) {
      try {
        const result = await PasskeyService.generateRegistration(finalUserId);

        const frontendUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
        passkeyUrl = `${frontendUrl}/passkey-register?challenge_id=${result.challengeId}&user_id=${finalUserId}`;

        logger.info(`Passkey registration URL generated for user ${finalUserId}`);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.warn(`Could not generate passkey registration: ${errorMessage}`);
        // Don't fail the onboarding if passkey setup fails, just log it
      }
    }

    // Build response message
    const messages = [
      `PIN definido com sucesso`,
      `Sua conta está segura com o PIN ${pin.replace(/./g, '*')}`,
    ];

    if (requestPasskey && passkeyUrl) {
      messages.push(`Próximo passo: Configure sua Passkey (biometria/face) para maior segurança`);
      messages.push(`Abra este link: ${passkeyUrl}`);
    } else if (requestPasskey && !passkeyUrl) {
      messages.push(`A Passkey não pôde ser configurada neste dispositivo. Tente novamente depois.`);
    } else {
      messages.push(`Você pode configurar uma Passkey depois se quiser.`);
    }

    return JSON.stringify({
      success: true,
      user_id: finalUserId,
      session_id: sessionId,
      public_key: publicKey,
      passkey_url: passkeyUrl,
      pin_set: true,
      message: messages.join('\n'),
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Onboarding restart error: ${errorMessage}`);
    return JSON.stringify({
      success: false,
      error: errorMessage,
    });
  }
}

/**
 * Convert tool definitions to OpenAI format with proper structure
 */
function convertToolsToOpenAIFormat(definitions: typeof toolDefinitions) {
  return definitions.map((tool: any) => ({
    type: "function" as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
    },
  }));
}

/**
 * All available tools for export
 */
export const ALL_TOOLS = convertToolsToOpenAIFormat(toolDefinitions);
