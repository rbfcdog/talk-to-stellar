import { Router } from 'express';
import { EarlyAccessController } from '../controllers/early-access.controller';

const router = Router();

router.post('/', EarlyAccessController.subscribe);

export default router;
