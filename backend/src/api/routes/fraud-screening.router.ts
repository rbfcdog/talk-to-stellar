import { Router } from 'express';
import { FraudScreeningController } from '../controllers/fraud-screening.controller';
const router = Router();
router.get('/address/:address', FraudScreeningController.screenAddress);
router.get('/domain/:domain', FraudScreeningController.screenDomain);
router.post('/batch', FraudScreeningController.batchScreen);
export default router;
