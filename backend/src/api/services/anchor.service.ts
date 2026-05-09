import { OperationRepository } from '../repository/operation.repository';
import axios from 'axios';
import toml from 'toml';

interface InitiatePixDepositInput {
  userId: string;
  publicKey: string;
  assetCode: string;
  amount: string;
}

const ANCHOR_DOMAIN = 'testanchor.stellar.org';
const ANCHOR_HOME_DOMAIN = `https://testanchor.stellar.org`;

export class AnchorService {

  /**
   * Busca o arquivo stellar.toml de uma âncora e retorna a URL do servidor SEP-24.
   * @private
   */
  private static async getSep24TransferServerUrl(): Promise<string> {
    try {
      const response = await axios.get(`${ANCHOR_HOME_DOMAIN}/.well-known/stellar.toml`);
      const parsedToml = toml.parse(response.data);
      const transferServerUrl = parsedToml.TRANSFER_SERVER_SEP0024;
      
      if (!transferServerUrl) {
        throw new Error('URL do TRANSFER_SERVER_SEP0024 não encontrada no stellar.toml');
      }
      return transferServerUrl;
    } catch (error) {
      console.error("Falha ao buscar ou parsear o stellar.toml:", error);
      throw new Error("Não foi possível obter a configuração da âncora.");
    }
  }

  static async initiatePixDeposit(input: InitiatePixDepositInput): Promise<{ 
    depositUrl: string; 
    operationId: string 
  }> {
    const { userId, publicKey, assetCode, amount } = input;

    try {
      const transferServerUrl = await this.getSep24TransferServerUrl();
      const depositEndpoint = `${transferServerUrl}/transactions/deposit/interactive`;

      const params = new URLSearchParams();
      params.append('asset_code', assetCode);
      params.append('account', publicKey);
      params.append('amount', amount);

      console.log(`[REAL] Chamando a âncora em: ${depositEndpoint} com os parâmetros:`, params.toString());
      const anchorResponse = await axios.post(depositEndpoint, params, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      });

      const { url: depositUrl, id: anchorTxId } = anchorResponse.data;
      
      if (!depositUrl || !anchorTxId) {
        throw new Error("Resposta da âncora inválida: a URL ou o ID da transação não foram retornados.");
      }

      const operationData = {
        user_id: userId,
        type: 'DEPOSIT' as any,
        status: 'PENDING' as any,
        amount: parseFloat(amount),
        asset_code: assetCode,
        context: JSON.stringify({
          anchor_domain: ANCHOR_DOMAIN,
          anchor_tx_id: anchorTxId,
          initiated_at: new Date().toISOString()
        })
      };
      const operation = await OperationRepository.create(operationData);

      return { depositUrl, operationId: operation.id };

    } catch (error: any) {
      console.error('Erro ao iniciar depósito PIX real:', error.response?.data || error.message);
      throw new Error('Falha ao iniciar processo de depósito PIX com a âncora.');
    }
  }

  static async checkDepositStatus(operationId: string): Promise<{ 
    status: string; 
    message: string 
  }> {
    try {
      const operation = await OperationRepository.findById(operationId);
      if (!operation) throw new Error('Operação não encontrada em nosso sistema.');
      
      if (operation.status === 'COMPLETED') {
        return { status: 'COMPLETED', message: 'Depósito já foi concluído com sucesso.' };
      }

      const context = operation.context ? JSON.parse(operation.context) : {};
      const anchorTxId = context.anchor_tx_id;
      if (!anchorTxId) throw new Error("ID da transação da âncora não encontrado no registro da operação.");

      const transferServerUrl = await this.getSep24TransferServerUrl();
      const checkEndpoint = `${transferServerUrl}/transaction?id=${anchorTxId}`;
      
      console.log(`[REAL] Verificando status na âncora: ${checkEndpoint}`);
      const anchorResponse = await axios.get(checkEndpoint);

      const anchorStatus = anchorResponse.data.transaction.status;
      let ourStatus = operation.status as string;

      if (anchorStatus === 'completed' && ourStatus !== 'COMPLETED') {
        await OperationRepository.update(operationId, { status: 'COMPLETED' as any });
        ourStatus = 'COMPLETED';
      } else if (['error', 'failed'].includes(anchorStatus) && ourStatus !== 'FAILED') {
        await OperationRepository.update(operationId, { status: 'FAILED' as any });
        ourStatus = 'FAILED';
      }
      
      const message = ourStatus === 'COMPLETED' 
        ? 'Depósito concluído com sucesso!'
        : `O status atual na âncora é: '${anchorStatus}'. Aguardando conclusão.`;

      return { status: ourStatus, message };
    } catch (error: any) {
      console.error('Erro ao verificar status do depósito real:', error.response?.data || error.message);
      throw new Error('Falha ao consultar status do depósito PIX na âncora.');
    }
  }
}