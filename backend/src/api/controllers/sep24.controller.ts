import { Request, Response } from 'express';
import { getSep24Service } from '../../integrations/sep24/service';
import { logger } from '../../utils/logger';

function ok(res: Response, data: unknown, status = 200) {
  res.status(status).json(data);
}

function err(res: Response, e: unknown, status = 500) {
  const msg = e instanceof Error ? e.message : String(e);
  logger.error(`[sep24-ctrl] ${msg}`);
  res.status(status).json({ error: msg });
}

export const Sep24Controller = {
  // GET /api/sep24/anchors
  listAnchors(_req: Request, res: Response) {
    try {
      const anchors = getSep24Service().listKnownAnchors();
      ok(res, { anchors });
    } catch (e) {
      err(res, e);
    }
  },

  // GET /api/sep24/anchors/:domain/toml
  async fetchToml(req: Request, res: Response) {
    try {
      const { domain } = req.params;
      const toml = await getSep24Service().fetchToml(decodeURIComponent(domain));
      ok(res, { toml });
    } catch (e) {
      err(res, e);
    }
  },

  // GET /api/sep24/anchors/:domain/info
  async getAnchorInfo(req: Request, res: Response) {
    try {
      const { domain } = req.params;
      const result = await getSep24Service().getAnchorInfo(decodeURIComponent(domain));
      ok(res, result);
    } catch (e) {
      err(res, e);
    }
  },

  // POST /api/sep24/auth
  // body: { domain, user_public_key, user_secret }
  async authenticate(req: Request, res: Response) {
    try {
      const { domain, user_public_key, user_secret } = req.body as {
        domain?: string;
        user_public_key?: string;
        user_secret?: string;
      };
      if (!domain) return err(res, 'domain required', 400);
      if (!user_public_key) return err(res, 'user_public_key required', 400);
      if (!user_secret) return err(res, 'user_secret required', 400);

      const result = await getSep24Service().authenticate(domain, user_public_key, user_secret);
      ok(res, result);
    } catch (e) {
      err(res, e);
    }
  },

  // POST /api/sep24/deposit
  // body: { domain, jwt, asset_code, account?, amount? }
  async startDeposit(req: Request, res: Response) {
    try {
      const { domain, jwt, asset_code, account, amount } = req.body as {
        domain?: string;
        jwt?: string;
        asset_code?: string;
        account?: string;
        amount?: string;
      };
      if (!domain) return err(res, 'domain required', 400);
      if (!jwt) return err(res, 'jwt required', 400);
      if (!asset_code) return err(res, 'asset_code required', 400);

      const result = await getSep24Service().startDeposit(domain, jwt, { asset_code, account, amount });
      ok(res, result);
    } catch (e) {
      err(res, e);
    }
  },

  // POST /api/sep24/withdraw
  // body: { domain, jwt, asset_code, account?, amount? }
  async startWithdrawal(req: Request, res: Response) {
    try {
      const { domain, jwt, asset_code, account, amount } = req.body as {
        domain?: string;
        jwt?: string;
        asset_code?: string;
        account?: string;
        amount?: string;
      };
      if (!domain) return err(res, 'domain required', 400);
      if (!jwt) return err(res, 'jwt required', 400);
      if (!asset_code) return err(res, 'asset_code required', 400);

      const result = await getSep24Service().startWithdrawal(domain, jwt, { asset_code, account, amount });
      ok(res, result);
    } catch (e) {
      err(res, e);
    }
  },

  // GET /api/sep24/transactions/:id?domain=...&jwt=...
  async getTransaction(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { domain, jwt } = req.query as { domain?: string; jwt?: string };
      if (!domain) return err(res, 'domain query param required', 400);
      if (!jwt) return err(res, 'jwt query param required', 400);

      const tx = await getSep24Service().getTransaction(domain, jwt, id);
      ok(res, { transaction: tx });
    } catch (e) {
      err(res, e);
    }
  },

  // GET /api/sep24/transactions?domain=...&jwt=...&asset_code=...&kind=...&limit=...
  async listTransactions(req: Request, res: Response) {
    try {
      const { domain, jwt, asset_code, kind, limit } = req.query as {
        domain?: string;
        jwt?: string;
        asset_code?: string;
        kind?: 'deposit' | 'withdrawal';
        limit?: string;
      };
      if (!domain) return err(res, 'domain query param required', 400);
      if (!jwt) return err(res, 'jwt query param required', 400);
      if (!asset_code) return err(res, 'asset_code query param required', 400);

      const txs = await getSep24Service().listTransactions(domain, jwt, {
        asset_code,
        kind,
        limit: limit ? parseInt(limit, 10) : undefined,
      });
      ok(res, { transactions: txs });
    } catch (e) {
      err(res, e);
    }
  },
};
