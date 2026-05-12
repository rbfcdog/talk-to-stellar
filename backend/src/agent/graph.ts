/**
 * LangChain Agent with Tool Support for TalkToStellar
 * Handles intent detection, tool calling, and response generation
 */

import { RunnableConfig } from "@langchain/core/runnables";
import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage, AIMessage, ToolMessage, BaseMessage, SystemMessage } from "@langchain/core/messages";
import { AgentState, IntentType, ActionType } from "./types";
import { AgentRepository } from "../repositories/agent.repository";
import { ALL_TOOLS, executeTool } from "./tools";
import { logger } from "../utils/logger";
import ExternalService from '../services/external.service';
import { supabase } from '../config/supabase';
import { getAssetIssuer } from '../config/assets';
import { WalletRepository } from '../repositories/wallet.repository';

const walletRepo = new WalletRepository(supabase as any);


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

  private async getContactNameByPublicKey(publicKey: string, userId?: string): Promise<string | undefined> {
    try {
      if (!userId || !publicKey) {
        return undefined;
      }

      const contacts = await this.fetchContacts(userId);

      const contact = contacts.find((c: any) => 
        c.stellar_public_key === publicKey || c.public_key === publicKey
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

      const isPublicKey = /^G[A-Z2-7]{55}$/i.test(normalizedQuery);
      if (isPublicKey) {
        return contacts.find((c: any) =>
          String(c.stellar_public_key || c.public_key || '').trim() === query.trim()
        );
      }

      const queryPhone = normalizePhone(query);
      if (queryPhone.length >= 8) {
        const byPhone = contacts.find((c: any) => normalizePhone(String(c.phone_number || '')) === queryPhone);
        if (byPhone) {
          return byPhone;
        }
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

      // Support positional aliases like "contato 1" / "contact 1"
      const aliasMatch = normalizedQuery.match(/^(?:contato|contact)\s*(\d{1,3})$/);
      if (aliasMatch) {
        const idx = Number(aliasMatch[1]);
        if (Number.isFinite(idx) && idx >= 1 && idx <= contacts.length) {
          return contacts[idx - 1];
        }
      }

      return contacts.find((c: any) => {
        const contactName = String(c.contact_name || c.name || '').trim();
        const normalizedContactName = this.normalizeLookup(contactName);
        return (
          contactName.toLowerCase() === normalizedQuery ||
          normalizedContactName === normalizedLookup ||
          normalizedContactName.includes(normalizedLookup) ||
          normalizedLookup.includes(normalizedContactName)
        );
      });
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
    const normalizedAsset = hinted === 'USD' ? 'USDC' : (hinted || undefined);
    const normalizedAmount = amountText.replace(',', '.');
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

  private extractPaymentLinkIntentFromText(text: string): {
    amount?: string;
    asset_code?: string;
    receive_asset_code?: string;
    recipient_query?: string;
  } {
    const original = String(text || '');
    const normalized = this.normalizeTextForIntent(original);
    const amountMatch = normalized.match(/(?:^|\s)(?:r\$\s*)?(\d+(?:[.,]\d{1,8})?)(?=\s|$)/);
    const amount = amountMatch?.[1]?.replace(',', '.');

    let assetCode = 'USDC';
    if (/\b(brl|real|reais|r\$)\b/.test(normalized)) assetCode = 'BRL';
    if (/\b(xlm|lumen|lumens)\b/.test(normalized)) assetCode = 'XLM';
    if (/\b(usd|usdc|dolar|dolares|dollar|dollars)\b/.test(normalized)) assetCode = 'USDC';

    let receiveAssetCode = '';
    const receiveMatch = normalized.match(/receber\s+em\s+(brl|reais|real|usd|usdc|dolar|dolares|xlm|lumens?)/);
    if (receiveMatch?.[1]) {
      const receive = receiveMatch[1];
      if (receive === 'brl' || receive === 'real' || receive === 'reais') receiveAssetCode = 'BRL';
      else if (receive === 'xlm' || receive.startsWith('lumen')) receiveAssetCode = 'XLM';
      else receiveAssetCode = 'USDC';
    }

    return {
      amount,
      asset_code: assetCode,
      receive_asset_code: receiveAssetCode,
      recipient_query: '',
    };
  }

  private getOnboardingOrLoginMessage(state?: AgentState, preferLogin: boolean = false): string {
    const base =
      process.env.CREATE_ACCOUNT_BASE ||
      process.env.FRONTEND_URL ||
      process.env.PUBLIC_APP_URL ||
      "http://localhost:3000";
    const normalizedBase = String(base).trim().replace(/\/$/, "");
    let onboardingUrl = `${normalizedBase}/create-account`;
    const externalProvider = String((state?.action_params as any)?.external_provider || '').trim().toLowerCase();
    const externalProviderUserId = String((state?.action_params as any)?.external_provider_user_id || '').trim();

    if (externalProvider && externalProviderUserId) {
      try {
        onboardingUrl = this.externalService.createOnboardUrl(externalProvider, externalProviderUserId).url;
      } catch (error) {
        logger.warn(`[onboarding-url] failed to create external onboarding URL: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    if (preferLogin) {
      return `Sua sessão não está ativa no momento.

Abra este link para entrar na sua conta:
${onboardingUrl}

Na página, use a opção "Já tenho conta".`;
    }

    return `Você precisa entrar na sua conta para continuar.

Abra este link para criar conta ou entrar em uma conta existente:
${onboardingUrl}`;
  }

  private getFrontendBaseUrl(): string {
    const base =
      process.env.PAYMENT_CONFIRM_BASE ||
      process.env.CREATE_ACCOUNT_BASE ||
      process.env.FRONTEND_URL ||
      process.env.PUBLIC_APP_URL ||
      "http://localhost:3000";
    return String(base).trim().replace(/\/$/, "");
  }

  private buildPayAnyoneUrl(input: { amount?: string; assetCode?: string; receiveAssetCode?: string; recipientName?: string }): string {
    const params = new URLSearchParams();
    const amount = String(input.amount || '').trim();
    const assetCode = String(input.assetCode || '').trim().toUpperCase().replace(/^USD$/, 'USDC');
    const receiveAssetCode = String(input.receiveAssetCode || assetCode).trim().toUpperCase().replace(/^USD$/, 'USDC');
    const recipientName = String(input.recipientName || '').trim();

    if (amount) params.set('amount', amount);
    if (assetCode) params.set('asset', assetCode);
    if (receiveAssetCode && receiveAssetCode !== assetCode) params.set('receive_asset', receiveAssetCode);
    if (recipientName) params.set('recipient', recipientName);

    const qs = params.toString();
    return `${this.getFrontendBaseUrl()}/pay-anyone${qs ? `?${qs}` : ''}`;
  }

  private async handlePayAnyoneLinkRequest(state: AgentState): Promise<AgentState> {
    if (!state.session_data?.public_key) {
      state.success = false;
      state.response_message = this.getOnboardingOrLoginMessage(state, this.shouldPreferLogin(state));
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
      const assetCode = String(amountInfo.assetCode || 'USDC').trim().toUpperCase().replace(/^USD$/, 'USDC');
      const receiveAssetCode = String(llmParsed.receive_asset_code || assetCode).trim().toUpperCase().replace(/^USD$/, 'USDC');
      const recipientName = String(llmParsed.recipient_query || '').trim();
      const numericAmount = Number(amount.replace(',', '.'));
      const hasValidAmount = amount.length > 0 && Number.isFinite(numericAmount) && numericAmount > 0;

      if (!hasValidAmount) {
        state.success = false;
        state.response_message =
          'Não foi informado o valor do link de pagamento. Qual valor você quer colocar no link? Exemplo: "criar link de 10 dólares".';
      } else {
        const url = this.buildPayAnyoneUrl({ amount, assetCode, receiveAssetCode, recipientName });
        state.pending_payment = undefined;
        state.success = true;
        const receiveText = receiveAssetCode && receiveAssetCode !== assetCode
          ? ` A pessoa recebe em ${receiveAssetCode}.`
          : '';
        state.response_message =
          `Claro. Para criar o link de pagamento de ${this.formatMoneyByAsset(amount, assetCode)}, abra:\n\n${url}\n\nNa página, confirme com seu PIN e copie o link para enviar.${receiveText}`;
      }
    }

    await this.repository.saveMessage(state.session_id, 'assistant', state.response_message);
    await this.repository.saveState(state.session_id, state);
    return state;
  }

  private shouldPreferLogin(state: AgentState): boolean {
    const forceLoggedOut = Boolean((state.action_params as any)?.force_logged_out);
    if (forceLoggedOut) return true;

    const email = String(state.session_data?.email || '').trim().toLowerCase();
    if (email && email !== 'unknown@example.com') return true;

    const userId = String(state.session_data?.user_id || '').trim().toLowerCase();
    if (userId && !userId.startsWith('user_')) return true;

    return false;
  }

  private formatMoneyByAsset(amount: string, assetCode: string): string {
    const n = Number(String(amount || '0').replace(',', '.'));
    if (!Number.isFinite(n)) return `${amount} ${assetCode}`;
    const upper = String(assetCode || '').toUpperCase();
    if (upper === 'BRL') return `R$ ${n.toFixed(2)}`;
    if (upper === 'USDC' || upper === 'USD') return `US$ ${n.toFixed(2)}`;
    if (upper === 'XLM') return 'saldo da carteira TalkToStellar';
    return `${n.toFixed(2)} ${upper || 'XLM'}`;
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
        '- Quando is_payment_link=true, não exija destinatário, contato ou chave pública.',
        '- recipient_query deve ser o nome, telefone, chave de transferência ou chave pública mais útil para identificar o destinatário.',
        '- Se a mensagem pedir para criar/gerar link de pagamento/transação sem destinatário explícito, use recipient_query vazio e needs_clarification false.',
        '- Link de pagamento/transação sem destinatário é Pay Anyone: não peça contato nem chave pública.',
        '- amount deve conter apenas o valor numérico, sem moeda.',
        '- asset_code deve ser o ativo que o usuário quer gastar/enviar (USDC, BRL ou XLM) quando houver moeda explícita; se o usuário disser USD, normalize para USDC.',
        '- receive_asset_code deve ser o ativo que o destinatário deve receber quando a mensagem disser "receber em BRL/USDC/XLM". Isso também vale para links de pagamento.',
        '- category deve ser um rótulo curto do motivo do pagamento quando o usuário mencionar um propósito (ex.: aluguel, mercado, família, trabalho, viagem).',
        '- memo deve ser um resumo curto e natural do pagamento quando houver contexto útil.',
        '- needs_clarification deve ser true somente se o destinatário ou o valor estiverem ambíguos.',
        '- clarification_question deve estar em pt-BR e curto quando needs_clarification for true.',
        '- Se não houver ambiguidades, clarification_question deve ser string vazia.',
        '',
        'Exemplos:',
        '- "quero mandar pra ana silva 3 usdc" => {"recipient_query":"Ana Silva","amount":"3","asset_code":"USDC","receive_asset_code":"","category":"","memo":"","is_payment_link":false,"needs_clarification":false,"clarification_question":""}',
        '- "quero mandar 10 usdc pra o Rodrigo receber em brl" => {"recipient_query":"Rodrigo","amount":"10","asset_code":"USDC","receive_asset_code":"BRL","category":"","memo":"","is_payment_link":false,"needs_clarification":false,"clarification_question":""}',
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
      state.response_message = this.getOnboardingOrLoginMessage(state, this.shouldPreferLogin(state));
      await this.repository.saveMessage(state.session_id, 'assistant', state.response_message);
      await this.repository.saveState(state.session_id, state);
      return state;
    }

    const llmParsed = await this.extractPaymentIntentWithLlm(state.current_input, state.session_data.user_id);
    const recipientQuery = String(llmParsed.recipient_query || '').trim();
    const amountInfo = this.normalizePaymentAmountAndAsset(
      String(llmParsed.amount || ''),
      llmParsed.asset_code
    );
    const amount = String(amountInfo.amount || '').trim();
    const assetCode = String(amountInfo.assetCode || '').trim().toUpperCase().replace(/^USD$/, 'USDC');
    const receiveAssetCode = String(llmParsed.receive_asset_code || assetCode)
      .trim()
      .toUpperCase()
      .replace(/^USD$/, 'USDC');

    if (llmParsed.is_payment_link) {
      return await this.handlePayAnyoneLinkRequest(state);
    }

    if (llmParsed.needs_clarification || !recipientQuery || !amount || !assetCode) {
      state.success = false;
      state.response_message = llmParsed.clarification_question || 'Me diga o destinatário, valor e moeda. Exemplo: mandar para Ana Silva 3 USDC.';
      await this.repository.saveMessage(state.session_id, 'assistant', state.response_message);
      await this.repository.saveState(state.session_id, state);
      return state;
    }

    const contact = await this.getContactByPublicKeyOrName(recipientQuery, state.session_data.user_id);
    const destination = String(
      contact?.stellar_public_key ||
      contact?.public_key ||
      (/^G[A-Z2-7]{55}$/i.test(recipientQuery) ? recipientQuery : '')
    ).trim();
    const destinationName = String(contact?.contact_name || contact?.name || recipientQuery).trim();

    if (!destination) {
      state.success = false;
      state.response_message = `Não encontrei ${recipientQuery} nos seus contatos. Me envie a chave pública ou salve esse contato antes de transferir.`;
      await this.repository.saveMessage(state.session_id, 'assistant', state.response_message);
      await this.repository.saveState(state.session_id, state);
      return state;
    }

    let quote: any = null;
    let confirmationAmount = amount;
    let confirmationAssetCode = assetCode;
    let sourceAmountForConfirmation: string | undefined;
    let sourceAssetCodeForConfirmation: string | undefined;
    let sourceAssetIssuerForConfirmation: string | undefined;

    if (receiveAssetCode && receiveAssetCode !== assetCode) {
      const sourceIssuer = getAssetIssuer(assetCode) || await this.resolveWalletAssetIssuer(state.session_data.public_key, assetCode);
      let destIssuer = getAssetIssuer(receiveAssetCode) || await this.resolveWalletAssetIssuer(destination, receiveAssetCode);
      if (receiveAssetCode !== 'XLM' && !destIssuer) {
        const trustlineResultRaw = await executeTool('ensure_trustline', {
          session_id: contact?.session_id,
          public_key: destination,
          asset_code: receiveAssetCode,
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

      const quoteRaw = await executeTool('quote_asset_transfer', {
        source_public_key: state.session_data.public_key,
        destination,
        source_amount: amount,
        source_asset_code: assetCode,
        source_asset_issuer: sourceIssuer,
        dest_asset_code: receiveAssetCode,
        dest_asset_issuer: destIssuer,
      });
      const quoteResult = JSON.parse(quoteRaw);
      if (!quoteResult.success) {
        state.success = false;
        state.response_message = `Não consegui cotar esse pagamento: ${quoteResult.error || 'erro desconhecido'}`;
        await this.repository.saveMessage(state.session_id, 'assistant', state.response_message);
        await this.repository.saveState(state.session_id, state);
        return state;
      }

      quote = quoteResult.quote;
      confirmationAmount = String(quote.destinationAmount || '').trim();
      confirmationAssetCode = receiveAssetCode;
      sourceAmountForConfirmation = amount;
      sourceAssetCodeForConfirmation = assetCode;
      sourceAssetIssuerForConfirmation = sourceIssuer;
    }

    const prepareRaw = await executeTool('prepare_payment_confirmation', {
      session_id: state.session_id,
      owner_id: state.session_data.user_id,
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
      memo: llmParsed.memo,
    });

    let prepare: any;
    try {
      prepare = JSON.parse(prepareRaw);
    } catch {
      prepare = { success: false, error: 'Failed to parse payment confirmation response' };
    }

    if (!prepare.success || !prepare.url) {
      state.success = false;
      state.response_message = `Não consegui gerar o link de confirmação do pagamento agora: ${prepare.error || 'erro desconhecido'}`;
    } else {
      state.pending_payment = undefined;
      state.success = true;
      state.response_message = receiveAssetCode !== assetCode
        ? `Cotação antes de confirmar: você envia ${this.formatMoneyByAsset(amount, assetCode)} e ${destinationName} recebe aproximadamente ${this.formatMoneyByAsset(confirmationAmount, confirmationAssetCode)}. Para confirmar, abra o link:\n\n${prepare.url}`
        : (prepare.message || `Para confirmar o envio de ${this.formatMoneyByAsset(amount, assetCode)} para ${destinationName}, abra o link:\n\n${prepare.url}`);
    }

    await this.repository.saveMessage(state.session_id, 'assistant', state.response_message);
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
        '- sourceAssetCode deve ser o ativo de origem (XLM, USDC, BRL ou outro ativo explícito).',
        '- destAssetCode deve ser o ativo de destino.',
        '- Se o usuário usar USD, normalize para USDC.',
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
        '{"sourceAmount":"10","sourceAssetCode":"USDC","destAssetCode":"XLM","needs_clarification":false,"clarification_question":""}',
      ].join('\n'),
    });

    const response = await this.llm.invoke([prompt]);
    const text = typeof response.content === 'string' ? response.content.trim() : JSON.stringify(response.content || {});

    try {
      const parsed = JSON.parse(text);
      return {
        sourceAmount: parsed.sourceAmount || parsed.amount,
        sourceAssetCode: String(parsed.sourceAssetCode || parsed.source_asset_code || parsed.asset_code || parsed.asset || '').toUpperCase().replace(/^USD$/, 'USDC') || undefined,
        destAssetCode: String(parsed.destAssetCode || parsed.dest_asset_code || parsed.to_asset_code || parsed.destination_asset || '').toUpperCase().replace(/^USD$/, 'USDC') || undefined,
        needs_clarification: Boolean(parsed.needs_clarification),
        clarification_question: parsed.clarification_question || '',
      };
    } catch {
      return {};
    }
  }

  private async prependContactsContext(messages: BaseMessage[], userId?: string): Promise<BaseMessage[]> {
    return messages;
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

  private async buildRuntimeContext(userId?: string, sessionId?: string): Promise<string> {
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

    const publicKey = String(sessionData?.public_key || walletData?.public_key || '').trim();
    const transferKey = String(sessionData?.pix_key || walletData?.pix_key || '').trim();
    const email = String(sessionData?.email || '').trim();
    const phoneNumber = String(sessionData?.phone_number || '').trim();
    const hasActiveWallet = Boolean(publicKey);
    const contactLines = contacts.slice(0, 12).map((contact: any, index: number) => {
      const name = String(contact.contact_name || contact.name || `Contato ${index + 1}`).trim();
      const key = String(contact.stellar_public_key || contact.public_key || '').trim();
      const contactTransferKey = String(contact.pix_key || '').trim();
      return `${index + 1}. ${name} | public_key=${key || 'indisponivel'} | transfer_key=${contactTransferKey || 'indisponivel'}`;
    });

    const pendingPayment = stateData?.pending_payment || (stateData?.action_params as any)?.pending_payment;
    const pendingConversion = stateData?.pending_conversion || (stateData?.action_params as any)?.pending_conversion;

    return [
      '## RUNTIME CONTEXT',
      `current_time=${new Date().toISOString()}`,
      `session_id=${normalizedSessionId || 'indisponivel'}`,
      `user_id=${resolvedUserId || 'indisponivel'}`,
      `session_active=${hasActiveWallet ? 'true' : 'false'}`,
      `wallet_public_key=${publicKey || 'indisponivel'}`,
      `wallet_public_key_display=${this.maskPublicKey(publicKey)}`,
      `transfer_key=${transferKey || publicKey || 'indisponivel'}`,
      `email=${email || 'indisponivel'}`,
      `phone_number=${phoneNumber || 'indisponivel'}`,
      `contacts_count=${contacts.length}`,
      contactLines.length ? `contacts:\n${contactLines.join('\n')}` : 'contacts=none',
      pendingPayment ? `pending_payment=${JSON.stringify(pendingPayment)}` : 'pending_payment=none',
      pendingConversion ? `pending_conversion=${JSON.stringify(pendingConversion)}` : 'pending_conversion=none',
      '',
      '## CONTEXT RULES',
      '- Treat RUNTIME CONTEXT as authoritative for this turn.',
      '- If session_active=true, never ask for user_id, session_id, or wallet public key. Use the provided session_id in tools.',
      '- If session_active=false, do not invent wallet data. Return the login/onboarding link flow.',
      '- For balances, contacts, history, payments, conversions, reset PIN, and logout, prefer tools over free text.',
      '- When a tool accepts session_id, pass exactly the session_id from RUNTIME CONTEXT.',
      '- When adding/listing contacts, use session_id and the contact key from the user message.',
      '- Never invent amounts, fees, quotes, hashes, contact names, or success states.',
      '',
      '## FEES AND SAVINGS UX',
      '- Talk about fees as transparent and controlled, using exact tool data when available.',
      '- When a quote or payment result has a fee, say it before confirmation in R$ and US$, never in XLM.',
      '- Do not claim savings without data. Prefer concise wording like "taxa baixa" only when backed by tool data.',
      '- For transfers/conversions, show the quote before confirmation without adding generic reassurance text.',
    ].join('\n');
  }

  private async invokeWithTools(
    messages: BaseMessage[],
    userId?: string,
    sessionId?: string,
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
      new SystemMessage({ content: await this.buildRuntimeContext(userId, sessionId) }),
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
      const systemPrompt = `You are an intent classifier for a TalkToStellar digital wallet assistant.
Analyze the user message and classify it into ONE of these intents:
login, onboard, wallet, wallet_logout, contacts, payment, payment_link, balance, history, financial_memory, conversion, price_quote, pix, or general

Respond ONLY with the intent name. Examples:
- "Check my balance" → balance
- "ver saldo" → balance
- "qual meu saldo atual?" → balance
- "see current balance" → balance
- "ver transações" → history
- "listar transações" → history
- "show transaction history" → history
- "see transactions list" → history
- "manda pro João de novo" → financial_memory
- "usa a mesma carteira de ontem" → financial_memory
- "quanto eu já converti esse mês?" → financial_memory
- "qual foi minha média de cotação?" → financial_memory
- "quanto recebi esse mês?" → financial_memory
- "quanto perdi em taxas?" → financial_memory
- "qual cliente mais me paga?" → financial_memory
- "quanto economizei comparado ao wise?" → financial_memory
- "seu saldo em reais perdeu 3% esse mes frente ao dolar" → financial_memory
- "deseja proteger parte do saldo?" → financial_memory
- "modo ai treasury" → financial_memory
- "melhor moeda e melhor momento para converter" → financial_memory
- "converter dolares para reais" → conversion
- "quero converter 3 usdc pra brl" → conversion
- "trocar 10 usdc por brl" → conversion
- "convert assets" → conversion
- "qual a cotação do dólar" → price_quote
- "cotação brl usdc agora" → price_quote
- "Send 100 XLM" → payment
- "quero mandar 10 usdc pra o Rodrigo receber em brl" → payment
- "quero criar um link de transacao de 10 usdc" → payment_link
- "gerar link de pagamento de 15 dólares" → payment_link
- "cria um link para alguém receber 20 usdc" → payment_link
- "rodrigobfcdog@gmail.com nos meus contatos" → contacts
- "Create account" → onboard
- "Create wallet" → wallet
- "I need a wallet" → wallet
- "Entrar na wallet" → wallet
- "Importar carteira existente" → wallet
- "Sair da wallet" → wallet_logout
- "Desconectar carteira" → wallet_logout

Prioritize 'payment_link' when the user asks to create/generate a payment/transaction link, especially when no recipient public key or saved contact is provided.
Prioritize 'wallet' for messages about creating/generating wallets, accounts, or getting started.
Prefer 'contacts' when the user asks about contact list, wallet contacts, favorites, or saved beneficiaries.`;

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
        general: IntentType.GENERAL,
      };

      const detectedIntent = intentMap[intentText] || IntentType.GENERAL;
      logger.debug(`Intent: "${message}" → ${detectedIntent}`);

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
        '- contact_key deve ser a chave pública, chave de transferência, e-mail, telefone, CPF ou identificador informado para salvar.',
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
    const rawMessage = String(toolResult?.message || '').trim();
    if (rawMessage) {
      return rawMessage;
    }

    const contact = toolResult?.contact || {};
    const profile = toolResult?.contact_profile || {};
    const lines = [
      contact.contact_name ? `Nome: ${contact.contact_name}` : null,
      contact.stellar_public_key ? `Chave pública: ${contact.stellar_public_key}` : null,
      profile.pix_key || contact.pix_key ? `Chave de transferência: ${profile.pix_key || contact.pix_key}` : null,
      profile.email ? `E-mail: ${profile.email}` : null,
      profile.phone_number ? `Telefone: ${profile.phone_number}` : null,
      profile.cpf ? `CPF: ${profile.cpf}` : null,
    ].filter(Boolean);

    return `Contato adicionado com sucesso.${lines.length ? `\n${lines.join('\n')}` : ''}`;
  }

  private async handleContactsRequest(state: AgentState): Promise<AgentState> {
    const contactIntent = await this.extractContactIntentWithLlm(state.current_input);
    const contactKey = String(contactIntent.contact_key || '').trim();

    if (contactIntent.needs_clarification) {
      state.success = false;
      state.response_message = contactIntent.clarification_question || 'Me diga qual contato você quer salvar ou listar.';
      await this.repository.saveMessage(state.session_id, 'assistant', state.response_message);
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
      await this.repository.saveMessage(state.session_id, 'assistant', state.response_message);
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
            const label = String(contact.display_label || contact.contact_name || contact.name || 'Contato').trim();
            const last = contact?.history?.last_amount_label ? ` | último envio: ${contact.history.last_amount_label}` : '';
            const freq = contact?.history?.tx_count ? ` | histórico: ${contact.history.tx_count} envio(s)` : '';
            return `${index + 1}. ${label}${last}${freq}`;
          }).join('\n')}`
        : 'Você ainda não tem destinatários salvos.';
    }

    await this.repository.saveMessage(state.session_id, 'assistant', state.response_message);
    await this.repository.saveState(state.session_id, state);
    return state;
  }

  private isOwnReceivingKeyRequest(message: string): boolean {
    const normalized = String(message || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();

    const selfRef = /\b(minha|minhas|meu|meus|my|da minha conta|da minha carteira)\b/.test(normalized);
    const keyRef =
      /\b(chave|chave pix|pix|public key|chave publica|chave pública|endereco|endereço)\b/.test(normalized);
    const transferRef = /\b(transfer|pagar|mandar|enviar|receber|depositar)\b/.test(normalized);

    return selfRef && keyRef && !transferRef;
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

      if (publicKey && !pixKey) {
        pixKey = publicKey;
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

    if (publicKey) {
      lines.push(`Chave pública da sua wallet: \`${publicKey}\``);
    }

    if (pixKey && pixKey !== publicKey) {
      lines.push(`Chave de recebimento: \`${pixKey}\``);
    }

    if (!lines.length) {
      return 'Não encontrei uma chave de recebimento vinculada à sua sessão atual.';
    }

    return lines.length === 1
      ? `Sua chave para receber é:\n${lines[0]}`
      : `Suas chaves para receber são:\n${lines.map((line, index) => `${index + 1}. ${line}`).join('\n')}`;
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
        state.response_message = `Você já possui uma carteira.

**Chave Pública (Public Key):**
\`${state.wallet_info.publicKey}\`

Sua carteira foi criada em ${state.wallet_info.createdAt}. Use sua chave pública para receber valores na sua carteira.`;
        state.success = true;
        await this.repository.saveMessage(
          state.session_id,
          "assistant",
          state.response_message
        );
        return state;
      }

      // Try to extract email or phone from the message
      const email = this.extractEmail(state.current_input);
      const phoneNumber = this.extractPhoneNumber(state.current_input);
      const secretKey = this.extractSecretKey(state.current_input);

      // If a secret key was provided, import/login an existing wallet
      if (secretKey) {
        const { UserService } = await import("../api/services/user.service");
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

        state.response_message = `Carteira importada com sucesso.

      **Chave Pública:**
      \`${walletResult.publicKey}\`

      Use sua chave pública para receber valores na sua carteira.`;
        state.success = true;

        await this.repository.saveMessage(
          state.session_id,
          "assistant",
          state.response_message
        );
        await this.repository.saveState(state.session_id, state);

        return state;
      }

      // If no email/phone provided, ask for it
      if (!email && !phoneNumber) {
        state.response_message = this.getOnboardingOrLoginMessage(state, this.shouldPreferLogin(state));
        state.waiting_for_wallet_input = true;
        state.action_params = {
          ...state.action_params,
          waiting_for_wallet_input: true,
        };
        state.success = true;
        await this.repository.saveMessage(
          state.session_id,
          "assistant",
          state.response_message
        );
        await this.repository.saveState(state.session_id, state);
        return state;
      }

      // Create wallet using the backend service
      const { UserService } = await import("../api/services/user.service");
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
      state.response_message = `Sua carteira foi criada com sucesso.

    **Chave Pública (pode compartilhar):**
\`${walletResult.publicKey}\`

Sua carteira foi criada no ambiente de testes e já recebeu saldo de teste.

    Use sua chave pública para receber valores na sua carteira.`;

      state.success = true;
      state.action_params = {
        ...state.action_params,
        created: true,
        force_logged_out: false,
        publicKey: walletResult.publicKey,
        wallet_info: state.wallet_info,
      };

      await this.repository.saveMessage(
        state.session_id,
        "assistant",
        state.response_message
      );
      await this.repository.saveState(state.session_id, state);

      return state;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`[Agent] Wallet creation failed: ${errorMessage}`);
      state.success = false;
      state.error = errorMessage;
      state.response_message = `Desculpe, houve um erro ao criar sua carteira: ${errorMessage}`;
      await this.repository.saveMessage(
        state.session_id,
        "assistant",
        state.response_message
      );
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

  private getLogoutConfirmationMessage(state?: AgentState): string {
    const base =
      process.env.FRONTEND_URL ||
      process.env.PUBLIC_APP_URL ||
      process.env.CREATE_ACCOUNT_BASE ||
      "http://localhost:3000";
    const normalizedBase = String(base).trim().replace(/\/$/, "");
    const logoutUrl = new URL(`${normalizedBase}/logout`);
    const externalProvider = String((state?.action_params as any)?.external_provider || '').trim().toLowerCase();
    const externalProviderUserId = String((state?.action_params as any)?.external_provider_user_id || '').trim();
    const sessionId = String(state?.session_id || '').trim();
    if (sessionId) logoutUrl.searchParams.set('session_id', sessionId);
    if (externalProvider) logoutUrl.searchParams.set('provider', externalProvider);
    if (externalProviderUserId) logoutUrl.searchParams.set('provider_user_id', externalProviderUserId);
    if (externalProvider) logoutUrl.searchParams.set('source', externalProvider);
    return `Para deslogar com segurança, abra esta página e confirme a saída:\n\n${logoutUrl.toString()}`;
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
      : 'Logout concluido. Você saiu da wallet atual com sucesso. Agora você pode criar ou importar outra carteira quando quiser.';

    await this.repository.saveMessage(state.session_id, 'assistant', state.response_message);
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

    const { StellarService } = await import('../api/services/stellar.service');

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
    state.response_message = `${this.formatMoneyByAsset(sentAmount, 'XLM')} enviados para ${destinationLabel} em poucos segundos.\nTaxa total: R$ 0,00\nRecibo disponível no seu histórico.`;
    return state;
  }

  private formatAssetLine(balance: any, index: number): string {
    const asset = balance.asset || balance.asset_code || 'UNKNOWN';
    const amount = balance.balance || '0';
    return `${index + 1}. ${asset}: ${amount}`;
  }

  private formatTransactionLine(transaction: any, index: number): string {
    const directionLabel =
      transaction.direction === 'sent' ? 'Enviado' :
      transaction.direction === 'received' ? 'Recebido' :
      'Relacionado';
    const amount = transaction.amount ? `${transaction.amount} ${transaction.asset || ''}`.trim() : transaction.type;
    const date = transaction.date ? new Date(transaction.date).toLocaleString('pt-BR') : 'data indisponível';
    const counterparty = String(transaction.counterparty || '').trim();
    const counterpartyLine = counterparty ? `\nCom: ${counterparty}` : '';
    return `${index + 1}. ${directionLabel}: ${amount}${counterpartyLine}\nData: ${date}`;
  }

  private async handleBalanceCheck(state: AgentState): Promise<AgentState> {
    if (!state.session_data?.public_key) {
      state.success = false;
      state.response_message = this.getOnboardingOrLoginMessage(state, this.shouldPreferLogin(state));
    } else {
      const wantsTechnicalBalance = this.wantsTechnicalBalance(state.current_input);
      const toolResultRaw = await executeTool(wantsTechnicalBalance ? 'get_saldo_tecnico' : 'get_balance', {
        public_key: state.session_data.public_key,
      });

      let toolResult: any;
      try {
        toolResult = JSON.parse(toolResultRaw);
      } catch {
        toolResult = { success: false, error: 'Failed to parse tool response' };
      }

      if (!toolResult.success) {
        state.success = false;
        state.response_message = `Não consegui consultar seu saldo agora: ${toolResult.error || 'erro desconhecido'}`;
      } else {
        const balances = Array.isArray(toolResult.balances) ? toolResult.balances : [];
        const byAsset = new Map<string, any>();
        for (const balance of balances) {
          byAsset.set(String(balance.asset || balance.asset_code || '').toUpperCase(), balance);
        }
        const exactBalances = wantsTechnicalBalance
          ? balances
          : ['BRL', 'USDC'].map((asset) => byAsset.get(asset) || { asset, balance: '0.0000000' });
        const formattedBalances = exactBalances.map((balance: any, index: number) => this.formatAssetLine(balance, index)).join('\n');

        state.success = true;
        state.response_message = wantsTechnicalBalance
          ? `Saldo técnico completo na Stellar:\n${formattedBalances}`
          : `Saldo na Stellar:\n${formattedBalances}\n\nPara ver o saldo técnico completo, peça "saldo técnico".`;
      }
    }

    await this.repository.saveMessage(state.session_id, 'assistant', state.response_message);
    await this.repository.saveState(state.session_id, state);
    return state;
  }

  private async handleHistoryCheck(state: AgentState): Promise<AgentState> {
    if (!state.session_data?.public_key) {
      state.success = false;
      state.response_message = this.getOnboardingOrLoginMessage(state, this.shouldPreferLogin(state));
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

        state.success = true;
        state.response_message = `Últimas transações da sua wallet:\n${formattedTransactions}`;
      }
    }

    await this.repository.saveMessage(state.session_id, 'assistant', state.response_message);
    await this.repository.saveState(state.session_id, state);
    return state;
  }

  private financialMemoryMode(message: string): 'repeat_payment' | 'monthly_conversion' | 'average_quote' | 'monthly_received' | 'monthly_fees' | 'top_payer' | 'wise_savings' | 'recipient_insights' | 'risk_alert' | 'treasury_advice' | 'summary' {
    const normalized = String(message || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
    if (/\b(de novo|novamente|again|mesma carteira|mesmo pagamento)\b/.test(normalized)) return 'repeat_payment';
    if (/\b(favoritos?|recorrente|recorrencia|recorrência|destinatarios|destinatários|clientes)\b/.test(normalized)) return 'recipient_insights';
    if (normalized.includes('quanto recebi') || normalized.includes('recebi esse mes') || normalized.includes('recebimentos do mes')) return 'monthly_received';
    if (normalized.includes('taxa') || normalized.includes('taxas')) return 'monthly_fees';
    if (normalized.includes('mais me paga') || normalized.includes('top cliente') || normalized.includes('top pagador')) return 'top_payer';
    if (normalized.includes('wise') || normalized.includes('economizei')) return 'wise_savings';
    if (normalized.includes('perdeu') && normalized.includes('dolar')) return 'risk_alert';
    if (normalized.includes('proteger parte do saldo') || normalized.includes('proteger saldo')) return 'risk_alert';
    if (normalized.includes('ai treasury') || normalized.includes('melhor moeda') || normalized.includes('melhor momento') || normalized.includes('manter brl ou usd') || normalized.includes('otimizar convers') || normalized.includes('previsao de gasto') || normalized.includes('previsão de gasto')) return 'treasury_advice';
    if (normalized.includes('media') && (normalized.includes('cotacao') || normalized.includes('cambio'))) return 'average_quote';
    if (normalized.includes('mes') || normalized.includes('este mes') || normalized.includes('mês')) return 'monthly_conversion';
    return 'summary';
  }

  private extractRepeatCounterparty(message: string): string {
    const normalized = String(message || '').trim();
    const match = normalized.match(/\b(?:pro|pra|para|ao|a)\s+(.+?)\s+(?:de novo|novamente|again)\b/i);
    return match?.[1]?.trim() || '';
  }

  private async handleFinancialMemoryRequest(state: AgentState): Promise<AgentState> {
    const mode = this.financialMemoryMode(state.current_input);
    const contactName = mode === 'repeat_payment' ? this.extractRepeatCounterparty(state.current_input) : '';
    const memoryRaw = await executeTool('get_financial_memory', {
      session_id: state.session_id,
      user_id: state.session_data?.user_id,
      mode,
      contact_name: contactName,
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
      await this.repository.saveMessage(state.session_id, 'assistant', state.response_message);
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
        await this.repository.saveMessage(state.session_id, 'assistant', state.response_message);
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
      await this.repository.saveMessage(state.session_id, 'assistant', state.response_message);
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
    await this.repository.saveMessage(state.session_id, 'assistant', state.response_message);
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
    const normalizedAssetCode = assetCode.toUpperCase();
    if (normalizedAssetCode === 'XLM') {
      return undefined;
    }

    const toolResultRaw = await executeTool('get_saldo_tecnico', { public_key: publicKey });
    const toolResult = JSON.parse(toolResultRaw);
    const balances = Array.isArray(toolResult?.balances) ? toolResult.balances : [];
    const balance = balances.find((item: any) => String(item.asset || item.asset_code || '').toUpperCase() === normalizedAssetCode);

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
      await this.repository.saveMessage(state.session_id, 'assistant', state.response_message);
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
      state.response_message = `Não consegui converter os ativos: ${toolResult.error || 'erro desconhecido'}`;
    } else {
      state.success = true;
      state.response_message = toolResult.message || 'Conversão concluída em poucos segundos. Recibo disponível no seu histórico.';
    }

    await this.repository.saveMessage(state.session_id, 'assistant', state.response_message);
    await this.repository.saveState(state.session_id, state);
    return state;
  }

  private wantsTechnicalBalance(message: string): boolean {
    const normalized = String(message || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();

    return (
      normalized.includes('saldo tecnico') ||
      normalized.includes('saldo completo') ||
      normalized.includes('detalhe da conta') ||
      normalized.includes('balanco tecnico') ||
      normalized.includes('balance technical')
    );
  }

  private async handleAssetConversion(state: AgentState): Promise<AgentState> {
    if (!state.session_data?.public_key) {
      state.success = false;
      state.response_message = this.getOnboardingOrLoginMessage(state, this.shouldPreferLogin(state));
    } else {
      const llmParsed = await this.extractConversionIntentWithLlm(state.current_input);
      const finalSourceAmount = String(llmParsed.sourceAmount || '').trim();
      const finalSourceAssetCode = String(llmParsed.sourceAssetCode || '').trim().toUpperCase().replace(/^USD$/, 'USDC');
      const finalDestAssetCode = String(llmParsed.destAssetCode || '').trim().toUpperCase().replace(/^USD$/, 'USDC');

      if (!finalSourceAmount || !finalSourceAssetCode || !finalDestAssetCode) {
        state.success = false;
        state.response_message = llmParsed.needs_clarification && llmParsed.clarification_question
          ? llmParsed.clarification_question
          : 'Me diga a conversão neste formato: converter 10 dólares para reais.';
      } else {
        const sourceIssuer = await this.resolveWalletAssetIssuer(state.session_data.public_key, finalSourceAssetCode);
        let destIssuer = await this.resolveWalletAssetIssuer(state.session_data.public_key, finalDestAssetCode);

        if (finalSourceAssetCode !== 'XLM' && !sourceIssuer) {
          state.success = false;
          state.response_message = `Não encontrei ${finalSourceAssetCode} na sua wallet para usar como ativo de origem.`;
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
                state.response_message = `Não consegui ativar recebimento em ${finalDestAssetCode}: ${trustlineResult.error || 'erro desconhecido'}`;
                await this.repository.saveMessage(state.session_id, 'assistant', state.response_message);
                await this.repository.saveState(state.session_id, state);
                return state;
              }
            } catch {
              state.success = false;
              state.response_message = `Não consegui ativar recebimento em ${finalDestAssetCode} agora.`;
              await this.repository.saveMessage(state.session_id, 'assistant', state.response_message);
              await this.repository.saveState(state.session_id, state);
              return state;
            }
          }

          if (finalDestAssetCode !== 'XLM' && !destIssuer) {
            state.success = false;
            state.response_message = `Não encontrei recebimento em ${finalDestAssetCode} ativo na sua carteira. Ative esse recebimento antes de converter.`;
          } else {
          const toolResultRaw = await executeTool('quote_asset_transfer', {
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
            state.response_message = `Não consegui cotar essa conversão: ${toolResult.error || 'erro desconhecido'}`;
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
            });

            let conversionPrepare: any;
            try {
              conversionPrepare = JSON.parse(conversionPrepareRaw);
            } catch {
              conversionPrepare = { success: false, error: 'Failed to parse conversion confirmation response' };
            }

            if (!conversionPrepare.success || !conversionPrepare.url) {
              state.success = false;
              state.response_message = `Não consegui gerar um link de confirmação para a conversão agora: ${conversionPrepare.error || 'erro desconhecido'}`;
            } else {
              state.pending_conversion = undefined;
              state.success = true;
              const sourceLabel = this.formatMoneyByAsset(finalSourceAmount, finalSourceAssetCode);
              const destLabel = this.formatMoneyByAsset(conversionDestAmount, finalDestAssetCode);
              state.response_message =
                `${toolResult.message}\n\nPara confirmar a conversão de ${sourceLabel} para aproximadamente ${destLabel}, abra o link:\n\n${conversionPrepare.url}`;
            }
          }
          }
        }
        }
      }

    await this.repository.saveMessage(state.session_id, 'assistant', state.response_message);
    await this.repository.saveState(state.session_id, state);
    return state;
  }

  private async handlePriceQuoteRequest(state: AgentState): Promise<AgentState> {
    const toolResultRaw = await executeTool('get_brl_usdc_quote', {});
    let toolResult: any;
    try {
      toolResult = JSON.parse(toolResultRaw);
    } catch {
      toolResult = { success: false, error: 'Failed to parse quote response' };
    }

    if (!toolResult.success) {
      state.success = false;
      state.response_message = `Não consegui consultar a cotação agora: ${toolResult.error || 'erro desconhecido'}`;
    } else {
      const brlPerUsdc = Number(toolResult.brl_per_usdc);
      const usdcPerBrl = Number(toolResult.usdc_per_brl);
      const brlLabel = Number.isFinite(brlPerUsdc) ? brlPerUsdc.toFixed(4) : String(toolResult.brl_per_usdc);
      const usdcLabel = Number.isFinite(usdcPerBrl) ? usdcPerBrl.toFixed(8) : String(toolResult.usdc_per_brl);
      state.success = true;
      state.response_message =
        `Cotação agora: 1 USDC = R$ ${brlLabel}.\n` +
        `Inverso: 1 BRL = US$ ${usdcLabel}.\n` +
        `Fonte: ${String(toolResult.source || 'mercado').toUpperCase()} (${toolResult.symbol || 'USDCBRL'}).`;
    }

    await this.repository.saveMessage(state.session_id, 'assistant', state.response_message);
    await this.repository.saveState(state.session_id, state);
    return state;
  }

  /**
   * Process user input through the agent
   */
  async processInput(state: AgentState, _config?: RunnableConfig): Promise<AgentState> {
    try {
      logger.info(`[Agent] Processing for session: ${state.session_id}`);

      // Resume wallet creation flow when waiting for user contact input (email/phone)
      if (state.waiting_for_wallet_input) {
        state.action_type = ActionType.CREATE_WALLET;
        state.detected_intent = IntentType.WALLET;
        return await this.handleWalletCreation(state);
      }

      state.detected_intent = this.isPaymentLinkRequest(state.current_input)
        ? IntentType.PAYMENT_LINK
        : await this.detectIntent(state.current_input, state.session_data?.user_id);
      state.action_type = this.mapIntentToAction(state.detected_intent);

      await this.repository.saveMessage(
        state.session_id,
        "user",
        this.sanitizeUserMessage(state.current_input)
      );

      const hasActiveWallet = Boolean(String(state.session_data?.public_key || '').trim());
      const onboardingIntents = new Set<IntentType>([
        IntentType.WALLET,
        IntentType.ONBOARD,
        IntentType.LOGIN,
        IntentType.PRICE_QUOTE,
      ]);

      if (!hasActiveWallet && !onboardingIntents.has(state.detected_intent)) {
        state.success = false;
        state.response_message = this.getOnboardingOrLoginMessage(state, this.shouldPreferLogin(state));
        await this.repository.saveMessage(state.session_id, "assistant", state.response_message);
        await this.repository.saveState(state.session_id, state);
        return state;
      }

      if (state.action_type === ActionType.CREATE_WALLET && !hasActiveWallet) {
        return await this.handleWalletCreation(state);
      }

      if (hasActiveWallet && this.isOwnReceivingKeyRequest(state.current_input)) {
        const { publicKey, pixKey } = await this.resolveOwnReceivingKeys(state);
        state.response_message = this.formatOwnReceivingKeys(publicKey, pixKey);
        state.success = true;
        await this.repository.saveMessage(state.session_id, "assistant", state.response_message);
        await this.repository.saveState(state.session_id, state);
        return state;
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
        state.response_message = this.getLogoutConfirmationMessage(state);
        await this.repository.saveMessage(state.session_id, "assistant", state.response_message);
        await this.repository.saveState(state.session_id, state);
        return state;
      }

      if (state.action_type === ActionType.LIST_CONTACTS) {
        return await this.handleContactsRequest(state);
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
          new SystemMessage({ content: this.systemPrompt }),
          ...conversationHistory,
          new HumanMessage({ content: state.current_input }),
        ];

        // Invoke LLM with system prompt containing guidelines and mandatory contacts context
        const responseContent = await this.invokeWithTools(preMessages, state.session_data?.user_id, state.session_id);

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
          state.session_data?.user_id
        );
        state.success = true;
      }

      // Save assistant message
      await this.repository.saveMessage(
        state.session_id,
        "assistant",
        state.response_message
      );

      // Save state
      await this.repository.saveState(state.session_id, state);

      return state;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`[Agent] Error: ${errorMessage}`);
      state.success = false;
      state.error = errorMessage;
      state.response_message =
        "Desculpe, houve um erro ao processar sua mensagem. Tente novamente.";
      return state;
    }

  }

  private async generateSimpleResponse(
    input: string,
    previousMessages: Array<{ role: "user" | "assistant"; content: string }>,
    userId?: string
  ): Promise<string> {
    try {
      const messages = [
        new SystemMessage({
          content: this.systemPrompt,
        }),
        ...previousMessages.slice(-3).map((m) =>
          m.role === "user"
            ? new HumanMessage({ content: m.content })
            : new AIMessage({ content: m.content })
        ),
        new HumanMessage({ content: input }),
      ];

      const response = await this.llm.invoke(messages);
      return response.content as string;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`[Agent] Fallback response generation failed: ${errorMessage}`);
      return "Desculpe, não consegui processar sua mensagem.";
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
