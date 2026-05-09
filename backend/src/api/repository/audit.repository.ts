import { supabase } from '../../config/supabase';
import crypto from 'crypto';

export interface AuditEvent {
  id: string;
  session_id: string;
  event_type: string;
  ip_hash?: string;
  user_agent?: string;
  metadata?: any;
  created_at: string;
}

export class AuditRepository {
  static hashIp(ip: string | undefined): string | undefined {
    if (!ip) return undefined;
    return crypto.createHash('sha256').update(ip).digest('hex').substring(0, 16);
  }

  static async logEvent(
    sessionId: string,
    eventType: string,
    metadata: any = {},
    ipAddress?: string,
    userAgent?: string
  ): Promise<AuditEvent> {
    const { data, error } = await supabase
      .from('audit_events')
      .insert([{
        session_id: sessionId,
        event_type: eventType,
        ip_hash: this.hashIp(ipAddress),
        user_agent: userAgent ? userAgent.substring(0, 255) : undefined,
        metadata: metadata || {}
      }])
      .select()
      .single();

    if (error) {
      console.error('Supabase error logging audit event:', error.message);
      throw new Error(`Failed to log audit event: ${error.message}`);
    }
    return data;
  }

  static async getSessionEvents(sessionId: string, limit: number = 50): Promise<AuditEvent[]> {
    const { data, error } = await supabase
      .from('audit_events')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('Supabase error retrieving audit events:', error.message);
      throw new Error('Failed to retrieve audit events.');
    }
    return data || [];
  }

  static async getEventsByType(sessionId: string, eventType: string, limit: number = 50): Promise<AuditEvent[]> {
    const { data, error } = await supabase
      .from('audit_events')
      .select('*')
      .eq('session_id', sessionId)
      .eq('event_type', eventType)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('Supabase error retrieving events by type:', error.message);
      throw new Error('Failed to retrieve audit events.');
    }
    return data || [];
  }

  static formatEventForAgent(event: AuditEvent): string {
    const date = new Date(event.created_at).toLocaleString('pt-BR');
    const metadata = event.metadata ? JSON.stringify(event.metadata) : '';
    
    const eventDescriptions: { [key: string]: string } = {
      'session_created': `✅ Sessão criada`,
      'payment_initiated': `💸 Pagamento iniciado: ${metadata}`,
      'payment_confirmed': `🔒 Pagamento confirmado`,
      'passkey_registered': `🔐 Passkey registrada`,
      'password_changed': `🔑 Senha alterada`,
      'onboarding_completed': `🎯 Onboarding completo`,
      'contact_added': `👥 Contato adicionado`,
      'balance_checked': `💰 Saldo consultado`,
      'trustline_created': `🔗 Trustline criada: ${metadata}`,
      'conversion_initiated': `🔄 Conversão iniciada: ${metadata}`,
    };

    const description = eventDescriptions[event.event_type] || `${event.event_type}: ${metadata}`;
    return `${date} - ${description}`;
  }
}
