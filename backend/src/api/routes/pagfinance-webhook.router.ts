import { Router } from 'express';
import { PagfinanceWebhookController } from '../controllers/pagfinance-webhook.controller';

const router = Router();

router.post('/', PagfinanceWebhookController.cashin);
router.get('/health', PagfinanceWebhookController.health);

export default router;
