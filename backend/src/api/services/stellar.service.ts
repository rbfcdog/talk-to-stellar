import { Keypair, Operation, Asset, Memo, Networks, TransactionBuilder } from '@stellar/stellar-sdk';
import { server, stellarConfig } from '../../config/stellar';
import { OperationRepository } from '../repository/operation.repository';
import { Operation as OpType } from '../../types';
import { getAssetIssuer, getStellarNetworkName, getTrustedPathAssetCodes, settlementAssetCode } from '../../config/assets';
import { PlatformFeeService, PlatformSpreadFee } from './platform-fee.service';
import { DEFAULT_NETWORK_FEE_XLM } from '../../utils/fee-display';
import { assertSaneBrlUsdcQuote } from './quote-rate-sanity.service';

const STELLAR_BASE_FEE_STROOPS = '100';

function isFriendbotAccountAlreadyExists(body: string): boolean {
    const normalized = String(body || '').toLowerCase();
    return normalized.includes('createaccountalreadyexist') ||
        normalized.includes('create_account_already_exist') ||
        normalized.includes('account already exist') ||
        normalized.includes('account already exists');
}

interface BuildPaymentInput {
  sourcePublicKey: string;
  destination: string;
  amount: string;
  assetCode?: string;
  assetIssuer?: string;
  memoText?: string;
}

interface BuildCreateAccountInput {
  sourcePublicKey: string;
  destination: string;
  startingBalance: string;
  memoText?: string;
}

interface AssetInput {
  code: string;
  issuer?: string;
}

interface BuildPathPaymentInput {
  sourcePublicKey: string;
  destination: string;
  destAsset: AssetInput;
  destAmount: string;
  sourceAsset: AssetInput;
  quote?: PathPaymentQuote;
}

interface PathPaymentQuoteInput extends BuildPathPaymentInput {}

interface StrictSendConversionInput {
  sourcePublicKey: string;
  destination: string;
  sourceAsset: AssetInput;
  sourceAmount: string;
  destAsset: AssetInput;
  memoText?: string;
  quote?: StrictSendConversionQuote;
}

interface PathPaymentQuote {
  sourceAsset: {
    code: string;
    issuer?: string;
  };
  destinationAsset: {
    code: string;
    issuer?: string;
  };
  destinationAmount: string;
  sourceAmount: string;
  sourceMax: string;
  pathSourceAmount?: string;
  pathSourceMax?: string;
  platformFee?: PlatformSpreadFee;
  networkFeeXlm: string;
  path: Array<{
    code: string;
    issuer?: string;
    type: string;
  }>;
}

interface StrictSendConversionQuote {
  sourceAsset: {
    code: string;
    issuer?: string;
  };
  destinationAsset: {
    code: string;
    issuer?: string;
  };
  sourceAmount: string;
  effectiveSourceAmount?: string;
  destinationAmount: string;
  destinationMin: string;
  platformFee?: PlatformSpreadFee;
  networkFeeXlm: string;
  path: Array<{
    code: string;
    issuer?: string;
    type: string;
  }>;
}

interface SubmittedPaymentDetails {
    sourceAmount: string;
    sourceAssetCode: string;
    sourceAssetIssuer?: string;
    destinationAmount: string;
    destinationAssetCode: string;
    destinationAssetIssuer?: string;
    feeXlm: string;
}

function sanitizeMemoText(value: string): string | undefined {
    // Memo text max is 28 bytes; keep printable ASCII and trim to limit
    const normalized = String(value || '').replace(/[^\x20-\x7E]/g, '').trim();
    if (!normalized) return undefined;

    let memo = normalized;
    while (Buffer.byteLength(memo, 'utf8') > 28) {
        memo = memo.slice(0, -1);
    }

    return memo || undefined;
}

