import { Router } from 'express';
import ExternalController from '../controllers/external.controller';
import ExternalFinalizeController from '../controllers/external-finalize.controller';
import ExternalValidateController from '../controllers/external-validate.controller';
import ExternalRecoveryController from '../controllers/external-recovery.controller';

const router = Router();

// public endpoint used by adapters (telegram, whatsapp) to check if an external user is onboarded
router.post('/check-account', ExternalController.checkAccount);
router.post('/link-existing', ExternalController.linkExistingAccount);
router.post('/finalize', ExternalFinalizeController.finalize);
router.get('/validate-token', ExternalValidateController.validate);
router.post('/recovery-init', ExternalRecoveryController.recoveryInit);
router.post('/recovery-complete', ExternalRecoveryController.recoveryComplete);

export default router;
