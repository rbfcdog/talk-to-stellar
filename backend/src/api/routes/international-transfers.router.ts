import { Router } from 'express';
import { InternationalTransfersController } from '../controllers/international-transfers.controller';

const router = Router();

router.post('/', InternationalTransfersController.createTransfer);
router.post('/:id/pix-intent', InternationalTransfersController.createPixIntent);
router.post('/:id/settle-stellar', InternationalTransfersController.settleStellar);
router.post('/:id/payout-instruction', InternationalTransfersController.createPayoutInstruction);
router.get('/:id/reconciliation', InternationalTransfersController.getReconciliation);
router.get('/:id', InternationalTransfersController.getTransfer);

export default router;
