import { Router } from 'express';
import { ScfController } from '../controllers/scf.controller';
const router = Router();
router.get('/', ScfController.getAll);
router.get('/list', ScfController.listIds);
router.get('/:id', ScfController.getSingle);
export default router;
