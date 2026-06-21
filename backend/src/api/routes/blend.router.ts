import { Router } from 'express';
import { BlendController } from '../controllers/blend.controller';
const router = Router();
router.get('/pools', BlendController.listPools);
router.get('/pools/:pool', BlendController.getPool);
router.get('/user/:address', BlendController.getUserPositions);
router.get('/user', BlendController.getUserPositions);
export default router;
