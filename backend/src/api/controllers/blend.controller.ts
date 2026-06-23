import { Request, Response } from 'express';
import { BlendService } from '../../integrations/blend/service';
import { logger } from '../../utils/logger';

function ok(res: Response, data: unknown) { res.status(200).json(data); }
function err(res: Response, e: unknown, status = 500) {
  const msg = e instanceof Error ? e.message : String(e);
  logger.error(`[blend-ctrl] ${msg}`);
  res.status(status).json({ error: msg });
}

export const BlendController = {
  async listPools(_req: Request, res: Response) {
    try { ok(res, { pools: await BlendService.listPools() }); } catch (e) { err(res, e); }
  },

  async getPool(req: Request, res: Response) {
    try {
      const poolId = req.params.pool ?? req.query.pool as string;
      if (!poolId) return err(res, 'pool id required', 400);
      ok(res, await BlendService.getPool(poolId));
    } catch (e) { err(res, e); }
  },

  async getAddresses(_req: Request, res: Response) {
    ok(res, { pools: BlendService.getPoolAddresses() });
  },

  // Returns on-chain APY and reserve data
  async getPoolInfo(req: Request, res: Response) {
    try {
      const network = req.query.network as string | undefined;
      ok(res, await BlendService.getPoolInfo(network));
    } catch (e) { err(res, e); }
  },

  // Returns user's supply/collateral positions
  async getUserPosition(req: Request, res: Response) {
    try {
      const address = req.query.address as string;
      const network = req.query.network as string | undefined;
      if (!address) return err(res, 'address required', 400);
      ok(res, await BlendService.getUserPosition(address, network));
    } catch (e) { err(res, e); }
  },

  // Builds supply XDR — client signs with Freighter, then POSTs to /api/swap/send
  async buildSupply(req: Request, res: Response) {
    try {
      const { user_address, asset_id, amount, network } = req.body as {
        user_address: string;
        asset_id: string;
        amount: string;
        network?: string;
      };
      if (!user_address || !asset_id || !amount) return err(res, 'user_address, asset_id, amount required', 400);
      ok(res, await BlendService.buildSupplyXdr({ userAddress: user_address, assetId: asset_id, amount, network }));
    } catch (e) { err(res, e); }
  },

  // Builds withdraw XDR
  async buildWithdraw(req: Request, res: Response) {
    try {
      const { user_address, asset_id, amount, network } = req.body as {
        user_address: string;
        asset_id: string;
        amount: string;
        network?: string;
      };
      if (!user_address || !asset_id || !amount) return err(res, 'user_address, asset_id, amount required', 400);
      ok(res, await BlendService.buildWithdrawXdr({ userAddress: user_address, assetId: asset_id, amount, network }));
    } catch (e) { err(res, e); }
  },
};
