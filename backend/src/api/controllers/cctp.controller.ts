import { Request, Response } from 'express';
import { CctpService } from '../../integrations/cctp/service';
import { CCTP_DOMAIN_IDS, CctpSourceChain } from '../../integrations/cctp/types';
import { logger } from '../../utils/logger';

export const CctpController = {
  /**
   * GET /api/cctp/status?txHash=<hash>&chain=<chain>
   *
   * Returns the attestation status of a cross-chain USDC transfer.
   * When status is 'attested', the response includes the raw message + attestation
   * needed to call receive_message() on the Stellar CCTP contract.
   */
  async checkStatus(req: Request, res: Response): Promise<void> {
    const { txHash, chain } = req.query as Record<string, string>;

    if (!txHash) {
      res.status(400).json({ error: 'txHash query param is required' });
      return;
    }

    if (!chain) {
      res.status(400).json({ error: 'chain query param is required' });
      return;
    }

    const validChains = Object.keys(CCTP_DOMAIN_IDS) as CctpSourceChain[];
    if (!validChains.includes(chain as CctpSourceChain)) {
      res.status(400).json({
        error: `Invalid chain. Supported chains: ${validChains.join(', ')}`,
      });
      return;
    }

    try {
      const status = await CctpService.checkTransferStatus(txHash, chain as CctpSourceChain);
      res.json(status);
    } catch (e: any) {
      logger.error(`[cctp] checkStatus error: ${e.message}`);
      res.status(500).json({ error: 'Failed to check transfer status' });
    }
  },

  /**
   * GET /api/cctp/chains
   *
   * Returns info on all supported source chains — domain IDs, CCTP contract
   * addresses, and per-chain instructions.
   */
  async getSupportedChains(_req: Request, res: Response): Promise<void> {
    try {
      const chains = CctpService.getSupportedChains();
      res.json({ chains });
    } catch (e: any) {
      logger.error(`[cctp] getSupportedChains error: ${e.message}`);
      res.status(500).json({ error: 'Failed to get supported chains' });
    }
  },

  /**
   * GET /api/cctp/instructions?stellarAddress=<addr>&amount=<amount>&chain=<chain>
   *
   * Returns user-facing instructions (in Portuguese) on how to send USDC
   * from the specified chain to a Stellar wallet via CCTP V2.
   */
  async getInstructions(req: Request, res: Response): Promise<void> {
    const { stellarAddress, amount, chain } = req.query as Record<string, string>;

    if (!stellarAddress) {
      res.status(400).json({ error: 'stellarAddress query param is required' });
      return;
    }

    if (!amount) {
      res.status(400).json({ error: 'amount query param is required' });
      return;
    }

    if (!chain) {
      res.status(400).json({ error: 'chain query param is required' });
      return;
    }

    const validChains = Object.keys(CCTP_DOMAIN_IDS) as CctpSourceChain[];
    if (!validChains.includes(chain as CctpSourceChain)) {
      res.status(400).json({
        error: `Invalid chain. Supported chains: ${validChains.join(', ')}`,
      });
      return;
    }

    try {
      const instructions = CctpService.buildInstructions(
        stellarAddress,
        amount,
        chain as CctpSourceChain,
      );
      res.json({ instructions });
    } catch (e: any) {
      logger.error(`[cctp] getInstructions error: ${e.message}`);
      res.status(500).json({ error: 'Failed to build instructions' });
    }
  },
};
