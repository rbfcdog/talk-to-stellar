import { StellarService } from './stellar.service';
import { OperationRepository } from '../repository/operation.repository';
import { logger } from '../../utils/logger';

export class TrustlineService {
  // Assets that should be trusted by default on onboarding
  private static readonly DEFAULT_TRUSTED_ASSETS = [
    { code: 'USDC', issuer: process.env.USDC_ISSUER || '' },
    { code: 'BRL', issuer: process.env.BRL_ISSUER || '' },
  ];

  /**
   * Creates trustlines for default assets (USDC, BRL) for a new account
   */
  static async createDefaultTrustlines(
    publicKey: string,
    secretKey: string,
    userId: string
  ): Promise<{ success: boolean; assets: string[]; errors: string[] }> {
    const results = { success: true, assets: [] as string[], errors: [] as string[] };

    for (const asset of this.DEFAULT_TRUSTED_ASSETS) {
      if (!asset.issuer) {
        logger.warn(`Skipping ${asset.code} trustline: issuer not configured in env`);
        results.errors.push(`${asset.code} issuer not configured`);
        continue;
      }

      try {
        logger.info(`Creating ${asset.code} trustline for ${publicKey}`);

        // Build the trustline XDR
        const trustlineXdr = await StellarService.buildTrustlineXdr({
          sourcePublicKey: publicKey,
          assetCode: asset.code,
          assetIssuer: asset.issuer,
        });

        // Sign and submit the trustline transaction
        const result = await StellarService.signAndSubmitXdr(
          userId,
          secretKey,
          trustlineXdr,
          {
            user_id: userId,
            type: 'trustline',
            asset_code: asset.code,
            source_public_key: publicKey,
            context: `Auto-setup trustline during onboarding for ${asset.code}`,
          }
        );

        if (result.success && result.hash) {
          logger.info(`${asset.code} trustline created successfully: ${result.hash}`);
          results.assets.push(`${asset.code} (hash: ${result.hash})`);
        } else {
          const errorMsg = `Failed to create ${asset.code} trustline`;
          logger.error(errorMsg);
          results.errors.push(errorMsg);
          results.success = false;
        }
      } catch (error: any) {
        const errorMsg = `${asset.code} trustline error: ${error?.message || String(error)}`;
        logger.error(errorMsg);
        results.errors.push(errorMsg);
        results.success = false;
      }
    }

    return results;
  }

  /**
   * Adds trustlines to an existing account (batch operation)
   */
  static async addTrustlinesToExistingAccount(
    publicKey: string,
    secretKey: string,
    userId: string
  ): Promise<{ success: boolean; assets: string[] }> {
    const result = await this.createDefaultTrustlines(publicKey, secretKey, userId);
    return { success: result.success, assets: result.assets };
  }
}
