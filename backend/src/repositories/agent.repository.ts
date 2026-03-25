/**
 * Repository functions for agent state management via Supabase
 */

import { SupabaseClient } from '@supabase/supabase-js';
import { SessionData, AgentState } from '../agent/types';

export class AgentRepository {
  constructor(private supabase: SupabaseClient) {}

  /**
   * Create or update session data
   */
  async saveSession(sessionId: string, sessionData: SessionData): Promise<void> {
    const { error } = await this.supabase
      .from('agent_sessions')
      .upsert(
        {
          session_id: sessionId,
          user_id: sessionData.user_id,
          email: sessionData.email,
          session_token: sessionData.session_token,
          public_key: sessionData.public_key,
          phone_number: sessionData.phone_number,
          created_at: sessionData.created_at,
          last_activity: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'session_id' }
      );

    if (error) {
      throw new Error(`Failed to save session: ${error.message || JSON.stringify(error)}`);
    }
  }

  /**
   * Retrieve session data
   */
  async getSession(sessionId: string): Promise<SessionData | null> {
    const { data, error } = await this.supabase
      .from('agent_sessions')
      .select('*')
      .eq('session_id', sessionId)
      .single();

    if (error && error.code !== 'PGRST116') {
      throw new Error(`Failed to get session: ${error.message || JSON.stringify(error)}`);
    }
    return data || null;
  }

  /**
   * Save agent state
   */
  async saveState(sessionId: string, state: Partial<AgentState>): Promise<void> {
    const { error } = await this.supabase
      .from('agent_states')
      .upsert(
        {
          session_id: sessionId,
          detected_intent: state.detected_intent,
          action_type: state.action_type,
          action_params: state.action_params,
          pending_payment: state.pending_payment,
          response_message: state.response_message,
          success: state.success,
          error: state.error,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'session_id' }
      );

    if (error) {
      throw new Error(`Failed to save state: ${error.message || JSON.stringify(error)}`);
    }
  }

  /**
   * Retrieve last agent state
   */
  async getState(sessionId: string): Promise<Partial<AgentState> | null> {
    const { data, error } = await this.supabase
      .from('agent_states')
      .select('*')
      .eq('session_id', sessionId)
      .order('updated_at', { ascending: false })
      .limit(1)
      .single();

    if (error && error.code !== 'PGRST116') {
      throw new Error(`Failed to get state: ${error.message || JSON.stringify(error)}`);
    }
    return data || null;
  }

  /**
   * Save conversation message
   */
  async saveMessage(
    sessionId: string,
    role: 'user' | 'assistant',
    content: string
  ): Promise<void> {
    const { error } = await this.supabase
      .from('agent_messages')
      .insert({
        session_id: sessionId,
        role,
        content,
        created_at: new Date().toISOString(),
      });

    if (error) {
      throw new Error(`Failed to save message: ${error.message || JSON.stringify(error)}`);
    }
  }

  /**
   * Delete previously stored assistant messages that contain private key content.
   * This is used to remove sensitive wallet secrets after the user sends a new message.
   */
  async deletePrivateKeyMessages(sessionId: string): Promise<void> {
    const { error } = await this.supabase
      .from('agent_messages')
      .delete()
      .eq('session_id', sessionId)
      .eq('role', 'assistant')
      .or('content.ilike.%chave privada%,content.ilike.%private key%');

    if (error) {
      throw new Error(`Failed to delete private key messages: ${error.message || JSON.stringify(error)}`);
    }
  }

  /**
   * Get conversation history
   */
  async getMessages(sessionId: string, limit: number = 50): Promise<Array<any>> {
    const { data, error } = await this.supabase
      .from('agent_messages')
      .select('*')
      .eq('session_id', sessionId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      throw new Error(`Failed to get messages: ${error.message || JSON.stringify(error)}`);
    }
    return (data || []).reverse();
  }

  /**
   * Clear session (logout)
   */
  async clearSession(sessionId: string): Promise<void> {
    const { error } = await this.supabase
      .from('agent_sessions')
      .delete()
      .eq('session_id', sessionId);

    if (error) {
      throw new Error(`Failed to clear session: ${error.message || JSON.stringify(error)}`);
    }
  }

  /**
   * Get analytics for a user
   */
  async getUserAnalytics(userId: string): Promise<Record<string, any>> {
    const { data: sessions, error: sessionsError } = await this.supabase
      .from('agent_sessions')
      .select('*')
      .eq('user_id', userId);

    if (sessionsError) {
      throw new Error(`Failed to get user sessions: ${sessionsError.message || JSON.stringify(sessionsError)}`);
    }

    const { data: messages, error: messagesError } = await this.supabase
      .from('agent_messages')
      .select('*')
      .in('session_id', sessions?.map(s => s.session_id) || []);

    if (messagesError) {
      throw new Error(`Failed to get user messages: ${messagesError.message || JSON.stringify(messagesError)}`);
    }

    return {
      total_sessions: sessions?.length || 0,
      total_messages: messages?.length || 0,
      last_activity: sessions?.[0]?.last_activity,
    };
  }
}
