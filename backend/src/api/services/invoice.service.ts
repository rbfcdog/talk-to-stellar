import { supabase } from '../../config/supabase';
import ExternalService from './core/external.service';
import { FinancialContextService, trackFinancialEvent } from './financial-context.service';
import { SmartContactsService } from './smart-contacts.service';
import { buildOperationFingerprint } from './core/idempotency.service';

export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'expired' | 'cancelled';

export type CreateInvoiceInput = {
  sessionId?: string;
  userId?: string;
  recipientName: string;
  title?: string;
  description?: string;
  amount: string;
  currency?: string;
  dueDate?: string;
};

export class InvoiceService {
  static async create(input: CreateInvoiceInput): Promise<Record<string, unknown>> {
    const ctx = await FinancialContextService.resolve({ sessionId: input.sessionId, userId: input.userId });
    const externalService = new ExternalService(supabase as any);

    const normalizedRecipient = String(input.recipientName || '').trim();
    if (!normalizedRecipient) {
      throw new Error('Informe o nome do cliente/destinatário para criar a cobrança.');
    }

    const normalizedAmount = String(input.amount || '').replace(',', '.').trim();
    if (!normalizedAmount || Number(normalizedAmount) <= 0) {
      throw new Error('Valor da cobrança inválido.');
    }

    const currency = String(input.currency || 'USD').toUpperCase();
    const contact = await SmartContactsService.resolveByContext({
      sessionId: ctx.sessionId,
      userId: ctx.userId,
      query: normalizedRecipient,
    });

    const linkPayload = await externalService.createClaimPaymentUrl({
      amount: normalizedAmount,
      recipient_name: normalizedRecipient,
      sender_name: ctx.userId,
      session_id: ctx.sessionId,
      owner_id: ctx.userId,
      asset_code: currency,
      destination_asset_code: currency,
    }, {
      invoice_title: input.title || 'Cobrança',
      invoice_description: input.description || '',
      requires_recipient_login: true,
    });

    const operationFingerprint = buildOperationFingerprint({
      sourceSessionId: ctx.sessionId,
      sourceUserId: ctx.userId,
      destination: normalizedRecipient,
      amount: normalizedAmount,
      assetCode: currency,
      operationType: 'INVOICE',
      quoteId: `${input.title || 'Cobrança'}:${input.description || ''}:${input.dueDate || ''}`,
    });
    const paymentLinkId = `inv_link_${operationFingerprint.slice(0, 24)}`;
    const dueDate = input.dueDate ? new Date(input.dueDate).toISOString() : null;

    const { data, error } = await supabase
      .from('invoices')
      .upsert({
        user_id: ctx.userId,
        recipient_name: normalizedRecipient,
        recipient_contact_id: contact?.id || null,
        title: input.title || 'Cobrança',
        description: input.description || null,
        amount: Number(normalizedAmount),
        currency,
        due_date: dueDate,
        status: 'sent' satisfies InvoiceStatus,
        payment_link_id: paymentLinkId,
        operation_fingerprint: operationFingerprint,
        metadata_json: {
          payment_url: linkPayload.url,
          payment_token: linkPayload.token,
          requires_recipient_login: true,
        },
      }, { onConflict: 'operation_fingerprint' })
      .select('*')
      .single();

    if (error) {
      throw new Error(`Falha ao criar cobrança: ${error.message}`);
    }

    await trackFinancialEvent('invoice_created', {
      session_id: ctx.sessionId,
      user_id: ctx.userId,
      invoice_id: data.id,
      amount: data.amount,
      currency: data.currency,
      recipient_name: data.recipient_name,
    });

    await trackFinancialEvent('invoice_sent', {
      session_id: ctx.sessionId,
      user_id: ctx.userId,
      invoice_id: data.id,
      payment_link_id: paymentLinkId,
    });

    await supabase.from('financial_events').upsert({
      user_id: ctx.userId,
      event_type: 'invoice_created',
      title: 'Cobrança criada',
      description: `${currency} ${Number(data.amount).toFixed(2)} para ${data.recipient_name}.`,
      amount: data.amount,
      currency,
      status: 'sent',
      metadata_json: {
        invoice_id: data.id,
        payment_link_id: paymentLinkId,
        payment_url: linkPayload.url,
      },
      icon: 'file-text',
      semantic_color: 'orange',
      created_at: new Date().toISOString(),
      dedupe_key: `${ctx.userId}:invoice_created:${String(data.id)}`,
    }, { onConflict: 'dedupe_key' });

    return {
      ...data,
      payment_url: linkPayload.url,
      summary:
        `Cobrança criada com sucesso: ${currency} ${Number(data.amount).toFixed(2)} para ${data.recipient_name}. ` +
        `Link pronto para envio (a pessoa precisa entrar ou criar conta para receber).`,
    };
  }

  static async list(input: { sessionId?: string; userId?: string; limit?: number }): Promise<Array<Record<string, unknown>>> {
    const ctx = await FinancialContextService.resolve({ sessionId: input.sessionId, userId: input.userId });
    const limit = Math.min(Math.max(Number(input.limit || 30), 1), 80);

    const { data, error } = await supabase
      .from('invoices')
      .select('*')
      .eq('user_id', ctx.userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      throw new Error(`Falha ao listar cobranças: ${error.message}`);
    }

    return (data || []) as Array<Record<string, unknown>>;
  }
}
