import { Router } from 'express';
import { PagfinanceController } from '../controllers/pagfinance.controller';

const router = Router();

router.get('/cashin/config', PagfinanceController.getCashinConfig);
router.post('/cashin/quote', PagfinanceController.createCashinQuote);
router.post('/cashin/intent', PagfinanceController.createCashinIntent);
router.get('/cashin/intent/:intentId', PagfinanceController.getCashinIntent);
router.get('/cashin/intents', PagfinanceController.listCashinIntents);

export default router;
