import { Router } from 'express';
import ExternalController from '../controllers/external.controller';
import ExternalFinalizeController from '../controllers/external-finalize.controller';
import ExternalValidateController from '../controllers/external-validate.controller';
import ExternalRecoveryController from '../controllers/external-recovery.controller';
import PayLinkController from '../controllers/pay-link.controller';
import SendWalletController from '../controllers/send-wallet.controller';
import { ReceiptImageController } from '../controllers/receipt-image.controller';
import { ShortLinkController } from '../controllers/short-link.controller';

const router = Router();

// public endpoint used by adapters (telegram, whatsapp) to check if an external user is onboarded
router.post('/check-account', ExternalController.checkAccount);
router.post('/link-existing', ExternalController.linkExistingAccount);
router.post('/link-session', ExternalController.linkSessionToExternalAccount);
router.post('/finalize', ExternalFinalizeController.finalize);
router.get('/validate-token', ExternalValidateController.validate);
router.get('/short-links/:code', ShortLinkController.resolve);
router.post('/short-links/:code/consume', ShortLinkController.consume);
router.post('/pay-links', PayLinkController.create);
router.post('/pay-links/claim', PayLinkController.claim);
router.post('/send-to-wallet', SendWalletController.sendToWallet);
router.post('/short-links', ShortLinkController.create);
router.post('/recovery-init', ExternalRecoveryController.recoveryInit);
router.post('/recovery-complete', ExternalRecoveryController.recoveryComplete);
router.get('/receipts/viewer/:code', ReceiptImageController.viewer);
router.get('/receipts/:tx_hash', ReceiptImageController.show);
router.get('/receipts/:tx_hash/download', ReceiptImageController.download);
router.post('/receipts/render', ReceiptImageController.render);

export default router;
