import { Router } from 'express';
import { AxelarController } from '../controllers/axelar.controller';
const router = Router();
router.get('/chains', AxelarController.getChains);
router.get('/assets', AxelarController.getAssets);
router.get('/gmp/stats', AxelarController.getGMPStats);
router.get('/transfer/:txHash', AxelarController.getTransferStatus);
router.get('/transfer', AxelarController.getTransferStatus);
export default router;
