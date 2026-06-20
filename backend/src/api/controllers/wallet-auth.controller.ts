import { Request, Response } from 'express';
import { WalletAuthService } from '../../integrations/stellar-wallets-auth/service';
import { logger } from '../../utils/logger';

function ok(res: Response, data: unknown, status = 200) {
  res.status(status).json(data);
}

function err(res: Response, e: unknown, status = 500) {
  const msg = e instanceof Error ? e.message : String(e);
  logger.error(`[wallet-auth-ctrl] ${msg}`);
  res.status(status).json({ error: msg });
}

export const WalletAuthController = {
  // GET /api/wallet-auth/challenge?account=G...
  challenge(req: Request, res: Response) {
    try {
      const account = req.query.account as string | undefined;
      if (!account) return err(res, 'account query param required', 400);
      const challenge = WalletAuthService.buildChallenge(account);
      ok(res, challenge);
    } catch (e) {
      err(res, e);
    }
  },

  // POST /api/wallet-auth/verify
  // body: { transaction, stellar_address, wallet_type? }
  async verify(req: Request, res: Response) {
    try {
      const { transaction, stellar_address, wallet_type } = req.body as {
        transaction?: string;
        stellar_address?: string;
        wallet_type?: string;
      };
      if (!transaction) return err(res, 'transaction (signed XDR) required', 400);
      if (!stellar_address) return err(res, 'stellar_address required', 400);

      const result = await WalletAuthService.verifyChallenge(transaction, stellar_address, wallet_type);
      ok(res, result);
    } catch (e) {
      err(res, e);
    }
  },

  // GET /api/wallet-auth/session?account=G...
  async getSession(req: Request, res: Response) {
    try {
      const account = req.query.account as string | undefined;
      if (!account) return err(res, 'account query param required', 400);
      const session = await WalletAuthService.getSession(account);
      ok(res, { session });
    } catch (e) {
      err(res, e);
    }
  },

  // POST /api/wallet-auth/validate
  // body: { token }
  validateToken(req: Request, res: Response) {
    try {
      const { token } = req.body as { token?: string };
      if (!token) return err(res, 'token required', 400);
      const result = WalletAuthService.verifyToken(token);
      ok(res, { valid: true, ...result });
    } catch (e) {
      err(res, e, 401);
    }
  },
};
