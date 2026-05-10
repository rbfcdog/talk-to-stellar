import { Keypair, Operation, Asset, Memo, Networks, TransactionBuilder } from '@stellar/stellar-sdk';
import { server, stellarConfig } from '../../config/stellar';
import { OperationRepository } from '../repository/operation.repository';
import { Operation as OpType } from '../../types';
import { getAssetIssuer } from '../../config/assets';

interface BuildPaymentInput {
  sourcePublicKey: string;
  destination: string;
  amount: string;
  assetCode?: string;
  assetIssuer?: string;
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
}

interface PathPaymentQuoteInput extends BuildPathPaymentInput {}

interface StrictSendConversionInput {
  sourcePublicKey: string;
  destination: string;
  sourceAsset: AssetInput;
  sourceAmount: string;
  destAsset: AssetInput;
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
  destinationAmount: string;
  destinationMin: string;
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

function createAsset(input: AssetInput): Asset {
    const code = String(input.code || '').toUpperCase();
    if (code === 'XLM' || code === 'NATIVE') {
        return Asset.native();
    }

    if (!input.issuer) {
        throw new Error(`Asset issuer is required for ${code}.`);
    }

    const issuer = String(input.issuer).trim();
    
    // Validate that issuer is a valid Stellar public key
    if (!isValidStellarPublicKey(issuer)) {
        console.error(`Invalid issuer for ${code}: "${issuer}" (length: ${issuer.length})`);
        throw new Error(`Asset issuer for ${code} is invalid: "${issuer}". Must be a valid Stellar public key (56 characters, starting with 'G').`);
    }

    return new Asset(code, issuer);
}

function assetCode(asset: Asset): string {
    return asset.isNative() ? 'XLM' : asset.getCode();
}

function assetIssuer(asset: Asset): string | undefined {
    return asset.isNative() ? undefined : asset.getIssuer();
}

function buildNoPathDiagnostic(sourceAssetObj: Asset, destAssetObj: Asset): string {
    const sourceCode = assetCode(sourceAssetObj);
    const destCode = assetCode(destAssetObj);
    const sourceIssuer = assetIssuer(sourceAssetObj);
    const destIssuer = assetIssuer(destAssetObj);
    const hints: string[] = [];

    if (destCode === 'USDC' && !getAssetIssuer('USDC')) {
        hints.push('USDC_ISSUER não configurado no backend');
    }
    if (destCode === 'BRL' && !getAssetIssuer('BRL')) {
        hints.push('BRL_ISSUER não configurado no backend');
    }

    hints.push('Sem rota de liquidez na DEX para esse par/valor neste momento');
    hints.push('Confirme trustline do ativo de destino na wallet');
    if (sourceCode === 'BRL' || destCode === 'BRL') {
        hints.push('Se estiver em testnet, rode npm run stellar:setup-brl-liquidity para provisionar ofertas BRL/XLM e BRL/USDC');
    } else {
        hints.push('Se estiver em testnet, confirme a liquidez XLM/USDC no issuer configurado');
    }

    return [
        `Não foi encontrado caminho de conversão entre ${sourceCode} e ${destCode}.`,
        `source_issuer=${sourceIssuer || 'native'}; dest_issuer=${destIssuer || 'native'}.`,
        `Diagnóstico: ${hints.join(' | ')}.`,
    ].join(' ');
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
    if (!code || !['USDC', 'BRL'].includes(code)) return false;

    const expectedIssuer = getAssetIssuer(code);
    const actualIssuer = String(pathAsset?.asset_issuer || '').trim();
    if (!expectedIssuer || !actualIssuer) return false;
    return actualIssuer === expectedIssuer;
}

function selectTrustedConversionPaths(records: any[], sourceAssetObj: Asset, destAssetObj: Asset): any[] {
    const enforceTrusted =
        String(process.env.STELLAR_ENFORCE_TRUSTED_PATH_ASSETS || 'false').trim().toLowerCase() === 'true';
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

    return { publicKey, secret };
  }

  static async fundWithFriendbot(publicKey: string): Promise<void> {
    const response = await fetch(`${stellarConfig.friendbotUrl}?addr=${encodeURIComponent(publicKey)}`);
    if (!response.ok) {
      const body = await response.text().catch(() => '');
      throw new Error(`Failed to fund account using Friendbot: ${response.status} ${body}`);
    }
    await response.json().catch(() => undefined);
    this.fundedAccounts.add(publicKey);
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
  }

  private static getHorizonErrorMessage(error: any): string {
    const data = error?.response?.data;
    const resultCodes = data?.extras?.result_codes;
    const resultXdr = data?.extras?.result_xdr;

    if (resultCodes) {
      return `Horizon transaction failed: ${JSON.stringify(resultCodes)}${resultXdr ? ` result_xdr=${resultXdr}` : ''}`;
    }

    return error instanceof Error ? error.message : String(error);
  }

