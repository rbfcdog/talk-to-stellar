import { supabase } from '../../../config/supabase';
import { AgentRepository } from '../../repository/core/agent.repository';
import { logger } from '../../../utils/logger';
import { formatCustomerAssetAmount } from '../../../utils/fee-display';
import { EvolutionService } from '../evolution.service';

type ExternalMapping = {
  provider?: string | null;
  provider_user_id?: string | null;
  data?: Record<string, any> | null;
};

type WhatsAppDeliveryAttempt = {
  phone_tail: string;
  instance: string;
  delivered: boolean;
  error?: string;
};

type WhatsAppDeliveryReport = {
  attempted: boolean;
  delivered: number;
  recipients: number;
  instances: string[];
  attempts: WhatsAppDeliveryAttempt[];
  skipped_reason?: string;
};

export type ExternalChannelMessageDeliveryReport = {
  whatsapp: WhatsAppDeliveryReport;
};

export type IncomingTransferNotification = {
  recipientSessionId?: string | null;
  recipientUserId?: string | null;
  senderLabel?: string | null;
  amount: string;
  assetCode: string;
  sourceAmount?: string | null;
  sourceAssetCode?: string | null;
  hash?: string | null;
};

export type SessionWelcomeNotification = {
  sessionId?: string | null;
  userId?: string | null;
  name?: string | null;
  provider?: string | null;
  providerUserId?: string | null;
  language?: string | null;
};

export type OnboardingConversionNotification = {
  sessionId?: string | null;
  userId?: string | null;
  name?: string | null;
  provider?: string | null;
  providerUserId?: string | null;
  sourceAmount?: string | null;
  destinationAmount?: string | null;
  keepXlm?: string | number | null;
};

export type SessionLogoutNotification = {
  sessionId?: string | null;
  userId?: string | null;
  provider?: string | null;
  providerUserId?: string | null;
};

export type ExternalChannelMessageNotification = {
  sessionId?: string | null;
  userId?: string | null;
  provider?: string | null;
  providerUserId?: string | null;
  text: string;
  buttonText?: string | null;
  buttonUrl?: string | null;
};

export type ExternalChannelImageNotification = {
  sessionId?: string | null;
  userId?: string | null;
  provider?: string | null;
  providerUserId?: string | null;
  caption?: string | null;
  svg: string;
  filename?: string | null;
};

export class TransferNotificationService {
  private static agentRepo = new AgentRepository(supabase);

