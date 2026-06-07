import { StellarService } from './stellar.service';
import { DefindexYieldService } from './defindex-yield.service';
import { logger } from '../../utils/logger';
import { getDefaultTrustedAssets, getStellarNetworkName, isUsdcDefaultTrustlineEnabled } from '../../config/assets';
import { sleep } from '../../utils/async';

type TrustlineAsset = { code: string; issuer: string };
type ExistingTrustlineSnapshot = { account: any; trustlines: Set<string> };

const STELLAR_BASE_RESERVE_XLM = 0.5;
const TRUSTLINE_RESERVE_BUFFER_XLM = 0.75;

export class TrustlineService {
  private static issuerReachabilityCache = new Map<string, boolean>();
  private static trustlineSetupLocks = new Map<string, Promise<{ success: boolean; assets: string[]; errors: string[] }>>();
  private static ephemeralTestnetTopupSecret?: Promise<string>;

  private static async getDefaultTrustlineAssets(): Promise<Array<{ code: string; issuer: string }>> {
    const configured = getDefaultTrustedAssets();
    let vaultAssets: Array<{ code: string; issuer: string }> = [];
    try {
      vaultAssets = await DefindexYieldService.getVaultTrustedAssets();
    } catch (error) {
      logger.warn(`[trustline] could not load Defindex vault assets for trustline setup: ${this.errorMessage(error)}`);
    }
    return Array.from(
      new Map([...configured, ...vaultAssets].map((asset) => [`${asset.code}:${asset.issuer}`, asset])).values()
    ).filter((asset) => asset.code !== 'USDC' || isUsdcDefaultTrustlineEnabled());
  }

  private static trustlineKey(asset: TrustlineAsset): string {
    return `${String(asset.code || '').trim().toUpperCase()}:${String(asset.issuer || '').trim()}`;
  }

  private static async loadExistingTrustlines(publicKey: string): Promise<Set<string>> {
    const account = await StellarService.loadAccount(publicKey);
    return this.trustlinesFromAccount(account);
  }

  private static trustlinesFromAccount(account: any): Set<string> {
    return new Set(
      (account.balances || [])
        .filter((balance: any) => balance.asset_type !== 'native')
        .map((balance: any) => `${String(balance.asset_code || '').toUpperCase()}:${String(balance.asset_issuer || '')}`)
    );
  }

  private static nativeBalance(account: any): number {
    const native = (account.balances || []).find((balance: any) => balance.asset_type === 'native');
    const amount = Number(native?.balance || '0');
    return Number.isFinite(amount) ? amount : 0;
  }

  private static subentryCount(account: any): number {
    const count = Number(account?.subentry_count || 0);
    return Number.isFinite(count) ? count : 0;
  }

  private static requiredXlmForMissingTrustlines(account: any, missingTrustlineCount: number): number {
    const futureSubentries = this.subentryCount(account) + Math.max(0, missingTrustlineCount);
    return ((2 + futureSubentries) * STELLAR_BASE_RESERVE_XLM) + TRUSTLINE_RESERVE_BUFFER_XLM;
  }

  private static configuredTestnetTopupSecret(): string {
    return String(
      process.env.TRUSTLINE_TOPUP_SECRET ||
      process.env.STELLAR_TESTNET_FUNDER_SECRET ||
      process.env.TESOURO_DISTRIBUTOR_SECRET ||
      process.env.USDC_DISTRIBUTOR_SECRET ||
      process.env.STELLAR_SECRET_KEY ||
      ''
    ).trim();
  }

  private static async testnetTopupSecret(): Promise<string> {
    const configured = this.configuredTestnetTopupSecret();
    if (configured || getStellarNetworkName() !== 'TESTNET') {
      return configured;
    }

    if (!this.ephemeralTestnetTopupSecret) {
      this.ephemeralTestnetTopupSecret = StellarService.createTestAccount()
        .then((account) => {
          logger.info(`[trustline] created ephemeral testnet reserve funder ${account.publicKey}`);
          return account.secret;
        })
        .catch((error) => {
          logger.warn(`[trustline] could not create ephemeral testnet reserve funder: ${this.errorMessage(error)}`);
          return '';
        });
    }

    return this.ephemeralTestnetTopupSecret;
  }

  private static formatXlmAmount(amount: number): string {
    const safe = Math.max(0, Math.ceil(amount * 1e7) / 1e7);
    return safe.toFixed(7);
  }

  private static errorMessage(error: any): string {
    if (!error) return 'Unknown error';
    if (error instanceof Error && error.message && error.message !== '[object Object]') {
      return error.message;
    }
    const data = error?.response?.data;
    const resultCodes = data?.extras?.result_codes;
    if (resultCodes) {
      return `Horizon transaction failed: ${JSON.stringify(resultCodes)}`;
    }
    if (data?.title || data?.detail) {
      return [data.title, data.detail].filter(Boolean).join(': ');
    }
    try {
      return JSON.stringify(error);
    } catch {
      return String(error);
    }
  }

