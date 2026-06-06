import { Router } from 'express';
import { InternationalTransfersController } from '../controllers/international-transfers.controller';

const router = Router();

router.post('/', InternationalTransfersController.createTransfer);
router.post('/:id/pix-intent', InternationalTransfersController.createPixIntent);
router.post('/:id/funding-confirmation', InternationalTransfersController.confirmSandboxFunding);
router.post('/:id/settle-stellar', InternationalTransfersController.settleStellar);
router.post('/:id/payout-instruction', InternationalTransfersController.createPayoutInstruction);
router.post('/:id/payout-status-refresh', InternationalTransfersController.refreshPayoutStatus);
router.get('/:id/reconciliation', InternationalTransfersController.getReconciliation);
router.get('/:id/orchestration-log', InternationalTransfersController.getOrchestrationLog);
router.get('/:id/reviewer-evidence', InternationalTransfersController.getReviewerEvidence);
router.get('/:id/workflow', InternationalTransfersController.getWorkflow);
router.get('/:id', InternationalTransfersController.getTransfer);

export default router;
