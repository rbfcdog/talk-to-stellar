import { Router } from 'express';
import { WalletAuthController } from '../controllers/wallet-auth.controller';

const router = Router();

// SEP-10 challenge/verify flow
router.get('/challenge', WalletAuthController.challenge);
router.post('/verify', WalletAuthController.verify);

// Session management
router.get('/session', WalletAuthController.getSession);
router.post('/validate', WalletAuthController.validateToken);

export default router;