  static async loadAccount(publicKey: string) {
    return await server.loadAccount(publicKey);
  }

    static async buildPaymentXdr(input: BuildPaymentInput): Promise<string> {
        try {
            const { sourcePublicKey, destination, amount, assetCode, assetIssuer, memoText } = input;

            const nativeAmount = (!assetCode || assetCode === 'XLM') ? parseFloat(amount) : 0;
            await this.ensureTestnetAccountFunded(destination);
            await this.ensureTestnetAccountFunded(sourcePublicKey, nativeAmount + 2);

            const sourceAccount = await server.loadAccount(sourcePublicKey);

            const assetToSend = (assetCode && assetIssuer) ? new Asset(assetCode, assetIssuer) : Asset.native();
            
            const balanceLine = sourceAccount.balances.find(b => {
                if (assetToSend.isNative()) return b.asset_type === 'native';
                return b.asset_type !== 'native' && (b as any).asset_code === assetToSend.getCode() && (b as any).asset_issuer === assetToSend.getIssuer();
            });

            if (!balanceLine || parseFloat(balanceLine.balance) < parseFloat(amount)) {
                throw new Error(`Saldo insuficiente. Você não tem ${amount} ${assetCode || 'XLM'} para enviar.`);
            }

            const nativeBalanceLine = sourceAccount.balances.find(b => b.asset_type === 'native');
            const xlmBalance = nativeBalanceLine ? parseFloat(nativeBalanceLine.balance) : 0;
            
            const minimumReserve = 1.5; 
            const feeInXlm = 10000 / 10000000;
            let amountInXlm = assetToSend.isNative() ? parseFloat(amount) : 0;

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
                fee: '10000',
                networkPassphrase: stellarConfig.network
            });

            transactionBuilder = transactionBuilder.addOperation(
                Operation.payment({
                    destination: destination,
                    asset: asset,
                    amount: amount
                })
            );

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

