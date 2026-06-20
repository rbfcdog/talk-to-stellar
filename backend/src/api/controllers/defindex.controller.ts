import { Request, Response } from 'express';
import { DefindexService } from '../../integrations/defindex/service';
import { logger } from '../../utils/logger';

function ok(res: Response, data: unknown) { res.status(200).json(data); }
function err(res: Response, e: unknown, status = 500) {
  const msg = e instanceof Error ? e.message : String(e);
  logger.error(`[defindex-ctrl] ${msg}`);
  res.status(status).json({ error: msg });
}

export const DefindexController = {
  async listVaults(_req: Request, res: Response) {
    try {
      const data = await DefindexService.listVaults();
      ok(res, { default_vault: DefindexService.getDefaultVault(), health: data });
    } catch (e) { err(res, e); }
  },

  async getVaultInfo(req: Request, res: Response) {
    try {
      const vault = req.params.vault;
      const result = await DefindexService.getVaultInfo(vault);
      ok(res, result);
    } catch (e) { err(res, e); }
  },

  async getUserBalance(req: Request, res: Response) {
    try {
      const address = req.query.address as string;
      if (!address) return err(res, 'address query param required', 400);
      const vault = req.params.vault;
      const result = await DefindexService.getUserBalance(address, vault);
      ok(res, result);
    } catch (e) { err(res, e); }
  },

  async buildDeposit(req: Request, res: Response) {
    try {
      const { user_address, amount_stroops } = req.body;
      if (!user_address) return err(res, 'user_address required', 400);
      if (!amount_stroops) return err(res, 'amount_stroops required', 400);
      const vault = req.params.vault;
      const result = await DefindexService.buildDepositXdr(user_address, amount_stroops, vault);
      ok(res, result);
    } catch (e) { err(res, e); }
  },

  async buildWithdraw(req: Request, res: Response) {
    try {
      const { user_address, shares_amount } = req.body;
      if (!user_address) return err(res, 'user_address required', 400);
      if (!shares_amount) return err(res, 'shares_amount required', 400);
      const vault = req.params.vault;
      const result = await DefindexService.buildWithdrawXdr(user_address, shares_amount, vault);
      ok(res, result);
    } catch (e) { err(res, e); }
  },
};