function isValidStellarPublicKey(key: string): boolean {
    // Stellar public keys: Start with 'G', 56 characters, base32 (A-Z, 2-7)
    return /^G[A-Z2-7]{55}$/.test(key);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isHorizonNotFound(error: any): boolean {
  const status = error?.response?.status;
  const message = String(error?.message || error || '').toLowerCase();
  return status === 404 || message === 'not found' || message.includes('not found');
}

function addAssetAmounts(...values: Array<string | number | undefined>): string {
    const total = values.reduce<number>((sum, value) => {
        const parsed = Number(String(value || '0').replace(',', '.'));
        return sum + (Number.isFinite(parsed) ? parsed : 0);
    }, 0);
    return total.toFixed(7).replace(/\.?0+$/, '');
}

function createAsset(input: AssetInput): Asset {
    const code = settlementAssetCode(input.code || '').toUpperCase();
    if (code === 'XLM' || code === 'NATIVE') {
        return Asset.native();
    }

    const resolvedIssuer = String(input.issuer || getAssetIssuer(code) || '').trim();
    if (!resolvedIssuer) {
        throw new Error(`Asset issuer is required for ${code}.`);
    }

    // Validate that issuer is a valid Stellar public key
    if (!isValidStellarPublicKey(resolvedIssuer)) {
        console.error(`Invalid issuer for ${code}: "${resolvedIssuer}" (length: ${resolvedIssuer.length})`);
        throw new Error(`Asset issuer for ${code} is invalid: "${resolvedIssuer}". Must be a valid Stellar public key (56 characters, starting with 'G').`);
    }

    return new Asset(code, resolvedIssuer);
}

function assetCode(asset: Asset): string {
    return asset.isNative() ? 'XLM' : asset.getCode();
}

function assetIssuer(asset: Asset): string | undefined {
    return asset.isNative() ? undefined : asset.getIssuer();
}

function sameSymbolDifferentIssuer(sourceAsset: Asset, destinationAsset: Asset): boolean {
    const sourceCode = assetCode(sourceAsset);
    const destinationCode = assetCode(destinationAsset);
    if (!sourceCode || sourceCode !== destinationCode) return false;
    if (sourceCode === 'XLM') return false;
    return String(assetIssuer(sourceAsset) || '') !== String(assetIssuer(destinationAsset) || '');
}

function assertSafeSameSymbolConversion(input: {
    sourceAsset: Asset;
    destinationAsset: Asset;
    sourceAmount: string;
    destinationAmount: string;
    context: string;
}) {
    if (!sameSymbolDifferentIssuer(input.sourceAsset, input.destinationAsset)) return;

    const sourceAmount = Number(String(input.sourceAmount || '0').replace(',', '.'));
    const destinationAmount = Number(String(input.destinationAmount || '0').replace(',', '.'));
    const minimumRatio = Math.max(0.01, Number(process.env.DEFINDEX_MIN_SAME_ASSET_CONVERSION_RATIO || 0.98));
    const ratio = sourceAmount > 0 && destinationAmount > 0 ? destinationAmount / sourceAmount : 0;

    if (!Number.isFinite(ratio) || ratio < minimumRatio) {
        throw new Error(
            `Unsafe same-symbol conversion blocked in ${input.context}: ` +
            `${assetCode(input.sourceAsset)} source=${input.sourceAmount} destination=${input.destinationAmount} ratio=${ratio.toFixed(6)} minimum=${minimumRatio}.`
        );
    }
}

function buildNoPathDiagnostic(sourceAssetObj: Asset, destAssetObj: Asset, extraHints: string[] = []): string {
    const sourceCode = assetCode(sourceAssetObj);
    const destCode = assetCode(destAssetObj);
    const sourceIssuer = assetIssuer(sourceAssetObj);
    const destIssuer = assetIssuer(destAssetObj);
    const network = getStellarNetworkName();
    const hints: string[] = [];

    if (destCode === 'USDC' && !getAssetIssuer('USDC')) {
        hints.push('USDC_ISSUER não configurado no backend');
    }
    if ((destCode === 'BRL' || destCode === 'TESOURO') && !getAssetIssuer('TESOURO')) {
        hints.push('TESOURO_ISSUER não configurado no backend');
    }
    hints.push('Sem rota de liquidez na DEX para esse par/valor neste momento');
    hints.push('Confirme trustline do ativo de destino na wallet');
    if (!(sourceCode === 'BRL' || sourceCode === 'TESOURO' || destCode === 'BRL' || destCode === 'TESOURO')) {
        hints.push('Se estiver em testnet, confirme a liquidez XLM/USDC no issuer configurado');
    }
    for (const hint of extraHints) {
        if (hint) hints.push(hint);
    }

    return [
        `Não foi encontrado caminho de conversão entre ${sourceCode} e ${destCode}.`,
        `source_issuer=${sourceIssuer || 'native'}; dest_issuer=${destIssuer || 'native'}.`,
        `Diagnóstico: ${hints.join(' | ')}.`,
    ].join(' ');
}

const issuerAvailabilityCache = new Map<string, boolean>();

async function issuerExistsOnCurrentNetwork(issuer?: string): Promise<boolean> {
    const normalizedIssuer = String(issuer || '').trim();
    if (!normalizedIssuer) return false;
    if (issuerAvailabilityCache.has(normalizedIssuer)) {
        return Boolean(issuerAvailabilityCache.get(normalizedIssuer));
    }
    try {
        await server.loadAccount(normalizedIssuer);
        issuerAvailabilityCache.set(normalizedIssuer, true);
        return true;
    } catch (error: any) {
        const status = Number(error?.response?.status || 0);
        if (status === 404) {
            issuerAvailabilityCache.set(normalizedIssuer, false);
            return false;
        }
        issuerAvailabilityCache.set(normalizedIssuer, false);
        return false;
    }
}

async function buildNoPathExtraHints(sourceAssetObj: Asset, destAssetObj: Asset): Promise<string[]> {
    const hints: string[] = [];
    const network = getStellarNetworkName();
    const sourceCode = assetCode(sourceAssetObj);
    const destCode = assetCode(destAssetObj);
    const sourceIssuer = assetIssuer(sourceAssetObj);
    const destIssuer = assetIssuer(destAssetObj);

    if (sourceCode !== 'XLM' && sourceIssuer) {
        const sourceIssuerExists = await issuerExistsOnCurrentNetwork(sourceIssuer);
        if (!sourceIssuerExists) {
            hints.push(`Issuer da origem (${sourceCode}) não foi encontrado na rede ${network}: ${sourceIssuer}.`);
        }
    }

    if (destCode !== 'XLM' && destIssuer) {
        const destIssuerExists = await issuerExistsOnCurrentNetwork(destIssuer);
        if (!destIssuerExists) {
            hints.push(`Issuer do destino (${destCode}) não foi encontrado na rede ${network}: ${destIssuer}.`);
        }
    }

    if (network === 'TESTNET' && (sourceCode === 'TESOURO' || destCode === 'TESOURO')) {
        const configuredTesouroIssuer = String(getAssetIssuer('TESOURO') || '').trim();
        if (!configuredTesouroIssuer) {
            hints.push('TESOURO_ISSUER não está configurado para TESTNET.');
        }
    }

    return hints;
}

function codeFromRecordAsset(type?: string, code?: string): string {
    return type === 'native' ? 'XLM' : String(code || '').toUpperCase();
}

function recordAsset(record: any, side: 'source' | 'destination'): { code: string; issuer?: string } {
    const typeKey = `${side}_asset_type`;
    const codeKey = `${side}_asset_code`;
    const issuerKey = `${side}_asset_issuer`;
    const type = String(record?.[typeKey] || '').toLowerCase();

    if (type === 'native') {
        return { code: 'XLM' };
    }

    const code = codeFromRecordAsset(type, record?.[codeKey]);
    const issuer = String(record?.[issuerKey] || '').trim() || undefined;
    return { code, issuer };
}

function assetMatchesExpected(actual: { code: string; issuer?: string }, expected: Asset): boolean {
    const expectedCode = assetCode(expected);
    const expectedIssuer = assetIssuer(expected);
    if (actual.code !== expectedCode) return false;
    if (expectedCode === 'XLM') return true;
    return String(actual.issuer || '') === String(expectedIssuer || '');
}

function hopAssetIsTrusted(pathAsset: any): boolean {
    const type = String(pathAsset?.asset_type || '').toLowerCase();
    if (type === 'native') return true;

    const code = String(pathAsset?.asset_code || '').toUpperCase();
    const trustedAssetCodes = getTrustedPathAssetCodes();
    if (!code || !trustedAssetCodes.includes(code)) return false;

    const expectedIssuer = getAssetIssuer(code);
    const actualIssuer = String(pathAsset?.asset_issuer || '').trim();
    if (!expectedIssuer || !actualIssuer) return false;
    return actualIssuer === expectedIssuer;
}

function selectTrustedConversionPaths(records: any[], sourceAssetObj: Asset, destAssetObj: Asset): any[] {
    const enforceTrusted =
        String(process.env.STELLAR_ENFORCE_TRUSTED_PATH_ASSETS || 'true').trim().toLowerCase() !== 'false';
    if (!enforceTrusted) {
        const candidates = Array.isArray(records) ? records : [];
        const preferDirect = String(process.env.STELLAR_PREFER_DIRECT_PATHS || 'true').trim().toLowerCase() !== 'false';
        if (!preferDirect) return candidates;
        const direct = candidates.filter((record) => !Array.isArray(record?.path) || record.path.length === 0);
        return direct.length > 0 ? direct : candidates;
    }

    const trusted = (Array.isArray(records) ? records : []).filter((record) => {
        const source = recordAsset(record, 'source');
        const destination = recordAsset(record, 'destination');
        if (!assetMatchesExpected(source, sourceAssetObj)) return false;
        if (!assetMatchesExpected(destination, destAssetObj)) return false;

        const hops = Array.isArray(record?.path) ? record.path : [];
        return hops.every((pathAsset: any) => hopAssetIsTrusted(pathAsset));
    });

    const preferDirect = String(process.env.STELLAR_PREFER_DIRECT_PATHS || 'true').trim().toLowerCase() !== 'false';
    if (!preferDirect) return trusted;

    const direct = trusted.filter((record) => !Array.isArray(record?.path) || record.path.length === 0);
    return direct.length > 0 ? direct : trusted;
}

export class StellarService {
  private static fundedAccounts = new Set<string>();

  static generateStellarKeypair(): { publicKey: string; secret: string } {
    const pair = Keypair.random();
    return {
      publicKey: pair.publicKey(),
      secret: pair.secret(),
    };
  }

  static async createTestAccount(): Promise<{ publicKey: string; secret: string }> {
    const { publicKey, secret } = this.generateStellarKeypair();

    await this.fundWithFriendbot(publicKey);
    await this.waitForAccount(publicKey);

    return { publicKey, secret };
  }

  static async fundWithFriendbot(publicKey: string): Promise<void> {
    if (stellarConfig.network !== Networks.TESTNET || !stellarConfig.friendbotUrl) {
      throw new Error('Friendbot funding is only available on Stellar Testnet.');
    }

    const response = await fetch(`${stellarConfig.friendbotUrl}?addr=${encodeURIComponent(publicKey)}`, {
      signal: AbortSignal.timeout(Number(process.env.STELLAR_FRIENDBOT_TIMEOUT_MS || 5000)),
    });
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      if (response.status === 400 && isFriendbotAccountAlreadyExists(body)) {
        this.fundedAccounts.add(publicKey);
        return;
      }
      throw new Error(`Failed to fund account using Friendbot: ${response.status} ${body}`);
    }
    await response.json().catch(() => undefined);
    this.fundedAccounts.add(publicKey);
  }

  static async waitForAccount(publicKey: string, attempts = 6): Promise<void> {
    let lastError: any;
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      try {
        await server.loadAccount(publicKey);
        return;
      } catch (error: any) {
        lastError = error;
        if (!isHorizonNotFound(error) || attempt === attempts - 1) {
          throw error;
        }
        await sleep(300 * (attempt + 1));
      }
    }
    if (lastError) throw lastError;
  }

  static async ensureTestnetAccountFunded(publicKey: string, minimumXlm = 0): Promise<void> {
    const isTestnet =
      stellarConfig.network === Networks.TESTNET ||
      stellarConfig.horizonUrl.toLowerCase().includes('testnet');

    if (!isTestnet) {
      return;
    }

    if (this.fundedAccounts.has(publicKey)) {
      return;
    }

    try {
      const account = await server.loadAccount(publicKey);
      const nativeBalance = account.balances.find((balance) => balance.asset_type === 'native');
      const balance = nativeBalance ? parseFloat(nativeBalance.balance) : 0;

      if (balance >= minimumXlm) {
        return;
      }
    } catch (error: any) {
      const status = error?.response?.status;
      if (status && status !== 404) {
        throw error;
      }
    }

    await this.fundWithFriendbot(publicKey);
    await this.waitForAccount(publicKey);

    if (minimumXlm > 0) {
      const account = await server.loadAccount(publicKey);
      const nativeBalance = account.balances.find((balance) => balance.asset_type === 'native');
      const balance = nativeBalance ? parseFloat(nativeBalance.balance) : 0;
      if (balance < minimumXlm) {
        throw new Error(`Testnet account exists but does not have enough XLM for this operation. Required: ${minimumXlm.toFixed(7)} XLM.`);
      }
    }
  }

  private static getHorizonErrorMessage(error: any): string {
    const data = error?.response?.data;
    const resultCodes = data?.extras?.result_codes;
    const resultXdr = data?.extras?.result_xdr;
    const timeoutHash = this.getHorizonSubmissionTimeoutHash(error);

    if (timeoutHash) {
      return `Horizon submission timed out after receiving hash ${timeoutHash}. Poll the transaction before resubmitting.`;
    }

    if (resultCodes) {
      return `Horizon transaction failed: ${JSON.stringify(resultCodes)}${resultXdr ? ` result_xdr=${resultXdr}` : ''}`;
    }

    return error instanceof Error ? error.message : String(error);
  }

  private static getHorizonSubmissionTimeoutHash(error: any): string {
    const status = Number(error?.response?.status || 0);
    const data = error?.response?.data;
    const title = String(data?.title || '').toLowerCase();
    const detail = String(data?.detail || '').toLowerCase();
    const hash = String(data?.extras?.hash || '').trim();
    if (status === 504 && hash && (title.includes('timeout') || detail.includes('timed out'))) {
      return hash;
    }
    return '';
  }

  private static async waitForSubmittedTransaction(hash: string, attempts = 8, delayMs = 1500): Promise<any | null> {
    for (let attempt = 0; attempt < attempts; attempt += 1) {
      try {
        return await server.transactions().transaction(hash).call();
      } catch (error: any) {
        const status = Number(error?.response?.status || 0);
        if (status && status !== 404) {
          throw error;
        }
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
    return null;
  }

  private static async submitTransactionWithTimeoutRecovery(transaction: any): Promise<any> {
    try {
      return await server.submitTransaction(transaction);
    } catch (error) {
      const hash = this.getHorizonSubmissionTimeoutHash(error);
      if (!hash) throw error;

      const submitted = await this.waitForSubmittedTransaction(hash);
      if (submitted) {
        console.warn(`Horizon submission timed out but transaction was confirmed: ${hash}`);
        return { ...submitted, hash: submitted.hash || hash };
      }

      console.warn(`Horizon submission timed out and transaction was not confirmed yet: ${hash}`);
      throw error;
    }
  }

  static async loadAccount(publicKey: string) {
    return await server.loadAccount(publicKey);
  }

    static async buildPaymentXdr(input: BuildPaymentInput): Promise<string> {
        try {
            const { sourcePublicKey, destination, amount, assetCode, assetIssuer, memoText } = input;

            const directPlatformFee = PlatformFeeService.calculateSpread({
                sourceAmount: amount,
                sourceAssetCode: assetCode || 'XLM',
                destinationAssetCode: assetCode || 'XLM',
                mode: 'add_on_top',
            });
            const directFeeAmount = directPlatformFee.enabled ? directPlatformFee.feeAmount : '0';
            const totalDebitAmount = addAssetAmounts(amount, directFeeAmount);

            const nativeAmount = (!assetCode || assetCode === 'XLM') ? parseFloat(totalDebitAmount) : 0;
            await this.ensureTestnetAccountFunded(destination);
            await this.ensureTestnetAccountFunded(sourcePublicKey, nativeAmount + 2);

            const sourceAccount = await server.loadAccount(sourcePublicKey);

            const assetToSend = (assetCode && assetIssuer) ? new Asset(assetCode, assetIssuer) : Asset.native();
            
            const balanceLine = sourceAccount.balances.find(b => {
                if (assetToSend.isNative()) return b.asset_type === 'native';
                return b.asset_type !== 'native' && (b as any).asset_code === assetToSend.getCode() && (b as any).asset_issuer === assetToSend.getIssuer();
            });

            if (!balanceLine || parseFloat(balanceLine.balance) < parseFloat(totalDebitAmount)) {
                throw new Error(`Saldo insuficiente. Necessário: ${totalDebitAmount} ${assetCode || 'XLM'} incluindo taxa TalkToStellar.`);
            }

            const nativeBalanceLine = sourceAccount.balances.find(b => b.asset_type === 'native');
            const xlmBalance = nativeBalanceLine ? parseFloat(nativeBalanceLine.balance) : 0;
            
            const minimumReserve = 1.5; 
            const operationCount = directPlatformFee.enabled ? 2 : 1;
            const feeInXlm = (Number(STELLAR_BASE_FEE_STROOPS) * operationCount) / 10000000;
            let amountInXlm = assetToSend.isNative() ? parseFloat(totalDebitAmount) : 0;

            if (xlmBalance - amountInXlm - feeInXlm < minimumReserve) {
                throw new Error('Saldo de XLM insuficiente para cobrir a taxa da transação e a reserva mínima da conta.');
            }

            let asset: Asset;
            if (assetCode && assetIssuer) {
                asset = new Asset(assetCode, assetIssuer);
            } else {
                asset = Asset.native(); 
            }

            let transactionBuilder = new TransactionBuilder(sourceAccount, {
                fee: STELLAR_BASE_FEE_STROOPS,
                networkPassphrase: stellarConfig.network
            });

            transactionBuilder = transactionBuilder.addOperation(
                Operation.payment({
                    destination: destination,
                    asset: asset,
                    amount: amount
                })
            );

            if (directPlatformFee.enabled && directPlatformFee.treasuryPublicKey) {
                transactionBuilder = transactionBuilder.addOperation(
                    Operation.payment({
                        destination: directPlatformFee.treasuryPublicKey,
                        asset,
                        amount: directPlatformFee.feeAmount,
                    })
                );
            }

            if (memoText) {
                const safeMemo = sanitizeMemoText(memoText);
                if (safeMemo) {
                    transactionBuilder = transactionBuilder.addMemo(Memo.text(safeMemo));
                }
            }

            const transaction = transactionBuilder.setTimeout(300).build();

            return transaction.toXDR();

        } catch (error) {
            console.error('Error building payment XDR:', error);
            throw new Error(`Failed to build payment transaction: ${this.getHorizonErrorMessage(error)}`);
        }
    }

    static async buildCreateAccountXdr(input: BuildCreateAccountInput): Promise<string> {
        try {
            const { sourcePublicKey, destination, startingBalance, memoText } = input;
            const amount = Number(String(startingBalance || '').replace(',', '.'));
            if (!Number.isFinite(amount) || amount < 1) {
                throw new Error('Para criar uma conta Stellar externa, envie pelo menos 1 XLM.');
            }

            const sourceAccount = await server.loadAccount(sourcePublicKey);
            const nativeBalanceLine = sourceAccount.balances.find(b => b.asset_type === 'native');
            const xlmBalance = nativeBalanceLine ? parseFloat(nativeBalanceLine.balance) : 0;
            const minimumReserve = 1.5;
            const feeInXlm = Number(STELLAR_BASE_FEE_STROOPS) / 10000000;

            if (xlmBalance - amount - feeInXlm < minimumReserve) {
                throw new Error('Saldo de XLM insuficiente para criar a conta externa, pagar taxa e manter a reserva mínima.');
            }

            let transactionBuilder = new TransactionBuilder(sourceAccount, {
                fee: STELLAR_BASE_FEE_STROOPS,
                networkPassphrase: stellarConfig.network,
            }).addOperation(
                Operation.createAccount({
                    destination,
                    startingBalance,
                })
            );

            if (memoText) {
                const safeMemo = sanitizeMemoText(memoText);
                if (safeMemo) {
                    transactionBuilder = transactionBuilder.addMemo(Memo.text(safeMemo));
                }
            }

            return transactionBuilder.setTimeout(300).build().toXDR();
        } catch (error) {
            console.error('Error building create account XDR:', error);
            throw new Error(`Failed to build create account transaction: ${this.getHorizonErrorMessage(error)}`);
        }
    }

    static async buildTrustlineXdr(input: { sourcePublicKey: string; assetCode: string; assetIssuer: string }): Promise<string> {
        try {
            const { sourcePublicKey, assetCode, assetIssuer } = input;
            if (!assetCode || assetCode === 'XLM') {
                throw new Error('Trustline requires a non-native asset code');
            }

            const sourceAccount = await server.loadAccount(sourcePublicKey);
            const asset = new Asset(assetCode, assetIssuer);

            const transactionBuilder = new TransactionBuilder(sourceAccount, {
                fee: STELLAR_BASE_FEE_STROOPS,
                networkPassphrase: stellarConfig.network,
            }).addOperation(
                Operation.changeTrust({
                    asset,
                })
            );

            return transactionBuilder.setTimeout(300).build().toXDR();
        } catch (error) {
            console.error('Error building trustline XDR:', error);
            throw new Error(`Failed to build trustline transaction: ${this.getHorizonErrorMessage(error)}`);
        }
    }

    public static async signAndSubmitXdr(
        _userId: string,
        secretKey: string,
        unsignedXdr: string,
        operationData: Omit<OpType, 'id' | 'created_at' | 'updated_at' | 'stellar_transaction_hash' | 'status'>
    ): Promise<{ success: boolean; hash?: string; error?: string }> {
        let operationId: string | undefined;
        
        try {
            // Operation history persistence should not block payment execution.
            try {
                const operationRecord = await OperationRepository.create({
                    ...operationData,
                    status: 'PENDING'
                });
                operationId = operationRecord.id;
            } catch (persistError) {
                console.warn('Warning: could not persist operation before submission:', persistError);
            }

            const transaction = TransactionBuilder.fromXDR(unsignedXdr, stellarConfig.network);

            const sourceKeypair = Keypair.fromSecret(secretKey);
            transaction.sign(sourceKeypair);

            const result = await this.submitTransactionWithTimeoutRecovery(transaction);

            if (operationId) {
                try {
                    await OperationRepository.update(operationId, {
                        status: 'COMPLETED',
                        stellar_transaction_hash: result.hash
                    });
                } catch (persistError) {
                    console.warn('Warning: could not persist completed operation after submission:', persistError instanceof Error ? persistError.message : persistError);
                }
            }

            return {
                success: true,
                hash: result.hash
            };

        } catch (error) {
            console.error('Error executing transaction:', this.getHorizonErrorMessage(error));
            const errorMessage = this.getHorizonErrorMessage(error);
            
            if (operationId) {
                try {
                    await OperationRepository.update(operationId, {
                        status: 'FAILED',
                        context: errorMessage
                    });
                } catch (updateError) {
                    console.error('Error updating operation status to FAILED:', updateError);
                }
            }

            return {
                success: false,
                error: errorMessage
            };
        }
    }

    private static horizonAssetCode(type?: string, code?: string): string {
        return type === 'native' ? 'XLM' : String(code || 'UNKNOWN').toUpperCase();
    }

    private static stroopsToXlm(value: string | number | undefined): string {
        const stroops = Number(value || 0);
        if (!Number.isFinite(stroops)) return '0.0000000';
        return (stroops / 10000000).toFixed(7);
    }

    static async getSubmittedPaymentDetails(transactionHash: string): Promise<SubmittedPaymentDetails | null> {
        try {
            const [transaction, operations] = await Promise.all([
                server.transactions().transaction(transactionHash).call(),
                server.operations().forTransaction(transactionHash).call(),
            ]);

            const paymentOperation = (operations.records || []).find((operation: any) =>
                operation.type === 'payment' ||
                operation.type === 'path_payment_strict_receive' ||
                operation.type === 'path_payment_strict_send'
            ) as any;

            if (!paymentOperation) return null;

            if (paymentOperation.type === 'payment') {
                const amount = String(paymentOperation.amount || '0');
                const assetCode = this.horizonAssetCode(paymentOperation.asset_type, paymentOperation.asset_code);
                return {
                    sourceAmount: amount,
                    sourceAssetCode: assetCode,
                    sourceAssetIssuer: paymentOperation.asset_issuer,
                    destinationAmount: amount,
                    destinationAssetCode: assetCode,
                    destinationAssetIssuer: paymentOperation.asset_issuer,
                    feeXlm: this.stroopsToXlm((transaction as any).fee_charged),
                };
            }

            return {
                sourceAmount: String(paymentOperation.source_amount || paymentOperation.send_amount || '0'),
                sourceAssetCode: this.horizonAssetCode(paymentOperation.source_asset_type, paymentOperation.source_asset_code),
                sourceAssetIssuer: paymentOperation.source_asset_issuer,
                destinationAmount: String(paymentOperation.amount || paymentOperation.destination_amount || '0'),
                destinationAssetCode: this.horizonAssetCode(paymentOperation.asset_type || paymentOperation.destination_asset_type, paymentOperation.asset_code || paymentOperation.destination_asset_code),
                destinationAssetIssuer: paymentOperation.asset_issuer || paymentOperation.destination_asset_issuer,
                feeXlm: this.stroopsToXlm((transaction as any).fee_charged),
            };
        } catch (error) {
            console.warn('Warning: could not fetch submitted payment details:', error);
            return null;
        }
    }

    static async buildPathPaymentXdr(input: BuildPathPaymentInput): Promise<string> {
        try {
            const { sourcePublicKey, destination, destAsset, destAmount, sourceAsset } = input;

            const quote = input.quote || await this.quotePathPayment(input);
            const destAssetObj = createAsset(destAsset);
            const sourceAssetObj = createAsset(sourceAsset);

            const sourceAccount = await server.loadAccount(sourcePublicKey);

            const sourceBalanceLine = sourceAccount.balances.find(b => {
                if (sourceAssetObj.isNative()) return b.asset_type === 'native';
                return b.asset_type !== 'native' && (b as any).asset_code === sourceAssetObj.getCode() && (b as any).asset_issuer === sourceAssetObj.getIssuer();
            });

            const pathSourceMax = String(quote.pathSourceMax || quote.sourceMax);
            const feeAmount = quote.platformFee?.enabled && quote.platformFee.treasuryPublicKey
                ? String(quote.platformFee.feeAmount)
                : '0';
            const totalSourceMax = addAssetAmounts(pathSourceMax, feeAmount);

            // Use source max plus platform fee for balance check to cover worst-case settlement.
            if (!sourceBalanceLine || parseFloat(sourceBalanceLine.balance) < parseFloat(totalSourceMax)) {
                throw new Error(`Saldo de ${sourceAsset.code} insuficiente para a conversão. Máximo necessário: ${totalSourceMax}, disponível: ${sourceBalanceLine?.balance || '0'}.`);
            }

            const nativeBalanceLine = sourceAccount.balances.find(b => b.asset_type === 'native');
            const xlmBalance = nativeBalanceLine ? parseFloat(nativeBalanceLine.balance) : 0;
            
            const minimumReserve = 1.5; 
            const feeInXlm = Number(STELLAR_BASE_FEE_STROOPS) / 10000000;
            // If sending XLM, use sourceMax (with slippage); otherwise 0
            let amountInXlm = sourceAssetObj.isNative() ? parseFloat(totalSourceMax) : 0;

            if (xlmBalance - amountInXlm - feeInXlm < minimumReserve) {
                throw new Error('Saldo de XLM insuficiente para cobrir a taxa da transação e a reserva mínima da conta.');
            }

            const pathAssets = quote.path.map((pathAsset: any) => {
                if (pathAsset.type === 'native' || pathAsset.asset_type === 'native' || pathAsset.code === 'XLM') {
                    return Asset.native();
                } else {
                    return new Asset(pathAsset.code || pathAsset.asset_code, pathAsset.issuer || pathAsset.asset_issuer);
                }
            });

            const transactionBuilder = new TransactionBuilder(sourceAccount, {
                fee: STELLAR_BASE_FEE_STROOPS,
                networkPassphrase: stellarConfig.network
            });

            transactionBuilder.addOperation(
                Operation.pathPaymentStrictReceive({
                    sendAsset: sourceAssetObj,
                    sendMax: pathSourceMax,
                    destination: destination,
                    destAsset: destAssetObj,
                    destAmount: destAmount,
                    path: pathAssets
                })
            );

            if (quote.platformFee?.enabled && quote.platformFee.treasuryPublicKey) {
                transactionBuilder.addOperation(
                    Operation.payment({
                        destination: quote.platformFee.treasuryPublicKey,
                        asset: sourceAssetObj,
                        amount: quote.platformFee.feeAmount,
                    })
                );
            }

            const transaction = transactionBuilder.setTimeout(300).build();

            return transaction.toXDR();

        } catch (error) {
            console.error('Error building path payment XDR:', error);
            throw new Error(`Failed to build path payment transaction: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    static async quotePathPayment(input: PathPaymentQuoteInput): Promise<PathPaymentQuote> {
        const { destAsset, destAmount, sourceAsset } = input;

        const destAssetObj = createAsset(destAsset);
        const sourceAssetObj = createAsset(sourceAsset);

        const pathsResponse = await server.strictReceivePaths(
            [sourceAssetObj],
            destAssetObj,
            destAmount
        ).call();

        if (!pathsResponse.records || pathsResponse.records.length === 0) {
            const extraHints = await buildNoPathExtraHints(sourceAssetObj, destAssetObj);
            throw new Error(buildNoPathDiagnostic(sourceAssetObj, destAssetObj, extraHints));
        }

        // Filter paths to only use trusted assets (XLM and configured fiat rails)
        const trustedPaths = selectTrustedConversionPaths(pathsResponse.records, sourceAssetObj, destAssetObj);
        
        if (trustedPaths.length === 0) {
            // All returned paths use assets outside our trusted set - reject them
            throw new Error(`A cotação encontrada não usa uma rota confiável entre ${assetCode(sourceAssetObj)} e ${assetCode(destAssetObj)}. Nenhum caminho encontrado usando apenas ativos confiáveis configurados (USDC/BRL).`);
        }

        let bestPath = trustedPaths[0];
        for (const path of trustedPaths) {
            if (parseFloat(path.source_amount) < parseFloat(bestPath.source_amount)) {
                bestPath = path;
            }
        }

        await assertSaneBrlUsdcQuote({
            sourceAssetCode: assetCode(sourceAssetObj),
            destinationAssetCode: assetCode(destAssetObj),
            sourceAmount: bestPath.source_amount,
            destinationAmount: destAmount,
            context: 'strict-receive path quote',
        });

        const platformFee = PlatformFeeService.calculateSpread({
            sourceAmount: bestPath.source_amount,
            sourceAssetCode: assetCode(sourceAssetObj),
            destinationAssetCode: assetCode(destAssetObj),
            mode: 'add_on_top',
        });
        const networkFeeXlm = DEFAULT_NETWORK_FEE_XLM;

        // Add 2% slippage to sourceMax to handle price fluctuations during path payment
        const slippagePercent = 1.02;
        const sourceMaxWithSlippage = (parseFloat(bestPath.source_amount) * slippagePercent).toFixed(7);
        const totalSourceAmount = addAssetAmounts(bestPath.source_amount, platformFee.enabled ? platformFee.feeAmount : '0');

        return {
            sourceAsset: {
                code: assetCode(sourceAssetObj),
                issuer: assetIssuer(sourceAssetObj),
            },
            destinationAsset: {
                code: assetCode(destAssetObj),
                issuer: assetIssuer(destAssetObj),
            },
            destinationAmount: String(destAmount),
            sourceAmount: totalSourceAmount,
            sourceMax: addAssetAmounts(sourceMaxWithSlippage, platformFee.enabled ? platformFee.feeAmount : '0'),
            pathSourceAmount: String(bestPath.source_amount),
            pathSourceMax: sourceMaxWithSlippage,
            platformFee,
            networkFeeXlm,
            path: (bestPath.path || []).map((pathAsset: any) => ({
                code: pathAsset.asset_type === 'native' ? 'XLM' : pathAsset.asset_code,
                issuer: pathAsset.asset_issuer,
                type: pathAsset.asset_type,
            })),
        };
    }

    static async quoteStrictSendConversion(input: StrictSendConversionInput): Promise<StrictSendConversionQuote> {
        const { destAsset, sourceAmount, sourceAsset } = input;

        const destAssetObj = createAsset(destAsset);
        const sourceAssetObj = createAsset(sourceAsset);

        const platformFee = PlatformFeeService.calculateSpread({
            sourceAmount,
            sourceAssetCode: assetCode(sourceAssetObj),
            destinationAssetCode: assetCode(destAssetObj),
            mode: 'deduct_from_source',
        });
        const effectiveSourceAmount = platformFee.enabled ? platformFee.netSourceAmount : String(sourceAmount);

        const pathsResponse = await server.strictSendPaths(
            sourceAssetObj,
            effectiveSourceAmount,
            [destAssetObj]
        ).call();

        if (!pathsResponse.records || pathsResponse.records.length === 0) {
            const extraHints = await buildNoPathExtraHints(sourceAssetObj, destAssetObj);
            throw new Error(buildNoPathDiagnostic(sourceAssetObj, destAssetObj, extraHints));
        }

        // Filter paths to only use trusted assets (XLM and configured fiat rails)
        const trustedPaths = selectTrustedConversionPaths(pathsResponse.records, sourceAssetObj, destAssetObj);
        
        if (trustedPaths.length === 0) {
            // All returned paths use assets outside our trusted set - reject them
            throw new Error(`A cotação encontrada não usa uma rota confiável entre ${assetCode(sourceAssetObj)} e ${assetCode(destAssetObj)}. Nenhum caminho encontrado usando apenas ativos confiáveis configurados (USDC/BRL).`);
        }

        let bestPath = trustedPaths[0];
        for (const path of trustedPaths) {
            if (parseFloat(path.destination_amount) > parseFloat(bestPath.destination_amount)) {
                bestPath = path;
            }
        }

        assertSafeSameSymbolConversion({
            sourceAsset: sourceAssetObj,
            destinationAsset: destAssetObj,
            sourceAmount: effectiveSourceAmount,
            destinationAmount: String(bestPath.destination_amount),
            context: 'strict-send path quote',
        });

        await assertSaneBrlUsdcQuote({
            sourceAssetCode: assetCode(sourceAssetObj),
            destinationAssetCode: assetCode(destAssetObj),
            sourceAmount: effectiveSourceAmount,
            destinationAmount: bestPath.destination_amount,
            context: 'strict-send path quote',
        });

        const networkFeeXlm = DEFAULT_NETWORK_FEE_XLM;

        // Apply 2% slippage to destinationMin to handle price fluctuations during path payment
        const slippagePercent = 0.98;
        const destinationMinWithSlippage = (parseFloat(bestPath.destination_amount) * slippagePercent).toFixed(7);

        return {
            sourceAsset: {
                code: assetCode(sourceAssetObj),
                issuer: assetIssuer(sourceAssetObj),
            },
            destinationAsset: {
                code: assetCode(destAssetObj),
                issuer: assetIssuer(destAssetObj),
            },
            sourceAmount: String(sourceAmount),
            effectiveSourceAmount,
            destinationAmount: String(bestPath.destination_amount),
            destinationMin: destinationMinWithSlippage,
            platformFee,
            networkFeeXlm,
            path: (bestPath.path || []).map((pathAsset: any) => ({
                code: pathAsset.asset_type === 'native' ? 'XLM' : pathAsset.asset_code,
                issuer: pathAsset.asset_issuer,
                type: pathAsset.asset_type,
            })),
        };
    }

    static async buildStrictSendConversionXdr(input: StrictSendConversionInput): Promise<string> {
        try {
            const { sourcePublicKey, destination, sourceAmount, destAsset, sourceAsset, memoText } = input;
            const quote = input.quote || await this.quoteStrictSendConversion(input);
            const sourceAssetObj = createAsset(sourceAsset);
            const destAssetObj = createAsset(destAsset);
            const sourceAccount = await server.loadAccount(sourcePublicKey);

            const sourceBalanceLine = sourceAccount.balances.find(b => {
                if (sourceAssetObj.isNative()) return b.asset_type === 'native';
                return b.asset_type !== 'native' && (b as any).asset_code === sourceAssetObj.getCode() && (b as any).asset_issuer === sourceAssetObj.getIssuer();
            });

            const totalSourceAmount = quote.platformFee?.enabled && quote.platformFee.treasuryPublicKey
                ? String(sourceAmount)
                : String(quote.effectiveSourceAmount || sourceAmount);

            if (!sourceBalanceLine || parseFloat(sourceBalanceLine.balance) < parseFloat(totalSourceAmount)) {
                throw new Error(`Saldo de ${assetCode(sourceAssetObj)} insuficiente para a conversão. Necessário: ${totalSourceAmount}, disponível: ${sourceBalanceLine?.balance || '0'}.`);
            }

            const pathAssets = quote.path.map((pathAsset: any) => {
                if (pathAsset.type === 'native' || pathAsset.asset_type === 'native' || pathAsset.code === 'XLM') {
                    return Asset.native();
                }
                return new Asset(pathAsset.code || pathAsset.asset_code, pathAsset.issuer || pathAsset.asset_issuer);
            });

            const transactionBuilder = new TransactionBuilder(sourceAccount, {
                fee: STELLAR_BASE_FEE_STROOPS,
                networkPassphrase: stellarConfig.network
            })
                .addOperation(
                    Operation.pathPaymentStrictSend({
                        sendAsset: sourceAssetObj,
                        sendAmount: String(quote.effectiveSourceAmount || sourceAmount),
                        destination,
                        destAsset: destAssetObj,
                        destMin: quote.destinationMin,
                        path: pathAssets,
                    })
                );

            if (quote.platformFee?.enabled && quote.platformFee.treasuryPublicKey) {
                transactionBuilder.addOperation(
                    Operation.payment({
                        destination: quote.platformFee.treasuryPublicKey,
                        asset: sourceAssetObj,
                        amount: quote.platformFee.feeAmount,
                    })
                );
            }

            if (memoText) {
                const safeMemo = sanitizeMemoText(memoText);
                if (safeMemo) {
                    transactionBuilder.addMemo(Memo.text(safeMemo));
                }
            }

            const transaction = transactionBuilder.setTimeout(300).build();

            return transaction.toXDR();
        } catch (error) {
            console.error('Error building strict send conversion XDR:', error);
            throw new Error(`Failed to build conversion transaction: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    static async ensureTrustlineFromSecret(input: {
        sourceSecret: string;
        assetCode: string;
        assetIssuer: string;
    }): Promise<{ success: boolean; existing: boolean; hash?: string; error?: string }> {
        try {
            const sourceKeypair = Keypair.fromSecret(input.sourceSecret);
            await this.ensureTestnetAccountFunded(sourceKeypair.publicKey(), 1);
            const sourceAccount = await server.loadAccount(sourceKeypair.publicKey());
            const asset = createAsset({ code: input.assetCode, issuer: input.assetIssuer });

            const existing = sourceAccount.balances.some((balance: any) => (
                balance.asset_type !== 'native' &&
                String(balance.asset_code || '').toUpperCase() === asset.getCode() &&
                String(balance.asset_issuer || '') === asset.getIssuer()
            ));
            if (existing) {
                return { success: true, existing: true };
            }

            const transaction = new TransactionBuilder(sourceAccount, {
                fee: STELLAR_BASE_FEE_STROOPS,
                networkPassphrase: stellarConfig.network,
            })
                .addOperation(Operation.changeTrust({ asset }))
                .setTimeout(300)
                .build();

            transaction.sign(sourceKeypair);
            const result = await this.submitTransactionWithTimeoutRecovery(transaction);
            return { success: true, existing: false, hash: result.hash };
        } catch (error) {
            const message = this.getHorizonErrorMessage(error);
            return { success: false, existing: false, error: message };
        }
    }

    static async submitAssetPaymentFromSecret(input: {
        sourceSecret: string;
        destination: string;
        amount: string;
        assetCode: string;
        assetIssuer?: string;
        memoText?: string;
    }): Promise<{ success: boolean; hash?: string; error?: string }> {
        try {
            const sourceKeypair = Keypair.fromSecret(input.sourceSecret);
            await this.ensureTestnetAccountFunded(sourceKeypair.publicKey(), 1);
            await this.ensureTestnetAccountFunded(input.destination, 1);

            const sourceAccount = await server.loadAccount(sourceKeypair.publicKey());
            const asset = createAsset({ code: input.assetCode, issuer: input.assetIssuer });

            let builder = new TransactionBuilder(sourceAccount, {
                fee: STELLAR_BASE_FEE_STROOPS,
                networkPassphrase: stellarConfig.network,
            }).addOperation(Operation.payment({
                destination: input.destination,
                asset,
                amount: input.amount,
            }));

            const memo = input.memoText ? sanitizeMemoText(input.memoText) : undefined;
            if (memo) {
                builder = builder.addMemo(Memo.text(memo));
            }

            const transaction = builder.setTimeout(300).build();
            transaction.sign(sourceKeypair);
            const result = await this.submitTransactionWithTimeoutRecovery(transaction);
            return { success: true, hash: result.hash };
        } catch (error) {
            return { success: false, error: this.getHorizonErrorMessage(error) };
        }
    }

    static async submitAssetPaymentsFromSecret(input: {
        sourceSecret: string;
        payments: Array<{
            destination: string;
            amount: string;
            assetCode: string;
            assetIssuer?: string;
        }>;
        memoText?: string;
    }): Promise<{ success: boolean; hash?: string; error?: string }> {
        try {
            const payments = (input.payments || []).filter((payment) => Number(payment.amount) > 0);
            if (payments.length === 0) {
                return { success: false, error: 'No positive payment amount provided.' };
            }

            const sourceKeypair = Keypair.fromSecret(input.sourceSecret);
            await this.ensureTestnetAccountFunded(sourceKeypair.publicKey(), 1);
            for (const payment of payments) {
                await this.ensureTestnetAccountFunded(payment.destination, 1);
            }

            const sourceAccount = await server.loadAccount(sourceKeypair.publicKey());
            let builder = new TransactionBuilder(sourceAccount, {
                fee: STELLAR_BASE_FEE_STROOPS,
                networkPassphrase: stellarConfig.network,
            });

            for (const payment of payments) {
                builder = builder.addOperation(Operation.payment({
                    destination: payment.destination,
                    asset: createAsset({ code: payment.assetCode, issuer: payment.assetIssuer }),
                    amount: payment.amount,
                }));
            }

            const memo = input.memoText ? sanitizeMemoText(input.memoText) : undefined;
            if (memo) {
                builder = builder.addMemo(Memo.text(memo));
            }

            const transaction = builder.setTimeout(300).build();
            transaction.sign(sourceKeypair);
            const result = await this.submitTransactionWithTimeoutRecovery(transaction);
            return { success: true, hash: result.hash };
        } catch (error) {
            return { success: false, error: this.getHorizonErrorMessage(error) };
        }
    }

    static async submitStrictReceivePaymentFromSecret(input: {
        sourceSecret: string;
        destination: string;
        sourceAsset: AssetInput;
        destinationAsset: AssetInput;
        destinationAmount: string;
        sourceMax: string;
        memoText?: string;
        additionalSourcePayments?: Array<{ destination: string; amount: string; assetCode?: string; assetIssuer?: string }>;
    }): Promise<{ success: boolean; hash?: string; error?: string; sourceAmount?: string; destinationAmount?: string }> {
        try {
            const sourceKeypair = Keypair.fromSecret(input.sourceSecret);
            await this.ensureTestnetAccountFunded(sourceKeypair.publicKey(), 1);
            if (input.destination !== sourceKeypair.publicKey()) {
                await this.ensureTestnetAccountFunded(input.destination, 1);
            }

            const sourceAssetObj = createAsset(input.sourceAsset);
            const destinationAssetObj = createAsset(input.destinationAsset);
            const pathsResponse = await server.strictReceivePaths(
                [sourceAssetObj],
                destinationAssetObj,
                input.destinationAmount,
            ).call();

            const candidates = selectTrustedConversionPaths(
                Array.isArray(pathsResponse.records) ? pathsResponse.records : [],
                sourceAssetObj,
                destinationAssetObj,
            );
            if (candidates.length === 0) {
                throw new Error(buildNoPathDiagnostic(sourceAssetObj, destinationAssetObj));
            }

            const sourceMax = Number(input.sourceMax);
            const affordable = candidates
                .filter((record: any) => Number(record.source_amount) <= sourceMax)
                .sort((a: any, b: any) => Number(a.source_amount) - Number(b.source_amount));
            const bestPath = affordable[0];
            if (!bestPath) {
                throw new Error(`No path found within sourceMax=${input.sourceMax} ${assetCode(sourceAssetObj)}.`);
            }
            assertSafeSameSymbolConversion({
                sourceAsset: sourceAssetObj,
                destinationAsset: destinationAssetObj,
                sourceAmount: String(bestPath.source_amount),
                destinationAmount: input.destinationAmount,
                context: 'strict-receive submit',
            });
            await assertSaneBrlUsdcQuote({
                sourceAssetCode: assetCode(sourceAssetObj),
                destinationAssetCode: assetCode(destinationAssetObj),
                sourceAmount: String(bestPath.source_amount),
                destinationAmount: input.destinationAmount,
                context: 'strict-receive submit',
            });

            const pathAssets = (bestPath.path || []).map((pathAsset: any) => {
                if (pathAsset.asset_type === 'native') return Asset.native();
                return new Asset(pathAsset.asset_code, pathAsset.asset_issuer);
            });

            const sourceAccount = await server.loadAccount(sourceKeypair.publicKey());
            let builder = new TransactionBuilder(sourceAccount, {
                fee: STELLAR_BASE_FEE_STROOPS,
                networkPassphrase: stellarConfig.network,
            }).addOperation(Operation.pathPaymentStrictReceive({
                sendAsset: sourceAssetObj,
                sendMax: input.sourceMax,
                destination: input.destination,
                destAsset: destinationAssetObj,
                destAmount: input.destinationAmount,
                path: pathAssets,
            }));

            for (const payment of input.additionalSourcePayments || []) {
                if (Number(payment.amount) <= 0) continue;
                builder = builder.addOperation(Operation.payment({
                    destination: payment.destination,
                    asset: createAsset({
                        code: payment.assetCode || assetCode(sourceAssetObj),
                        issuer: payment.assetIssuer || (sourceAssetObj.isNative() ? undefined : sourceAssetObj.getIssuer()),
                    }),
                    amount: payment.amount,
                }));
            }

            const memo = input.memoText ? sanitizeMemoText(input.memoText) : undefined;
            if (memo) {
                builder = builder.addMemo(Memo.text(memo));
            }

            const transaction = builder.setTimeout(300).build();
            transaction.sign(sourceKeypair);
            const result = await this.submitTransactionWithTimeoutRecovery(transaction);
            return { success: true, hash: result.hash, sourceAmount: bestPath.source_amount, destinationAmount: input.destinationAmount };
        } catch (error) {
            return { success: false, error: this.getHorizonErrorMessage(error) };
        }
    }

    static async submitStrictSendPaymentFromSecret(input: {
        sourceSecret: string;
        destination: string;
        sourceAsset: AssetInput;
        sourceAmount: string;
        destinationAsset: AssetInput;
        memoText?: string;
        additionalSourcePayments?: Array<{ destination: string; amount: string; assetCode?: string; assetIssuer?: string }>;
    }): Promise<{ success: boolean; hash?: string; error?: string; destinationAmount?: string; destinationMin?: string }> {
        try {
            const sourceKeypair = Keypair.fromSecret(input.sourceSecret);
            await this.ensureTestnetAccountFunded(sourceKeypair.publicKey(), 1);
            await this.ensureTestnetAccountFunded(input.destination, 1);

            const sourceAssetObj = createAsset(input.sourceAsset);
            const destinationAssetObj = createAsset(input.destinationAsset);
            const pathsResponse = await server.strictSendPaths(
                sourceAssetObj,
                input.sourceAmount,
                [destinationAssetObj],
            ).call();

            const trustedPaths = selectTrustedConversionPaths(
                Array.isArray(pathsResponse.records) ? pathsResponse.records : [],
                sourceAssetObj,
                destinationAssetObj,
            );
            if (trustedPaths.length === 0) {
                throw new Error(buildNoPathDiagnostic(sourceAssetObj, destinationAssetObj));
            }

            const bestPath = trustedPaths
                .sort((a: any, b: any) => Number(b.destination_amount) - Number(a.destination_amount))[0];
            assertSafeSameSymbolConversion({
                sourceAsset: sourceAssetObj,
                destinationAsset: destinationAssetObj,
                sourceAmount: input.sourceAmount,
                destinationAmount: String(bestPath.destination_amount),
                context: 'strict-send submit',
            });
            await assertSaneBrlUsdcQuote({
                sourceAssetCode: assetCode(sourceAssetObj),
                destinationAssetCode: assetCode(destinationAssetObj),
                sourceAmount: input.sourceAmount,
                destinationAmount: String(bestPath.destination_amount),
                context: 'strict-send submit',
            });
            const destinationMin = (Number(bestPath.destination_amount) * 0.98).toFixed(7);
            const pathAssets = (bestPath.path || []).map((pathAsset: any) => {
                if (pathAsset.asset_type === 'native') return Asset.native();
                return new Asset(pathAsset.asset_code, pathAsset.asset_issuer);
            });

            const sourceAccount = await server.loadAccount(sourceKeypair.publicKey());
            let builder = new TransactionBuilder(sourceAccount, {
                fee: STELLAR_BASE_FEE_STROOPS,
                networkPassphrase: stellarConfig.network,
            }).addOperation(Operation.pathPaymentStrictSend({
                sendAsset: sourceAssetObj,
                sendAmount: input.sourceAmount,
                destination: input.destination,
                destAsset: destinationAssetObj,
                destMin: destinationMin,
                path: pathAssets,
            }));

            for (const payment of input.additionalSourcePayments || []) {
                if (Number(payment.amount) <= 0) continue;
                builder = builder.addOperation(Operation.payment({
                    destination: payment.destination,
                    asset: createAsset({
                        code: payment.assetCode || assetCode(sourceAssetObj),
                        issuer: payment.assetIssuer || (sourceAssetObj.isNative() ? undefined : sourceAssetObj.getIssuer()),
                    }),
                    amount: payment.amount,
                }));
            }

            const memo = input.memoText ? sanitizeMemoText(input.memoText) : undefined;
            if (memo) {
                builder = builder.addMemo(Memo.text(memo));
            }

            const transaction = builder.setTimeout(300).build();
            transaction.sign(sourceKeypair);
            const result = await this.submitTransactionWithTimeoutRecovery(transaction);
            return {
                success: true,
                hash: result.hash,
                destinationAmount: String(bestPath.destination_amount),
                destinationMin,
            };
        } catch (error) {
            return { success: false, error: this.getHorizonErrorMessage(error) };
        }
    }

    static async getAccountBalance(publicKey: string): Promise<any[]> {
        try {
            const account = await server.loadAccount(publicKey);
            
            const formattedBalances = account.balances.map(balance => {
                const assetCode = balance.asset_type === 'native' ? 'XLM' : String((balance as any).asset_code || 'UNKNOWN').toUpperCase();
                return {
                    balance: balance.balance,
                    asset_type: balance.asset_type,
                    asset_code: assetCode,
                    asset_issuer: (balance as any).asset_issuer,
                };
            });

            return formattedBalances;
        } catch (error: any) {
            if (error.response && error.response.status === 404) {
                throw new Error(`Conta com a chave pública ${publicKey} não encontrada na rede Stellar.`);
            }
            console.error(`Erro ao buscar saldo para a conta ${publicKey}:`, error);
            throw new Error('Falha ao consultar o saldo na rede Stellar.');
        }
    }
}
