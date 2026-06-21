import { Router } from 'express';
import { StellarBrokerController } from '../controllers/stellar-broker.controller';
const router = Router();
router.get('/quote', StellarBrokerController.getQuote);
router.get('/routes', StellarBrokerController.getRoutes);
router.get('/assets', StellarBrokerController.getAssets);
export default router;
