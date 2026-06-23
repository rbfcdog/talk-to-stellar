import { Request, Response } from 'express';
import { runAutoYield } from '../../integrations/auto-yield/service';
import { logger } from '../../utils/logger';

function ok(res: Response, data: unknown) { res.status(200).json(data); }
function err(res: Response, e: unknown, status = 500) {
  const msg = e instanceof Error ? e.message : String(e);
  logger.error(`[auto-yield-ctrl] ${msg}`);
  res.status(status).json({ error: msg });
}

export const AutoYieldController = {
  /**
   * POST /api/auto-yield/run
   * Body: { dry_run?: boolean, max_wallets?: number }
   * Admin-only trigger to run the auto-yield sweep immediately.
   */
  async run(req: Request, res: Response) {
    try {
      const dryRun = req.body?.dry_run !== undefined ? Boolean(req.body.dry_run) : undefined;
      const maxWallets = req.body?.max_wallets ? Number(req.body.max_wallets) : undefined;
      const summary = await runAutoYield({ dryRun, maxWallets });
      ok(res, summary);
    } catch (e) { err(res, e); }
  },
};
