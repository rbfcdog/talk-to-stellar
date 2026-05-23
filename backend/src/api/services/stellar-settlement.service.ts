import crypto from 'crypto';
import { getAssetIssuer, normalizeAssetCode } from '../../config/assets';
import { stellarConfig } from '../../config/stellar';
import { StellarService } from './stellar.service';
import { InternationalTransfer, SettlementEvidence } from './international-transfer.types';
import { mockDisabledError, specificMockAllowed } from '../../config/mock-policy';

function toPositiveNumber(value: unknown): number {
  const parsed = Number(String(value || '').replace(',', '.'));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function stellarAmount(value: unknown): string {
  const amount = toPositiveNumber(value);
  if (!amount) throw new Error('Settlement amount must be positive.');
  return amount.toFixed(7).replace(/\.?0+$/, '');
}

function readBoolean(value: unknown): boolean {
  return ['1', 'true', 'yes', 'y', 'on'].includes(String(value || '').trim().toLowerCase());
}

function activeNetwork(): 'testnet' | 'mainnet' {
  const raw = String(process.env.STELLAR_NETWORK || stellarConfig.networkName || 'TESTNET').trim().toUpperCase();
  return raw === 'PUBLIC' || raw === 'MAINNET' ? 'mainnet' : 'testnet';
}

function mainnetValidationLimitUsd(): number {
  const parsed = Number(process.env.MAX_MAINNET_VALIDATION_AMOUNT_USD || 25);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 25;
}

function offRampDestinationPublicKey(): string {
  return String(
    process.env.USD_OFFRAMP_STELLAR_DESTINATION ||
    process.env.PAYOUT_STELLAR_DESTINATION_PUBLIC_KEY ||
    process.env.STELLAR_DESTINATION_PUBLIC_KEY ||
    ''
  ).trim();
}

function usdcIssuer(): string | undefined {
  return String(process.env.USDC_ASSET_ISSUER || process.env.USDC_ISSUER || '').trim() || getAssetIssuer('USDC');
}

function settlementMemo(transferId: string): string {
  const compact = transferId.replace(/[^a-zA-Z0-9]/g, '').slice(-20);
  return `tts-${compact}`.slice(0, 28);
}

export class StellarSettlementService {
  private mockSettlementAllowed(): boolean {
    return specificMockAllowed('ALLOW_STELLAR_MOCK_SETTLEMENT', 'ops');
  }

  async settleUsdc(transfer: InternationalTransfer): Promise<SettlementEvidence> {
    const network = activeNetwork();
    const amount = stellarAmount(transfer.quoted_usd_amount);
    const assetCode = normalizeAssetCode(process.env.USDC_ASSET_CODE || 'USDC');
    const assetIssuer = assetCode === 'XLM' ? undefined : usdcIssuer();
    if (assetCode !== 'XLM' && !assetIssuer) {
      throw new Error(`${assetCode}_ASSET_ISSUER or USDC_ISSUER must be configured before settlement.`);
    }

    const memo = settlementMemo(transfer.transfer_id);
    const sourceSecret = String(process.env.STELLAR_SECRET_KEY || '').trim();
    const sourcePublicKey = String(process.env.STELLAR_PUBLIC_KEY || '').trim();
    const destination = offRampDestinationPublicKey();
    const enableMainnetValidation = readBoolean(process.env.ENABLE_MAINNET_SETTLEMENT_VALIDATION);
    const realExecutionPossible = Boolean(sourceSecret && destination);
    const settledAt = new Date().toISOString();

    if (network === 'mainnet') {
      const usdAmount = toPositiveNumber(amount);
      if (!enableMainnetValidation) {
        if (!this.mockSettlementAllowed()) {
          throw mockDisabledError(
            'Stellar mainnet settlement',
            'ENABLE_MAINNET_SETTLEMENT_VALIDATION=true is required for mainnet validation; otherwise switch STELLAR_NETWORK=TESTNET.'
          );
        }
        return this.mockEvidence({
          transfer,
          amount,
          memo,
          assetCode,
          assetIssuer,
          sourcePublicKey,
          destination,
          network,
          settledAt,
          reason: 'Mainnet runtime detected but ENABLE_MAINNET_SETTLEMENT_VALIDATION is not true.',
        });
      }
      if (usdAmount > mainnetValidationLimitUsd()) {
        throw new Error(`Mainnet validation amount ${usdAmount} USD exceeds MAX_MAINNET_VALIDATION_AMOUNT_USD=${mainnetValidationLimitUsd()}.`);
      }
    }

    if (!realExecutionPossible) {
      if (!this.mockSettlementAllowed()) {
        throw mockDisabledError(
          'Stellar USDC settlement',
          'Set STELLAR_SECRET_KEY and USD_OFFRAMP_STELLAR_DESTINATION/PAYOUT_STELLAR_DESTINATION_PUBLIC_KEY for real testnet settlement.'
        );
      }
      return this.mockEvidence({
        transfer,
        amount,
        memo,
        assetCode,
        assetIssuer,
        sourcePublicKey,
        destination,
        network,
        settledAt,
        reason: 'STELLAR_SECRET_KEY and payout/off-ramp Stellar destination are required for real settlement.',
      });
    }

    const result = await StellarService.submitAssetPaymentFromSecret({
      sourceSecret,
      destination,
      amount,
      assetCode,
      assetIssuer,
      memoText: memo,
    });

    if (!result.success || !result.hash) {
      throw new Error(result.error || 'Could not submit USDC settlement transaction.');
    }

    return {
      stellar_tx_hash: result.hash,
      stellar_memo: memo,
      stellar_source_account: sourcePublicKey || undefined,
      stellar_destination_account: destination,
      asset_code: assetCode,
      asset_issuer: assetIssuer,
      amount,
      network,
      status: 'submitted',
      execution_mode: network === 'mainnet' ? 'mainnet_validation' : 'testnet',
      settled_at: settledAt,
      metadata: {
        mainnet_validation_enabled: enableMainnetValidation,
      },
    };
  }

  private mockEvidence(input: {
    transfer: InternationalTransfer;
    amount: string;
    memo: string;
    assetCode: string;
    assetIssuer?: string;
    sourcePublicKey?: string;
    destination?: string;
    network: 'testnet' | 'mainnet';
    settledAt: string;
    reason: string;
  }): SettlementEvidence {
    return {
      stellar_tx_hash: `mock-stellar-${crypto.createHash('sha256').update(`${input.transfer.transfer_id}:${input.memo}`).digest('hex').slice(0, 32)}`,
      stellar_memo: input.memo,
      stellar_source_account: input.sourcePublicKey || undefined,
      stellar_destination_account: input.destination || undefined,
      asset_code: input.assetCode,
      asset_issuer: input.assetIssuer,
      amount: input.amount,
      network: input.network,
      status: 'mocked',
      execution_mode: 'mock',
      settled_at: input.settledAt,
      metadata: {
        reason: input.reason,
        no_real_money_moved: true,
      },
    };
  }
}

export const stellarSettlementService = new StellarSettlementService();
