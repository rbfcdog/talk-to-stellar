import { Router } from 'express';
import BridgeWebhookController from '../controllers/bridge-webhook.controller';

const router = Router();

router.post('/', BridgeWebhookController.webhook);
router.get('/health', BridgeWebhookController.health);

export default router;
