import { Router } from 'express';
import { SoroswapController } from '../controllers/soroswap.controller';
const router = Router();
router.get('/quote', SoroswapController.quote);
router.post('/build', SoroswapController.build);
router.post('/send', SoroswapController.send);
router.get('/tokens', SoroswapController.tokens);
router.get('/pool-info', SoroswapController.poolInfo);
export default router;
