import { Router } from 'express';
import { BlendController } from '../controllers/blend.controller';
const router = Router();
router.get('/pools', BlendController.listPools);
router.get('/addresses', BlendController.getAddresses);
router.get('/pools/:pool', BlendController.getPool);
export default router;
