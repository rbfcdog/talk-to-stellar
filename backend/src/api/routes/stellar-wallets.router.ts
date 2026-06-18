import { Router } from 'express';
import { StellarWalletsController } from '../controllers/stellar-wallets.controller';

const router = Router();

router.get('/wallets', StellarWalletsController.listWallets);
router.post('/wallets', StellarWalletsController.createWallet);
router.delete('/wallets/:id', StellarWalletsController.deleteWallet);

export default router;
