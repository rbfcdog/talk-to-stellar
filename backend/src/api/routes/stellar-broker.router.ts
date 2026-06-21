import { Router } from 'express';
import { StellarBrokerController } from '../controllers/stellar-broker.controller';
const router = Router();
router.get('/health', StellarBrokerController.getHealth);
router.get('/quote', StellarBrokerController.getQuote);
export default router;
