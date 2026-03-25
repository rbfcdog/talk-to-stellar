/**
 * LangChain Agent with Tool Support for TalkToStellar
 * Handles intent detection, tool calling, and response generation
 */

import { RunnableConfig } from "@langchain/core/runnables";
import { ChatOpenAI } from "@langchain/openai";
import { HumanMessage, AIMessage, BaseMessage } from "@langchain/core/messages";
import { AgentState, IntentType, ActionType } from "./types";
import { AgentRepository } from "../repositories/agent.repository";
import { ALL_TOOLS, executeTool } from "./tools";
import { logger } from "../utils/logger";

export class AgentGraph {
  private llm: ChatOpenAI;
  private repository: AgentRepository;

  constructor(repository: AgentRepository, openaiApiKey: string) {
    this.repository = repository;
    this.llm = new ChatOpenAI({
      openAIApiKey: openaiApiKey,
      temperature: parseFloat(process.env.TEMPERATURE || "0.5"),
      modelName: process.env.OPENAI_MODEL || "gpt-4o",
    });

    logger.info("Agent initialized with Stellar tools available");
  }

  /**
   * Detect user intent from message using LLM
   */
  private async detectIntent(message: string): Promise<IntentType> {
    try {
      const systemPrompt = `You are an intent classifier for a Stellar blockchain assistant.
Analyze the user message and classify it into ONE of these intents:
login, onboard, wallet, wallet_logout, contacts, payment, balance, history, pix, or general

Respond ONLY with the intent name. Examples:
- "Check my balance" → balance
- "Send 100 XLM" → payment
- "Create account" → onboard
- "Create wallet" → wallet
- "I need a wallet" → wallet
- "Entrar na wallet" → wallet
- "Importar carteira com chave privada" → wallet
- "Sair da wallet" → wallet_logout
- "Desconectar carteira" → wallet_logout

Prioritize 'wallet' for messages about creating/generating wallets, accounts, or getting started.`;

      const response = await this.llm.invoke([
        new HumanMessage({ content: systemPrompt }),
        new HumanMessage({ content: message }),
      ]);

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
          secretKey,
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

Você entrou na carteira usando sua chave privada.

**Chave Pública:**
\`${walletResult.publicKey}\`

Por segurança, não vou exibir sua chave privada novamente.`;
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
        state.response_message = `Para criar ou entrar na sua carteira Stellar, envie uma destas opções:

1️⃣ **Email:** Seu endereço de e-mail
2️⃣ **Telefone:** Seu número de telefone com DDD (ex: +55 11 999999999)
3️⃣ **Chave privada (secret key):** para entrar/importar uma carteira existente

Por favor, envie uma dessas informações para continuarmos!`;
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
        secretKey: walletResult.secretKey,
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

      // Prepare response with wallet info and CRITICAL warning about private key
      state.response_message = `Sua carteira foi criada com sucesso.

    **Chave Pública (pode compartilhar):**
\`${walletResult.publicKey}\`

    **IMPORTANTE - SUA CHAVE PRIVADA (GUARDE COM SEGURANÇA):**
\`${walletResult.secretKey}\`

    **AVISO CRÍTICO:**
- Esta é sua CHAVE PRIVADA - NUNCA compartilhe!
- Qualquer pessoa com essa chave pode acessar sua carteira
- Salve em um local seguro (anotador, cofre digital, etc)
- Você vai precisar desta chave para assinar transações
- Esta chave será mantida nesta conversa por segurança

Sua carteira foi criada na rede de testes do Stellar e já recebeu 10.000 XLM para testes!

Digite \`entendi\` para confirmar que guardou sua chave privada com segurança.`;

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
      (normalized.includes('sair') || normalized.includes('logout') || normalized.includes('desconectar')) &&
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

  private parsePaymentRequest(text: string): { amount?: string; recipientRaw?: string } {
    const regex = /(?:enviar|envie|send)\s+(\d+(?:[\.,]\d+)?)\s*xlm?.*?(?:para|pra|to)\s+(.+)/i;
    const match = text.match(regex);
    if (!match) return {};

    return {
      amount: match[1].replace(',', '.'),
      recipientRaw: match[2].trim(),
    };
  }

  private async resolveRecipientPublicKey(
    state: AgentState,
    recipientRaw: string
  ): Promise<{ publicKey?: string; displayName?: string }> {
    if (/^G[A-Z2-7]{55}$/.test(recipientRaw)) {
      return { publicKey: recipientRaw, displayName: recipientRaw };
    }

    const contactsRaw = await executeTool('list_contacts', {
      user_id: state.session_data?.user_id,
    });

    let contactsResult: any;
    try {
      contactsResult = JSON.parse(contactsRaw);
    } catch {
      return {};
    }

    const contacts = contactsResult?.contacts || [];
    const normalizedTarget = recipientRaw.toLowerCase();

    const found = contacts.find((c: any) =>
      String(c.contact_name || c.name || '').toLowerCase() === normalizedTarget
    ) || contacts.find((c: any) =>
      String(c.contact_name || c.name || '').toLowerCase().includes(normalizedTarget)
    );

    if (!found) return {};

    return {
      publicKey: found.public_key || found.stellar_public_key,
      displayName: found.contact_name || found.name,
    };
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

      // Resume wallet creation flow when waiting for user contact input (email/phone)
      if (state.waiting_for_wallet_input) {
        state.action_type = ActionType.CREATE_WALLET;
        state.detected_intent = IntentType.WALLET;
        return await this.handleWalletCreation(state);
      }

      // Detect intent
      state.detected_intent = await this.detectIntent(state.current_input);
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

      if (state.action_type === ActionType.BUILD_PAYMENT) {
        const parsed = this.parsePaymentRequest(state.current_input);

        if (!parsed.amount || !parsed.recipientRaw) {
          state.success = false;
          state.response_message = 'Para enviar, use: enviar 50 XLM para Nome do contato.';
        } else {
          const recipient = await this.resolveRecipientPublicKey(state, parsed.recipientRaw);

          if (!recipient.publicKey) {
            state.success = false;
            state.response_message = `Não encontrei o contato "${parsed.recipientRaw}".`;
          } else if (!state.session_data?.public_key) {
            state.success = false;
            state.response_message = 'Você precisa entrar em uma wallet antes de enviar pagamentos.';
          } else {
            state.pending_payment = {
              destination: recipient.publicKey,
              destination_name: recipient.displayName,
              amount: parsed.amount,
              asset_code: 'XLM',
            };
            state.success = true;
            state.response_message = `Para confirmar o envio de ${parsed.amount} XLM para ${recipient.displayName || parsed.recipientRaw}, envie sua chave secreta.`;
          }
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

        const systemMessage = `You are a helpful AI assistant for Stellar blockchain payments.
Help users manage their blockchain accounts, send payments, view balances, and manage contacts.
Always respond in Portuguese (Brazilian Portuguese preferred).
      Do not use emojis in your responses.
Be concise and friendly.

You have access to these tools for Stellar operations:
${ALL_TOOLS.map((t) => `- ${t.name}: ${t.description}`).join("\n")}

When users request information or actions, respond with concrete results or clear next input needed.`;

        // Invoke LLM
        const response = await this.llm.invoke([
          new HumanMessage({ content: systemMessage }),
          ...conversationHistory,
          new HumanMessage({ content: state.current_input }),
        ]);

        // Extract text response
        const responseContent = typeof response.content === "string" 
          ? response.content 
          : typeof response.content === "object" && response.content !== null
          ? JSON.stringify(response.content)
          : "Unable to process request";
        
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
          state.messages
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

  /**
   * Fallback: Generate simple response without tools
   */
  private async generateSimpleResponse(
    input: string,
    previousMessages: Array<{ role: "user" | "assistant"; content: string }>
  ): Promise<string> {
    try {
      const messages = [
        new HumanMessage({
          content: `You are a helpful Stellar blockchain assistant. Respond in Portuguese. Do not use emojis.`,
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
