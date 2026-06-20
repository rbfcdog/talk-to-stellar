import { Router } from 'express';
import { AquariusController } from '../controllers/aquarius.controller';

const router = Router();

// GET /api/aquarius/rewards - all pools with AQUA daily rewards
router.get('/rewards', (req, res) => AquariusController.getPoolRewards(req, res));

// GET /api/aquarius/rewards/pair?asset1=XLM&asset2=USDC
router.get('/rewards/pair', (req, res) => AquariusController.getPairReward(req, res));

// GET /api/aquarius/estimate?pool_tvl_usd=1000000&user_usd=1000&asset1=XLM&asset2=USDC
router.get('/estimate', (req, res) => AquariusController.estimateDailyAqua(req, res));

export default router;
