import { Router } from 'express';
import { opsController } from '../controllers/ops.controller';

const opsRouter = Router();

// Dashboard pages
opsRouter.get('/ops', (req, res) => opsController.dashboard(req, res));
opsRouter.get('/ops/transfers/:id', (req, res) => opsController.transferDetail(req, res));

// JSON API
opsRouter.get('/api/ops/history', (req, res) => opsController.apiListHistory(req, res));
opsRouter.get('/api/transfers', (req, res) => opsController.apiListTransfers(req, res));
opsRouter.get('/api/transfers/:id', (req, res) => opsController.apiGetTransfer(req, res));
opsRouter.post('/api/transfers', (req, res) => opsController.apiCreateTransfer(req, res));

export { opsRouter };
