import { InternationalTransferRepository } from './international-transfer.repository';
import { InternationalTransfer, SettlementEvidence } from '../services/international-transfer.types';

export class StellarTransactionRepository {
  constructor(private readonly transferRepository: InternationalTransferRepository) {}

  async attachSettlementEvidence(transfer: InternationalTransfer, evidence: SettlementEvidence): Promise<InternationalTransfer> {
    return this.transferRepository.updateTransfer(transfer.transfer_id, {
      stellar_tx_hash: evidence.stellar_tx_hash,
      stellar_memo: evidence.stellar_memo,
      stellar_source_account: evidence.stellar_source_account,
      stellar_destination_account: evidence.stellar_destination_account,
      stellar_asset_code: evidence.asset_code,
      stellar_asset_issuer: evidence.asset_issuer,
      stellar_settled_at: evidence.settled_at,
      reconciliation_metadata: {
        ...(transfer.reconciliation_metadata || {}),
        stellar_settlement: evidence,
      },
    });
  }
}
