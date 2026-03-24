import { Router, Request, Response } from 'express';
import { TwilioController } from '../controllers/twilio.controller';
import { validateTwilioSignature } from '../middlewares/twilio-validation.middleware';

const router = Router();
const twilio = new TwilioController();

/**
 * Health check - no authentication required for this endpoint
 */
router.get('/health', (req: Request, res: Response) => {
  twilio.healthCheck(req, res);
});

/**
 * Status endpoint - useful for monitoring
 */
router.get('/status', (req: Request, res: Response) => {
  twilio.getStatus(req, res);
});

/**
 * Main webhook endpoint for incoming messages
 * Validates Twilio signature before processing
 *
 * POST /agent-webhook/message
 * Expected body (form-encoded from Twilio):
 *   - From: Phone number of sender (e.g., whatsapp:+1234567890)
 *   - To: Phone number of receiver
 *   - Body: Message content
 *   - MessageSid: Unique message ID
 *   - NumMedia: Number of media attachments
 */
const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN;
const validationMiddleware = twilioAuthToken
  ? validateTwilioSignature(twilioAuthToken)
  : (req: Request, res: Response, next: any) => next(); // Skip validation if token not set

router.post('/message', validationMiddleware, (req: Request, res: Response) => {
  twilio.handleIncomingMessage(req, res);
});

/**
 * Webhook endpoint with alternative path
 */
router.post('/webhook', validationMiddleware, (req: Request, res: Response) => {
  twilio.handleIncomingMessage(req, res);
});

export default router;
