import express from 'express';
import PasskeyController from '../controllers/passkey.controller';

const router = express.Router();

router.post('/register-init', PasskeyController.registerInit);
router.post('/register-complete', PasskeyController.registerComplete);
router.post('/auth-init', PasskeyController.authInit);
router.post('/auth-complete', PasskeyController.authComplete);
router.post('/smart-account-status', PasskeyController.smartAccountStatus);

export default router;
