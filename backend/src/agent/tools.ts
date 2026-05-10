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
import { normalizeAssetCode, resolveConfiguredAsset } from "../config/assets";
import { ContactSeedService, repairLegacyStarterContactKey } from "../api/services/contact-seed.service";
import { BalanceAlertService } from "../api/services/balance-alert.service";
import { AutoConversionService } from "../api/services/auto-conversion.service";

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

  const route = ['XLM', ...path.map((step) => String(step.code || '').toUpperCase()).filter(Boolean)];
  return route.join(' → ');
}

/**
 * Tool definitions for OpenAI function calling
 */
export const toolDefinitions = [
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
          description: "Existing Stellar private key (secret) to import/login wallet",
        },
      },
      required: [],
    },
  },
  {
    name: "get_balance",
    description: "Get all balances of a Stellar account, including estimated USDC and BRL values when available",
    parameters: {
      type: "object",
      properties: {
        public_key: {
          type: "string",
          description: "Stellar public key to check balance for",
        },
      },
      required: ["public_key"],
    },
  },
  {
    name: "get_account",
    description: "Get detailed information about a Stellar account including all asset balances",
    parameters: {
      type: "object",
      properties: {
        public_key: {
          type: "string",
          description: "Stellar public key to look up",
        },
      },
      required: ["public_key"],
    },
  },
  {
    name: "build_payment",
    description: "Build a Stellar payment transaction (XDR format). Must be signed and submitted separately.",
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
    description: "Preview a real Stellar cross-asset transfer or wallet conversion using Horizon path data, including source amount, destination amount, network fee, and path. Use the configured issuers for USDC/BRL when the caller does not provide one.",
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
    description: "Convert assets inside the user's own wallet using a real Stellar path payment to self. Uses the vault-backed session wallet and the configured issuers for XLM, USDC, and BRL.",
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
    description: "Create a trustline for USDC, BRL, or another issued Stellar asset in the vault-backed session wallet.",
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
    description: "Create a one-time payment confirmation link for a confirmed recipient and amount.",
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
      },
      required: ["amount", "destination", "session_id", "owner_id"],
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
        public_key: {
          type: "string",
          description: "Stellar public key to get history for",
        },
        limit: {
          type: "number",
          description: "Maximum number of transactions to return (default 10)",
        },
      },
      required: ["public_key"],
    },
  },
  {
    name: "add_contact",
    description: "Add a new contact with their Stellar public key or TalkToStellar Pix key",
    parameters: {
      type: "object",
      properties: {
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
          description: "Contact's TalkToStellar Pix key",
        },
      },
      required: ["user_id", "contact_name"],
    },
  },
  {
    name: "list_contacts",
    description: "Get all saved contacts for the user",
    parameters: {
      type: "object",
      properties: {
        user_id: {
          type: "string",
          description: "Your user ID",
        },
      },
      required: ["user_id"],
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
      case "create_wallet":
        return await executeCreateWallet(toolInput);
      case "get_balance":
        return await executeGetBalance(toolInput);
      case "get_account":
        return await executeGetAccount(toolInput);
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
      case "submit_transaction":
        return await executeSubmitTransaction(toolInput);
      case "get_transaction_history":
        return await executeGetHistory(toolInput);
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

async function executeLogoutSession(input: any): Promise<string> {
  try {
    const sessionId = String(input.session_id || '').trim();
    if (!sessionId) {
      return JSON.stringify({
        success: false,
        error: "session_id é obrigatório",
      });
    }

    // Do not delete agent_sessions row; agent_messages references session_id via FK.
    // Deleting here causes subsequent message persistence to fail in the same request flow.
    const { error } = await supabase
      .from('agent_sessions')
      .update({
        public_key: null,
        last_activity: new Date().toISOString(),
      })
      .eq('session_id', sessionId);

    if (error) {
      throw new Error(error.message || 'Falha ao encerrar sessão');
    }

    // Clear runtime state tied to wallet/payment context.
    await supabase
      .from('agent_states')
      .update({
        action_params: {},
        pending_payment: null,
        updated_at: new Date().toISOString(),
      })
      .eq('session_id', sessionId);

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
      vault_secret_id: result.vaultSecretId || null,
      message: input.secret_key
        ? "Account created successfully! The private key was stored securely in Vault."
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
    logger.debug(`Tool: Getting balance for ${input.public_key}`);
    const account = await stellarService.getAccount(input.public_key);

    const balances = account.balances.map((balance: any) => {
      const asset = getAssetCode(balance);
      return {
        asset,
        balance: balance.balance,
        asset_type: balance.asset_type,
        asset_issuer: balance.asset_issuer,
      };
    });

    const nativeBalance = balances.find((balance: any) => balance.asset === 'XLM');
    return JSON.stringify({
      success: true,
      public_key: input.public_key,
      balance: nativeBalance?.balance || "0",
      asset: "XLM",
      balances,
      message: `Account balances retrieved: ${balances.length} asset(s)`,
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
    logger.debug(`Tool: Getting account details for ${input.public_key}`);
    const account = await stellarService.getAccount(input.public_key);
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

    return JSON.stringify({
      success: true,
      quote,
      message:
        (sourceAmount
          ? `Cotação: converter ${quote.sourceAmount} ${quote.sourceAsset.code} deve entregar aproximadamente ${quote.destinationAmount} ${quote.destinationAsset.code}. `
          : `Cotação: para receber ${quote.destinationAmount} ${quote.destinationAsset.code}, serão usados aproximadamente ${quote.sourceAmount} ${quote.sourceAsset.code}. `) +
        `Rota usada: ${formatQuotePath(quote.path)}. ` +
        `Taxa da rede: ${quote.networkFeeXlm} XLM.`,
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
      throw new Error('Wallet with vault-backed private key not found for this session.');
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
    const feeLine = submittedDetails?.feeXlm ? ` Taxa da rede: ${submittedDetails.feeXlm} XLM.` : '';

    return JSON.stringify({
      success: true,
      hash: result.hash,
      quote,
      transferDetails: submittedDetails,
      operation_type: operationType,
      message:
        `Conversão concluída: ${sourceAmount} ${sourceAssetCode} ` +
        `para ${destinationAmount} ${destinationAssetCode}.` +
        ` Rota usada: ${formatQuotePath(quote.path)}.` +
        `${feeLine} Hash: ${result.hash}`,
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
      throw new Error('Wallet with vault-backed private key not found for this session.');
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
    const normalizedAmount = input.amount ? String(input.amount).trim() : '';

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

    const assetCode = normalizeAssetCode(input.asset_code || input.asset || input.currency || 'XLM');
    const asset = normalizeAssetInput(assetCode, input.asset_issuer || input.assetIssuer);

    const { url } = externalService.createPaymentConfirmUrl({
      amount: normalizedAmount,
      asset_code: asset.code,
      asset_issuer: asset.issuer,
      destination: normalizedDestination,
      destination_name: destinationName,
      destination_contact: input.destination_contact || undefined,
      session_id: String(input.session_id),
      owner_id: String(input.owner_id),
    });

    return JSON.stringify({
      success: true,
      url,
      asset: asset.code,
      message: `Para confirmar o envio para ${destinationName || normalizedDestination}, abra o link de confirmação:\n\n${url}`,
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
      message: `Transaction submitted successfully! Hash: ${txHash}`,
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
    logger.debug(`Tool: Getting transaction history for ${input.public_key}`);
    const operations = await stellarService.getOperationHistory(
      input.public_key,
      input.limit || 10
    );

    const formattedOps = operations.map((op: any) => {
      const asset = getAssetCode(op);
      const amount = op.amount || op.starting_balance || op.source_amount || op.amount_in || op.amount_out;
      const from = op.from || op.source_account || op.funder || op.account;
      const to = op.to || op.account || op.into;
      const direction = to === input.public_key ? 'received' : from === input.public_key ? 'sent' : 'related';

      return {
        id: op.id,
        type: op.type,
        date: op.created_at,
        hash: op.transaction_hash,
        source: op.source_account,
        from,
        to,
        direction,
        asset,
        amount: amount ? String(amount) : undefined,
        asset_issuer: op.asset_issuer,
      };
    });
    return JSON.stringify({
      success: true,
      public_key: input.public_key,
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

/**
 * Tool: Add Contact
 */
async function resolveContactPublicKeyByPixKey(pixKey: string): Promise<{ publicKey?: string; name?: string; pixKey?: string }> {
  const normalizedPixKey = String(pixKey || '').trim().toLowerCase();
  if (!normalizedPixKey) return {};

  const { data: walletRow, error: walletError } = await supabase
    .from('wallets')
    .select('public_key, name, pix_key')
    .ilike('pix_key', normalizedPixKey)
    .limit(1)
    .maybeSingle();

  if (walletError) {
    throw new Error(walletError.message || 'Failed to lookup wallet Pix key');
  }

  if (walletRow?.public_key) {
    return {
      publicKey: String(walletRow.public_key),
      name: walletRow.name || undefined,
      pixKey: walletRow.pix_key || normalizedPixKey,
    };
  }

  const { data: contactRow, error: contactError } = await supabase
    .from('contacts')
    .select('contact_name, stellar_public_key, pix_key')
    .ilike('pix_key', normalizedPixKey)
    .limit(1)
    .maybeSingle();

  if (contactError) {
    throw new Error(contactError.message || 'Failed to lookup contact Pix key');
  }

  return {
    publicKey: contactRow?.stellar_public_key || undefined,
    name: contactRow?.contact_name || undefined,
    pixKey: contactRow?.pix_key || normalizedPixKey,
  };
}

async function executeAddContact(input: any): Promise<string> {
  try {
    logger.debug(`Tool: Adding contact ${input.contact_name}`);
    const contactKey = String(input.public_key || input.stellar_public_key || input.pix_key || input.contact_key || '').trim();
    const isPublicKey = /^G[A-Z2-7]{55}$/i.test(contactKey);
    const pixKeyInput = String(input.pix_key || (!isPublicKey ? contactKey : '') || '').trim().toLowerCase();
    const resolved = pixKeyInput ? await resolveContactPublicKeyByPixKey(pixKeyInput) : {};
    const publicKey = isPublicKey ? contactKey : String(resolved.publicKey || '').trim();

    if (!publicKey) {
      throw new Error('Informe uma chave pública Stellar válida ou uma chave Pix TalkToStellar existente.');
    }

    const contactName = String(input.contact_name || resolved.name || pixKeyInput || publicKey).trim();

    const { data, error } = await supabase
      .from("contacts")
      .upsert({
        owner_id: input.user_id,
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
    return JSON.stringify({
      success: true,
      contact: data,
      message: `Contato "${contactName}" adicionado com sucesso.`,
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
    logger.debug(`Tool: Listing contacts from database for user ${input.user_id}`);

    let query = supabase
      .from("contacts")
      .select("id, owner_id, contact_name, stellar_public_key, phone_number, pix_key, created_at")
      .order("contact_name", { ascending: true });

    if (input.user_id) {
      query = query.eq("owner_id", input.user_id);
    }

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
    logger.debug(`executeListContacts: returning ${((contacts||[]).length)} contacts for user ${input.user_id || '<all>'}`);
    logger.debug(`executeListContacts: contacts data=${JSON.stringify(contacts?.slice(0,50) || [])}`);

    return JSON.stringify({
      success: true,
      contact_count: contacts?.length || 0,
      contacts: contacts || [],
      message: `Found ${(contacts || []).length} wallet contacts`,
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
    let vaultSecretId: string | undefined;

    if (!userId) {
      try {
        // Create new wallet/user
        const result = await UserService.onboardUser({
          email,
          phoneNumber,
        });
        finalUserId = result.userId;
        publicKey = result.publicKey;
        vaultSecretId = result.vaultSecretId;

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
      `✓ PIN definido com sucesso`,
      `✓ Sua conta está segura com o PIN ${pin.replace(/./g, '*')}`,
    ];

    if (requestPasskey && passkeyUrl) {
      messages.push(`✓ Próximo passo: Configure sua Passkey (biometria/face) para maior segurança`);
      messages.push(`Abra este link: ${passkeyUrl}`);
    } else if (requestPasskey && !passkeyUrl) {
      messages.push(`⚠ A Passkey não pôde ser configurada neste dispositivo. Tente novamente depois.`);
    } else {
      messages.push(`Você pode configurar uma Passkey depois se quiser.`);
    }

    return JSON.stringify({
      success: true,
      user_id: finalUserId,
      session_id: sessionId,
      public_key: publicKey,
      vault_secret_id: vaultSecretId,
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
