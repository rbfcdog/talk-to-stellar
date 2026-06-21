import { Router } from 'express';
import { AllbridgeController } from '../controllers/allbridge.controller';
const router = Router();
router.get('/chains', AllbridgeController.getChains);
router.get('/stellar-tokens', AllbridgeController.getStellarTokens);
router.post('/receive-amount', AllbridgeController.getReceiveAmount);
export default router;
