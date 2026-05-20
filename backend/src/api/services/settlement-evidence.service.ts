import { InternationalTransfer, PayoutInstruction, SettlementEvidence, TransferReconciliation } from './international-transfer.types';

export class SettlementEvidenceService {
  static buildReconciliation(input: {
    transfer: InternationalTransfer;
    settlement?: SettlementEvidence;
    payout?: PayoutInstruction;
  }): TransferReconciliation {
    const now = new Date().toISOString();
    const transfer = input.transfer;
    const settlement = input.settlement || (transfer.reconciliation_metadata?.stellar_settlement as SettlementEvidence | undefined);
    const payout = input.payout || (transfer.reconciliation_metadata?.payout_instruction as PayoutInstruction | undefined);

    return {
      transfer_id: transfer.transfer_id,
      quote_id: transfer.quote_id,
      pix_payment_id: transfer.pix_payment_id,
      pix_order_id: transfer.pix_order_id,
      stellar_tx_hash: settlement?.stellar_tx_hash || transfer.stellar_tx_hash,
      stellar_memo: settlement?.stellar_memo || transfer.stellar_memo,
      payout_instruction_id: payout?.payout_instruction_id || transfer.payout_instruction_id,
      provider_payout_id: payout?.provider_payout_id || transfer.provider_payout_id,
      final_payout_status: payout?.status || transfer.payout_status,
      evidence: {
        quote_id: transfer.quote_id,
        pix: {
          payment_id: transfer.pix_payment_id,
          order_id: transfer.pix_order_id,
          status: transfer.pix_status,
          received_at: transfer.pix_received_at,
        },
        stellar_settlement: settlement || null,
        payout_instruction: payout || null,
        transfer_status: transfer.status,
        reconciliation_metadata: transfer.reconciliation_metadata || {},
      },
      created_at: now,
      updated_at: now,
    };
  }
}