  private static isMissingAccountError(error: any): boolean {
    const status = Number(error?.response?.status || 0);
    const message = this.errorMessage(error).toLowerCase();
    return status === 404 || message.includes('not found');
  }

  private static async loadAccountOrCreateTestnet(publicKey: string): Promise<any> {
    try {
      return await StellarService.loadAccount(publicKey);
    } catch (error: any) {
      if (getStellarNetworkName() !== 'TESTNET' || !this.isMissingAccountError(error)) {
        throw error;
      }
      logger.info(`[trustline] funding missing testnet account before trustlines: ${publicKey}`);

      const maxAttempts = Math.max(1, Number(process.env.TRUSTLINE_ACCOUNT_FUND_MAX_ATTEMPTS || 3));
      let lastError = '';
      for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        try {
          await StellarService.ensureTestnetAccountFunded(publicKey, 0);
          return await StellarService.loadAccount(publicKey);
        } catch (fundError: any) {
          lastError = this.errorMessage(fundError);
          if (attempt < maxAttempts && this.shouldRetryTrustline(lastError)) {
            await sleep(1000 * attempt);
            continue;
          }
          break;
        }
      }

      throw new Error(`Could not fund missing testnet account ${publicKey}: ${lastError || this.errorMessage(error)}`);
    }
  }

  private static async topUpReserveIfNeeded(publicKey: string, account: any, missingTrustlineCount: number): Promise<any> {
    if (getStellarNetworkName() !== 'TESTNET' || missingTrustlineCount <= 0) {
      return account;
    }

    const requiredXlm = this.requiredXlmForMissingTrustlines(account, missingTrustlineCount);
    const currentXlm = this.nativeBalance(account);
    if (currentXlm >= requiredXlm) {
      return account;
    }

    const topupSecret = await this.testnetTopupSecret();
    const needed = requiredXlm - currentXlm;
    if (!topupSecret) {
      logger.warn(
        `[trustline] ${publicKey} has ${currentXlm.toFixed(7)} XLM but needs about ${requiredXlm.toFixed(7)} XLM for ${missingTrustlineCount} missing trustline(s). Configure TRUSTLINE_TOPUP_SECRET to repair automatically outside testnet.`
      );
      return account;
    }

    const configuredMinimum = Number(process.env.TRUSTLINE_TOPUP_MIN_XLM || '2');
    const amount = this.formatXlmAmount(Math.max(needed + 0.25, Number.isFinite(configuredMinimum) ? configuredMinimum : 2));
    logger.info(`[trustline] topping up ${publicKey} with ${amount} XLM for default trustline reserve`);
    const topup = await StellarService.submitAssetPaymentFromSecret({
      sourceSecret: topupSecret,
      destination: publicKey,
      amount,
      assetCode: 'XLM',
      memoText: 'TRUSTLINE TOPUP',
    });

    if (!topup.success) {
      logger.warn(`[trustline] reserve top-up failed for ${publicKey}: ${topup.error || 'unknown error'}`);
      return account;
    }

    logger.info(`[trustline] reserve top-up submitted for ${publicKey}: ${topup.hash || 'hash unavailable'}`);
    await sleep(1000);
    return await StellarService.loadAccount(publicKey);
  }

  private static async ensureAccountReadyForDefaultTrustlines(publicKey: string): Promise<ExistingTrustlineSnapshot> {
    let account = await this.loadAccountOrCreateTestnet(publicKey);
    let trustlines = this.trustlinesFromAccount(account);
    const missingTrustlineCount = (await this.getDefaultTrustlineAssets())
      .filter((asset) => Boolean(asset.issuer) && !trustlines.has(this.trustlineKey(asset)))
      .length;

    account = await this.topUpReserveIfNeeded(publicKey, account, missingTrustlineCount);
    trustlines = this.trustlinesFromAccount(account);
    return { account, trustlines };
  }

  private static async hasTrustline(publicKey: string, asset: TrustlineAsset): Promise<boolean> {
    try {
      return (await this.loadExistingTrustlines(publicKey)).has(this.trustlineKey(asset));
    } catch {
      return false;
    }
  }

  private static shouldRetryTrustline(error: string): boolean {
    return /tx_bad_seq|bad_seq|op_low_reserve|low_reserve|timeout|timed out|temporarily|try again|rate limit|504|503|502/i.test(error);
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
  ): Promise<{ success: boolean; asset?: string; hash?: string; error?: string; existing: boolean }> {
    const normalizedAsset = {
      code: String(asset.code || '').trim().toUpperCase(),
      issuer: String(asset.issuer || '').trim(),
    };
    const trustlineKey = this.trustlineKey(normalizedAsset);
    const knownTrustlines = existingTrustlines || await this.loadExistingTrustlines(publicKey);
    if (knownTrustlines.has(trustlineKey)) {
      logger.info(`Skipping ${normalizedAsset.code} trustline for ${publicKey}: already exists`);
      return { success: true, asset: normalizedAsset.code, existing: true };
    }

    if (!normalizedAsset.issuer) {
      const error = `${normalizedAsset.code} issuer not configured`;
      logger.warn(`Skipping ${normalizedAsset.code} trustline: issuer not configured in env`);
      return { success: false, error, existing: false };
    }

    const issuerReachable = await this.isIssuerReachable(normalizedAsset.issuer);
    if (!issuerReachable) {
      const error = `${normalizedAsset.code} issuer ${normalizedAsset.issuer} not found on current Stellar network`;
      logger.warn(`Skipping ${normalizedAsset.code} trustline for ${publicKey}: ${error}`);
      return { success: false, error, existing: false };
    }

    const maxAttempts = Math.max(1, Number(process.env.TRUSTLINE_CREATE_MAX_ATTEMPTS || 3));
    let lastError = '';

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        logger.info(`Creating ${normalizedAsset.code} trustline for ${publicKey} (attempt ${attempt}/${maxAttempts})`);

        const trustlineXdr = await StellarService.buildTrustlineXdr({
          sourcePublicKey: publicKey,
          assetCode: normalizedAsset.code,
          assetIssuer: normalizedAsset.issuer,
        });

        const result = await StellarService.signAndSubmitXdr(
          userId,
          secretKey,
          trustlineXdr,
          {
            user_id: userId,
            type: 'trustline',
            asset_code: normalizedAsset.code,
            source_public_key: publicKey,
            context: `Auto-setup trustline during onboarding for ${normalizedAsset.code}`,
          }
        );

        if (result.success && result.hash) {
          logger.info(`${normalizedAsset.code} trustline created successfully: ${result.hash}`);
          knownTrustlines.add(trustlineKey);
          return { success: true, asset: normalizedAsset.code, hash: result.hash, existing: false };
        }

        lastError = result.error || `Failed to create ${normalizedAsset.code} trustline`;
        if (await this.hasTrustline(publicKey, normalizedAsset)) {
          knownTrustlines.add(trustlineKey);
          return { success: true, asset: normalizedAsset.code, existing: true };
        }
      } catch (error: any) {
        lastError = `${normalizedAsset.code} trustline error: ${this.errorMessage(error)}`;
        if (await this.hasTrustline(publicKey, normalizedAsset)) {
          knownTrustlines.add(trustlineKey);
          return { success: true, asset: normalizedAsset.code, existing: true };
        }
      }

      if (attempt < maxAttempts && this.shouldRetryTrustline(lastError)) {
        await sleep(750 * attempt);
        continue;
      }

      break;
    }

    const error = lastError || `Failed to create ${normalizedAsset.code} trustline`;
    logger.error(error);
    return { success: false, error, existing: false };
  }

  static async ensureTrustline(
    publicKey: string,
    secretKey: string,
    userId: string,
    asset: TrustlineAsset
  ): Promise<{ success: boolean; asset?: string; hash?: string; error?: string; existing: boolean }> {
    const normalizedAsset = {
      code: String(asset.code || '').trim().toUpperCase(),
      issuer: String(asset.issuer || '').trim(),
    };

    let account = await this.loadAccountOrCreateTestnet(publicKey);
    let existingTrustlines = this.trustlinesFromAccount(account);
    if (existingTrustlines.has(this.trustlineKey(normalizedAsset))) {
      return { success: true, asset: normalizedAsset.code, existing: true };
    }

    account = await this.topUpReserveIfNeeded(publicKey, account, 1);
    existingTrustlines = this.trustlinesFromAccount(account);
    return this.createTrustline(publicKey, secretKey, userId, normalizedAsset, existingTrustlines);
  }

  private static async createDefaultTrustlinesUnlocked(
    publicKey: string,
    secretKey: string,
    userId: string
  ): Promise<{ success: boolean; assets: string[]; errors: string[] }> {
    const results = { success: true, assets: [] as string[], errors: [] as string[] };
    const { trustlines: existingTrustlines } = await this.ensureAccountReadyForDefaultTrustlines(publicKey);

    for (const asset of await this.getDefaultTrustlineAssets()) {
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

  static async createDefaultTrustlines(
    publicKey: string,
    secretKey: string,
    userId: string
  ): Promise<{ success: boolean; assets: string[]; errors: string[] }> {
    const lockKey = String(publicKey || '').trim();
    const previous = this.trustlineSetupLocks.get(lockKey) || Promise.resolve({
      success: true,
      assets: [],
      errors: [],
    });
    const run = previous
      .catch(() => ({ success: false, assets: [], errors: [] }))
      .then(() => this.createDefaultTrustlinesUnlocked(publicKey, secretKey, userId));

    if (lockKey) {
      this.trustlineSetupLocks.set(lockKey, run);
      run.finally(() => {
        if (this.trustlineSetupLocks.get(lockKey) === run) {
          this.trustlineSetupLocks.delete(lockKey);
        }
      }).catch(() => undefined);
    }

    return run;
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
