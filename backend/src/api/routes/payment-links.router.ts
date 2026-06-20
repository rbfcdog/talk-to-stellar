import { Router } from 'express';
import { PaymentLinksController } from '../controllers/payment-links.controller';
const router = Router();
router.post('/', PaymentLinksController.create);
router.get('/', PaymentLinksController.list);
router.get('/:id/redirect', PaymentLinksController.redirect);
router.get('/:id', PaymentLinksController.get);
router.delete('/:id', PaymentLinksController.remove);
export default router;
