import { Router } from 'express';
import { EtherfuseWebhookController } from '../controllers/etherfuse-webhook.controller';

const router = Router();

router.post('/etherfuse/pix', EtherfuseWebhookController.pix);

export default router;
