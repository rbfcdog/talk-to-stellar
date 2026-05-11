import { supabase } from '../../config/supabase';
import { AgentRepository } from '../../repositories/agent.repository';
import { logger } from '../../utils/logger';
import { formatCustomerAssetAmount } from '../../utils/fee-display';

type ExternalMapping = {
  provider?: string | null;
  provider_user_id?: string | null;
  data?: Record<string, any> | null;
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
};

export class TransferNotificationService {
  private static agentRepo = new AgentRepository(supabase);

  static async notifySessionWelcome(input: SessionWelcomeNotification): Promise<void> {
    const sessionId = String(input.sessionId || '').trim();
    if (!sessionId) return;

    const session = await this.safeGetSession(sessionId);
    const userId = String(input.userId || session?.user_id || '').trim();
    const name = String(input.name || session?.email || '').trim();
    const greeting = name ? `Bem-vindo, ${name}.` : 'Bem-vindo ao TalkToStellar.';
    const text =
      `${greeting}\n` +
      `Sua conta esta conectada. Agora voce pode consultar saldo, enviar pagamentos e receber transferencias por aqui.`;

    try {
      await this.agentRepo.saveMessage(sessionId, 'assistant', text);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.warn(`[session-welcome] failed to save chat message: ${message}`);
    }

    const mappings = await this.findExternalMappings(sessionId, userId);
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
    const senderLabel = String(input.senderLabel || 'Alguem').trim();
    const receivedLabel = formatCustomerAssetAmount(input.amount, input.assetCode);
    const sourceLine = input.sourceAmount && input.sourceAssetCode && input.sourceAssetCode !== input.assetCode
      ? `Remetente enviou: ${formatCustomerAssetAmount(input.sourceAmount, input.sourceAssetCode)}\n`
      : '';
    const text =
      `Voce recebeu uma transferencia.\n` +
      `Valor recebido: ${receivedLabel}\n` +
      sourceLine +
      `De: ${senderLabel}\n` +
      `${input.hash ? `Codigo da operacao: ${input.hash}` : ''}`;

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
      const bySession = await supabase
        .from('external_accounts')
        .select('provider, provider_user_id, data')
        .eq('session_id', sessionId);

      if (bySession.error) throw bySession.error;
      const mappings = bySession.data || [];
      if (mappings.length || !userId) return mappings;

      const byUser = await supabase
        .from('external_accounts')
        .select('provider, provider_user_id, data')
        .eq('user_id', userId);

      if (byUser.error) throw byUser.error;
      return byUser.data || [];
    } catch (error: any) {
      const message = String(error?.message || error || '').toLowerCase();
      if (message.includes('external_accounts') || message.includes('schema cache') || message.includes('does not exist')) {
        return [];
      }
      logger.warn(`[incoming-transfer] failed to query external mappings: ${error?.message || String(error)}`);
      return [];
    }
  }

  private static async sendTelegramToMappings(mappings: ExternalMapping[], text: string): Promise<void> {
    const botToken = String(process.env.TELEGRAM_BOT_TOKEN || '').trim();
    if (!botToken) return;

    const telegramIds = Array.from(new Set(
      mappings
        .filter((mapping) => String(mapping.provider || '').toLowerCase() === 'telegram')
        .map((mapping) => String(mapping.provider_user_id || '').trim())
        .filter(Boolean)
    ));

    await Promise.all(telegramIds.map(async (chatId) => {
      try {
        const response = await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: chatId, text }),
        });
        if (!response.ok) {
          logger.warn(`[incoming-transfer] telegram sendMessage failed with status ${response.status}`);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        logger.warn(`[incoming-transfer] telegram send failed: ${message}`);
      }
    }));
  }

  private static async sendWhatsAppToMappings(
    mappings: ExternalMapping[],
    sessionPhoneNumber: string | undefined,
    text: string
  ): Promise<void> {
    const accountSid = String(process.env.TWILIO_ACCOUNT_SID || '').trim();
    const authToken = String(process.env.TWILIO_AUTH_TOKEN || '').trim();
    const from = this.normalizeWhatsAppAddress(process.env.TWILIO_PHONE_NUMBER);
    if (!accountSid || !authToken || !from) return;

    const phones = mappings
      .filter((mapping) => ['whatsapp', 'phone'].includes(String(mapping.provider || '').toLowerCase()))
      .flatMap((mapping) => [
        mapping.provider_user_id,
        mapping.data?.phone_number,
        mapping.data?.phone,
      ]);
    if (sessionPhoneNumber) phones.push(sessionPhoneNumber);

    const recipients = Array.from(new Set(
      phones
        .map((phone) => this.normalizeWhatsAppAddress(phone))
        .filter(Boolean) as string[]
    ));

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
