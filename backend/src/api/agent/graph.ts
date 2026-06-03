/**
 * LangChain Agent with Tool Support for TalkToStellar
 * Handles intent detection, tool calling, and response generation
 */

import { RunnableConfig } from "@langchain/core/runnables";
import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage, AIMessage, ToolMessage, BaseMessage, SystemMessage } from "@langchain/core/messages";
import { AgentState, IntentType, ActionType } from "./types";
import { AgentRepository } from "../repository/core/agent.repository";
import { ALL_TOOLS, executeTool } from "./tools";
import { buildCapabilityHelpMessage } from "./capability-help";
import { logger } from "../../utils/logger";
import ExternalService from '../services/core/external.service';
import { supabase } from '../../config/supabase';
import { getAssetIssuer, getStellarNetworkName, resolveConfiguredAsset } from '../../config/assets';
import { WalletRepository } from '../repository/core/wallet.repository';
import { ActivityFeedService } from '../services/activity-feed.service';
import { normalizeHumanAmountText, parseHumanAmountNumber } from '../../utils/amount';
import crypto from 'crypto';

const walletRepo = new WalletRepository(supabase as any);
const INTENT_ROUTER_MAX_MESSAGE_LENGTH = 1600;

type IntentRouteCandidate = {
  intent: IntentType;
  toolName: string;
  confidence: number;
  reason?: string;
  needsClarification?: boolean;
  language?: 'pt-BR' | 'en';
  risk?: 'low' | 'medium' | 'high';
  amount?: string;
  assetCode?: string;
  sourceAssetCode?: string;
  destAssetCode?: string;
  quoteMode?: 'market_price' | 'send_exact';
  allQuotes?: boolean;
  recipientQuery?: string;
};

const INTENT_ROUTING_SPECS: Array<{ intent: IntentType; toolName: string; description: string }> = [
  {
    intent: IntentType.PIX,
    toolName: 'route_pix_onramp_intent',
    description: 'Use for own-account PIX entrada/on-ramp only: the user wants to put/add/load/deposit/bring/receive money into their own TalkToStellar account via PIX. Portuguese examples: "colocar 100 reais via pix", "me ajude com o colocar 100 reais via pix", "me ajuda a adicionar 100 reais por PIX", "adicionar saldo com pix de 100 reais", "depositar via PIX", "trazer 50 reais via PIX", "receber um PIX na minha conta". This route never requires a contact, email, phone, recipient, destination public key, saved contact, or human recipient. Never use this if the message has PIX plus a named recipient/person after pra/para/pro/a, such as "fazer PIX pra Ana Silva de 100 XLM" or typo "uero fazer pix pra ana silva de 100 xlm". Those are route_pix_intent because PIX funds a payment to that contact. In those cases the amount/asset is the final recipient target, not BRL for the sender own account.',
  },
  {
    intent: IntentType.PIX,
    toolName: 'route_pix_offramp_intent',
    description: 'Use for PIX saída/off-ramp only: the user wants money to leave their TalkToStellar account to their own PIX/bank/key. Portuguese examples: "sacar 50 reais para meu PIX", "retirar 20 USDC para minha chave PIX", "mandar pra fora 50 reais em pix", "uero mandar 100 reais pra fora do pix", "tirar da conta para o banco". This route wins over normal payment only when the destination is the user own PIX, own bank exit, or explicitly "pra fora" through PIX. Do not use this for plain external-transfer wording with a conversion layer like "uero mandar 10 usdc em xlm pra fora"; that is route_payment_intent with source_asset_code=USDC, dest_asset_code=XLM, amount=10, and needs_clarification=true if the external destination/key is missing.',
  },
  {
    intent: IntentType.PIX,
    toolName: 'route_pix_intent',
    description: 'Use for PIX money movement when PIX is paying or funding a payment to another person/contact/recipient, including saved contacts. PIX wins over contacts and generic payment when PIX is mentioned with money movement. If the user says "fazer PIX pra Ana Silva de 100 XLM", "uero fazer pix pra ana silva de 100 xlm", "pagar Ana via PIX", or "mandar PIX para Carlos de 20 USDC", route here: the PIX funds a contact payment and the amount/asset is the final amount the recipient should receive. The phrase "de 100 XLM" means 100 XLM to Ana, not R$100 into the sender own account. Also use this for follow-up messages that complete a previous send/payment request: if the previous context has amount/asset such as "quero mandar 100 CETES" and the latest message says "pra Ana Silva via PIX", route_pix_intent with amount="100", asset_code="CETES", recipient_query="Ana Silva". If the user is adding/depositing/loading/placing money into their own account via PIX and no separate recipient is named, prefer route_pix_onramp_intent. If the user is withdrawing/sending out to their own PIX/bank, prefer route_pix_offramp_intent.',
  },
  {
    intent: IntentType.BALANCE,
    toolName: 'route_balance_intent',
    description: 'Use when the user asks for account balance/saldo, available money, quanto tenho, sald9, sald0, saldp, balances, or current holdings in the wallet.',
  },
  {
    intent: IntentType.CONTACTS,
    toolName: 'route_contacts_intent',
    description: 'Use only when the user is explicitly managing saved contacts/destinatarios/favorites/beneficiaries: list, see, add, save, edit, or choose a contact. Contact routing requires explicit contact-management meaning. Do not use for adding/colocar/depositing money or balance. Do not use for PIX top-up/on-ramp phrases such as "colocar 100 reais via pix" or "me ajude com o colocar 100 reais via pix"; those are route_pix_onramp_intent and must not ask for contact key/email/phone/public key. If the message contains PIX money movement or own-account top-up, this contacts tool is invalid even if the verb is adicionar/colocar.',
  },
  {
    intent: IntentType.CONVERSION,
    toolName: 'route_conversion_intent',
    description: 'Use when the user wants to convert/trocar/cambiar/swap one asset into another, including BRL, USDC/USD, CETES, XLM, or when they say converter dinheiro without enough details.',
  },
  {
    intent: IntentType.YIELD,
    toolName: 'route_yield_intent',
    description: 'Use when the user asks about investments, rendimentos, dinheiro rendendo, aplicacoes/aplicações/aolicacoes, positions/posicoes, aplicar, investir, current investment positions, or adding/removing money from those options.',
  },
  {
    intent: IntentType.PAYMENT,
    toolName: 'route_payment_intent',
    description: 'Use for any request to send, pay, transfer, or move a concrete amount in a concrete asset to another recipient such as a saved contact, person name, email, phone, CPF, transfer key, or external wallet, when PIX is not the requested rail and destination is not the user own PIX/bank exit. Do not use for PIX top-up/deposit/add-balance requests like colocar/adicionar/depositar 100 reais via PIX; those are route_pix_onramp_intent and must not ask for a contact key. Interpret typo-heavy Portuguese semantically. A money-transfer request with amount, asset, and recipient must not become general help. For layered external transfers like "uero mandar 10 usdc em xlm pra fora", route here: amount=10, source_asset_code=USDC, asset_code=USDC, dest_asset_code=XLM, needs_clarification=true if no actual contact/email/phone/public key is provided. This means convert USDC to XLM first, then transfer XLM.',
  },
  {
    intent: IntentType.PAYMENT_LINK,
    toolName: 'route_payment_link_intent',
    description: 'Use when the user wants to create, generate, open, share, charge/cobrar, receive with, or get a payment/receive link. Payment-link creation does not require an existing contact.',
  },
  {
    intent: IntentType.HISTORY,
    toolName: 'route_history_intent',
    description: 'Use when the user asks for history, extrato, transacoes, movimentacoes, receipts/comprovantes/recibos, or recent operations.',
  },
  {
    intent: IntentType.PRICE_QUOTE,
    toolName: 'route_price_quote_intent',
    description: 'Use when the user asks for best route/melhor rota, route quality, rate/cotacao, estimated fees, comparison, quote, cost, spread, or whether it is worth doing before starting a transaction. For generic fee/cost questions without enough pair details, route here with needs_clarification=true. For "todas as cotações", "todas as cotacoes", "todas as taxas", "tabela de câmbio", "matriz de conversão", or "uero ver todas as cotacoes aqui", set all_quotes=true and do not fill a single pair. For any two-asset quote such as XLM/USDC, BRL para CETES, USDC pra BRL, or CETES to XLM, fill source_asset_code and dest_asset_code. For a single-asset quote in Portuguese/Brazil context such as "cotação do CETES", "preço do XLM", "uero ver a cotacao do cetes", set source_asset_code to that asset, dest_asset_code=BRL, and quote_mode=market_price. Use quote_mode=market_price for price/cotacao/preco/custo of an asset in another asset, and quote_mode=send_exact for "de A para B", conversion, sell, or route direction questions.',
  },
  {
    intent: IntentType.FINANCIAL_MEMORY,
    toolName: 'route_financial_memory_intent',
    description: 'Use when the user asks about saved transaction nicknames, financial memory, remembered labels, spending/savings summaries, or comparing previous activity.',
  },
  {
    intent: IntentType.RESET_PIN,
    toolName: 'route_reset_pin_intent',
    description: 'Use when the user asks to change, reset, recover, update, alter, redefine, troubleshoot, or fix account PIN/security, even with typos such as redefimir/redefinir/uero or very short wording. PIN change/reset/recovery requests must never become general help.',
  },
  {
    intent: IntentType.WALLET_LOGOUT,
    toolName: 'route_wallet_logout_intent',
    description: 'Use when the user asks to logout, sign out, deslogar, sair da conta, disconnect, close session, or end account session.',
  },
  {
    intent: IntentType.LOGIN,
    toolName: 'route_login_intent',
    description: 'Use when the user asks to login, entrar, acessar conta, sign in, reconnect an existing account, or continue an existing account.',
  },
  {
    intent: IntentType.ONBOARD,
    toolName: 'route_onboard_intent',
    description: 'Use when the user asks to create/register/cadastrar/open a new account or start onboarding.',
  },
  {
    intent: IntentType.WALLET,
    toolName: 'route_wallet_intent',
    description: 'Use for wallet setup, wallet creation, account connection, wallet public key, or general wallet management that is not login/logout.',
  },
  {
    intent: IntentType.GENERAL,
    toolName: 'route_general_intent',
    description: 'Use only for greetings, broad help/menu/capability questions, unsupported small talk, or messages that are truly not an actionable TalkToStellar request. Never use for actionable product requests, PIN/security changes, or money-transfer requests that contain a transfer verb, amount, asset, and recipient.',
  },
];

const INTENT_ROUTING_TOOLS = INTENT_ROUTING_SPECS.map((spec) => ({
  type: 'function' as const,
  function: {
    name: spec.toolName,
    description: spec.description,
    parameters: {
      type: 'object',
      properties: {
        confidence: {
          type: 'number',
          description: 'Confidence from 0 to 1 that this is the best single route.',
        },
        reason: {
          type: 'string',
          description: 'Short internal reason for the selected route. This is not shown to the user.',
        },
        needs_clarification: {
          type: 'boolean',
          description: 'True when the route is clear but the downstream action still needs details such as amount, asset, destination, or PIN.',
        },
        language: {
          type: 'string',
          enum: ['pt-BR', 'en'],
          description: 'The language the user is using for this request.',
        },
        risk: {
          type: 'string',
          enum: ['low', 'medium', 'high'],
          description: 'Risk level of the requested action. Use high for money movement, security/PIN, login/logout, or account access.',
        },
        amount: {
          type: 'string',
          description: 'Optional normalized decimal amount from the user message. For PIX-funded contact payment, this is the final amount the recipient should receive. For layered external transfers such as "10 USDC em XLM pra fora", this is the source amount being spent.',
        },
        asset_code: {
          type: 'string',
          enum: ['BRL', 'USDC', 'CETES', 'XLM', ''],
          description: 'Optional normalized asset/currency from the user message. Use USDC for dollars/USD. For single-asset quote requests, also fill source_asset_code/dest_asset_code instead of relying only on this field. For PIX-funded contact payment, this is the final recipient asset, e.g. 100 XLM means asset_code XLM. For layered external transfers, use the source asset here and also fill source_asset_code/dest_asset_code.',
        },
        source_asset_code: {
          type: 'string',
          enum: ['BRL', 'USDC', 'CETES', 'XLM', ''],
          description: 'Optional source/origin asset for quote, conversion, route, fee, cost, or layered transfer requests. Example: "cotacao XLM para USDC" means source_asset_code XLM. For "cotação do CETES" or "preço do XLM", use CETES/XLM as source_asset_code. "mandar 10 USDC em XLM pra fora" means source_asset_code USDC.',
        },
        dest_asset_code: {
          type: 'string',
          enum: ['BRL', 'USDC', 'CETES', 'XLM', ''],
          description: 'Optional destination/target asset for quote, conversion, route, fee, cost, or layered transfer requests. Example: "cotacao XLM para USDC" means dest_asset_code USDC. "mandar 10 USDC em XLM pra fora" means dest_asset_code XLM. For single-asset quotes in Portuguese/Brazil context, default to BRL.',
        },
        quote_mode: {
          type: 'string',
          enum: ['market_price', 'send_exact', ''],
          description: 'For quote/rate requests only. Use market_price for price/cotacao/custo questions like "cotacao XLM/BRL", "preco de XLM em reais", or "quanto custa 100 XLM". Use send_exact for sell/convert/send simulation like "converter 100 XLM para BRL" or "quanto recebo se mandar 100 XLM para BRL".',
        },
        all_quotes: {
          type: 'boolean',
          description: 'True only when the user asks for all quotes/rates, all pairs, a quote table, or the full conversion matrix. Example: "uero ver todas as cotacoes aqui".',
        },
        recipient_query: {
          type: 'string',
          description: 'Optional recipient/contact exactly as understood from the user message. Use for payment and PIX-funded contact payments. Leave empty for own-account PIX on-ramp/off-ramp.',
        },
      },
      required: ['confidence', 'reason', 'needs_clarification', 'language', 'risk'],
    },
  },
}));

const INTENT_BY_ROUTING_TOOL = new Map(
  INTENT_ROUTING_SPECS.map((spec) => [spec.toolName, spec.intent] as const),
);

function ensureHttpProtocol(value: string): string {
  const trimmed = String(value || '').trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function normalizeFrontendBase(value: string): string {
  const normalized = ensureHttpProtocol(value);
  return normalized ? normalized.replace(/\/$/, '') : '';
}

function isLocalhostUrl(value: string): boolean {
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)/i.test(String(value || '').trim());
}

function resolveFrontendBase(candidates: Array<string | undefined>, fallback = 'http://localhost:3000'): string {
  const normalized = candidates
    .map((value) => normalizeFrontendBase(String(value || '')))
    .filter(Boolean);
  const hosted = normalized.find((value) => !isLocalhostUrl(value));
  return hosted || normalized[0] || fallback;
}

function normalizeExternalSessionScope(value: unknown): 'whatsapp' | 'telegram' | '' {
  const normalized = String(value || '').trim().toLowerCase();
  if (!normalized) return '';
  if (normalized.includes('telegram')) return 'telegram';
  if (
    normalized.includes('whatsapp') ||
    normalized.includes('evolution') ||
    normalized === 'phone'
  ) return 'whatsapp';
  return '';
}

export class AgentGraph {
  private llm: ChatOpenAI;
  private repository: AgentRepository;
  private systemPrompt: string;
  private externalService: ExternalService;
  private openaiApiKey: string;
  private lastIntentRouterFailure: string | null = null;
  private lastIntentRouteCandidate: IntentRouteCandidate | null = null;

  constructor(repository: AgentRepository, openaiApiKey: string, systemPrompt: string) {
    this.repository = repository;
    this.systemPrompt = systemPrompt;
    this.externalService = new ExternalService(supabase as any);
    this.openaiApiKey = openaiApiKey;
    this.llm = new ChatOpenAI({
      openAIApiKey: openaiApiKey,
      temperature: parseFloat(process.env.TEMPERATURE || "0.1"),
      modelName: process.env.OPENAI_MODEL || "gpt-4o",

    });

    logger.info("Agent initialized with Stellar tools available");
  }

  private normalizeLanguage(value: unknown): 'pt-BR' | 'en' {
    const normalized = String(value || '').trim().toLowerCase();
    if (normalized === 'en' || normalized.startsWith('en-') || normalized.includes('english')) return 'en';
    return 'pt-BR';
  }

  private getLanguage(state?: Partial<AgentState> | null): 'pt-BR' | 'en' {
    return this.normalizeLanguage((state?.action_params as any)?.language || (state as any)?.language);
  }

  private text(language: 'pt-BR' | 'en', pt: string, en: string): string {
    return language === 'en' ? en : pt;
  }

  private shouldUseLlmIntentRouter(): boolean {
    const key = String(this.openaiApiKey || '').trim().toLowerCase();
    return Boolean(key && key !== 'test-openai-key' && !key.startsWith('test-'));
  }

  private getIntentRouterUnavailableMessage(language: 'pt-BR' | 'en'): string {
    return this.text(
      language,
      'Estou com instabilidade para entender pedidos agora. Tente novamente em alguns segundos. Para ações com dinheiro, mande uma frase com ação, valor, moeda e destino.',
      'I am having trouble understanding requests right now. Try again in a few seconds. For money actions, send one sentence with action, amount, currency, and destination.'
    );
  }

  private languageInstruction(language: 'pt-BR' | 'en'): string {
    return language === 'en'
      ? 'IMPORTANT: Reply in English. Keep all user-facing copy in English unless the user explicitly asks for Portuguese.'
      : 'IMPORTANTE: Responda em portugues do Brasil. Mantenha todo texto ao usuario em portugues, salvo se ele pedir ingles.';
  }

  private buildSystemPrompt(language: 'pt-BR' | 'en'): string {
    return `${this.systemPrompt}\n\n## CURRENT LANGUAGE\n${this.languageInstruction(language)}`;
  }

