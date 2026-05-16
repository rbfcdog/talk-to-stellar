import { StellarService } from './stellar.service';
import { logger } from '../../utils/logger';
import { getDefaultTrustedAssets } from '../../config/assets';

type TrustlineAsset = { code: string; issuer: string };

export class TrustlineService {
  private static issuerReachabilityCache = new Map<string, boolean>();

  private static getDefaultTrustlineAssets(): Array<{ code: string; issuer: string }> {
    return getDefaultTrustedAssets();
  }

  private static async isIssuerReachable(issuer: string): Promise<boolean> {
    const normalizedIssuer = String(issuer || '').trim();
    if (!normalizedIssuer) return false;
    if (this.issuerReachabilityCache.has(normalizedIssuer)) {
      return Boolean(this.issuerReachabilityCache.get(normalizedIssuer));
    }
    try {
      await StellarService.loadAccount(normalizedIssuer);
      this.issuerReachabilityCache.set(normalizedIssuer, true);
      return true;
    } catch (error: any) {
      const status = Number(error?.response?.status || 0);
      const reachable = status !== 404;
      this.issuerReachabilityCache.set(normalizedIssuer, reachable);
      return reachable;
    }
  }

  static async createTrustline(
    publicKey: string,
    secretKey: string,
    userId: string,
    asset: TrustlineAsset,
    existingTrustlines?: Set<string>
  ): Promise<{ success: boolean; asset?: string; error?: string; existing: boolean }> {
    const trustlineKey = `${asset.code}:${asset.issuer}`;
    const knownTrustlines = existingTrustlines || new Set(
      ((await StellarService.loadAccount(publicKey)).balances || [])
        .filter((balance: any) => balance.asset_type !== 'native')
        .map((balance: any) => `${String(balance.asset_code || '').toUpperCase()}:${String(balance.asset_issuer || '')}`)
    );
    if (knownTrustlines.has(trustlineKey)) {
      logger.info(`Skipping ${asset.code} trustline for ${publicKey}: already exists`);
      return { success: true, asset: asset.code, existing: true };
    }

    if (!asset.issuer) {
      const error = `${asset.code} issuer not configured`;
      logger.warn(`Skipping ${asset.code} trustline: issuer not configured in env`);
      return { success: false, error, existing: false };
    }

    const issuerReachable = await this.isIssuerReachable(asset.issuer);
    if (!issuerReachable) {
      const error = `${asset.code} issuer ${asset.issuer} not found on current Stellar network`;
      logger.warn(`Skipping ${asset.code} trustline for ${publicKey}: ${error}`);
      return { success: false, error, existing: false };
    }

    try {
      logger.info(`Creating ${asset.code} trustline for ${publicKey}`);

      const trustlineXdr = await StellarService.buildTrustlineXdr({
        sourcePublicKey: publicKey,
        assetCode: asset.code,
        assetIssuer: asset.issuer,
      });

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
        knownTrustlines.add(trustlineKey);
        return { success: true, asset: `${asset.code} (hash: ${result.hash})`, existing: false };
      }

      const error = `Failed to create ${asset.code} trustline`;
      logger.error(error);
      return { success: false, error, existing: false };
    } catch (error: any) {
      const errorMsg = `${asset.code} trustline error: ${error?.message || String(error)}`;
      logger.error(errorMsg);
      return { success: false, error: errorMsg, existing: false };
    }
  }

  static async createDefaultTrustlines(
    publicKey: string,
    secretKey: string,
    userId: string
  ): Promise<{ success: boolean; assets: string[]; errors: string[] }> {
    const results = { success: true, assets: [] as string[], errors: [] as string[] };
    const account = await StellarService.loadAccount(publicKey);
    const existingTrustlines = new Set(
      (account.balances || [])
        .filter((balance: any) => balance.asset_type !== 'native')
        .map((balance: any) => `${String(balance.asset_code || '').toUpperCase()}:${String(balance.asset_issuer || '')}`)
    );

    for (const asset of this.getDefaultTrustlineAssets()) {
      const result = await this.createTrustline(publicKey, secretKey, userId, asset, existingTrustlines);
      if (result.success) {
        if (result.asset && !result.existing) results.assets.push(result.asset);
      } else if (result.error) {
        results.errors.push(result.error);
        results.success = false;
      }
    }

    return results;
  }

  static async addTrustlinesToExistingAccount(
    publicKey: string,
    secretKey: string,
    userId: string
  ): Promise<{ success: boolean; assets: string[] }> {
    const result = await this.createDefaultTrustlines(publicKey, secretKey, userId);
    return { success: result.success, assets: result.assets };
  }
}
