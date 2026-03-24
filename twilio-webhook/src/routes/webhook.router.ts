import { Router, Request, Response } from 'express';
import { WebhookController } from '../controllers/webhook.controller';
import { validateTwilioSignature } from '../middlewares/twilio-validation.middleware';

const router = Router();
const webhook = new WebhookController();

/**
 * Health check - no authentication required for this endpoint
 */
router.get('/health', (req: Request, res: Response) => {
  webhook.healthCheck(req, res);
});

/**
 * Status endpoint - useful for monitoring
 */
router.get('/status', (req: Request, res: Response) => {
  webhook.getStatus(req, res);
});

/**
 * Main webhook endpoint for incoming messages
 * Validates Twilio signature before processing
 *
 * POST /message
 * Expected body (form-encoded from Twilio):
 *   - From: Phone number of sender (e.g., whatsapp:+1234567890)
 *   - To: Phone number of receiver
 *   - Body: Message content
 *   - MessageSid: Unique message ID
 *   - NumMedia: Number of media attachments
 */
router.post('/message', validateTwilioSignature, (req: Request, res: Response) => {
  webhook.handleIncomingMessage(req, res);
});

/**
 * Alternative webhook endpoint path
 */
router.post('/webhook', validateTwilioSignature, (req: Request, res: Response) => {
  webhook.handleIncomingMessage(req, res);
});

export default router;
