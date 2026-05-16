import { Router } from 'express';
import EvolutionController from '../controllers/evolution.controller';

const router = Router();

router.get('/', EvolutionController.ping);
router.post('/', EvolutionController.webhook);
router.post('/:event', EvolutionController.webhook);
router.get('/webhook', EvolutionController.ping);
router.post('/webhook', EvolutionController.webhook);
router.post('/webhook/:event', EvolutionController.webhook);

export default router;
