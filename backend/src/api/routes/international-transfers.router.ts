import { Router } from 'express';
import { InternationalTransfersController } from '../controllers/international-transfers.controller';

const router = Router();

router.get('/payout-providers', InternationalTransfersController.getPayoutProviders);
router.post('/payout-events/:provider', InternationalTransfersController.receivePayoutProviderEvent);
router.get('/', InternationalTransfersController.listOrchestrationTransfers);
router.post('/', InternationalTransfersController.createTransfer);
router.post('/:id/pix-intent', InternationalTransfersController.createPixIntent);
router.post('/:id/funding-confirmation', InternationalTransfersController.confirmSandboxFunding);
router.post('/:id/settle-stellar', InternationalTransfersController.settleStellar);
router.post('/:id/payout-instruction', InternationalTransfersController.createPayoutInstruction);
router.post('/:id/payout-status-refresh', InternationalTransfersController.refreshPayoutStatus);
router.post('/wire-test/send', InternationalTransfersController.sendWireTest);
router.get('/:id/reconciliation', InternationalTransfersController.getReconciliation);
router.get('/:id/orchestration-log', InternationalTransfersController.getOrchestrationLog);
router.get('/:id/reviewer-evidence', InternationalTransfersController.getReviewerEvidence);
router.get('/:id/payout-evidence', InternationalTransfersController.getPayoutEvidence);
router.get('/:id/workflow', InternationalTransfersController.getWorkflow);
router.get('/:id', InternationalTransfersController.getTransfer);

export default router;
