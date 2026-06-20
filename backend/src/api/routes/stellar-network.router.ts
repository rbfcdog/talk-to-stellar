import { Router } from 'express';
import { StellarNetworkController } from '../controllers/stellar-network.controller';

const router = Router();

// GET /api/network/stats - full ledger + fee stats
router.get('/stats', (req, res) => StellarNetworkController.getStats(req, res));

// GET /api/network/health - quick reachability check
router.get('/health', (req, res) => StellarNetworkController.getHealth(req, res));

// GET /api/network/fee - recommended fee for current load
router.get('/fee', (req, res) => StellarNetworkController.getRecommendedFee(req, res));

export default router;
