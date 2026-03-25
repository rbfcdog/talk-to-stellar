import { Keypair, Operation, Asset, Memo, Networks, TransactionBuilder } from '@stellar/stellar-sdk';
import { server } from '../../config/stellar';
import { OperationRepository } from '../repository/operation.repository';
import { Operation as OpType } from '../../types';

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
  issuer: string;
}

interface BuildPathPaymentInput {
  sourcePublicKey: string;
  destination: string;
  destAsset: AssetInput;
  destAmount: string;
  sourceAsset: AssetInput;
}

export class StellarService {
  static generateStellarKeypair(): { publicKey: string; secret: string } {
    const pair = Keypair.random();
    return {
      publicKey: pair.publicKey(),
      secret: pair.secret(),
    };
  }

  static async createTestAccount(): Promise<{ publicKey: string; secret: string }> {
    const { publicKey, secret } = this.generateStellarKeypair();

    try {
      const response = await fetch(`https://friendbot.stellar.org?addr=${publicKey}`);
      if (!response.ok) {
        throw new Error('Failed to fund account using Friendbot.');
      }
      await response.json();
    } catch (e) {
      console.error("FRIENDBOT ERROR: ", e);
      throw new Error('Could not connect to Friendbot.');
    }

    return { publicKey, secret };
  }

    static async buildPaymentXdr(input: BuildPaymentInput): Promise<string> {
        try {
            const { sourcePublicKey, destination, amount, assetCode, assetIssuer, memoText } = input;

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
                networkPassphrase: Networks.TESTNET
            });

            transactionBuilder = transactionBuilder.addOperation(
                Operation.payment({
                    destination: destination,
                    asset: asset,
                    amount: amount
                })
            );

            if (memoText) {
                transactionBuilder = transactionBuilder.addMemo(Memo.text(memoText));
            }

            const transaction = transactionBuilder.setTimeout(300).build();

            return transaction.toXDR();

        } catch (error) {
            console.error('Error building payment XDR:', error);
            throw new Error(`Failed to build payment transaction: ${error instanceof Error ? error.message : 'Unknown error'}`);
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

            const transaction = TransactionBuilder.fromXDR(unsignedXdr, Networks.TESTNET);

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
            
            if (operationId) {
                try {
                    await OperationRepository.update(operationId, {
                        status: 'FAILED',
                        context: error instanceof Error ? error.message : 'Unknown error occurred'
                    });
                } catch (updateError) {
                    console.error('Error updating operation status to FAILED:', updateError);
                }
            }

            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error occurred'
            };
        }
    }

    static async buildPathPaymentXdr(input: BuildPathPaymentInput): Promise<string> {
        try {
            const { sourcePublicKey, destination, destAsset, destAmount, sourceAsset } = input;

            const destAssetObj = new Asset(destAsset.code, destAsset.issuer);
            const sourceAssetObj = new Asset(sourceAsset.code, sourceAsset.issuer);

            const pathsResponse = await server.strictReceivePaths(
                [sourceAssetObj],
                destAssetObj,
                destAmount
            ).call();

            if (!pathsResponse.records || pathsResponse.records.length === 0) {
                throw new Error('Não foi encontrado um caminho de conversão entre os ativos.');
            }

            let bestPath = pathsResponse.records[0];
            for (const path of pathsResponse.records) {
                if (parseFloat(path.source_amount) < parseFloat(bestPath.source_amount)) {
                    bestPath = path;
                }
            }

            const sourceAccount = await server.loadAccount(sourcePublicKey);

            const sourceBalanceLine = sourceAccount.balances.find(b => {
                if (sourceAssetObj.isNative()) return b.asset_type === 'native';
                return b.asset_type !== 'native' && (b as any).asset_code === sourceAssetObj.getCode() && (b as any).asset_issuer === sourceAssetObj.getIssuer();
            });

            if (!sourceBalanceLine || parseFloat(sourceBalanceLine.balance) < parseFloat(bestPath.source_amount)) {
                throw new Error(`Saldo de ${sourceAsset.code} insuficiente para a conversão. Necessário: ${bestPath.source_amount}, disponível: ${sourceBalanceLine?.balance || '0'}.`);
            }

            const nativeBalanceLine = sourceAccount.balances.find(b => b.asset_type === 'native');
            const xlmBalance = nativeBalanceLine ? parseFloat(nativeBalanceLine.balance) : 0;
            
            const minimumReserve = 1.5; 
            const feeInXlm = 10000 / 10000000;
            let amountInXlm = sourceAssetObj.isNative() ? parseFloat(bestPath.source_amount) : 0;

            if (xlmBalance - amountInXlm - feeInXlm < minimumReserve) {
                throw new Error('Saldo de XLM insuficiente para cobrir a taxa da transação e a reserva mínima da conta.');
            }

            const pathAssets = bestPath.path.map((pathAsset: any) => {
                if (pathAsset.asset_type === 'native') {
                    return Asset.native();
                } else {
                    return new Asset(pathAsset.asset_code, pathAsset.asset_issuer);
                }
            });

            const transactionBuilder = new TransactionBuilder(sourceAccount, {
                fee: '10000',
                networkPassphrase: Networks.TESTNET
            });

            transactionBuilder.addOperation(
                Operation.pathPaymentStrictReceive({
                    sendAsset: sourceAssetObj,
                    sendMax: bestPath.source_amount,
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

    static async getAccountBalance(publicKey: string): Promise<any[]> {
        try {
            const account = await server.loadAccount(publicKey);
            
            const formattedBalances = account.balances.map(balance => ({
                balance: balance.balance,
                asset_type: balance.asset_type,
                asset_code: (balance as any).asset_code,
                asset_issuer: (balance as any).asset_issuer,
            }));

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