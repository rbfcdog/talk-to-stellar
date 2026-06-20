import { Request, Response } from 'express';
import { PasskeyWalletService } from '../../integrations/passkey-wallets/service';
import { logger } from '../../utils/logger';

function ok(res: Response, data: unknown, status = 200) { res.status(status).json(data); }
function err(res: Response, e: unknown, status = 500) {
  const msg = e instanceof Error ? e.message : String(e);
  logger.error(`[passkey-ctrl] ${msg}`);
  res.status(status).json({ error: msg });
}

export const PasskeyWalletsController = {
  async register(req: Request, res: Response) {
    try {
      const { user_id, email, contract_id, key_id_base64, network, label } = req.body;
      if (!contract_id) return err(res, 'contract_id required', 400);
      if (!key_id_base64) return err(res, 'key_id_base64 required', 400);
      const wallet = await PasskeyWalletService.register({
        user_id, email, contract_id, key_id_base64,
        network: network || 'testnet', label,
      });
      ok(res, wallet, 201);
    } catch (e) { err(res, e); }
  },

  async getContractId(req: Request, res: Response) {
    try {
      const keyId = req.query.key_id as string;
      if (!keyId) return err(res, 'key_id query param required', 400);
      const contractId = await PasskeyWalletService.getContractId(keyId);
      ok(res, { contract_id: contractId });
    } catch (e) { err(res, e); }
  },

  async relay(req: Request, res: Response) {
    try {
      const { xdr } = req.body as { xdr?: string };
      if (!xdr) return err(res, 'xdr required', 400);
      const result = await PasskeyWalletService.relayTransaction(xdr);
      ok(res, result, result.success ? 200 : 502);
    } catch (e) { err(res, e); }
  },

  async getBalance(req: Request, res: Response) {
    try {
      const result = await PasskeyWalletService.getBalance(req.params.contractId);
      ok(res, result);
    } catch (e) { err(res, e); }
  },

  async getSigners(req: Request, res: Response) {
    try {
      const signers = await PasskeyWalletService.getSigners(req.params.contractId);
      ok(res, { signers });
    } catch (e) { err(res, e); }
  },

  async list(req: Request, res: Response) {
    try {
      const userId = req.query.user_id as string;
      if (!userId) return err(res, 'user_id query param required', 400);
      const wallets = await PasskeyWalletService.listWallets(userId);
      ok(res, { wallets });
    } catch (e) { err(res, e); }
  },
};