    static async buildTrustlineXdr(input: { sourcePublicKey: string; assetCode: string; assetIssuer: string }): Promise<string> {
        try {
            const { sourcePublicKey, assetCode, assetIssuer } = input;
            if (!assetCode || assetCode === 'XLM') {
                throw new Error('Trustline requires a non-native asset code');
            }

            const sourceAccount = await server.loadAccount(sourcePublicKey);
            const asset = new Asset(assetCode, assetIssuer);

            const transactionBuilder = new TransactionBuilder(sourceAccount, {
                fee: '10000',
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

            const result = await server.submitTransaction(transaction);

            if (operationId) {
                await OperationRepository.update(operationId, {
                    status: 'COMPLETED',
                    stellar_transaction_hash: result.hash
                });
            }

            return {
                success: true,
                hash: result.hash
            };

        } catch (error) {
            console.error('Error executing transaction:', error);
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

            const quote = await this.quotePathPayment(input);
            const destAssetObj = createAsset(destAsset);
            const sourceAssetObj = createAsset(sourceAsset);

            const sourceAccount = await server.loadAccount(sourcePublicKey);

            const sourceBalanceLine = sourceAccount.balances.find(b => {
                if (sourceAssetObj.isNative()) return b.asset_type === 'native';
                return b.asset_type !== 'native' && (b as any).asset_code === sourceAssetObj.getCode() && (b as any).asset_issuer === sourceAssetObj.getIssuer();
            });

            // Use sourceMax (which includes slippage) for balance check to ensure we can cover worst-case scenario
            if (!sourceBalanceLine || parseFloat(sourceBalanceLine.balance) < parseFloat(quote.sourceMax)) {
                throw new Error(`Saldo de ${sourceAsset.code} insuficiente para a conversão. Máximo necessário (com slippage): ${quote.sourceMax}, disponível: ${sourceBalanceLine?.balance || '0'}.`);
            }

            const nativeBalanceLine = sourceAccount.balances.find(b => b.asset_type === 'native');
            const xlmBalance = nativeBalanceLine ? parseFloat(nativeBalanceLine.balance) : 0;
            
            const minimumReserve = 1.5; 
            const feeInXlm = 10000 / 10000000;
            // If sending XLM, use sourceMax (with slippage); otherwise 0
            let amountInXlm = sourceAssetObj.isNative() ? parseFloat(quote.sourceMax) : 0;

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
                fee: '10000',
                networkPassphrase: stellarConfig.network
            });

            transactionBuilder.addOperation(
                Operation.pathPaymentStrictReceive({
                    sendAsset: sourceAssetObj,
                    sendMax: quote.sourceMax,
                    destination: destination,
                    destAsset: destAssetObj,
                    destAmount: destAmount,
                    path: pathAssets
                })
            );

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
            throw new Error(buildNoPathDiagnostic(sourceAssetObj, destAssetObj));
        }

        // Filter paths to only use trusted assets (XLM, USDC, BRL)
        const trustedPaths = selectTrustedConversionPaths(pathsResponse.records, sourceAssetObj, destAssetObj);
        
        if (trustedPaths.length === 0) {
            // All returned paths use assets outside our trusted set - reject them
            throw new Error(`A cotação encontrada não usa uma rota confiável entre ${assetCode(sourceAssetObj)} e ${assetCode(destAssetObj)}. Nenhum caminho encontrado usando apenas XLM, USDC e BRL.`);
        }

        let bestPath = trustedPaths[0];
        for (const path of trustedPaths) {
            if (parseFloat(path.source_amount) < parseFloat(bestPath.source_amount)) {
                bestPath = path;
            }
        }

        const networkFeeXlm = '0.001';

        // Add 2% slippage to sourceMax to handle price fluctuations during path payment
        const slippagePercent = 1.02;
        const sourceMaxWithSlippage = (parseFloat(bestPath.source_amount) * slippagePercent).toFixed(7);

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
            sourceAmount: String(bestPath.source_amount),
            sourceMax: sourceMaxWithSlippage,
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

        const pathsResponse = await server.strictSendPaths(
            sourceAssetObj,
            sourceAmount,
            [destAssetObj]
        ).call();

        if (!pathsResponse.records || pathsResponse.records.length === 0) {
            throw new Error(buildNoPathDiagnostic(sourceAssetObj, destAssetObj));
        }

        // Filter paths to only use trusted assets (XLM, USDC, BRL)
        const trustedPaths = selectTrustedConversionPaths(pathsResponse.records, sourceAssetObj, destAssetObj);
        
        if (trustedPaths.length === 0) {
            // All returned paths use assets outside our trusted set - reject them
            throw new Error(`A cotação encontrada não usa uma rota confiável entre ${assetCode(sourceAssetObj)} e ${assetCode(destAssetObj)}. Nenhum caminho encontrado usando apenas XLM, USDC e BRL.`);
        }

        let bestPath = trustedPaths[0];
        for (const path of trustedPaths) {
            if (parseFloat(path.destination_amount) > parseFloat(bestPath.destination_amount)) {
                bestPath = path;
            }
        }

        const networkFeeXlm = '0.001';

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
            destinationAmount: String(bestPath.destination_amount),
            destinationMin: destinationMinWithSlippage,
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
            const { sourcePublicKey, destination, sourceAmount, destAsset, sourceAsset } = input;
            const quote = await this.quoteStrictSendConversion(input);
            const sourceAssetObj = createAsset(sourceAsset);
            const destAssetObj = createAsset(destAsset);
            const sourceAccount = await server.loadAccount(sourcePublicKey);

            const sourceBalanceLine = sourceAccount.balances.find(b => {
                if (sourceAssetObj.isNative()) return b.asset_type === 'native';
                return b.asset_type !== 'native' && (b as any).asset_code === sourceAssetObj.getCode() && (b as any).asset_issuer === sourceAssetObj.getIssuer();
            });

            if (!sourceBalanceLine || parseFloat(sourceBalanceLine.balance) < parseFloat(sourceAmount)) {
                throw new Error(`Saldo de ${assetCode(sourceAssetObj)} insuficiente para a conversão. Necessário: ${sourceAmount}, disponível: ${sourceBalanceLine?.balance || '0'}.`);
            }

            const pathAssets = quote.path.map((pathAsset: any) => {
                if (pathAsset.type === 'native' || pathAsset.asset_type === 'native' || pathAsset.code === 'XLM') {
                    return Asset.native();
                }
                return new Asset(pathAsset.code || pathAsset.asset_code, pathAsset.issuer || pathAsset.asset_issuer);
            });

            const transaction = new TransactionBuilder(sourceAccount, {
                fee: '10000',
                networkPassphrase: stellarConfig.network
            })
                .addOperation(
                    Operation.pathPaymentStrictSend({
                        sendAsset: sourceAssetObj,
                        sendAmount: sourceAmount,
                        destination,
                        destAsset: destAssetObj,
                        destMin: quote.destinationMin,
                        path: pathAssets,
                    })
                )
                .setTimeout(300)
                .build();

            return transaction.toXDR();
        } catch (error) {
            console.error('Error building strict send conversion XDR:', error);
            throw new Error(`Failed to build conversion transaction: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
