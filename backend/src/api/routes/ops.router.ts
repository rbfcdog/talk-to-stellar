import { NextFunction, Request, Response, Router } from 'express';
import { opsController } from '../controllers/ops.controller';
import { sensitiveRateLimit } from '../middlewares/security.middleware';

const opsRouter = Router();

function asyncRoute(handler: (req: Request, res: Response) => Promise<void>) {
  return (req: Request, res: Response, next: NextFunction) => {
    handler(req, res).catch(next);
  };
}

// Dashboard pages
opsRouter.get('/ops/login', asyncRoute((req, res) => opsController.loginForm(req, res)));
opsRouter.post('/ops/login', sensitiveRateLimit, asyncRoute((req, res) => opsController.login(req, res)));
opsRouter.post('/ops/logout', sensitiveRateLimit, asyncRoute((req, res) => opsController.logout(req, res)));
opsRouter.get('/ops', asyncRoute((req, res) => opsController.dashboard(req, res)));
opsRouter.get('/ops/transfers/:id', asyncRoute((req, res) => opsController.transferDetail(req, res)));

// JSON API
opsRouter.get('/api/ops/history', asyncRoute((req, res) => opsController.apiListHistory(req, res)));
opsRouter.get('/api/transfers', asyncRoute((req, res) => opsController.apiListTransfers(req, res)));
opsRouter.get('/api/transfers/:id', asyncRoute((req, res) => opsController.apiGetTransfer(req, res)));
opsRouter.post('/api/transfers', asyncRoute((req, res) => opsController.apiCreateTransfer(req, res)));

export { opsRouter };
