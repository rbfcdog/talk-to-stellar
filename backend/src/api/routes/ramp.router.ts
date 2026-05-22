import { Router } from 'express';
import { RampController } from '../controllers/ramp.controller';

const router = Router();

router.get('/etherfuse/config', RampController.getEtherfuseConfig);
router.post('/etherfuse/resolve-wallet', RampController.resolveEtherfuseWalletByEmail);
router.post('/etherfuse/customer', RampController.createEtherfuseCustomer);
router.get('/etherfuse/kyc-status', RampController.getEtherfuseKycStatus);
router.get('/etherfuse/assets', RampController.getEtherfuseAssets);
router.get('/etherfuse/wallet-balances', RampController.getEtherfuseWalletBalances);
router.get('/etherfuse/fiat-accounts', RampController.listEtherfuseFiatAccounts);
router.post('/etherfuse/external-bank-account', RampController.getExternalBankAccount);
router.post('/etherfuse/quote', RampController.createEtherfuseQuote);
router.post('/etherfuse/trustline', RampController.ensureEtherfuseTesouroTrustline);
router.post('/etherfuse/onramp', RampController.createEtherfuseOnRamp);
router.get('/etherfuse/onramp/:orderId', RampController.getEtherfuseOnRamp);
router.post('/etherfuse/offramp-preview', RampController.previewEtherfuseOffRamp);
router.post('/etherfuse/offramp', RampController.createEtherfuseOffRamp);
router.get('/etherfuse/offramp/:orderId', RampController.getEtherfuseOffRamp);
router.post('/etherfuse/offramp/:orderId/submit', RampController.submitEtherfuseOffRamp);
router.post('/etherfuse/sandbox/simulate-fiat', RampController.simulateEtherfuseFiatReceived);
router.post('/etherfuse/sandbox/pix-funded-transfer', RampController.submitPixFundedTransfer);
router.post('/etherfuse/sandbox/test-onramp', RampController.runTemporaryEtherfuseOnRampTest);
router.post('/etherfuse/sandbox/test-offramp', RampController.runTemporaryEtherfuseOffRampTest);

export default router;
