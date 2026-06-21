import { Router } from 'express';
import { AllbridgeController } from '../controllers/allbridge.controller';
const router = Router();
router.get('/info', AllbridgeController.getInfo);
router.get('/stellar-tokens', AllbridgeController.getStellarTokens);
export default router;
