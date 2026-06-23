import { Router } from 'express';
import { BlendController } from '../controllers/blend.controller';
const router = Router();

// Legacy
router.get('/pools', BlendController.listPools);
router.get('/addresses', BlendController.getAddresses);
router.get('/pools/:pool', BlendController.getPool);

// On-chain data
router.get('/pool/info', BlendController.getPoolInfo);
router.get('/pool/position', BlendController.getUserPosition);

// XDR builders (client signs + submits via /api/swap/send)
router.post('/pool/supply', BlendController.buildSupply);
router.post('/pool/withdraw', BlendController.buildWithdraw);

export default router;