  private static normalizeReceiptLinkCopy(text: string, fallbackUrl?: string | null): string {
    const url = String(fallbackUrl || '').trim();
    let normalized = String(text || '').replace(/\r\n/g, '\n').trim();
    if (!normalized) return '';

    normalized = normalized.replace(
      /((?:Comprovante|Receipt)(?:\s+PDF)?):\s*(?:\n\s*)?(?:Abrir link|Open link)?\s*(?:\n\s*)?(https?:\/\/[^\s]+)/gi,
      (_match, label, foundUrl) => `${String(label || '').replace(/\s+PDF/i, '')}: ${String(foundUrl || '').replace(/[.,;]+$/, '')}`,
    );

    if (url) {
      normalized = normalized.replace(
        /((?:Comprovante|Receipt)(?:\s+PDF)?):\s*(?:\n\s*)?(?:Abrir link|Open link)?\s*(?=\n|$)/gi,
        (_match, label) => `${String(label || '').replace(/\s+PDF/i, '')}: ${url}`,
      );
    }

    normalized = normalized
      .replace(/(?:^|\n)\s*(?:Comprovante|Receipt)(?:\s+PDF)?:\s*(?:Abrir link|Open link)?\s*(?=\n|$)/gi, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

    return normalized;
  }

  private static normalizeLanguage(value?: string | null): 'pt-BR' | 'en' {
    const normalized = String(value || '').trim().toLowerCase();
    if (normalized === 'en' || normalized.startsWith('en-') || normalized.includes('english')) return 'en';
    return 'pt-BR';
  }

  private static text(language: 'pt-BR' | 'en', pt: string, en: string): string {
    return language === 'en' ? en : pt;
  }

  static async notifySessionWelcome(input: SessionWelcomeNotification): Promise<void> {
    const sessionId = String(input.sessionId || '').trim();
    if (!sessionId) return;

    const session = await this.safeGetSession(sessionId);
    const userId = String(input.userId || session?.user_id || '').trim();
    const name = String(input.name || session?.email || '').trim();
    const directMapping = this.buildDirectMapping(input.provider, input.providerUserId);
    const language = this.normalizeLanguage(input.language || (session as any)?.language || (session as any)?.preferred_language);
    const mappings = this.dedupeMappings([
      ...(directMapping ? [directMapping] : []),
      ...(await this.findExternalMappings(sessionId, userId)),
    ]);
    const hasTelegram = mappings.some((mapping) => String(mapping.provider || '').toLowerCase() === 'telegram');
    const greeting = name
      ? this.text(language, `Bem-vindo, ${name}.`, `Welcome, ${name}.`)
      : hasTelegram
        ? this.text(language, 'Bem-vindo ao TalkToStellar no Telegram.', 'Welcome to TalkToStellar on Telegram.')
        : this.text(language, 'Bem-vindo ao TalkToStellar.', 'Welcome to TalkToStellar.');
    const text = this.text(
      language,
      `${greeting}\n` +
        `Conta conectada.\n\n` +
        `Primeiros passos recomendados:\n` +
        `1) Traga dinheiro para a conta: digite "colocar 100 reais via PIX". Eu gero um link com QR, taxa por fora e valor final antes do PIN.\n` +
        `2) Confira o saldo recebido: digite "saldo".\n` +
        `3) Faça a primeira ação: digite "converter 50 reais para dólar", "enviar 10 XLM para Ana" ou "ver rendimentos".\n` +
        `4) Depois acompanhe tudo: digite "histórico" para ver operações e comprovantes.\n\n` +
        `Se você só quiser começar rápido, mande: "colocar 100 reais via PIX".\n` +
        `Nada movimenta dinheiro sem abrir a tela de confirmação e digitar seu PIN.\n\n` +
        `You can switch TalkToStellar to English anytime by saying "English".`,
      `${greeting}\n` +
        `Account connected.\n\n` +
        `Recommended first steps:\n` +
        `1) Bring money in: type "add 100 reais with PIX". I generate a link with QR, outside fee, and final amount before PIN.\n` +
        `2) Check the received balance: type "balance".\n` +
        `3) Try your first action: type "convert 50 reais to dollars", "send 10 XLM to Ana", or "see investments".\n` +
        `4) Track everything: type "history" to see operations and receipts.\n\n` +
        `If you want the fastest start, send: "add 100 reais with PIX".\n` +
        `No money moves without opening the confirmation screen and entering your PIN.\n\n` +
        `Você pode mudar o TalkToStellar para português quando quiser dizendo "Português".`
    );

    try {
      await this.agentRepo.saveMessageOnce(
        sessionId,
        'assistant',
        text,
        `session_intro:${sessionId}`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn(`[session-welcome] failed to save chat message: ${message}`);
    }

    const [, whatsappReport] = await Promise.all([
      this.sendTelegramToMappings(mappings, text),
      this.sendWhatsAppToMappings(mappings, session?.phone_number, text),
    ]);

    if (whatsappReport.attempted && whatsappReport.delivered === 0) {
      logger.warn(`[session-welcome] WhatsApp delivery attempted but not delivered: ${JSON.stringify(whatsappReport)}`);
    }
  }

  static async notifyOnboardingConversion(input: OnboardingConversionNotification): Promise<void> {
    const sessionId = String(input.sessionId || '').trim();
    if (!sessionId) return;
    return;
  }

  static async notifySessionLogout(input: SessionLogoutNotification): Promise<void> {
    const sessionId = String(input.sessionId || '').trim();
    if (!sessionId) return;

    const session = await this.safeGetSession(sessionId);
    const userId = String(input.userId || session?.user_id || '').trim();
    const directMapping = this.buildDirectMapping(input.provider, input.providerUserId);
    const mappings = this.dedupeMappings([
      ...(directMapping ? [directMapping] : []),
      ...(await this.findExternalMappings(sessionId, userId)),
    ]);
    const text = 'Logout concluído. Sua conta foi desconectada deste canal.';

    try {
      await this.agentRepo.saveMessage(sessionId, 'assistant', text);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn(`[session-logout] failed to save chat message: ${message}`);
    }

    await Promise.all([
      this.sendTelegramToMappings(mappings, text),
      this.sendWhatsAppToMappings(mappings, session?.phone_number, text),
    ]);
  }

  static async notifyIncomingTransfer(input: IncomingTransferNotification): Promise<void> {
    const recipientSessionId = String(input.recipientSessionId || '').trim();
    if (!recipientSessionId) return;

    const session = await this.safeGetSession(recipientSessionId);
    const recipientUserId = String(input.recipientUserId || session?.user_id || '').trim();
    const rawSenderLabel = String(input.senderLabel || 'Alguem').trim();
    const senderLabel = /^G[A-Z2-7]{55}$/i.test(rawSenderLabel)
      ? (await this.resolveHumanLabel({ publicKey: rawSenderLabel, sessionId: recipientSessionId, userId: recipientUserId })) || 'Alguem'
      : rawSenderLabel;
    const receivedLabel = formatCustomerAssetAmount(input.amount, input.assetCode);
    const sourceLine = input.sourceAmount && input.sourceAssetCode && input.sourceAssetCode !== input.assetCode
      ? `Valor de origem: ${formatCustomerAssetAmount(input.sourceAmount, input.sourceAssetCode)}\n`
      : '';
    const text =
      `${receivedLabel} recebidos em poucos segundos.\n` +
      sourceLine +
      `De: ${senderLabel}\n` +
      `Recibo disponível no seu histórico.`;

    try {
      await this.agentRepo.saveMessage(recipientSessionId, 'assistant', text);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn(`[incoming-transfer] failed to save recipient chat message: ${message}`);
    }

    const mappings = await this.findExternalMappings(recipientSessionId, recipientUserId);
    await Promise.all([
      this.sendTelegramToMappings(mappings, text),
      this.sendWhatsAppToMappings(mappings, session?.phone_number, text),
    ]);
  }

  static async notifyExternalChannelMessage(input: ExternalChannelMessageNotification): Promise<ExternalChannelMessageDeliveryReport> {
    const sessionId = String(input.sessionId || '').trim();
    const text = this.normalizeReceiptLinkCopy(input.text, input.buttonUrl);
    const directMapping = this.buildDirectMapping(input.provider, input.providerUserId);
    const session = sessionId ? await this.safeGetSession(sessionId) : null;
    const userId = String(input.userId || session?.user_id || '').trim();
    const mappings = this.dedupeMappings([
      ...(directMapping ? [directMapping] : []),
      ...(sessionId || userId ? await this.findExternalMappings(sessionId, userId) : []),
    ]);
    const [, whatsapp] = await Promise.all([
      this.sendTelegramToMappings(mappings, text, {
        buttonText: input.buttonText,
        buttonUrl: input.buttonUrl,
      }),
      this.sendWhatsAppToMappings(mappings, session?.phone_number, text),
    ]);
    return { whatsapp };
  }

  static async notifyExternalChannelImage(input: ExternalChannelImageNotification): Promise<void> {
    const sessionId = String(input.sessionId || '').trim();
    const directMapping = this.buildDirectMapping(input.provider, input.providerUserId);
    const session = sessionId ? await this.safeGetSession(sessionId) : null;
    const userId = String(input.userId || session?.user_id || '').trim();
    const mappings = this.dedupeMappings([
      ...(directMapping ? [directMapping] : []),
      ...(sessionId || userId ? await this.findExternalMappings(sessionId, userId) : []),
    ]);

    await Promise.all([
      this.sendTelegramImageToMappings(
        mappings,
        input.svg,
        String(input.caption || '').trim(),
        String(input.filename || 'recibo-talktostellar.svg').trim()
      ),
      this.sendWhatsAppToMappings(
        mappings,
        session?.phone_number,
        `${String(input.caption || 'Comprovante gerado.').trim()}\n\nImagem do recibo disponível no chat web.`
      ),
    ]);
  }

  private static async safeGetSession(sessionId: string): Promise<any | null> {
    try {
      return await this.agentRepo.getSession(sessionId);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn(`[incoming-transfer] failed to load recipient session: ${message}`);
      return null;
    }
  }

  private static async findExternalMappings(sessionId: string, userId?: string): Promise<ExternalMapping[]> {
    try {
      let sessionMappings: ExternalMapping[] = [];
      if (sessionId) {
        const bySession = await supabase
          .from('external_accounts')
          .select('provider, provider_user_id, data')
          .eq('session_id', sessionId);

        if (bySession.error) throw bySession.error;
        sessionMappings = bySession.data || [];
      }
      if (!userId) return sessionMappings;

      const byUser = await supabase
        .from('external_accounts')
        .select('provider, provider_user_id, data')
        .eq('user_id', userId);

      if (byUser.error) throw byUser.error;
      return this.dedupeMappings([
        ...sessionMappings,
        ...(byUser.data || []),
      ]);
    } catch (error: any) {
      const message = String(error?.message || error || '').toLowerCase();
      if (message.includes('external_accounts') || message.includes('schema cache') || message.includes('does not exist')) {
        return [];
      }
      logger.warn(`[incoming-transfer] failed to query external mappings: ${error?.message || String(error)}`);
      return [];
    }
  }

  static async resolveHumanLabel(input: {
    publicKey?: string | null;
    sessionId?: string | null;
    userId?: string | null;
  }): Promise<string | undefined> {
    const publicKey = String(input.publicKey || '').trim();
    const sessionId = String(input.sessionId || '').trim();
    const userId = String(input.userId || '').trim();

    const pickLabel = (name?: string | null, email?: string | null, phone?: string | null) => {
      const normalizedName = String(name || '').trim();
      const normalizedEmail = String(email || '').trim();
      const normalizedPhone = String(phone || '').trim();
      return normalizedName || normalizedEmail || normalizedPhone || undefined;
    };

    if (sessionId) {
      try {
        const session = await this.safeGetSession(sessionId);
        const label = pickLabel(session?.name, session?.email, session?.phone_number);
        if (label) return label;
      } catch {
        // ignore
      }
    }

    if (userId) {
      try {
        const { data: sessionByUser } = await supabase
          .from('agent_sessions')
          .select('email, phone_number')
          .eq('user_id', userId)
          .limit(1)
          .maybeSingle();
        const sessionLabel = pickLabel(sessionByUser?.email, sessionByUser?.phone_number);
        if (sessionLabel) return sessionLabel;
      } catch {
        // ignore
      }
    }

    if (publicKey) {
      try {
        const { data: walletByKey } = await supabase
          .from('wallets')
          .select('name, pix_key, session_id')
          .eq('public_key', publicKey)
          .limit(1)
          .maybeSingle();
        const walletLabel = pickLabel(walletByKey?.name, walletByKey?.pix_key);
        if (walletLabel) return walletLabel;

        const { data: contactByKey } = await supabase
          .from('contacts')
          .select('contact_name, pix_key, phone_number')
          .eq('stellar_public_key', publicKey)
          .limit(1)
          .maybeSingle();
        const contactLabel = pickLabel(contactByKey?.contact_name, contactByKey?.pix_key, contactByKey?.phone_number);
        if (contactLabel) return contactLabel;

        const { data: sessionByKey } = await supabase
          .from('agent_sessions')
          .select('email, phone_number')
          .eq('public_key', publicKey)
          .limit(1)
          .maybeSingle();
        const sessionLabel = pickLabel(sessionByKey?.email, sessionByKey?.phone_number);
        if (sessionLabel) return sessionLabel;
      } catch {
        // ignore
      }
    }

    return undefined;
  }

  private static buildDirectMapping(provider?: string | null, providerUserId?: string | null): ExternalMapping | null {
    const normalizedProviderUserId = String(providerUserId || '').trim();
    if (!normalizedProviderUserId) return null;
    const rawProvider = String(provider || '').trim().toLowerCase();
    const normalizedProvider = this.normalizeDeliveryProvider(rawProvider, normalizedProviderUserId);
    if (!normalizedProvider) return null;
    return {
      provider: normalizedProvider,
      provider_user_id: normalizedProviderUserId,
    };
  }

  private static normalizeDeliveryProvider(provider: string, providerUserId?: string | null): string {
    const normalizedProvider = String(provider || '').trim().toLowerCase();
    if (normalizedProvider === 'phone') return 'whatsapp';
    if (['telegram', 'whatsapp', 'evolution', 'whatsapp_evolution'].includes(normalizedProvider)) {
      return normalizedProvider;
    }

    const digits = this.normalizeWhatsAppDigits(providerUserId);
    if (digits && digits.length >= 10 && digits.length <= 15 && (digits.startsWith('55') || normalizedProvider === 'chat')) {
      return 'whatsapp';
    }

    return '';
  }

  private static dedupeMappings(mappings: ExternalMapping[]): ExternalMapping[] {
    const byKey = new Map<string, ExternalMapping>();
    for (const mapping of mappings) {
      const provider = String(mapping.provider || '').trim().toLowerCase();
      const providerUserId = String(mapping.provider_user_id || '').trim();
      const key = `${provider}:${providerUserId}`;
      if (!provider || !providerUserId) continue;

      const normalized: ExternalMapping = {
        ...mapping,
        provider,
        provider_user_id: providerUserId,
      };
      const existing = byKey.get(key);
      if (!existing) {
        byKey.set(key, normalized);
        continue;
      }

      const existingData = existing.data || {};
      const incomingData = normalized.data || {};
      const mergedData = {
        ...existingData,
        ...incomingData,
      };

      byKey.set(key, {
        provider: existing.provider || normalized.provider,
        provider_user_id: existing.provider_user_id || normalized.provider_user_id,
        data: Object.keys(mergedData).length > 0 ? mergedData : existing.data || normalized.data || null,
      });
    }

    return Array.from(byKey.values());
  }

  private static async sendTelegramToMappings(
    mappings: ExternalMapping[],
    text: string,
    options?: { buttonText?: string | null; buttonUrl?: string | null }
  ): Promise<void> {
    const telegramIds = Array.from(new Set(
      mappings
        .filter((mapping) => String(mapping.provider || '').toLowerCase() === 'telegram')
        .map((mapping) => this.telegramChatId(mapping))
        .filter(Boolean)
    ));

    if (telegramIds.length === 0) return;

    const notifyUrl = String(process.env.TELEGRAM_NOTIFY_URL || '').trim();
    const botToken = String(process.env.TELEGRAM_BOT_TOKEN || '').trim();
    if (!notifyUrl && !botToken) {
      logger.warn('[telegram-notify] skipped: set TELEGRAM_NOTIFY_URL or TELEGRAM_BOT_TOKEN in the backend environment');
      return;
    }

    await Promise.all(telegramIds.map(async (chatId) => {
      if (notifyUrl) {
        const delivered = await this.sendTelegramViaNotifyUrl(notifyUrl, chatId, text, options);
        if (delivered) return;
      }

      if (!botToken) return;

      try {
        const buttonText = String(options?.buttonText || '').trim();
        const buttonUrl = String(options?.buttonUrl || '').trim();
        const replyMarkup =
          buttonText && buttonUrl
            ? {
                inline_keyboard: [[{ text: buttonText, url: buttonUrl }]],
              }
            : undefined;
        const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatId,
            text,
            ...(replyMarkup ? { reply_markup: replyMarkup } : {}),
          }),
        });
        if (!response.ok) {
          const payload = await response.text().catch(() => '');
          logger.warn(`[incoming-transfer] telegram sendMessage failed status=${response.status} body=${payload}`);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.warn(`[incoming-transfer] telegram send failed: ${message}`);
      }
    }));
  }

  private static async sendTelegramImageToMappings(
    mappings: ExternalMapping[],
    svg: string,
    caption: string,
    filename: string
  ): Promise<void> {
    const telegramIds = Array.from(new Set(
      mappings
        .filter((mapping) => String(mapping.provider || '').toLowerCase() === 'telegram')
        .map((mapping) => this.telegramChatId(mapping))
        .filter(Boolean)
    ));

    if (telegramIds.length === 0) return;

    const notifyUrl = String(process.env.TELEGRAM_NOTIFY_URL || '').trim();
    const botToken = String(process.env.TELEGRAM_BOT_TOKEN || '').trim();
    if (!notifyUrl && !botToken) {
      logger.warn('[telegram-notify] skipped image: set TELEGRAM_NOTIFY_URL or TELEGRAM_BOT_TOKEN in the backend environment');
      return;
    }

    const imageSvgBase64 = Buffer.from(svg, 'utf-8').toString('base64');

    await Promise.all(telegramIds.map(async (chatId) => {
      if (notifyUrl) {
        const delivered = await this.sendTelegramImageViaNotifyUrl(notifyUrl, chatId, {
          imageSvgBase64,
          caption,
          filename,
        });
        if (delivered) return;
      }

      if (!botToken) return;

      try {
        const form = new FormData();
        form.set('chat_id', chatId);
        if (caption) form.set('caption', caption);
        form.set('document', new Blob([svg], { type: 'image/svg+xml' }), filename);
        const response = await fetch(`https://api.telegram.org/bot${botToken}/sendDocument`, {
          method: 'POST',
          body: form,
        });
        if (!response.ok) {
          const payload = await response.text().catch(() => '');
          logger.warn(`[telegram-notify] sendDocument failed status=${response.status} body=${payload}`);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.warn(`[telegram-notify] sendDocument failed: ${message}`);
      }
    }));
  }

  private static telegramChatId(mapping: ExternalMapping): string {
    const data = (mapping.data || {}) as Record<string, unknown>;
    return String(
      data.telegram_chat_id ||
      data.chat_id ||
      data.telegramChatId ||
      mapping.provider_user_id ||
      ''
    ).trim();
  }

  private static async sendTelegramImageViaNotifyUrl(
    notifyUrl: string,
    chatId: string,
    input: { imageSvgBase64: string; caption?: string; filename?: string }
  ): Promise<boolean> {
    const secret = String(process.env.TELEGRAM_NOTIFY_SECRET || process.env.INTERNAL_API_SECRET || '').trim();
    const caption = String(input.caption || 'Comprovante TalkToStellar').trim();
    const safeCaption = caption.length > 1000 ? `${caption.slice(0, 997).trimEnd()}...` : caption;
    try {
      const response = await fetch(notifyUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(secret ? { Authorization: `Bearer ${secret}` } : {}),
        },
        body: JSON.stringify({
          chat_id: chatId,
          text: safeCaption,
          image_svg_base64: input.imageSvgBase64,
          filename: input.filename || 'recibo-talktostellar.svg',
          disable_web_page_preview: true,
        }),
      });

      if (response.ok) return true;

      const payload = await response.text().catch(() => '');
      logger.warn(`[telegram-notify] image notify URL failed status=${response.status} body=${payload}`);
      return false;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn(`[telegram-notify] image notify URL request failed: ${message}`);
      return false;
    }
  }

  private static async sendTelegramViaNotifyUrl(
    notifyUrl: string,
    chatId: string,
    text: string,
    options?: { buttonText?: string | null; buttonUrl?: string | null }
  ): Promise<boolean> {
    const secret = String(process.env.TELEGRAM_NOTIFY_SECRET || process.env.INTERNAL_API_SECRET || '').trim();
    const buttonText = String(options?.buttonText || '').trim();
    const buttonUrl = String(options?.buttonUrl || '').trim();
    try {
      const response = await fetch(notifyUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(secret ? { Authorization: `Bearer ${secret}` } : {}),
        },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          disable_web_page_preview: true,
          ...(buttonText && buttonUrl ? { button_text: buttonText, button_url: buttonUrl } : {}),
        }),
      });

      if (response.ok) return true;

      const payload = await response.text().catch(() => '');
      logger.warn(`[telegram-notify] notify URL failed status=${response.status} body=${payload}`);
      return false;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn(`[telegram-notify] notify URL request failed: ${message}`);
      return false;
    }
  }

  private static isWhatsAppDeliveryMapping(mapping: ExternalMapping): boolean {
    const provider = String(mapping.provider || '').trim().toLowerCase();
    if (['whatsapp', 'evolution', 'whatsapp_evolution'].includes(provider)) return true;
    if (provider !== 'phone') return false;

    const data = mapping.data || {};
    const sourceCandidates = [
      data.provider,
      data.external_provider,
      data.externalProvider,
      data.source,
      data.external_source,
      data.externalSource,
      data.channel,
      data.session_source,
      data.sessionSource,
    ]
      .map((value) => String(value || '').trim().toLowerCase())
      .filter(Boolean);

    if (sourceCandidates.some((value) => value.includes('whatsapp') || value.includes('evolution'))) return true;

    const jid = String(data.remote_jid || data.remoteJid || data.jid || '').trim().toLowerCase();
    if (jid.includes('whatsapp') || jid.includes('@s.whatsapp.net')) return true;

    return Boolean(
      String(data.whatsapp_number || data.whatsappNumber || '').trim() ||
        String(data.evolution_instance || data.evolutionInstance || data.evolution_instance_id || data.evolutionInstanceId || '').trim()
    );
  }

  private static async sendWhatsAppToMappings(
    mappings: ExternalMapping[],
    sessionPhoneNumber: string | undefined,
    text: string
  ): Promise<WhatsAppDeliveryReport> {
    const whatsappMappings = mappings
      .filter((mapping) => this.isWhatsAppDeliveryMapping(mapping));
    if (whatsappMappings.length === 0) {
      return {
        attempted: false,
        delivered: 0,
        recipients: 0,
        instances: [],
        attempts: [],
        skipped_reason: 'no_whatsapp_mapping',
      };
    }

    const phones = whatsappMappings.flatMap((mapping) => [
      mapping.provider_user_id,
      mapping.data?.phone_number,
      mapping.data?.phone,
      mapping.data?.whatsapp_number,
      mapping.data?.whatsappNumber,
      mapping.data?.number,
      mapping.data?.remote_jid,
      mapping.data?.remoteJid,
      mapping.data?.jid,
    ]);
    if (sessionPhoneNumber && whatsappMappings.length > 0) phones.push(sessionPhoneNumber);

    const phoneDigits = Array.from(new Set(
      phones
        .map((phone) => this.normalizeWhatsAppDigits(phone))
        .filter(Boolean) as string[]
    ));
    if (phoneDigits.length === 0) {
      const providers = mappings.map((mapping) => String(mapping.provider || '').trim()).filter(Boolean).join(',');
      logger.warn(`[whatsapp-notify] skipped: no WhatsApp recipient digits found. providers=${providers || 'none'}`);
      return {
        attempted: false,
        delivered: 0,
        recipients: 0,
        instances: [],
        attempts: [],
        skipped_reason: 'no_recipient_digits',
      };
    }

    const deliveredByEvolution = new Set<string>();
    const attempts: WhatsAppDeliveryAttempt[] = [];
    const evolutionInstances = this.evolutionInstanceCandidates(whatsappMappings);
    if (this.hasEvolutionWhatsAppBaseConfig() && evolutionInstances.length > 0) {
      logger.info(
        `[whatsapp-notify] attempting Evolution delivery recipients=${phoneDigits.map((phone) => `***${phone.slice(-4)}`).join(',')} instances=${evolutionInstances.join(',')}`
      );
      await Promise.all(phoneDigits.map(async (phone) => {
        for (const evolutionInstance of evolutionInstances) {
          if (deliveredByEvolution.has(phone)) break;
          try {
            await EvolutionService.sendText(evolutionInstance, phone, text, { reliable: true });
            deliveredByEvolution.add(phone);
            attempts.push({
              phone_tail: phone.slice(-4),
              instance: evolutionInstance,
              delivered: true,
            });
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            attempts.push({
              phone_tail: phone.slice(-4),
              instance: evolutionInstance,
              delivered: false,
              error: message,
            });
            logger.warn(`[whatsapp-notify] evolution send failed for ***${phone.slice(-4)} on instance ${evolutionInstance}: ${message}`);
          }
        }
      }));
    } else {
      logger.warn('[whatsapp-notify] evolution skipped: set EVOLUTION_API_URL plus EVOLUTION_API_KEY/AUTHENTICATION_API_KEY and provide EVOLUTION_INSTANCE or a saved WhatsApp mapping instance.');
    }

    const accountSid = String(process.env.TWILIO_ACCOUNT_SID || '').trim();
    const authToken = String(process.env.TWILIO_AUTH_TOKEN || '').trim();
    const from = this.normalizeWhatsAppAddress(process.env.TWILIO_PHONE_NUMBER);
    if (!accountSid || !authToken || !from) {
      if (deliveredByEvolution.size === 0) {
        logger.warn('[whatsapp-notify] no WhatsApp provider delivered the message. Twilio fallback is not configured.');
      }
      return {
        attempted: attempts.length > 0,
        delivered: deliveredByEvolution.size,
        recipients: phoneDigits.length,
        instances: evolutionInstances,
        attempts,
        ...(attempts.length === 0 ? { skipped_reason: 'evolution_not_configured_or_no_instance' } : {}),
      };
    }

    const recipients = Array.from(new Set(
      phoneDigits
        .filter((phone) => !deliveredByEvolution.has(phone))
        .map((phone) => this.normalizeWhatsAppAddress(phone))
        .filter(Boolean) as string[]
    ));
    if (recipients.length === 0) {
      return {
        attempted: attempts.length > 0,
        delivered: deliveredByEvolution.size,
        recipients: phoneDigits.length,
        instances: evolutionInstances,
        attempts,
      };
    }

    await Promise.all(recipients.map(async (to) => {
      try {
        const body = new URLSearchParams({ From: from, To: to, Body: text });
        const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
          method: 'POST',
          headers: {
            Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body,
        });
        if (!response.ok) {
          logger.warn(`[incoming-transfer] whatsapp send failed with status ${response.status}`);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.warn(`[incoming-transfer] whatsapp send failed: ${message}`);
      }
    }));

    return {
      attempted: attempts.length > 0 || recipients.length > 0,
      delivered: deliveredByEvolution.size,
      recipients: phoneDigits.length,
      instances: evolutionInstances,
      attempts,
    };
  }

  private static hasEvolutionWhatsAppBaseConfig(): boolean {
    return Boolean(
      String(process.env.EVOLUTION_API_URL || process.env.EVOLUTION_BASE_URL || process.env.EVOLUTION_SERVER_URL || '').trim() &&
      String(process.env.EVOLUTION_API_KEY || process.env.EVOLUTION_APIKEY || process.env.EVOLUTION_GLOBAL_API_KEY || process.env.AUTHENTICATION_API_KEY || '').trim()
    );
  }

  private static evolutionInstance(): string {
    return String(
      process.env.EVOLUTION_INSTANCE ||
      process.env.EVOLUTION_INSTANCE_NAME ||
      process.env.EVOLUTION_NOTIFY_INSTANCE ||
      process.env.EVOLUTION_DEFAULT_INSTANCE ||
      process.env.EVOLUTION_INSTANCE_ID ||
      ''
    ).trim();
  }

  private static evolutionInstanceCandidates(mappings: ExternalMapping[]): string[] {
    const fromMappings = mappings
      .map((mapping) => this.mappingEvolutionInstance(mapping))
      .filter(Boolean) as string[];
    const configured = this.evolutionInstance();
    const instanceIdFallbacks = mappings
      .map((mapping) => this.mappingEvolutionInstanceId(mapping))
      .filter(Boolean) as string[];
    return Array.from(new Set([
      ...fromMappings,
      ...(configured ? [configured] : []),
      ...instanceIdFallbacks,
    ]));
  }

  private static mappingEvolutionInstance(mapping: ExternalMapping): string | undefined {
    const data = mapping.data || {};
    const instance = String(
      data.evolution_instance ||
      data.evolutionInstance ||
      data.instance ||
      data.instance_name ||
      data.instanceName ||
      data.notify_instance ||
      data.notifyInstance ||
      ''
    ).trim();
    if (!instance || this.isLikelyEvolutionInstanceId(instance)) return undefined;
    return instance;
  }

  private static mappingEvolutionInstanceId(mapping: ExternalMapping): string | undefined {
    const data = mapping.data || {};
    const instanceId = String(
      data.instance_id ||
      data.instanceId ||
      data.evolution_instance_id ||
      data.evolutionInstanceId ||
      data.instance_uuid ||
      data.instanceUuid ||
      ''
    ).trim();
    if (instanceId) return instanceId;

    const instance = String(data.instance || data.evolution_instance || '').trim();
    return this.isLikelyEvolutionInstanceId(instance) ? instance : undefined;
  }

  private static isLikelyEvolutionInstanceId(value: unknown): boolean {
    const raw = String(value || '').trim();
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw);
  }

  private static normalizeWhatsAppDigits(value: unknown): string | undefined {
    const digits = String(value || '').replace(/\D+/g, '');
    return digits || undefined;
  }

  private static normalizeWhatsAppAddress(value: unknown): string | undefined {
    const raw = String(value || '').trim();
    if (!raw) return undefined;
    if (raw.startsWith('whatsapp:')) return raw;
    const digits = raw.replace(/\D+/g, '');
    if (!digits) return undefined;
    return `whatsapp:+${digits}`;
  }
}
