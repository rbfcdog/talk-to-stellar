import { Router } from 'express';
import { AutoYieldController } from '../controllers/auto-yield.controller';

const router = Router();

router.post('/run', AutoYieldController.run);

export default router;
