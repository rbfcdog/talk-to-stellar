/**
 * LangChain Agent with Tool Support for TalkToStellar
 * Handles intent detection, tool calling, and response generation
 */

import { RunnableConfig } from "@langchain/core/runnables";
import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage, AIMessage, ToolMessage, BaseMessage } from "@langchain/core/messages";
import { AgentState, IntentType, ActionType } from "./types";
import { AgentRepository } from "../repositories/agent.repository";
import { ALL_TOOLS, executeTool } from "./tools";
import { logger } from "../utils/logger";
import ExternalService from '../services/external.service';
import { supabase } from '../config/supabase';


export class AgentGraph {
  private llm: ChatOpenAI;
  private repository: AgentRepository;
  private systemPrompt: string;

  constructor(repository: AgentRepository, openaiApiKey: string, systemPrompt: string) {
    this.repository = repository;
    this.systemPrompt = systemPrompt;
    this.llm = new ChatOpenAI({
      openAIApiKey: openaiApiKey,
      temperature: parseFloat(process.env.TEMPERATURE || "0.5"),
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

      const byPix = contacts.find((c: any) => String(c.pix_key || '').trim().toLowerCase() === normalizedQuery);
      if (byPix) {
        return byPix;
      }

      return contacts.find((c: any) =>
        String(c.contact_name || c.name || '').trim().toLowerCase() === normalizedQuery
      );
    } catch (error) {
      logger.debug(`[getContactByPublicKeyOrName] Error: ${error}`);
      return undefined;
    }
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

    const assetMatches = amountText.match(/\b(USDC|USD|BRL|XLM)\b/gi) || [];
    const normalizedAsset = assetMatches.length > 0
      ? String(assetMatches[0]).toUpperCase().replace(/^USD$/, 'USDC')
      : (hinted ? hinted.replace(/^USD$/, 'USDC') : undefined);

    const numericMatch = amountText.match(/[0-9]+(?:\.[0-9]+)?/);
    const cleanedAmount = numericMatch
      ? numericMatch[0]
      : amountText.replace(/\b(USDC|USD|BRL|XLM)\b/gi, '').trim();

    return {
      amount: cleanedAmount,
      assetCode: normalizedAsset,
    };
  }

  private getOnboardingOrLoginMessage(): string {
    const base =
      process.env.CREATE_ACCOUNT_BASE ||
      process.env.FRONTEND_URL ||
      process.env.PUBLIC_APP_URL ||
      "http://localhost:3000";
    const normalizedBase = String(base).trim().replace(/\/$/, "");
    const onboardingUrl = `${normalizedBase}/create-account`;

    return `Você precisa entrar na sua conta para continuar.

Abra este link para criar conta ou entrar em uma conta existente:
${onboardingUrl}`;
  }

  private async extractPaymentIntentWithLlm(userMessage: string, userId?: string): Promise<{
    recipient_query?: string;
    amount?: string;
    asset_code?: string;
    category?: string;
    memo?: string;
    needs_clarification?: boolean;
    clarification_question?: string;
  }> {
    const prompt = new HumanMessage({
      content: [
        'Extraia apenas o intento de pagamento em JSON válido, sem markdown e sem texto extra.',
        'Regras:',
        '- recipient_query deve ser o nome, telefone, PIX ou chave pública mais útil para identificar o destinatário.',
        '- amount deve conter apenas o valor numérico, sem moeda.',
        '- asset_code deve ser USDC, BRL ou XLM quando houver moeda explícita; se o usuário disser USD, normalize para USDC.',
        '- category deve ser um rótulo curto do motivo do pagamento quando o usuário mencionar um propósito (ex.: aluguel, mercado, família, trabalho, viagem).',
        '- memo deve ser um resumo curto e natural do pagamento quando houver contexto útil.',
        '- needs_clarification deve ser true somente se o destinatário ou o valor estiverem ambíguos.',
        '- clarification_question deve estar em pt-BR e curto quando needs_clarification for true.',
        '- Se não houver ambiguidades, clarification_question deve ser string vazia.',
        '',
        `Mensagem do usuário: ${userMessage}`,
        '',
        'Formato esperado:',
        '{"recipient_query":"Ana Silva","amount":"10","asset_code":"USDC","category":"aluguel","memo":"Pagamento do aluguel de maio","needs_clarification":false,"clarification_question":""}',
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
        category: parsed.category || parsed.reason || parsed.purpose,
        memo: parsed.memo || parsed.note || parsed.description,
        needs_clarification: Boolean(parsed.needs_clarification),
        clarification_question: parsed.clarification_question || '',
      };
    } catch {
      return {};
    }
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

    let conversation = messages;

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
      const keywordIntent = this.detectIntentByKeyword(message);
      if (keywordIntent) {
        logger.debug(`Intent keyword match: "${message}" → ${keywordIntent}`);
        return keywordIntent;
      }

      const systemPrompt = `You are an intent classifier for a TalkToStellar digital wallet assistant.
Analyze the user message and classify it into ONE of these intents:
login, onboard, wallet, wallet_logout, contacts, payment, balance, history, conversion, pix, or general

Respond ONLY with the intent name. Examples:
- "Check my balance" → balance
- "ver saldo" → balance
- "qual meu saldo atual?" → balance
- "see current balance" → balance
- "ver transações" → history
- "listar transações" → history
- "show transaction history" → history
- "see transactions list" → history
- "converter USDC para XLM" → conversion
- "trocar 10 USDC por XLM" → conversion
- "convert assets" → conversion
- "Send 100 XLM" → payment
- "Create account" → onboard
- "Create wallet" → wallet
- "I need a wallet" → wallet
- "Entrar na wallet" → wallet
- "Importar carteira com chave privada" → wallet
- "Sair da wallet" → wallet_logout
- "Desconectar carteira" → wallet_logout

Prioritize 'wallet' for messages about creating/generating wallets, accounts, or getting started.
Prefer 'contacts' when the user asks about contact list, wallet contacts, favorites, or saved beneficiaries.`;

      const response = await this.llm.invoke(await this.prependContactsContext([
        new HumanMessage({ content: systemPrompt }),
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
        balance: IntentType.BALANCE,
        history: IntentType.HISTORY,
        conversion: IntentType.CONVERSION,
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

  private detectIntentByKeyword(message: string): IntentType | undefined {
    const normalized = message
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();

    const balanceWords = ['saldo', 'balance', 'balanco', 'quanto tenho', 'quanto eu tenho'];
    if (balanceWords.some((word) => normalized.includes(word))) {
      return IntentType.BALANCE;
    }

    const historyWords = ['historico', 'extrato', 'transacao', 'transacoes', 'transactions', 'transaction history', 'activity'];
    if (historyWords.some((word) => normalized.includes(word))) {
      return IntentType.HISTORY;
    }

    const conversionWords = ['converter', 'conversao', 'converter asset', 'trocar', 'swap', 'convert'];
    if (conversionWords.some((word) => normalized.includes(word))) {
      return IntentType.CONVERSION;
    }

    // PIN reset intent
    const pinResetWords = ['redefinir pin', 'resetar pin', 'esqueci pin', 'esqueci o pin', 'mudar pin', 'alterar pin', 'change pin', 'reset pin', 'forgot pin', 'pin reset'];
    if (pinResetWords.some((word) => normalized.includes(word))) {
      return IntentType.GENERAL; // Will be handled by LLM with tools available
    }

    return undefined;
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

Sua carteira foi criada em ${state.wallet_info.createdAt}. Use sua chave pública para receber XLM.`;
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
          created: true,
          publicKey: walletResult.publicKey,
          wallet_info: state.wallet_info,
        };

        if (state.session_data) {
          state.session_data.public_key = walletResult.publicKey;
          await this.repository.saveSession(state.session_id, state.session_data);
        }

        state.response_message = `Carteira importada com sucesso.

      Sua chave privada foi armazenada com segurança no Vault.

      **Chave Pública:**
      \`${walletResult.publicKey}\`

      Use sua chave pública para receber XLM.`;
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
        state.response_message = this.getOnboardingOrLoginMessage();
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
      };

      // Update session with public key
      if (state.session_data) {
        state.session_data.public_key = walletResult.publicKey;
        await this.repository.saveSession(state.session_id, state.session_data);
      }

        // Prepare response with wallet info and Vault-backed secret storage notice
      state.response_message = `Sua carteira foi criada com sucesso.

    **Chave Pública (pode compartilhar):**
\`${walletResult.publicKey}\`

      **SUA CHAVE PRIVADA FOI ARMAZENADA COM SEGURANÇA NO VAULT:**
    -- Ela não será exibida nesta conversa
    -- O backend pode recuperá-la com segurança quando necessário
    -- Use sua chave pública para receber XLM

Sua carteira foi criada na rede de testes do Stellar e já recebeu 10.000 XLM para testes!

    Digite \`entendi\` para confirmar que entendeu que a chave está armazenada com segurança.`;

      state.success = true;
      state.action_params = {
        ...state.action_params,
        created: true,
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

  private wantsLogoutWallet(text: string): boolean {
    const normalized = text.toLowerCase();
    return (
      (normalized.includes('sair') || normalized.includes('logout') || normalized.includes('desconectar') || normalized.includes('deslogar')) &&
      (normalized.includes('wallet') || normalized.includes('carteira'))
    );
  }

  private async handleWalletLogout(state: AgentState): Promise<AgentState> {
    state.wallet_info = undefined;
    state.waiting_for_wallet_input = false;
    state.pending_payment = undefined;
    state.action_params = {
      ...state.action_params,
      wallet_info: undefined,
      waiting_for_wallet_input: false,
    };

    if (state.session_data) {
      state.session_data.public_key = undefined;
      await this.repository.saveSession(state.session_id, state.session_data);
    }

    state.success = true;
    state.response_message = 'Você saiu da wallet atual com sucesso. Agora você pode criar ou importar outra carteira quando quiser.';

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
    state.response_message = `Pagamento enviado com sucesso.\n\nValor: ${sentAmount} XLM\nDestino: ${destinationLabel}\nHash: ${submit.hash}`;
    return state;
  }

  private formatAssetLine(balance: any, index: number): string {
    const asset = balance.asset || balance.asset_code || 'UNKNOWN';
    const amount = balance.balance || '0';
    const values = [balance.display_value?.usdc, balance.display_value?.brl].filter(Boolean).join(' / ');

    return values
      ? `${index + 1}. ${amount} ${asset} (${values})`
      : `${index + 1}. ${amount} ${asset}`;
  }

  private formatTransactionLine(transaction: any, index: number): string {
    const directionLabel =
      transaction.direction === 'sent' ? 'Enviado' :
      transaction.direction === 'received' ? 'Recebido' :
      'Relacionado';
    const amount = transaction.amount ? `${transaction.amount} ${transaction.asset || ''}`.trim() : transaction.type;
    const values = [transaction.display_value?.usdc, transaction.display_value?.brl].filter(Boolean).join(' / ');
    const date = transaction.date ? new Date(transaction.date).toLocaleString('pt-BR') : 'data indisponível';
    const hash = transaction.hash ? `\nHash: ${transaction.hash}` : '';

    return values
      ? `${index + 1}. ${directionLabel}: ${amount} (${values})\nData: ${date}${hash}`
      : `${index + 1}. ${directionLabel}: ${amount}\nData: ${date}${hash}`;
  }

  private async handleBalanceCheck(state: AgentState): Promise<AgentState> {
    if (!state.session_data?.public_key) {
      state.success = false;
      state.response_message = this.getOnboardingOrLoginMessage();
    } else {
      const toolResultRaw = await executeTool('get_balance', {
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
        const formattedBalances = balances.length > 0
          ? balances.map((balance: any, index: number) => this.formatAssetLine(balance, index)).join('\n')
          : 'Nenhum saldo encontrado.';

        state.success = true;
        state.response_message = `Saldo atual da sua wallet:\n${formattedBalances}`;
      }
    }

    await this.repository.saveMessage(state.session_id, 'assistant', state.response_message);
    await this.repository.saveState(state.session_id, state);
    return state;
  }

  private async handleHistoryCheck(state: AgentState): Promise<AgentState> {
    if (!state.session_data?.public_key) {
      state.success = false;
      state.response_message = this.getOnboardingOrLoginMessage();
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

  private isConfirmationMessage(text: string): boolean {
    const normalized = text
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();

    return ['sim', 'confirmo', 'confirmar', 'pode converter', 'converter', 'yes', 'confirm'].includes(normalized);
  }

  private parseConversionRequest(text: string): { sourceAmount?: string; sourceAssetCode?: string; destAssetCode?: string } {
    const normalized = text.replace(',', '.');
    const match = normalized.match(/(?:converter|conversao|trocar|swap|convert)\s+(\d+(?:\.\d+)?)\s*([a-zA-Z]{2,12})\s+(?:para|por|to|em|into)\s+([a-zA-Z]{2,12})/i);

    if (!match) {
      return {};
    }

    return {
      sourceAmount: match[1],
      sourceAssetCode: match[2].toUpperCase(),
      destAssetCode: match[3].toUpperCase(),
    };
  }

  private async resolveWalletAssetIssuer(publicKey: string, assetCode: string): Promise<string | undefined> {
    const normalizedAssetCode = assetCode.toUpperCase();
    if (normalizedAssetCode === 'XLM') {
      return undefined;
    }

    const toolResultRaw = await executeTool('get_balance', { public_key: publicKey });
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
      state.response_message = toolResult.message || `Conversão concluída. Hash: ${toolResult.hash}`;
    }

    await this.repository.saveMessage(state.session_id, 'assistant', state.response_message);
    await this.repository.saveState(state.session_id, state);
    return state;
  }

  private async handleAssetConversion(state: AgentState): Promise<AgentState> {
    if (!state.session_data?.public_key) {
      state.success = false;
      state.response_message = this.getOnboardingOrLoginMessage();
    } else {
      const llmParsed = await this.extractConversionIntentWithLlm(state.current_input);
      const parsed = llmParsed.sourceAmount && llmParsed.sourceAssetCode && llmParsed.destAssetCode
        ? llmParsed
        : this.parseConversionRequest(state.current_input);

      const finalSourceAmount = String(parsed.sourceAmount || '').trim();
      const finalSourceAssetCode = String(parsed.sourceAssetCode || '').trim().toUpperCase().replace(/^USD$/, 'USDC');
      const finalDestAssetCode = String(parsed.destAssetCode || '').trim().toUpperCase().replace(/^USD$/, 'USDC');

      if (!finalSourceAmount || !finalSourceAssetCode || !finalDestAssetCode) {
        state.success = false;
        state.response_message = llmParsed.needs_clarification && llmParsed.clarification_question
          ? llmParsed.clarification_question
          : 'Me diga a conversão neste formato: converter 10 USDC para XLM.';
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
                state.response_message = `Não consegui criar a trustline de ${finalDestAssetCode}: ${trustlineResult.error || 'erro desconhecido'}`;
                await this.repository.saveMessage(state.session_id, 'assistant', state.response_message);
                await this.repository.saveState(state.session_id, state);
                return state;
              }
            } catch {
              state.success = false;
              state.response_message = `Não consegui criar a trustline de ${finalDestAssetCode} agora.`;
              await this.repository.saveMessage(state.session_id, 'assistant', state.response_message);
              await this.repository.saveState(state.session_id, state);
              return state;
            }
          }

          if (finalDestAssetCode !== 'XLM' && !destIssuer) {
            state.success = false;
            state.response_message = `Não encontrei trustline de ${finalDestAssetCode} na sua wallet. Para receber esse ativo, a wallet precisa ter uma trustline antes.`;
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
            state.pending_conversion = {
              source_asset_code: finalSourceAssetCode,
              source_asset_issuer: sourceIssuer,
              source_amount: finalSourceAmount,
              dest_asset_code: finalDestAssetCode,
              dest_asset_issuer: destIssuer,
              dest_amount: toolResult.quote?.destinationAmount,
              quote: toolResult.quote,
            };
            state.success = true;
            state.response_message =
              `${toolResult.message}\n\nConfirme para executar a conversão interna. Responda "confirmar" para converter ou qualquer outra coisa para cancelar.`;
          }
          }
        }
        }
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

      const incomingSecret = this.extractSecretKey(state.current_input);

      if (this.wantsLogoutWallet(state.current_input)) {
        state.action_type = ActionType.LOGOUT_WALLET;
        state.detected_intent = IntentType.WALLET_LOGOUT;
        return await this.handleWalletLogout(state);
      }

      if (state.pending_payment && incomingSecret) {
        state = await this.executePendingPaymentWithSecret(state, incomingSecret);
        await this.repository.saveMessage(
          state.session_id,
          'assistant',
          state.response_message
        );
        await this.repository.saveState(state.session_id, state);
        return state;
      }

      if (state.pending_conversion) {
        return await this.handlePendingConversionConfirmation(state);
      }

      // Resume wallet creation flow when waiting for user contact input (email/phone)
      if (state.waiting_for_wallet_input) {
        state.action_type = ActionType.CREATE_WALLET;
        state.detected_intent = IntentType.WALLET;
        return await this.handleWalletCreation(state);
      }

      // Detect intent
      state.detected_intent = await this.detectIntent(state.current_input, state.session_data?.user_id);
      state.action_type = this.mapIntentToAction(state.detected_intent);

      // Save user message (with sensitive data masked)
      await this.repository.saveMessage(
        state.session_id,
        "user",
        this.sanitizeUserMessage(state.current_input)
      );

      // Handle wallet creation as a special flow
      if (state.action_type === ActionType.CREATE_WALLET) {
        return await this.handleWalletCreation(state);
      }

      // Execute contacts listing tool directly
      if (state.action_type === ActionType.LIST_CONTACTS) {
        const toolResultRaw = await executeTool("list_contacts", {
          user_id: state.session_data?.user_id,
        });

        let toolResult: any;
        try {
          toolResult = JSON.parse(toolResultRaw);
        } catch {
          toolResult = { success: false, error: "Failed to parse tool response" };
        }

        if (!toolResult.success) {
          state.response_message = `Não consegui listar seus contatos agora: ${toolResult.error || 'erro desconhecido'}`;
          state.success = false;
        } else {
          const contacts = toolResult.contacts || [];
          if (contacts.length === 0) {
            state.response_message = "Você ainda não tem contatos salvos.";
          } else {
            const formatted = contacts
              .map((c: any, idx: number) => `${idx + 1}. ${c.contact_name || c.name} - ${c.stellar_public_key || c.public_key}`)
              .join("\n");
            state.response_message = `Seus contatos salvos:\n${formatted}`;
          }
          state.success = true;
        }

        await this.repository.saveMessage(
          state.session_id,
          "assistant",
          state.response_message
        );
        await this.repository.saveState(state.session_id, state);
        return state;
      }

      if (state.action_type === ActionType.GET_BALANCE) {
        return await this.handleBalanceCheck(state);
      }

      if (state.action_type === ActionType.GET_HISTORY) {
        return await this.handleHistoryCheck(state);
      }

      if (state.action_type === ActionType.CONVERT_ASSETS) {
        return await this.handleAssetConversion(state);
      }

      if (state.action_type === ActionType.BUILD_PAYMENT) {
        if (!state.session_data?.public_key) {
          state.success = false;
          state.response_message = this.getOnboardingOrLoginMessage();
        } else {
          const paymentIntent = await this.extractPaymentIntentWithLlm(state.current_input, state.session_data.user_id);

          if (paymentIntent.needs_clarification) {
            state.response_message = paymentIntent.clarification_question || 'Preciso de mais detalhes para confirmar esse pagamento.';
          } else if (!paymentIntent.recipient_query || !paymentIntent.amount) {
            state.response_message = 'Não consegui identificar claramente o destinatário e o valor. Pode me dizer de novo em uma frase mais direta?';
          } else {
            const requestedAssetCode = String(paymentIntent.asset_code || 'XLM').toUpperCase().replace(/^USD$/, 'USDC');
            const amountStr = String(paymentIntent.amount).trim();
            const sessionId = state.session_id;

            const destinationContact = await this.getContactByPublicKeyOrName(paymentIntent.recipient_query, state.session_data?.user_id);
            const destinationName = destinationContact?.contact_name || destinationContact?.name || paymentIntent.recipient_query || 'destinatário';
            const resolvedDestination = destinationContact?.stellar_public_key || destinationContact?.public_key || paymentIntent.recipient_query;

            const normalizedPayment = this.normalizePaymentAmountAndAsset(amountStr, requestedAssetCode);
            const finalAmount = normalizedPayment.amount || amountStr;
            const finalAssetCode = normalizedPayment.assetCode || requestedAssetCode;

            const toolResult = await executeTool('prepare_payment_confirmation', {
              amount: finalAmount,
              destination: resolvedDestination,
              destination_name: destinationName,
              destination_contact: destinationContact,
              session_id: sessionId,
              owner_id: state.session_data.user_id,
              source_public_key: state.session_data.public_key,
              asset: finalAssetCode,
              category: paymentIntent.category,
              memo: paymentIntent.memo,
            });

            let toolResultParsed: any;
            try {
              toolResultParsed = JSON.parse(toolResult);
            } catch {
              toolResultParsed = { success: false, error: 'Failed to parse tool result' };
            }

            if (toolResultParsed.success && toolResultParsed.url) {
              const assetLabel = String(toolResultParsed.asset || finalAssetCode || 'XLM').toUpperCase();
              state.response_message = `Para confirmar o envio de ${finalAmount} ${assetLabel} para ${destinationName}, abra o link de confirmação:\n\n${toolResultParsed.url}`;
              if (toolResultParsed.quote) {
                const quote = toolResultParsed.quote;
                const loss = quote?.conversionLoss || {};
                state.response_message += `\n\nCotação estimada:\n- Você envia aprox.: ${quote.sourceAmount} ${quote.sourceAsset?.code || 'XLM'}\n- Destino recebe: ${quote.destinationAmount} ${quote.destinationAsset?.code || assetLabel}\n- Taxa de rede: ${quote.networkFeeXlm} XLM\n- Perda estimada: ${loss.lostBrl ?? 'n/d'} BRL / ${loss.lostUsdc ?? 'n/d'} USDC (${loss.lostPercent ?? 'n/d'}%)`;
              }
            } else {
              const toolError = String(toolResultParsed.error || toolResultParsed.message || '').trim();
              state.response_message = toolError
                ? `Não consegui gerar um link de confirmação válido agora. Detalhe: ${toolError}`
                : 'Não consegui gerar um link de confirmação válido agora. Tente novamente informando valor e destinatário com mais precisão.';
            }
          }

          state.success = true;
        }

        await this.repository.saveMessage(
          state.session_id,
          'assistant',
          state.response_message
        );
        await this.repository.saveState(state.session_id, state);
        return state;
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
          new HumanMessage({ content: this.systemPrompt }),
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
        new HumanMessage({
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
      [IntentType.BALANCE]: ActionType.GET_BALANCE,
      [IntentType.HISTORY]: ActionType.GET_HISTORY,
      [IntentType.CONVERSION]: ActionType.CONVERT_ASSETS,
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
