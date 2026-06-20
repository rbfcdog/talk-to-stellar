/**
 * CCTP V2 Service — Circle Cross-Chain Transfer Protocol
 *
 * Tracks cross-chain USDC transfers destined for Stellar.
 * CCTP V2 went live on Stellar in May 2026 (destination domain 4).
 *
 * Flow:
 *   1. User burns USDC on source chain (Ethereum/Base/Solana/etc.)
 *   2. Circle attests the burn after enough confirmations (~2-3 min)
 *   3. Once attested, anyone can call receive_message() on the Stellar contract
 *      to mint native USDC to the destination address
 *
 * This service handles steps 1-2 (status polling + instructions).
 * Step 3 (mint execution) requires a Stellar signer and is triggered by the user.
 */

import { logger } from '../../utils/logger';
import { loadCctpConfig, CCTP_SOURCE_CONTRACTS } from './config';
import {
  CctpSourceChain,
  CctpTransferStatus,
  CctpChainInfo,
  CCTP_DOMAIN_IDS,
  STELLAR_DOMAIN_ID,
} from './types';

export const CctpService = {
  /**
   * Poll Circle's attestation API to get the current status of a cross-chain transfer.
   *
   * @param sourceTxHash - The transaction hash on the source chain (e.g. 0x... for EVM, base58 for Solana)
   * @param sourceChain  - The chain where the burn transaction was submitted
   */
  async checkTransferStatus(
    sourceTxHash: string,
    sourceChain: CctpSourceChain,
  ): Promise<CctpTransferStatus> {
    const config = loadCctpConfig();
    const domainId = CCTP_DOMAIN_IDS[sourceChain];
    const url = `${config.attestationApiUrl}/messages/${domainId}?transactionHash=${sourceTxHash}`;

    logger.debug(`[cctp] Checking transfer status chain=${sourceChain} domain=${domainId} tx=${sourceTxHash.slice(0, 16)}...`);

    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'TalkToStellar/1.0' },
        signal: AbortSignal.timeout(10_000),
      });

      if (!res.ok) {
        const body = await res.text().catch(() => '');
        logger.warn(`[cctp] Attestation API returned ${res.status} for tx=${sourceTxHash.slice(0, 16)}: ${body.slice(0, 200)}`);
        return {
          sourceTxHash,
          sourceChain,
          status: 'unknown',
          canMint: false,
          error: `Attestation API error: HTTP ${res.status}`,
        };
      }

      const data = await res.json() as any;
      const messages: any[] = Array.isArray(data.messages) ? data.messages : [];

      if (messages.length === 0) {
        logger.debug(`[cctp] No messages found for tx=${sourceTxHash.slice(0, 16)}`);
        return {
          sourceTxHash,
          sourceChain,
          status: 'pending',
          canMint: false,
        };
      }

      const msg = messages[0];
      const circleStatus: string = msg.status || '';

      if (circleStatus === 'complete') {
        logger.info(`[cctp] Transfer attested and ready to mint chain=${sourceChain} tx=${sourceTxHash.slice(0, 16)}...`);
        return {
          sourceTxHash,
          sourceChain,
          status: 'attested',
          message: msg.message,
          attestation: msg.attestation,
          canMint: true,
        };
      }

      // pending_confirmations or any other non-complete status
      logger.debug(`[cctp] Transfer pending circle_status=${circleStatus} tx=${sourceTxHash.slice(0, 16)}...`);
      return {
        sourceTxHash,
        sourceChain,
        status: 'pending',
        canMint: false,
      };
    } catch (e: any) {
      logger.warn(`[cctp] checkTransferStatus failed: ${e.message}`);
      return {
        sourceTxHash,
        sourceChain,
        status: 'unknown',
        canMint: false,
        error: e.message,
      };
    }
  },

  /**
   * Return information about supported source chains, including
   * the CCTP contract address and a short how-to for each chain.
   */
  getSupportedChains(): CctpChainInfo[] {
    return (Object.keys(CCTP_DOMAIN_IDS) as CctpSourceChain[]).map((chain) => {
      const contractInfo = CCTP_SOURCE_CONTRACTS[chain];
      const contractAddress = contractInfo?.contractAddress ?? '';
      const explorerUrl = contractInfo?.explorerBase ?? '';

      const instructions = this._chainInstructions(chain);

      return {
        chain,
        domainId: CCTP_DOMAIN_IDS[chain],
        contractAddress,
        explorerUrl,
        instructions,
      };
    });
  },

  /**
   * Build user-facing instructions (in Portuguese) for sending USDC from a
   * specific source chain to a Stellar address via CCTP V2.
   */
  buildInstructions(
    stellarAddress: string,
    amount: string,
    sourceChain: CctpSourceChain,
  ): string {
    const chainLabel = this._chainLabel(sourceChain);
    return (
      `Para receber USDC na sua carteira Stellar via ${chainLabel}:\n` +
      `1. Acesse o site do CCTP ou use Across/Stargate\n` +
      `2. Selecione ${chainLabel} → Stellar\n` +
      `3. Endereço destino Stellar: ${stellarAddress}\n` +
      `4. Valor: ${amount} USDC\n` +
      `5. Confirme — em ~3 minutos seu USDC chega automaticamente`
    );
  },

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  _chainLabel(chain: CctpSourceChain): string {
    const labels: Record<CctpSourceChain, string> = {
      ethereum: 'Ethereum',
      base: 'Base',
      solana: 'Solana',
      avalanche: 'Avalanche',
      polygon: 'Polygon',
    };
    return labels[chain] ?? chain;
  },

  _chainInstructions(chain: CctpSourceChain): string {
    const label = this._chainLabel(chain);
    const contractInfo = CCTP_SOURCE_CONTRACTS[chain];
    const contract = contractInfo
      ? ` (contrato: ${contractInfo.contractAddress})`
      : '';
    return `Queime USDC na rede ${label}${contract} chamando depositForBurn com destinationDomain=${STELLAR_DOMAIN_ID}. Aguarde ~2-3 minutos para a atestação Circle e então execute receive_message() no contrato Stellar para receber o USDC nativo.`;
  },
};