  private extractLanguagePreference(text: string): 'pt-BR' | 'en' | null {
    const normalized = String(text || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
    if (!normalized) return null;
    if (/^(english|en|speak english|talk in english|answer in english|switch to english|use english|in english)$/i.test(normalized)) {
      return 'en';
    }
    if (/^(portugues|portuguese|pt|pt-br|fale portugues|falar portugues|responda em portugues|switch to portuguese|use portuguese)$/i.test(normalized)) {
      return 'pt-BR';
    }
    if (/\b(speak|talk|answer|respond|switch|use)\s+in\s+english\b/.test(normalized)) return 'en';
    if (/\b(fale|responda|mude|troque|use)\b.*\b(portugues|pt-br)\b/.test(normalized)) return 'pt-BR';
    return null;
  }

  private extractToolCalls(response: any): Array<{ id?: string; name: string; args?: Record<string, any> }> {
    const calls = response?.tool_calls || response?.additional_kwargs?.tool_calls || [];
    logger.debug(`[extractToolCalls] Raw tool_calls: ${JSON.stringify(calls)}`);
    logger.debug(`[extractToolCalls] Response keys: ${JSON.stringify(Object.keys(response || {}))}`);
    logger.debug(`[extractToolCalls] Additional kwargs keys: ${JSON.stringify(Object.keys(response?.additional_kwargs || {}))}`);
    const parseArgs = (value: any): Record<string, any> => {
      if (!value) return {};
      if (typeof value === 'string') {
        try {
          const parsed = JSON.parse(value);
          return parsed && typeof parsed === 'object' ? parsed : {};
        } catch {
          return {};
        }
      }
      return typeof value === 'object' ? value : {};
    };

    const result = Array.isArray(calls)
      ? calls
          .map((call: any) => {
            const name = call.name || call.function?.name || call.toolName || call.tool_name || '';
            const args = parseArgs(call.args || call.arguments || call.input || call.function?.arguments);
            return {
              id: call.id || call.tool_call_id,
              name,
              args,
            };
          })
          .filter((call) => call.name)
      : [];
    logger.debug(`[extractToolCalls] Mapped tool calls: ${JSON.stringify(result)}`);
    return result;
  }

  private sanitizeAssistantLinks(content: string): string {
    return String(content || '')
      .replace(/\[([^\]\n]+)\]\((https?:\/\/[^)\s]+)\)/g, (_match, label, url) => `${String(label).trim()}:\n${String(url).trim()}`)
      .replace(/\[([^\]\n]+)\]\(\s*\)/g, '$1')
      .replace(/\[([^\]\n]+)\]\(\s*([^)\s]+)\s*\)/g, (_match, label, url) => `${String(label).trim()}:\n${String(url).trim()}`)
      .trim();
  }

  private isApprovedRichWhatsappMessage(content: string): boolean {
    const normalized = String(content || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();

    const hasSavingsCore =
      normalized.includes('economiz') ||
      normalized.includes('taxa talktostellar') ||
      normalized.includes('banco tradicional');

    const isKnownTemplate =
      normalized.includes('simulacao de envio') ||
      normalized.includes('transferencia concluida') ||
      normalized.includes('conversao concluida') ||
      normalized.includes('seu resumo de economia');

    return hasSavingsCore && isKnownTemplate;
  }

  private sanitizeUserFacingTechnicalTerms(content: string, language: 'pt-BR' | 'en' = 'pt-BR'): string {
    const yieldReplacement = language === 'en' ? 'investments' : 'dinheiro rendendo';
    const reviewReplacement = language === 'en' ? 'earnings' : 'rendimentos';

    return String(content || '')
      .split('\n')
      .map((line) => {
        if (/https?:\/\//i.test(line)) return line;
        return line
          .replace(/\bquero\s+ver\s+(?:o\s+)?yield\b/gi, language === 'en' ? 'I want to see investments' : 'quero ver dinheiro rendendo')
          .replace(/\bver\s+(?:o\s+)?yield\b/gi, language === 'en' ? 'see investments' : 'ver dinheiro rendendo')
          .replace(/\byield\s+options\b/gi, language === 'en' ? 'earnings options' : 'opções de rendimentos')
          .replace(/\byield\s+review\b/gi, reviewReplacement)
          .replace(/\byield\b/gi, yieldReplacement);
      })
      .join('\n');
  }

  private sanitizeAssistantResponse(content: string, language: 'pt-BR' | 'en' = 'pt-BR'): string {
    const linkSafe = this.sanitizeAssistantLinks(content);
    const productSafe = this.sanitizeUserFacingTechnicalTerms(linkSafe, language);
    if (this.isApprovedRichWhatsappMessage(productSafe)) {
      return productSafe;
    }

    return productSafe
      .replace(/[\u2705\u2713\u26A0\u2B07\uFE0F]/g, '')
      .replace(/\p{Extended_Pictographic}/gu, '')
      .trim();
  }

  private async saveAssistantResponse(state: AgentState): Promise<void> {
    state.response_message = this.sanitizeAssistantResponse(state.response_message, this.getLanguage(state));
    await this.repository.saveMessage(state.session_id, 'assistant', state.response_message);
  }

  private async getContactNameByPublicKey(publicKey: string, userId?: string): Promise<string | undefined> {
    try {
      if (!userId || !publicKey) {
        return undefined;
      }

      const contacts = await this.fetchContacts(userId);

      const contact = contacts.find((c: any) => 
        c.stellar_public_key === publicKey || c.public_key === publicKey || c.destination_public_key === publicKey
      );

      return contact?.contact_name || contact?.name;
    } catch (error) {
      logger.debug(`[getContactNameByPublicKey] Error: ${error}`);
      return undefined;
    }
  }

  private async getContactByPublicKeyOrName(query: string, userId?: string): Promise<any | undefined> {
    try {
      if (!userId || !query) {
        return undefined;
      }

      const contacts = await this.fetchContacts(userId);
      const normalizedQuery = query.trim().toLowerCase();
      const normalizedLookup = this.normalizeLookup(query);
      const normalizePhone = (value: string) => String(value || '').replace(/\D+/g, '');
      const hasAtSymbol = normalizedQuery.includes('@');
      const normalizeIdentifier = (value: string) => String(value || '').trim().toLowerCase();
      const contactIdentifiers = (contact: any): string[] => {
        const raw = [
          contact?.pix_key,
          contact?.email,
          contact?.phone_number,
          contact?.cpf,
          contact?.contact_profile?.pix_key,
          contact?.contact_profile?.email,
          contact?.contact_profile?.phone_number,
          contact?.contact_profile?.cpf,
          contact?.identifier,
          contact?.contact_profile?.identifier,
        ];

        const normalized = raw
          .map((value: any) => normalizeIdentifier(value))
          .filter(Boolean);

        return Array.from(new Set(normalized));
      };
      const contactNames = (contact: any): string[] => {
        const raw = [
          contact?.contact_name,
          contact?.name,
          contact?.display_label,
          contact?.contact_profile?.name,
        ];

        const normalized = raw
          .map((value: any) => String(value || '').trim())
          .filter(Boolean);

        return Array.from(new Set(normalized));
      };

      const isPublicKey = /^G[A-Z2-7]{55}$/i.test(normalizedQuery);
      if (isPublicKey) {
        return contacts.find((c: any) =>
          String(c.stellar_public_key || c.public_key || c.destination_public_key || '').trim() === query.trim()
        );
      }

      const queryPhone = normalizePhone(query);
      if (queryPhone.length >= 8) {
        const byPhone = contacts.find((c: any) => {
          const phones = [
            String(c?.phone_number || ''),
            String(c?.contact_profile?.phone_number || ''),
          ];
          return phones.some((phone: string) => normalizePhone(phone) === queryPhone);
        });
        if (byPhone) {
          return byPhone;
        }
      }

      const byIdentifier = contacts.find((c: any) => {
        const identifiers = contactIdentifiers(c);
        return identifiers.some((identifier) => {
          if (hasAtSymbol) {
            return identifier === normalizedQuery;
          }
          return this.normalizeLookup(identifier) === normalizedLookup;
        });
      });
      if (byIdentifier) {
        return byIdentifier;
      }

      // Support positional aliases like "contato 1" / "contact 1"
      const aliasMatch = normalizedQuery.match(/^(?:contato|contact)\s*(\d{1,3})$/);
      if (aliasMatch) {
        const idx = Number(aliasMatch[1]);
        if (Number.isFinite(idx) && idx >= 1 && idx <= contacts.length) {
          return contacts[idx - 1];
        }
      }

      const byName = contacts.find((c: any) => {
        const names = contactNames(c);
        return names.some((name) => {
          const normalizedName = this.normalizeLookup(name);
          return (
            name.toLowerCase() === normalizedQuery ||
            normalizedName === normalizedLookup ||
            normalizedName.includes(normalizedLookup) ||
            normalizedLookup.includes(normalizedName)
          );
        });
      });
      if (byName) {
        return byName;
      }

      const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedQuery);
      if (isEmail) {
        const globalEmail = await this.lookupGlobalContactByEmail(normalizedQuery);
        if (globalEmail) {
          return globalEmail;
        }
      }

      const byPix = contacts.find((c: any) => String(c.pix_key || '').trim().toLowerCase() === normalizedQuery);
      if (byPix) {
        return byPix;
      }

      const globalPix = await this.lookupGlobalContactByPixKey(normalizedQuery);
      if (globalPix) {
        return globalPix;
      }
      return undefined;
    } catch (error) {
      logger.debug(`[getContactByPublicKeyOrName] Error: ${error}`);
      return undefined;
    }
  }

  private async lookupGlobalContactByPixKey(pixKey: string): Promise<any | undefined> {
    const normalizedPixKey = String(pixKey || '').trim().toLowerCase();
    if (!normalizedPixKey) return undefined;

    try {
      const { data: walletRow, error: walletError } = await supabase
        .from('wallets')
        .select('public_key, name, pix_key')
        .ilike('pix_key', normalizedPixKey)
        .limit(1)
        .maybeSingle();

      if (!walletError && walletRow?.public_key) {
        return {
          contact_name: walletRow.name || normalizedPixKey,
          stellar_public_key: walletRow.public_key,
          pix_key: walletRow.pix_key || normalizedPixKey,
        };
      }

      const { data: contactRow, error: contactError } = await supabase
        .from('contacts')
        .select('contact_name, stellar_public_key, pix_key')
        .ilike('pix_key', normalizedPixKey)
        .limit(1)
        .maybeSingle();

      if (!contactError && contactRow?.stellar_public_key) {
        return contactRow;
      }
    } catch (error) {
      logger.debug(`[lookupGlobalContactByPixKey] Error: ${error}`);
    }

    return undefined;
  }

  private async lookupGlobalContactByEmail(email: string): Promise<any | undefined> {
    const normalizedEmail = String(email || '').trim().toLowerCase();
    if (!normalizedEmail) return undefined;

    try {
      const { data: sessionsByEmail } = await supabase
        .from('agent_sessions')
        .select('session_id, user_id, email')
        .eq('email', normalizedEmail)
        .order('updated_at', { ascending: false })
        .limit(1);

      const { data: sessionsByUserId } = await supabase
        .from('agent_sessions')
        .select('session_id, user_id, email')
        .eq('user_id', normalizedEmail)
        .order('updated_at', { ascending: false })
        .limit(1);

      const sessionCandidate = [...(sessionsByEmail || []), ...(sessionsByUserId || [])]
        .find((row: any) => String(row?.session_id || '').trim());
      if (sessionCandidate?.session_id) {
        const wallet = await walletRepo.getWalletBySession(String(sessionCandidate.session_id));
        if (wallet?.public_key) {
          return {
            contact_name: String(sessionCandidate.email || sessionCandidate.user_id || normalizedEmail),
            stellar_public_key: wallet.public_key,
            session_id: String(sessionCandidate.session_id),
            email: normalizedEmail,
          };
        }
      }

      const { data: userByEmail } = await supabase
        .from('users')
        .select('id, email, stellar_public_key')
        .eq('email', normalizedEmail)
        .limit(1)
        .maybeSingle();

      const userPublicKey = String((userByEmail as any)?.stellar_public_key || '').trim();
      if (/^G[A-Z2-7]{55}$/i.test(userPublicKey)) {
        return {
          contact_name: String((userByEmail as any)?.email || normalizedEmail),
          stellar_public_key: userPublicKey,
          email: normalizedEmail,
          pix_key: normalizedEmail,
        };
      }

      const { data: mappings } = await supabase
        .from('external_accounts')
        .select('session_id, user_id, data')
        .limit(200);

      for (const mapping of mappings || []) {
        const mappingEmail = String((mapping as any)?.data?.email || '').trim().toLowerCase();
        const mappingUserId = String((mapping as any)?.user_id || '').trim().toLowerCase();
        if (mappingEmail !== normalizedEmail && mappingUserId !== normalizedEmail) continue;
        const sessionId = String((mapping as any)?.session_id || '').trim();
        if (!sessionId) continue;
        const wallet = await walletRepo.getWalletBySession(sessionId);
        if (!wallet?.public_key) continue;
        return {
          contact_name: String((mapping as any)?.data?.name || (mapping as any)?.user_id || normalizedEmail),
          stellar_public_key: wallet.public_key,
          session_id: sessionId,
          email: normalizedEmail,
        };
      }
    } catch (error) {
      logger.debug(`[lookupGlobalContactByEmail] Error: ${error}`);
    }

    return undefined;
  }

  private async fetchContacts(userId?: string): Promise<any[]> {
    if (!userId) {
      return [];
    }

    try {
      const contactsRaw = await executeTool('list_contacts', { user_id: userId });
      const contactsResult = JSON.parse(contactsRaw as string);
      return Array.isArray(contactsResult?.contacts) ? contactsResult.contacts : [];
    } catch {
      return [];
    }
  }

  private normalizePaymentAmountAndAsset(
    rawAmount: string,
    hintedAsset?: string
  ): { amount: string; assetCode?: string } {
    const amountText = String(rawAmount || '').trim();
    const hinted = String(hintedAsset || '').trim().toUpperCase();
    const normalizedAsset = hinted ? this.normalizeAgentAssetCode(hinted) : undefined;
    const normalizedAmount = normalizeHumanAmountText(amountText);
    const cleanedAmount = Number.isFinite(Number(normalizedAmount)) ? normalizedAmount : amountText;

    return {
      amount: cleanedAmount,
      assetCode: normalizedAsset,
    };
  }

  private repairNoisyIntentText(value: string): string {
    return String(value || '')
      .replace(/\b(?:conattos|conatatos|contatoss|conatios|contstos)\b/g, 'contatos')
      .replace(/\b(?:destinatarioss|destinatrios|destinatarioos)\b/g, 'destinatarios')
      .replace(/\b(?:historicp|historic0|histirico|historioc|historio|historicoo|historic)\b/g, 'historico')
      .replace(/\b(?:aolicacoes|aolicacao|aplicacoe|aplicaoes|aplicacoeses|aplicacaoes)\b/g, 'aplicacoes')
      .replace(/\b(?:aolicar|aplicarrr|aplcar)\b/g, 'aplicar')
      .replace(/\b(?:investimetos|ivestimentos|investimntos|investimentos)\b/g, 'investimentos')
      .replace(/\b(?:rendimetos|rendimntos|rendimentos)\b/g, 'rendimentos')
      .replace(/\b(?:posicaoes|posicoees|posicoes)\b/g, 'posicoes')
      .replace(/\b(?:sald9|sald0|saldp|saldoo|saldos)\b/g, 'saldo')
      .replace(/\b(?:perfi|perfill|perfio)\b/g, 'perfil')
      .replace(/\b(?:rotta|rotaaa|rotas)\b/g, 'rota')
      .replace(/\b(?:agota|agpra|agoraa)\b/g, 'agora')
      .replace(/\buais\b/g, 'quais')
      .replace(/\b(?:consguee|consege|consegui|conseg|consgue|conseguee)\b/g, 'consegue')
      .replace(/\b(?:possso|possooo|possoo)\b/g, 'posso')
      .replace(/\b(?:vocee|voceee|vc)\b/g, 'voce')
      .replace(/\b(?:pixx|piz|pic)\b/g, 'pix')
      .replace(/\b(?:conversaoo|convercao|converssa?o|convertion)\b/g, 'conversao')
      .replace(/\b(?:converterr|convereter|converteer)\b/g, 'converter')
      .replace(/\b(?:mandarr|mandaer|mndar)\b/g, 'mandar')
      .replace(/\b(?:enviarrr|envair|enviaar)\b/g, 'enviar')
      .replace(/\b(?:retirarr|sacarr|saqeu|saquei)\b/g, (match) => match.startsWith('sa') ? 'sacar' : 'retirar')
      .replace(/\b(?:comta|contaa)\b/g, 'conta')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private normalizeTextForIntent(text: string): string {
    const normalized = String(text || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
    return this.repairNoisyIntentText(normalized);
  }

  private isConversionRequest(text: string): boolean {
    const normalized = this.normalizeTextForIntent(text)
      .replace(/[!?.,;:]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!normalized) return false;
    if (this.extractPixRampIntentFromText(normalized).is_pix_ramp) return false;
    return /\b(converter|conversao|trocar|cambiar|exchange|swap)\b/.test(normalized) ||
      /\b(?:brl|real|reais|r\$|usd|usdc|dolar|dolares|cetes|xlm)\b.*\b(?:para|pra|por|em)\b.*\b(?:brl|real|reais|r\$|usd|usdc|dolar|dolares|cetes|xlm)\b/.test(normalized);
  }

  private normalizeHistoryIntentText(text: string): string {
    return this.normalizeTextForIntent(text)
      .replace(/\bhistoric[p0]?\b/g, 'historico')
      .replace(/\bhist[o0]ric[p0]?\b/g, 'historico')
      .replace(/\bhistori[ck]o\b/g, 'historico');
  }

  private isPaymentLinkRequest(text: string): boolean {
    const normalized = this.normalizeTextForIntent(text);
    const asksForLink =
      /\blink\b/.test(normalized) ||
      normalized.includes('payment link') ||
      normalized.includes('link de pagamento') ||
      normalized.includes('link de pagto') ||
      normalized.includes('link de transacao') ||
      normalized.includes('link de transferencia');
    const createVerb =
      normalized.includes('criar') ||
      normalized.includes('gerar') ||
      normalized.includes('fazer') ||
      normalized.includes('montar') ||
      normalized.includes('create') ||
      normalized.includes('generate');

    return asksForLink && createVerb;
  }

  private isReceiveLinkRequest(text: string): boolean {
    const normalized = this.normalizeTextForIntent(text);
    const asksForLink =
      /\blink\b/.test(normalized) ||
      normalized.includes('link para receber') ||
      normalized.includes('link de recebimento');
    const receiveRef =
      normalized.includes('receber') ||
      normalized.includes('recebimento') ||
      normalized.includes('me pagar') ||
      normalized.includes('cobrar') ||
      normalized.includes('cliente pagar');
    const selfRef =
      normalized.includes('meu') ||
      normalized.includes('minha') ||
      normalized.includes('pra mim') ||
      normalized.includes('para mim') ||
      normalized.includes('qual');

    return asksForLink && receiveRef && selfRef;
  }

  private isOwnProfileRequest(text: string): boolean {
    const normalized = this.normalizeTextForIntent(text)
      .replace(/[^\w\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!normalized) return false;
    const asksForProfile = /\b(perfil|profile)\b/.test(normalized);
    if (!asksForProfile) return false;
    if (/\b(contato|cliente|destinatario|beneficiario|outra pessoa|alguem)\b/.test(normalized)) {
      return false;
    }
    const selfRef = /\b(meu|minha|meus|minhas|pra mim|para mim|my|mine|own)\b/.test(normalized);
    const viewVerb = /\b(ver|ve|abrir|mostrar|consultar|olhar|acessar|show|open|see|view)\b/.test(normalized);
    return selfRef || viewVerb || normalized === 'perfil' || normalized === 'profile';
  }

  private async handleOwnProfileRequest(state: AgentState): Promise<AgentState> {
    const language = this.getLanguage(state);
    const displayName = String(state.session_data?.email || state.session_data?.user_id || '').trim();
    const resultRaw = await executeTool('get_or_create_global_profile', {
      session_id: state.session_id,
      user_id: state.session_data?.user_id,
      display_name: displayName,
    });

    let result: any;
    try {
      result = JSON.parse(resultRaw);
    } catch {
      result = { success: false, error: this.text(language, 'Não consegui abrir seu perfil agora.', 'I could not open your profile right now.') };
    }

    const fallbackProfileUrl = state.session_data?.public_key
      ? `${this.getFrontendBaseUrl()}/profile/${encodeURIComponent(state.session_data.public_key)}`
      : '';
    const link = String(result?.profile?.public_link || result?.profile?.profile_url || fallbackProfileUrl).trim();

    state.success = Boolean(link);
    state.response_message = link
      ? this.text(
          language,
          `Aqui está seu perfil:\n\n${link}`,
          `Here is your profile:\n\n${link}`
        )
      : String(result?.error || this.text(language, 'Não consegui abrir seu perfil agora.', 'I could not open your profile right now.'));
    await this.saveAssistantResponse(state);
    await this.repository.saveState(state.session_id, state);
    return state;
  }

  private async handlePinResetRequest(state: AgentState): Promise<AgentState> {
    const language = this.getLanguage(state);
    const sessionToken = String(
      (state.action_params as any)?.session_token ||
      state.session_data?.session_token ||
      ''
    ).trim();

    const resultRaw = await executeTool('reset_pin', {
      session_id: state.session_id,
      session_token: sessionToken,
      user_id: state.session_data?.user_id,
      language,
    });

    let result: any;
    try {
      result = JSON.parse(resultRaw);
    } catch {
      result = { success: false, error: this.text(language, 'Não consegui iniciar a troca de PIN agora.', 'I could not start the PIN change right now.') };
    }

    state.success = Boolean(result?.success);
    state.response_message = String(
      result?.message ||
      result?.error ||
      this.text(language, 'Não consegui iniciar a troca de PIN agora.', 'I could not start the PIN change right now.')
    );
    await this.saveAssistantResponse(state);
    await this.repository.saveState(state.session_id, state);
    return state;
  }

  private isReceiptImageRequest(text: string): boolean {
    const normalized = this.normalizeTextForIntent(text);
    const wantsReceipt = normalized.includes('recibo') || normalized.includes('comprovante');
    const wantsImage =
      normalized.includes('imagem') ||
      normalized.includes('foto') ||
      normalized.includes('visual') ||
      normalized.includes('mostrar') ||
      normalized.includes('mostre') ||
      normalized.includes('ver ');
    return wantsReceipt && wantsImage;
  }

  private isIntentHelpRequest(text: string): boolean {
    const normalized = this.normalizeTextForIntent(text)
      .replace(/[!?.,;:]+/g, ' ')
      .replace(/([a-z])\1{2,}/g, '$1$1')
      .replace(/\s+/g, ' ')
      .trim();
    const fuzzy = normalized
      .replace(/([a-z])\1+/g, '$1$1')
      .replace(/\b(?:consguee|consegui|consegu|conseg|consego|conseguee)\b/gi, 'consegue')
      .replace(/\b(?:voce|vc)\b/gi, 'voce')
      .replace(/\b(?:fazer|faze|faco)\b/gi, 'fazer')
      .trim();
    const asksCapabilities =
      /\bo\s+que\b.*\b(?:voce\s+)?(?:pode|consegue)\b.*\bfazer\b/.test(fuzzy) ||
      /\bo\s+que\b.*\b(?:eu\s+)?posso\b.*\bfazer\b/.test(fuzzy) ||
      /\b(?:quais|que)\b.*\b(?:funcionalidades|comandos|coisas)\b/.test(fuzzy);
    return (
      normalized === 'ajuda' ||
      normalized === 'help' ||
      normalized === 'menu' ||
      asksCapabilities ||
      fuzzy.includes('o que fazer') ||
      fuzzy.includes('o que posso fazer') ||
      fuzzy.includes('o que eu posso fazer') ||
      fuzzy.includes('oq fazer') ||
      fuzzy.includes('que posso fazer') ||
      fuzzy.includes('que eu posso fazer') ||
      fuzzy.includes('que pode fazer') ||
      fuzzy.includes('que consegue fazer') ||
      fuzzy.includes('que da para fazer') ||
      fuzzy.includes('que da pra fazer') ||
      fuzzy.includes('como funciona') ||
      normalized.includes('principais comandos') ||
      normalized.includes('comandos disponiveis') ||
      normalized.includes('what can you do') ||
      normalized.includes('como usar') ||
      normalized.includes('mostrar comandos') ||
      normalized.includes('mostre os comandos')
    );
  }

  private isSimpleGreetingRequest(text: string): boolean {
    const normalized = this.normalizeTextForIntent(text)
      .replace(/^\/+/, '')
      .replace(/[!?.,;:]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    return /^(o+i+|ola+a*|opa+a*|bom dia+|boa tarde+|boa noite+|e ai+|fala+a*|hello+|hi+|hey+|start|menu)$/.test(normalized);
  }

  private assetCodeFromTextToken(value?: string): string {
    const token = String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
    if (!token) return '';
    if (token === 'r$' || token === 'brl' || token === 'real' || token === 'reais') return 'BRL';
    if (token === 'cetes') return 'CETES';
    if (token === 'eur' || token === 'eurc' || token === 'euro' || token === 'euros' || token === '€') {
      return getStellarNetworkName() === 'TESTNET' ? 'CETES' : 'EUR';
    }
    if (token === 'xlm' || token === 'lumen' || token === 'lumens') return 'XLM';
    if (token === 'usd' || token === 'usdc' || token === 'dolar' || token === 'dolares' || token === 'dollar' || token === 'dollars') return 'USDC';
    return '';
  }

  private normalizeAgentAssetCode(value: unknown): string {
    const code = String(value || '').trim().toUpperCase();
    if (!code) return '';
    if (code === 'USD') return 'USDC';
    if (code === 'EUR' || code === 'EURO' || code === 'EUROS' || code === 'EURC') {
      return getStellarNetworkName() === 'TESTNET' ? 'CETES' : 'EUR';
    }
    if (code === 'REAL' || code === 'REAIS' || code === 'R$') return 'BRL';
    if (code === 'DOLAR' || code === 'DOLARES' || code === 'DOLLAR' || code === 'DOLLARS') return 'USDC';
    return code;
  }

  private toSettlementAssetCode(value: unknown): string {
    const code = this.normalizeAgentAssetCode(value);
    if (!code) return '';
    return String(resolveConfiguredAsset(code).code || code).toUpperCase();
  }

  private inferPaymentAssetFromText(normalized: string, amountMatch?: RegExpMatchArray | null): string {
    const amountText = amountMatch?.[1] || '';
    const amountIndex = amountMatch?.index ?? -1;
    if (amountIndex >= 0) {
      const matchedText = amountMatch?.[0] || '';
      if (/r\$\s*$/i.test(matchedText.replace(amountText, ''))) {
        return 'BRL';
      }

      const afterAmount = normalized.slice(amountIndex + matchedText.length);
      const afterToken = afterAmount.match(/^\s*(brl|real|reais|eur|eurc|euro|euros|cetes|usd|usdc|dolar|dolares|dollar|dollars|xlm|lumens?)\b/);
      const assetAfterAmount = this.assetCodeFromTextToken(afterToken?.[1]);
      if (assetAfterAmount) return assetAfterAmount;

      const beforeAmount = normalized.slice(Math.max(0, amountIndex - 12), amountIndex);
      const beforeToken = beforeAmount.match(/\b(brl|real|reais|eur|eurc|euro|euros|cetes|usd|usdc|dolar|dolares|dollar|dollars|xlm|lumens?|r\$)\s*$/);
      const assetBeforeAmount = this.assetCodeFromTextToken(beforeToken?.[1]);
      if (assetBeforeAmount) return assetBeforeAmount;
    }

    const withoutReceiveClause = normalized.replace(/\breceber\s+em\s+(brl|reais|real|eur|eurc|euro|euros|cetes|usd|usdc|dolar|dolares|dollar|dollars|xlm|lumens?)\b/g, '');
    const firstAsset = withoutReceiveClause.match(/\b(brl|real|reais|r\$|eur|eurc|euro|euros|cetes|usd|usdc|dolar|dolares|dollar|dollars|xlm|lumens?)\b/);
    return this.assetCodeFromTextToken(firstAsset?.[1]) || 'USDC';
  }

  private async handleIntentHelpRequest(state: AgentState): Promise<AgentState> {
    const resultRaw = await executeTool('get_intent_help', {});
    let result: any;
    try {
      result = JSON.parse(resultRaw);
    } catch {
      result = { success: false, error: 'Falha ao carregar comandos.' };
    }

    state.success = Boolean(result.success);
    state.response_message = result.message || result.error || 'Não consegui carregar os comandos agora.';
    await this.saveAssistantResponse(state);
    await this.repository.saveState(state.session_id, state);
    return state;
  }

  private explanationTopicFromText(text: string): '' | 'assets' | 'pix' | 'earnings' | 'conversion' | 'payments' | 'security' | 'account' {
    const normalized = this.normalizeTextForIntent(text)
      .replace(/[!?.,;:]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!normalized) return '';

    const asksExplanation =
      /\b(explique|explica|explicar|me explica|detalhe|detalhar|o que e|o que sao|quais sao|quais ativos|quais moedas|what is|what are|explain|describe)\b/.test(normalized) ||
      normalized.includes('sobre cada') ||
      normalized.includes('cada um deles');

    if (!asksExplanation) return '';

    if (/\b(assets?|ativos?|moedas?|currencies|brl|real|reais|r\$|usd|usdc|dolar|dolares|cetes|xlm)\b/.test(normalized)) return 'assets';
    if (/\b(pix|chave pix|qr code|deposito|saque|retirada)\b/.test(normalized)) return 'pix';
    if (/\b(rendimento|rendimentos|investimento|investir|aplicacao|aplicacoes|posicao|posicoes|dinheiro rendendo)\b/.test(normalized)) return 'earnings';
    if (/\b(conversao|converter|trocar|cambio|cotacao)\b/.test(normalized)) return 'conversion';
    if (/\b(pagamento|pagar|enviar|mandar|transferir|link de pagamento|link de recebimento)\b/.test(normalized)) return 'payments';
    if (/\b(seguranca|pin|biometria|senha|acesso)\b/.test(normalized)) return 'security';
    if (/\b(conta|perfil|saldo)\b/.test(normalized)) return 'account';

    return '';
  }

  private async handleExplanationRequest(
    state: AgentState,
    topic: ReturnType<AgentGraph['explanationTopicFromText']>
  ): Promise<AgentState> {
    const resultRaw = await executeTool('get_explanations', {
      topic: topic || 'all',
      language: this.getLanguage(state),
    });

    let result: any;
    try {
      result = JSON.parse(resultRaw);
    } catch {
      result = { success: false, error: 'Falha ao carregar explicação.' };
    }

    state.success = Boolean(result.success);
    state.response_message = String(result.message || result.error || '').trim() ||
      this.text(
        this.getLanguage(state),
        'Não consegui carregar essa explicação agora.',
        'I could not load that explanation right now.'
      );
    await this.saveAssistantResponse(state);
    await this.repository.saveState(state.session_id, state);
    return state;
  }

  private extractPaymentLinkIntentFromText(text: string): {
    amount?: string;
    asset_code?: string;
    receive_asset_code?: string;
    recipient_query?: string;
  } {
    const original = String(text || '');
    const normalized = this.normalizeTextForIntent(original);
    const amountMatch = normalized.match(/(?:^|\s)(?:r\$\s*)?(\d{1,3}(?:\.\d{3})+(?:,\d{1,8})?|\d+(?:[.,]\d{1,8})?)(?=\s|$)/);
    const amount = amountMatch?.[1] ? normalizeHumanAmountText(amountMatch[1]) : undefined;

    const assetCode = this.inferPaymentAssetFromText(normalized, amountMatch);
    let receiveAssetCode = '';
    const receiveMatch = normalized.match(/receber\s+em\s+(brl|reais|real|eur|eurc|euro|euros|cetes|usd|usdc|dolar|dolares|xlm|lumens?)/);
    if (receiveMatch?.[1]) {
      const receive = receiveMatch[1];
      receiveAssetCode = this.assetCodeFromTextToken(receive);
    }

    return {
      amount,
      asset_code: assetCode,
      receive_asset_code: receiveAssetCode,
      recipient_query: '',
    };
  }

  private extractDirectPaymentIntentFromText(text: string): {
    recipient_query?: string;
    amount?: string;
    asset_code?: string;
    receive_asset_code?: string;
    memo?: string;
    category?: string;
    is_payment_link?: boolean;
    needs_clarification?: boolean;
    clarification_question?: string;
  } {
    const normalized = this.normalizeTextForIntent(text);
    if (!/\b(mandar|enviar|pagar|transferir|manda|envia|pague|fazer pagamento)\b/.test(normalized)) {
      return {};
    }
    if (this.isPaymentLinkRequest(text) || this.extractPixRampIntentFromText(text).is_pix_ramp) {
      return {};
    }

    const amountMatch = normalized.match(/(?:^|\s)(?:r\$\s*)?(\d{1,3}(?:\.\d{3})+(?:,\d{1,8})?|\d+(?:[.,]\d{1,8})?)(?=\s|$)/);
    const amount = amountMatch?.[1] ? normalizeHumanAmountText(amountMatch[1]) : undefined;
    if (!amount) return {};

    const assetCode = this.inferPaymentAssetFromText(normalized, amountMatch);

    let receiveAssetCode = '';
    const receiveMatch = normalized.match(/\breceber\s+em\s+(brl|reais|real|eur|eurc|euro|euros|cetes|usd|usdc|dolar|dolares|xlm|lumens?)\b/);
    if (receiveMatch?.[1]) {
      const receive = receiveMatch[1];
      receiveAssetCode = this.assetCodeFromTextToken(receive);
    }

    const recipientMatch = normalized.match(/\b(?:para|pra|pro|a)\s+(.+)$/);
    const recipientQuery = recipientMatch?.[1]
      ?.replace(/\b(?:mas|porque|pois|via|por|com|receber|em|sem saldo|saldo insuficiente|nao tenho saldo|não tenho saldo)\b.*$/i, '')
      .replace(/^(?:o|a|ao|aos|as)\s+/, '')
      .trim();

    if (!recipientQuery || /\b(minha conta|meu pix|fora da minha conta|fora da conta)\b/.test(recipientQuery)) {
      return {};
    }

    return {
      recipient_query: recipientQuery,
      amount,
      asset_code: assetCode,
      receive_asset_code: receiveAssetCode,
    };
  }

  private extractExternalWalletIntentFromText(text: string): {
    is_external_wallet: boolean;
    destination?: string;
    amount?: string;
    asset_code?: string;
  } {
    const original = String(text || '');
    const normalized = this.normalizeTextForIntent(original);
    const destination = original.match(/\bG[A-Z2-7]{55}\b/i)?.[0]?.trim();
    const mentionsExternal =
      /\b(carteira externa|wallet externa|public key|chave publica|chave pública|stellar address|endereco stellar|endereço stellar)\b/.test(normalized);

    if (!destination && !mentionsExternal) {
      return { is_external_wallet: false };
    }

    const amountMatch = normalized.match(/(?:^|\s)(?:r\$\s*)?(\d{1,3}(?:\.\d{3})+(?:,\d{1,8})?|\d+(?:[.,]\d{1,8})?)(?=\s|$)/);
    const amount = amountMatch?.[1] ? normalizeHumanAmountText(amountMatch[1]) : undefined;
    const assetCode = this.inferPaymentAssetFromText(normalized, amountMatch);

    return {
      is_external_wallet: true,
      destination,
      amount,
      asset_code: assetCode === 'BRL' ? 'USDC' : assetCode,
    };
  }

  private async handleExternalWalletRequest(state: AgentState): Promise<AgentState> {
    const language = this.getLanguage(state);
    if (!state.session_data?.public_key) {
      state.success = false;
      state.response_message = await this.getOnboardingOrLoginMessage(state, this.shouldPreferLogin(state));
      await this.saveAssistantResponse(state);
      await this.repository.saveState(state.session_id, state);
      return state;
    }

    const intent = this.extractExternalWalletIntentFromText(state.current_input);
    const base = this.getFrontendBaseUrl();
    const url = new URL(`${base}/send-external`);
    url.searchParams.set('lang', language);
    if (intent.destination) url.searchParams.set('destination', intent.destination);
    if (intent.amount) url.searchParams.set('amount', intent.amount);
    if (intent.asset_code) url.searchParams.set('asset', intent.asset_code);

    let finalUrl = url.toString();
    try {
      finalUrl = await this.externalService.shortenPublicUrl({
        url: finalUrl,
        purpose: 'send_external_wallet',
        sessionId: state.session_id,
        userId: String(state.session_data?.user_id || '').trim() || undefined,
        expiresInHours: 24,
      });
    } catch (error) {
      logger.warn(`[send-external-url] failed to shorten URL: ${error instanceof Error ? error.message : String(error)}`);
    }

    state.success = true;
    state.response_message = this.text(
      language,
      [
        'Esse envio é para uma conta externa, fora do ecossistema TalkToStellar.',
        'Por segurança, a confirmação acontece em uma tela dedicada com chave completa e autenticação.',
        `Abra o link:\n\n${finalUrl}`,
      ].join('\n\n'),
      [
        'This is an external account transfer outside the TalkToStellar ecosystem.',
        'For safety, confirmation happens on a dedicated page with the full key and authentication.',
        `Open the link:\n\n${finalUrl}`,
      ].join('\n\n')
    );
    await this.saveAssistantResponse(state);
    await this.repository.saveState(state.session_id, state);
    return state;
  }

  private async getOnboardingOrLoginMessage(state?: AgentState, preferLogin: boolean = false): Promise<string> {
    const language = this.getLanguage(state);
    const normalizedBase = resolveFrontendBase([
      process.env.FRONTEND_URL,
      process.env.PUBLIC_APP_URL,
      process.env.CREATE_ACCOUNT_BASE,
      process.env.PAYMENT_CONFIRM_BASE,
    ]);
    const onboardingUrlObj = new URL(`${normalizedBase}/create-account`);
    onboardingUrlObj.searchParams.set('lang', language);
    let onboardingUrl = onboardingUrlObj.toString();
    const externalProvider = String((state?.action_params as any)?.external_provider || '').trim().toLowerCase();
    const externalProviderUserId = String((state?.action_params as any)?.external_provider_user_id || '').trim();

    if (externalProvider && externalProviderUserId) {
      try {
        const onboard = await this.externalService.createOnboardUrlWithShortLink(externalProvider, externalProviderUserId, { language });
        onboardingUrl = onboard.url;
      } catch (error) {
        logger.warn(`[onboarding-url] failed to create external onboarding URL: ${error instanceof Error ? error.message : String(error)}`);
      }
    } else {
      try {
        onboardingUrl = await this.externalService.shortenPublicUrl({
          url: onboardingUrl,
          purpose: 'onboarding_generic',
          sessionId: String(state?.session_id || '').trim() || undefined,
          userId: String(state?.session_data?.user_id || '').trim() || undefined,
          expiresInHours: 24,
        });
      } catch (error) {
        logger.warn(`[onboarding-url] failed to shorten generic onboarding URL: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    if (preferLogin) {
      const loginUrlObj = new URL(`${normalizedBase}/login`);
      loginUrlObj.searchParams.set('lang', language);
      let loginUrl = loginUrlObj.toString();
      try {
        if (externalProvider && externalProviderUserId) {
          const login = await this.externalService.createLoginUrlWithShortLink(externalProvider, externalProviderUserId, {
            source: externalProvider,
            sessionId: String(state?.session_id || '').trim() || undefined,
            userId: String(state?.session_data?.user_id || '').trim() || undefined,
            language,
          });
          loginUrl = login.url;
        } else {
          loginUrl = await this.externalService.shortenPublicUrl({
            url: loginUrl,
            purpose: 'login_entry',
            sessionId: String(state?.session_id || '').trim() || undefined,
            userId: String(state?.session_data?.user_id || '').trim() || undefined,
            expiresInHours: 24,
          });
        }
      } catch (error) {
        logger.warn(`[login-url] failed to shorten login URL: ${error instanceof Error ? error.message : String(error)}`);
      }
      return this.text(
        language,
        `Sua sessão não está ativa no momento.\n\nAbra este link para entrar na sua conta:\n${loginUrl}`,
        `Your session is not active right now.\n\nOpen this link to sign in to your account:\n${loginUrl}`
      );
    }

    return this.text(
      language,
      `Você precisa entrar na sua conta para continuar.\n\nAbra este link para criar conta ou entrar em uma conta existente:\n${onboardingUrl}`,
      `You need to sign in to continue.\n\nOpen this link to create an account or sign in to an existing account:\n${onboardingUrl}`
    );
  }

  private getFrontendBaseUrl(): string {
    return resolveFrontendBase([
      process.env.FRONTEND_URL,
      process.env.PUBLIC_APP_URL,
      process.env.PAYMENT_CONFIRM_BASE,
      process.env.CREATE_ACCOUNT_BASE,
    ]);
  }

  private parsePaymentLinkExpiryFromText(text: string): Date | null {
    const raw = String(text || '').trim();
    if (!raw) return null;
    const normalized = raw
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();

    const explicitIsoMatch = normalized.match(/\bexpira\s+em\s+(\d{4}-\d{2}-\d{2})[ t](\d{1,2})(?::(\d{2}))?\b/);
    if (explicitIsoMatch) {
      const yearMonthDay = explicitIsoMatch[1];
      const hour = Number(explicitIsoMatch[2]);
      const minute = Number(explicitIsoMatch[3] || '0');
      if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
        const date = new Date(`${yearMonthDay}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`);
        if (Number.isFinite(date.getTime()) && date.getTime() > Date.now()) return date;
      }
    }

    const relativeMatch = normalized.match(/\bexpira\s+(hoje|amanha|amanhã)\s*(?:as|a|às)?\s*(\d{1,2})(?::(\d{2}))?\s*h?\b/);
    if (!relativeMatch) return null;
    const dayRef = relativeMatch[1];
    const hour = Number(relativeMatch[2]);
    const minute = Number(relativeMatch[3] || '0');
    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;

    const base = new Date();
    const candidate = new Date(base);
    if (dayRef === 'amanha' || dayRef === 'amanhã') {
      candidate.setDate(candidate.getDate() + 1);
    }
    candidate.setHours(hour, minute, 0, 0);
    if (candidate.getTime() <= Date.now()) return null;
    return candidate;
  }

  private buildPayAnyoneUrl(input: { amount?: string; assetCode?: string; receiveAssetCode?: string; recipientName?: string; expiresAt?: Date | null }): string {
    const params = new URLSearchParams();
    const amount = String(input.amount || '').trim();
    const assetCode = String(input.assetCode || '').trim().toUpperCase().replace(/^USD$/, 'USDC');
    const receiveAssetCode = String(input.receiveAssetCode || assetCode).trim().toUpperCase().replace(/^USD$/, 'USDC');
    const recipientName = String(input.recipientName || '').trim();
    const expiresAt = input.expiresAt instanceof Date && Number.isFinite(input.expiresAt.getTime())
      ? input.expiresAt
      : null;

    if (amount) params.set('amount', amount);
    if (assetCode) params.set('asset', assetCode);
    if (receiveAssetCode && receiveAssetCode !== assetCode) params.set('receive_asset', receiveAssetCode);
    if (recipientName) params.set('recipient', recipientName);
    if (expiresAt) params.set('expires_at', expiresAt.toISOString());

    const qs = params.toString();
    return `${this.getFrontendBaseUrl()}/pay-anyone${qs ? `?${qs}` : ''}`;
  }

  private extractPixRampIntentFromText(text: string): {
    is_pix_ramp: boolean;
    direction: 'onramp' | 'offramp';
    flow?: 'fund_wallet' | 'fund_and_pay';
    amount?: string;
    amount_currency?: string;
    asset_code: string;
    recipient_query?: string;
  } {
    const normalized = this.normalizeTextForIntent(text);
    const mentionsPix = /\bpix\b/.test(normalized);
    const mentionsPixOffRampWording =
      /\b(?:para|pra|pro|a)\s+fora\s+(?:do|de|da)\s+pix\b/.test(normalized) ||
      /\bfora\s+(?:do|de|da)\s+pix\b/.test(normalized) ||
      /\b(?:mandar|enviar|tirar|retirar|sacar)\s+(?:pra|para|pro|a)\s+fora\b/.test(normalized) ||
      /\b(?:mandar|enviar)\s+(?:pra|para|pro|a)\s+fora\b.*\b(?:via|por|com)\s+pix\b/.test(normalized) ||
      /\b(?:pra|para|pro|a)\s+fora\b.*\bvia\s+pix\b/.test(normalized);
    const extractPixFundedPaymentRecipient = (): string => {
      const isOffRampRecipientNoise = (value: string) =>
        /\bfora\s+(?:do|de|da)\s+pix\b/.test(value) ||
        /\bfora\s+da\s+(?:minha\s+)?(?:conta|wallet|carteira)\b/.test(value) ||
        /^fora$/i.test(value.trim());
      const stopAtFlowWords = (value: string) => String(value || '')
        .replace(/\s+\b(?:de|do|da)\s+(?:r\$\s*)?\d.*$/i, '')
        .replace(/\s+\b(?:na|no)\s+qual\b.*$/i, '')
        .replace(/\s+\b(?:via|por|com|em|usando|pago|paga|pagando)\b.*$/i, '')
        .replace(/\s+(?:r\$\s*)?\d{1,3}(?:\.\d{3})*(?:[.,]\d{1,8})?\b.*$/i, '')
        .replace(/\s+\b(?:receber|receba|em)\s+(?:brl|real|reais|usd|usdc|dolar|dolares|xlm)\b.*$/i, '')
        .replace(/\b(minha|meu|conta|banco|bancaria|bancária)\b/g, '')
        .replace(/\s+/g, ' ')
        .trim();

      const patterns = [
        /\b(?:direto|diretamente)\s+(?:para|pra|pro|a)\s+([a-z0-9._%+-]+(?:\s+[a-z0-9._%+-]+){0,4})/,
        /\b(?:transacao|transação|trasacao|transferencia|transferência|pagamento)\s+(?:direto\s+|diretamente\s+)?(?:para|pra|pro|a)\s+([a-z0-9._%+-]+(?:\s+[a-z0-9._%+-]+){0,4})/,
        /\b(?:mandar|enviar|pagar|transferir)\s+(?:direto\s+|diretamente\s+)?(?:para|pra|pro|a)\s+([a-z0-9._%+-]+(?:\s+[a-z0-9._%+-]+){0,4})/,
      ];

      for (const pattern of patterns) {
        const candidate = stopAtFlowWords(normalized.match(pattern)?.[1] || '');
        if (candidate && !isOffRampRecipientNoise(candidate)) return candidate;
      }

      const genericMatches = Array.from(normalized.matchAll(/\b(?:para|pra|pro|a)\s+([a-z0-9._%+-]+(?:\s+[a-z0-9._%+-]+){0,4})/g));
      for (const match of genericMatches.reverse()) {
        const candidate = stopAtFlowWords(match[1] || '');
        if (candidate && !isOffRampRecipientNoise(candidate) && !/\b(?:minha conta|meu pix|meu banco|outro banco|conta externa)\b/.test(candidate)) {
          return candidate;
        }
      }

      return '';
    };
    const pixFundedPaymentRecipient = extractPixFundedPaymentRecipient();
    const mentionsMoneyOutOfOwnAccount =
      mentionsPixOffRampWording ||
      /\b(?:pra|para|pro)\s+fora\s+da\s+(?:minha\s+)?(?:conta|wallet|carteira)\b/.test(normalized) ||
      /\b(?:mandar|enviar|tirar|retirar|sacar)\b.*\bfora\s+da\s+(?:minha\s+)?(?:conta|wallet|carteira)\b/.test(normalized) ||
      /\bfora\s+da\s+(?:minha\s+)?(?:conta|wallet|carteira)\b/.test(normalized) ||
      /\b(?:mandar|enviar)\s+(?:pra|para|pro|a)\s+fora\b.*\b(?:via|por|com)\s+pix\b/.test(normalized);
    const mentionsBankOffRamp =
      /\b(off\s*ramp|offramp)\b/.test(normalized) ||
      /\b(?:banco|bancaria|bancario|bancária|bancário|conta externa|outro banco)\b/.test(normalized) ||
      /\b(?:retirar|sacar|saque|retirada|tirar|resgatar)\b/.test(normalized) ||
      mentionsMoneyOutOfOwnAccount;

    const mentionsOwnPixDestination =
      /\b(?:meu|minha|meus|minhas)\s+(?:pix|chave\s+pix|conta\s+pix)\b/.test(normalized) ||
      /\b(?:para|pra|pro|a)\s+o\s+meu\s+pix\b/.test(normalized) ||
      /\b(?:para|pra|pro|a)\s+a\s+minha\s+chave\s+pix\b/.test(normalized);

    const wantsPixFundedPayment =
      /\b(mandar|enviar|pagar|transferir|transacao|transação|trasacao|transferencia|transferência|pagamento|fazer\s+(?:um\s+|uma\s+)?pix|fazer uma transacao|fazer uma transação|fazer uma trasacao|fazer transacao|fazer transação|fazer trasacao|fazer uma transferencia|fazer transferencia|faca uma transferencia|faça uma transferência)\b/.test(normalized) &&
      Boolean(pixFundedPaymentRecipient) &&
      !mentionsOwnPixDestination &&
      !mentionsMoneyOutOfOwnAccount &&
      mentionsPix &&
      !/\b(meu banco|conta bancaria|conta bancária|outro banco|conta externa)\b/.test(normalized);

    const wantsOffRamp =
      /\b(sacar|saque|retirar|tirar|resgatar|vender|off\s*ramp|offramp)\b/.test(normalized) ||
      mentionsOwnPixDestination ||
      /\b(retirada|retiradas)\b/.test(normalized) ||
      normalized.includes('tirar dinheiro') ||
      normalized.includes('retirar dinheiro') ||
      normalized.includes('mandar para minha conta bancaria') ||
      normalized.includes('mandar pra minha conta bancaria') ||
      normalized.includes('mandar pra outro banco') ||
      normalized.includes('mandar para outro banco') ||
      normalized.includes('para outro banco') ||
      normalized.includes('pra outro banco') ||
      normalized.includes('conta externa') ||
      normalized.includes('enviar para o banco') ||
      normalized.includes('enviar pro banco') ||
      normalized.includes('cair no banco') ||
      mentionsMoneyOutOfOwnAccount;

    const wantsOnRamp =
      /\b(depositar|deposito|colocar|adicionar|carregar|recarregar|comprar|trazer|botar|fundar|entrar|receber|on\s*ramp|onramp)\b/.test(normalized) ||
      wantsPixFundedPayment ||
      normalized.includes('pagar com pix') ||
      normalized.includes('trazer dinheiro') ||
      normalized.includes('trazer saldo') ||
      normalized.includes('por pix na conta') ||
      normalized.includes('pra minha conta via pix') ||
      normalized.includes('para minha conta via pix') ||
      normalized.includes('pix para wallet') ||
      normalized.includes('pix pra wallet') ||
      normalized.includes('pix na conta') ||
      normalized.includes('saldo com pix');

    if (!mentionsPix && !mentionsBankOffRamp) {
      return { is_pix_ramp: false, direction: 'onramp', asset_code: 'BRL' };
    }

    const amountMatch = normalized.match(/(?:^|\s)(?:r\$\s*)?(\d{1,3}(?:\.\d{3})+(?:,\d{1,8})?|\d+(?:[.,]\d{1,8})?)(?=\s|$)/);
    const explicitlyMentionsAsset = /\b(brl|real|reais|r\$|usd|usdc|dolar|dolares|dólar|dólares|dollar|dollars|cetes|xlm|lumen|lumens|tesouro|tesouros)\b/.test(normalized);
    const inferredAssetCode = explicitlyMentionsAsset ? this.inferPaymentAssetFromText(normalized, amountMatch) : '';
    const mentionsBrl = /\b(brl|real|reais|r\$)\b/.test(normalized);
    const mentionsTesouro = /\b(tesouro|tesouros)\b/.test(normalized);
    const mentionsUsdc = /\b(usdc|usd|dolar|dolares|dólar|dólares|dollar|dollars)\b/.test(normalized);
    const impliedPixOnRamp = Boolean(mentionsPix && amountMatch && !wantsOffRamp);
    if (!wantsOnRamp && !wantsOffRamp && !impliedPixOnRamp) {
      return { is_pix_ramp: false, direction: 'onramp', asset_code: 'BRL' };
    }
    const explicitReceiveUsdc = /(?:receber|cair|saldo|converter|em)\s+(?:em\s+)?(?:usdc|usd|dolar|dolares|dólar|dólares)/.test(normalized);
    const explicitReceiveBrl = /(?:receber|cair|saldo|converter|em)\s+(?:em\s+)?(?:brl|real|reais|r\$)/.test(normalized);
    const onRampTargetAsset = explicitReceiveBrl || (mentionsBrl && !mentionsUsdc)
      ? 'BRL'
      : (explicitReceiveUsdc || mentionsUsdc || !mentionsTesouro ? inferredAssetCode || 'USDC' : 'BRL');
    const fundAndPayAsset = inferredAssetCode || (mentionsUsdc && !mentionsBrl ? 'USDC' : 'BRL');
    return {
      is_pix_ramp: true,
      direction: wantsOffRamp ? 'offramp' : 'onramp',
      flow: wantsPixFundedPayment && !wantsOffRamp ? 'fund_and_pay' : 'fund_wallet',
      amount: amountMatch?.[1] ? normalizeHumanAmountText(amountMatch[1]) : undefined,
      amount_currency: wantsPixFundedPayment
        ? fundAndPayAsset
        : (mentionsUsdc && !mentionsBrl && !mentionsTesouro ? 'USDC' : inferredAssetCode || 'BRL'),
      asset_code: wantsOffRamp && !wantsOnRamp
        ? (mentionsUsdc ? 'USDC' : inferredAssetCode || 'BRL')
        : (wantsPixFundedPayment ? fundAndPayAsset : onRampTargetAsset),
      recipient_query: wantsPixFundedPayment && !(wantsOffRamp && !wantsOnRamp) ? pixFundedPaymentRecipient : undefined,
    };
  }

  private extractAmountFollowUpFromText(text: string): string | undefined {
    const normalized = this.normalizeTextForIntent(text);
    const amountMatch = normalized.match(/(?:^|\s)(?:r\$\s*)?(\d{1,3}(?:\.\d{3})+(?:,\d{1,8})?|\d+(?:[.,]\d{1,8})?)(?=\s|$)/);
    return amountMatch?.[1] ? normalizeHumanAmountText(amountMatch[1]) : undefined;
  }

  private resumePendingPixRampIntent(state: AgentState): {
    is_pix_ramp: boolean;
    direction: 'onramp' | 'offramp';
    flow?: 'fund_wallet' | 'fund_and_pay';
    amount?: string;
    amount_currency?: string;
    asset_code: string;
    recipient_query?: string;
  } | null {
    const pending = state.pending_pix_ramp || (state.action_params as any)?.pending_pix_ramp;
    if (!pending?.direction || !pending?.asset_code) return null;
    const amount = this.extractAmountFollowUpFromText(state.current_input);
    if (!amount) return null;
    return {
      is_pix_ramp: true,
      direction: pending.direction === 'offramp' ? 'offramp' : 'onramp',
      flow: pending.flow === 'fund_and_pay' ? 'fund_and_pay' : 'fund_wallet',
      amount,
      amount_currency: String(pending.amount_currency || pending.asset_code || 'BRL').trim().toUpperCase(),
      asset_code: String(pending.asset_code || 'BRL').trim().toUpperCase(),
      recipient_query: String(pending.recipient_query || '').trim() || undefined,
    };
  }

  private pixFundedPaymentIntentFromLlmRoute(state: AgentState): {
    is_pix_ramp: boolean;
    direction: 'onramp' | 'offramp';
    flow?: 'fund_wallet' | 'fund_and_pay';
    amount?: string;
    amount_currency?: string;
    asset_code: string;
    recipient_query?: string;
  } | null {
    const route = (state.action_params as any)?.llm_route || {};
    if (String(route.tool_name || '').trim() !== 'route_pix_intent') {
      return null;
    }

    const amount = String(route.amount || '').trim();
    const assetCode = this.normalizeAgentAssetCode(route.asset_code || '');
    const recipientQuery = String(route.recipient_query || '').trim();
    if (!amount || !assetCode || !recipientQuery) {
      return null;
    }

    return {
      is_pix_ramp: true,
      direction: 'onramp',
      flow: 'fund_and_pay',
      amount,
      amount_currency: assetCode,
      asset_code: assetCode,
      recipient_query: recipientQuery,
    };
  }

  private paymentIntentFromLlmRoute(state: AgentState): {
    recipient_query?: string;
    amount?: string;
    asset_code?: string;
    receive_asset_code?: string;
    is_payment_link?: boolean;
    needs_clarification?: boolean;
    clarification_question?: string;
    memo?: string;
    category?: string;
  } {
    const route = (state.action_params as any)?.llm_route || {};
    if (String(route.tool_name || '').trim() !== 'route_payment_intent') {
      return {};
    }

    const sourceAssetCode = this.normalizeAgentAssetCode(route.source_asset_code || route.asset_code || '');
    const destAssetCode = this.normalizeAgentAssetCode(route.dest_asset_code || '');
    const amount = String(route.amount || '').trim();
    const recipientQuery = String(route.recipient_query || '').trim();
    const hasStructuredFields = Boolean(amount || sourceAssetCode || destAssetCode || recipientQuery);
    if (!hasStructuredFields) {
      return {};
    }

    const isLayeredExternalTransfer = Boolean(
      amount &&
      sourceAssetCode &&
      destAssetCode &&
      sourceAssetCode !== destAssetCode
    );

    return {
      recipient_query: recipientQuery || undefined,
      amount: amount || undefined,
      asset_code: sourceAssetCode || this.normalizeAgentAssetCode(route.asset_code || '') || undefined,
      receive_asset_code: destAssetCode && destAssetCode !== sourceAssetCode ? destAssetCode : undefined,
      is_payment_link: false,
      needs_clarification: Boolean(route.needs_clarification || !recipientQuery),
      clarification_question: isLayeredExternalTransfer && !recipientQuery
        ? this.text(
            this.getLanguage(state),
            `Entendi a operação em duas camadas: converter ${this.formatMoneyByAsset(amount, sourceAssetCode)} para ${destAssetCode} e depois transferir em ${destAssetCode}. Falta só o destino externo: envie o contato, e-mail, telefone, CPF ou public key.`,
            `I understood the two-layer operation: convert ${this.formatMoneyByAsset(amount, sourceAssetCode)} to ${destAssetCode}, then transfer in ${destAssetCode}. I only need the external destination: send the contact, email, phone, tax ID, or public key.`
          )
        : undefined,
    };
  }

  private async buildPixRampUrl(state: AgentState, intent: {
    direction: 'onramp' | 'offramp';
    flow?: 'fund_wallet' | 'fund_and_pay';
    amount?: string;
    amount_currency?: string;
    asset_code: string;
    recipient_query?: string;
    recipient_key?: string;
    recipient_public_key?: string;
    pay_amount?: string;
    pay_asset_code?: string;
  }): Promise<string> {
    const page = intent.direction === 'offramp' ? '/pix-off' : '/pix-on';
    const url = new URL(`${this.getFrontendBaseUrl()}${page}`);
    const intentId = crypto.randomUUID();
    const externalProvider = String((state.action_params as any)?.external_provider || '').trim().toLowerCase();
    const externalProviderUserId = String((state.action_params as any)?.external_provider_user_id || '').trim();
    const externalSource = String((state.action_params as any)?.external_source || externalProvider || '').trim().toLowerCase();
    const externalSessionScope = normalizeExternalSessionScope(externalProvider || externalSource);
    const amountCurrency = intent.amount_currency || intent.asset_code;
    const urlAsset = intent.direction === 'onramp' && amountCurrency === 'BRL' ? 'BRL' : intent.asset_code;
    url.searchParams.set('mode', intent.direction);
    url.searchParams.set('asset', urlAsset);
    if (intent.direction === 'onramp' && intent.asset_code !== urlAsset) {
      url.searchParams.set('target_asset', intent.asset_code);
    }
    url.searchParams.set('intent_id', intentId);
    url.searchParams.set('from', 'chat');
    url.searchParams.set('autostart', '1');
    url.searchParams.set('lang', this.getLanguage(state));
    if (externalProvider) url.searchParams.set('provider', externalProvider);
    if (externalProviderUserId) url.searchParams.set('provider_user_id', externalProviderUserId);
    if (externalSource) url.searchParams.set('source', externalSource);
    if (externalSessionScope) url.searchParams.set('session_scope', externalSessionScope);
    if (intent.flow === 'fund_and_pay') url.searchParams.set('flow', 'fund_and_pay');
    if (intent.flow === 'fund_and_pay') url.searchParams.set('auto_pay_after_ramp', '1');
    if (intent.recipient_query) url.searchParams.set('recipient', intent.recipient_query);
    if (intent.recipient_key) url.searchParams.set('recipient_key', intent.recipient_key);
    if (intent.recipient_public_key) url.searchParams.set('recipient_public_key', intent.recipient_public_key);
    const isPixFundedPayment = intent.direction === 'onramp' && intent.flow === 'fund_and_pay';
    const finalPayAmount = intent.pay_amount || (isPixFundedPayment ? intent.amount : '');
    const finalPayAsset = intent.pay_asset_code || (isPixFundedPayment ? intent.asset_code : undefined);
    if (finalPayAmount) url.searchParams.set('pay_amount', finalPayAmount);
    if (finalPayAsset) url.searchParams.set('pay_asset', finalPayAsset);
    if (isPixFundedPayment && finalPayAmount && finalPayAsset) {
      url.searchParams.set('receive_amount', finalPayAmount);
      url.searchParams.set('receive_asset', finalPayAsset);
    }
    if (intent.amount) {
      if (isPixFundedPayment && finalPayAmount && finalPayAsset) {
        url.searchParams.set('currency', finalPayAsset);
        url.searchParams.set('amount', intent.amount);
      } else if (intent.direction === 'onramp' && amountCurrency === 'USDC' && intent.asset_code === 'USDC') {
        url.searchParams.set('receive_amount', intent.amount);
        url.searchParams.set('receive_asset', 'USDC');
        url.searchParams.set('currency', 'USDC');
      } else if (intent.direction === 'onramp' && amountCurrency === 'BRL' && intent.asset_code === 'BRL') {
        url.searchParams.set('amount', intent.amount);
        url.searchParams.set('currency', 'BRL');
        url.searchParams.set('receive_amount', intent.amount);
        url.searchParams.set('receive_asset', 'BRL');
      } else {
        url.searchParams.set('amount', intent.amount);
        url.searchParams.set('currency', amountCurrency);
      }
      if (intent.direction === 'offramp') {
        url.searchParams.set('source_asset', intent.asset_code);
        url.searchParams.set('source_amount', intent.amount);
      }
      if (intent.direction === 'offramp' && intent.amount_currency === 'BRL') {
        url.searchParams.set('fiat_amount', intent.amount);
        url.searchParams.set('fiat_currency', 'BRL');
      }
    }
    const email = String(state.session_data?.email || state.session_data?.user_id || '').trim();
    if (email.includes('@')) url.searchParams.set('email', email);

    try {
      return await this.externalService.shortenPublicUrl({
        url: url.toString(),
        purpose: `pix_${intent.direction}`,
        sessionId: state.session_id,
        userId: String(state.session_data?.user_id || '').trim() || undefined,
        expiresInHours: 24,
      });
    } catch (error) {
      logger.warn(`[pix-ramp-url] failed to shorten URL: ${error instanceof Error ? error.message : String(error)}`);
      return url.toString();
    }
  }

  private async handlePixRampRequest(state: AgentState): Promise<AgentState> {
    const llmPixFundedPaymentIntent = this.pixFundedPaymentIntentFromLlmRoute(state);
    const extractedIntent = this.extractPixRampIntentFromText(state.current_input);
    const intent = llmPixFundedPaymentIntent || (extractedIntent.is_pix_ramp
      ? extractedIntent
      : (this.resumePendingPixRampIntent(state) || extractedIntent));
    const language = this.getLanguage(state);
    if (!intent.is_pix_ramp) {
      const onRampUrl = new URL(`/pix-on`, this.getFrontendBaseUrl());
      onRampUrl.searchParams.set('from', 'chat');
      onRampUrl.searchParams.set('lang', language);
      const offRampUrl = new URL(`/pix-off`, this.getFrontendBaseUrl());
      offRampUrl.searchParams.set('from', 'chat');
      offRampUrl.searchParams.set('lang', language);
      state.success = true;
      state.response_message = this.text(
        language,
        `Abra para PIX (entrada ou saída):\n\nEntrada: ${onRampUrl.toString()}\nSaída: ${offRampUrl.toString()}\n\nEscolha o que precisa na página.`,
        `Open for PIX (in or out):\n\nIn: ${onRampUrl.toString()}\nOut: ${offRampUrl.toString()}\n\nChoose what you need on the page.`
      );
    } else if (!intent.amount) {
      const pendingPixRamp = {
        direction: intent.direction,
        flow: intent.flow,
        amount_currency: intent.amount_currency || 'BRL',
        asset_code: intent.asset_code,
        recipient_query: intent.recipient_query,
        created_at: new Date().toISOString(),
      };
      state.pending_pix_ramp = pendingPixRamp;
      state.action_params = { ...(state.action_params || {}), pending_pix_ramp: pendingPixRamp };
      state.success = false;
      state.response_message = intent.direction === 'offramp'
        ? this.text(language, 'Qual valor em reais você quer retirar para PIX?', 'How much in reais do you want to withdraw to PIX?')
        : this.text(language, 'Qual valor em reais você quer colocar na sua conta via PIX?', 'How much in reais do you want to add to your account with PIX?');
    } else {
      let resolvedRecipientLabel = String(intent.recipient_query || '').trim();
      let resolvedRecipientKey = '';
      let resolvedRecipientPublicKey = '';
      if (intent.flow === 'fund_and_pay') {
        const userId = String(state.session_data?.user_id || state.session_data?.email || '').trim();
        const resolvedRecipient = await this.resolveOwnedPaymentContact(intent.recipient_query || '', userId);
        if (!resolvedRecipient.destination) {
          state.success = false;
          state.pending_pix_ramp = undefined;
          state.action_params = { ...(state.action_params || {}), pending_pix_ramp: undefined };
          state.response_message = this.text(
            language,
            `Não encontrei "${intent.recipient_query || 'esse destinatário'}" nos seus contatos salvos. Digite "contatos" para ver os destinatários reais disponíveis ou adicione esse contato antes de gerar o PIX.`,
            `I could not find "${intent.recipient_query || 'that recipient'}" in your saved contacts. Type "contacts" to see available real recipients or add this contact before creating the PIX.`
          );
          await this.saveAssistantResponse(state);
          await this.repository.saveState(state.session_id, state);
          return state;
        }
        resolvedRecipientLabel = String(resolvedRecipient.destinationName || intent.recipient_query).trim();
        resolvedRecipientKey = this.getContactDisplayKey(resolvedRecipient.contact);
        resolvedRecipientPublicKey = String(resolvedRecipient.destination || '').trim();
      }
      const pixIntent = {
        ...intent,
        recipient_query: resolvedRecipientLabel || intent.recipient_query,
        recipient_key: resolvedRecipientKey || undefined,
        recipient_public_key: resolvedRecipientPublicKey || undefined,
      };
      const url = await this.buildPixRampUrl(state, pixIntent);
      const pixFeeNote = intent.direction === 'offramp'
        ? this.text(
            language,
            'A página mostra o saldo que sai da conta, a taxa do app e quanto chega no seu PIX antes do PIN.',
            'The page shows the balance leaving the account, the app fee, and how much arrives in your PIX before the PIN.'
          )
        : intent.flow === 'fund_and_pay' && resolvedRecipientLabel
          ? this.text(
              language,
              `A página mostra o PIX a pagar, a taxa do app e a conversão necessária para entregar o valor final a ${resolvedRecipientLabel} antes do PIN.`,
              `The page shows the PIX amount to pay, the app fee, and the conversion needed to deliver the final amount to ${resolvedRecipientLabel} before the PIN.`
            )
          : this.text(
              language,
              'A página mostra o PIX a pagar, a taxa do app e quanto entra na conta antes do PIN.',
              'The page shows the PIX amount to pay, the app fee, and how much arrives in the account before the PIN.'
            );
      state.success = true;
      state.pending_pix_ramp = undefined;
      state.action_params = { ...(state.action_params || {}), pending_pix_ramp: undefined };
      if (intent.direction === 'offramp') {
        const amountText = this.formatMoneyByAsset(intent.amount, intent.amount_currency || 'BRL');
        state.response_message = this.text(
          language,
          `Para retirar ${amountText} da conta para PIX, abra:\n\n${url}\n\n${pixFeeNote}\n\nA tela calcula a melhor conversão e confirma quanto chega em reais no seu PIX.`,
          `To withdraw ${amountText} from the account to PIX, open:\n\n${url}\n\n${pixFeeNote}\n\nThe screen calculates the best conversion and confirms how much arrives in reais in your PIX.`
        );
      } else if (intent.flow === 'fund_and_pay' && resolvedRecipientLabel) {
        const amountText = this.formatMoneyByAsset(intent.amount, intent.amount_currency || 'BRL');
        state.response_message = this.text(
          language,
          `Para mandar ${amountText} para ${resolvedRecipientLabel} via PIX, abra:\n\n${url}\n\n${pixFeeNote}\n\nA tela mostra o valor final, pede seu PIN e envia para ${resolvedRecipientLabel} automaticamente depois da confirmação.`,
          `To send ${amountText} to ${resolvedRecipientLabel} with PIX, open:\n\n${url}\n\n${pixFeeNote}\n\nThe page shows the final amount, asks for your PIN, and sends it to ${resolvedRecipientLabel} automatically after confirmation.`
        );
      } else {
        const amountText = this.formatMoneyByAsset(intent.amount, intent.amount_currency || 'BRL');
        const actionText = intent.amount_currency === 'USDC'
          ? this.text(language, `receber ${amountText}`, `receive ${amountText}`)
          : this.text(language, `receber ${amountText} na sua conta`, `receive ${amountText} in your account`);
        state.response_message = this.text(
          language,
          `Tudo finalizado. Aqui estão suas informações para ${actionText} via PIX:\n\n${url}\n\n${pixFeeNote}\n\nNa página, o PIX a pagar já inclui a taxa por fora para o saldo entrar como ${this.formatUserFacingAssetName(intent.asset_code, language)}.`,
          `Done. Here are your details to ${actionText} with PIX:\n\n${url}\n\n${pixFeeNote}\n\nOn the page, the PIX amount to pay already includes the fee on top so the balance arrives as ${this.formatUserFacingAssetName(intent.asset_code, language)}.`
        );
      }
    }

    await this.saveAssistantResponse(state);
    await this.repository.saveState(state.session_id, state);
    return state;
  }

  private async handlePayAnyoneLinkRequest(state: AgentState): Promise<AgentState> {
    if (!state.session_data?.public_key) {
      state.success = false;
      state.response_message = await this.getOnboardingOrLoginMessage(state, this.shouldPreferLogin(state));
    } else {
      const deterministicParsed = this.extractPaymentLinkIntentFromText(state.current_input);
      const llmParsed = deterministicParsed.amount
        ? deterministicParsed
        : {
            ...deterministicParsed,
            is_payment_link: true,
          };
      const amountInfo = this.normalizePaymentAmountAndAsset(
        String(llmParsed.amount || ''),
        llmParsed.asset_code
      );
      const amount = String(amountInfo.amount || '').trim();
      const assetCode = this.normalizeAgentAssetCode(amountInfo.assetCode || 'USDC') || 'USDC';
      const receiveAssetCode = this.normalizeAgentAssetCode(llmParsed.receive_asset_code || assetCode) || assetCode;
      const recipientName = String(llmParsed.recipient_query || '').trim();
      const expiresAt = this.parsePaymentLinkExpiryFromText(state.current_input);
      const numericAmount = parseHumanAmountNumber(amount);
      const hasValidAmount = amount.length > 0 && Number.isFinite(numericAmount) && numericAmount > 0;

      if (!hasValidAmount) {
        const recovered = await this.tryRecoverConfirmationLinkFromRecentPaymentContext(state);
        if (recovered) {
          state.success = true;
          state.pending_payment = undefined;
          state.response_message = recovered;
        } else {
          state.success = false;
          state.response_message =
            'Não foi informado o valor do link de pagamento. Qual valor você quer colocar no link? Exemplo: "criar link de 10 dólares".';
        }
      } else {
        const url = this.buildPayAnyoneUrl({ amount, assetCode, receiveAssetCode, recipientName, expiresAt });
        state.pending_payment = undefined;
        state.success = true;
        const receiveText = receiveAssetCode && receiveAssetCode !== assetCode
          ? ` A pessoa recebe em ${this.formatUserFacingAssetName(receiveAssetCode, this.getLanguage(state))}.`
          : '';
        const expiryText = expiresAt
          ? ` O link ficará válido até ${expiresAt.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}.`
          : '';
        state.response_message =
          `Claro. Para criar o link de pagamento de ${this.formatMoneyByAsset(amount, assetCode)}, abra:\n\n${url}\n\nNa página, confirme com seu PIN e copie o link para enviar.${receiveText}${expiryText}`;
      }
    }

    await this.saveAssistantResponse(state);
    await this.repository.saveState(state.session_id, state);
    return state;
  }

  private isFollowUpGenerateLinkRequest(text: string): boolean {
    const normalized = this.normalizeTextForIntent(text);
    if (!normalized.includes('link')) return false;

    return (
      normalized.includes('gere o link') ||
      normalized.includes('gera o link') ||
      normalized.includes('gerar o link') ||
      normalized.includes('quero o link') ||
      normalized.includes('manda o link') ||
      normalized.includes('pode gerar o link') ||
      normalized.includes('cria o link') ||
      normalized.includes('criar o link')
    );
  }

  private async tryRecoverConfirmationLinkFromRecentPaymentContext(state: AgentState): Promise<string | null> {
    if (!this.isFollowUpGenerateLinkRequest(state.current_input)) {
      return null;
    }

    const recentUserMessages = (state.messages || [])
      .filter((message: any) => message?.role === 'user')
      .slice(-5)
      .reverse();

    for (const message of recentUserMessages) {
      const messageText = String(message?.content || '').trim();
      if (!messageText) continue;

      const parsed = await this.extractPaymentIntentWithLlm(messageText, state.session_data?.user_id);
      if (parsed.is_payment_link) continue;

      const prepared = await this.preparePaymentConfirmationFromIntent(state, {
        recipient_query: parsed.recipient_query,
        amount: parsed.amount,
        asset_code: parsed.asset_code,
        receive_asset_code: parsed.receive_asset_code,
        memo: parsed.memo,
      });

      if (prepared.success && prepared.message) {
        return prepared.message;
      }
    }

    return null;
  }

  private async preparePaymentConfirmationFromIntent(
    state: AgentState,
    intent: {
      recipient_query?: string;
      amount?: string;
      asset_code?: string;
      receive_asset_code?: string;
      memo?: string;
    }
  ): Promise<{ success: boolean; message?: string; error?: string }> {
    const recipientQuery = String(intent.recipient_query || '').trim();
    const amountInfo = this.normalizePaymentAmountAndAsset(
      String(intent.amount || ''),
      intent.asset_code
    );
    const amount = String(amountInfo.amount || '').trim();
    const assetCode = this.normalizeAgentAssetCode(amountInfo.assetCode);
    const receiveAssetCode = this.normalizeAgentAssetCode(intent.receive_asset_code || assetCode);
    const settlementAssetCode = this.toSettlementAssetCode(assetCode) || assetCode;
    const settlementReceiveAssetCode = this.toSettlementAssetCode(receiveAssetCode) || receiveAssetCode;

    if (!recipientQuery || !amount || !assetCode) {
      return { success: false, error: 'context_incomplete' };
    }

    const { contact, destination, destinationName } = await this.resolvePaymentRecipient(recipientQuery, state.session_data?.user_id);

    if (!destination) {
      return { success: false, error: 'destination_not_found' };
    }
    await this.maybeSavePaymentRecipientContact(state, recipientQuery, { contact, destination, destinationName });

    let quote: any = null;
    let bestRouteResult: any = null;
    let confirmationAmount = amount;
    let confirmationAssetCode = assetCode;
    let sourceAmountForConfirmation: string | undefined;
    let sourceAssetCodeForConfirmation: string | undefined;
    let sourceAssetIssuerForConfirmation: string | undefined;

    confirmationAssetCode = settlementAssetCode;

    if (settlementReceiveAssetCode && settlementReceiveAssetCode !== settlementAssetCode) {
      const sourceIssuer = getAssetIssuer(settlementAssetCode) || await this.resolveWalletAssetIssuer(String(state.session_data?.public_key || ''), settlementAssetCode);
      let destIssuer = await this.resolveWalletAssetIssuer(destination, settlementReceiveAssetCode);
      if (settlementReceiveAssetCode !== 'XLM' && !destIssuer) {
        const trustlineResultRaw = await executeTool('ensure_trustline', {
          session_id: contact?.session_id,
          public_key: destination,
          asset_code: settlementReceiveAssetCode,
        });
        try {
          const trustlineResult = JSON.parse(trustlineResultRaw);
          if (trustlineResult.success && trustlineResult.asset_issuer) {
            destIssuer = trustlineResult.asset_issuer;
          }
        } catch {
          // ignore, quote will fail with a clearer error if issuer is missing
        }
      }
      destIssuer = destIssuer || getAssetIssuer(settlementReceiveAssetCode);

      const quoteRaw = await executeTool('get_best_route', {
        source_public_key: state.session_data?.public_key,
        destination,
        source_amount: amount,
        source_asset_code: settlementAssetCode,
        source_asset_issuer: sourceIssuer,
        dest_asset_code: settlementReceiveAssetCode,
        dest_asset_issuer: destIssuer,
      });
      const parsedBestRoute = JSON.parse(quoteRaw);
      if (!parsedBestRoute.success) {
        return { success: false, error: parsedBestRoute.error || 'route_quote_failed' };
      }

      bestRouteResult = parsedBestRoute;
      quote = parsedBestRoute.quote;
      confirmationAmount = String(quote.destinationAmount || '').trim();
      confirmationAssetCode = settlementReceiveAssetCode;
      sourceAmountForConfirmation = amount;
      sourceAssetCodeForConfirmation = settlementAssetCode;
      sourceAssetIssuerForConfirmation = sourceIssuer;
    }

    const prepareRaw = await executeTool('prepare_payment_confirmation', {
      session_id: state.session_id,
      owner_id: state.session_data?.user_id,
      amount: confirmationAmount,
      asset_code: confirmationAssetCode,
      destination,
      destination_name: destinationName,
      destination_contact: contact || undefined,
      quote,
      source_amount: sourceAmountForConfirmation,
      source_asset_code: sourceAssetCodeForConfirmation,
      source_asset_issuer: sourceAssetIssuerForConfirmation,
      destination_amount: quote?.destinationAmount,
      destination_asset_code: quote?.destinationAsset?.code,
      destination_asset_issuer: quote?.destinationAsset?.issuer,
      optimization_criteria: bestRouteResult?.optimization_criteria,
      language: this.getLanguage(state),
      memo: intent.memo,
      provider: (state.action_params as any)?.external_provider,
      provider_user_id: (state.action_params as any)?.external_provider_user_id,
      source: (state.action_params as any)?.external_source,
    });

    let prepare: any;
    try {
      prepare = JSON.parse(prepareRaw);
    } catch {
      prepare = { success: false, error: 'Failed to parse payment confirmation response' };
    }

    if (!prepare.success || !prepare.url) {
      return { success: false, error: prepare.error || 'prepare_payment_confirmation_failed' };
    }

    if (settlementReceiveAssetCode !== settlementAssetCode) {
      const transparencyLine = this.formatBestRouteTransparency(bestRouteResult);
      const message = [
        `Estimativa antes de confirmar pela rota mais otimizada: você envia ${this.formatMoneyByAsset(amount, assetCode)} e ${destinationName} recebe aproximadamente ${this.formatMoneyByAsset(confirmationAmount, confirmationAssetCode)}.`,
        transparencyLine,
        `Para confirmar, abra o link:\n\n${prepare.url}`,
      ].filter(Boolean).join('\n');
      return { success: true, message };
    }

    return {
      success: true,
      message: prepare.message || `Gerei o link de confirmação da forma mais otimizada para enviar ${this.formatMoneyByAsset(amount, assetCode)} para ${destinationName}.\n\nAbra para revisar e confirmar com PIN:\n\n${prepare.url}`,
    };
  }

  private async handleReceiveLinkRequest(state: AgentState): Promise<AgentState> {
    if (!state.session_data?.public_key) {
      state.success = false;
      state.response_message = await this.getOnboardingOrLoginMessage(state, this.shouldPreferLogin(state));
    } else {
      const displayName = String(state.session_data?.email || state.session_data?.user_id || '').trim();
      const resultRaw = await executeTool('get_or_create_global_profile', {
        session_id: state.session_id,
        user_id: state.session_data?.user_id,
        display_name: displayName,
      });

      let result: any;
      try {
        result = JSON.parse(resultRaw);
      } catch {
        result = { success: false, error: 'Não consegui gerar seu link para receber agora.' };
      }

      state.success = Boolean(result.success);
      const link = String(result?.profile?.public_link || '').trim();
      state.response_message = result.success && link
        ? `Aqui está seu link para receber:\n\n${link}\n\nCompartilhe com seu cliente. Ele acessa, digita o valor e continua o pagamento para sua conta.`
        : result.error || 'Não consegui gerar seu link para receber agora.';
    }

    await this.saveAssistantResponse(state);
    await this.repository.saveState(state.session_id, state);
    return state;
  }

  private async handleReceiptImageRequest(state: AgentState): Promise<AgentState> {
    const provider = String((state.action_params as any)?.external_provider || (state.action_params as any)?.external_source || 'web').trim();
    const providerUserId = String((state.action_params as any)?.external_provider_user_id || '').trim();
    const resultRaw = await executeTool('send_receipt_image', {
      session_id: state.session_id,
      user_id: state.session_data?.user_id,
      provider,
      provider_user_id: providerUserId,
    });

    let result: any;
    try {
      result = JSON.parse(resultRaw);
    } catch {
      result = { success: false, error: 'Falha ao gerar a imagem do comprovante.' };
    }

    state.success = Boolean(result.success);
    if (result.success && result.receipt_url) {
      state.response_message = `Comprovante disponível${result.operation_id ? ` (${result.operation_id})` : ''}:\n${result.receipt_url}`;
    } else {
      state.response_message = result.error || 'Ainda não encontrei uma transação concluída para gerar o comprovante.';
    }

    await this.saveAssistantResponse(state);
    await this.repository.saveState(state.session_id, state);
    return state;
  }

  private shouldPreferLogin(state: AgentState): boolean {
    const forceLoggedOut = Boolean((state.action_params as any)?.force_logged_out);
    if (forceLoggedOut) return true;

    const email = String(state.session_data?.email || '').trim().toLowerCase();
    if (email) return true;

    const userId = String(state.session_data?.user_id || '').trim().toLowerCase();
    if (userId && !userId.startsWith('user_')) return true;

    return false;
  }

  private isDirectLoginRequest(text: string): boolean {
    const normalized = String(text || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();

    return (
      /\b(login|logar|entrar|acessar)\b/.test(normalized) &&
      /\b(conta|wallet|talktostellar|talk to stellar|app)\b/.test(normalized)
    ) || /\bfazer login\b/.test(normalized);
  }

  private isDirectOnboardingRequest(text: string): boolean {
    const normalized = String(text || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();

    return (
      /\b(criar|abrir|cadastrar|cadastro|nova)\b/.test(normalized) &&
      /\b(conta|wallet|carteira)\b/.test(normalized)
    );
  }

  private formatMoneyByAsset(amount: string, assetCode: string): string {
    const n = parseHumanAmountNumber(amount);
    if (!Number.isFinite(n)) return `${amount} ${assetCode}`;
    const upper = this.toUserFacingAssetCode(assetCode);
    if (upper === 'BRL') return `R$ ${n.toFixed(2)}`;
    if (upper === 'USDC' || upper === 'USD') return `US$ ${n.toFixed(2)}`;
    if (upper === 'EUR') return `€ ${n.toFixed(2)}`;
    if (upper === 'XLM') return `${n.toFixed(7).replace(/0+$/, '').replace(/\.$/, '')} XLM`;
    return `${n.toFixed(2)} ${upper || 'saldo'}`;
  }

  private formatUserFacingAssetName(assetCode: unknown, language: 'pt-BR' | 'en' = 'pt-BR'): string {
    const upper = this.toUserFacingAssetCode(assetCode);
    if (upper === 'USDC' || upper === 'USD') return 'US$';
    if (upper === 'BRL') return 'R$';
    if (upper === 'EUR') return '€';
    return upper || this.text(language, 'saldo', 'balance');
  }

  private toUserFacingAssetCode(assetCode: unknown): string {
    const upper = String(assetCode || '').trim().toUpperCase();
    if (upper === 'TESOURO') return 'BRL';
    if (upper === 'EURC') return 'EUR';
    return upper;
  }

  private maskInternalAssetNames(value: unknown): string {
    const raw = String(value || '')
      .replace(/TESOURO:[A-Z2-7]{56}/g, 'BRL')
      .replace(/EURC:[A-Z2-7]{56}/g, 'EUR')
      .replace(/\bTESOURO\b/g, 'BRL');

    const parts = raw
      .split(/\s*->\s*/)
      .map((part) => part.trim().toUpperCase())
      .filter(Boolean)
      .map((part) => {
        if (part === 'XLM' || part === 'NATIVE') return '';
        if (part === 'USDC' || part === 'USD') return 'US$';
        if (part === 'BRL') return 'R$';
        if (part === 'EURC' || part === 'EUR') return '€';
        return part;
      })
      .filter(Boolean)
      .filter((part, index, list) => index === 0 || part !== list[index - 1]);

    if (parts.length >= 2) return parts.join(' -> ');
    if (parts.length === 1) return parts[0];

    return raw
      .replace(/\bXLM\b/g, '')
      .replace(/\bEURC\b/g, 'EUR')
      .replace(/\s*->\s*->\s*/g, ' -> ')
      .replace(/^\s*->\s*|\s*->\s*$/g, '')
      .trim();
  }

  private conversionUnavailableMessage(language: 'pt-BR' | 'en' = 'pt-BR'): string {
    return this.text(
      language,
      'Não consegui encontrar uma rota segura para essa conversão agora. Tente novamente em alguns segundos ou escolha outro valor.',
      'I could not find a safe route for this conversion right now. Try again in a few seconds or choose another amount.'
    );
  }

  private toAmountNumber(value: unknown): number {
    const parsed = parseHumanAmountNumber(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private formatBestRouteTransparency(quoteResult: any): string {
    if (!quoteResult || typeof quoteResult !== 'object') return '';

    const routeChain = this.maskInternalAssetNames(quoteResult?.route?.chain).trim();
    const criteria = String(quoteResult?.optimization_criteria || '').trim();
    const totalFeeDisplay = String(quoteResult?.fee_breakdown?.total_fee_display || quoteResult?.quote?.fee_display || '').trim();
    const savingsBrl = this.toAmountNumber(quoteResult?.savings_estimate?.estimated_savings_brl);
    const savingsPct = this.toAmountNumber(quoteResult?.savings_estimate?.savings_percentage_over_traditional_fee);
    const ttlSeconds = this.toAmountNumber(quoteResult?.quote_ttl_seconds);

    const lines: string[] = [];
    if (routeChain) lines.push(`Rota mais otimizada agora: ${routeChain}.`);
    if (criteria) lines.push(`Critério: ${criteria}.`);
    if (totalFeeDisplay) lines.push(`Taxa total estimada: ${totalFeeDisplay}.`);
    if (savingsBrl > 0) {
      const pctLabel = savingsPct > 0 ? `${savingsPct.toFixed(1).replace('.', ',')}%` : '';
      lines.push(`Encontrei uma rota mais barata e você economiza aproximadamente R$ ${savingsBrl.toFixed(2).replace('.', ',')} em taxas.`);
      if (pctLabel) {
        lines.push(`Comparativo: cerca de ${pctLabel} mais barato que métodos tradicionais.`);
      }
    }
    if (ttlSeconds > 0) lines.push(`Estimativa válida por ${Math.trunc(ttlSeconds)} segundos.`);

    return lines.join(' ');
  }

  private isOptimizedRouteRequest(text: string): boolean {
    const normalized = this.normalizeTextForIntent(text);
    return /\b(melhor rota|rota mais otimizada|rota otimizada|rota mais barata|melhor caminho)\b/.test(normalized);
  }

  private isBestRouteGuidanceRequest(text: string): boolean {
    return this.isOptimizedRouteRequest(text);
  }

  private bestRouteGuidanceText(language: 'pt-BR' | 'en'): string {
    return this.text(
      language,
      [
        'Toda conversão ou envio usa a melhor rota disponível dentro da própria transação.',
        'Para ver valores antes do PIN, inicie uma conversão ou envio com valor, moeda de origem e destino.',
        '',
        'Exemplos:',
        '- converter 100 USDC para BRL',
        '- enviar 50 reais para Ana',
        '- cotação de 200 reais para dólares',
        '',
        'A tela mostra valor final, taxas e a rota escolhida antes de qualquer PIN.',
      ].join('\n'),
      [
        'Every conversion or transfer uses the best available route inside the transaction itself.',
        'To see values before PIN, start a conversion or transfer with amount, source currency, and destination.',
        '',
        'Examples:',
        '- convert 100 USDC to BRL',
        '- send 50 reais to Ana',
        '- quote 200 reais to dollars',
        '',
        'The screen shows final amount, fees, and selected route before any PIN.',
      ].join('\n')
    );
  }

  private isGenericRecipientReference(value: unknown): boolean {
    const normalized = this.normalizeTextForIntent(String(value || ''));
    if (!normalized) return true;
    return /\b(outra pessoa|alguem|alguém|uma pessoa|pessoa|destinatario|destinatário|beneficiario|beneficiário)\b/.test(normalized);
  }

  private extractGenericBestRouteEstimateIntent(text: string, parsed?: {
    amount?: string;
    asset_code?: string;
    receive_asset_code?: string;
    recipient_query?: string;
  }): {
    amount: string;
    destAssetCode: string;
    sourceAssetCode: string;
  } | null {
    const normalized = this.normalizeTextForIntent(text);
    if (!this.isOptimizedRouteRequest(text)) return null;
    if (!/\b(enviar|mandar|transferir|pagar|chegar|receber)\b/.test(normalized)) return null;

    const amountPattern = '((?:\\d{1,3}(?:\\.\\d{3})+(?:,\\d{1,8})?|\\d+(?:[.,]\\d{1,8})?))';
    const receiveMatch = normalized.match(new RegExp(`\\b(?:chegar|receber|receba|entrar|cair)\\s+(?:r\\$\\s*)?${amountPattern}\\s*(brl|real|reais|eur|eurc|euro|euros|cetes|usd|usdc|dolar|dolares)?\\b`));
    const genericRecipient = this.isGenericRecipientReference(parsed?.recipient_query || text);
    if (!receiveMatch && !genericRecipient) return null;

    const amount = normalizeHumanAmountText(receiveMatch?.[1] || parsed?.amount || '');
    if (!amount) return null;

    const destAssetCode = (
      this.assetCodeFromTextToken(receiveMatch?.[2]) ||
      String(parsed?.receive_asset_code || parsed?.asset_code || 'BRL')
    ).toUpperCase().replace(/^USD$/, 'USDC');
    const allowedRouteAssets = getStellarNetworkName() === 'TESTNET'
      ? ['BRL', 'USDC', 'CETES', 'XLM']
      : ['BRL', 'USDC', 'EUR', 'XLM'];
    const safeDestAssetCode = allowedRouteAssets.includes(destAssetCode) ? destAssetCode : 'BRL';
    const sourceAssetCode = safeDestAssetCode === 'BRL' ? 'USDC' : 'BRL';

    return {
      amount,
      destAssetCode: safeDestAssetCode,
      sourceAssetCode,
    };
  }

  private extractConversionBestRouteEstimateIntent(text: string): {
    amount: string;
    destAssetCode: string;
    sourceAssetCode: string;
  } | null {
    const normalized = this.normalizeTextForIntent(text);
    if (!this.isOptimizedRouteRequest(text)) return null;
    const isConversionRoute = this.isConversionRequest(normalized) ||
      /\b(?:brl|real|reais|r\$|usd|usdc|dolar|dolares|cetes|xlm)\b.*\b(?:para|pra|por|em)\b.*\b(?:brl|real|reais|r\$|usd|usdc|dolar|dolares|cetes|xlm)\b/.test(normalized);
    if (!isConversionRoute) return null;

    const amount = this.extractAmountFollowUpFromText(normalized);
    if (!amount) return null;

    const inferredAssets = this.inferConversionAssetsFromText(normalized);
    const sourceAssetCode = this.normalizeAgentAssetCode(inferredAssets.sourceAssetCode || '');
    const destAssetCode = this.normalizeAgentAssetCode(inferredAssets.destAssetCode || '');
    if (!sourceAssetCode || !destAssetCode || sourceAssetCode === destAssetCode) return null;

    const allowedRouteAssets = getStellarNetworkName() === 'TESTNET'
      ? ['BRL', 'USDC', 'CETES', 'XLM']
      : ['BRL', 'USDC', 'EUR', 'XLM'];
    if (!allowedRouteAssets.includes(sourceAssetCode) || !allowedRouteAssets.includes(destAssetCode)) {
      return null;
    }

    return {
      amount,
      sourceAssetCode,
      destAssetCode,
    };
  }

  private async handleBestRouteConversionEstimate(state: AgentState, estimate: {
    amount: string;
    destAssetCode: string;
    sourceAssetCode: string;
  }): Promise<AgentState> {
    const language = this.getLanguage(state);
    const publicKey = String(state.session_data?.public_key || '').trim();
    if (!publicKey) {
      state.success = false;
      state.response_message = await this.getOnboardingOrLoginMessage(state, this.shouldPreferLogin(state));
      await this.saveAssistantResponse(state);
      await this.repository.saveState(state.session_id, state);
      return state;
    }

    const routeSourceAssetCode = this.toSettlementAssetCode(estimate.sourceAssetCode) || estimate.sourceAssetCode;
    const routeDestAssetCode = this.toSettlementAssetCode(estimate.destAssetCode) || estimate.destAssetCode;
    const sourceIssuer = getAssetIssuer(routeSourceAssetCode) ||
      await this.resolveWalletAssetIssuer(publicKey, routeSourceAssetCode);
    const destIssuer = getAssetIssuer(routeDestAssetCode) ||
      await this.resolveWalletAssetIssuer(publicKey, routeDestAssetCode);

    const raw = await executeTool('get_best_route', {
      source_public_key: publicKey,
      destination: publicKey,
      source_amount: estimate.amount,
      source_asset_code: routeSourceAssetCode,
      source_asset_issuer: sourceIssuer,
      dest_asset_code: routeDestAssetCode,
      dest_asset_issuer: destIssuer,
    });

    let result: any;
    try {
      result = JSON.parse(raw);
    } catch {
      result = { success: false, error: 'route_quote_parse_failed' };
    }

    if (!result?.success) {
      state.success = false;
      state.response_message = result?.error || this.conversionUnavailableMessage(language);
      await this.saveAssistantResponse(state);
      await this.repository.saveState(state.session_id, state);
      return state;
    }

    const sourceAmount = String(result.source?.amount || result.quote?.sourceAmount || estimate.amount).trim();
    const destinationAmount = String(result.destination?.amount || result.quote?.destinationAmount || '').trim();
    const rate = this.toAmountNumber(result.effective_rate?.destination_per_source);
    const transparencyLine = this.formatBestRouteTransparency(result);
    const rateLine = rate > 0
      ? `Cotação efetiva: 1 ${this.formatUserFacingAssetName(estimate.sourceAssetCode, language)} ≈ ${this.formatMoneyByAsset(String(rate), estimate.destAssetCode)}.`
      : '';

    state.success = true;
    state.response_message = [
      `Melhor rota agora para converter ${this.formatMoneyByAsset(sourceAmount, estimate.sourceAssetCode)} em ${this.formatUserFacingAssetName(estimate.destAssetCode, language)}:`,
      destinationAmount ? `Recebe aproximadamente ${this.formatMoneyByAsset(destinationAmount, estimate.destAssetCode)}.` : '',
      rateLine,
      transparencyLine || result.message,
      'Nada é confirmado sem abrir a tela de confirmação e digitar o PIN.',
    ].filter(Boolean).join('\n');
    await this.saveAssistantResponse(state);
    await this.repository.saveState(state.session_id, state);
    return state;
  }

  private async handleGenericBestRouteEstimate(state: AgentState, estimate: {
    amount: string;
    destAssetCode: string;
    sourceAssetCode: string;
  }): Promise<AgentState> {
    const routeSourceAssetCode = this.toSettlementAssetCode(estimate.sourceAssetCode) || estimate.sourceAssetCode;
    const routeDestAssetCode = this.toSettlementAssetCode(estimate.destAssetCode) || estimate.destAssetCode;
    const sourceIssuer = getAssetIssuer(routeSourceAssetCode) ||
      await this.resolveWalletAssetIssuer(String(state.session_data?.public_key || ''), routeSourceAssetCode);
    const destIssuer = getAssetIssuer(routeDestAssetCode) ||
      await this.resolveWalletAssetIssuer(String(state.session_data?.public_key || ''), routeDestAssetCode);
    let sourceAmount = '';
    let destinationAmount = estimate.amount;
    let feeDisplay = 'R$ 0,01';
    let validityLine = 'A tela final recalcula antes de confirmar.';

    try {
      const raw = await executeTool('get_best_route', {
        source_public_key: state.session_data?.public_key,
        destination: state.session_data?.public_key,
        dest_amount: estimate.amount,
        source_asset_code: routeSourceAssetCode,
        source_asset_issuer: sourceIssuer,
        dest_asset_code: routeDestAssetCode,
        dest_asset_issuer: destIssuer,
      });
      const result = JSON.parse(raw);
      if (!result?.success) throw new Error(result?.error || 'route_quote_failed');
      sourceAmount = String(result.source?.amount || result.quote?.sourceAmount || '').trim();
      destinationAmount = String(result.destination?.amount || result.quote?.destinationAmount || estimate.amount).trim();
      feeDisplay = String(result.fee_breakdown?.total_fee_display || result.quote?.fee_display || feeDisplay).trim() || feeDisplay;
      const ttlSeconds = this.toAmountNumber(result.quote_ttl_seconds);
      if (ttlSeconds > 0) {
        validityLine = `Estimativa válida por ${Math.trunc(ttlSeconds)} segundos.`;
      }
    } catch (error) {
      logger.warn(`[generic-route-estimate] route quote failed, using product fallback: ${error instanceof Error ? error.message : String(error)}`);
      try {
        const raw = await executeTool('get_brl_usdc_quote', {});
        const quote = JSON.parse(raw);
        const brlPerUsdc = this.toAmountNumber(quote?.brl_per_usdc);
        const amount = this.toAmountNumber(estimate.amount);
        if (quote?.success && brlPerUsdc > 0 && amount > 0) {
          const estimatedSource = estimate.destAssetCode === 'BRL'
            ? amount / brlPerUsdc
            : amount * brlPerUsdc;
          sourceAmount = estimatedSource.toFixed(estimate.sourceAssetCode === 'BRL' ? 2 : 7);
        }
      } catch (fallbackError) {
        logger.warn(`[generic-route-estimate] quote fallback failed: ${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}`);
      }
    }

    const sourceLine = sourceAmount
      ? `Envio estimado: ${this.formatMoneyByAsset(sourceAmount, estimate.sourceAssetCode)}.`
      : `Envio estimado: calculado na tela de confirmação.`;

    state.success = true;
    state.response_message = [
      `Estimativa da rota mais otimizada para alguém receber ${this.formatMoneyByAsset(destinationAmount, estimate.destAssetCode)}:`,
      sourceLine,
      `Recebimento: ${this.formatMoneyByAsset(destinationAmount, estimate.destAssetCode)}.`,
      `Taxa total estimada: ${feeDisplay}.`,
      validityLine,
      'Para finalizar, me envie o nome salvo, e-mail, CPF, telefone ou chave PIX do destinatário.',
    ].join('\n');
    await this.saveAssistantResponse(state);
    await this.repository.saveState(state.session_id, state);
    return state;
  }

  private pairQuoteRequestFromLlmRoute(state: AgentState): {
    amount: string;
    amountWasProvided: boolean;
    sourceAssetCode: string;
    destAssetCode: string;
    quoteMode?: 'market_price' | 'send_exact';
  } | null {
    const route = (state.action_params as any)?.llm_route || {};
    let sourceAssetCode = this.normalizeAgentAssetCode(route.source_asset_code || '');
    let destAssetCode = this.normalizeAgentAssetCode(route.dest_asset_code || '');
    const routeToolName = String(route.tool_name || '').trim();
    const routeAssetCode = this.normalizeAgentAssetCode(route.asset_code || '');
    const quoteModeFromRoute = String(route.quote_mode || '').trim();
    if (
      routeToolName === 'route_price_quote_intent' &&
      !sourceAssetCode &&
      !destAssetCode &&
      routeAssetCode &&
      routeAssetCode !== 'BRL'
    ) {
      sourceAssetCode = routeAssetCode;
      destAssetCode = 'BRL';
    }
    if (!sourceAssetCode || !destAssetCode || sourceAssetCode === destAssetCode) return null;
    const quoteMode = quoteModeFromRoute === 'market_price'
      ? 'market_price'
      : quoteModeFromRoute === 'send_exact'
        ? 'send_exact'
        : (routeToolName === 'route_price_quote_intent' && routeAssetCode === sourceAssetCode ? 'market_price' : undefined);

    return {
      amount: normalizeHumanAmountText(route.amount || '') || '1',
      amountWasProvided: Boolean(normalizeHumanAmountText(route.amount || '')),
      sourceAssetCode,
      destAssetCode,
      quoteMode,
    };
  }

  private async handleCurrentPairQuoteRequest(state: AgentState, quoteRequest: {
    amount: string;
    amountWasProvided?: boolean;
    sourceAssetCode: string;
    destAssetCode: string;
    quoteMode?: 'market_price' | 'send_exact';
  }): Promise<AgentState> {
    const language = this.getLanguage(state);
    const raw = await executeTool('get_pair_quote', {
      source_asset_code: quoteRequest.sourceAssetCode,
      dest_asset_code: quoteRequest.destAssetCode,
      source_amount: quoteRequest.amount || '1',
      amount_was_provided: Boolean(quoteRequest.amountWasProvided),
      quote_mode: quoteRequest.quoteMode || '',
      language,
    });

    let result: any;
    try {
      result = JSON.parse(raw);
    } catch {
      result = { success: false, error: 'pair_quote_parse_failed' };
    }

    state.success = Boolean(result?.success);
    state.response_message = String(result?.message || result?.error || this.text(
      language,
      'Não consegui carregar essa cotação agora. Tente novamente em alguns segundos.',
      'I could not load this quote right now. Try again in a few seconds.'
    ));
    await this.saveAssistantResponse(state);
    await this.repository.saveState(state.session_id, state);
    return state;
  }

  private async handleAllPairQuotesRequest(state: AgentState): Promise<AgentState> {
    const language = this.getLanguage(state);
    const raw = await executeTool('get_all_pair_quotes', { language });

    let result: any;
    try {
      result = JSON.parse(raw);
    } catch {
      result = { success: false, error: 'all_pair_quotes_parse_failed' };
    }

    state.success = Boolean(result?.success);
    state.response_message = String(result?.message || result?.error || this.text(
      language,
      'Não consegui carregar todas as cotações agora. Tente novamente em alguns segundos.',
      'I could not load all quotes right now. Try again in a few seconds.'
    ));
    await this.saveAssistantResponse(state);
    await this.repository.saveState(state.session_id, state);
    return state;
  }

  private async handleBestRouteGuidanceRequest(state: AgentState): Promise<AgentState> {
    const language = this.getLanguage(state);
    state.success = true;
    state.response_message = this.bestRouteGuidanceText(language);
    await this.saveAssistantResponse(state);
    await this.repository.saveState(state.session_id, state);
    return state;
  }

  private hasInsufficientBalanceLanguage(text: string): boolean {
    const normalized = this.normalizeTextForIntent(text);
    return (
      /\b(?:nao|não)\s+tenho\s+(?:saldo|dinheiro|fundos?)\b/.test(normalized) ||
      /\bsem\s+(?:saldo|dinheiro|fundos?)\b/.test(normalized) ||
      /\bsaldo\s+insuficiente\b/.test(normalized) ||
      /\bnao\s+vai\s+ter\s+saldo\b/.test(normalized)
    );
  }

  private async resolvePaymentRecipient(recipientQuery: string, userId?: string): Promise<{
    contact?: any;
    destination: string;
    destinationName: string;
  }> {
    const query = String(recipientQuery || '').trim();
    const contact = await this.getContactByPublicKeyOrName(query, userId);
    const destination = String(
      contact?.destination_public_key ||
      contact?.stellar_public_key ||
      contact?.public_key ||
      (/^G[A-Z2-7]{55}$/i.test(query) ? query : '')
    ).trim();
    const destinationName = String(contact?.contact_name || contact?.name || query).trim();

    return { contact, destination, destinationName };
  }

  private async maybeSavePaymentRecipientContact(
    state: AgentState,
    recipientQuery: string,
    recipient: { contact?: any; destination?: string; destinationName?: string },
  ): Promise<void> {
    const ownerId = String(state.session_data?.user_id || '').trim();
    const destination = String(recipient.destination || '').trim();
    if (!ownerId || !destination) return;
    if (String(state.session_data?.public_key || '').trim() === destination) return;
    if (String(recipient.contact?.owner_id || '').trim() === ownerId) return;

    try {
      const contacts = await this.fetchContacts(ownerId);
      const alreadySaved = contacts.some((contact: any) => {
        const contactDestination = String(
          contact?.destination_public_key ||
          contact?.stellar_public_key ||
          contact?.public_key ||
          ''
        ).trim();
        return contactDestination === destination;
      });
      if (alreadySaved) return;

      const contactName = String(
        recipient.destinationName ||
        recipient.contact?.contact_name ||
        recipient.contact?.name ||
        recipientQuery ||
        ''
      ).trim();

      await executeTool('add_contact', {
        session_id: state.session_id,
        user_id: ownerId,
        contact_name: contactName || undefined,
        public_key: destination,
        pix_key: this.getContactDisplayKey(recipient.contact) || undefined,
        contact_key: destination,
      });
    } catch (error) {
      logger.warn(`[payment-contact-autosave] failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  private async resolveOwnedPaymentContact(recipientQuery: string, userId?: string): Promise<{
    contact?: any;
    destination: string;
    destinationName: string;
  }> {
    const query = String(recipientQuery || '').trim();
    if (!query || !userId) return { destination: '', destinationName: query };

    const contacts = await this.fetchContacts(userId);
    const normalizedQuery = this.normalizeLookup(query);
    const queryPhone = String(query || '').replace(/\D+/g, '');
    const isPublicKey = /^G[A-Z2-7]{55}$/i.test(query);
    const aliasMatch = query.trim().toLowerCase().match(/^(?:contato|contact)\s*(\d{1,3})$/);

    const normalizeIdentifier = (value: unknown) => String(value || '').trim().toLowerCase();
    const contactIdentifiers = (contact: any): string[] => ([
      contact?.pix_key,
      contact?.email,
      contact?.phone_number,
      contact?.cpf,
      contact?.contact_profile?.pix_key,
      contact?.contact_profile?.email,
      contact?.contact_profile?.phone_number,
      contact?.contact_profile?.cpf,
      contact?.identifier,
      contact?.contact_profile?.identifier,
    ])
      .map(normalizeIdentifier)
      .filter(Boolean);

    let contact: any | undefined;
    if (isPublicKey) {
      contact = contacts.find((item: any) =>
        String(item.stellar_public_key || item.public_key || item.destination_public_key || '').trim() === query
      );
    } else if (aliasMatch) {
      const index = Number(aliasMatch[1]);
      if (Number.isFinite(index) && index >= 1 && index <= contacts.length) {
        contact = contacts[index - 1];
      }
    } else if (queryPhone.length >= 8) {
      contact = contacts.find((item: any) => {
        const phones = [
          item?.phone_number,
          item?.contact_profile?.phone_number,
        ];
        return phones.some((phone) => String(phone || '').replace(/\D+/g, '') === queryPhone);
      });
    } else {
      contact = contacts.find((item: any) => {
        const names = [
          item?.contact_name,
          item?.name,
          item?.display_label,
          item?.contact_profile?.name,
        ];
        const exactName = names.some((name) => this.normalizeLookup(String(name || '')) === normalizedQuery);
        if (exactName) return true;

        const identifiers = contactIdentifiers(item);
        return identifiers.some((identifier) => this.normalizeLookup(String(identifier || '')) === normalizedQuery);
      });
    }

    const destination = String(
      contact?.destination_public_key ||
      contact?.stellar_public_key ||
      contact?.public_key ||
      ''
    ).trim();
    if (!contact || !destination) return { destination: '', destinationName: query };

    return {
      contact,
      destination,
      destinationName: String(contact.contact_name || contact.name || query).trim(),
    };
  }

  private getContactDisplayKey(contact: any): string {
    return String(
      contact?.email ||
      contact?.contact_profile?.email ||
      contact?.pix_key ||
      contact?.contact_profile?.pix_key ||
      contact?.phone_number ||
      contact?.contact_profile?.phone_number ||
      contact?.cpf ||
      contact?.contact_profile?.cpf ||
      ''
    ).trim();
  }

  private async getWalletBalanceForAsset(state: AgentState, assetCode: string): Promise<{
    amount: number;
    formatted: string;
  } | null> {
    const normalizedAsset = this.toUserFacingAssetCode(assetCode).replace(/^USD$/, 'USDC');
    if (!normalizedAsset || normalizedAsset === 'XLM') return null;

    try {
      const raw = await executeTool('get_balance', {
        session_id: state.session_id,
        public_key: state.session_data?.public_key,
      });
      const parsed = JSON.parse(raw);
      if (!parsed?.success || !Array.isArray(parsed.balances)) return null;

      const balance = parsed.balances.find((item: any) => (
        this.toUserFacingAssetCode(item.asset || item.asset_code || '').replace(/^USD$/, 'USDC') === normalizedAsset
      ));
      const amount = this.toAmountNumber(balance?.balance);
      return {
        amount,
        formatted: this.formatMoneyByAsset(amount.toFixed(7), normalizedAsset),
      };
    } catch (error) {
      logger.warn(`[payment-balance-check] failed: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }

  private async formatPixFundingEstimate(amount: string, assetCode: string, language: 'pt-BR' | 'en' = 'pt-BR'): Promise<string> {
    const normalizedAsset = this.toUserFacingAssetCode(assetCode).replace(/^USD$/, 'USDC');
    const numeric = this.toAmountNumber(amount);
    if (normalizedAsset === 'BRL') {
      return this.text(language, `PIX para completar: ${this.formatMoneyByAsset(amount, 'BRL')}.`, `PIX needed: ${this.formatMoneyByAsset(amount, 'BRL')}.`);
    }
    if (normalizedAsset !== 'USDC' || numeric <= 0) {
      return this.text(language, 'A tela mostra quanto sai no PIX, a taxa do app e quanto será enviado antes de confirmar.', 'The screen shows how much leaves through PIX, the app fee, and how much will be sent before confirmation.');
    }

    try {
      const raw = await executeTool('get_brl_usdc_quote', {});
      const quote = JSON.parse(raw);
      const brlPerUsdc = this.toAmountNumber(quote?.brl_per_usdc);
      if (quote?.success && brlPerUsdc > 0) {
        const estimatedBrl = numeric * brlPerUsdc;
        return this.text(
          language,
          `Valor aproximado do PIX: ${this.formatMoneyByAsset(estimatedBrl.toFixed(2), 'BRL')}. A tela mostra a taxa do app e quanto será enviado antes de confirmar.`,
          `Approximate PIX amount: ${this.formatMoneyByAsset(estimatedBrl.toFixed(2), 'BRL')}. The screen shows the app fee and how much will be sent before confirmation.`
        );
      }
    } catch (error) {
      logger.warn(`[pix-funding-estimate] failed: ${error instanceof Error ? error.message : String(error)}`);
    }

    return this.text(language, 'A tela mostra quanto sai no PIX, a taxa do app e quanto será enviado antes de confirmar.', 'The screen shows how much leaves through PIX, the app fee, and how much will be sent before confirmation.');
  }

  private async buildPixFundedPaymentMessage(state: AgentState, input: {
    recipientQuery: string;
    destinationName: string;
    recipientPublicKey?: string;
    recipientKey?: string;
    amount: string;
    assetCode: string;
    currentBalance?: { amount: number; formatted: string } | null;
    explicitlyNeedsPix?: boolean;
  }): Promise<string> {
    const requestedAmount = this.toAmountNumber(input.amount);
    const available = Math.max(0, input.currentBalance?.amount || 0);
    const needsTopUp = input.currentBalance ? Math.max(0, requestedAmount - available) : requestedAmount;
    const fundingAmount = needsTopUp > 0 ? needsTopUp.toFixed(input.assetCode === 'BRL' ? 2 : 7).replace(/0+$/, '').replace(/\.$/, '') : input.amount;
    const paymentAssetCode = this.toUserFacingAssetCode(input.assetCode).replace(/^USD$/, 'USDC');
    const url = await this.buildPixRampUrl(state, {
      direction: 'onramp',
      flow: 'fund_and_pay',
      amount: fundingAmount,
      amount_currency: paymentAssetCode,
      asset_code: paymentAssetCode,
      recipient_query: input.recipientQuery,
      recipient_public_key: input.recipientPublicKey,
      recipient_key: input.recipientKey,
      pay_amount: input.amount,
      pay_asset_code: paymentAssetCode,
    });
    const language = this.getLanguage(state);
    const fundingEstimate = await this.formatPixFundingEstimate(fundingAmount, input.assetCode, language);
    const balanceLine = input.currentBalance
      ? this.text(language, `Saldo disponível em ${this.toUserFacingAssetCode(input.assetCode)}: ${input.currentBalance.formatted}.`, `Available ${this.toUserFacingAssetCode(input.assetCode)} balance: ${input.currentBalance.formatted}.`)
      : input.explicitlyNeedsPix
        ? this.text(language, 'Você pediu para pagar usando PIX para completar saldo.', 'You asked to pay using PIX to top up your balance.')
      : this.text(language, 'Não consegui confirmar saldo suficiente agora.', 'I could not confirm enough balance right now.');
    const missingLine = input.currentBalance
      ? this.text(language, `Para enviar ${this.formatMoneyByAsset(input.amount, input.assetCode)} para ${input.destinationName}, falta ${this.formatMoneyByAsset(fundingAmount, input.assetCode)}.`, `To send ${this.formatMoneyByAsset(input.amount, input.assetCode)} to ${input.destinationName}, you need ${this.formatMoneyByAsset(fundingAmount, input.assetCode)} more.`)
      : this.text(language, `Vou preparar o PIX para cobrir ${this.formatMoneyByAsset(input.amount, input.assetCode)} e enviar para ${input.destinationName}.`, `I will prepare PIX to cover ${this.formatMoneyByAsset(input.amount, input.assetCode)} and send it to ${input.destinationName}.`);

    return [
      `${balanceLine} ${missingLine}`,
      fundingEstimate,
      this.text(
        language,
        `Escolhemos a rota mais otimizada disponível: o PIX completa seu saldo em ${this.formatUserFacingAssetName(input.assetCode, language)} e, depois da sua confirmação, o pagamento sai automaticamente para ${input.destinationName}.`,
        `We chose the most optimized available route: PIX tops up your balance in ${this.formatUserFacingAssetName(input.assetCode, language)} and, after your confirmation, the payment is sent automatically to ${input.destinationName}.`
      ),
      this.text(language, `Abra o link:\n\n${url}`, `Open the link:\n\n${url}`),
    ].join('\n\n');
  }

  private isRampHistoryRequest(text: string): boolean {
    const normalized = this.normalizeHistoryIntentText(text);
    const mentionsRamp = /\b(pix|deposit|deposito|depositei|depositou|sacar|saque|saquei|sacou|retirada|retirei|ramp|onramp|offramp)\b/.test(normalized);
    const asksAmount = /\b(quanto|total|historico|mes|maio|hoje|depositei|saquei|movimentei)\b/.test(normalized);
    return mentionsRamp && asksAmount && (
      /\bquanto\s+(?:eu\s+)?(?:depositei|sacei|saquei|retirei)\b/.test(normalized) ||
      /\b(?:depositos|saques|retiradas)\s+(?:do|no|esse|este)\s+(?:mes)\b/.test(normalized) ||
      /\bhistorico\s+(?:de\s+)?(?:pix|ramp|depositos|saques)\b/.test(normalized)
    );
  }

  private rampHistoryPeriodFromText(text: string): 'month' | 'today' | 'lifetime' {
    const normalized = this.normalizeHistoryIntentText(text);
    if (/\bhoje\b/.test(normalized)) return 'today';
    if (/\b(total|sempre|todo\s+historico|historico\s+todo|desde\s+o\s+inicio)\b/.test(normalized)) return 'lifetime';
    return 'month';
  }

  private isTransactionHistoryRequest(text: string): boolean {
    const normalized = this.normalizeHistoryIntentText(text)
      .replace(/[!?.,;:]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (!normalized) return false;

    const asksToInitiateTransaction =
      /\b(fazer|criar|montar|preparar|mandar|enviar|pagar|transferir|converter)\b.*\b(transacoes|transacao|operacoes|operacao|pagamento|transferencia)\b/.test(normalized) ||
      /\b(transacoes|transacao|operacoes|operacao|pagamento|transferencia)\b.*\b(?:para|pra|pro|a)\b/.test(normalized);
    const explicitlyAsksHistory =
      /\b(historico|extrato|recibos|comprovantes|listar|mostrar|ver|consultar|minhas|meus)\b/.test(normalized);
    if (asksToInitiateTransaction && !explicitlyAsksHistory) return false;

    const asksHistory =
      /\b(historico|extrato|transacoes|transacao|operacoes|operacao|movimentacoes|movimentacao|recibos|comprovantes)\b/.test(normalized) ||
      normalized.includes('meu historic');
    if (!asksHistory) return false;

    const onlySavings =
      normalized.includes('economia') ||
      normalized.includes('economizei') ||
      normalized.includes('savings') ||
      normalized.includes('metodos tradicionais');
    return !onlySavings;
  }

  private async handleRampHistoryRequest(state: AgentState): Promise<AgentState> {
    if (!state.session_data?.public_key) {
      state.success = false;
      state.response_message = await this.getOnboardingOrLoginMessage(state, this.shouldPreferLogin(state));
    } else {
      try {
        const summary = await ActivityFeedService.summarizeRamps({
          sessionId: state.session_id,
          userId: state.session_data?.user_id,
          period: this.rampHistoryPeriodFromText(state.current_input),
        });
        state.success = true;
        state.response_message = summary.message;
      } catch (error) {
        state.success = false;
        const language = this.getLanguage(state);
        state.response_message = this.text(language, `Não consegui consultar seu histórico de PIX agora: ${error instanceof Error ? error.message : String(error)}`, `I could not check your PIX history right now: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    await this.saveAssistantResponse(state);
    await this.repository.saveState(state.session_id, state);
    return state;
  }

  private async extractPaymentIntentWithLlm(userMessage: string, userId?: string): Promise<{
    recipient_query?: string;
    amount?: string;
    asset_code?: string;
    receive_asset_code?: string;
    category?: string;
    memo?: string;
    is_payment_link?: boolean;
    needs_clarification?: boolean;
    clarification_question?: string;
  }> {
    const prompt = new HumanMessage({
      content: [
        'Extraia apenas o intento de pagamento em JSON válido, sem markdown e sem texto extra.',
        'Regras:',
        '- is_payment_link deve ser true quando o usuário pedir para criar/gerar/fazer/montar link de pagamento, link de transação, link de transferência ou link para alguém receber dinheiro.',
        '- Quando is_payment_link=true, não exija destinatário, contato ou identificador técnico.',
        '- recipient_query deve ser o nome, telefone, email, CPF ou chave de transferência mais útil para identificar o destinatário.',
        '- Se a mensagem pedir para criar/gerar link de pagamento/transação sem destinatário explícito, use recipient_query vazio e needs_clarification false.',
        '- Link de pagamento/transação sem destinatário é Pay Anyone: não peça contato nem identificador técnico.',
        '- amount deve conter apenas o valor numérico, sem moeda.',
        '- asset_code deve ser o ativo de ORIGEM que o usuário quer gastar/enviar (USDC, BRL ou CETES em testnet; EUR só em public/mainnet) quando houver moeda explícita; se o usuário disser USD, normalize para USDC; se disser euro/EUR/EURC em testnet, normalize para CETES.',
        '- receive_asset_code deve ser o ativo de DESTINO que o destinatário deve receber quando a mensagem disser "receber em BRL/USDC/CETES". Isso também vale para links de pagamento.',
        '- Quando a mensagem disser "X em Y pra fora" sem PIX/banco próprio, trate como transferência externa em duas camadas: asset_code é X (origem/gasto) e receive_asset_code é Y (ativo final transferido). "pra fora" sozinho não é destinatário; se não houver contato, e-mail, telefone, CPF, public key ou chave, deixe recipient_query vazio e needs_clarification=true.',
        '- Nunca deixe o ativo de destino sobrescrever o ativo de origem. Ex.: "transferir 200 BRL para Carlos receber em USDC" => amount="200", asset_code="BRL", receive_asset_code="USDC".',
        '- category deve ser um rótulo curto do motivo do pagamento quando o usuário mencionar um propósito (ex.: aluguel, mercado, família, trabalho, viagem).',
        '- memo deve ser um resumo curto e natural do pagamento quando houver contexto útil.',
        '- needs_clarification deve ser true somente se o destinatário ou o valor estiverem ambíguos.',
        '- clarification_question deve estar em pt-BR e curto quando needs_clarification for true.',
        '- Se não houver ambiguidades, clarification_question deve ser string vazia.',
        '',
        'Exemplos:',
        '- "quero mandar pra ana silva 3 usdc" => {"recipient_query":"Ana Silva","amount":"3","asset_code":"USDC","receive_asset_code":"","category":"","memo":"","is_payment_link":false,"needs_clarification":false,"clarification_question":""}',
        '- "quero mandar 10 usdc pra o Rodrigo receber em brl" => {"recipient_query":"Rodrigo","amount":"10","asset_code":"USDC","receive_asset_code":"BRL","category":"","memo":"","is_payment_link":false,"needs_clarification":false,"clarification_question":""}',
        '- "quero transferir 200 brl pra Carlos Souza pra ele receber em usdc" => {"recipient_query":"Carlos Souza","amount":"200","asset_code":"BRL","receive_asset_code":"USDC","category":"","memo":"","is_payment_link":false,"needs_clarification":false,"clarification_question":""}',
        '- "uero mandar 10 usdc em xlm pra fora" => {"recipient_query":"","amount":"10","asset_code":"USDC","receive_asset_code":"XLM","category":"","memo":"","is_payment_link":false,"needs_clarification":true,"clarification_question":"Entendi a conversão de 10 USDC para XLM. Para qual contato, e-mail, telefone, CPF ou public key devo transferir?"}',
        '- "quero mandar 20 cetes pra Ana" => {"recipient_query":"Ana","amount":"20","asset_code":"CETES","receive_asset_code":"","category":"","memo":"","is_payment_link":false,"needs_clarification":false,"clarification_question":""}',
        '- "quero criar um link de transação de 10 usdc" => {"recipient_query":"","amount":"10","asset_code":"USDC","receive_asset_code":"","category":"","memo":"","is_payment_link":true,"needs_clarification":false,"clarification_question":""}',
        '- "quero criar um link de transação de 10 usdc pra pessoa receber em brl" => {"recipient_query":"","amount":"10","asset_code":"USDC","receive_asset_code":"BRL","category":"","memo":"","is_payment_link":true,"needs_clarification":false,"clarification_question":""}',
        '- "gerar link de pagamento de 15 dólares" => {"recipient_query":"","amount":"15","asset_code":"USDC","receive_asset_code":"","category":"","memo":"","is_payment_link":true,"needs_clarification":false,"clarification_question":""}',
        '',
        `Mensagem do usuário: ${userMessage}`,
        '',
        'Formato esperado:',
        '{"recipient_query":"Ana Silva","amount":"10","asset_code":"USDC","receive_asset_code":"BRL","category":"aluguel","memo":"Pagamento do aluguel de maio","is_payment_link":false,"needs_clarification":false,"clarification_question":""}',
      ].join('\n'),
    });

    const response = await this.llm.invoke([prompt]);
    const text = typeof response.content === 'string' ? response.content.trim() : JSON.stringify(response.content || {});

    try {
      const parsed = JSON.parse(text);
      return {
        recipient_query: parsed.recipient_query || parsed.destination || parsed.recipient,
        amount: parsed.amount,
        asset_code: parsed.asset_code || parsed.asset || parsed.currency,
        receive_asset_code: parsed.receive_asset_code || parsed.dest_asset_code || parsed.destination_asset || parsed.receive_asset,
        category: parsed.category || parsed.reason || parsed.purpose,
        memo: parsed.memo || parsed.note || parsed.description,
        is_payment_link: Boolean(parsed.is_payment_link || parsed.payment_link || parsed.pay_anyone),
        needs_clarification: Boolean(parsed.needs_clarification),
        clarification_question: parsed.clarification_question || '',
      };
    } catch {
      return {};
    }
  }

  private async handlePaymentRequest(state: AgentState): Promise<AgentState> {
    if (!state.session_data?.public_key) {
      state.success = false;
      state.response_message = await this.getOnboardingOrLoginMessage(state, this.shouldPreferLogin(state));
      await this.saveAssistantResponse(state);
      await this.repository.saveState(state.session_id, state);
      return state;
    }

    const routeParsed = this.paymentIntentFromLlmRoute(state);
    const routeHasStructuredPayment = Boolean(
      routeParsed.amount ||
      routeParsed.asset_code ||
      routeParsed.receive_asset_code ||
      routeParsed.recipient_query ||
      routeParsed.needs_clarification
    );
    const deterministicParsed = routeHasStructuredPayment ? {} : this.extractDirectPaymentIntentFromText(state.current_input);
    const llmParsed = routeHasStructuredPayment
      ? routeParsed
      : deterministicParsed.amount && deterministicParsed.recipient_query
        ? deterministicParsed
        : await this.extractPaymentIntentWithLlm(state.current_input, state.session_data.user_id);
    const recipientQuery = String(llmParsed.recipient_query || '').trim();
    const amountInfo = this.normalizePaymentAmountAndAsset(
      String(llmParsed.amount || ''),
      llmParsed.asset_code
    );
    const amount = String(amountInfo.amount || '').trim();
    const assetCode = String(amountInfo.assetCode || '').trim().toUpperCase().replace(/^USD$/, 'USDC');

    if (llmParsed.is_payment_link) {
      return await this.handlePayAnyoneLinkRequest(state);
    }

    const genericBestRouteEstimate = this.extractGenericBestRouteEstimateIntent(state.current_input, {
      recipient_query: recipientQuery,
      amount,
      asset_code: assetCode,
      receive_asset_code: llmParsed.receive_asset_code,
    });
    if (genericBestRouteEstimate && (!recipientQuery || this.isGenericRecipientReference(recipientQuery))) {
      return await this.handleGenericBestRouteEstimate(state, genericBestRouteEstimate);
    }

    if (llmParsed.needs_clarification || !recipientQuery || !amount || !assetCode) {
      const language = this.getLanguage(state);
      const missing = [
        !recipientQuery ? this.text(language, 'destinatário', 'recipient') : '',
        !amount ? this.text(language, 'valor', 'amount') : '',
        !assetCode ? this.text(language, 'moeda', 'currency') : '',
      ].filter(Boolean);
      const knownRecipient = recipientQuery
        ? this.text(language, `Destino entendido: ${recipientQuery}. `, `Recipient understood: ${recipientQuery}. `)
        : '';
      const fallbackClarification = this.text(
        language,
        `${knownRecipient}Falta só completar o envio: me diga ${missing.join(' e ') || 'destinatário, valor e moeda'}. Exemplo: mandar para Ana Silva 3 USDC.`,
        `${knownRecipient}I only need the missing payment details: tell me ${missing.join(' and ') || 'recipient, amount, and currency'}. Example: send 3 USDC to Ana Silva.`
      );
      state.success = false;
      state.response_message = llmParsed.clarification_question || fallbackClarification;
      await this.saveAssistantResponse(state);
      await this.repository.saveState(state.session_id, state);
      return state;
    }

    const recipient = await this.resolvePaymentRecipient(recipientQuery, state.session_data?.user_id);
    if (!recipient.destination) {
      state.success = false;
      state.response_message = `Não encontrei ${recipientQuery} nos seus contatos. Me envie e-mail, CPF ou telefone do destinatário para salvar esse contato antes de transferir.`;
      await this.saveAssistantResponse(state);
      await this.repository.saveState(state.session_id, state);
      return state;
    }
    await this.maybeSavePaymentRecipientContact(state, recipientQuery, recipient);

    const balance = await this.getWalletBalanceForAsset(state, assetCode);
    const requestedAmount = this.toAmountNumber(amount);
    const explicitlyNeedsPix = this.hasInsufficientBalanceLanguage(state.current_input);
    const hasInsufficientBalance = Boolean(
      explicitlyNeedsPix ||
      (balance && requestedAmount > 0 && balance.amount + 0.0000001 < requestedAmount)
    );

    if (assetCode !== 'XLM' && hasInsufficientBalance) {
      state.pending_payment = undefined;
      state.success = true;
      state.response_message = await this.buildPixFundedPaymentMessage(state, {
        recipientQuery,
        destinationName: recipient.destinationName,
        recipientPublicKey: recipient.destination,
        recipientKey: this.getContactDisplayKey(recipient.contact) || undefined,
        amount,
        assetCode,
        currentBalance: balance,
        explicitlyNeedsPix,
      });
      await this.saveAssistantResponse(state);
      await this.repository.saveState(state.session_id, state);
      return state;
    }

    const prepared = await this.preparePaymentConfirmationFromIntent(state, {
      recipient_query: recipientQuery,
      amount,
      asset_code: assetCode,
      receive_asset_code: llmParsed.receive_asset_code || assetCode,
      memo: llmParsed.memo,
    });

    if (!prepared.success) {
      state.success = false;
      if (prepared.error === 'destination_not_found') {
        state.response_message = `Não encontrei ${recipientQuery} nos seus contatos. Me envie e-mail, CPF ou telefone do destinatário para salvar esse contato antes de transferir.`;
      } else {
        state.response_message = `Não consegui gerar o link de confirmação do pagamento agora: ${prepared.error || 'erro desconhecido'}`;
      }
    } else {
      state.pending_payment = undefined;
      state.success = true;
      state.response_message = String(
        prepared.message ||
        `Gerei o link de confirmação da forma mais otimizada para enviar ${this.formatMoneyByAsset(amount, assetCode)} para ${recipient.destinationName}.`
      );
    }

    await this.saveAssistantResponse(state);
    await this.repository.saveState(state.session_id, state);
    return state;
  }

  private async extractConversionIntentWithLlm(userMessage: string): Promise<{
    sourceAmount?: string;
    sourceAssetCode?: string;
    destAssetCode?: string;
    needs_clarification?: boolean;
    clarification_question?: string;
  }> {
    const prompt = new HumanMessage({
      content: [
        'Extraia apenas o intento de conversão de ativos em JSON válido, sem markdown e sem texto extra.',
        'Regras:',
        '- sourceAmount deve conter apenas o valor numérico a ser convertido.',
        '- sourceAssetCode deve ser o ativo de origem (USDC, BRL, CETES, XLM ou outro código configurado quando citado explicitamente).',
        '- destAssetCode deve ser o ativo de destino.',
        '- Se o usuário usar USD, normalize para USDC.',
        '- Se o usuário usar euro/EUR/EURC em testnet, normalize para CETES. EUR/EURC fica apenas para public/mainnet.',
        '- Se o usuário usar XLM, lumen ou lumens, normalize para XLM.',
        '- needs_clarification deve ser true só se faltar o ativo de origem, destino ou valor.',
        '- clarification_question deve ser curta e em pt-BR quando needs_clarification for true.',
        '',
        'Exemplos:',
        '- "quero converter 3 usdc pra brl" => {"sourceAmount":"3","sourceAssetCode":"USDC","destAssetCode":"BRL","needs_clarification":false,"clarification_question":""}',
        '- "trocar 10 brl por usdc" => {"sourceAmount":"10","sourceAssetCode":"BRL","destAssetCode":"USDC","needs_clarification":false,"clarification_question":""}',
        '',
        `Mensagem do usuário: ${userMessage}`,
        '',
        'Formato esperado:',
        '{"sourceAmount":"10","sourceAssetCode":"USDC","destAssetCode":"BRL","needs_clarification":false,"clarification_question":""}',
      ].join('\n'),
    });

    const response = await this.llm.invoke([prompt]);
    const text = typeof response.content === 'string' ? response.content.trim() : JSON.stringify(response.content || {});

    try {
      const parsed = JSON.parse(text);
      return {
        sourceAmount: parsed.sourceAmount || parsed.amount,
        sourceAssetCode: String(parsed.sourceAssetCode || parsed.source_asset_code || parsed.asset_code || parsed.asset || '')
          ? this.normalizeAgentAssetCode(parsed.sourceAssetCode || parsed.source_asset_code || parsed.asset_code || parsed.asset)
          : undefined,
        destAssetCode: String(parsed.destAssetCode || parsed.dest_asset_code || parsed.to_asset_code || parsed.destination_asset || '')
          ? this.normalizeAgentAssetCode(parsed.destAssetCode || parsed.dest_asset_code || parsed.to_asset_code || parsed.destination_asset)
          : undefined,
        needs_clarification: Boolean(parsed.needs_clarification),
        clarification_question: parsed.clarification_question || '',
      };
    } catch {
      return {};
    }
  }

  private isFullBalanceConversionRequest(message: string): boolean {
    const normalized = String(message || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();

    return (
      /\b(todo|tudo|inteiro|total|all|entire)\b/.test(normalized) ||
      /\b(saldo inteiro|saldo total|todo o saldo|all balance|entire balance)\b/.test(normalized)
    );
  }

  private inferConversionAssetsFromText(message: string): { sourceAssetCode?: string; destAssetCode?: string } {
    const euroReplacement = getStellarNetworkName() === 'TESTNET' ? 'cetes' : 'eur';
    const normalized = String(message || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/\busd\b/g, 'usdc')
      .replace(/\bdolares?\b/g, 'usdc')
      .replace(/\bdollars?\b/g, 'usdc')
      .replace(/\beuros?\b/g, euroReplacement)
      .replace(/\beur\b/g, euroReplacement)
      .replace(/\beurc\b/g, euroReplacement)
      .replace(/\breais?\b/g, 'brl')
      .replace(/\breal\b/g, 'brl')
      .replace(/\blumens?\b/g, 'xlm');

    const assets = getStellarNetworkName() === 'TESTNET'
      ? ['USDC', 'BRL', 'CETES', 'XLM']
      : ['USDC', 'BRL', 'EUR', 'XLM'];
    const found = assets.filter((asset) => new RegExp(`\\b${asset.toLowerCase()}\\b`).test(normalized));
    const sourceMatch = normalized.match(/\b(?:de|do|da|dos|das)\s+(usdc|brl|cetes|eur|xlm)\b/);
    const destMatch = normalized.match(/\b(?:para|pra|por|em)\s+(usdc|brl|cetes|eur|xlm)\b/);

    const sourceAssetCode = this.normalizeAgentAssetCode(sourceMatch?.[1] || found[0]);
    const destAssetCode = this.normalizeAgentAssetCode(destMatch?.[1] || found.find((asset) => asset !== sourceAssetCode));

    return {
      sourceAssetCode,
      destAssetCode,
    };
  }

  private async resolveFullBalanceConversionAmount(state: AgentState, sourceAssetCode: string): Promise<{
    success: boolean;
    amount?: string;
    availableBalance?: string;
    keptReserve?: string;
    error?: string;
  }> {
    const displayAsset = this.normalizeAgentAssetCode(sourceAssetCode);
    const normalizedAsset = this.toSettlementAssetCode(displayAsset) || displayAsset;
    if (!normalizedAsset || !state.session_data?.public_key) {
      return { success: false, error: 'Não consegui identificar a moeda de origem.' };
    }

    const raw = await executeTool('get_saldo_tecnico', {
      session_id: state.session_id,
      public_key: state.session_data.public_key,
    });

    let result: any;
    try {
      result = JSON.parse(raw);
    } catch {
      return { success: false, error: 'Não consegui ler seu saldo disponível agora.' };
    }

    if (!result.success) {
      return { success: false, error: result.error || 'Não consegui consultar seu saldo.' };
    }

    const balances = Array.isArray(result.balances) ? result.balances : [];
    const balance = balances.find((item: any) => this.toSettlementAssetCode(item.asset || item.asset_code || '') === normalizedAsset);
    const balanceText = String(balance?.balance || '0').replace(',', '.');
    const total = Number(balanceText);
    if (!Number.isFinite(total) || total <= 0) {
      return { success: false, error: `Você não tem saldo disponível em ${this.toUserFacingAssetCode(normalizedAsset)}.` };
    }

    const keptReserve = normalizedAsset === 'XLM' ? 1.6 : 0;
    const toSevenDecimalUnits = (value: string): number => {
      const [integerRaw, fractionRaw = ''] = String(value || '0').replace(',', '.').split('.');
      const integer = Number(integerRaw || '0');
      const fraction = Number(fractionRaw.padEnd(7, '0').slice(0, 7) || '0');
      return (Number.isFinite(integer) ? integer : 0) * 1e7 + (Number.isFinite(fraction) ? fraction : 0);
    };
    const totalUnits = toSevenDecimalUnits(balanceText);
    const reserveUnits = Math.ceil(keptReserve * 1e7);
    const spendable = Math.max(0, totalUnits - reserveUnits) / 1e7;
    if (!Number.isFinite(spendable) || spendable <= 0.0000001) {
      return {
        success: false,
        availableBalance: total.toFixed(7),
        keptReserve: keptReserve ? keptReserve.toFixed(7) : undefined,
        error: normalizedAsset === 'XLM'
          ? 'Esse saldo em XLM fica reservado para manter sua conta ativa.'
          : `Você não tem saldo disponível em ${this.toUserFacingAssetCode(normalizedAsset)}.`,
      };
    }

    return {
      success: true,
      amount: spendable.toFixed(7),
      availableBalance: total.toFixed(7),
      keptReserve: keptReserve ? keptReserve.toFixed(7) : undefined,
    };
  }

  private async prependContactsContext(messages: BaseMessage[], userId?: string): Promise<BaseMessage[]> {
    if (!userId) {
      return messages;
    }

    try {
      const contacts = await this.fetchContacts(userId);
      if (!contacts.length) {
        return messages;
      }

      const contactNames = contacts
        .map((contact: any) => String(contact?.display_label || contact?.contact_name || contact?.name || '').trim())
        .filter(Boolean)
        .slice(0, 8);

      const contextMessage = new SystemMessage({
        content: [
          '## CONTEXT OF SAVED CONTACTS',
          `The user has ${contacts.length} saved contacts.`,
          contactNames.length ? `Known names: ${contactNames.join(', ')}.` : 'No contact names were resolved.',
          'If the message asks to see, list, show, open, or review saved recipients, beneficiaries, favorites, or contacts, classify it as contacts.',
        ].join(' '),
      });

      return [messages[0], contextMessage, ...messages.slice(1)];
    } catch (error) {
      logger.debug(`[prependContactsContext] Error: ${error instanceof Error ? error.message : String(error)}`);
      return messages;
    }
  }

  private isContactsRequest(text: string): boolean {
    const normalized = this.normalizeTextForIntent(text)
      .replace(/[^\w\s@.+-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (!normalized) {
      return false;
    }

    return (
      /\b(contatos?|destinat[aá]ri(?:o|os)?|favorit(?:o|os)?|salv(?:o|os)?|agenda)\b/.test(normalized) ||
      normalized === 'contatos' ||
      normalized === 'meus contatos' ||
      normalized === 'contatos salvos' ||
      normalized === 'meus destinatarios' ||
      normalized === 'destinatarios salvos' ||
      normalized === 'meus favoritos'
    );
  }

  private extractContactIntentFromText(userMessage: string): {
    action?: 'add' | 'list';
    contact_key?: string;
    contact_name?: string;
    needs_clarification?: boolean;
    clarification_question?: string;
  } | null {
    const normalized = this.normalizeTextForIntent(userMessage)
      .replace(/[^\w\s@.+-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const mentionsPix = /\bpix\b/.test(normalized);
    if (mentionsPix) {
      return null;
    }

    const looksLikeApplicationRequest =
      /\b(rendendo|rendimento|rendimentos|render|investir|investimento|investimentos|aplicar|aplicacao|aplicacoes|posicao|posicoes)\b/.test(normalized);
    if (looksLikeApplicationRequest) {
      return null;
    }

    if (!normalized || !this.isContactsRequest(normalized)) {
      const addVerbFallback = /\b(adicion(?:a|ar|e)?|salv(?:a|ar|e)?|inclu(?:i|ir|a)?|cadastr(?:a|ar|e)?|novo contato|criar contato|coloc(?:a|ar|e)?|guardar|registrar)\b/.test(normalized);
      if (!addVerbFallback) {
        return null;
      }
    }

    const listVerb = /\b(ver|mostrar|listar|abrir|consultar|exibir|quem|quais|cade|cad[eê]|revisar|olhar)\b/.test(normalized);
    const directList = /^(meus contatos|contatos|contatos salvos|meus destinatarios|destinatarios salvos|meus favoritos)$/.test(normalized);
    const addVerb = /\b(adicion(?:a|ar|e)?|salv(?:a|ar|e)?|inclu(?:i|ir|a)?|cadastr(?:a|ar|e)?|novo contato|criar contato|coloc(?:a|ar|e)?|guardar|registrar)\b/.test(normalized);

    if (directList || (listVerb && !addVerb)) {
      return { action: 'list' };
    }

    if (addVerb) {
      const publicKeyMatch = normalized.match(/\bG[A-Z2-7]{55}\b/i)?.[0]?.trim();
      const emailMatch = normalized.match(/\b[\w.+-]+@[\w-]+(?:\.[\w-]+)+\b/i)?.[0]?.trim();
      const phoneMatch = normalized.match(/(?:\+?\d[\d\s().-]{7,}\d)/)?.[0]?.replace(/\D+/g, '');
      const pixKeyMatch = normalized.match(/\b(?:pix\s*[:=]\s*)?([\w.+-]+@[\w-]+(?:\.[\w-]+)+|\+?\d[\d\s().-]{7,}\d|G[A-Z2-7]{55})\b/i)?.[1]?.trim();

      const contactKey = publicKeyMatch || emailMatch || phoneMatch || pixKeyMatch || '';
      const addTargetMatch = /\b(?:nos?|meus|minha)\s+contatos?\b/i.test(normalized) || /\b(?:salvar|adicionar|incluir|cadastrar|registrar)\s+(.+)$/i.test(normalized) || Boolean(contactKey);

      if (!contactKey || !addTargetMatch) {
        return {
          action: 'add',
          contact_key: contactKey,
          contact_name: '',
          needs_clarification: !contactKey,
          clarification_question: !contactKey
            ? 'Me diga a chave, email, telefone ou public key do contato.'
            : '',
        };
      }

      const contactName = normalized
        .replace(publicKeyMatch || '', '')
        .replace(emailMatch || '', '')
        .replace(phoneMatch || '', '')
        .replace(/\b(?:adicion(?:a|e|ar)?|salv(?:a|e|ar)?|inclu(?:i|ir|a)?|cadastr(?:a|e|ar)?|coloc(?:a|ar)?|guardar|registrar|quero|gostaria|preciso|desejo|pode|poderia|por favor|favor|nos?|meus|minha|contatos?|contato|novo contato|criar contato)\b/g, ' ')
        .replace(/[\s,.;:!?]+/g, ' ')
        .trim();

      return {
        action: 'add',
        contact_key: contactKey,
        contact_name: contactName,
        needs_clarification: false,
        clarification_question: '',
      };
    }

    return null;
  }

  private maskPublicKey(publicKey?: string): string {
    const value = String(publicKey || '').trim();
    if (!value) return 'indisponivel';
    if (value.length <= 14) return value;
    return `${value.slice(0, 8)}...${value.slice(-6)}`;
  }

  private normalizeLookup(value: string): string {
    return String(value || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^\w\s@.+-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
  }

  private async buildRuntimeContext(userId?: string, sessionId?: string, language: 'pt-BR' | 'en' = 'pt-BR'): Promise<string> {
    const normalizedSessionId = String(sessionId || '').trim();
    let sessionData: any = null;
    let walletData: any = null;
    let stateData: Partial<AgentState> | null = null;
    let contacts: any[] = [];

    if (normalizedSessionId) {
      try {
        sessionData = await this.repository.getSession(normalizedSessionId);
      } catch (error) {
        logger.warn(`[buildRuntimeContext] Failed to load session: ${error instanceof Error ? error.message : String(error)}`);
      }

      try {
        stateData = await this.repository.getState(normalizedSessionId);
      } catch (error) {
        logger.warn(`[buildRuntimeContext] Failed to load state: ${error instanceof Error ? error.message : String(error)}`);
      }

      try {
        const { data: walletRow, error: walletError } = await supabase
          .from('wallets')
          .select('public_key, name, pix_key, session_id')
          .eq('session_id', normalizedSessionId)
          .limit(1)
          .maybeSingle();

        if (walletError) {
          logger.warn(`[buildRuntimeContext] Failed to load wallet: ${walletError.message}`);
        } else {
          walletData = walletRow;
        }
      } catch (error) {
        logger.warn(`[buildRuntimeContext] Wallet lookup failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    const resolvedUserId = String(userId || sessionData?.user_id || sessionData?.email || '').trim();
    if (resolvedUserId) {
      contacts = await this.fetchContacts(resolvedUserId);
    }

    const forceLoggedOut = Boolean((stateData?.action_params as any)?.force_logged_out);
    const publicKey = forceLoggedOut
      ? ''
      : String(sessionData?.public_key || walletData?.public_key || '').trim();
    const transferKey = forceLoggedOut
      ? ''
      : String(sessionData?.pix_key || walletData?.pix_key || '').trim();
    const email = String(sessionData?.email || '').trim();
    const phoneNumber = String(sessionData?.phone_number || '').trim();
    const hasActiveWallet = Boolean(publicKey);
    const contactLines = contacts.slice(0, 12).map((contact: any, index: number) => {
      const name = String(contact.contact_name || contact.name || `Contato ${index + 1}`).trim();
      const contactTransferKey = String(contact.pix_key || '').trim();
      const email = String(contact.email || contact.contact_profile?.email || '').trim();
      const cpf = String(contact.cpf || contact.contact_profile?.cpf || '').trim();
      return `${index + 1}. ${name} | transfer_key=${contactTransferKey || 'indisponivel'} | email=${email || 'indisponivel'} | cpf=${cpf || 'indisponivel'}`;
    });

    const pendingPayment = stateData?.pending_payment || (stateData?.action_params as any)?.pending_payment;
    const pendingConversion = stateData?.pending_conversion || (stateData?.action_params as any)?.pending_conversion;

    return [
      '## RUNTIME CONTEXT',
      `current_time=${new Date().toISOString()}`,
      `preferred_language=${language}`,
      `session_id=${normalizedSessionId || 'indisponivel'}`,
      `user_id=${resolvedUserId || 'indisponivel'}`,
      `session_active=${hasActiveWallet ? 'true' : 'false'}`,
      `force_logged_out=${forceLoggedOut ? 'true' : 'false'}`,
      `account_identifier_available=${publicKey ? 'true' : 'false'}`,
      `transfer_key=${transferKey || 'indisponivel'}`,
      `email=${email || 'indisponivel'}`,
      `phone_number=${phoneNumber || 'indisponivel'}`,
      `contacts_count=${contacts.length}`,
      contactLines.length ? `contacts:\n${contactLines.join('\n')}` : 'contacts=none',
      pendingPayment ? `pending_payment=${JSON.stringify(pendingPayment)}` : 'pending_payment=none',
      pendingConversion ? `pending_conversion=${JSON.stringify(pendingConversion)}` : 'pending_conversion=none',
      '',
      '## CONTEXT RULES',
      `- ${this.languageInstruction(language)}`,
      '- Treat RUNTIME CONTEXT as authoritative for this turn.',
      '- If session_active=true, never ask for user_id or session_id. Use the provided session_id in tools.',
      '- If session_active=false, do not invent account data. Return the login/onboarding link flow.',
      '- For balances, contacts, history, payments, conversions, PIX, earnings, reset PIN, explanations, and logout, prefer tools over free text.',
      '- Never return the generic capability menu for actionable money movement. Interpret typo-heavy Portuguese semantically instead of relying on exact spelling.',
      '- If the message asks to send/pay/transfer a concrete amount plus asset to a named person/contact/email/key and does not mention PIX as the rail, this is a normal payment. Use payment handling/tools, not get_intent_help.',
      '- If the user asks what the app can do, asks for an explanation, or asks about a feature, asset, balance, XLM, CETES, USDC, BRL, or rendimentos, call get_product_context when the answer needs context beyond a direct action.',
      '- If the user asks "quais sao os assets", "explique os ativos/moedas", or asks to explain each currency, use get_explanations with topic="assets" and answer the assets directly. Do not return the generic capability menu.',
      '- When a tool accepts session_id, pass exactly the session_id from RUNTIME CONTEXT.',
      '- When adding/listing contacts, use session_id and the contact key from the user message.',
      '- Never invent amounts, fees, quotes, hashes, contact names, or success states.',
      '- Strict contact rule: if a payment names a person, use only a real saved contact from RUNTIME CONTEXT/tool results. If not found, ask for an exact saved contact or transfer key/email/CPF/phone; never create a recipient from a typo.',
      '- In payment and conversion tools, source/origin asset is what the sender spends; destination asset is what the recipient receives.',
      '- Example: "transferir 200 BRL para Carlos receber em USDC" means source_amount=200, source_asset_code=BRL, destination/dest asset=USDC. Do not send 200 USDC.',
      '- Never invent PIX URLs or routes. PIX flows must use the PIX route handler, which builds /pix-on or /pix-off from FRONTEND_URL after the LLM has selected the PIX route.',
      '- Never expose TESOURO in normal user copy. In PIX flows it is internal and should be described as reais or R$.',
      '- Do not mention sandbox/testnet/devnet/provider/anchor/Etherfuse/infrastructure in chat. User-facing copy must sound like a banking app.',
      '- Mainnet is an advanced separate mode. Only discuss Stellar Mainnet if the user explicitly says mainnet, pubnet, rede publica, carteira mainnet, or saldo mainnet.',
      '- For Mainnet requests, say Mainnet uses real assets and is read-only by default. Never ask for or accept secret keys; only public keys beginning with G are allowed.',
      '- For explicit Mainnet balance/configuration requests, use get_mainnet_status, attach_mainnet_wallet, get_mainnet_balance, or preview_mainnet_payment instead of the normal app balance tools.',
      '- If the user asks to toggle networks, direct them to /mainnet. PIX is separate from Mainnet and must not be presented as a Mainnet feature.',
      '- For PIX to the user own PIX, own bank/account, or money going "fora da minha conta", use off-ramp. For PIX used to fund a transfer to another person, use on-ramp plus transfer.',
      '- In user-facing PIX off-ramp copy, call the destination "seu PIX", not bank account, external account, or banco.',
      '- PIX off-ramp always arrives as BRL in the user PIX. If the source is USDC, say the screen converts at exit and confirms BRL arriving.',
      '- Before normal payment links, confirm whether balance is sufficient. If balance is missing or the user says they do not have saldo, open PIX on-ramp with automatic payment after confirmation.',
      '- For PIX plus payment, say the route is optimized and fees are shown before confirmation, but never expose internal settlement assets.',
      '- Never mention blockchain internals in user-facing copy. Do not mention issuer, trustline, ledger, Horizon, path payment, or Stellar network details unless the user explicitly asks for technical details.',
      '- XLM is a visible app asset. Balance answers must include XLM together with R$, US$, and CETES/Mexico test option in testnet when available.',
      '- Do not send duplicate welcome/start messages. Mini-menus are for first greeting, ajuda, onboarding/login completion, or when the user is clearly lost.',
      '- For first greetings, use get_intent_help and show the full capability list with one short explanatory line per area. If the user explicitly asks for ajuda, funcionalidades, comandos, or what TalkToStellar can do, use the same fuller capability list.',
      '- Mini-menus must use no technical terms and no second welcome block if the user already received a login/onboarding completion message.',
      '- Never use the technical word "yield" in user-facing copy or examples. In pt-BR say "rendimentos", "dinheiro rendendo", "investimento" or "posição"; in English say "earnings", "investments", or "position".',
      '- If a quote, confirmation, or payment link is expired, stop the old flow and generate a fresh quote/link. Never reuse expired numbers.',
      '- Map internal/provider errors to user-safe recovery text. Do not expose SQL, schema cache, API JSON, Friendbot, Horizon, issuer, trustline, liquidity diagnostics, stack traces, or provider credentials.',
      '',
      '## YIELD UX',
      '- For earnings/investment intents, use yield tools instead of free text.',
      '- User-facing copy for this flow must say aplicação, investimento, dinheiro rendendo, posição, dollars, CETES/opção México, or reais. Never use the word "yield" in user-facing text. Do not use public return-rate wording in user-facing text. Never mention Defindex, vault, contract, XDR, blockchain, issuer, trustline, Horizon, internals, or Stellar.',
      '- Use get_yield_options for available currencies, get_yield_balance for current position, prepare_yield_action before confirmation, and confirm_yield_action only after explicit confirmation plus PIN.',
      '- For broad multi-asset navigation like "trazer", "manter", "mandar embora", "add money", "apply", or "send to PIX", use open_asset_interface so the user receives a frontend URL.',
      '- Do not discuss returns/rates publicly. Say only that the user reviews value and operation before confirming.',
      '- Route users to /rendimentos for the earnings/application page. Do not route users to legacy localized routes.',
      '- For generic conversion requests without amount or without both assets, use open_conversion_interface and let the page collect value and currencies. For explicit conversion requests with amount, source asset, and destination asset, prepare the conversion confirmation flow.',
      '',
      '## FEES AND SAVINGS UX',
      '- Talk about fees as transparent and controlled, using exact tool data when available.',
      '- When a quote or payment result has a fee, say it before confirmation in R$, US$, or CETES/opção México according to the asset involved.',
      '- Do not claim savings without data. Prefer concise wording like "taxa baixa" only when backed by tool data.',
      '- For transfers/conversions, show the quote before confirmation without adding generic reassurance text.',
      '- For BRL -> US$ net value, exchange-rate, fee, or received-amount questions, call get_conversion_preview or a quote tool. Never use a hardcoded exchange rate.',
      '- If the user asks "quanto custa enviar", "quanto vou pagar", "vale a pena", "comparado com o banco", "banco", or "Wise" with a transfer amount, call show_savings_calculator before asking for confirmation. Never answer fee comparison only with free text.',
      '- After BRL <-> USDC payments or conversions completed inside the agent flow, call send_receipt_with_savings only when there are positive BRL sent and USDC/USD received amounts. For XLM, CETES, same-asset payments, or missing BRL/USD values, preserve the normal asset-aware receipt and never show zero savings.',
      '- If the user asks "quanto eu economizei", "resumo do ano", or "histórico de economia", call show_annual_savings_summary.',
      '- Approved savings tool messages are WhatsApp-ready. Preserve emojis, *bold*, and _italic_ exactly as returned by show_savings_calculator, send_receipt_with_savings, or show_annual_savings_summary.',
    ].join('\n');
  }

  private async invokeWithTools(
    messages: BaseMessage[],
    userId?: string,
    sessionId?: string,
    language: 'pt-BR' | 'en' = 'pt-BR',
    sessionToken?: string,
    maxRounds: number = 3
  ): Promise<string> {
    const isUuid = (value: string) =>
      /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
    const isSessionPlaceholder = (value: string) => {
      const normalized = String(value || "").trim().toLowerCase();
      return (
        normalized === "current_session" ||
        normalized === "session_atual" ||
        normalized === "current session" ||
        normalized === "current-session"
      );
    };

    // Some LangChain LLM wrappers provide `bindTools`; fall back if not present.
    const maybeBind = (this.llm as any).bindTools;
    const toolAwareLlm =
      typeof maybeBind === "function"
        ? maybeBind.call(this.llm, ALL_TOOLS as any, { tool_choice: "auto" } as any)
        : this.llm;

    let conversation = [
      new SystemMessage({ content: await this.buildRuntimeContext(userId, sessionId, language) }),
      ...messages,
    ];

    for (let round = 0; round < maxRounds; round += 1) {
      logger.debug(`[invokeWithTools] Round ${round + 1}/${maxRounds}`);
      const response = await toolAwareLlm.invoke(conversation);
      
      logger.debug(`[invokeWithTools] Response content: ${typeof response.content === "string" ? response.content.substring(0, 200) : "not-string"}`);
      logger.debug(`[invokeWithTools] Response tool_calls: ${JSON.stringify(response?.tool_calls?.length || 0)}`);
      logger.debug(`[invokeWithTools] Response additional_kwargs: ${JSON.stringify(Object.keys(response?.additional_kwargs || {}))}`);
      
      const toolCalls = this.extractToolCalls(response);
      logger.debug(`[invokeWithTools] Extracted tool calls: ${toolCalls.length}`);
      if (toolCalls.length > 0) {
        logger.debug(`[invokeWithTools] Tool calls: ${JSON.stringify(toolCalls)}`);
      }

      if (toolCalls.length === 0) {
        logger.debug(`[invokeWithTools] No tool calls, returning content`);
        return typeof response.content === "string"
          ? response.content
          : JSON.stringify(response.content);
      }

      conversation.push(response as any);

      for (const toolCall of toolCalls) {
        // Normalize session_id in tool args using current runtime context.
        const toolArgs = toolCall.args || {};
        const incomingSessionId = String(toolArgs.session_id || "").trim();
        if (
          sessionId &&
          (
            !incomingSessionId ||
            isSessionPlaceholder(incomingSessionId) ||
            !isUuid(incomingSessionId)
          )
        ) {
          toolArgs.session_id = sessionId;
        }

        if (toolCall.name === 'reset_pin') {
          if (sessionToken && !String(toolArgs.session_token || toolArgs.sessionToken || '').trim()) {
            toolArgs.session_token = sessionToken;
          }
          if (!String(toolArgs.language || '').trim()) {
            toolArgs.language = language;
          }
        }
        
        const logArgs = { ...toolArgs };
        if (logArgs.session_token) logArgs.session_token = '[redacted]';
        if (logArgs.sessionToken) logArgs.sessionToken = '[redacted]';
        logger.info(`[invokeWithTools] Executing tool: ${toolCall.name} with args: ${JSON.stringify(logArgs)}`);
        const toolResult = await executeTool(toolCall.name, toolArgs);
        logger.debug(`[invokeWithTools] Tool result: ${toolResult.substring(0, 200)}`);
        conversation.push(
          new ToolMessage({
            tool_call_id: toolCall.id || `${toolCall.name}-${Date.now()}`,
            content: toolResult,
          })
        );
      }
    }

    logger.debug(`[invokeWithTools] Max rounds reached, invoking final fallback`);
    const fallback = await this.llm.invoke(conversation);
    return typeof fallback.content === "string"
      ? fallback.content
      : JSON.stringify(fallback.content);
  }

  private intentFromRoutingToolName(value: unknown): IntentType | null {
    const toolName = String(value || '').trim();
    return INTENT_BY_ROUTING_TOOL.get(toolName) || null;
  }

  private buildIntentRouterContext(messages?: Array<{ role?: string; content?: string }>): string {
    const recent = (Array.isArray(messages) ? messages : [])
      .slice(-6)
      .map((message) => {
        const role = String(message?.role || '').toLowerCase() === 'assistant' ? 'Assistant' : 'User';
        const content = this.sanitizeUserMessage(String(message?.content || '')).trim();
        if (!content) return '';
        return `${role}: ${content.slice(0, 500)}`;
      })
      .filter(Boolean);

    return recent.length ? recent.join('\n') : 'No previous conversation context.';
  }

  private buildIntentRouterMessages(message: string, history?: Array<{ role?: string; content?: string }>): BaseMessage[] {
    const sanitized = this.sanitizeUserMessage(String(message || '')).trim();
    const userMessage = sanitized.length > INTENT_ROUTER_MAX_MESSAGE_LENGTH
      ? `${sanitized.slice(0, INTENT_ROUTER_MAX_MESSAGE_LENGTH)}\n[message truncated for routing]`
      : sanitized;
    const context = this.buildIntentRouterContext(history);

    return [
      new SystemMessage({ content: this.buildIntentRouterPrompt() }),
      new HumanMessage({
        content: [
          'Decide whether the latest message should trigger a TalkToStellar route tool.',
          'Use the recent conversation context to complete truncated or follow-up requests.',
          'Call one route tool only when a concrete product route should run.',
          '',
          'Recent conversation context:',
          context,
          '',
          `Latest user message: ${userMessage}`,
          `User message: ${userMessage}`,
        ].join('\n'),
      }),
    ];
  }

  private buildIntentRouteAuditMessages(
    message: string,
    selected: IntentRouteCandidate,
    history?: Array<{ role?: string; content?: string }>
  ): BaseMessage[] {
    const sanitized = this.sanitizeUserMessage(String(message || '')).trim();
    const userMessage = sanitized.length > INTENT_ROUTER_MAX_MESSAGE_LENGTH
      ? `${sanitized.slice(0, INTENT_ROUTER_MAX_MESSAGE_LENGTH)}\n[message truncated for routing]`
      : sanitized;
    const context = this.buildIntentRouterContext(history);

    return [
      new SystemMessage({
        content: [
          this.buildIntentRouterPrompt(),
          '',
          '## ROUTE AUDIT',
          `Previous route tool selected: ${selected.toolName}.`,
          'Re-evaluate from first principles. Do not preserve the previous route unless it truly matches the route contract.',
          'If the user is adding, placing, depositing, loading, bringing, or receiving money/saldo via PIX into their own account, call route_pix_onramp_intent.',
          'If the user is withdrawing, sending out, sacar, retirar, or moving money to their own PIX/bank exit, call route_pix_offramp_intent.',
          'If the user names another person/contact/recipient for a PIX payment, call route_pix_intent and preserve the final amount/asset for that recipient.',
          'Exact audit example: "uero fazer pix pra ana silva de 100 xlm" must be route_pix_intent, not route_pix_onramp_intent. It means pay Ana Silva 100 XLM using PIX funding.',
          'Exact audit example: "quero fazer pix pra ana silva de 100 xlm" must be route_pix_intent, not route_pix_onramp_intent. It means pay Ana Silva 100 XLM using PIX funding.',
          'Multi-turn audit example: previous user "quero mandar 100 cetes d" followed by latest user "pra ana silva via pix" must be route_pix_intent with amount=100, asset_code=CETES, recipient_query=Ana Silva.',
          'A named recipient after pra/para/pro/a makes own-account on-ramp invalid unless the phrase is explicitly "pra minha conta".',
          'If the user is asking to manage saved contacts/recipients, call route_contacts_intent.',
          'Call exactly one route tool.',
        ].join('\n'),
      }),
      new HumanMessage({
        content: [
          'Audit the selected TalkToStellar route for this message.',
          'Recent conversation context:',
          context,
          '',
          `Latest user message: ${userMessage}`,
          `User message: ${userMessage}`,
        ].join('\n'),
      }),
    ];
  }

  private shouldAuditSelectedIntentRoute(candidate: IntentRouteCandidate): boolean {
    return candidate.intent === IntentType.CONTACTS || candidate.toolName === 'route_pix_onramp_intent';
  }

  private normalizeRouteConfidence(value: unknown): number {
    const confidence = Number(value);
    if (!Number.isFinite(confidence)) return 0;
    return Math.max(0, Math.min(1, confidence));
  }

  private routeCandidateFromToolCall(call: { name: string; args?: Record<string, any> }): IntentRouteCandidate | null {
    const intent = this.intentFromRoutingToolName(call.name);
    if (!intent) return null;

    const rawLanguage = String(call.args?.language || '').trim();
    const language = rawLanguage === 'en' ? 'en' : rawLanguage === 'pt-BR' ? 'pt-BR' : undefined;
    const rawRisk = String(call.args?.risk || '').trim();
    const risk = rawRisk === 'low' || rawRisk === 'medium' || rawRisk === 'high' ? rawRisk : undefined;
    const rawAmount = String(call.args?.amount || '').trim();
    const amount = rawAmount ? normalizeHumanAmountText(rawAmount) : undefined;
    const assetCode = this.normalizeAgentAssetCode(call.args?.asset_code || '');
    const sourceAssetCode = this.normalizeAgentAssetCode(call.args?.source_asset_code || '');
    const destAssetCode = this.normalizeAgentAssetCode(call.args?.dest_asset_code || '');
    const rawQuoteMode = String(call.args?.quote_mode || '').trim();
    const quoteMode = rawQuoteMode === 'market_price' || rawQuoteMode === 'send_exact'
      ? rawQuoteMode
      : undefined;
    const recipientQuery = String(call.args?.recipient_query || '').trim();

    return {
      intent,
      toolName: call.name,
      confidence: this.normalizeRouteConfidence(call.args?.confidence),
      reason: typeof call.args?.reason === 'string' ? call.args.reason.slice(0, 220) : undefined,
      needsClarification: typeof call.args?.needs_clarification === 'boolean'
        ? call.args.needs_clarification
        : undefined,
      language,
      risk,
      amount: amount || undefined,
      assetCode: assetCode || undefined,
      sourceAssetCode: sourceAssetCode || undefined,
      destAssetCode: destAssetCode || undefined,
      quoteMode,
      allQuotes: call.args?.all_quotes === true || String(call.args?.all_quotes || '').trim().toLowerCase() === 'true',
      recipientQuery: recipientQuery || undefined,
    };
  }

  private serializeIntentRouteCandidate(candidate: IntentRouteCandidate | null): Record<string, any> | undefined {
    if (!candidate) return undefined;
    return {
      intent: candidate.intent,
      tool_name: candidate.toolName,
      confidence: candidate.confidence,
      needs_clarification: candidate.needsClarification,
      language: candidate.language,
      risk: candidate.risk,
      amount: candidate.amount,
      asset_code: candidate.assetCode,
      source_asset_code: candidate.sourceAssetCode,
      dest_asset_code: candidate.destAssetCode,
      quote_mode: candidate.quoteMode,
      all_quotes: candidate.allQuotes,
      recipient_query: candidate.recipientQuery,
    };
  }

  private extractRouteCandidates(toolResponse: any): IntentRouteCandidate[] {
    return this.extractToolCalls(toolResponse)
      .map((call) => this.routeCandidateFromToolCall(call))
      .filter((candidate): candidate is IntentRouteCandidate => Boolean(candidate))
      .sort((a, b) => b.confidence - a.confidence);
  }

  private sanitizeIntentRouterLogMessage(message: string): string {
    return this.sanitizeUserMessage(String(message || ''))
      .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, '[redacted_email]')
      .replace(/\b(?:pin|senha)\s*[:=-]?\s*\d{3,12}\b/gi, 'PIN [redacted]')
      .replace(/\+?\d[\d\s().-]{7,}\d/g, '[redacted_number]')
      .slice(0, 160);
  }

  private logIntentRoute(message: string, candidate: IntentRouteCandidate, mode: string, candidateCount: number): void {
    const fields = [
      `intent=${candidate.intent}`,
      `via=${candidate.toolName}`,
      `confidence=${candidate.confidence.toFixed(2)}`,
      `mode=${mode}`,
      `candidates=${candidateCount}`,
    ];
    if (candidate.needsClarification !== undefined) fields.push(`needsClarification=${candidate.needsClarification}`);
    if (candidate.risk) fields.push(`risk=${candidate.risk}`);
    if (candidate.language) fields.push(`language=${candidate.language}`);
    if (candidate.reason) fields.push(`reason=${JSON.stringify(candidate.reason)}`);

    logger.info(`[Agent] LLM intent route ${fields.join(' ')} message=${JSON.stringify(this.sanitizeIntentRouterLogMessage(message))}`);
  }

  private async invokeIntentRouter(messages: BaseMessage[]): Promise<{ selected: IntentRouteCandidate; candidateCount: number } | null> {
    const maybeBind = (this.llm as any).bindTools;
    if (typeof maybeBind !== 'function') {
      logger.warn('[Agent] Intent router unavailable because current LLM client does not expose bindTools');
      return null;
    }

    const toolAwareRouter = maybeBind.call(this.llm, INTENT_ROUTING_TOOLS as any, {
      tool_choice: 'required',
    } as any);
    const toolResponse = await toolAwareRouter.invoke(messages);
    const candidates = this.extractRouteCandidates(toolResponse);

    if (candidates.length > 1) {
      logger.warn(`[Agent] Intent router returned multiple route tools; selecting highest confidence: ${candidates.map((candidate) => `${candidate.toolName}:${candidate.confidence.toFixed(2)}`).join(', ')}`);
    }

    const selected = candidates[0] || null;
    if (!selected) {
      logger.warn(`[Agent] Intent router selected no route tool even with required tool_choice; continuing as general. response=${JSON.stringify(toolResponse?.content || toolResponse).slice(0, 300)}`);
      return null;
    }

    return { selected, candidateCount: candidates.length };
  }

  private buildIntentRouterPrompt(): string {
    return `You are the routing layer for TalkToStellar.
You are TalkToStellar's intent router. You are not a chatbot in this step.

Your only job is to call exactly one route_*_intent tool for the user's latest message.
This routing step must call exactly one route_*_intent tool for every user message.
Do not answer the user. Do not refuse. Do not explain. Select the best route tool.

Core rule:
- If the message asks for any supported TalkToStellar product action, call that product route.
- Always interpret the latest user message together with recent conversation context. Follow-up messages can complete an action started earlier.
- If the previous context contains a send/pay/transfer request with amount and asset, and the latest message supplies the recipient or payment rail, combine them into one routed action.
- Missing details are not a reason to use route_general_intent. Use needs_clarification=true.
- Do not choose route_general_intent just because amount, asset, destination, contact, public key, or PIN is missing.
- route_general_intent is not a fallback for failed understanding. If the message is actionable, choose the concrete product route.
- Typos, missing accents, slang, abbreviations, and mixed Portuguese/English must be interpreted semantically.
- route_general_intent is the lowest-priority route. Use it only for greetings, broad menu/help/capability questions, broad educational explanations, or non-product small talk.
- Never use route_general_intent for balance, contacts, PIX, conversion, quote, yield/earnings, history, financial memory, PIN/security, payment, payment link, login, logout, wallet, profile, public key, or account access.
- route_general_intent is not acceptable for money-transfer requests that combine a transfer verb, amount, asset/currency, and recipient, even when the text has typos.

Structured extraction fields:
- When the user provides a numeric amount, fill amount as a normalized decimal string.
- When the user provides an asset/currency, fill asset_code as BRL, USDC, CETES, or XLM. Use USDC for USD/dollars.
- When amount or asset is missing from the latest message but is clearly present in recent conversation context for the same unfinished request, fill it from that context.
- For quote/best-route/rate/cost requests between two assets, fill source_asset_code and dest_asset_code. Example: "cotacao XLM para USDC" -> source_asset_code=XLM, dest_asset_code=USDC. "melhor rota de USDC pra BRL" -> source_asset_code=USDC, dest_asset_code=BRL. "quanto está CETES/XLM" -> source_asset_code=CETES, dest_asset_code=XLM.
- For single-asset quote requests in Portuguese/Brazil context, default the quote against BRL. Examples: "cotação do CETES", "uero ver a cotacao do cetes", "preço do XLM", "quanto custa CETES" -> source_asset_code=CETES or XLM, dest_asset_code=BRL, quote_mode=market_price. Do not answer with USDC/BRL unless the user asks for dólar/USDC or gives no asset at all.
- In quote/rate requests, amount is optional. If the user does not provide an amount, leave amount empty.
- For price/cotacao/preco/custo questions about a pair, set quote_mode=market_price. This means "how much of dest_asset is needed to receive/buy source_asset"; for example "cotacao XLM/BRL", "preco de XLM em reais", and "quanto custa 100 XLM em BRL" use market_price.
- For sell/send/convert/route-direction simulations, set quote_mode=send_exact. This means "if I send source_asset, how much dest_asset do I receive"; for example "melhor rota de USDC pra BRL", "converter 100 XLM para BRL", "vender 100 XLM por reais", and "quanto recebo mandando 100 XLM para BRL" use send_exact.
- When the user names a payment recipient/contact, fill recipient_query with the recipient name/key from the message.
- For route_pix_intent, amount and asset_code are the final amount and asset the recipient should receive. Example: "quero fazer pix pra Ana Silva de 100 XLM" -> route_pix_intent with amount="100", asset_code="XLM", recipient_query="Ana Silva".
- For multi-turn route_pix_intent, combine context. Example: previous user "quero mandar 100 cetes d" and latest user "pra Ana Silva via pix" -> route_pix_intent with amount="100", asset_code="CETES", recipient_query="Ana Silva". Do not route to route_pix_onramp_intent or generic PIX page.
- For own-account route_pix_onramp_intent and route_pix_offramp_intent, leave recipient_query empty unless the user explicitly provided their own PIX key as data, not as a contact.
- For layered external transfers, preserve the two layers. Example: "uero mandar 10 usdc em xlm pra fora" -> route_payment_intent, amount="10", source_asset_code="USDC", asset_code="USDC", dest_asset_code="XLM", needs_clarification=true if no actual destination/contact/public key is provided. This means first convert USDC to XLM, then transfer XLM outward. Do not open generic PIX entrada/saída.

Priority order when multiple intents appear:
1. Login, logout, PIN/security, and account access routes.
2. PIX movement if PIX is the rail or the user is entering/exiting money through PIX.
3. Best route, quote, rate, fee, cost, spread, or bank comparison.
4. Conversion/swap/exchange between assets.
5. Payment link or receive/charge link.
6. Payment/transfer/send to a person, contact, email, phone, CPF, key, or external wallet.
7. Balance, contacts, yield/earnings, history, financial memory, wallet/profile management.
8. General only when no concrete product route applies.

Route selection guide:
- route_balance_intent: user asks to see balance, saldo, holdings, available money, quanto tenho, current wallet amount, or any asset balance such as XLM/USDC/CETES/BRL.
- route_contacts_intent: user explicitly asks to list, see, add, save, edit, choose, or manage contacts, destinatarios, beneficiaries, favorites, saved recipients, or payment aliases linked to contacts. Contact routing requires explicit contact-management meaning; adding money/saldo is not contact management.
- route_pix_onramp_intent: user wants to add/place/deposit/load/bring/receive money into their own TalkToStellar account via PIX. This includes "colocar 100 reais via pix", "me ajude com o colocar 100 reais via pix", "me ajuda a adicionar 100 reais por PIX", "adicionar saldo com pix", "depositar via PIX", "receber PIX na minha conta". It never needs a contact. It is invalid if a separate person/contact is named as the recipient.
- route_pix_offramp_intent: user wants to withdraw/send out/remove money from their TalkToStellar account to their own PIX key, own bank, or "pra fora" through PIX. This includes "sacar para meu PIX", "retirar para minha chave PIX", "mandar pra fora 50 reais em pix", "uero mandar 100 reais pra fora do pix". It does not cover cross-asset external-transfer wording like "10 USDC em XLM pra fora" unless the user explicitly says own PIX/bank.
- route_pix_intent: PIX-funded payment to another person/contact/recipient, or other PIX money movement that is clearly PIX but not own-account on-ramp/off-ramp. PIX wins over contacts and generic payment. If PIX pays another person/contact, preserve the requested final asset and amount exactly, e.g. "100 XLM" means the recipient should receive 100 XLM, not R$100.
- route_pix_intent also covers follow-ups where the current message only says the recipient plus "via PIX" and prior context has the amount/asset. Example context "quero mandar 100 CETES..." followed by "pra Ana Silva via pix" means PIX-funded payment delivering 100 CETES to Ana Silva.
- route_conversion_intent: user wants to convert, swap, exchange, trocar, cambiar, or convert money/assets, including vague conversion requests without source/destination details.
- route_price_quote_intent: user asks about best route, cotacao, quote, price, cost, fee, taxa, spread, economy, comparison with bank, or whether a transaction is worth it before doing it. For "todas as cotações", "todas as cotacoes", "todas as taxas", "tabela de câmbio", or "matriz de conversão", set all_quotes=true and do not fill source_asset_code/dest_asset_code unless the user also asks for a specific pair. For any two-asset quote such as XLM/USDC, BRL para CETES, USDC pra BRL, or CETES to XLM, fill source_asset_code and dest_asset_code. For single-asset quotes such as "cotação do CETES", infer CETES/BRL. Use quote_mode=market_price for price/cotacao/preco/custo questions; use quote_mode=send_exact for "de A pra B" route direction, conversion, sell, or send simulations.
- route_yield_intent: user asks about investments, aplicar, aplicações, aplicacoes, positions, posições, rendimentos, dinheiro rendendo, guardar rendendo, current invested amount, or moving money into/out of earning options.
- route_history_intent: user asks for history, extrato, transactions, transações, movimentações, receipts, comprovantes, recibos, recent activity, or full history.
- route_financial_memory_intent: user asks what nicknames/labels/preferences were saved, what the system remembers financially, savings/economy summaries, or learned payment memory.
- route_reset_pin_intent: user asks to change, alter, reset, recover, redefine, update, fix, troubleshoot, or handle a forgotten/invalid PIN. Any PIN problem/change request routes here.
- route_payment_link_intent: user asks to create, generate, open, share, charge/cobrar, receive with, or get a payment/receive link.
- route_payment_intent: user wants to send, transfer, pay, or move money to a recipient who is not explicitly the user's own PIX/bank exit. Recipients can be person names, saved contacts, emails, phones, CPFs, keys, or external wallets. Use this even with typos when amount/asset/recipient are present or implied. Use this for "10 USDC em XLM pra fora": source is USDC, destination asset is XLM, recipient/destination is still missing.
- route_wallet_intent: user asks for own profile, public receiving key, wallet public key, account identity, wallet setup, or wallet management that is not login/logout/PIN.
- route_login_intent: user wants to enter, sign in, access, reconnect, or continue an existing account.
- route_onboard_intent: user wants to create, open, register, cadastrar, or start a new account.
- route_wallet_logout_intent: user wants to logout, sign out, deslogar, sair da conta, disconnect, or end the current session.
- route_general_intent: greetings, "what can you do?", menu/help, broad explanations such as explaining assets/features, or unsupported conversation not asking to run a product action.

Disambiguation:
- "mandar/enviar/pagar + PIX" routes to a PIX tool, not payment.
- "colocar/adicionar/depositar/carregar/recarregar/trazer 100 reais via/no/por PIX" is PIX on-ramp into the user's own TalkToStellar account and must call route_pix_onramp_intent, even if the user says "me ajude com". Do not route it as payment and do not ask for contact key, email, phone, public key, or recipient.
- "me ajude com o colocar 100 reais via pix", "me ajuda a adicionar 100 reais por pix", "quero colocar 100 reais no pix", and "adicionar saldo com pix" must call route_pix_onramp_intent. They are not contacts, even though the verbs colocar/adicionar can also be used for saving contacts in other contexts.
- A message with PIX + amount/currency + add/top-up/deposit wording does not need any recipient. Never choose route_contacts_intent for that shape. The correct tool is route_pix_onramp_intent.
- Choosing route_contacts_intent for PIX top-up/on-ramp is a routing contract failure. The contacts route must only be used when the user explicitly asks to manage saved people/recipients.
- "fazer PIX pra Ana Silva de 100 XLM", "uero fazer pix pra ana silva de 100 xlm", "mandar PIX para Carlos de 20 USDC", and "pagar Ana via PIX" are route_pix_intent because PIX is funding a payment to a contact. They are not own-account on-ramp. The asset after the amount is the final asset for the recipient.
- Multi-turn: "quero mandar 100 cetes d" followed by "pra ana silva via pix" is route_pix_intent, amount=100, asset_code=CETES, recipient_query=Ana Silva. The latest message is not a generic PIX chooser because recent context has the amount and asset.
- A named human recipient after "pra", "para", "pro", or "a" makes route_pix_onramp_intent invalid unless the phrase says "pra minha conta", "para minha conta", "na minha conta", or equivalent own-account language.
- For "uero fazer pix pra ana silva de 100 xlm": route_pix_intent with high confidence. Do not choose route_pix_onramp_intent. Do not reinterpret "100 xlm" as "R$100". Do not say the user is receiving money in their own account.
- "sacar", "retirar", "meu PIX", "minha chave PIX", "pro meu banco", "fora do pix", or explicit "em pix" routes to route_pix_offramp_intent.
- Plain "pra fora" with a conversion layer such as "10 USDC em XLM pra fora" or "mandar 20 BRL em USDC pra fora" is not a generic PIX chooser. Route as route_payment_intent with source_asset_code as the asset spent and dest_asset_code as the asset transferred outward. If the destination/contact/key is missing, set needs_clarification=true.
- "pra fora do pix", "fora em pix", "sair para meu pix", "tirar para pix", and "mandar para meu banco" are off-ramp PIX, even when they contain transfer verbs like mandar/enviar.
- "mandar 10 xlm/usdc/cetes/reais pra Ana Silva", emails, phone numbers, CPFs, transfer keys, or external wallets are payment, not help, unless PIX is explicitly the rail.
- "criar/gerar link de pagamento", "link para receber", "cobrar por link", and "meu link de recebimento" are payment_link, not normal payment.
- "mudar/trocar/alterar/redefinir/redefimir/resetar/recuperar PIN" or "PIN nao funciona" are reset_pin, not wallet, login, or help.
- "melhor rota", "quanto custa", "preco", "taxa", "cotacao", "cotação XLM para USDC", "quanto está USDC/BRL", or bank comparison routes to price_quote unless the user is already giving a direct execution command with PIN.
- "uero ver todas as cotacoes aqui", "quero ver todas as cotações", "mostrar tabela de câmbio", and "matriz de conversão" must use route_price_quote_intent with all_quotes=true. Do not answer with only BRL/USDC and do not use get_brl_usdc_quote for this.
- "cotação XLM/BRL", "preço de XLM em reais", and "quanto custa 100 XLM em BRL" must use quote_mode=market_price because the user wants the BRL price to receive/buy XLM. Do not answer with the sell quote XLM -> BRL unless the user says converter/vender/mandar XLM para BRL.
- "cotação do CETES", "uero ver a cotacao do cetes", and "preço do CETES" must use route_price_quote_intent with source_asset_code=CETES, dest_asset_code=BRL, quote_mode=market_price. Do not use the generic USDC/BRL quote for these.
- "converter 100 XLM para BRL", "vender 100 XLM por reais", and "quanto recebo se mandar 100 XLM para BRL" must use quote_mode=send_exact because the user is asking the sell/conversion direction.
- Asking "quais sao os assets" or "explique cada ativo" is general because it is an explanation, not a transaction.
- A typo-heavy command still routes to the intended product action. Do not downgrade it to general.
- Normal payment routing: when the user wants to send, pay, transfer, or move money to another person, contact, email, CPF, phone, key, or external wallet without PIX as the rail, route_payment_intent.
- PIN/security requests are account actions, never generic help.

Clarification behavior:
- If the route is clear but details are missing, call the specific route with needs_clarification=true instead of route_general_intent.
- Missing amount for best-route, conversion, payment, PIX, or yield does not make the request general.
- Missing recipient for payment does not make it general; use payment with needs_clarification=true.
- Missing account context is not a routing decision. Route to the intended product and let the runtime ask for login/onboarding.

Tool selection patterns:
- supported product request -> the matching product route
- broad help, greetings, unsupported small talk, or broad educational explanation -> route_general_intent

When calling the selected route tool:
- confidence should be high for clear supported product requests.
- needs_clarification=true when route is clear but details are missing.
- language must be pt-BR for Portuguese and en for English.
- risk=high for money movement, PIN/security, login/logout, account access, profile/wallet access, or any action affecting funds.`;
  }

  private async detectIntent(
    message: string,
    _userId?: string,
    history?: Array<{ role?: string; content?: string }>
  ): Promise<IntentType> {
    this.lastIntentRouterFailure = null;
    this.lastIntentRouteCandidate = null;
    if (!this.shouldUseLlmIntentRouter()) {
      const reason = 'Intent router skipped because no production OpenAI key is configured';
      if (process.env.NODE_ENV !== 'test') {
        this.lastIntentRouterFailure = reason;
        logger.warn(`[Agent] ${reason}`);
      } else {
        logger.debug(`[Agent] ${reason}`);
      }
      return IntentType.GENERAL;
    }

    try {
      const messages = this.buildIntentRouterMessages(message, history);
      try {
        const route = await this.invokeIntentRouter(messages);
        if (route) {
          let selected = route.selected;
          let candidateCount = route.candidateCount;
          let mode = 'required';

          if (this.shouldAuditSelectedIntentRoute(selected)) {
            const auditRoute = await this.invokeIntentRouter(this.buildIntentRouteAuditMessages(message, selected, history));
            if (auditRoute?.selected) {
              selected = auditRoute.selected;
              candidateCount = auditRoute.candidateCount;
              mode = 'audit';
            }
          }

          this.logIntentRoute(message, selected, mode, candidateCount);
          this.lastIntentRouteCandidate = selected;
          return selected.intent;
        }
      } catch (toolError) {
        const message = toolError instanceof Error ? toolError.message : String(toolError);
        this.lastIntentRouterFailure = message;
        logger.warn(`[Agent] Intent router tool call failed: ${message}`);
      }

      logger.info('[Agent] Intent router did not select a route tool; using general handling');
      this.lastIntentRouteCandidate = null;
      return IntentType.GENERAL;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.lastIntentRouterFailure = errorMessage;
      logger.error(`Intent detection failed: ${errorMessage}`);
      this.lastIntentRouteCandidate = null;
      return IntentType.GENERAL;
    }
  }

  private async extractContactIntentWithLlm(userMessage: string): Promise<{
    action?: 'add' | 'list';
    contact_key?: string;
    contact_name?: string;
    needs_clarification?: boolean;
    clarification_question?: string;
  }> {
    const prompt = new HumanMessage({
      content: [
        'Extraia apenas o intento de contatos em JSON válido, sem markdown e sem texto extra.',
        'Regras:',
        '- action deve ser "add" quando o usuário quer salvar/adicionar/incluir algo nos contatos.',
        '- action deve ser "list" quando o usuário quer ver/listar contatos.',
        '- contact_key deve ser a chave de transferência, e-mail, telefone, CPF ou identificador informado para salvar.',
        '- contact_name deve ser o nome do contato quando explicitamente informado; se não houver nome, use string vazia.',
        '- needs_clarification deve ser true somente se faltar o dado necessário para a ação.',
        '- clarification_question deve ser curta e em pt-BR quando needs_clarification for true.',
        '',
        'Exemplos:',
        '- "rodrigobfcdog@gmail.com nos meus contatos" => {"action":"add","contact_key":"rodrigobfcdog@gmail.com","contact_name":"","needs_clarification":false,"clarification_question":""}',
        '- "adiciona Rodrigo pelo email rodrigobfcdog@gmail.com" => {"action":"add","contact_key":"rodrigobfcdog@gmail.com","contact_name":"Rodrigo","needs_clarification":false,"clarification_question":""}',
        '',
        `Mensagem do usuário: ${userMessage}`,
        '',
        'Formato esperado:',
        '{"action":"add","contact_key":"rodrigo@example.com","contact_name":"Rodrigo","needs_clarification":false,"clarification_question":""}',
      ].join('\n'),
    });

    const response = await this.llm.invoke([prompt]);
    const text = typeof response.content === 'string' ? response.content.trim() : JSON.stringify(response.content || {});

    try {
      const parsed = JSON.parse(text);
      return {
        action: parsed.action === 'add' || parsed.action === 'list' ? parsed.action : undefined,
        contact_key: parsed.contact_key || parsed.key || parsed.email || parsed.phone || parsed.public_key || parsed.pix_key,
        contact_name: parsed.contact_name || parsed.name || '',
        needs_clarification: Boolean(parsed.needs_clarification),
        clarification_question: parsed.clarification_question || '',
      };
    } catch {
      return {};
    }
  }

  private formatAddedContactMessage(toolResult: any): string {
    const contact = toolResult?.contact || {};
    const profile = toolResult?.contact_profile || {};
    const transferKey = String(profile.pix_key || contact.pix_key || '').trim();
    const email = String(profile.email || contact.email || '').trim().toLowerCase();
    const phone = String(profile.phone_number || contact.phone_number || '').replace(/\D+/g, '');
    const cpf = String(profile.cpf || contact.cpf || '').replace(/\D+/g, '');
    const preferredIdentifier = email || phone || cpf || (transferKey.includes('@talktostellar') ? '' : transferKey);
    const lines = [
      contact.contact_name ? `Nome: ${contact.contact_name}` : null,
      `Chave: ${preferredIdentifier || 'indisponível'}`,
    ].filter(Boolean);

    return `Contato adicionado com sucesso.${lines.length ? `\n${lines.join('\n')}` : ''}`;
  }

  private formatContactListLine(contact: any, index: number): string {
    const label = String(contact.display_label || contact.contact_name || contact.name || 'Contato').trim();
    const transferKey = String(contact.pix_key || contact.contact_profile?.pix_key || '').trim();
    const email = String(contact.email || contact.contact_profile?.email || '').trim().toLowerCase();
    const phone = String(contact.phone_number || contact.contact_profile?.phone_number || '').replace(/\D+/g, '');
    const cpf = String(contact.cpf || contact.contact_profile?.cpf || '').replace(/\D+/g, '');
    const preferredIdentifier = email || phone || cpf || (transferKey.includes('@talktostellar') ? '' : transferKey);
    const last = contact?.history?.last_amount_label ? ` | último envio: ${contact.history.last_amount_label}` : '';
    const freq = contact?.history?.tx_count ? ` | histórico: ${contact.history.tx_count} envio(s)` : '';
    const transferLine = `Chave: ${preferredIdentifier || 'indisponível'}`;

    return `${index + 1}. ${label}${last}${freq}\n${transferLine}`;
  }

  private async handleContactsRequest(state: AgentState): Promise<AgentState> {
    const localContactIntent = this.extractContactIntentFromText(state.current_input);
    const contactIntent = localContactIntent || await this.extractContactIntentWithLlm(state.current_input);
    const contactKey = String(contactIntent.contact_key || '').trim();

    if (contactIntent.action === 'list') {
      const resultRaw = await executeTool('list_contacts', {
        session_id: state.session_id,
        user_id: state.session_data?.user_id,
      });

      let toolResult: any;
      try {
        toolResult = JSON.parse(resultRaw);
      } catch {
        toolResult = { success: false, error: 'Failed to parse list_contacts response' };
      }

      if (!toolResult.success) {
        state.success = false;
        state.response_message = `Não consegui listar seus contatos: ${toolResult.error || 'erro desconhecido'}`;
      } else {
        const contacts = Array.isArray(toolResult.contacts) ? toolResult.contacts : [];
        state.success = true;
        state.response_message = contacts.length
          ? `Seus destinatários:\n${contacts.map((contact: any, index: number) => {
              return this.formatContactListLine(contact, index);
            }).join('\n')}`
          : 'Você ainda não tem destinatários salvos.';
      }

      await this.saveAssistantResponse(state);
      await this.repository.saveState(state.session_id, state);
      return state;
    }

    if (contactIntent.needs_clarification) {
      state.success = false;
      state.response_message = contactIntent.clarification_question || 'Me diga qual contato você quer salvar ou listar.';
      await this.saveAssistantResponse(state);
      await this.repository.saveState(state.session_id, state);
      return state;
    }

    if (contactIntent.action === 'add' && contactKey) {
      const resultRaw = await executeTool('add_contact', {
        session_id: state.session_id,
        user_id: state.session_data?.user_id,
        contact_name: String(contactIntent.contact_name || '').trim(),
        contact_key: contactKey,
      });

      let toolResult: any;
      try {
        toolResult = JSON.parse(resultRaw);
      } catch {
        toolResult = { success: false, error: 'Failed to parse add_contact response' };
      }

      state.success = Boolean(toolResult.success);
      state.response_message = toolResult.success
        ? this.formatAddedContactMessage(toolResult)
        : `Não consegui adicionar esse contato: ${toolResult.error || 'erro desconhecido'}`;
      await this.saveAssistantResponse(state);
      await this.repository.saveState(state.session_id, state);
      return state;
    }

    const resultRaw = await executeTool('list_contacts', {
      session_id: state.session_id,
      user_id: state.session_data?.user_id,
    });

    let toolResult: any;
    try {
      toolResult = JSON.parse(resultRaw);
    } catch {
      toolResult = { success: false, error: 'Failed to parse list_contacts response' };
    }

    if (!toolResult.success) {
      state.success = false;
      state.response_message = `Não consegui listar seus contatos: ${toolResult.error || 'erro desconhecido'}`;
    } else {
      const contacts = Array.isArray(toolResult.contacts) ? toolResult.contacts : [];
      state.success = true;
      state.response_message = contacts.length
        ? `Seus destinatários:\n${contacts.map((contact: any, index: number) => {
            return this.formatContactListLine(contact, index);
          }).join('\n')}`
        : 'Você ainda não tem destinatários salvos.';
    }

    await this.saveAssistantResponse(state);
    await this.repository.saveState(state.session_id, state);
    return state;
  }

  private isOwnReceivingKeyRequest(message: string): boolean {
    const normalized = String(message || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();

    if (this.extractPixRampIntentFromText(message).is_pix_ramp) {
      return false;
    }

    const selfRef = /\b(minha|minhas|meu|meus|my|da minha conta|da minha carteira)\b/.test(normalized);
    const keyRef =
      /\b(chave|chave pix|public key|chave publica|chave pública|endereco|endereço)\b/.test(normalized) ||
      /\b(qual|mostrar|ver|me passa|manda)\b.*\bpix\b/.test(normalized);
    const transferRef = /\b(transfer|pagar|mandar|enviar|receber|depositar|trazer|colocar|adicionar|carregar|recarregar|sacar|saque|tirar|retirar|resgatar|comprar|vender)\b/.test(normalized);
    const amountRef = /(?:^|\s)(?:r\$\s*)?\d+(?:[.,]\d{1,8})?(?=\s|$)/.test(normalized);

    return selfRef && keyRef && !transferRef && !amountRef;
  }

  private async resolveOwnReceivingKeys(state: AgentState): Promise<{ publicKey?: string; pixKey?: string }> {
    let publicKey = String(state.session_data?.public_key || '').trim();
    let pixKey = String(state.session_data?.pix_key || '').trim();

    try {
      if (!publicKey || !pixKey) {
        const { data: walletBySession } = await supabase
          .from('wallets')
          .select('public_key, pix_key')
          .eq('session_id', state.session_id)
          .limit(1)
          .maybeSingle();

        if (walletBySession?.public_key && !publicKey) {
          publicKey = String(walletBySession.public_key).trim();
        }
        if (walletBySession?.pix_key && !pixKey) {
          pixKey = String(walletBySession.pix_key).trim();
        }
      }

      if (publicKey && !pixKey) {
        const { data: walletByPublicKey } = await supabase
          .from('wallets')
          .select('pix_key')
          .eq('public_key', publicKey)
          .limit(1)
          .maybeSingle();

        if (walletByPublicKey?.pix_key) {
          pixKey = String(walletByPublicKey.pix_key).trim();
        }
      }

      if (state.session_data && (publicKey || pixKey)) {
        const shouldPersist =
          (publicKey && state.session_data.public_key !== publicKey) ||
          (pixKey && state.session_data.pix_key !== pixKey);
        if (shouldPersist) {
          state.session_data.public_key = publicKey || state.session_data.public_key;
          state.session_data.pix_key = pixKey || state.session_data.pix_key;
          await this.repository.saveSession(state.session_id, state.session_data);
        }
      }
    } catch (error) {
      logger.warn(`[resolveOwnReceivingKeys] Failed to resolve keys: ${error instanceof Error ? error.message : String(error)}`);
    }

    return {
      publicKey: publicKey || undefined,
      pixKey: pixKey || undefined,
    };
  }

  private formatOwnReceivingKeys(publicKey?: string, pixKey?: string): string {
    const lines: string[] = [];

    if (pixKey) {
      lines.push(`Chave de recebimento: \`${pixKey}\``);
    }

    if (!lines.length) {
      return 'Não encontrei uma chave de recebimento (e-mail/telefone/CPF) vinculada à sua sessão atual.';
    }

    return `Sua chave para receber é:\n${lines[0]}`;
  }

  private formatOwnReceivingKeysForLanguage(language: 'pt-BR' | 'en', publicKey?: string, pixKey?: string): string {
    if (!pixKey) {
      return this.text(
        language,
        'Não encontrei uma chave de recebimento (e-mail/telefone/CPF) vinculada à sua sessão atual.',
        'I could not find a receiving key (email/phone/CPF) linked to your current session.'
      );
    }
    return this.text(
      language,
      `Sua chave para receber é:\nChave de recebimento: \`${pixKey}\``,
      `Your receiving key is:\nReceiving key: \`${pixKey}\``
    );
  }

  /**
   * Handle wallet creation flow
   */
  private async handleWalletCreation(state: AgentState): Promise<AgentState> {
    try {
      logger.debug(`[Agent] Handling wallet creation for session: ${state.session_id}`);

      if (state.wallet_info && this.wantsNewWallet(state.current_input)) {
        state.wallet_info = undefined;
        state.action_params = {
          ...state.action_params,
          wallet_info: undefined,
        };

        if (state.session_data) {
          state.session_data.public_key = undefined;
          await this.repository.saveSession(state.session_id, state.session_data);
        }
      }

      // If wallet already exists, inform user
      if (state.wallet_info) {
        state.response_message = `Você já possui uma conta TalkToStellar.

Sua conta está pronta para consultar saldo, salvar contatos e enviar dinheiro.`;
        state.success = true;
        await this.saveAssistantResponse(state);
        return state;
      }

      // Try to extract email or phone from the message
      const email = this.extractEmail(state.current_input);
      const phoneNumber = this.extractPhoneNumber(state.current_input);
      const secretKey = this.extractSecretKey(state.current_input);

      // If a secret key was provided, import/login an existing wallet
      if (secretKey) {
        const { UserService } = await import("../services/user.service");
        const walletResult = await UserService.onboardUser({
          email: email || undefined,
          phoneNumber: phoneNumber || undefined,
          secretKey,
        });

        state.wallet_info = {
          publicKey: walletResult.publicKey,
          secretKey: undefined,
          email: email as string | undefined,
          phoneNumber: phoneNumber as string | undefined,
          createdAt: new Date().toISOString(),
        };
        state.waiting_for_wallet_input = false;
        state.action_params = {
          ...state.action_params,
          waiting_for_wallet_input: false,
          force_logged_out: false,
          created: true,
          publicKey: walletResult.publicKey,
          wallet_info: state.wallet_info,
        };

        if (state.session_data) {
          state.session_data.public_key = walletResult.publicKey;
          await this.repository.saveSession(state.session_id, state.session_data);
        }

        state.response_message = `Conta conectada com sucesso.

Você já pode consultar saldo, salvar contatos e enviar dinheiro.`;
        state.success = true;

        await this.saveAssistantResponse(state);
        await this.repository.saveState(state.session_id, state);

        return state;
      }

      // If no email/phone provided, ask for it
      if (!email && !phoneNumber) {
        state.response_message = await this.getOnboardingOrLoginMessage(state, this.shouldPreferLogin(state));
        state.waiting_for_wallet_input = true;
        state.action_params = {
          ...state.action_params,
          waiting_for_wallet_input: true,
        };
        state.success = true;
        await this.saveAssistantResponse(state);
        await this.repository.saveState(state.session_id, state);
        return state;
      }

      // Create wallet using the backend service
      const { UserService } = await import("../services/user.service");
      const walletResult = await UserService.onboardUser({
        email: email || undefined,
        phoneNumber: phoneNumber || undefined,
      });

      // Store wallet info in state
      state.wallet_info = {
        publicKey: walletResult.publicKey,
        secretKey: undefined,
        email: email as string | undefined,
        phoneNumber: phoneNumber as string | undefined,
        createdAt: new Date().toISOString(),
      };
      state.waiting_for_wallet_input = false;
      state.action_params = {
        ...state.action_params,
        waiting_for_wallet_input: false,
        force_logged_out: false,
      };

      // Update session with public key
      if (state.session_data) {
        state.session_data.public_key = walletResult.publicKey;
        await this.repository.saveSession(state.session_id, state.session_data);
      }

      // Prepare response with wallet info
      state.response_message = `Sua conta TalkToStellar foi criada com sucesso.

Ela já está pronta para consultar saldo, salvar contatos e enviar dinheiro.`;

      state.success = true;
      state.action_params = {
        ...state.action_params,
        created: true,
        force_logged_out: false,
        publicKey: walletResult.publicKey,
        wallet_info: state.wallet_info,
      };

      await this.saveAssistantResponse(state);
      await this.repository.saveState(state.session_id, state);

      return state;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`[Agent] Wallet creation failed: ${errorMessage}`);
      state.success = false;
      state.error = errorMessage;
      state.response_message = `Não consegui criar sua conta agora: ${errorMessage}`;
      await this.saveAssistantResponse(state);
      return state;
    }
  }

  /**
   * Extract email from text
   */
  private extractEmail(text: string): string | undefined {
    const emailRegex = /([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/;
    const match = text.match(emailRegex);
    return match ? match[1] : undefined;
  }

  /**
   * Extract phone number from text
   */
  private extractPhoneNumber(text: string): string | undefined {
    const phoneRegex = /(\+?55\s?)?(\(?\d{2}\)?\s?)?\d{4,5}-?\d{4}/;
    const match = text.match(phoneRegex);
    return match ? match[0] : undefined;
  }

  /**
   * Extract Stellar secret key from text
   */
  private extractSecretKey(text: string): string | undefined {
    const secretRegex = /\bS[A-Z2-7]{55}\b/;
    const match = text.match(secretRegex);
    return match ? match[0] : undefined;
  }

  /**
   * Mask secret keys before storing user messages
   */
  private sanitizeUserMessage(text: string): string {
    return text.replace(/\bS[A-Z2-7]{55}\b/g, '[REDACTED_SECRET_KEY]');
  }

  private wantsNewWallet(text: string): boolean {
    const normalized = text.toLowerCase();
    return (
      (normalized.includes('criar') || normalized.includes('create') || normalized.includes('nova') || normalized.includes('new')) &&
      (normalized.includes('wallet') || normalized.includes('carteira'))
    );
  }

  private async getLogoutConfirmationMessage(state?: AgentState): Promise<string> {
    const externalProvider = String((state?.action_params as any)?.external_provider || '').trim().toLowerCase();
    const externalProviderUserId = String((state?.action_params as any)?.external_provider_user_id || '').trim();
    const sessionId = String(state?.session_id || '').trim();
    if (!externalProvider) {
      const normalizedBase = resolveFrontendBase([
        process.env.FRONTEND_URL,
        process.env.PUBLIC_APP_URL,
        process.env.CREATE_ACCOUNT_BASE,
        process.env.PAYMENT_CONFIRM_BASE,
      ]);
      const logoutUrl = new URL(`${normalizedBase}/logout`);
      logoutUrl.searchParams.set('source', 'web');
      return `Para sair só deste navegador, abra esta página e confirme:\n\n${logoutUrl.toString()}\n\nIsso não desconecta WhatsApp ou Telegram vinculados à mesma conta.`;
    }

    let logoutUrl = '';
    try {
      logoutUrl = await this.externalService.createLogoutUrl({
        sessionId,
        provider: externalProvider || undefined,
        providerUserId: externalProviderUserId || undefined,
        source: externalProvider || undefined,
        userId: String(state?.session_data?.user_id || '').trim() || undefined,
        expiresInHours: 24,
      });
    } catch (error) {
      logger.warn(`[logout-url] failed to create short logout URL: ${error instanceof Error ? error.message : String(error)}`);
      const normalizedBase = resolveFrontendBase([
        process.env.FRONTEND_URL,
        process.env.PUBLIC_APP_URL,
        process.env.CREATE_ACCOUNT_BASE,
        process.env.PAYMENT_CONFIRM_BASE,
      ]);
      const fallback = new URL(`${normalizedBase}/logout`);
      if (sessionId) fallback.searchParams.set('session_id', sessionId);
      if (externalProvider) fallback.searchParams.set('provider', externalProvider);
      if (externalProviderUserId) fallback.searchParams.set('provider_user_id', externalProviderUserId);
      if (externalProvider) fallback.searchParams.set('source', externalProvider);
      logoutUrl = fallback.toString();
    }

    return `Para deslogar com segurança, abra esta página e confirme a saída:\n\n${logoutUrl}`;
  }

  private async handleWalletLogout(state: AgentState): Promise<AgentState> {
    state.wallet_info = undefined;
    state.waiting_for_wallet_input = false;
    state.pending_payment = undefined;
    state.action_params = {
      ...state.action_params,
      wallet_info: undefined,
      waiting_for_wallet_input: false,
      force_logged_out: true,
    };

    if (state.session_data) {
      state.session_data.public_key = undefined;
      await this.repository.saveSession(state.session_id, state.session_data);
    }

    state.success = true;
    const externalProvider = String((state.action_params as any)?.external_provider || '').trim().toLowerCase();
    const providerLabel = externalProvider === 'telegram'
      ? 'Telegram'
      : externalProvider === 'whatsapp' || externalProvider === 'phone'
        ? 'WhatsApp'
        : '';
    state.response_message = providerLabel
      ? `Logout concluido. Sua conta foi desconectada. Volte ao ${providerLabel} para continuar.`
      : 'Logout concluido. Sua conta foi desconectada com sucesso. Agora você pode entrar ou criar outra conta quando quiser.';

    await this.saveAssistantResponse(state);
    await this.repository.saveState(state.session_id, state);
    return state;
  }

  private async executePendingPaymentWithSecret(
    state: AgentState,
    secretKey: string
  ): Promise<AgentState> {
    if (!state.pending_payment || !state.session_data?.public_key) {
      state.success = false;
      state.response_message = 'Não encontrei um pagamento pendente para executar.';
      return state;
    }

    const { StellarService } = await import('../services/stellar.service');

    const unsignedXdr = await StellarService.buildPaymentXdr({
      sourcePublicKey: state.session_data.public_key,
      destination: state.pending_payment.destination,
      amount: state.pending_payment.amount,
      assetCode: 'XLM',
    });

    const submit = await StellarService.signAndSubmitXdr(
      state.session_data.user_id,
      secretKey,
      unsignedXdr,
      {
        user_id: state.session_data.user_id,
        type: 'PAYMENT',
        destination_key: state.pending_payment.destination,
        asset_code: 'XLM',
        amount: parseFloat(state.pending_payment.amount),
        context: `Pagamento para ${state.pending_payment.destination_name || state.pending_payment.destination}`,
      }
    );

    if (!submit.success) {
      state.success = false;
      state.response_message = `Não consegui enviar o pagamento: ${submit.error || 'erro desconhecido'}`;
      return state;
    }

    const sentAmount = state.pending_payment.amount;
    const destinationLabel = state.pending_payment.destination_name || state.pending_payment.destination;

    state.pending_payment = undefined;
    state.success = true;
    state.response_message = `Pagamento enviado para ${destinationLabel} em poucos segundos.\nTaxa total: R$ 0,00\nRecibo disponível no seu histórico.`;
    return state;
  }

  private formatAssetLine(balance: any, index: number): string {
    const asset = this.toUserFacingAssetCode(balance.asset || balance.asset_code || 'UNKNOWN');
    const label = asset === 'BRL' ? 'R$' : asset === 'USDC' ? 'US$' : asset === 'EUR' ? '€' : asset;
    const amount = balance.balance || '0';
    return `${index + 1}. ${label}: ${amount}`;
  }

  private formatTransactionLine(transaction: any, index: number): string {
    const directionLabel =
      transaction.direction === 'sent' ? 'Enviado' :
      transaction.direction === 'received' ? 'Recebido' :
      'Relacionado';
    const asset = transaction.asset ? this.toUserFacingAssetCode(transaction.asset) : '';
    const amount = transaction.amount && asset !== 'XLM' ? `${transaction.amount} ${asset}`.trim() : 'Pagamento';
    const date = transaction.date ? new Date(transaction.date).toLocaleString('pt-BR') : 'data indisponível';
    const counterparty = String(transaction.counterparty || '').trim();
    const counterpartyLine = counterparty ? `\nCom: ${counterparty}` : '';
    return `${index + 1}. ${directionLabel}: ${amount}${counterpartyLine}\nData: ${date}`;
  }

  private async handleBalanceCheck(state: AgentState): Promise<AgentState> {
    const language = this.getLanguage(state);
    const sessionId = String(state.session_id || '').trim();
    const sessionPublicKey = String(state.session_data?.public_key || '').trim();

    if (!sessionId && !sessionPublicKey) {
      state.success = false;
      state.response_message = await this.getOnboardingOrLoginMessage(state, this.shouldPreferLogin(state));
    } else {
      const toolResultRaw = await executeTool('get_balance', {
        session_id: sessionId || undefined,
        public_key: sessionPublicKey || undefined,
      });

      let toolResult: any;
      try {
        toolResult = JSON.parse(toolResultRaw);
      } catch {
        toolResult = { success: false, error: 'Failed to parse tool response' };
      }

      if (!toolResult.success) {
        state.success = false;
        state.response_message = this.text(
          language,
          'Não consegui consultar seu saldo agora. Tente novamente em alguns segundos.',
          'I could not check your balance right now. Try again in a few seconds.'
        );
      } else {
        const balances = Array.isArray(toolResult.balances) ? toolResult.balances : [];
        const byAsset = new Map<string, any>();
        for (const balance of balances) {
          const asset = this.toUserFacingAssetCode(balance.asset || balance.asset_code || '').replace(/^USD$/, 'USDC');
          if (asset) {
            byAsset.set(asset, { ...balance, asset });
          }
        }
        const balanceAssets = getStellarNetworkName() === 'TESTNET' ? ['BRL', 'USDC', 'CETES', 'XLM'] : ['BRL', 'USDC', 'EUR', 'XLM'];
        const exactBalances = balanceAssets.map((asset) => byAsset.get(asset) || { asset, balance: '0.0000000' });
        const formattedBalances = exactBalances.map((balance: any, index: number) => this.formatAssetLine(balance, index)).join('\n');
        const monthlySavingsMessage = String(toolResult.monthly_savings?.message || '').trim();
        const savingsLine = monthlySavingsMessage ? `\n\n💰 ${monthlySavingsMessage}` : '';

        state.success = true;
        state.response_message = this.text(
          language,
          `Saldo da sua conta TalkToStellar:\n${formattedBalances}${savingsLine}\n\nO PIX entrega R$ ou US$ conforme você escolher no checkout.`,
          `Your TalkToStellar account balance:\n${formattedBalances}${savingsLine}\n\nPIX delivers R$ or US$ depending on what you choose at checkout.`
        );
      }
    }

    await this.saveAssistantResponse(state);
    await this.repository.saveState(state.session_id, state);
    return state;
  }

  private async handleHistoryCheck(state: AgentState): Promise<AgentState> {
    if (!state.session_data?.public_key) {
      state.success = false;
      state.response_message = await this.getOnboardingOrLoginMessage(state, this.shouldPreferLogin(state));
    } else {
      const toolResultRaw = await executeTool('get_transaction_history', {
        public_key: state.session_data.public_key,
        user_id: state.session_data.user_id,
        limit: 5,
      });

      let toolResult: any;
      try {
        toolResult = JSON.parse(toolResultRaw);
      } catch {
        toolResult = { success: false, error: 'Failed to parse tool response' };
      }

      if (!toolResult.success) {
        state.success = false;
        state.response_message = `Não consegui consultar suas transações agora: ${toolResult.error || 'erro desconhecido'}`;
      } else {
        const transactions = Array.isArray(toolResult.transactions) ? toolResult.transactions.slice(0, 5) : [];
        const formattedTransactions = transactions.length > 0
          ? transactions.map((transaction: any, index: number) => this.formatTransactionLine(transaction, index)).join('\n\n')
          : 'Nenhuma transação encontrada.';
        const historyUrl = await this.buildTransactionsHistoryUrl(state);

        state.success = true;
        state.response_message = `Ver histórico completo:\n${historyUrl}\n\nÚltimas 5 transações da sua conta:\n${formattedTransactions}`;
      }
    }

    await this.saveAssistantResponse(state);
    await this.repository.saveState(state.session_id, state);
    return state;
  }

  private async buildTransactionsHistoryUrl(state: AgentState): Promise<string> {
    const language = this.getLanguage(state);
    const url = new URL(`${this.getFrontendBaseUrl()}/transactions`);
    url.searchParams.set('lang', language);
    let finalUrl = url.toString();
    try {
      finalUrl = await this.externalService.shortenPublicUrl({
        url: finalUrl,
        purpose: 'transaction_history',
        sessionId: state.session_id,
        userId: String(state.session_data?.user_id || '').trim() || undefined,
        expiresInHours: 24,
      });
    } catch (error) {
      logger.warn(`[history-url] failed to shorten URL: ${error instanceof Error ? error.message : String(error)}`);
    }
    return finalUrl;
  }

  private financialMemoryMode(message: string, allowNicknameSet = false): 'repeat_payment' | 'nickname_set' | 'nickname_lookup' | 'monthly_conversion' | 'average_quote' | 'monthly_received' | 'monthly_fees' | 'top_payer' | 'traditional_savings' | 'recipient_insights' | 'risk_alert' | 'treasury_advice' | 'summary' {
    const normalized = String(message || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
    if ((normalized.includes('apelido') || normalized.includes('nome da transacao') || normalized.includes('nome da transação')) &&
      (normalized.includes('qual') || normalized.includes('quanto') || normalized.includes('?'))) return 'nickname_lookup';
    if (
      allowNicknameSet &&
      (normalized.includes('apelido') || normalized.includes('nome da transacao') || normalized.includes('nome da transação')) &&
      (normalized.includes('definir') || normalized.includes('salvar') || normalized.includes('colocar') || normalized.includes(':'))
    ) return 'nickname_set';
    if ((normalized.includes('qual foi o valor') || normalized.includes('quanto foi')) &&
      (normalized.includes('pagamento') || normalized.includes('transacao') || normalized.includes('transação'))) return 'nickname_lookup';
    if (allowNicknameSet && this.looksLikeNicknameReply(message)) return 'nickname_set';
    if (/\b(de novo|novamente|again|mesma carteira|mesmo pagamento)\b/.test(normalized)) return 'repeat_payment';
    if (/\b(favoritos?|recorrente|recorrencia|recorrência|destinatarios|destinatários|clientes)\b/.test(normalized)) return 'recipient_insights';
    if (normalized.includes('quanto recebi') || normalized.includes('recebi esse mes') || normalized.includes('recebimentos do mes')) return 'monthly_received';
    if (normalized.includes('taxa') || normalized.includes('taxas')) return 'monthly_fees';
    if (normalized.includes('mais me paga') || normalized.includes('top cliente') || normalized.includes('top pagador')) return 'top_payer';
    if (normalized.includes('economizei') || normalized.includes('economia') || normalized.includes('metodos tradicionais') || normalized.includes('banco')) return 'traditional_savings';
    if (normalized.includes('perdeu') && normalized.includes('dolar')) return 'risk_alert';
    if (normalized.includes('proteger parte do saldo') || normalized.includes('proteger saldo')) return 'risk_alert';
    if (normalized.includes('ai treasury') || normalized.includes('melhor moeda') || normalized.includes('melhor momento') || normalized.includes('manter brl ou usd') || normalized.includes('otimizar convers') || normalized.includes('previsao de gasto') || normalized.includes('previsão de gasto')) return 'treasury_advice';
    if (normalized.includes('media') && (normalized.includes('cotacao') || normalized.includes('cambio'))) return 'average_quote';
    if (normalized.includes('mes') || normalized.includes('este mes') || normalized.includes('mês')) return 'monthly_conversion';
    return 'summary';
  }

  private looksLikeNicknameReply(message: string): boolean {
    const text = String(message || '').trim();
    if (!text || text.length > 80) return false;
    if (/[?]/.test(text)) return false;
    const normalized = text
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
    if (
      normalized.startsWith('enviar ') ||
      normalized.startsWith('mandar ') ||
      normalized.startsWith('pagar ') ||
      normalized.startsWith('transferir ') ||
      normalized.startsWith('converter ') ||
      normalized.startsWith('saldo') ||
      normalized.startsWith('criar ') ||
      normalized.startsWith('gerar ') ||
      normalized.startsWith('quero ')
    ) return false;
    if (/\b(mandar|enviar|pagar|transferir|converter|criar|gerar|receber)\b/.test(normalized)) return false;
    if (/\b\d+(?:[.,]\d+)?\b/.test(normalized)) return false;
    if (/\b(usdc?|usd|dolar|dolares|brl|real|reais|xlm)\b/.test(normalized)) return false;
    if (normalized.includes('link')) return false;
    return normalized.length >= 3 && normalized.length <= 60;
  }

  private extractTransactionNickname(message: string): string {
    const text = String(message || '').trim();
    if (!text) return '';
    const explicit = text.match(/(?:apelido|nome)\s*(?:da|do)?\s*(?:transacao|transação|pagamento)?\s*[:\-]\s*(.+)$/i);
    if (explicit?.[1]) return explicit[1].trim().slice(0, 80);

    const valueQuestion = text.match(/(?:valor|pagamento|transacao|transação)\s+(.+?)(?:\?|$)/i);
    if (valueQuestion?.[1]) return valueQuestion[1].trim().slice(0, 80);

    return text.slice(0, 80);
  }

  private hasPendingNicknamePrompt(state: AgentState): boolean {
    const messages = Array.isArray(state.messages) ? state.messages : [];
    const lastAssistant = [...messages].reverse().find((msg) => String(msg?.role || '').toLowerCase() === 'assistant');
    const content = String(lastAssistant?.content || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
    if (!content) return false;
    return (
      content.includes('quer dar um nome para esta transacao') ||
      content.includes('apelido da transacao') ||
      content.includes('nome para esta transacao')
    );
  }

  private hasDeterministicFinancialMemoryIntent(message: string, allowNicknameSet = false): boolean {
    const mode = this.financialMemoryMode(message, allowNicknameSet);
    return mode === 'nickname_set' || mode === 'nickname_lookup';
  }

  private fixedSavingsIntent(message: string): null | {
    period: 'today' | 'month' | 'lifetime';
    view: 'summary' | 'traditional_cost' | 'biggest_operation';
  } {
    const normalized = String(message || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();

    const isSavingsAsk =
      normalized.includes('economizei') ||
      normalized.includes('economia') ||
      normalized.includes('savings') ||
      normalized.includes('saved') ||
      normalized.includes('comparison') ||
      normalized.includes('compare') ||
      normalized.includes('teria pago') ||
      normalized.includes('metodos tradicionais') ||
      normalized.includes('traditional') ||
      normalized.includes('banks') ||
      normalized.includes('banco');

    if (!isSavingsAsk) return null;

    if (normalized.includes('maior economia') || normalized.includes('operacao teve maior') || normalized.includes('operacao com maior')) {
      return { period: 'lifetime', view: 'biggest_operation' };
    }

    const view = normalized.includes('teria pago') ||
      normalized.includes('quanto pagaria') ||
      normalized.includes('no banco') ||
      normalized.includes('comparison') ||
      normalized.includes('compare') ||
      normalized.includes('traditional') ||
      normalized.includes('banks')
      ? 'traditional_cost'
      : 'summary';
    const period = normalized.includes('hoje')
      ? 'today'
      : normalized.includes('ja economizei') || normalized.includes('lifetime') || normalized.includes('total')
        ? 'lifetime'
        : 'month';

    return { period, view };
  }

  private extractYieldIntentFromText(message: string): {
    is_yield: boolean;
    mode: 'options' | 'balance' | 'prepare' | 'confirm';
    action: 'deposit' | 'withdraw';
    amount: string;
    asset_code: string;
    pin?: string;
  } {
    const raw = String(message || '');
    const normalized = this.normalizeTextForIntent(raw);
    const hasYieldKeyword =
      /\b(yield|earning|earnings|apy|income|interest)\b/.test(normalized) ||
      /\b(rendimento|rendimentos|render|rendendo|rentabilidade|juros|renda|investir|investimento|investimentos|aplicar|aplicacao|aplicacoes)\b/.test(normalized);

    const hasYieldAction =
      /\b(guardar|aplicar|investir|deixar|poupar|save|deposit|put|resgatar|retirar|sacar|withdraw|redeem)\b/.test(normalized) &&
      /\b(rendendo|rendimento|yield|earn|earning|interest)\b/.test(normalized);

    if (!hasYieldKeyword && !hasYieldAction) {
      return { is_yield: false, mode: 'options', action: 'deposit', amount: '', asset_code: '' };
    }

    const action = /\b(resgatar|retirar|sacar|withdraw|redeem)\b/.test(normalized) ? 'withdraw' : 'deposit';
    const rawWithoutPin = raw.replace(/\bpin\b\D{0,12}\d{4,8}\b/ig, ' ');
    const amountNumber = parseHumanAmountNumber(rawWithoutPin);
    const amount = Number.isFinite(amountNumber) && amountNumber > 0 ? String(amountNumber) : '';
    const assetMatch = normalized.match(/\b(r\$|brl|real|reais|eur|eurc|euro|euros|cetes|€|usd|usdc|dolar|dolares|dollar|dollars|xlm|lumen|lumens)\b/);
    const assetCode = this.assetCodeFromTextToken(assetMatch?.[1]) || '';
    const pinMatch = raw.match(/\bpin\b\D{0,12}(\d{4,8})\b/i);
    const confirms =
      /\b(confirmo|confirmar|confirma|pode confirmar|ok pode|pode fazer|confirm|confirmed|go ahead)\b/.test(normalized);

    const asksBalance =
      normalized.includes('quanto tenho rendendo') ||
      normalized.includes('saldo rendendo') ||
      normalized.includes('saldo de rendimento') ||
      normalized.includes('yield balance') ||
      normalized.includes('earning balance') ||
      (normalized.includes('meu rendimento') && !amount);
    const asksOptions =
      normalized.includes('opcoes') ||
      normalized.includes('opcao') ||
      normalized.includes('disponiveis') ||
      normalized.includes('available') ||
      normalized.includes('quanto rende') ||
      normalized.includes('taxa de rendimento') ||
      normalized.includes('yield rate') ||
      normalized.includes('apy');

    const mode = confirms && pinMatch?.[1] && amount
      ? 'confirm'
      : amount
        ? 'prepare'
        : asksBalance
          ? 'balance'
          : asksOptions
            ? 'options'
            : 'options';

    return {
      is_yield: true,
      mode,
      action,
      amount,
      asset_code: assetCode,
      pin: pinMatch?.[1],
    };
  }

  private async handleYieldRequest(state: AgentState, intent: ReturnType<AgentGraph['extractYieldIntentFromText']>): Promise<AgentState> {
    const language = this.getLanguage(state);
    const hasActiveWallet = Boolean(String(state.session_data?.public_key || '').trim());
    const assetCode = intent.asset_code || 'USDC';
    const sessionToken = String((state.action_params as any)?.session_token || '').trim();
    const sessionAuth = sessionToken ? { session_token: sessionToken } : {};
    const externalProvider = String((state.action_params as any)?.external_provider || '').trim().toLowerCase();
    const externalSource = String((state.action_params as any)?.external_source || externalProvider || '').trim().toLowerCase();
    const externalSessionScope = normalizeExternalSessionScope(externalProvider || externalSource);
    const channelContext = {
      ...(externalProvider ? { provider: externalProvider, external_provider: externalProvider } : {}),
      ...(externalSource ? { source: externalSource, external_source: externalSource } : {}),
      ...(externalSessionScope ? { session_scope: externalSessionScope } : {}),
    };

    if (!hasActiveWallet && intent.mode !== 'options') {
      state.success = false;
      state.response_message = await this.getOnboardingOrLoginMessage(state, true);
      await this.saveAssistantResponse(state);
      await this.repository.saveState(state.session_id, state);
      return state;
    }

    let toolName: string;
    let toolInput: Record<string, any>;

    if (intent.mode === 'balance') {
      toolName = 'get_yield_balance';
      toolInput = { session_id: state.session_id, ...sessionAuth, ...channelContext, asset_code: assetCode, language };
    } else if (intent.mode === 'prepare') {
      toolName = 'prepare_yield_action';
      toolInput = {
        session_id: state.session_id,
        ...sessionAuth,
        ...channelContext,
        action: intent.action,
        amount: intent.amount,
        asset_code: assetCode,
        language,
      };
    } else if (intent.mode === 'confirm' && intent.pin) {
      toolName = 'confirm_yield_action';
      toolInput = {
        session_id: state.session_id,
        ...sessionAuth,
        ...channelContext,
        action: intent.action,
        amount: intent.amount,
        asset_code: assetCode,
        pin: intent.pin,
        language,
      };
    } else {
      toolName = 'get_yield_options';
      toolInput = { session_id: state.session_id, ...sessionAuth, ...channelContext, language };
    }

    const resultRaw = await executeTool(toolName, toolInput);
    let result: any;
    try {
      result = JSON.parse(resultRaw);
    } catch {
      result = { success: false, error: 'Failed to parse yield tool response' };
    }

    state.success = Boolean(result.success);
    if (result.success) {
      state.response_message = result.message || this.text(
        language,
        'Aplicação consultada.',
        'Application checked.'
      );
    } else {
      state.response_message = this.text(
        language,
        `Não consegui consultar a aplicação agora: ${result.error || 'erro desconhecido'}`,
        `I could not check the application right now: ${result.error || 'unknown error'}`
      );
    }

    await this.saveAssistantResponse(state);
    await this.repository.saveState(state.session_id, state);
    return state;
  }

  private extractAssetInterfaceIntentFromText(message: string): {
    is_asset_interface: boolean;
    action: 'bring' | 'keep' | 'send_out';
    amount: string;
    asset_code: string;
    destination_pix_key?: string;
  } {
    const raw = String(message || '');
    const normalized = this.normalizeTextForIntent(raw);
    const wantsBring =
      /\b(trazer|adicionar|colocar|depositar|entrada|add money|top up|bring)\b/.test(normalized);
    const wantsKeep =
      /\b(manter|guardar|deixar parado|deixar rendendo|keep|hold|earning|yield)\b/.test(normalized);
    const wantsSendOut =
      normalized.includes('mandar embora') ||
      /\b(retirar|sacar|saque|mandar para pix|mandar pro pix|send out|cash out|withdraw)\b/.test(normalized);

    if (!wantsBring && !wantsKeep && !wantsSendOut) {
      return { is_asset_interface: false, action: 'bring', amount: '', asset_code: '' };
    }

    const amountNumber = parseHumanAmountNumber(raw);
    const amount = Number.isFinite(amountNumber) && amountNumber > 0 ? String(amountNumber) : '';
    const assetMatch = normalized.match(/\b(r\$|brl|real|reais|eur|eurc|euro|euros|cetes|€|usd|usdc|dolar|dolares|dollar|dollars|xlm|lumen|lumens)\b/);
    const destinationPixKey = raw.match(/[^\s@]+@[^\s@]+\.[^\s@]+/)?.[0] ||
      raw.match(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i)?.[0] ||
      '';

    return {
      is_asset_interface: true,
      action: wantsSendOut ? 'send_out' : wantsKeep ? 'keep' : 'bring',
      amount,
      asset_code: this.assetCodeFromTextToken(assetMatch?.[1]) || '',
      destination_pix_key: destinationPixKey,
    };
  }

  private async handleAssetInterfaceRequest(state: AgentState, intent: ReturnType<AgentGraph['extractAssetInterfaceIntentFromText']>): Promise<AgentState> {
    const language = this.getLanguage(state);
    const resultRaw = await executeTool('open_asset_interface', {
      session_id: state.session_id,
      action: intent.action,
      amount: intent.amount,
      asset_code: intent.asset_code || 'BRL',
      destination_pix_key: intent.destination_pix_key,
      language,
    });

    let result: any;
    try {
      result = JSON.parse(resultRaw);
    } catch {
      result = { success: false, error: 'Failed to parse interface tool response' };
    }

    state.success = Boolean(result.success);
    state.response_message = result.success
      ? result.message
      : this.text(
          language,
          `Não consegui abrir a interface agora: ${result.error || 'erro desconhecido'}`,
          `I could not open the interface right now: ${result.error || 'unknown error'}`
        );
    await this.saveAssistantResponse(state);
    await this.repository.saveState(state.session_id, state);
    return state;
  }

  private savingsCalculatorIntent(message: string): any {
    const raw = String(message || '');
    const normalized = this.normalizeTextForIntent(raw);
    const asksCost =
      normalized.includes('quanto custa enviar') ||
      normalized.includes('quanto custa mandar') ||
      normalized.includes('quanto vou pagar') ||
      normalized.includes('quanto eu pago') ||
      normalized.includes('qual a taxa') ||
      normalized.includes('taxa para enviar') ||
      normalized.includes('vale a pena') ||
      normalized.includes('comparado com o banco') ||
      normalized.includes('comparado ao banco') ||
      normalized.includes('comparar com banco') ||
      normalized.includes('comparar com o banco') ||
      normalized.includes('comparado com wise') ||
      normalized.includes('comparar com wise') ||
      (/\b(banco|wise)\b/.test(normalized) && /\b(enviar|mandar|transferir|custa|taxa|pagar|vale)\b/.test(normalized));

    if (!asksCost) return null;
    if (this.wantsAnnualSavingsSummary(raw)) return null;

    const amount = parseHumanAmountNumber(raw);
    return {
      brlAmount: Number.isFinite(amount) && amount > 0 ? String(amount) : '',
    };
  }
  private wantsAnnualSavingsSummary(message: string): boolean {
    const normalized = this.normalizeTextForIntent(message);
    return (
      normalized.includes('quanto eu economizei') ||
      normalized.includes('quanto economizei') ||
      normalized.includes('total economizado') ||
      normalized.includes('resumo do ano') ||
      normalized.includes('resumo anual') ||
      normalized.includes('historico de economia') ||
      normalized.includes('histórico de economia') ||
      normalized.includes('minha economia no ano')
    );
  }

  private async handleSavingsCalculatorIntent(state: AgentState, intent: any): Promise<AgentState> {
    const resultRaw = await executeTool('show_savings_calculator', {
      brl_amount: intent.brlAmount,
    });

    let result: any;
    try {
      result = JSON.parse(resultRaw);
    } catch {
      result = { success: false, message: 'Qual valor em reais você quer simular?' };
    }

    state.success = Boolean(result.success);
    state.response_message = result.message || 'Qual valor em reais você quer simular?';
    await this.saveAssistantResponse(state);
    await this.repository.saveState(state.session_id, state);
    return state;
  }

  private async handleAnnualSavingsSummaryIntent(state: AgentState): Promise<AgentState> {
    const resultRaw = await executeTool('show_annual_savings_summary', {
      session_id: state.session_id,
      user_id: state.session_data?.user_id,
      public_key: state.session_data?.public_key,
    });

    let result: any;
    try {
      result = JSON.parse(resultRaw);
    } catch {
      result = { success: false, error: 'Failed to parse annual savings summary' };
    }

    state.success = Boolean(result.success);
    state.response_message = state.success
      ? result.message
      : `Não consegui calcular sua economia agora: ${result.error || 'erro desconhecido'}`;
    await this.saveAssistantResponse(state);
    await this.repository.saveState(state.session_id, state);
    return state;
  }

  private async handleFixedSavingsIntent(state: AgentState, fixed: {
    period: 'today' | 'month' | 'lifetime';
    view: 'summary' | 'traditional_cost' | 'biggest_operation';
  }): Promise<AgentState> {
    const toolName = fixed.view === 'traditional_cost' ? 'get_savings_comparison' : 'get_savings_identity';
    const resultRaw = await executeTool(toolName, {
      session_id: state.session_id,
      user_id: state.session_data?.user_id,
      period: fixed.period,
      view: fixed.view,
    });

    let result: any;
    try {
      result = JSON.parse(resultRaw);
    } catch {
      result = { success: false, error: 'Failed to parse savings response' };
    }

    state.success = Boolean(result.success);
    state.response_message = state.success
      ? result.message
      : `Não consegui calcular sua economia agora: ${result.error || 'erro desconhecido'}`;
    await this.saveAssistantResponse(state);
    await this.repository.saveState(state.session_id, state);
    return state;
  }

  private extractRepeatCounterparty(message: string): string {
    const normalized = String(message || '').trim();
    const match = normalized.match(/\b(?:pro|pra|para|ao|a)\s+(.+?)\s+(?:de novo|novamente|again)\b/i);
    return match?.[1]?.trim() || '';
  }

  private async handleFinancialMemoryRequest(state: AgentState): Promise<AgentState> {
    const allowNicknameSet = this.hasPendingNicknamePrompt(state);
    const mode = this.financialMemoryMode(state.current_input, allowNicknameSet);
    const contactName = mode === 'repeat_payment' ? this.extractRepeatCounterparty(state.current_input) : '';
    const nickname = mode === 'nickname_set' || mode === 'nickname_lookup'
      ? this.extractTransactionNickname(state.current_input)
      : '';
    const memoryRaw = await executeTool('get_financial_memory', {
      session_id: state.session_id,
      user_id: state.session_data?.user_id,
      mode,
      contact_name: contactName,
      nickname,
      allow_nickname_set: allowNicknameSet,
    });

    let memory: any;
    try {
      memory = JSON.parse(memoryRaw);
    } catch {
      memory = { success: false, error: 'Failed to parse financial memory response' };
    }

    if (!memory.success) {
      state.success = false;
      state.response_message = `Não consegui consultar sua memória financeira: ${memory.error || 'erro desconhecido'}`;
      await this.saveAssistantResponse(state);
      await this.repository.saveState(state.session_id, state);
      return state;
    }

    if (mode === 'repeat_payment') {
      const last = memory.last_payment;
      const destination = String(last?.destinationPublicKey || '').trim();
      const amount = String(last?.destinationAmount || '').trim();
      const assetCode = String(last?.destinationAssetCode || '').trim().toUpperCase();

      if (!destination || !amount || !assetCode) {
        state.success = false;
        state.response_message = memory.message || 'Não encontrei um pagamento anterior com dados suficientes para repetir.';
        await this.saveAssistantResponse(state);
        await this.repository.saveState(state.session_id, state);
        return state;
      }

      const prepareRaw = await executeTool('prepare_payment_confirmation', {
        session_id: state.session_id,
        owner_id: state.session_data?.user_id,
        amount,
        asset_code: assetCode,
        destination,
        destination_name: last.counterparty,
        language: this.getLanguage(state),
        provider: (state.action_params as any)?.external_provider,
        provider_user_id: (state.action_params as any)?.external_provider_user_id,
        source: (state.action_params as any)?.external_source,
      });

      let prepare: any;
      try {
        prepare = JSON.parse(prepareRaw);
      } catch {
        prepare = { success: false, error: 'Failed to parse payment confirmation response' };
      }

      state.success = Boolean(prepare.success && prepare.url);
      state.response_message = state.success
        ? `Encontrei o pagamento anterior: ${this.formatMoneyByAsset(amount, assetCode)} para ${last.counterparty}. Para repetir, confirme aqui:\n\n${prepare.url}`
        : `Encontrei o pagamento anterior, mas não consegui gerar o link de confirmação: ${prepare.error || 'erro desconhecido'}`;
      await this.saveAssistantResponse(state);
      await this.repository.saveState(state.session_id, state);
      return state;
    }

    state.success = true;
    if (mode === 'recipient_insights' && Array.isArray(memory.recipients) && memory.recipients.length > 0) {
      const lines = memory.recipients.slice(0, 8).map((recipient: any, index: number) => {
        const label = String(recipient.label || 'Destinatário').trim();
        const tags = [
          recipient.favorite ? 'favorito' : null,
          recipient.recurring ? 'recorrente' : null,
        ].filter(Boolean).join(', ');
        const last = recipient.lastAmount && recipient.lastAsset
          ? this.formatMoneyByAsset(String(recipient.lastAmount), String(recipient.lastAsset))
          : 'sem histórico de valor';
        return `${index + 1}. ${tags ? `${label} (${tags})` : label} - último envio: ${last}`;
      });
      state.response_message = `Destinatários inteligentes:\n${lines.join('\n')}\n\nVocê pode dizer: "manda pro João o mesmo valor da última vez".`;
    } else {
      state.response_message = memory.message || 'Memória financeira consultada.';
    }
    await this.saveAssistantResponse(state);
    await this.repository.saveState(state.session_id, state);
    return state;
  }

  private isConfirmationMessage(text: string): boolean {
    const normalized = text
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();

    return ['sim', 'confirmo', 'confirmar', 'pode converter', 'converter', 'yes', 'confirm'].includes(normalized);
  }

  private async resolveWalletAssetIssuer(publicKey: string, assetCode: string): Promise<string | undefined> {
    const normalizedAssetCode = this.toSettlementAssetCode(assetCode) || this.normalizeAgentAssetCode(assetCode);
    if (normalizedAssetCode === 'XLM') {
      return undefined;
    }

    const toolResultRaw = await executeTool('get_saldo_tecnico', { public_key: publicKey });
    const toolResult = JSON.parse(toolResultRaw);
    const balances = Array.isArray(toolResult?.balances) ? toolResult.balances : [];
    const balance = balances.find((item: any) => this.toSettlementAssetCode(item.asset || item.asset_code || '') === normalizedAssetCode);

    return balance?.asset_issuer;
  }

  private async handlePendingConversionConfirmation(state: AgentState): Promise<AgentState> {
    if (!state.pending_conversion) {
      return state;
    }

    if (!this.isConfirmationMessage(state.current_input)) {
      state.success = true;
      state.response_message = 'Conversão pendente cancelada. Nenhum ativo foi convertido.';
      state.pending_conversion = undefined;
      await this.saveAssistantResponse(state);
      await this.repository.saveState(state.session_id, state);
      return state;
    }

    const conversion = state.pending_conversion;
    const toolResultRaw = await executeTool('convert_assets', {
      session_id: state.session_id,
      user_id: state.session_data?.user_id,
      source_amount: conversion.source_amount,
      source_asset_code: conversion.source_asset_code,
      source_asset_issuer: conversion.source_asset_issuer,
      dest_asset_code: conversion.dest_asset_code,
      dest_asset_issuer: conversion.dest_asset_issuer,
    });

    let toolResult: any;
    try {
      toolResult = JSON.parse(toolResultRaw);
    } catch {
      toolResult = { success: false, error: 'Failed to parse tool response' };
    }

    state.pending_conversion = undefined;
    if (!toolResult.success) {
      state.success = false;
      state.response_message = this.conversionUnavailableMessage(this.getLanguage(state));
    } else {
      state.success = true;
      state.response_message = toolResult.message || 'Conversão concluída em poucos segundos. Recibo disponível no seu histórico.';
    }

    await this.saveAssistantResponse(state);
    await this.repository.saveState(state.session_id, state);
    return state;
  }

  private wantsTechnicalBalance(_message: string): boolean {
    return false;
  }

  private async handleAssetConversion(state: AgentState): Promise<AgentState> {
    if (!state.session_data?.public_key) {
      state.success = false;
      state.response_message = await this.getOnboardingOrLoginMessage(state, this.shouldPreferLogin(state));
    } else {
      const llmParsed = await this.extractConversionIntentWithLlm(state.current_input);
      const inferredAssets = this.inferConversionAssetsFromText(state.current_input);
      let finalSourceAmount = String(llmParsed.sourceAmount || '').trim() || this.extractAmountFollowUpFromText(state.current_input) || '';
      const requestedSourceAssetCode = this.normalizeAgentAssetCode(llmParsed.sourceAssetCode || inferredAssets.sourceAssetCode || '');
      const requestedDestAssetCode = this.normalizeAgentAssetCode(llmParsed.destAssetCode || inferredAssets.destAssetCode || '');
      const finalSourceAssetCode = this.toSettlementAssetCode(requestedSourceAssetCode) || requestedSourceAssetCode;
      const finalDestAssetCode = this.toSettlementAssetCode(requestedDestAssetCode) || requestedDestAssetCode;

      let fullBalanceConversion: { availableBalance?: string; keptReserve?: string } | null = null;
      if (!finalSourceAmount && finalSourceAssetCode && this.isFullBalanceConversionRequest(state.current_input)) {
        const fullBalance = await this.resolveFullBalanceConversionAmount(state, finalSourceAssetCode);
        if (!fullBalance.success || !fullBalance.amount) {
          state.success = false;
          state.response_message = fullBalance.error || `Não consegui calcular o saldo disponível em ${this.toUserFacingAssetCode(finalSourceAssetCode)}.`;
          await this.saveAssistantResponse(state);
          await this.repository.saveState(state.session_id, state);
          return state;
        }
        finalSourceAmount = fullBalance.amount;
        fullBalanceConversion = {
          availableBalance: fullBalance.availableBalance,
          keptReserve: fullBalance.keptReserve,
        };
      }

      if (!finalSourceAmount || !finalSourceAssetCode || !finalDestAssetCode) {
        const conversionInterfaceRaw = await executeTool('open_conversion_interface', {
          source_amount: finalSourceAmount,
          source_asset_code: finalSourceAssetCode || 'BRL',
          dest_asset_code: finalDestAssetCode || 'USDC',
          language: this.getLanguage(state),
        });

        let conversionInterface: any;
        try {
          conversionInterface = JSON.parse(conversionInterfaceRaw);
        } catch {
          conversionInterface = { success: false };
        }

        state.success = Boolean(conversionInterface.success);
        state.response_message = state.success
          ? this.text(
              this.getLanguage(state),
              `Abra a tela de conversão para escolher valor e moedas. A confirmação e o PIN acontecem na própria página:\n\n${conversionInterface.frontend_url}`,
              `Open the conversion screen to choose amount and currencies. Confirmation and PIN happen on the page:\n\n${conversionInterface.frontend_url}`
            )
          : (llmParsed.needs_clarification && llmParsed.clarification_question
              ? llmParsed.clarification_question
              : this.text(this.getLanguage(state), 'Me diga a conversão neste formato: converter 10 dólares para reais.', 'Tell me the conversion like this: convert 10 dollars to reais.'));
      } else {
        const sourceIssuer = await this.resolveWalletAssetIssuer(state.session_data.public_key, finalSourceAssetCode);
        let destIssuer = await this.resolveWalletAssetIssuer(state.session_data.public_key, finalDestAssetCode);

        if (finalSourceAssetCode !== 'XLM' && !sourceIssuer) {
          state.success = false;
          state.response_message = `Não encontrei ${this.toUserFacingAssetCode(finalSourceAssetCode)} na sua conta para usar como moeda de origem.`;
        } else {
          if (finalDestAssetCode !== 'XLM' && !destIssuer) {
            const trustlineResultRaw = await executeTool('ensure_trustline', {
              session_id: state.session_id,
              user_id: state.session_data.user_id,
              public_key: state.session_data.public_key,
              asset_code: finalDestAssetCode,
            });

            try {
              const trustlineResult = JSON.parse(trustlineResultRaw);
              if (trustlineResult.success && trustlineResult.asset_issuer) {
                destIssuer = trustlineResult.asset_issuer;
              } else if (!trustlineResult.success) {
                state.success = false;
                state.response_message = 'Não consegui preparar sua conta para receber essa moeda agora. Tente novamente em alguns segundos.';
                await this.saveAssistantResponse(state);
                await this.repository.saveState(state.session_id, state);
                return state;
              }
            } catch {
              state.success = false;
              state.response_message = `Não consegui ativar recebimento em ${this.toUserFacingAssetCode(finalDestAssetCode)} agora.`;
              await this.saveAssistantResponse(state);
              await this.repository.saveState(state.session_id, state);
              return state;
            }
          }

          destIssuer = destIssuer || getAssetIssuer(finalDestAssetCode);
          if (finalDestAssetCode !== 'XLM' && !destIssuer) {
            state.success = false;
            state.response_message = 'Sua conta ainda está sendo preparada para receber essa moeda. Tente novamente em alguns segundos.';
          } else {
          const toolResultRaw = await executeTool('get_best_route', {
            source_public_key: state.session_data.public_key,
            destination: state.session_data.public_key,
            source_amount: finalSourceAmount,
            source_asset_code: finalSourceAssetCode,
            source_asset_issuer: sourceIssuer,
            dest_asset_code: finalDestAssetCode,
            dest_asset_issuer: destIssuer,
          });

          let toolResult: any;
          try {
            toolResult = JSON.parse(toolResultRaw);
          } catch {
            toolResult = { success: false, error: 'Failed to parse tool response' };
          }

          if (!toolResult.success) {
            state.success = false;
            state.response_message = this.conversionUnavailableMessage(this.getLanguage(state));
          } else {
            const conversionDestAmount = String(toolResult.quote?.destinationAmount || '').trim();
            const conversionPrepareRaw = await executeTool('prepare_conversion_confirmation', {
              session_id: state.session_id,
              owner_id: state.session_data.user_id,
              source_amount: finalSourceAmount,
              source_asset_code: finalSourceAssetCode,
              source_asset_issuer: sourceIssuer,
              dest_amount: conversionDestAmount,
              dest_asset_code: finalDestAssetCode,
              dest_asset_issuer: destIssuer,
              quote: toolResult.quote,
              optimization_criteria: toolResult.optimization_criteria,
              provider: (state.action_params as any)?.external_provider,
              provider_user_id: (state.action_params as any)?.external_provider_user_id,
              source: (state.action_params as any)?.external_source,
            });

            let conversionPrepare: any;
            try {
              conversionPrepare = JSON.parse(conversionPrepareRaw);
            } catch {
              conversionPrepare = { success: false, error: 'Failed to parse conversion confirmation response' };
            }

            if (!conversionPrepare.success || !conversionPrepare.url) {
              state.success = false;
              state.response_message = 'Não consegui gerar um link de confirmação para a conversão agora. Tente novamente em alguns segundos.';
            } else {
              state.pending_conversion = undefined;
              state.success = true;
              const sourceLabel = this.formatMoneyByAsset(finalSourceAmount, finalSourceAssetCode);
              const destLabel = this.formatMoneyByAsset(conversionDestAmount, finalDestAssetCode);
              const transparencyLine = this.formatBestRouteTransparency(toolResult);
              const fullBalanceLine = fullBalanceConversion
                ? `Usei seu saldo disponível em ${this.toUserFacingAssetCode(finalSourceAssetCode)}: ${sourceLabel}.`
                : '';
              state.response_message = [
                fullBalanceLine,
                `Conversão cotada: ${sourceLabel} para aproximadamente ${destLabel}.`,
                transparencyLine || toolResult.message,
                `Para confirmar a conversão, abra o link:\n\n${conversionPrepare.url}`,
              ].filter(Boolean).join('\n');
            }
          }
          }
        }
        }
      }

    await this.saveAssistantResponse(state);
    await this.repository.saveState(state.session_id, state);
    return state;

  }

  private async handlePriceQuoteRequest(state: AgentState): Promise<AgentState> {
    const language = this.getLanguage(state);
    if ((state.action_params as any)?.llm_route?.all_quotes === true) {
      return await this.handleAllPairQuotesRequest(state);
    }

    const pairQuoteRequest = this.pairQuoteRequestFromLlmRoute(state);
    if (pairQuoteRequest) {
      return await this.handleCurrentPairQuoteRequest(state, pairQuoteRequest);
    }

    const toolResultRaw = await executeTool('get_brl_usdc_quote', {});
    let toolResult: any;
    try {
      toolResult = JSON.parse(toolResultRaw);
    } catch {
      toolResult = { success: false, error: 'Failed to parse quote response' };
    }

    if (!toolResult.success) {
      state.success = false;
      state.response_message = this.text(language, `Não consegui consultar a estimativa agora: ${toolResult.error || 'erro desconhecido'}`, `I could not check the estimate right now: ${toolResult.error || 'unknown error'}`);
    } else {
      const brlPerUsdc = Number(toolResult.brl_per_usdc);
      const usdcPerBrl = Number(toolResult.usdc_per_brl);
      const brlLabel = Number.isFinite(brlPerUsdc) ? brlPerUsdc.toFixed(4) : String(toolResult.brl_per_usdc);
      const usdcLabel = Number.isFinite(usdcPerBrl) ? usdcPerBrl.toFixed(8) : String(toolResult.usdc_per_brl);
      state.success = true;
      state.response_message = this.text(
        language,
        `Estimativa agora: 1 US$ = R$ ${brlLabel}.\nInverso: 1 R$ = US$ ${usdcLabel}.\nFonte: saldo em reais da sua conta.`,
        `Current estimate: 1 US$ = R$ ${brlLabel}.\nInverse: 1 R$ = US$ ${usdcLabel}.\nSource: your account BRL balance.`
      );
    }

    await this.saveAssistantResponse(state);
    await this.repository.saveState(state.session_id, state);
    return state;
  }

  /**
   * Process user input through the agent
   */
  async processInput(state: AgentState, _config?: RunnableConfig): Promise<AgentState> {
    try {
      logger.info(`[Agent] Processing for session: ${state.session_id}`);
      const explicitLanguage = this.extractLanguagePreference(state.current_input);
      if (explicitLanguage) {
        const toolResultRaw = await executeTool('set_language', {
          session_id: state.session_id,
          language: explicitLanguage,
        });
        let toolResult: any;
        try {
          toolResult = JSON.parse(toolResultRaw);
        } catch {
          toolResult = { success: false };
        }
        const nextLanguage = this.normalizeLanguage(toolResult?.language || explicitLanguage);
        state.action_params = {
          ...(state.action_params || {}),
          language: nextLanguage,
        };
        await this.repository.saveMessage(
          state.session_id,
          "user",
          this.sanitizeUserMessage(state.current_input)
        );
        state.success = true;
        state.response_message = String(toolResult?.message || '').trim() || this.text(
          nextLanguage,
          'Pronto. Vou responder em português.',
          'Done. I will answer in English.'
        );
        await this.saveAssistantResponse(state);
        await this.repository.saveState(state.session_id, state);
        return state;
      }

      // Resume wallet creation flow when waiting for user contact input (email/phone)
      if (state.waiting_for_wallet_input) {
        state.action_type = ActionType.CREATE_WALLET;
        state.detected_intent = IntentType.WALLET;
        return await this.handleWalletCreation(state);
      }

      if (this.resumePendingPixRampIntent(state)) {
        state.detected_intent = IntentType.PIX;
        state.action_type = ActionType.INITIATE_PIX;
        await this.repository.saveMessage(
          state.session_id,
          "user",
          this.sanitizeUserMessage(state.current_input)
        );
        return await this.handlePixRampRequest(state);
      }

      const llmDetectedIntent = await this.detectIntent(state.current_input, state.session_data?.user_id, state.messages);
      if (this.lastIntentRouterFailure) {
        state.detected_intent = IntentType.GENERAL;
        state.action_type = ActionType.NONE;
        state.success = false;
        state.error = 'intent_router_unavailable';
        state.response_message = this.getIntentRouterUnavailableMessage(this.getLanguage(state));
        await this.repository.saveMessage(
          state.session_id,
          "user",
          this.sanitizeUserMessage(state.current_input)
        );
        await this.saveAssistantResponse(state);
        await this.repository.saveState(state.session_id, state);
        return state;
      }
      state.detected_intent = llmDetectedIntent || IntentType.GENERAL;
      state.action_type = this.mapIntentToAction(state.detected_intent);
      const selectedRoute = this.serializeIntentRouteCandidate(this.lastIntentRouteCandidate);
      if (selectedRoute) {
        state.action_params = {
          ...(state.action_params || {}),
          llm_route: selectedRoute,
        };
      }

      await this.repository.saveMessage(
        state.session_id,
        "user",
        this.sanitizeUserMessage(state.current_input)
      );

      if (state.detected_intent === IntentType.CONTACTS) {
        const localContactIntent = this.extractContactIntentFromText(state.current_input);
        if (localContactIntent?.action === 'add') {
          state.detected_intent = IntentType.CONTACTS;
          state.action_type = ActionType.LIST_CONTACTS;
          return await this.handleContactsRequest(state);
        }
      }

      const hasActiveWallet = Boolean(String(state.session_data?.public_key || '').trim());
      if (state.detected_intent === IntentType.PRICE_QUOTE || state.detected_intent === IntentType.FINANCIAL_MEMORY) {
        const savingsCalculator = this.savingsCalculatorIntent(state.current_input);
        if (savingsCalculator) {
          return await this.handleSavingsCalculatorIntent(state, savingsCalculator);
        }
      }

      if (state.detected_intent === IntentType.GENERAL) {
        const explanationTopic = this.explanationTopicFromText(state.current_input);
        if (explanationTopic) {
          return await this.handleExplanationRequest(state, explanationTopic);
        }
      }

      const onboardingIntents = new Set<IntentType>([
        IntentType.WALLET,
        IntentType.ONBOARD,
        IntentType.LOGIN,
        IntentType.PRICE_QUOTE,
        IntentType.PIX,
        IntentType.YIELD,
      ]);

      if (!hasActiveWallet && !onboardingIntents.has(state.detected_intent)) {
        state.success = false;
        state.response_message = await this.getOnboardingOrLoginMessage(state, this.shouldPreferLogin(state));
        await this.saveAssistantResponse(state);
        await this.repository.saveState(state.session_id, state);
        return state;
      }

      if (!hasActiveWallet && state.action_type === ActionType.LOGIN_USER) {
        state.success = false;
        state.response_message = await this.getOnboardingOrLoginMessage(state, true);
        await this.saveAssistantResponse(state);
        await this.repository.saveState(state.session_id, state);
        return state;
      }

      if (!hasActiveWallet && state.action_type === ActionType.CREATE_ACCOUNT) {
        state.success = false;
        state.response_message = await this.getOnboardingOrLoginMessage(state, false);
        await this.saveAssistantResponse(state);
        await this.repository.saveState(state.session_id, state);
        return state;
      }

      if (state.action_type === ActionType.CREATE_WALLET && !hasActiveWallet) {
        return await this.handleWalletCreation(state);
      }

      if (state.detected_intent === IntentType.HISTORY) {
        const wantsReceiptImage = this.isReceiptImageRequest(state.current_input);
        if (wantsReceiptImage) {
          return await this.handleReceiptImageRequest(state);
        }
      }

      if (state.detected_intent === IntentType.WALLET && hasActiveWallet && this.isOwnProfileRequest(state.current_input)) {
        return await this.handleOwnProfileRequest(state);
      }

      if (state.detected_intent === IntentType.GENERAL && (this.isIntentHelpRequest(state.current_input) || this.isSimpleGreetingRequest(state.current_input))) {
        return await this.handleIntentHelpRequest(state);
      }

      if (state.detected_intent === IntentType.HISTORY && this.isRampHistoryRequest(state.current_input)) {
        return await this.handleRampHistoryRequest(state);
      }

      if (state.detected_intent === IntentType.HISTORY) {
        const wantsTransactionHistory = this.isTransactionHistoryRequest(state.current_input);
        if (wantsTransactionHistory) {
          return await this.handleHistoryCheck(state);
        }
      }

      if (state.detected_intent === IntentType.PRICE_QUOTE) {
        const llmPairQuoteRequest = this.pairQuoteRequestFromLlmRoute(state);
        if (llmPairQuoteRequest) {
          return await this.handleCurrentPairQuoteRequest(state, llmPairQuoteRequest);
        }

        const deterministicConversionBestRouteEstimate = this.extractConversionBestRouteEstimateIntent(state.current_input);
        if (deterministicConversionBestRouteEstimate) {
          return await this.handleBestRouteConversionEstimate(state, deterministicConversionBestRouteEstimate);
        }

        const deterministicBestRouteEstimate = this.extractGenericBestRouteEstimateIntent(state.current_input);
        if (deterministicBestRouteEstimate) {
          return await this.handleGenericBestRouteEstimate(state, deterministicBestRouteEstimate);
        }

        if (this.isBestRouteGuidanceRequest(state.current_input)) {
          return await this.handleBestRouteGuidanceRequest(state);
        }
      }

      if (state.action_type === ActionType.INITIATE_PIX) {
        return await this.handlePixRampRequest(state);
      }

      if (state.action_type === ActionType.MANAGE_YIELD) {
        const deterministicYield = this.extractYieldIntentFromText(state.current_input);
        if (deterministicYield.is_yield) {
          return await this.handleYieldRequest(state, deterministicYield.is_yield
            ? deterministicYield
            : { is_yield: true, mode: 'options', action: 'deposit', amount: '', asset_code: '' });
        }
      }

      if (state.detected_intent === IntentType.GENERAL) {
        const deterministicAssetInterface = this.extractAssetInterfaceIntentFromText(state.current_input);
        if (deterministicAssetInterface.is_asset_interface) {
          return await this.handleAssetInterfaceRequest(state, deterministicAssetInterface);
        }
      }

      if (state.action_type === ActionType.MANAGE_YIELD) {
        return await this.handleYieldRequest(state, { is_yield: true, mode: 'options', action: 'deposit', amount: '', asset_code: '' });
      }

      if (state.detected_intent === IntentType.PAYMENT) {
        const deterministicExternalWallet = this.extractExternalWalletIntentFromText(state.current_input);
        if (deterministicExternalWallet.is_external_wallet) {
          return await this.handleExternalWalletRequest(state);
        }
      }

      if (state.detected_intent === IntentType.FINANCIAL_MEMORY) {
        const wantsAnnualSavingsSummary = this.wantsAnnualSavingsSummary(state.current_input);
        if (wantsAnnualSavingsSummary) {
          return await this.handleAnnualSavingsSummaryIntent(state);
        }

        const fixedSavings = this.fixedSavingsIntent(state.current_input);
        if (fixedSavings) {
          return await this.handleFixedSavingsIntent(state, fixedSavings);
        }
      }

      if (state.detected_intent === IntentType.WALLET && hasActiveWallet && this.isOwnReceivingKeyRequest(state.current_input)) {
        const { publicKey, pixKey } = await this.resolveOwnReceivingKeys(state);
        state.response_message = this.formatOwnReceivingKeysForLanguage(this.getLanguage(state), publicKey, pixKey);
        state.success = true;
        await this.saveAssistantResponse(state);
        await this.repository.saveState(state.session_id, state);
        return state;
      }

      if (state.detected_intent === IntentType.PAYMENT_LINK && hasActiveWallet && this.isReceiveLinkRequest(state.current_input)) {
        return await this.handleReceiveLinkRequest(state);
      }

      if (state.action_type === ActionType.BUILD_PAYMENT) {
        return await this.handlePaymentRequest(state);
      }

      if (state.action_type === ActionType.CREATE_PAYMENT_LINK) {
        return await this.handlePayAnyoneLinkRequest(state);
      }

      if (state.action_type === ActionType.CONVERT_ASSETS) {
        return await this.handleAssetConversion(state);
      }

      if (state.action_type === ActionType.GET_PRICE_QUOTE) {
        return await this.handlePriceQuoteRequest(state);
      }

      if (state.action_type === ActionType.GET_FINANCIAL_MEMORY) {
        return await this.handleFinancialMemoryRequest(state);
      }

      if (state.action_type === ActionType.LOGOUT_WALLET) {
        state.success = true;
        state.response_message = await this.getLogoutConfirmationMessage(state);
        await this.saveAssistantResponse(state);
        await this.repository.saveState(state.session_id, state);
        return state;
      }

      if (state.action_type === ActionType.RESET_PIN) {
        return await this.handlePinResetRequest(state);
      }

      if (state.action_type === ActionType.GET_BALANCE) {
        return await this.handleBalanceCheck(state);
      }

      if (state.action_type === ActionType.LIST_CONTACTS) {
        return await this.handleContactsRequest(state);
      }

      if (state.action_type === ActionType.GET_HISTORY) {
        return await this.handleHistoryCheck(state);
      }

      try {
        logger.debug(`[Agent] Processing intent: ${state.detected_intent}`);

        // Format conversation history
        const conversationHistory = state.messages
          .slice(-10) // Keep last 10 turns for conversation context
          .map((m) =>
            m.role === "user"
              ? new HumanMessage({ content: m.content })
              : new AIMessage({ content: m.content })
          );

        const preMessages: BaseMessage[] = [
          new SystemMessage({ content: this.buildSystemPrompt(this.getLanguage(state)) }),
          ...conversationHistory,
          new HumanMessage({ content: state.current_input }),
        ];

        // Invoke LLM with system prompt containing guidelines and mandatory contacts context
        const responseContent = await this.invokeWithTools(
          preMessages,
          state.session_data?.user_id,
          state.session_id,
          this.getLanguage(state),
          state.session_data?.session_token || String((state.action_params as any)?.session_token || '').trim()
        );

        state.response_message = responseContent;
        state.success = true;

        logger.debug(`[Agent] LLM responded successfully`);
      } catch (agentError) {
        // Fallback: if LLM fails, use basic response
        logger.warn(
          `[Agent] LLM failed: ${agentError instanceof Error ? agentError.message : String(agentError)}`
        );
        state.response_message = await this.generateSimpleResponse(
          state.current_input,
          state.messages,
          state.session_data?.user_id,
          this.getLanguage(state),
          state.session_id
        );
        state.success = true;
      }

      // Save assistant message
      await this.saveAssistantResponse(state);

      // Save state
      await this.repository.saveState(state.session_id, state);

      return state;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`[Agent] Error: ${errorMessage}`);
      state.success = false;
      state.error = errorMessage;
      state.response_message = this.getLanguage(state) === 'en'
        ? "I can help with contacts, balance, PIX, conversion, sending money, payment links, applications, best route, history, profile, and PIN. Tell me the goal in one sentence, including amount, currency, and destination when relevant."
        : buildCapabilityHelpMessage();
      return state;
    }

  }

  private async generateSimpleResponse(
    input: string,
    previousMessages: Array<{ role: "user" | "assistant"; content: string }>,
    userId?: string,
    language: 'pt-BR' | 'en' = 'pt-BR',
    fallbackSessionId?: string
  ): Promise<string> {
    try {
      const messages = [
        new SystemMessage({
          content: this.buildSystemPrompt(language),
        }),
        ...previousMessages.slice(-6).map((m) =>
          m.role === "user"
            ? new HumanMessage({ content: m.content })
            : new AIMessage({ content: m.content })
        ),
        new HumanMessage({ content: input }),
      ];

      const response = await this.llm.invoke(messages);
      return this.sanitizeAssistantResponse(response.content as string, language);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`[Agent] Fallback response generation failed: ${errorMessage}`);
      if (this.isBestRouteGuidanceRequest(input)) {
        return this.bestRouteGuidanceText(language);
      }
      try {
        const retry = await this.llm.invoke([
          new SystemMessage({ content: `O usuario mandou uma mensagem que nao foi processada. Responda em ${language === 'en' ? 'English' : 'portugues'} com uma sugestao util baseada no historico.` }),
          ...previousMessages.slice(-6).map((m) =>
            m.role === "user"
              ? new HumanMessage({ content: m.content })
              : new AIMessage({ content: m.content })
          ),
          new HumanMessage({ content: input }),
        ]);
        return this.sanitizeAssistantResponse(retry.content as string, language);
      } catch {
        return this.text(language, 'Nao consegui processar sua mensagem. Tente novamente em alguns segundos.', 'I could not process your message. Try again in a few seconds.');
      }
    }
  }

  /**
   * Map intent to action type
   */
  private mapIntentToAction(intent: IntentType): ActionType {
    const intentToActionMap: Record<IntentType, ActionType> = {
      [IntentType.LOGIN]: ActionType.LOGIN_USER,
      [IntentType.ONBOARD]: ActionType.CREATE_ACCOUNT,
      [IntentType.WALLET]: ActionType.CREATE_WALLET,
      [IntentType.WALLET_LOGOUT]: ActionType.LOGOUT_WALLET,
      [IntentType.RESET_PIN]: ActionType.RESET_PIN,
      [IntentType.CONTACTS]: ActionType.LIST_CONTACTS,
      [IntentType.PAYMENT]: ActionType.BUILD_PAYMENT,
      [IntentType.PAYMENT_LINK]: ActionType.CREATE_PAYMENT_LINK,
      [IntentType.BALANCE]: ActionType.GET_BALANCE,
      [IntentType.HISTORY]: ActionType.GET_HISTORY,
      [IntentType.FINANCIAL_MEMORY]: ActionType.GET_FINANCIAL_MEMORY,
      [IntentType.CONVERSION]: ActionType.CONVERT_ASSETS,
      [IntentType.PRICE_QUOTE]: ActionType.GET_PRICE_QUOTE,
      [IntentType.PIX]: ActionType.INITIATE_PIX,
      [IntentType.YIELD]: ActionType.MANAGE_YIELD,
      [IntentType.GENERAL]: ActionType.NONE,
    };

    return intentToActionMap[intent] || ActionType.NONE;
  }

  /**
   * Execute action (preserved for compatibility, tools handle execution)
   */
  async executeAction(state: AgentState, _config?: RunnableConfig): Promise<AgentState> {
    try {
      logger.info(`[Agent] Action execution for: ${state.action_type}`);
      // Actions are handled by the agent's tools now
      await this.repository.saveState(state.session_id, state);
      return state;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`[Agent] Action error: ${errorMessage}`);
      state.success = false;
      state.error = errorMessage;
      return state;
    }
  }
}
