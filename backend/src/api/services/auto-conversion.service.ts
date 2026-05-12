/**
 * Service for handling auto-conversion of received payments
 * Checks conversion rules and logs conversions for asynchronous execution
 * Real conversion happens when incoming payment is detected
 */

import { ConversionRuleRepository } from '../repository/conversion-rule.repository';
import { logger } from '../../utils/logger';

interface MatchedConversionRule {
  ruleId: string;
  walletId: number;
  fromAsset: string;
  toAsset: string;
  amount: number;
  triggerType: string;
}

export class AutoConversionService {
  /**
   * Check if there are matching conversion rules for a wallet's received asset
   * Used to determine if conversion should be triggered after payment reception
   */
  static async findMatchingConversionRules(
    walletId: number,
    receivedAsset: string,
    receivedAmount: number
  ): Promise<MatchedConversionRule[]> {
    const matched: MatchedConversionRule[] = [];

    try {
      // Get all enabled conversion rules for this wallet
      const rules = await ConversionRuleRepository.findByWalletId(walletId, true);

      // Filter rules that match the received asset and amount
      for (const rule of rules) {
        if (
          (rule.from_asset_code || '').toUpperCase() === (receivedAsset || '').toUpperCase() &&
          receivedAmount >= (rule.min_amount || 0.1)
        ) {
          matched.push({
            ruleId: rule.id,
            walletId,
            fromAsset: rule.from_asset_code,
            toAsset: rule.to_asset_code,
            amount: receivedAmount,
            triggerType: rule.trigger_type,
          });

          logger.info(
            `Matched conversion rule: ${receivedAmount} ${receivedAsset} to ${rule.to_asset_code} (Rule: ${rule.id})`
          );
        }
      }

      return matched;
    } catch (error) {
      logger.error(
        `Error finding conversion rules: ${error instanceof Error ? error.message : String(error)}`
      );
      return matched;
    }
  }

  /**
   * Get all active conversion rules for a wallet
   */
  static async getWalletConversionRules(walletId: number) {
    try {
      return await ConversionRuleRepository.findByWalletId(walletId, true);
    } catch (error) {
      logger.error(`Error retrieving conversion rules: ${error instanceof Error ? error.message : String(error)}`);
      return [];
    }
  }

  /**
   * Disable a conversion rule
   */
  static async disableConversionRule(ruleId: string) {
    try {
      await ConversionRuleRepository.toggleEnabled(ruleId, false);
      logger.info(`Conversion rule disabled: ${ruleId}`);
      return true;
    } catch (error) {
      logger.error(`Error disabling conversion rule: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }

  /**
   * Format matched rules for agent response
   */
  static formatRulesForAgent(rules: MatchedConversionRule[]): string {
    if (rules.length === 0) {
      return 'Nenhuma regra de conversão automática foi acionada.';
    }

    const rulesList = rules
      .map(
        r =>
          `${r.amount} ${r.fromAsset} para ${r.toAsset} (Regra: ${r.ruleId.substring(0, 8)}...)`
      )
      .join('\n');

    return `Regras de conversão automática identificadas:\n${rulesList}\n\nAs conversões serão processadas quando o pagamento for detectado na blockchain.`;
  }
}
