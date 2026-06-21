import { Router } from 'express';
import { AxelarController } from '../controllers/axelar.controller';
const router = Router();
router.get('/chains', AxelarController.getChains);
router.get('/transfer/:txHash', AxelarController.getTransferStatus);
router.get('/transfer', AxelarController.getTransferStatus);
export default router;
