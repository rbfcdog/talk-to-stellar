import { supabase } from '../../config/supabase';
import {
  Transfer,
  TransferEvent,
  CreateTransferIntent,
  TransferActor,
  TransferEventType,
  TransferState,
} from '../../orchestration/types';

// ─── Row mapping helpers ─────────────────────────────────────────────────────

function omitUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item !== undefined)
  ) as T;
}

function rowToTransfer(row: Record<string, unknown>): Transfer {
  return {
    id: String(row.id),
    public_ref: String(row.public_ref),
    state: String(row.state) as Transfer['state'],
    state_version: Number(row.state_version),
    source_endpoint: (row.source_endpoint || null) as Transfer['source_endpoint'],
    destination_endpoint: (row.destination_endpoint || null) as Transfer['destination_endpoint'],
    amount_brl_in: row.amount_brl_in ? String(row.amount_brl_in) : null,
    amount_usdc_settled: row.amount_usdc_settled ? String(row.amount_usdc_settled) : null,
    amount_usd_out_expected: row.amount_usd_out_expected ? String(row.amount_usd_out_expected) : null,
    quote: (row.quote || null) as Transfer['quote'],
    pix: (row.pix || null) as Transfer['pix'],
    stellar: (row.stellar || null) as Transfer['stellar'],
    payout: (row.payout || null) as Transfer['payout'],
    reconciliation: (row.reconciliation || null) as Transfer['reconciliation'],
    legacy_transfer_id: row.legacy_transfer_id ? String(row.legacy_transfer_id) : null,
    actor: (row.actor || {}) as Transfer['actor'],
    failure_reason: row.failure_reason ? String(row.failure_reason) : null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

function eventToRow(e: Omit<TransferEvent, 'id' | 'created_at'>): Record<string, unknown> {
  return omitUndefined({
    transfer_id: e.transfer_id,
    from_state: e.from_state,
    to_state: e.to_state,
    event_type: String(e.event_type),
    payload: e.payload || {},
    actor: e.actor,
    correlation_id: e.correlation_id || null,
  });
}

function rowToEvent(row: Record<string, unknown>): TransferEvent {
  return {
    id: String(row.id),
    transfer_id: String(row.transfer_id),
    from_state: (row.from_state || null) as TransferEvent['from_state'],
    to_state: String(row.to_state) as TransferEvent['to_state'],
    event_type: String(row.event_type) as TransferEvent['event_type'],
    payload: (row.payload || {}) as TransferEvent['payload'],
    actor: String(row.actor) as TransferEvent['actor'],
    correlation_id: row.correlation_id ? String(row.correlation_id) : null,
    created_at: String(row.created_at),
  };
}

// ─── Repository ──────────────────────────────────────────────────────────────

function rpcTransferRow(data: unknown): Record<string, unknown> {
  if (Array.isArray(data)) return (data[0] || {}) as Record<string, unknown>;
  return (data || {}) as Record<string, unknown>;
}

export type TransferTransitionInput = {
  transferId: string;
  expectedVersion: number;
  toState: TransferState;
  eventType: TransferEventType;
  payload: Record<string, unknown>;
  actor: TransferActor;
  correlationId?: string | null;
  updates?: Partial<Transfer>;
};

export class TransferRepository {
  async create(intent: CreateTransferIntent): Promise<Transfer> {
    const { data, error } = await supabase.rpc('create_transfer_with_event', {
      p_amount_brl_in: intent.amount_brl_in,
      p_source_endpoint: intent.source_endpoint,
      p_destination_endpoint: intent.destination_endpoint,
      p_actor: intent.actor || 'api',
      p_correlation_id: intent.correlation_id || null,
      p_event_payload: { intent },
      p_legacy_transfer_id: intent.legacy_transfer_id || null,
    });

    if (error) throw new Error(`Failed to create transfer atomically: ${error.message}`);
    return rowToTransfer(rpcTransferRow(data));
  }

  async getById(id: string): Promise<Transfer | null> {
    const { data, error } = await supabase
      .from('transfers')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw new Error(`Failed to get transfer: ${error.message}`);
    }
    return rowToTransfer(data);
  }

  async getByPublicRef(ref: string): Promise<Transfer | null> {
    const { data, error } = await supabase
      .from('transfers')
      .select('*')
      .eq('public_ref', ref)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw new Error(`Failed to get transfer: ${error.message}`);
    }
    return rowToTransfer(data);
  }

  async getByLegacyTransferId(legacyTransferId: string): Promise<Transfer | null> {
    const normalized = String(legacyTransferId || '').trim();
    if (!normalized) return null;

    const { data, error } = await supabase
      .from('transfers')
      .select('*')
      .eq('legacy_transfer_id', normalized)
      .maybeSingle();

    if (error) throw new Error(`Failed to get transfer by legacy id: ${error.message}`);
    return data ? rowToTransfer(data) : null;
  }

  async update(
    id: string,
    expectedVersion: number,
    updates: Partial<Transfer>,
  ): Promise<Transfer> {
    const row = omitUndefined({
      state: updates.state,
      state_version: expectedVersion + 1,
      source_endpoint: updates.source_endpoint,
      destination_endpoint: updates.destination_endpoint,
      amount_brl_in: updates.amount_brl_in,
      amount_usdc_settled: updates.amount_usdc_settled,
      amount_usd_out_expected: updates.amount_usd_out_expected,
      quote: updates.quote,
      pix: updates.pix,
      stellar: updates.stellar,
      payout: updates.payout,
      reconciliation: updates.reconciliation,
      legacy_transfer_id: updates.legacy_transfer_id,
      actor: updates.actor,
      failure_reason: updates.failure_reason,
    });

    const { data, error } = await supabase
      .from('transfers')
      .update(row)
      .eq('id', id)
      .eq('state_version', expectedVersion)
      .select('*')
      .single();

    if (error) {
      if (error.code === 'PGRST116') {
        throw new Error(
          `Optimistic lock conflict: transfer ${id} modified by another process (expected v${expectedVersion})`,
        );
      }
      throw new Error(`Failed to update transfer: ${error.message}`);
    }
    return rowToTransfer(data);
  }

  async transition(input: TransferTransitionInput): Promise<Transfer> {
    const { data, error } = await supabase.rpc('transition_transfer', {
      p_transfer_id: input.transferId,
      p_expected_state_version: input.expectedVersion,
      p_to_state: input.toState,
      p_event_type: input.eventType,
      p_event_payload: input.payload || {},
      p_actor: input.actor,
      p_correlation_id: input.correlationId || null,
      p_updates: omitUndefined({
        state: input.updates?.state,
        source_endpoint: input.updates?.source_endpoint,
        destination_endpoint: input.updates?.destination_endpoint,
        amount_brl_in: input.updates?.amount_brl_in,
        amount_usdc_settled: input.updates?.amount_usdc_settled,
        amount_usd_out_expected: input.updates?.amount_usd_out_expected,
        quote: input.updates?.quote,
        pix: input.updates?.pix,
        stellar: input.updates?.stellar,
        payout: input.updates?.payout,
        reconciliation: input.updates?.reconciliation,
        legacy_transfer_id: input.updates?.legacy_transfer_id,
        actor: input.updates?.actor,
        failure_reason: input.updates?.failure_reason,
      }),
    });

    if (error) {
      const message = String(error.message || error);
      if (message.toLowerCase().includes('optimistic lock')) {
        throw new Error(
          `Optimistic lock conflict: transfer ${input.transferId} modified by another process (expected v${input.expectedVersion})`,
        );
      }
      throw new Error(`Failed to transition transfer atomically: ${message}`);
    }
    return rowToTransfer(rpcTransferRow(data));
  }

  async list(filters?: { state?: string; limit?: number; offset?: number }): Promise<Transfer[]> {
    let query = supabase
      .from('transfers')
      .select('*')
      .order('created_at', { ascending: false });

    if (filters?.state) {
      query = query.eq('state', filters.state);
    }
    if (filters?.limit) {
      query = query.limit(filters.limit);
    }
    if (filters?.offset) {
      query = query.range(filters.offset, filters.offset + (filters.limit || 20) - 1);
    }

    const { data, error } = await query;
    if (error) throw new Error(`Failed to list transfers: ${error.message}`);
    return (data || []).map(rowToTransfer);
  }

  async count(filters?: { state?: string }): Promise<number> {
    let query = supabase
      .from('transfers')
      .select('*', { count: 'exact', head: true });

    if (filters?.state) {
      query = query.eq('state', filters.state);
    }

    const { count, error } = await query;
    if (error) throw new Error(`Failed to count transfers: ${error.message}`);
    return count || 0;
  }

  // ─── Event methods ───────────────────────────────────────────────────────

  async appendEvent(event: Omit<TransferEvent, 'id' | 'created_at'>): Promise<TransferEvent> {
    const row = eventToRow(event);
    const { data, error } = await supabase
      .from('transfer_events')
      .insert(row)
      .select('*')
      .single();

    if (error) throw new Error(`Failed to append event: ${error.message}`);
    return rowToEvent(data);
  }

  async getEvents(transferId: string): Promise<TransferEvent[]> {
    const { data, error } = await supabase
      .from('transfer_events')
      .select('*')
      .eq('transfer_id', transferId)
      .order('created_at', { ascending: true });

    if (error) throw new Error(`Failed to get events: ${error.message}`);
    return (data || []).map(rowToEvent);
  }

  async getAllEvents(filters?: {
    transferId?: string;
    actor?: string;
    limit?: number;
  }): Promise<TransferEvent[]> {
    let query = supabase
      .from('transfer_events')
      .select('*')
      .order('created_at', { ascending: false });

    if (filters?.transferId) {
      query = query.eq('transfer_id', filters.transferId);
    }
    if (filters?.actor) {
      query = query.eq('actor', filters.actor);
    }
    if (filters?.limit) {
      query = query.limit(filters.limit);
    }

    const { data, error } = await query;
    if (error) throw new Error(`Failed to get events: ${error.message}`);
    return (data || []).map(rowToEvent);
  }

  async findTransferByPixChargeId(chargeId: string): Promise<Transfer | null> {
    const { data, error } = await supabase
      .from('transfers')
      .select('*')
      .filter('pix->>charge_id', 'eq', chargeId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw new Error(`Failed to find transfer by pix: ${error.message}`);
    }
    return rowToTransfer(data);
  }

  async findTransferByPixEvidence(input: { e2eId?: string; txid?: string; chargeId?: string }): Promise<Transfer | null> {
    const e2eId = String(input.e2eId || '').trim();
    const txid = String(input.txid || '').trim();
    const chargeId = String(input.chargeId || '').trim();

    if (e2eId) {
      const { data, error } = await supabase
        .from('transfers')
        .select('*')
        .filter('pix->>e2e_id', 'eq', e2eId)
        .maybeSingle();
      if (error) throw new Error(`Failed to find transfer by pix e2e_id: ${error.message}`);
      if (data) return rowToTransfer(data);
    }

    if (txid) {
      const { data, error } = await supabase
        .from('transfers')
        .select('*')
        .filter('pix->>txid', 'eq', txid)
        .maybeSingle();
      if (error) throw new Error(`Failed to find transfer by pix txid: ${error.message}`);
      if (data) return rowToTransfer(data);
    }

    if (chargeId) return this.findTransferByPixChargeId(chargeId);
    return null;
  }

  async findTransferByTxHash(txHash: string): Promise<Transfer | null> {
    const { data, error } = await supabase
      .from('transfers')
      .select('*')
      .filter('stellar->>tx_hash', 'eq', txHash)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      throw new Error(`Failed to find transfer by tx: ${error.message}`);
    }
    return rowToTransfer(data);
  }
}

export const transferRepository = new TransferRepository();
