import { Router } from 'express';
import { NearIntentsController } from '../controllers/near-intents.controller';
const router = Router();
router.get('/tokens', NearIntentsController.getTokens);
router.get('/routes', NearIntentsController.getSupportedRoutes);
router.post('/quote', NearIntentsController.getQuote);
export default router;
