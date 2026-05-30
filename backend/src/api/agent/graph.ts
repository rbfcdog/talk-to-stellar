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
import { logger } from "../../utils/logger";
import ExternalService from '../services/core/external.service';
import { supabase } from '../../config/supabase';
import { getAssetIssuer, getStellarNetworkName, resolveConfiguredAsset } from '../../config/assets';
import { WalletRepository } from '../repository/core/wallet.repository';
import { ActivityFeedService } from '../services/activity-feed.service';
import { normalizeHumanAmountText, parseHumanAmountNumber } from '../../utils/amount';
import crypto from 'crypto';

const walletRepo = new WalletRepository(supabase as any);

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

export class AgentGraph {
  private llm: ChatOpenAI;
  private repository: AgentRepository;
  private systemPrompt: string;
  private externalService: ExternalService;

  constructor(repository: AgentRepository, openaiApiKey: string, systemPrompt: string) {
    this.repository = repository;
    this.systemPrompt = systemPrompt;
    this.externalService = new ExternalService(supabase as any);
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
    const result = Array.isArray(calls)
      ? calls.map((call: any) => ({
          id: call.id || call.tool_call_id,
          name: call.name,
          args: call.args || call.arguments || call.input || {},
        }))
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

  private normalizeTextForIntent(text: string): string {
    return String(text || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
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
    return (
      normalized === 'ajuda' ||
      normalized === 'help' ||
      normalized === 'menu' ||
      normalized.includes('principais comandos') ||
      normalized.includes('comandos disponiveis') ||
      normalized.includes('o que voce faz') ||
      normalized.includes('o que voce pode fazer') ||
      normalized.includes('o que posso fazer') ||
      normalized.includes('o que da para fazer') ||
      normalized.includes('o que tu pode fazer') ||
      normalized.includes('o que da pra fazer') ||
      normalized.includes('o que consigo fazer') ||
      normalized.includes('o que tem por aqui') ||
      normalized.includes('o que faco por aqui') ||
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
    amount_currency?: 'BRL' | 'USDC';
    asset_code: 'BRL' | 'USDC';
    recipient_query?: string;
  } {
    const normalized = this.normalizeTextForIntent(text);
    const mentionsPix = /\bpix\b/.test(normalized);
    const mentionsPixOffRampWording =
      /\b(?:para|pra|pro|a)\s+fora\s+(?:do|de|da)\s+pix\b/.test(normalized) ||
      /\bfora\s+(?:do|de|da)\s+pix\b/.test(normalized) ||
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
        .replace(/\s+\b(?:via|por|com|usando|pago|paga|pagando)\b.*$/i, '')
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
      /\b(mandar|enviar|pagar|transferir|transacao|transação|trasacao|transferencia|transferência|pagamento|fazer uma transacao|fazer uma transação|fazer uma trasacao|fazer transacao|fazer transação|fazer trasacao|fazer uma transferencia|fazer transferencia|faca uma transferencia|faça uma transferência)\b/.test(normalized) &&
      Boolean(pixFundedPaymentRecipient) &&
      !mentionsOwnPixDestination &&
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
    const mentionsBrl = /\b(brl|real|reais|r\$)\b/.test(normalized);
    const mentionsTesouro = /\b(tesouro|tesouros)\b/.test(normalized);
    const mentionsUsdc = /\b(usdc|usd|dolar|dolares|dólar|dólares|dollar|dollars)\b/.test(normalized);
    const impliedPixOnRamp = Boolean(mentionsPix && amountMatch && !wantsOffRamp);
    if (!wantsOnRamp && !wantsOffRamp && !impliedPixOnRamp) {
      return { is_pix_ramp: false, direction: 'onramp', asset_code: 'BRL' };
    }
    const explicitReceiveUsdc = /(?:receber|cair|saldo|converter|em)\s+(?:em\s+)?(?:usdc|usd|dolar|dolares|dólar|dólares)/.test(normalized);
    const explicitReceiveBrl = /(?:receber|cair|saldo|converter|em)\s+(?:em\s+)?(?:brl|real|reais|r\$)/.test(normalized);
    const onRampTargetAsset = explicitReceiveBrl
      ? 'BRL'
      : (explicitReceiveUsdc || mentionsUsdc || !mentionsTesouro ? 'USDC' : 'BRL');
    const fundAndPayAsset = mentionsUsdc && !mentionsBrl ? 'USDC' : 'BRL';
    return {
      is_pix_ramp: true,
      direction: wantsOffRamp ? 'offramp' : 'onramp',
      flow: wantsPixFundedPayment && !wantsOffRamp ? 'fund_and_pay' : 'fund_wallet',
      amount: amountMatch?.[1] ? normalizeHumanAmountText(amountMatch[1]) : undefined,
      amount_currency: mentionsUsdc && !mentionsBrl && !mentionsTesouro ? 'USDC' : 'BRL',
      asset_code: wantsOffRamp && !wantsOnRamp
        ? (mentionsUsdc ? 'USDC' : 'BRL')
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
    amount_currency?: 'BRL' | 'USDC';
    asset_code: 'BRL' | 'USDC';
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
      amount_currency: pending.amount_currency === 'USDC' ? 'USDC' : 'BRL',
      asset_code: pending.asset_code === 'USDC' ? 'USDC' : 'BRL',
      recipient_query: String(pending.recipient_query || '').trim() || undefined,
    };
  }

  private async buildPixRampUrl(state: AgentState, intent: {
    direction: 'onramp' | 'offramp';
    flow?: 'fund_wallet' | 'fund_and_pay';
    amount?: string;
    amount_currency?: 'BRL' | 'USDC';
    asset_code: 'BRL' | 'USDC';
    recipient_query?: string;
    recipient_key?: string;
    recipient_public_key?: string;
    pay_amount?: string;
    pay_asset_code?: 'BRL' | 'USDC';
  }): Promise<string> {
    const page = intent.direction === 'offramp' ? '/pix-off' : '/pix-on';
    const url = new URL(`${this.getFrontendBaseUrl()}${page}`);
    const intentId = crypto.randomUUID();
    const externalProvider = String((state.action_params as any)?.external_provider || '').trim().toLowerCase();
    const externalProviderUserId = String((state.action_params as any)?.external_provider_user_id || '').trim();
    const externalSource = String((state.action_params as any)?.external_source || externalProvider || '').trim().toLowerCase();
    url.searchParams.set('mode', intent.direction);
    url.searchParams.set('asset', intent.asset_code);
    url.searchParams.set('intent_id', intentId);
    url.searchParams.set('from', 'chat');
    url.searchParams.set('autostart', '1');
    url.searchParams.set('lang', this.getLanguage(state));
    if (externalProvider) url.searchParams.set('provider', externalProvider);
    if (externalProviderUserId) url.searchParams.set('provider_user_id', externalProviderUserId);
    if (externalSource) url.searchParams.set('source', externalSource);
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
      const amountCurrency = intent.amount_currency || intent.asset_code;
      if (isPixFundedPayment && finalPayAmount && finalPayAsset) {
        url.searchParams.set('currency', finalPayAsset);
        url.searchParams.set('amount', intent.amount);
      } else if (intent.direction === 'onramp' && amountCurrency === 'USDC' && intent.asset_code === 'USDC') {
        url.searchParams.set('receive_amount', intent.amount);
        url.searchParams.set('receive_asset', 'USDC');
        url.searchParams.set('currency', 'USDC');
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
    const extractedIntent = this.extractPixRampIntentFromText(state.current_input);
    const intent = extractedIntent.is_pix_ramp
      ? extractedIntent
      : (this.resumePendingPixRampIntent(state) || extractedIntent);
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
      const pixFeeNote = this.text(
        language,
        'A página mostra quanto sai no PIX, a taxa do app e quanto será enviado antes do PIN.',
        'The page shows how much leaves through PIX, the app fee, and how much will be sent before the PIN.'
      );
      state.success = true;
      state.pending_pix_ramp = undefined;
      state.action_params = { ...(state.action_params || {}), pending_pix_ramp: undefined };
      if (intent.direction === 'offramp') {
        const amountText = this.formatMoneyByAsset(intent.amount, intent.amount_currency || 'BRL');
        state.response_message = this.text(
          language,
          `Para mandar ${amountText} para seu PIX, abra:\n\n${url}\n\n${pixFeeNote}\n\nA tela calcula a melhor conversão e confirma o valor chegando em reais no seu PIX.`,
          `To send ${amountText} to your PIX, open:\n\n${url}\n\n${pixFeeNote}\n\nThe screen calculates the best conversion and confirms the amount arriving in reais in your PIX.`
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
          : this.text(language, `colocar ${amountText} na sua conta`, `add ${amountText} to your account`);
        state.response_message = this.text(
          language,
          `Para ${actionText} via PIX, abra:\n\n${url}\n\n${pixFeeNote}\n\nNa página, use o QR e confirme com PIN para o saldo entrar como ${this.formatUserFacingAssetName(intent.asset_code, language)}.`,
          `To ${actionText} with PIX, open:\n\n${url}\n\n${pixFeeNote}\n\nOn the page, use the QR and confirm with PIN so the balance arrives as ${this.formatUserFacingAssetName(intent.asset_code, language)}.`
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
      message: prepare.message || `Para confirmar o envio de ${this.formatMoneyByAsset(amount, assetCode)} para ${destinationName}, abra o link:\n\n${prepare.url}`,
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
    if (upper === 'XLM') return 'saldo da conta TalkToStellar';
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
        'Eu analiso a melhor rota quando você informa valor, moeda e destino.',
        'Para calcular, me diga valor, moeda de origem e moeda de destino.',
        '',
        'Exemplos:',
        '- melhor rota para converter 100 USDC para BRL',
        '- melhor rota para enviar 50 reais para Ana',
        '- cotação de 200 reais para dólares',
        '',
        'Eu mostro valor final, taxa e caminho antes de qualquer PIN.',
      ].join('\n'),
      [
        'To calculate the best route, tell me amount, source currency, and destination currency.',
        '',
        'Examples:',
        '- best route to convert 100 USDC to BRL',
        '- best route to send 50 reais to Ana',
        '- quote 200 reais to dollars',
        '',
        'I show final amount and fee before any PIN.',
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
      ? ['BRL', 'USDC', 'CETES']
      : ['BRL', 'USDC', 'EUR'];
    const safeDestAssetCode = allowedRouteAssets.includes(destAssetCode) ? destAssetCode : 'BRL';
    const sourceAssetCode = safeDestAssetCode === 'BRL' ? 'USDC' : 'BRL';

    return {
      amount,
      destAssetCode: safeDestAssetCode,
      sourceAssetCode,
    };
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
    amount: string;
    assetCode: string;
    currentBalance?: { amount: number; formatted: string } | null;
    explicitlyNeedsPix?: boolean;
  }): Promise<string> {
    const requestedAmount = this.toAmountNumber(input.amount);
    const available = Math.max(0, input.currentBalance?.amount || 0);
    const needsTopUp = input.currentBalance ? Math.max(0, requestedAmount - available) : requestedAmount;
    const fundingAmount = needsTopUp > 0 ? needsTopUp.toFixed(input.assetCode === 'BRL' ? 2 : 7).replace(/0+$/, '').replace(/\.$/, '') : input.amount;
    const url = await this.buildPixRampUrl(state, {
      direction: 'onramp',
      flow: 'fund_and_pay',
      amount: fundingAmount,
      amount_currency: input.assetCode === 'BRL' ? 'BRL' : 'USDC',
      asset_code: input.assetCode === 'BRL' ? 'BRL' : 'USDC',
      recipient_query: input.recipientQuery,
      pay_amount: input.amount,
      pay_asset_code: input.assetCode === 'BRL' ? 'BRL' : 'USDC',
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

    const deterministicParsed = this.extractDirectPaymentIntentFromText(state.current_input);
    const llmParsed = deterministicParsed.amount && deterministicParsed.recipient_query
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
      state.success = false;
      state.response_message = llmParsed.clarification_question || 'Me diga o destinatário, valor e moeda. Exemplo: mandar para Ana Silva 3 USDC.';
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
      const balanceConfirmation = balance
        ? `Saldo suficiente confirmado: ${balance.formatted} disponível para enviar ${this.formatMoneyByAsset(amount, assetCode)}.`
        : 'Não consegui confirmar o saldo antes do link; a tela de confirmação valida novamente antes de enviar.';
      state.response_message = `${balanceConfirmation}\n\n${String(prepared.message || 'Link de confirmação gerado com sucesso.')}`;
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
      '- For balances, contacts, history, payments, conversions, PIX, earnings, reset PIN, and logout, prefer tools over free text.',
      '- When a tool accepts session_id, pass exactly the session_id from RUNTIME CONTEXT.',
      '- When adding/listing contacts, use session_id and the contact key from the user message.',
      '- Never invent amounts, fees, quotes, hashes, contact names, or success states.',
      '- Strict contact rule: if a payment names a person, use only a real saved contact from RUNTIME CONTEXT/tool results. If not found, ask for an exact saved contact or transfer key/email/CPF/phone; never create a recipient from a typo.',
      '- In payment and conversion tools, source/origin asset is what the sender spends; destination asset is what the recipient receives.',
      '- Example: "transferir 200 BRL para Carlos receber em USDC" means source_amount=200, source_asset_code=BRL, destination/dest asset=USDC. Do not send 200 USDC.',
      '- Never invent PIX URLs or routes. PIX flows must use the deterministic pix handler, which builds /pix-on or /pix-off from FRONTEND_URL.',
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
      '- Never mention blockchain internals in user-facing copy. Do not mention XLM, issuer, trustline, ledger, hash, Horizon, public key, path payment, or Stellar network details.',
      '- If the user asks for XLM or technical balances, show only the app balance in R$, US$, and CETES/Mexico test option in testnet and say TalkToStellar displays the available app balance.',
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
      '',
      '## FEES AND SAVINGS UX',
      '- Talk about fees as transparent and controlled, using exact tool data when available.',
      '- When a quote or payment result has a fee, say it before confirmation in R$, US$, or CETES/opção México according to the asset involved.',
      '- Do not claim savings without data. Prefer concise wording like "taxa baixa" only when backed by tool data.',
      '- For transfers/conversions, show the quote before confirmation without adding generic reassurance text.',
      '- For BRL -> US$ net value, exchange-rate, fee, or received-amount questions, call get_conversion_preview or a quote tool. Never use a hardcoded exchange rate.',
      '- If the user asks "quanto custa enviar", "quanto vou pagar", "vale a pena", "comparado com o banco", "banco", or "Wise" with a transfer amount, call show_savings_calculator before asking for confirmation. Never answer fee comparison only with free text.',
      '- After any payment or conversion is completed inside the agent flow, call send_receipt_with_savings instead of only confirming with free text. The receipt must put the user savings before the Stellar evidence/hash.',
      '- If the user asks "quanto eu economizei", "resumo do ano", or "histórico de economia", call show_annual_savings_summary.',
      '- Approved savings tool messages are WhatsApp-ready. Preserve emojis, *bold*, and _italic_ exactly as returned by show_savings_calculator, send_receipt_with_savings, or show_annual_savings_summary.',
    ].join('\n');
  }

  private async invokeWithTools(
    messages: BaseMessage[],
    userId?: string,
    sessionId?: string,
    language: 'pt-BR' | 'en' = 'pt-BR',
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
        
        logger.info(`[invokeWithTools] Executing tool: ${toolCall.name} with args: ${JSON.stringify(toolArgs)}`);
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

  /**
   * Detect user intent from message using LLM
   */
  private async detectIntent(message: string, userId?: string): Promise<IntentType> {
    try {
      const systemPrompt = `You are an intent classifier for a TalkToStellar account assistant.

Classify the user message into ONE and only ONE of these intents:
login, onboard, wallet, wallet_logout, contacts, payment, payment_link, balance, history, financial_memory, conversion, price_quote, pix, yield, general

Return only the intent label. No punctuation. No explanation. No extra words.

Priority rules:
1. If the user asks to log out, sign out, disconnect, deslogar, sair da conta, or end session, the intent is wallet_logout.
2. If the user asks to send money, mandar dinheiro, transfer, pay someone, the intent is payment.
3. If the user asks to bring money, deposit, colocar, trazer, or use PIX to add funds, the intent is pix.
4. If the user asks to withdraw, sacar, retirar, mandar pra fora, send money OUT of account, or off-ramp, the intent is pix.
5. If the user asks for contacts, saved recipients, or favorites, the intent is contacts.
6. If the user asks for balance, saldo, or what they have, the intent is balance.
7. If the user asks for transaction history or receipts, the intent is history.
8. If the user asks to convert or exchange assets, the intent is conversion.
9. If the user asks to invest, apply, or see yield/earnings, the intent is yield.
10. If the user asks for quotes, rates, or estimates, the intent is price_quote.
11. If the user asks to create a payment link, the intent is payment_link.
12. If the user asks to create an account, log in, or connect, the intent is wallet or onboard.

Strong contact examples that must be contacts:
- "quero ver meus contatos" -> contacts
- "ver contatos" -> contacts
- "listar contatos" -> contacts
- "mostrar meus destinatários" -> contacts
- "abrir meus favoritos" -> contacts
- "quais contatos eu tenho salvo" -> contacts
- "meus contatos" -> contacts
- "contatos salvos" -> contacts
- "destinatários salvos" -> contacts

Other examples:
- "mandar dinheiro pra alguem" -> payment
- "quero mandar 10 reais pra rodrigo" -> payment
- "enviar 50 dolares para Ana" -> payment
- "mandar pra fora 100 reais via pix" -> pix
- "mandar pra fora" -> pix
- "sacar 50 reais" -> pix
- "retirar dinheiro" -> pix
- "colocar dinheiro via pix" -> pix
- "trazer 100 reais" -> pix
- "depositar via pix" -> pix
- "quero mandar 5 brl pra ana por pix" -> pix
- "Check my balance" -> balance
- "ver saldo" -> balance
- "qual meu saldo atual?" -> balance
- "ver transações" -> history
- "quero investir" -> yield
- "quero aplicar dinheiro" -> yield
- "converter dolares para reais" -> conversion
- "quero criar um link de pagamento" -> payment_link
- "quero sair da conta" -> wallet_logout
- "deslogar" -> wallet_logout
- "logout" -> wallet_logout

If the message is short and obviously about contacts, choose contacts instead of general. If in doubt between contacts and general, choose contacts.`;

      const response = await this.llm.invoke(await this.prependContactsContext([
        new SystemMessage({ content: systemPrompt }),
        new HumanMessage({ content: message }),
      ], userId));

      const intentText = (response.content as string).trim().toLowerCase();

      const intentMap: Record<string, IntentType> = {
        login: IntentType.LOGIN,
        onboard: IntentType.ONBOARD,
        wallet: IntentType.WALLET,
        wallet_logout: IntentType.WALLET_LOGOUT,
        contacts: IntentType.CONTACTS,
        payment: IntentType.PAYMENT,
        payment_link: IntentType.PAYMENT_LINK,
        balance: IntentType.BALANCE,
        history: IntentType.HISTORY,
        financial_memory: IntentType.FINANCIAL_MEMORY,
        conversion: IntentType.CONVERSION,
        price_quote: IntentType.PRICE_QUOTE,
        pix: IntentType.PIX,
        yield: IntentType.YIELD,
        general: IntentType.GENERAL,
      };

      const detectedIntent = intentMap[intentText] || IntentType.GENERAL;
      logger.debug(`Intent: "${message}" -> ${detectedIntent}`);

      return detectedIntent;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Intent detection failed: ${errorMessage}`);
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
        const balanceAssets = getStellarNetworkName() === 'TESTNET' ? ['BRL', 'USDC', 'CETES'] : ['BRL', 'USDC', 'EUR'];
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
        limit: 10,
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
        const transactions = Array.isArray(toolResult.transactions) ? toolResult.transactions : [];
        const formattedTransactions = transactions.length > 0
          ? transactions.map((transaction: any, index: number) => this.formatTransactionLine(transaction, index)).join('\n\n')
          : 'Nenhuma transação encontrada.';
        const historyUrl = await this.buildTransactionsHistoryUrl(state);

        state.success = true;
        state.response_message = `Últimas transações da sua conta:\n${formattedTransactions}\n\nVer histórico completo:\n${historyUrl}`;
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
      toolInput = { session_id: state.session_id, ...sessionAuth, asset_code: assetCode, language };
    } else if (intent.mode === 'prepare') {
      toolName = 'prepare_yield_action';
      toolInput = {
        session_id: state.session_id,
        ...sessionAuth,
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
        action: intent.action,
        amount: intent.amount,
        asset_code: assetCode,
        pin: intent.pin,
        language,
      };
    } else {
      toolName = 'get_yield_options';
      toolInput = { language };
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
      asset_code: intent.asset_code || (intent.action === 'bring' ? 'USDC' : 'BRL'),
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
      let finalSourceAmount = String(llmParsed.sourceAmount || '').trim();
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

      const wantsReceiptImage = this.isReceiptImageRequest(state.current_input);
      const wantsTransactionHistory = this.isTransactionHistoryRequest(state.current_input);
      const localContactIntent = this.extractContactIntentFromText(state.current_input);
      const extractedPixRamp = this.extractPixRampIntentFromText(state.current_input);
      const deterministicYield = this.extractYieldIntentFromText(state.current_input);
      const deterministicExternalWallet = this.extractExternalWalletIntentFromText(state.current_input);
      const deterministicBestRouteEstimate = this.extractGenericBestRouteEstimateIntent(state.current_input);
      const savingsCalculator = this.savingsCalculatorIntent(state.current_input);
      const wantsAnnualSavingsSummary = this.wantsAnnualSavingsSummary(state.current_input);
      const deterministicAssetInterface = this.extractAssetInterfaceIntentFromText(state.current_input);
      const deterministicFinancialMemory = this.hasDeterministicFinancialMemoryIntent(
        state.current_input,
        this.hasPendingNicknamePrompt(state)
      );

      const urgentIntents = wantsReceiptImage ? IntentType.HISTORY
        : wantsTransactionHistory ? IntentType.HISTORY
        : localContactIntent?.action === 'add' ? IntentType.CONTACTS
        : this.isContactsRequest(state.current_input) ? IntentType.CONTACTS
        : /\b(?:mandar|enviar)\s+(?:pra|para|pro|a)\s+fora\b.*\b(?:via|por|com)\s+pix\b/i.test(state.current_input) ||
          /\b(?:sacar|retirar|tirar|saque)\b.*\bpix\b/i.test(state.current_input) ||
          /\bmandar\s+(?:pra|para|pro|a)\s+fora\b/i.test(state.current_input)
        ? IntentType.PIX
        : null;

      state.detected_intent = urgentIntents || await this.detectIntent(state.current_input, state.session_data?.user_id);
      state.action_type = this.mapIntentToAction(state.detected_intent);

      await this.repository.saveMessage(
        state.session_id,
        "user",
        this.sanitizeUserMessage(state.current_input)
      );

      if (localContactIntent?.action === 'add') {
        state.detected_intent = IntentType.CONTACTS;
        state.action_type = ActionType.LIST_CONTACTS;
        return await this.handleContactsRequest(state);
      }

      const hasActiveWallet = Boolean(String(state.session_data?.public_key || '').trim());
      if (savingsCalculator) {
        return await this.handleSavingsCalculatorIntent(state, savingsCalculator);
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

      if (wantsReceiptImage) {
        return await this.handleReceiptImageRequest(state);
      }

      if (hasActiveWallet && this.isOwnProfileRequest(state.current_input)) {
        return await this.handleOwnProfileRequest(state);
      }

      if (this.isIntentHelpRequest(state.current_input) || this.isSimpleGreetingRequest(state.current_input)) {
        return await this.handleIntentHelpRequest(state);
      }

      if (this.isRampHistoryRequest(state.current_input)) {
        return await this.handleRampHistoryRequest(state);
      }

      if (wantsTransactionHistory) {
        return await this.handleHistoryCheck(state);
      }

      if (deterministicBestRouteEstimate) {
        return await this.handleGenericBestRouteEstimate(state, deterministicBestRouteEstimate);
      }

      if (this.isBestRouteGuidanceRequest(state.current_input)) {
        return await this.handleBestRouteGuidanceRequest(state);
      }

      if (state.action_type === ActionType.INITIATE_PIX) {
        return await this.handlePixRampRequest(state);
      }

      if (state.action_type === ActionType.MANAGE_YIELD && deterministicYield.is_yield) {
        return await this.handleYieldRequest(state, deterministicYield.is_yield
          ? deterministicYield
          : { is_yield: true, mode: 'options', action: 'deposit', amount: '', asset_code: '' });
      }

      if (deterministicAssetInterface.is_asset_interface) {
        return await this.handleAssetInterfaceRequest(state, deterministicAssetInterface);
      }

      if (state.action_type === ActionType.MANAGE_YIELD) {
        return await this.handleYieldRequest(state, { is_yield: true, mode: 'options', action: 'deposit', amount: '', asset_code: '' });
      }

      if (deterministicExternalWallet.is_external_wallet) {
        return await this.handleExternalWalletRequest(state);
      }

      if (wantsAnnualSavingsSummary) {
        return await this.handleAnnualSavingsSummaryIntent(state);
      }

      const fixedSavings = this.fixedSavingsIntent(state.current_input);
      if (fixedSavings) {
        return await this.handleFixedSavingsIntent(state, fixedSavings);
      }

      if (hasActiveWallet && this.isOwnReceivingKeyRequest(state.current_input)) {
        const { publicKey, pixKey } = await this.resolveOwnReceivingKeys(state);
        state.response_message = this.formatOwnReceivingKeysForLanguage(this.getLanguage(state), publicKey, pixKey);
        state.success = true;
        await this.saveAssistantResponse(state);
        await this.repository.saveState(state.session_id, state);
        return state;
      }

      if (hasActiveWallet && this.isReceiveLinkRequest(state.current_input)) {
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
          .slice(-5) // Keep last 5 turns for context
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
        const responseContent = await this.invokeWithTools(preMessages, state.session_data?.user_id, state.session_id, this.getLanguage(state));

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
          this.getLanguage(state)
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
      state.response_message = this.text(
        this.getLanguage(state),
        "Posso ajudar com contatos, saldo, PIX, conversão, enviar dinheiro, link de pagamento, aplicações, melhor rota, histórico e PIN. Diga o objetivo em uma frase, por exemplo: ver saldo, trazer 100 reais via PIX, converter 50 reais para dólar, ver aplicações ou abrir perfil.",
        "I can help with contacts, balance, PIX, conversion, sending money, payment links, applications, best route, history, and PIN. Say the goal in one sentence, for example: show balance, bring 100 reais via PIX, convert 50 reais to dollars, view applications, or open profile."
      );
      return state;
    }

  }

  private async generateSimpleResponse(
    input: string,
    previousMessages: Array<{ role: "user" | "assistant"; content: string }>,
    userId?: string,
    language: 'pt-BR' | 'en' = 'pt-BR'
  ): Promise<string> {
    try {
      const messages = [
        new SystemMessage({
          content: this.buildSystemPrompt(language),
        }),
        ...previousMessages.slice(-3).map((m) =>
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
      const yieldIntent = this.extractYieldIntentFromText(input);
      if (yieldIntent.is_yield) {
        const url = new URL('/rendimentos', this.getFrontendBaseUrl());
        url.searchParams.set('action', yieldIntent.action);
        if (yieldIntent.amount) url.searchParams.set('amount', yieldIntent.amount);
        if (yieldIntent.asset_code) url.searchParams.set('asset', yieldIntent.asset_code);
        url.searchParams.set('from', 'chat');
        url.searchParams.set('lang', language);
        return this.text(
          language,
          `Abra rendimentos para aplicar dinheiro ou ver posições:\n${url.toString()}\n\nNada sai sem PIN.`,
          `Open earnings to apply money or view positions:\n${url.toString()}\n\nNothing moves without PIN.`
        );
      }
      const ni = input.toLowerCase();
      const hint = ni.includes('mandar') || ni.includes('enviar') || ni.includes('pagar')
        ? 'Para enviar dinheiro, preciso saber: valor, moeda e para quem (contato salvo ou chave).'
        : ni.includes('saldo') || ni.includes('quanto')
          ? 'Veja seu saldo em /rendimentos ou peça no chat.'
          : ni.includes('pix')
            ? 'Para PIX, diga se e para trazer reais ou retirar.'
            : 'Pode repetir o que deseja fazer? Tente ser mais direto.';
      return `Nao entendi completamente. ${hint}`;
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
