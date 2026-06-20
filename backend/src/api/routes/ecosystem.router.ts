import { Router } from 'express';
import { EcosystemController } from '../controllers/ecosystem.controller';

const router = Router();

// GET /api/ecosystem/:address - full ecosystem overview for a Stellar address
router.get('/:address', (req, res) => EcosystemController.getOverview(req, res));

// GET /api/ecosystem/:address/summary - WhatsApp-ready Portuguese summary
router.get('/:address/summary', (req, res) => EcosystemController.getSummary(req, res));

export default router;
