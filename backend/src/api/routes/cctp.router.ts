import { Router } from 'express';
import { CctpController } from '../controllers/cctp.controller';

const router = Router();

router.get('/status', CctpController.checkStatus);
router.get('/chains', CctpController.getSupportedChains);
router.get('/instructions', CctpController.getInstructions);

export default router;
