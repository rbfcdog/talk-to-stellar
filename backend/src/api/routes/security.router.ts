import express from 'express';
import { PinResetController } from '../controllers/pin-reset.controller';

const router = express.Router();

/**
 * POST /api/security/reset-pin-init
 * Start PIN reset process - generates temporary reset link
 */
router.post('/reset-pin-init', PinResetController.initiatePinReset);

/**
 * POST /api/security/reset-pin-verify
 * Verify reset token is valid
 */
router.post('/reset-pin-verify', PinResetController.verifyResetToken);

/**
 * POST /api/security/reset-pin-finalize
 * Complete PIN reset with new PIN
 */
router.post('/reset-pin-finalize', PinResetController.finalizePinReset);

export default router;
