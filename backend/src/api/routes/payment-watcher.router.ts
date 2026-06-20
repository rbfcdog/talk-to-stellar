import { Router } from 'express';
import { PaymentWatcherController } from '../controllers/payment-watcher.controller';
const router = Router();
router.get('/status', PaymentWatcherController.status);
router.post('/subscribe', PaymentWatcherController.subscribe);
router.post('/unsubscribe', PaymentWatcherController.unsubscribe);
export default router;
